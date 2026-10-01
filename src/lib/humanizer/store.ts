import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import type { HumanizedArticle } from './types';

/** Kept in its own collection so a humanized copy never shadows the original. */
const humanized = collection<HumanizedArticle>('humanized_articles');

export async function saveHumanized(a: Omit<HumanizedArticle, 'id' | 'createdAt'>): Promise<HumanizedArticle> {
  return humanized.put({ ...a, id: randomUUID(), createdAt: Date.now() });
}

export async function listHumanized(limit = 100): Promise<HumanizedArticle[]> {
  return humanized.list('createdAt', limit);
}

export async function getHumanized(id: string): Promise<HumanizedArticle | null> {
  return humanized.get(id);
}

export async function deleteHumanized(id: string): Promise<void> {
  await humanized.remove(id);
}
