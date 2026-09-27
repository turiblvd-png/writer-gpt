import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db/store';
import { DEFAULT_VOICES, type BrandVoice, type RewrittenArticle } from './types';

function ensureTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS brand_voices (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      avoid_phrases TEXT NOT NULL DEFAULT '[]',
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rewritten_articles (
      id             TEXT PRIMARY KEY,
      source_url     TEXT NOT NULL,
      source_domain  TEXT NOT NULL,
      title          TEXT NOT NULL,
      markdown       TEXT NOT NULL,
      language       TEXT NOT NULL DEFAULT 'English',
      brand_voice_id TEXT NOT NULL DEFAULT 'auto',
      words          INTEGER NOT NULL DEFAULT 0,
      human_score    INTEGER NOT NULL DEFAULT 0,
      similarity     REAL NOT NULL DEFAULT 0,
      fact_warnings  TEXT NOT NULL DEFAULT '[]',
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rewritten_created ON rewritten_articles(created_at DESC);
  `);
}

type Row = Record<string, unknown>;

const parseList = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
};

export function listBrandVoices(): BrandVoice[] {
  ensureTables();
  const rows = getDb().prepare(`SELECT * FROM brand_voices ORDER BY created_at ASC`).all() as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: String(r.description ?? ''),
    avoidPhrases: parseList(r.avoid_phrases),
    createdAt: Number(r.created_at),
  }));
}

export function createBrandVoice(input: { name: string; description: string; avoidPhrases?: string[] }): BrandVoice {
  ensureTables();
  const voice: BrandVoice = {
    id: randomUUID(),
    name: input.name,
    description: input.description,
    avoidPhrases: input.avoidPhrases ?? [],
    createdAt: Date.now(),
  };
  getDb()
    .prepare(`INSERT INTO brand_voices (id,name,description,avoid_phrases,created_at) VALUES (?,?,?,?,?)`)
    .run(voice.id, voice.name, voice.description, JSON.stringify(voice.avoidPhrases), voice.createdAt);
  return voice;
}

export function getBrandVoice(id: string): BrandVoice | null {
  return listBrandVoices().find((v) => v.id === id) ?? null;
}

export function deleteBrandVoice(id: string): void {
  ensureTables();
  getDb().prepare(`DELETE FROM brand_voices WHERE id = ?`).run(id);
}

/** Seeds the starter voices once, so the picker is never empty on first use. */
export function seedDefaultVoices(): BrandVoice[] {
  const existing = listBrandVoices();
  if (existing.length) return existing;
  return DEFAULT_VOICES.map((v) => createBrandVoice(v));
}

export function saveRewritten(a: Omit<RewrittenArticle, 'id' | 'createdAt'>): RewrittenArticle {
  ensureTables();
  const record: RewrittenArticle = { ...a, id: randomUUID(), createdAt: Date.now() };

  getDb()
    .prepare(
      `INSERT INTO rewritten_articles
         (id,source_url,source_domain,title,markdown,language,brand_voice_id,words,human_score,similarity,fact_warnings,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      record.id, record.sourceUrl, record.sourceDomain, record.title, record.markdown,
      record.language, record.brandVoiceId, record.words, record.humanScore,
      record.similarityToSource, JSON.stringify(record.factWarnings), record.createdAt,
    );

  return record;
}

export function listRewritten(limit = 100): RewrittenArticle[] {
  ensureTables();
  const rows = getDb()
    .prepare(`SELECT * FROM rewritten_articles ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Row[];

  return rows.map((r) => ({
    id: String(r.id),
    sourceUrl: String(r.source_url),
    sourceDomain: String(r.source_domain),
    title: String(r.title),
    markdown: String(r.markdown),
    language: String(r.language ?? 'English'),
    brandVoiceId: String(r.brand_voice_id ?? 'auto'),
    words: Number(r.words ?? 0),
    humanScore: Number(r.human_score ?? 0),
    similarityToSource: Number(r.similarity ?? 0),
    factWarnings: parseList(r.fact_warnings),
    createdAt: Number(r.created_at),
  }));
}

export function deleteRewritten(id: string): void {
  ensureTables();
  getDb().prepare(`DELETE FROM rewritten_articles WHERE id = ?`).run(id);
}
