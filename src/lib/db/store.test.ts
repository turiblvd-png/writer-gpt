import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

/**
 * One contract, two drivers. The JSON driver serves local development; the
 * Postgres driver is what makes a serverless deploy work at all, because there
 * each instance has a private disk. The Postgres run talks to a real Postgres
 * wire-protocol server (PGlite), not a mock, so SQL and transactions are
 * genuinely exercised.
 */
const ORIGINAL = { ...process.env };
const PG_PORT = 55432;
const freshDir = () => mkdtempSync(join(tmpdir(), 'wg-'));

let pgServer: PGLiteSocketServer | null = null;
let pglite: PGlite | null = null;

beforeAll(async () => {
  pglite = await PGlite.create();
  // One connection at a time: PGlite is single-session, so the pool is capped
  // to match when tests run against it.
  pgServer = new PGLiteSocketServer({ db: pglite, port: PG_PORT, host: '127.0.0.1' });
  await pgServer.start();
});

afterAll(async () => {
  await pgServer?.stop();
  await pglite?.close();
});

afterEach(async () => {
  const engine = await import('./engine');
  await engine.resetStorageForTests();
  process.env = { ...ORIGINAL };
});

const article = (id: string, title = id) => ({
  id, title, slug: id, markdown: '# T', metaDescription: '', focusKeyword: 'k', keywords: ['tennis'],
  language: 'English', seoMode: 'full-seo', wordCount: 1, status: 'draft' as const, sources: [],
});

