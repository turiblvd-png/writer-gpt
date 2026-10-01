import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Pure-JavaScript document store.
 *
 * This replaced SQLite because better-sqlite3 is a native module: its binary
 * has to be traced into the serverless bundle, and when that fails the module
 * throws at import time, before any guard in this file could run. That took
 * down every route with an unrecoverable 500.
 *
 * Nothing here needed a SQL engine. The app does CRUD by id plus list-ordered-
 * by-date, with no joins or aggregates, over at most a few hundred records. A
 * JSON file does that correctly, runs identically on every host, and has no
 * install step that can fail.
 */

export type StorageMode = 'persistent' | 'ephemeral' | 'memory';

type Row = Record<string, unknown> & { id: string };
type Snapshot = Record<string, Row[]>;

const SERVERLESS =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.NETLIFY);

export function resolveDataFile(): string {
  if (process.env.DATABASE_PATH) {
    // Accept the old SQLite-style path so existing config keeps working.
    return process.env.DATABASE_PATH.replace(/\.(db|sqlite3?)$/i, '.json');
  }
  // Only /tmp is writable on a serverless host.
  return SERVERLESS ? '/tmp/writer-gpt/data.json' : './data/writer-gpt.json';
}

let collections: Map<string, Map<string, Row>> | null = null;
let mode: StorageMode = 'persistent';
let storageError: string | null = null;

function parseSnapshot(raw: string): Map<string, Map<string, Row>> {
  const out = new Map<string, Map<string, Row>>();
  const parsed = JSON.parse(raw) as Snapshot;

  for (const [name, rows] of Object.entries(parsed)) {
    const table = new Map<string, Row>();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row && typeof row === 'object' && typeof row.id === 'string') table.set(row.id, row);
      }
    }
    out.set(name, table);
  }
  return out;
}

function load(): Map<string, Map<string, Row>> {
  if (collections) return collections;

  const file = resolveDataFile();
  collections = new Map();

  try {
    mkdirSync(dirname(file), { recursive: true });
    mode = SERVERLESS || file.startsWith('/tmp') ? 'ephemeral' : 'persistent';
  } catch (err) {
    // A read-only filesystem must not break the app; it only means no saving.
    storageError = err instanceof Error ? err.message : String(err);
    mode = 'memory';
    return collections;
  }

  try {
    collections = parseSnapshot(readFileSync(file, 'utf8'));
  } catch (err) {
    // A missing file is the normal first-run case. A corrupt one is not, so it
    // is kept aside rather than silently overwritten on the next save.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      storageError = `Existing data file could not be read (${err instanceof Error ? err.message : String(err)}).`;
      try {
        renameSync(file, `${file}.corrupt-${Date.now()}`);
      } catch {
        /* best effort */
      }
    }
    collections = new Map();
  }

  return collections;
}

function persist(): void {
  if (mode === 'memory' || !collections) return;

  const file = resolveDataFile();
  const snapshot: Snapshot = {};
  for (const [name, table] of collections) snapshot[name] = [...table.values()];

  try {
    // Write to a sibling then rename, so a crash mid-write cannot leave a
    // half-written file that fails to parse on the next boot.
    const temp = join(dirname(file), `.${Date.now()}.tmp`);
    writeFileSync(temp, JSON.stringify(snapshot), 'utf8');
    renameSync(temp, file);
  } catch (err) {
    storageError = err instanceof Error ? err.message : String(err);
    mode = 'memory';
  }
}

function table(name: string): Map<string, Row> {
  const db = load();
  let found = db.get(name);
  if (!found) {
    found = new Map();
    db.set(name, found);
  }
  return found;
}

/** A typed view over one collection. Records must carry a string `id`. */
export function collection<T extends { id: string }>(name: string) {
  return {
    all(): T[] {
      return [...table(name).values()] as unknown as T[];
    },

    get(id: string): T | null {
      return (table(name).get(id) as unknown as T) ?? null;
    },

    /** Newest first by the given numeric field, then capped. */
    list(sortBy: keyof T & string, limit = 100): T[] {
      const rows = [...table(name).values()] as unknown as T[];
      return rows
        .sort((a, b) => Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0))
        .slice(0, Math.max(0, limit));
    },

    put(record: T): T {
      table(name).set(record.id, record as unknown as Row);
      persist();
      return record;
    },

    /** Read, transform, write, in one step so concurrent callers cannot interleave. */
    mutate(id: string, change: (current: T) => T): T | null {
      const current = table(name).get(id) as unknown as T | undefined;
      if (!current) return null;
      const next = change(current);
      table(name).set(id, next as unknown as Row);
      persist();
      return next;
    },

    remove(id: string): void {
      if (table(name).delete(id)) persist();
    },
  };
}

export function storageStatus(): {
  mode: StorageMode;
  path: string;
  error: string | null;
  /** True when each server instance keeps its own copy, so data is not shared. */
  perInstance: boolean;
} {
  load();
  return {
    mode,
    path: mode === 'memory' ? 'memory only' : resolveDataFile(),
    error: storageError,
    // On a serverless host /tmp belongs to one lambda instance. A record written
    // by one request is invisible to the next if it lands elsewhere, so the app
    // is not merely losing data on restart, it is inconsistent between clicks.
    perInstance: mode === 'memory' || (SERVERLESS && !process.env.DATABASE_PATH),
  };
}

/**
 * Round-trips a record through storage to prove writes actually work.
 *
 * Reading can succeed while writing fails, which is exactly what made "Create
 * project" fail with an unexplained error while every page loaded fine.
 */
export function probeStorage(): { writable: boolean; error: string | null } {
  const probe = collection<{ id: string; at: number }>('__probe');
  try {
    const id = `probe-${Date.now()}`;
    probe.put({ id, at: Date.now() });
    const readBack = probe.get(id);
    probe.remove(id);
    if (!readBack) return { writable: false, error: 'Write succeeded but the record could not be read back.' };
    return { writable: mode !== 'memory', error: mode === 'memory' ? storageError : null };
  } catch (err) {
    return { writable: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Test seam: forget the loaded data so the next call re-reads from disk. */
export function resetStorageForTests(): void {
  collections = null;
  mode = 'persistent';
  storageError = null;
}
