import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const runPipeline = vi.fn();
const persist = vi.fn();
vi.mock('@/lib/pipeline/engine', () => ({ runPipeline: (...a: unknown[]) => runPipeline(...a) }));
vi.mock('@/lib/pipelines/generate-content', () => ({
  generateContentPipeline: { id: 'generate-content', steps: [] },
  initialGenerateState: (input: unknown) => ({ input, warnings: [] }),
}));
vi.mock('@/lib/content/persist', () => ({ persistGeneratedArticle: (...a: unknown[]) => persist(...a) }));

beforeEach(() => {
  vi.resetModules();
  runPipeline.mockReset();
  persist.mockReset();
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-auto-')), 'data.json');
});

describe('Autopilot queue', () => {
  it('dedupes, trims and keeps typed order', async () => {
    const { enqueue, listQueue } = await import('./queue');
    await enqueue(['  best trail shoes ', 'Best Trail Shoes', 'ab', 'solar battery cost']);
    await enqueue(['solar battery cost', 'heat pump sizing']);
    const keywords = (await listQueue()).map((i) => i.keyword).reverse();
    expect(keywords).toEqual(['best trail shoes', 'solar battery cost', 'heat pump sizing']);
  });

  it('rejects invalid settings before anything is queued', async () => {
    const { enqueue, listQueue } = await import('./queue');
    await expect(enqueue(['x keyword'], { targetWords: 50 })).rejects.toThrow();
    expect(await listQueue()).toHaveLength(0);
  });

  it('writes the oldest item and links the article', async () => {
    runPipeline.mockResolvedValue({ status: 'done', state: {} });
    persist.mockResolvedValue({ id: 'article-1' });
    const { enqueue, runNext } = await import('./queue');
    await enqueue(['first keyword', 'second keyword']);

    const tick = await runNext();
    expect(tick.item?.keyword).toBe('first keyword');
    expect(tick.item?.status).toBe('done');
    expect(tick.item?.articleId).toBe('article-1');
    expect(tick.remaining).toBe(1);
    expect(runPipeline.mock.calls[0]![0].initialState.input.topic).toBe('first keyword');
  });

  it('records a failure and allows a retry', async () => {
    runPipeline.mockResolvedValue({ status: 'failed', error: 'Quota exceeded', state: {} });
    const { enqueue, runNext, retryItem } = await import('./queue');
    const [item] = await enqueue(['only keyword']);
    const tick = await runNext();
    expect(tick.item?.status).toBe('failed');
    expect(tick.item?.error).toMatch(/Quota/);
    expect((await retryItem(item!.id))?.status).toBe('queued');
  });

  it('never hands the same item to two concurrent ticks', async () => {
    const { enqueue, claimNext } = await import('./queue');
    await enqueue(['one keyword']);
    const [a, b] = await Promise.all([claimNext(), claimNext()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('reclaims a run that died with its function', async () => {
    const { enqueue, claimNext } = await import('./queue');
    await enqueue(['stuck keyword']);
    const first = await claimNext(1_000);
    expect(first).not.toBeNull();
    expect(await claimNext(2_000)).toBeNull();
    const again = await claimNext(1_000 + 11 * 60 * 1000);
    expect(again?.id).toBe(first?.id);
    expect(again?.attempts).toBe(2);
  });

  it('returns no item on an empty queue', async () => {
    const { runNext } = await import('./queue');
    expect(await runNext()).toEqual({ item: null, remaining: 0 });
  });
});
