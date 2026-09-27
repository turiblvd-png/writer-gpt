import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Source } from '@/lib/ai';

/**
 * SQLite behind a narrow repository. The seam is deliberately small — a handful
 * of functions with plain object returns — so swapping in Postgres later is a
 * single-file change rather than an application-wide refactor.
 */

export interface ArticleRecord {
  id: string;
  title: string;
  slug: string;
  markdown: string;
  metaDescription: string;
  focusKeyword: string;
  keywords: string[];
  language: string;
  seoMode: string;
  wordCount: number;
  status: 'draft' | 'published' | 'failed';
  sources: Source[];
  createdAt: number;
  updatedAt: number;
}

export interface RunRecord {
  id: string;
  pipelineId: string;
  articleId: string | null;
  status: string;
  progress: number;
  /** Full RunSnapshot, serialised. Lets a page rebuild live state after reload. */
  snapshot: unknown;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const path = process.env.DATABASE_PATH ?? './data/writer-gpt.db';
  mkdirSync(dirname(path), { recursive: true });

  db = new Database(path);
  // WAL lets the generation worker write while the UI reads the run's progress.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id               TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      slug             TEXT NOT NULL,
      markdown         TEXT NOT NULL,
      meta_description TEXT NOT NULL DEFAULT '',
      focus_keyword    TEXT NOT NULL DEFAULT '',
      keywords         TEXT NOT NULL DEFAULT '[]',
      language         TEXT NOT NULL DEFAULT 'English',
      seo_mode         TEXT NOT NULL DEFAULT 'full-seo',
      word_count       INTEGER NOT NULL DEFAULT 0,
      status           TEXT NOT NULL DEFAULT 'draft',
      sources          TEXT NOT NULL DEFAULT '[]',
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created_at DESC);

    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL,
      article_id  TEXT REFERENCES articles(id) ON DELETE SET NULL,
      status      TEXT NOT NULL,
      progress    REAL NOT NULL DEFAULT 0,
      snapshot    TEXT NOT NULL DEFAULT '{}',
      error       TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
  `);

  return db;
}

const parse = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

type ArticleRow = Record<string, unknown>;

function toArticle(row: ArticleRow): ArticleRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    markdown: String(row.markdown),
    metaDescription: String(row.meta_description ?? ''),
    focusKeyword: String(row.focus_keyword ?? ''),
    keywords: parse<string[]>(row.keywords, []),
    language: String(row.language ?? 'English'),
    seoMode: String(row.seo_mode ?? 'full-seo'),
    wordCount: Number(row.word_count ?? 0),
    status: String(row.status ?? 'draft') as ArticleRecord['status'],
    sources: parse<Source[]>(row.sources, []),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function saveArticle(a: Omit<ArticleRecord, 'createdAt' | 'updatedAt'>): ArticleRecord {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO articles (id,title,slug,markdown,meta_description,focus_keyword,keywords,
         language,seo_mode,word_count,status,sources,created_at,updated_at)
       VALUES (@id,@title,@slug,@markdown,@metaDescription,@focusKeyword,@keywords,
         @language,@seoMode,@wordCount,@status,@sources,@now,@now)
       ON CONFLICT(id) DO UPDATE SET
         title=@title, slug=@slug, markdown=@markdown, meta_description=@metaDescription,
         focus_keyword=@focusKeyword, keywords=@keywords, language=@language,
         seo_mode=@seoMode, word_count=@wordCount, status=@status, sources=@sources,
         updated_at=@now`,
    )
    .run({
      ...a,
      keywords: JSON.stringify(a.keywords),
      sources: JSON.stringify(a.sources),
      now,
    });

  return { ...a, createdAt: now, updatedAt: now };
}

export function listArticles(limit = 100): ArticleRecord[] {
  return (getDb().prepare(`SELECT * FROM articles ORDER BY created_at DESC LIMIT ?`).all(limit) as ArticleRow[])
    .map(toArticle);
}

export function getArticle(id: string): ArticleRecord | null {
  const row = getDb().prepare(`SELECT * FROM articles WHERE id = ?`).get(id) as ArticleRow | undefined;
  return row ? toArticle(row) : null;
}

export function deleteArticle(id: string): void {
  getDb().prepare(`DELETE FROM articles WHERE id = ?`).run(id);
}

export function saveRun(r: {
  id: string;
  pipelineId: string;
  articleId?: string | null;
  status: string;
  progress: number;
  snapshot: unknown;
  error?: string | null;
}): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO runs (id,pipeline_id,article_id,status,progress,snapshot,error,created_at,updated_at)
       VALUES (@id,@pipelineId,@articleId,@status,@progress,@snapshot,@error,@now,@now)
       ON CONFLICT(id) DO UPDATE SET
         article_id=@articleId, status=@status, progress=@progress,
         snapshot=@snapshot, error=@error, updated_at=@now`,
    )
    .run({
      id: r.id,
      pipelineId: r.pipelineId,
      articleId: r.articleId ?? null,
      status: r.status,
      progress: r.progress,
      snapshot: JSON.stringify(r.snapshot ?? {}),
      error: r.error ?? null,
      now,
    });
}

export function getRun(id: string): RunRecord | null {
  const row = getDb().prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as ArticleRow | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    pipelineId: String(row.pipeline_id),
    articleId: row.article_id ? String(row.article_id) : null,
    status: String(row.status),
    progress: Number(row.progress ?? 0),
    snapshot: parse<unknown>(row.snapshot, {}),
    error: row.error ? String(row.error) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function listRuns(limit = 50): RunRecord[] {
  const rows = getDb().prepare(`SELECT id FROM runs ORDER BY created_at DESC LIMIT ?`).all(limit) as ArticleRow[];
  return rows.map((r) => getRun(String(r.id))).filter((r): r is RunRecord => r !== null);
}
