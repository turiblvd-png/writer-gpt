import { randomUUID } from 'node:crypto';
import { runPipeline } from '@/lib/pipeline/engine';
import type { Pipeline, RunEvent, RunSnapshot } from '@/lib/pipeline/types';
import { saveArticle, saveRun } from '@/lib/db/store';
import { slugify } from '@/lib/content/slug';
import { analyseDocument } from '@/lib/seo/text';
import type { ArticleMeta, Claim } from '@/lib/content/types';
import type { Source } from '@/lib/ai';

/**
 * Tracks in-flight runs and fans their events out to connected clients.
 *
 * Runs live in this process's memory, which is fine for a single instance and
 * is the documented limit: horizontal scaling needs a real queue (Redis/BullMQ)
 * behind this same interface. Snapshots are persisted after every step, so a
 * restart loses the in-flight step but never completed work.
 */

interface Live {
  snapshot: RunSnapshot<AnyState>;
  controller: AbortController;
  subscribers: Set<(e: RunEvent<AnyState>) => void>;
  done: Promise<void>;
}

/** Shared shape both pipelines converge on, so persistence is pipeline-agnostic. */
interface AnyState {
  markdown?: string;
  meta?: ArticleMeta;
  claims?: Claim[];
  warnings?: string[];
  input?: { language?: string; seoMode?: string; topic?: string };
}

const live = new Map<string, Live>();

// Finished runs linger briefly so a client that reconnects right after
// completion still receives the terminal snapshot instead of a 404.
const RETAIN_MS = 10 * 60 * 1000;

export function startRun<S extends AnyState>(
  pipeline: Pipeline<S>,
  initialState: S,
): string {
  if (!pipeline.steps.length) {
    throw new Error(`Pipeline "${pipeline.id}" has no steps defined yet.`);
  }

  const runId = randomUUID();
  const controller = new AbortController();
  const subscribers = new Set<(e: RunEvent<AnyState>) => void>();

  const entry: Live = {
    snapshot: {
      runId,
      pipelineId: pipeline.id,
      status: 'running',
      progress: 0,
      steps: pipeline.steps.map((s) => ({ id: s.id, title: s.title, status: 'pending', logs: [] })),
      sources: [],
      usage: { input: 0, output: 0, total: 0 },
      state: initialState,
      startedAt: Date.now(),
    },
    controller,
    subscribers,
    done: Promise.resolve(),
  };
  live.set(runId, entry);

  entry.done = (async () => {
    try {
      const final = await runPipeline<S>({
        runId,
        pipeline,
        initialState,
        signal: controller.signal,
        onEvent: (event) => {
          const e = event as RunEvent<AnyState>;
          if ('snapshot' in e) entry.snapshot = e.snapshot;
          for (const notify of subscribers) {
            try {
              notify(e);
            } catch {
              // A dead subscriber must not interrupt the run.
            }
          }
          if (e.type !== 'step:log' && e.type !== 'step:progress') {
            persist(runId, pipeline.id, entry.snapshot);
          }
        },
      });

      entry.snapshot = final as RunSnapshot<AnyState>;
      const articleId = final.status === 'done' ? persistArticle(final as RunSnapshot<AnyState>) : null;
      persist(runId, pipeline.id, entry.snapshot, articleId);
    } catch (err) {
      // runPipeline handles step errors itself; this catches engine-level faults.
      const message = err instanceof Error ? err.message : String(err);
      entry.snapshot = { ...entry.snapshot, status: 'failed', error: message, endedAt: Date.now() };
      persist(runId, pipeline.id, entry.snapshot);
      for (const notify of subscribers) {
        try {
          notify({ type: 'run:error', error: message, snapshot: entry.snapshot });
        } catch {
          /* ignore */
        }
      }
    } finally {
      setTimeout(() => live.delete(runId), RETAIN_MS).unref?.();
    }
  })();

  return runId;
}

function persist(runId: string, pipelineId: string, snapshot: RunSnapshot<AnyState>, articleId?: string | null) {
  try {
    saveRun({
      id: runId,
      pipelineId,
      articleId: articleId ?? null,
      status: snapshot.status,
      progress: snapshot.progress,
      snapshot,
      error: snapshot.error ?? null,
    });
  } catch {
    // Losing a progress write must never abort generation.
  }
}

function persistArticle(snapshot: RunSnapshot<AnyState>): string | null {
  const { markdown, meta, input } = snapshot.state;
  if (!markdown) return null;

  const title = meta?.seoTitle || firstHeading(markdown) || input?.topic || 'Untitled article';
  const id = randomUUID();

  try {
    saveArticle({
      id,
      title,
      slug: meta?.slug || slugify(title),
      markdown,
      metaDescription: meta?.metaDescription ?? '',
      focusKeyword: meta?.focusKeyword ?? '',
      keywords: meta?.keywords ?? [],
      language: input?.language ?? 'English',
      seoMode: input?.seoMode ?? 'full-seo',
      wordCount: analyseDocument(markdown).words,
      status: 'draft',
      sources: snapshot.sources as Source[],
    });
    return id;
  } catch {
    return null;
  }
}

function firstHeading(markdown: string): string {
  return /^\s{0,3}#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
}

export function getLiveRun(runId: string): RunSnapshot<AnyState> | null {
  return live.get(runId)?.snapshot ?? null;
}

export function cancelRun(runId: string): boolean {
  const entry = live.get(runId);
  if (!entry || entry.snapshot.status !== 'running') return false;
  entry.controller.abort();
  return true;
}

export function subscribe(runId: string, fn: (e: RunEvent<AnyState>) => void): () => void {
  const entry = live.get(runId);
  if (!entry) return () => {};
  entry.subscribers.add(fn);
  return () => entry.subscribers.delete(fn);
}
