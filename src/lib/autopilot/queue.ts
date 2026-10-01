import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import { runPipeline } from '@/lib/pipeline/engine';
import { generateContentPipeline, initialGenerateState } from '@/lib/pipelines/generate-content';
import { persistGeneratedArticle } from '@/lib/content/persist';
import { generateInputSchema, type SeoMode } from '@/lib/content/types';
import { currentActor, runAs, type Actor } from '@/lib/auth/actor';

/**
 * Autopilot: a queue of keywords written one at a time by the Generate Content
 * pipeline.
 *
 * One item per tick, never a loop. A serverless function has a hard time limit
 * and one article takes most of it, so a tick claims a single item, writes it
 * and returns. Ticks come from the "Run next" button, the page's own runner
 * while it is open, or the cron endpoint. Claiming goes through a row-locked
 * mutate, so two ticks landing together never write the same keyword twice.
 */

export type AutopilotStatus = 'queued' | 'running' | 'done' | 'failed';

export interface AutopilotSettings {
  language: string;
  seoMode: SeoMode;
  targetWords: number;
  includeFaq: boolean;
}

export interface AutopilotItem {
  id: string;
  keyword: string;
  status: AutopilotStatus;
  settings: AutopilotSettings;
  articleId: string | null;
  error: string | null;
  attempts: number;
  claim: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

const store = collection<AutopilotItem>('autopilot_queue');

/** A run longer than the platform limit died with its function; let it be picked up again. */
const STALE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 2;
const MAX_BATCH = 50;

export const DEFAULT_SETTINGS: AutopilotSettings = {
  language: 'English',
  seoMode: 'full-seo',
  targetWords: 1800,
  includeFaq: true,
};

export async function enqueue(keywords: string[], settings: Partial<AutopilotSettings> = {}): Promise<AutopilotItem[]> {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  // Validate once with the same schema the pipeline uses, so a bad setting
  // fails here rather than at 3am inside a cron tick.
  generateInputSchema.parse({ topic: 'validation probe', ...merged });

  const all = await store.all();
  const seen = new Set(all.filter((i) => i.status !== 'failed').map((i) => i.keyword.toLowerCase()));
  const unique: string[] = [];
  for (const raw of keywords) {
    const k = raw.replace(/\s+/g, ' ').trim();
    if (k.length < 3 || k.length > 200 || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    unique.push(k);
    if (unique.length === MAX_BATCH) break;
  }

  // Never earlier than the newest queued item, so batches added in the same
  // millisecond still run in the order they were added.
  const now = Math.max(Date.now(), ...all.map((i) => i.createdAt + 1));
  const added: AutopilotItem[] = [];
  for (const [i, keyword] of unique.entries()) {
    added.push(
      await store.put({
        id: randomUUID(),
        keyword,
        status: 'queued',
        settings: merged,
        articleId: null,
        error: null,
        attempts: 0,
        claim: null,
        // Spaced by a millisecond so the queue keeps the order they were typed.
        createdAt: now + i,
        startedAt: null,
        finishedAt: null,
      }),
    );
  }
  return added;
}

function claimable(item: AutopilotItem, now: number): boolean {
  if (item.status === 'queued') return true;
  return item.status === 'running' && item.startedAt !== null && now - item.startedAt > STALE_MS && item.attempts < MAX_ATTEMPTS;
}

/** Atomically take the oldest claimable item, or null when the queue is empty. */
export async function claimNext(now = Date.now()): Promise<AutopilotItem | null> {
  const candidates = (await store.all()).filter((i) => claimable(i, now)).sort((a, b) => a.createdAt - b.createdAt);

  for (const candidate of candidates) {
    const token = randomUUID();
    const after = await store.mutate(candidate.id, (current) =>
      claimable(current, now)
        ? { ...current, status: 'running', claim: token, startedAt: now, attempts: current.attempts + 1, error: null }
        : current,
    );
    if (after?.claim === token) return after;
  }
  return null;
}

export interface TickResult {
  item: AutopilotItem | null;
  remaining: number;
}

/** Write the next queued keyword. Returns null item when there was nothing to do. */
export async function runNext(signal?: AbortSignal): Promise<TickResult> {
  const item = await claimNext();
  if (!item) return { item: null, remaining: await countQueued() };

  // The cron runs as the system and sees every queue; the article must still
  // be written and saved as the user who queued the keyword.
  const ownerId = (item as AutopilotItem & { ownerId?: string }).ownerId;
  const caller = await currentActor();
  const owner: Actor | null = ownerId
    ? caller?.id === ownerId ? caller : { id: ownerId, email: '', role: 'subscriber' }
    : caller;

  const finished = await runAs(owner, () => writeItem(item, signal));

  // Only write back if this tick still owns the item.
  const saved = await runAs(owner, () => store.mutate(item.id, (current) => (current.claim === item.claim ? finished : current)));
  return { item: saved ?? finished, remaining: await countQueued() };
}

async function writeItem(item: AutopilotItem, signal?: AbortSignal): Promise<AutopilotItem> {
  let finished: AutopilotItem;
  try {
    const snapshot = await runPipeline({
      runId: randomUUID(),
      pipeline: generateContentPipeline,
      initialState: initialGenerateState(generateInputSchema.parse({ topic: item.keyword, ...item.settings })),
      signal,
    });
    if (snapshot.status !== 'done') throw new Error(snapshot.error ?? 'Generation did not finish.');
    const article = await persistGeneratedArticle(snapshot);
    if (!article) throw new Error('The pipeline finished without an article.');
    finished = { ...item, status: 'done', articleId: article.id, error: null, finishedAt: Date.now() };
  } catch (err) {
    finished = {
      ...item,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Generation failed.',
      finishedAt: Date.now(),
    };
  }
  return finished;
}

async function countQueued(): Promise<number> {
  return (await store.all()).filter((i) => i.status === 'queued').length;
}

export async function listQueue(limit = 200): Promise<AutopilotItem[]> {
  return store.list('createdAt', limit);
}

export async function retryItem(id: string): Promise<AutopilotItem | null> {
  return store.mutate(id, (current) =>
    current.status === 'failed' ? { ...current, status: 'queued', error: null, claim: null, attempts: 0 } : current,
  );
}

export async function removeItem(id: string): Promise<void> {
  await store.remove(id);
}

/** Clears finished and failed items, leaving the live queue alone. */
export async function clearFinished(): Promise<number> {
  const done = (await store.all()).filter((i) => i.status === 'done' || i.status === 'failed');
  for (const item of done) await store.remove(item.id);
  return done.length;
}
