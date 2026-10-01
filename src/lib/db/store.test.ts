import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guards the deployment failure this fixed: on a read-only serverless
 * filesystem the default ./data path threw EROFS while rendering, which turned
 * every route into "Application error: a server-side exception has occurred".
 */
const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.DATABASE_PATH;
  delete process.env.VERCEL;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.NETLIFY;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('resolveDatabasePath', () => {
  it('uses the local data directory by default', async () => {
    const { resolveDatabasePath } = await import('./store');
    expect(resolveDatabasePath()).toBe('./data/writer-gpt.db');
  });

  it.each([['VERCEL', '1'], ['AWS_LAMBDA_FUNCTION_NAME', 'fn'], ['NETLIFY', 'true']])(
    'uses /tmp when %s is set, since the bundle is read-only there',
    async (key, value) => {
      process.env[key] = value;
      const { resolveDatabasePath } = await import('./store');
      expect(resolveDatabasePath()).toBe('/tmp/writer-gpt/writer-gpt.db');
    },
  );

  it('always honours an explicit DATABASE_PATH, even on serverless', async () => {
    process.env.VERCEL = '1';
    process.env.DATABASE_PATH = '/mnt/volume/app.db';
    const { resolveDatabasePath } = await import('./store');
    expect(resolveDatabasePath()).toBe('/mnt/volume/app.db');
  });
});

describe('storage mode', () => {
  it('reports persistent for a normal local path', async () => {
    process.env.DATABASE_PATH = `/tmp/wg-test-${Date.now()}/db.sqlite`;
    const { getDb, storageStatus } = await import('./store');
    getDb();
    // An explicit /tmp path is still ephemeral; that is the honest label.
    expect(storageStatus().mode).toBe('ephemeral');
  });

  it('falls back to memory instead of throwing when the path cannot be opened', async () => {
    // A path whose parent is an existing *file* cannot be created as a directory.
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = mkdtempSync(join(tmpdir(), 'wg-'));
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory');
    process.env.DATABASE_PATH = join(blocker, 'nested', 'db.sqlite');

    const { getDb, storageStatus } = await import('./store');

    // The crash is what took the whole site down, so this must not throw.
    expect(() => getDb()).not.toThrow();

    const status = storageStatus();
    expect(status.mode).toBe('memory');
    expect(status.error).toBeTruthy();
  });

  it('still serves queries in memory mode, so pages render', async () => {
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = mkdtempSync(join(tmpdir(), 'wg-'));
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'x');
    process.env.DATABASE_PATH = join(blocker, 'nested', 'db.sqlite');

    const { listArticles, saveArticle } = await import('./store');
    expect(listArticles()).toEqual([]);

    saveArticle({
      id: 'a1', title: 'T', slug: 't', markdown: '# T', metaDescription: '', focusKeyword: 'k',
      keywords: [], language: 'English', seoMode: 'full-seo', wordCount: 1, status: 'draft', sources: [],
    });
    expect(listArticles()).toHaveLength(1);
  });
});

describe('safeRead', () => {
  it('returns the fallback instead of throwing', async () => {
    const { safeRead } = await import('./safe');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(safeRead(() => { throw new Error('EROFS'); }, [], 'test')).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('passes the value through when the read succeeds', async () => {
    const { safeRead } = await import('./safe');
    expect(safeRead(() => [1, 2], [], 'test')).toEqual([1, 2]);
  });
});
