import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import type { HumanizedArticle } from './types';

/** Kept in its own collection so a humanized copy never shadows the original. */
const humanized = collection<HumanizedArticle>('humanized_articles');

export function saveHumanized(a: Omit<HumanizedArticle, 'id' | 'createdAt'>): HumanizedArticle {
  return humanized.put({ ...a, id: randomUUID(), createdAt: Date.now() });
}

export function listHumanized(limit = 100): HumanizedArticle[] {
  return humanized.list('createdAt', limit);
}

export function getHumanized(id: string): HumanizedArticle | null {
  return humanized.get(id);
}

export function deleteHumanized(id: string): void {
  humanized.remove(id);
}
