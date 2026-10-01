import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const complete = vi.fn();
vi.mock('@/lib/ai', () => ({ complete: (...a: unknown[]) => complete(...a) }));

const reply = (text: string, sources: { uri: string }[] = []) => ({
  text, sources, searchQueries: [], usage: { input: 1, output: 1, total: 2 }, model: 'm', provider: 'gemini' as const,
});

beforeEach(() => {
  vi.resetModules();
  complete.mockReset();
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-kw-')), 'data.json');
});

describe('researchKeywords', () => {
  it('grounds first, structures second, and never combines the two', async () => {
    complete
      .mockResolvedValueOnce(reply('WHO RANKS: riyadhseason.com, netflix.com', [{ uri: 'https://riyadhseason.com' }]))
      .mockResolvedValueOnce(reply(JSON.stringify({
        clusters: [{ name: 'Tickets', intent: 'transactional', keywords: [{ term: 'Six Kings Slam Tickets', intent: 'transactional', difficulty: 'high', note: 'Official site ranks.' }] }],
        questions: ['how much are six kings slam tickets'], serpFeatures: ['People Also Ask'], competitors: ['riyadhseason.com'],
        angle: 'A ticket guide by night.',
      })));

    const { researchKeywords } = await import('./research');
    const r = await researchKeywords({ seed: 'six kings slam tickets' });

    expect(complete.mock.calls[0]![1]).toMatchObject({ grounded: true });
    expect(complete.mock.calls[0]![1].json).toBeUndefined();
    expect(complete.mock.calls[1]![1]).toMatchObject({ json: true });
    expect(complete.mock.calls[1]![1].grounded).toBeUndefined();

    expect(r.clusters[0]!.keywords[0]!.term).toBe('six kings slam tickets');
    expect(r.sources).toHaveLength(1);
  });

  it('repairs invalid intent and difficulty values, and removes duplicate terms', async () => {
    complete
      .mockResolvedValueOnce(reply('research'))
      .mockResolvedValueOnce(reply(JSON.stringify({
        clusters: [
          { name: 'A', intent: 'shopping', keywords: [{ term: 'one', intent: 'buying', difficulty: 'extreme' }, { term: 'two', intent: 'commercial', difficulty: 'low' }] },
          { name: 'B', intent: 'commercial', keywords: [{ term: 'one', intent: 'commercial', difficulty: 'low' }, { term: 'three', difficulty: 'low' }] },
        ],
      })));

    const { researchKeywords } = await import('./research');
    const r = await researchKeywords({ seed: 'x seed' });

    expect(r.clusters[0]!.intent).toBe('informational');
    expect(r.clusters[0]!.keywords[0]).toMatchObject({ term: 'one', intent: 'informational', difficulty: 'medium' });
    // "one" already lives in cluster A, so B keeps only "three".
    expect(r.clusters[1]!.keywords.map((k) => k.term)).toEqual(['three']);
    // A keyword with no intent inherits its cluster's.
    expect(r.clusters[1]!.keywords[0]!.intent).toBe('commercial');
  });

  it('fails clearly instead of saving an empty result', async () => {
    complete.mockResolvedValueOnce(reply('research')).mockResolvedValueOnce(reply('{"clusters":[]}'));
    const { researchKeywords, listResearch } = await import('./research');
    await expect(researchKeywords({ seed: 'nothing' })).rejects.toThrow(/No keyword clusters/);
    expect(await listResearch()).toEqual([]);
  });
});
