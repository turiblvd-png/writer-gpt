import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import { DEFAULT_VOICES, type BrandVoice, type RewrittenArticle } from './types';

const voices = collection<BrandVoice>('brand_voices');
const rewritten = collection<RewrittenArticle>('rewritten_articles');

export function listBrandVoices(): BrandVoice[] {
  // Oldest first, so the seeded starter voices keep a stable order.
  return voices.all().sort((a, b) => a.createdAt - b.createdAt);
}

export function createBrandVoice(input: { name: string; description: string; avoidPhrases?: string[] }): BrandVoice {
  return voices.put({
    id: randomUUID(),
    name: input.name,
    description: input.description,
    avoidPhrases: input.avoidPhrases ?? [],
    createdAt: Date.now(),
  });
}

export function getBrandVoice(id: string): BrandVoice | null {
  return voices.get(id);
}

export function deleteBrandVoice(id: string): void {
  voices.remove(id);
}

/** Seeds the starter voices once, so the picker is never empty on first use. */
export function seedDefaultVoices(): BrandVoice[] {
  const existing = listBrandVoices();
  if (existing.length) return existing;
  // Spaced timestamps keep the seeded order deterministic.
  return DEFAULT_VOICES.map((v, i) =>
    voices.put({ ...v, id: randomUUID(), avoidPhrases: v.avoidPhrases ?? [], createdAt: Date.now() + i }),
  );
}

export function saveRewritten(a: Omit<RewrittenArticle, 'id' | 'createdAt'>): RewrittenArticle {
  return rewritten.put({ ...a, id: randomUUID(), createdAt: Date.now() });
}

export function listRewritten(limit = 100): RewrittenArticle[] {
  return rewritten.list('createdAt', limit);
}

export function deleteRewritten(id: string): void {
  rewritten.remove(id);
}
