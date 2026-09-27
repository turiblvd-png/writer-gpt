import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db/store';
import type { HumanizedArticle, StealthMode } from './types';

/**
 * Humanized output is stored in its own table, kept separate from My Articles
 * so a humanized copy never overwrites or shadows the original draft.
 */
function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS humanized_articles (
      id             TEXT PRIMARY KEY,
      title          TEXT NOT NULL,
      mode           TEXT NOT NULL,
      language       TEXT NOT NULL DEFAULT 'English',
      source_text    TEXT NOT NULL,
      humanized_text TEXT NOT NULL,
      words          INTEGER NOT NULL DEFAULT 0,
      score_before   INTEGER NOT NULL DEFAULT 0,
      score_after    INTEGER NOT NULL DEFAULT 0,
      tells_before   TEXT NOT NULL DEFAULT '[]',
      tells_after    TEXT NOT NULL DEFAULT '[]',
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_humanized_created ON humanized_articles(created_at DESC);
  `);
}

type Row = Record<string, unknown>;

const parse = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
};

function toArticle(row: Row): HumanizedArticle {
  return {
    id: String(row.id),
    title: String(row.title),
    mode: String(row.mode) as StealthMode,
    language: String(row.language ?? 'English'),
    sourceText: String(row.source_text ?? ''),
    humanizedText: String(row.humanized_text ?? ''),
    words: Number(row.words ?? 0),
    scoreBefore: Number(row.score_before ?? 0),
    scoreAfter: Number(row.score_after ?? 0),
    tellsBefore: parse(row.tells_before),
    tellsAfter: parse(row.tells_after),
    createdAt: Number(row.created_at),
  };
}

export function saveHumanized(a: Omit<HumanizedArticle, 'id' | 'createdAt'>): HumanizedArticle {
  ensureTable();
  const record: HumanizedArticle = { ...a, id: randomUUID(), createdAt: Date.now() };

  getDb()
    .prepare(
      `INSERT INTO humanized_articles
         (id,title,mode,language,source_text,humanized_text,words,score_before,score_after,tells_before,tells_after,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      record.id, record.title, record.mode, record.language, record.sourceText,
      record.humanizedText, record.words, record.scoreBefore, record.scoreAfter,
      JSON.stringify(record.tellsBefore), JSON.stringify(record.tellsAfter), record.createdAt,
    );

  return record;
}

export function listHumanized(limit = 100): HumanizedArticle[] {
  ensureTable();
  return (getDb()
    .prepare(`SELECT * FROM humanized_articles ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Row[]).map(toArticle);
}

export function getHumanized(id: string): HumanizedArticle | null {
  ensureTable();
  const row = getDb().prepare(`SELECT * FROM humanized_articles WHERE id = ?`).get(id) as Row | undefined;
  return row ? toArticle(row) : null;
}

export function deleteHumanized(id: string): void {
  ensureTable();
  getDb().prepare(`DELETE FROM humanized_articles WHERE id = ?`).run(id);
}