const DRIVERS = [
  {
    name: 'json',
    setup: () => {
      process.env.DATABASE_PATH = join(freshDir(), 'data.json');
      delete process.env.DATABASE_URL;
    },
  },
  {
    name: 'postgres',
    setup: async () => {
      process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`;
      // PGlite serves one session at a time, so concurrent operations queue
      // through a single pooled connection. They still run the real
      // transaction and row-lock path; real Postgres simply runs them in parallel.
      process.env.DATABASE_POOL_MAX = '1';
      // Each test starts from an empty table.
      await pglite!.exec('DROP TABLE IF EXISTS documents');
    },
  },
];

describe.each(DRIVERS)('$name driver', ({ name, setup }) => {
  beforeEach(async () => {
    vi.resetModules();
    for (const k of ['DATABASE_PATH', 'DATABASE_URL', 'POSTGRES_URL', 'VERCEL']) delete process.env[k];
    await setup();
  });

  it('saves a record and reads it back', async () => {
    const { saveArticle, getArticle } = await import('./store');
    await saveArticle(article('a1', 'Six Kings Slam 2026'));

    const loaded = await getArticle('a1');
    expect(loaded?.title).toBe('Six Kings Slam 2026');
    expect(loaded?.keywords).toEqual(['tennis']);
  });

  it('keeps users to their own records', async () => {
    const { saveArticle, listArticles, getArticle } = await import('./store');
    const { runAs } = await import('@/lib/auth/actor');
    const alice = { id: 'alice', email: 'a@x.co', role: 'subscriber' as const };
    const owner = { id: 'owner', email: 'o@x.co', role: 'owner' as const };
    await runAs(null, () => saveArticle(article('legacy', 'Before accounts')));
    await runAs(alice, () => saveArticle(article('a1', 'Alice')));

    expect((await runAs(alice, () => listArticles())).map((a) => a.id)).toEqual(['a1']);
    expect((await runAs(owner, () => listArticles())).map((a) => a.id)).toEqual(['legacy']);
    expect(await runAs(owner, () => getArticle('a1'))).toBeNull();
    expect(await runAs(null, () => listArticles())).toHaveLength(2);
  });

  it('returns null for a missing record, never a truthy placeholder', async () => {
    const { getArticle } = await import('./store');
    expect(await getArticle('nope')).toBeNull();
  });

  it('keeps the original creation time when overwritten', async () => {
    const { saveArticle, getArticle } = await import('./store');
    const created = (await saveArticle(article('a1', 'First'))).createdAt;
    await new Promise((r) => setTimeout(r, 5));
    await saveArticle(article('a1', 'Second'));

    const after = (await getArticle('a1'))!;
    expect(after.title).toBe('Second');
    expect(after.createdAt).toBe(created);
  });

  it('lists newest first and respects the limit', async () => {
    const { saveArticle, listArticles } = await import('./store');
    for (const t of ['one', 'two', 'three']) {
      await saveArticle(article(t));
      await new Promise((r) => setTimeout(r, 3));
    }
    expect((await listArticles()).map((a) => a.title)).toEqual(['three', 'two', 'one']);
    expect(await listArticles(2)).toHaveLength(2);
  });

  it('deletes a record', async () => {
    const { saveArticle, deleteArticle, getArticle } = await import('./store');
    await saveArticle(article('gone'));
    await deleteArticle('gone');
    expect(await getArticle('gone')).toBeNull();
  });

  it('keeps collections separate', async () => {
    const { saveArticle } = await import('./store');
    const { listHumanized } = await import('@/lib/humanizer/store');
    await saveArticle(article('a1'));
    expect(await listHumanized()).toEqual([]);
  });

  it('applies project patches without losing concurrent changes', async () => {
    const { createProject, updateProject, getProject } = await import('@/lib/semantic/store');
    const p = await createProject({ name: 'P', mainKeyword: 'six kings slam', language: 'English' });

    // Two stage actions finishing at once must both land.
    await Promise.all([
      updateProject(p.id, { data: { aiInstructions: 'Lead with ticket prices.' } }),
      updateProject(p.id, { currentStepIndex: 4 }),
    ]);

    const after = (await getProject(p.id))!;
    expect(after.data.aiInstructions).toBe('Lead with ticket prices.');
    expect(after.currentStepIndex).toBe(4);
  });

  it('survives a fresh process reading the same store', async () => {
    const first = await import('./store');
    await first.saveArticle(article('persisted'));

    const engine = await import('./engine');
    await engine.resetStorageForTests();
    vi.resetModules();

    const second = await import('./store');
    expect((await second.getArticle('persisted'))?.id).toBe('persisted');
  });

  it('reports itself as shared storage only when it is', async () => {
    const { storageStatus, probeStorage } = await import('./store');
    const status = await storageStatus();
    expect(status.driver).toBe(name);
    expect(status.perInstance).toBe(false);
    expect((await probeStorage()).writable).toBe(true);
  });
});

describe('driver selection', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of ['DATABASE_PATH', 'DATABASE_URL', 'POSTGRES_URL', 'VERCEL']) delete process.env[k];
  });

  it('uses Postgres when POSTGRES_URL is set, as Vercel integrations name it', async () => {
    process.env.POSTGRES_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`;
    const { storageStatus } = await import('./store');
    expect((await storageStatus()).driver).toBe('postgres');
  });

  it('never leaks database credentials in status output', async () => {
    process.env.DATABASE_URL = `postgres://admin:s3cret-pass@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`;
    const { storageStatus } = await import('./store');
    const status = await storageStatus();
    expect(JSON.stringify(status)).not.toContain('s3cret-pass');
    expect(JSON.stringify(status)).not.toContain('admin');
  });

  it('flags per-instance storage on serverless without a database', async () => {
    process.env.VERCEL = '1';
    const { storageStatus } = await import('./store');
    const status = await storageStatus();
    expect(status.driver).toBe('json');
    expect(status.perInstance).toBe(true);
  });

  it('reports a broken database URL instead of throwing', async () => {
    process.env.DATABASE_URL = 'postgres://nobody:x@127.0.0.1:1/none?sslmode=disable';
    const { storageStatus, probeStorage } = await import('./store');
    expect((await storageStatus()).error).toBeTruthy();
    expect((await probeStorage()).writable).toBe(false);
  });
});

