import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Document store with two interchangeable drivers.
 *
 * - **Postgres** when DATABASE_URL (or POSTGRES_URL) is set. Required on any
 *   serverless host: there, each instance has its own private disk, so a file
 *   written by one request is invisible to the next. That is what made
 *   "Create project" fail on Vercel while every page still loaded.
 * - **JSON file** otherwise, for local development and single-server hosts
 *   with a persistent disk.
 *
 * The app needs CRUD by id plus list-newest-first over a few hundred records per
 * collection, so both drivers store whole documents and nothing above this file
 * knows which one is active. `pg` is pure JavaScript; there is no native module
 * whose binary can fail to load at deploy time.
 */

export type StorageMode = 'postgres' | 'persistent' | 'ephemeral' | 'memory';

export interface StorageStatus {
  mode: StorageMode;
  driver: 'postgres' | 'json';
  path: string;
  error: string | null;
  /** True when each server instance keeps its own copy, so data is not shared. */
  perInstance: boolean;
}

type Row = Record<string, unknown> & { id: string };

interface Driver {
  get(collection: string, id: string): Promise<Row | null>;
  all(collection: string): Promise<Row[]>;
  list(collection: string, sortBy: string, limit: number): Promise<Row[]>;
  put(collection: string, row: Row): Promise<void>;
  mutate(collection: string, id: string, change: (current: Row) => Row): Promise<Row | null>;
  remove(collection: string, id: string): Promise<void>;
  status(): Promise<StorageStatus>;
}

const SERVERLESS =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.NETLIFY);

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

export function resolveDataFile(): string {
  if (process.env.DATABASE_PATH) {
    // Accept the old SQLite-style path so existing config keeps working.
    return process.env.DATABASE_PATH.replace(/\.(db|sqlite3?)$/i, '.json');
  }
  return SERVERLESS ? '/tmp/writer-gpt/data.json' : './data/writer-gpt.json';
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON file driver
// ─────────────────────────────────────────────────────────────────────────────

class JsonDriver implements Driver {
  private tables: Map<string, Map<string, Row>> | null = null;
  private mode: StorageMode = 'persistent';
  private error: string | null = null;

  constructor(private file: string) {}

  private load(): Map<string, Map<string, Row>> {
    if (this.tables) return this.tables;
    this.tables = new Map();

    try {
      mkdirSync(dirname(this.file), { recursive: true });
      this.mode = SERVERLESS || this.file.startsWith('/tmp') ? 'ephemeral' : 'persistent';
    } catch (err) {
      // A read-only filesystem must not break the app; it only means no saving.
      this.error = message(err);
      this.mode = 'memory';
      return this.tables;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, Row[]>;
      for (const [name, rows] of Object.entries(parsed)) {
        const table = new Map<string, Row>();
        if (Array.isArray(rows)) {
          for (const row of rows) if (row && typeof row.id === 'string') table.set(row.id, row);
        }
        this.tables.set(name, table);
      }
    } catch (err) {
      // Missing is the normal first run. Corrupt is kept aside, never overwritten.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.error = `Existing data file could not be read (${message(err)}).`;
        try {
          renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
        } catch {
          /* best effort */
        }
      }
    }
    return this.tables;
  }

  private table(name: string): Map<string, Row> {
    const db = this.load();
    let t = db.get(name);
    if (!t) {
      t = new Map();
      db.set(name, t);
    }
    return t;
  }

  private persist(): void {
    if (this.mode === 'memory' || !this.tables) return;
    const snapshot: Record<string, Row[]> = {};
    for (const [name, t] of this.tables) snapshot[name] = [...t.values()];
    try {
      // Temp file then rename, so a crash mid-write cannot corrupt the store.
      const temp = join(dirname(this.file), `.${process.pid}.${Date.now()}.tmp`);
      writeFileSync(temp, JSON.stringify(snapshot), 'utf8');
      renameSync(temp, this.file);
    } catch (err) {
      this.error = message(err);
      this.mode = 'memory';
    }
  }

  async get(c: string, id: string) {
    return this.table(c).get(id) ?? null;
  }
  async all(c: string) {
    return [...this.table(c).values()];
  }
  async list(c: string, sortBy: string, limit: number) {
    return [...this.table(c).values()]
      .sort((a, b) => Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0))
      .slice(0, Math.max(0, limit));
  }
  async put(c: string, row: Row) {
    this.table(c).set(row.id, row);
    this.persist();
  }
  async mutate(c: string, id: string, change: (r: Row) => Row) {
    const current = this.table(c).get(id);
    if (!current) return null;
    const next = change(current);
    this.table(c).set(id, next);
    this.persist();
    return next;
  }
  async remove(c: string, id: string) {
    if (this.table(c).delete(id)) this.persist();
  }
  async status(): Promise<StorageStatus> {
    this.load();
    return {
      mode: this.mode,
      driver: 'json',
      path: this.mode === 'memory' ? 'memory only' : this.file,
      error: this.error,
      perInstance: this.mode === 'memory' || (SERVERLESS && !process.env.DATABASE_PATH),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Postgres driver
// ─────────────────────────────────────────────────────────────────────────────

type PgPool = import('pg').Pool;

/**
 * Errors that mean the connection died, not that the query was wrong. Neon and
 * other serverless Postgres close idle connections when they scale to zero, so
 * the first query after a quiet spell can land on a dead socket.
 */
const CONNECTION_LOST = /Connection terminated|ECONNRESET|EPIPE|terminating connection|connection error|Client was closed|timeout exceeded when trying to connect/i;

export function isConnectionLost(err: unknown): boolean {
  return CONNECTION_LOST.test(message(err));
}

/**
 * Run once more on a fresh connection if the first one was dead. Safe because
 * every operation here is idempotent (upserts, deletes by key, reads) or runs
 * in a transaction the server rolls back when the connection drops.
 */
async function retryOnce<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!isConnectionLost(err)) throw err;
    return op();
  }
}

