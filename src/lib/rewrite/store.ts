import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import { DEFAULT_VOICES, type BrandVoice, type RewrittenArticle } from './types';

const voices = collection<BrandVoice>('brand_voices');
const rewritten = collection<RewrittenArticle>('rewritten_articles');

export async function listBrandVoices(): Promise<BrandVoice[]> {
  // Oldest first, so the seeded starter voices keep a stable order.
  return (await voices.all()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function createBrandVoice(input: { name: string; description: string; avoidPhrases?: string[] }): Promise<BrandVoice> {
  return voices.put({
    id: randomUUID(),
    name: input.name,
    description: input.description,
    avoidPhrases: input.avoidPhrases ?? [],
    createdAt: Date.now(),
  });
}

export async function getBrandVoice(id: string): Promise<BrandVoice | null> {
  return voices.get(id);
}

export async function deleteBrandVoice(id: string): Promise<void> {
  await voices.remove(id);
}

/** Seeds the starter voices once, so the picker is never empty on first use. */
export async function seedDefaultVoices(): Promise<BrandVoice[]> {
  const existing = await listBrandVoices();
  if (existing.length) return existing;
  // Spaced timestamps keep the seeded order deterministic.
  return Promise.all(
    DEFAULT_VOICES.map((v, i) =>
      voices.put({ ...v, id: randomUUID(), avoidPhrases: v.avoidPhrases ?? [], createdAt: Date.now() + i }),
    ),
  );
}

export async function saveRewritten(a: Omit<RewrittenArticle, 'id' | 'createdAt'>): Promise<RewrittenArticle> {
  return rewritten.put({ ...a, id: randomUUID(), createdAt: Date.now() });
}

export async function listRewritten(limit = 100): Promise<RewrittenArticle[]> {
  return rewritten.list('createdAt', limit);
}

export async function deleteRewritten(id: string): Promise<void> {
  await rewritten.remove(id);
}
