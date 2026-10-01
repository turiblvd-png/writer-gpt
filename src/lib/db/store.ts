import { randomUUID } from 'node:crypto';
import type { Source } from '@/lib/ai';
import { collection, resolveDataFile, storageStatus, type StorageMode } from './engine';

export { storageStatus, resolveDataFile, type StorageMode };

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

export function saveArticle(a: Omit<ArticleRecord, 'createdAt' | 'updatedAt'>): ArticleRecord {
  const now = Date.now();
  // Preserve the original creation time when overwriting an existing article.
  const existing = articles.get(a.id);
  return articles.put({ ...a, createdAt: existing?.createdAt ?? now, updatedAt: now });
}

export function listArticles(limit = 100): ArticleRecord[] {
  return articles.list('createdAt', limit);
}

export function getArticle(id: string): ArticleRecord | null {
  return articles.get(id);
}

export function deleteArticle(id: string): void {
  articles.remove(id);
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
  const existing = runs.get(r.id);
  runs.put({
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

export function getRun(id: string): RunRecord | null {
  return runs.get(id);
}

export function listRuns(limit = 50): RunRecord[] {
  return runs.list('createdAt', limit);
}

/** Kept for callers that used to reach for a raw handle. */
export function newId(): string {
  return randomUUID();
}