class PostgresDriver implements Driver {
  private pool: PgPool | null = null;
  private ready: Promise<void> | null = null;
  private error: string | null = null;

  constructor(private url: string) {}

  private async db(): Promise<PgPool> {
    if (!this.pool) {
      const { Pool } = await import('pg');
      this.pool = new Pool({
        connectionString: this.url,
        // A serverless instance handles one request at a time; a large pool
        // per instance just exhausts the database's connection limit.
        max: Number(process.env.DATABASE_POOL_MAX) || (SERVERLESS ? 2 : 10),
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000,
        ssl: needsSsl(this.url) ? { rejectUnauthorized: false } : undefined,
      });
      this.pool.on('error', (err) => {
        this.error = message(err);
      });
    }
    if (!this.ready) {
      this.ready = this.pool
        .query(`
          CREATE TABLE IF NOT EXISTS documents (
            collection TEXT   NOT NULL,
            id         TEXT   NOT NULL,
            data       JSONB  NOT NULL,
            updated_at BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (collection, id)
          );
          CREATE INDEX IF NOT EXISTS documents_collection_idx ON documents (collection);
        `)
        .then(() => undefined)
        .catch((err) => {
          // Let the next call retry instead of caching a failed bootstrap.
          this.ready = null;
          throw err;
        });
    }
    await this.ready;
    return this.pool;
  }

  async get(c: string, id: string) {
    return retryOnce(async () => {
      const db = await this.db();
      const { rows } = await db.query('SELECT data FROM documents WHERE collection = $1 AND id = $2', [c, id]);
      return (rows[0]?.data as Row) ?? null;
    });
  }

  async all(c: string) {
    return retryOnce(async () => {
      const db = await this.db();
      const { rows } = await db.query('SELECT data FROM documents WHERE collection = $1', [c]);
      return rows.map((r) => r.data as Row);
    });
  }

  async list(c: string, sortBy: string, limit: number) {
    return retryOnce(async () => {
      const db = await this.db();
      // sortBy is always a field name chosen in code, but pass it as a parameter
      // anyway so no caller can ever turn it into an injection.
      const { rows } = await db.query(
        `SELECT data FROM documents WHERE collection = $1
         ORDER BY COALESCE((data->>$2)::numeric, 0) DESC LIMIT $3`,
        [c, sortBy, Math.max(0, limit)],
      );
      return rows.map((r) => r.data as Row);
    });
  }