describe('json driver failure handling', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of ['DATABASE_PATH', 'DATABASE_URL', 'POSTGRES_URL', 'VERCEL']) delete process.env[k];
  });

  it('falls back to memory instead of throwing when the directory cannot be created', async () => {
    const blocker = join(freshDir(), 'blocker');
    writeFileSync(blocker, 'not a directory');
    process.env.DATABASE_PATH = join(blocker, 'nested', 'data.json');

    const { storageStatus, saveArticle, listArticles } = await import('./store');
    await expect(listArticles()).resolves.toEqual([]);
    expect((await storageStatus()).mode).toBe('memory');
    await saveArticle(article('m1'));
    expect(await listArticles()).toHaveLength(1);
  });

  it('sets a corrupt data file aside rather than overwriting it', async () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'data.json'), '{ not valid json');
    process.env.DATABASE_PATH = join(dir, 'data.json');

    const { storageStatus, listArticles } = await import('./store');
    expect(await listArticles()).toEqual([]);
    expect((await storageStatus()).error).toMatch(/could not be read/i);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('writes valid, human-readable JSON', async () => {
    const file = join(freshDir(), 'data.json');
    process.env.DATABASE_PATH = file;
    const { saveArticle } = await import('./store');
    await saveArticle(article('a1', 'Readable'));
    expect(JSON.parse(readFileSync(file, 'utf8')).articles[0].title).toBe('Readable');
  });
});

describe('safeRead', () => {
  it('returns the fallback instead of throwing', async () => {
    const { safeRead } = await import('./safe');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await safeRead(() => { throw new Error('boom'); }, [], 'test')).toEqual([]);
    expect(await safeRead(async () => { throw new Error('async boom'); }, [], 'test')).toEqual([]);
    spy.mockRestore();
  });

  it('passes values through, sync or async', async () => {
    const { safeRead } = await import('./safe');
    expect(await safeRead(() => [1], [], 't')).toEqual([1]);
    expect(await safeRead(async () => [2], [], 't')).toEqual([2]);
  });
});

describe('postgres connection loss', () => {
  it('recognises dropped connections but not query errors', async () => {
    const { isConnectionLost } = await import('./engine');
    expect(isConnectionLost(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(isConnectionLost(new Error('read ECONNRESET'))).toBe(true);
    expect(isConnectionLost(new Error('terminating connection due to administrator command'))).toBe(true);
    expect(isConnectionLost(new Error('syntax error at or near "SELEC"'))).toBe(false);
    expect(isConnectionLost(new Error('duplicate key value violates unique constraint'))).toBe(false);
  });
});

describe('finding the database setting', () => {
  it('uses the standard names first', async () => {
    const { findDatabaseEnv } = await import('./engine');
    expect(findDatabaseEnv({ DATABASE_URL: 'postgres://a', POSTGRES_URL: 'postgres://b' } as never)?.name).toBe('DATABASE_URL');
  });

  it('finds a database connected under a custom prefix, preferring the pooled URL', async () => {
    const { findDatabaseEnv } = await import('./engine');
    const env = {
      STORAGE_URL_UNPOOLED: 'postgresql://direct',
      STORAGE_URL: 'postgresql://pooled',
      STORAGE_URL_NO_SSL: 'postgres://nossl',
      OTHER: 'https://example.com',
    };
    expect(findDatabaseEnv(env as never)).toEqual({ name: 'STORAGE_URL', url: 'postgresql://pooled' });
  });

  it('ignores names whose value is not a postgres address', async () => {
    const { findDatabaseEnv, databaseEnvNames } = await import('./engine');
    const env = { DATABASE_URL: '', PGHOST: 'ep-x.neon.tech', NEON_PROJECT_ID: 'p1' };
    expect(findDatabaseEnv(env as never)).toBeNull();
    expect(databaseEnvNames(env as never)).toEqual(['DATABASE_URL', 'NEON_PROJECT_ID', 'PGHOST']);
  });
});
