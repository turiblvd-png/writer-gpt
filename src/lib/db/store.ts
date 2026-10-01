import { randomUUID } from 'node:crypto';
import type { Source } from '@/lib/ai';
import { collection, probeStorage, resolveDataFile, storageStatus, type StorageMode, type StorageStatus } from './engine';

export { storageStatus, probeStorage, resolveDataFile, type StorageMode, type StorageStatus };

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
  snapshot: unknown;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const articles = collection<ArticleRecord>('articles');
const runs = collection<RunRecord>('runs');

export async function saveArticle(a: Omit<ArticleRecord, 'createdAt' | 'updatedAt'>): Promise<ArticleRecord> {
  const now = Date.now();
  // Preserve the original creation time when overwriting an existing article.
  const existing = await articles.get(a.id);
  return articles.put({ ...a, createdAt: existing?.createdAt ?? now, updatedAt: now });
}

export async function listArticles(limit = 100): Promise<ArticleRecord[]> {
  return articles.list('createdAt', limit);
}

export async function getArticle(id: string): Promise<ArticleRecord | null> {
  return articles.get(id);
}

export async function deleteArticle(id: string): Promise<void> {
  await articles.remove(id);
}

export async function saveRun(r: {
  id: string;
  pipelineId: string;
  articleId?: string | null;
  status: string;
  progress: number;
  snapshot: unknown;
  error?: string | null;
}): Promise<void> {
  const now = Date.now();
  const existing = await runs.get(r.id);
  await runs.put({
    id: r.id,
    pipelineId: r.pipelineId,
    articleId: r.articleId ?? null,
    status: r.status,
    progress: r.progress,
    snapshot: r.snapshot ?? {},
    error: r.error ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function getRun(id: string): Promise<RunRecord | null> {
  return runs.get(id);
}

export async function listRuns(limit = 50): Promise<RunRecord[]> {
  return runs.list('createdAt', limit);
}

/** Kept for callers that used to reach for a raw handle. */
export function newId(): string {
  return randomUUID();
}