  async put(c: string, row: Row) {
    return retryOnce(async () => {
      const db = await this.db();
      await db.query(
        `INSERT INTO documents (collection, id, data, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [c, row.id, JSON.stringify(row), Date.now()],
      );
    });
  }

  async mutate(c: string, id: string, change: (r: Row) => Row) {
    return retryOnce(() => this.mutateOnce(c, id, change));
  }

  private async mutateOnce(c: string, id: string, change: (r: Row) => Row) {
    const db = await this.db();
    const client = await db.connect();
    let broken: Error | undefined;
    try {
      // Row lock, so two stage actions on one project cannot overwrite each other.
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT data FROM documents WHERE collection = $1 AND id = $2 FOR UPDATE',
        [c, id],
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const next = change(rows[0].data as Row);
      await client.query('UPDATE documents SET data = $3, updated_at = $4 WHERE collection = $1 AND id = $2', [
        c, id, JSON.stringify(next), Date.now(),
      ]);
      await client.query('COMMIT');
      return next;
    } catch (err) {
      if (isConnectionLost(err)) broken = err as Error;
      else await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      // Passing the error makes the pool discard the dead client instead of reusing it.
      client.release(broken);
    }
  }

  async remove(c: string, id: string) {
    return retryOnce(async () => {
      const db = await this.db();
      await db.query('DELETE FROM documents WHERE collection = $1 AND id = $2', [c, id]);
    });
  }

  async status(): Promise<StorageStatus> {
    try {
      await this.db();
      return { mode: 'postgres', driver: 'postgres', path: redact(this.url), error: this.error, perInstance: false };
    } catch (err) {
      return { mode: 'postgres', driver: 'postgres', path: redact(this.url), error: message(err), perInstance: false };
    }
  }

  async close() {
    await this.pool?.end();
    this.pool = null;
    this.ready = null;
  }
}

function needsSsl(url: string): boolean {
  if (/sslmode=disable/i.test(url)) return false;
  return !/@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

/** Never show credentials in the UI or health output. */
function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return 'postgres';
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

let driver: Driver | null = null;

function active(): Driver {
  if (!driver) {
    const url = databaseUrl();
    driver = url ? new PostgresDriver(url) : new JsonDriver(resolveDataFile());
  }
  return driver;
}

/** A typed view over one collection. Records must carry a string `id`. */
export function collection<T extends { id: string }>(name: string) {
  return {
    all: async (): Promise<T[]> => (await active().all(name)) as unknown as T[],
    get: async (id: string): Promise<T | null> => (await active().get(name, id)) as unknown as T | null,
    /** Newest first by the given numeric field, then capped. */
    list: async (sortBy: keyof T & string, limit = 100): Promise<T[]> =>
      (await active().list(name, sortBy, limit)) as unknown as T[],
    put: async (record: T): Promise<T> => {
      await active().put(name, record as unknown as Row);
      return record;
    },
    /** Read, transform and write as one step, so concurrent callers cannot interleave. */
    mutate: async (id: string, change: (current: T) => T): Promise<T | null> =>
      (await active().mutate(name, id, change as unknown as (r: Row) => Row)) as unknown as T | null,
    remove: async (id: string): Promise<void> => active().remove(name, id),
  };
}

export async function storageStatus(): Promise<StorageStatus> {
  return active().status();
}

/**
 * Round-trips a record to prove writes work. Reads can succeed while writes
 * fail, which is how "Create project" broke while every page still rendered.
 */
export async function probeStorage(): Promise<{ writable: boolean; error: string | null }> {
  const probe = collection<{ id: string; at: number }>('__probe');
  try {
    const id = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await probe.put({ id, at: Date.now() });
    const readBack = await probe.get(id);
    await probe.remove(id);
    const status = await storageStatus();
    if (!readBack) return { writable: false, error: 'Write succeeded but the record could not be read back.' };
    return { writable: status.mode !== 'memory', error: status.mode === 'memory' ? status.error : null };
  } catch (err) {
    return { writable: false, error: message(err) };
  }
}

/** Test seam: drop the active driver so the next call re-reads configuration. */
export async function resetStorageForTests(): Promise<void> {
  if (driver instanceof PostgresDriver) await driver.close();
  driver = null;
}
