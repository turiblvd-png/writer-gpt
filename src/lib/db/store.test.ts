import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Guards the deployment failure that motivated replacing SQLite: a native
 * module that failed to load took down every route with an unrecoverable 500,
 * because the throw happened at import time, before any guard could run.
 */
const ORIGINAL = { ...process.env };

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'wg-'));
}

beforeEach(() => {
  vi.resetModules();
  for (const k of ['DATABASE_PATH', 'VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'NETLIFY']) delete process.env[k];
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('resolveDataFile', () => {
  it('uses the local data directory by default', async () => {
    const { resolveDataFile } = await import('./engine');
    expect(resolveDataFile()).toBe('./data/writer-gpt.json');
  });

  it.each([['VERCEL', '1'], ['AWS_LAMBDA_FUNCTION_NAME', 'fn'], ['NETLIFY', 'true']])(
    'writes to /tmp on %s, the only writable path there',
    async (key, value) => {
      process.env[key] = value;
      const { resolveDataFile } = await import('./engine');
      expect(resolveDataFile()).toBe('/tmp/writer-gpt/data.json');
    },
  );

  it('accepts an old SQLite-style DATABASE_PATH so existing config keeps working', async () => {
    process.env.DATABASE_PATH = '/mnt/volume/writer-gpt.db';
    const { resolveDataFile } = await import('./engine');
    expect(resolveDataFile()).toBe('/mnt/volume/writer-gpt.json');
  });

  it('honours an explicit path even on serverless', async () => {
    process.env.VERCEL = '1';
    process.env.DATABASE_PATH = '/mnt/volume/app.json';
    const { resolveDataFile } = await import('./engine');
    expect(resolveDataFile()).toBe('/mnt/volume/app.json');
  });
});

describe('persistence', () => {
  it('saves a record and reads it back from a fresh module load', async () => {
    const file = join(freshDir(), 'data.json');
    process.env.DATABASE_PATH = file;

    const first = await import('./store');
    first.saveArticle({
      id: 'a1', title: 'Six Kings Slam 2026', slug: 'six-kings', markdown: '# T',
      metaDescription: '', focusKeyword: 'six kings slam', keywords: ['tennis'],
      language: 'English', seoMode: 'full-seo', wordCount: 1200, status: 'draft', sources: [],
    });

    // A new module instance must read what the previous one wrote.
    vi.resetModules();
    const second = await import('./store');
    const loaded = second.getArticle('a1');

    expect(loaded?.title).toBe('Six Kings Slam 2026');
    expect(loaded?.keywords).toEqual(['tennis']);
  });

  it('keeps the original creation time when an article is overwritten', async () => {
    process.env.DATABASE_PATH = join(freshDir(), 'data.json');
    const { saveArticle, getArticle } = await import('./store');

    const base = {
      id: 'a1', title: 'First', slug: 's', markdown: '#', metaDescription: '', focusKeyword: 'k',
      keywords: [], language: 'English', seoMode: 'full-seo', wordCount: 1,
      status: 'draft' as const, sources: [],
    };
    const created = saveArticle(base).createdAt;
    await new Promise((r) => setTimeout(r, 5));
    saveArticle({ ...base, title: 'Second' });

    const after = getArticle('a1')!;
    expect(after.title).toBe('Second');
    expect(after.createdAt).toBe(created);
    expect(after.updatedAt).toBeGreaterThanOrEqual(created);
  });

  it('lists newest first and respects the limit', async () => {
    process.env.DATABASE_PATH = join(freshDir(), 'data.json');
    const { saveArticle, listArticles } = await import('./store');

    for (const title of ['one', 'two', 'three']) {
      saveArticle({
        id: title, title, slug: title, markdown: '#', metaDescription: '', focusKeyword: 'k',
        keywords: [], language: 'English', seoMode: 'full-seo', wordCount: 1, status: 'draft', sources: [],
      });
      await new Promise((r) => setTimeout(r, 3));
    }

    expect(listArticles().map((a) => a.title)).toEqual(['three', 'two', 'one']);
    expect(listArticles(2)).toHaveLength(2);
  });

  it('deletes a record and persists the deletion', async () => {
    const file = join(freshDir(), 'data.json');
    process.env.DATABASE_PATH = file;
    const { saveArticle, deleteArticle } = await import('./store');

    saveArticle({
      id: 'gone', title: 'x', slug: 'x', markdown: '#', metaDescription: '', focusKeyword: 'k',
      keywords: [], language: 'English', seoMode: 'full-seo', wordCount: 1, status: 'draft', sources: [],
    });
    deleteArticle('gone');

    vi.resetModules();
    const reloaded = await import('./store');
    expect(reloaded.getArticle('gone')).toBeNull();
  });
});

describe('failure handling', () => {
  it('falls back to memory instead of throwing when the directory cannot be created', async () => {
    const dir = freshDir();
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory');
    process.env.DATABASE_PATH = join(blocker, 'nested', 'data.json');

    const { storageStatus, saveArticle, listArticles } = await import('./store');

    // The crash is what took the whole site down, so this must not throw.
    expect(() => listArticles()).not.toThrow();
    expect(storageStatus().mode).toBe('memory');

    // Still fully usable in memory, so every page renders.
    saveArticle({
      id: 'm1', title: 'In memory', slug: 's', markdown: '#', metaDescription: '', focusKeyword: 'k',
      keywords: [], language: 'English', seoMode: 'full-seo', wordCount: 1, status: 'draft', sources: [],
    });
    expect(listArticles()).toHaveLength(1);
  });

  it('sets a corrupt data file aside rather than silently overwriting it', async () => {
    const dir = freshDir();
    const file = join(dir, 'data.json');
    writeFileSync(file, '{ this is not valid json');
    process.env.DATABASE_PATH = file;

    const { storageStatus, listArticles } = await import('./store');

    expect(listArticles()).toEqual([]);
    expect(storageStatus().error).toMatch(/could not be read/i);
    // The original bytes survive under a .corrupt- name for recovery.
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('treats a missing file as an empty database, not an error', async () => {
    process.env.DATABASE_PATH = join(freshDir(), 'nothing-here.json');
    const { listArticles, storageStatus } = await import('./store');

    expect(listArticles()).toEqual([]);
    expect(storageStatus().error).toBeNull();
  });

  it('labels a path outside /tmp as persistent, and one inside it as ephemeral', async () => {
    const { mkdirSync, rmSync } = await import('node:fs');
    const local = join(process.cwd(), '.test-storage');
    mkdirSync(local, { recursive: true });
    process.env.DATABASE_PATH = join(local, 'data.json');

    try {
      const { storageStatus } = await import('./store');
      expect(storageStatus().mode).toBe('persistent');
    } finally {
      rmSync(local, { recursive: true, force: true });
    }

    // A /tmp path is ephemeral, which is what a serverless host gets.
    vi.resetModules();
    process.env.DATABASE_PATH = join(freshDir(), 'data.json');
    const again = await import('./store');
    expect(again.storageStatus().mode).toBe('ephemeral');
  });

  it('writes valid JSON that a human can read and recover', async () => {
    const file = join(freshDir(), 'data.json');
    process.env.DATABASE_PATH = file;
    const { saveArticle } = await import('./store');

    saveArticle({
      id: 'a1', title: 'Readable', slug: 's', markdown: '#', metaDescription: '', focusKeyword: 'k',
      keywords: [], language: 'English', seoMode: 'full-seo', wordCount: 1, status: 'draft', sources: [],
    });

    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed.articles[0].title).toBe('Readable');
  });
});

describe('safeRead', () => {
  it('returns the fallback instead of throwing', async () => {
    const { safeRead } = await import('./safe');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(safeRead(() => { throw new Error('boom'); }, [], 'test')).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('passes the value through when the read succeeds', async () => {
    const { safeRead } = await import('./safe');
    expect(safeRead(() => [1, 2], [], 'test')).toEqual([1, 2]);
  });
});
