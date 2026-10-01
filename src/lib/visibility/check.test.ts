import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const complete = vi.fn();
vi.mock('@/lib/ai', () => ({ complete: (...a: unknown[]) => complete(...a) }));

const reply = (text: string, sources: { uri: string; title?: string; domain?: string }[]) => ({
  text, sources, searchQueries: [], usage: { input: 1, output: 1, total: 2 }, model: 'm', provider: 'gemini' as const,
});

// Gemini's citations usually carry a redirect URL, with the real site in title/domain.
const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123';

beforeEach(() => {
  vi.resetModules();
  complete.mockReset();
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-vis-')), 'data.json');
});

describe('domain matching', () => {
  it('reads the real site from title or domain when the uri is a redirect', async () => {
    const { sourceDomain } = await import('./check');
    expect(sourceDomain({ uri: REDIRECT, title: 'riyadhticketsmap.com' })).toBe('riyadhticketsmap.com');
    expect(sourceDomain({ uri: REDIRECT, domain: 'www.Netflix.com' })).toBe('netflix.com');
    expect(sourceDomain({ uri: 'https://en.wikipedia.org/wiki/X' })).toBe('en.wikipedia.org');
    expect(sourceDomain({ uri: REDIRECT, title: 'Six Kings Slam guide' })).toBe('');
  });

  it('counts subdomains but never lookalike suffixes', async () => {
    const { isSameSite } = await import('./check');
    expect(isSameSite('blog.example.com', 'example.com')).toBe(true);
    expect(isSameSite('example.com', 'example.com')).toBe(true);
    expect(isSameSite('notexample.com', 'example.com')).toBe(false);
  });

  it('normalises whatever the user types', async () => {
    const { normaliseDomain } = await import('./check');
    expect(normaliseDomain('https://www.RiyadhTicketsMap.com/tickets')).toBe('riyadhticketsmap.com');
    expect(normaliseDomain('riyadhticketsmap.com')).toBe('riyadhticketsmap.com');
  });
});

describe('runVisibilityCheck', () => {
  it('measures citation, position, mentions and competitors from real citations', async () => {
    complete
      .mockResolvedValueOnce(reply('Tickets are sold via Riyadh Season. RiyadhTicketsMap lists prices by night.', [
        { uri: REDIRECT, title: 'riyadhseason.com' }, { uri: REDIRECT, title: 'riyadhticketsmap.com' },
      ]))
      .mockResolvedValueOnce(reply('Netflix streams every match.', [{ uri: REDIRECT, title: 'netflix.com' }, { uri: REDIRECT, title: 'riyadhseason.com' }]));

    const { runVisibilityCheck } = await import('./check');
    const c = await runVisibilityCheck({ domain: 'riyadhticketsmap.com', brand: 'RiyadhTicketsMap', queries: ['six kings slam tickets', 'how to watch six kings slam'] });

    expect(c.results[0]).toMatchObject({ cited: true, position: 2, mentioned: true });
    expect(c.results[1]).toMatchObject({ cited: false, position: null, mentioned: false });
    expect(c.citationRate).toBe(0.5);
    expect(c.topCompetitors[0]).toEqual({ domain: 'riyadhseason.com', count: 2 });
    // Every query is asked with search grounding on.
    expect(complete.mock.calls.every((call) => call[1].grounded === true)).toBe(true);
  });

  it('keeps going when one query fails, and excludes it from the rates', async () => {
    complete
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce(reply('x', [{ uri: REDIRECT, title: 'riyadhticketsmap.com' }]));
    const { runVisibilityCheck } = await import('./check');
    const c = await runVisibilityCheck({ domain: 'riyadhticketsmap.com', queries: ['a query', 'b query'] });
    expect(c.results[0]!.error).toBe('quota');
    expect(c.citationRate).toBe(1);
  });

  it('caps queries at ten and drops duplicates', async () => {
    complete.mockResolvedValue(reply('x', []));
    const { runVisibilityCheck } = await import('./check');
    const queries = Array.from({ length: 14 }, (_, i) => `query number ${i % 12}`);
    const c = await runVisibilityCheck({ domain: 'site.com', queries });
    expect(c.results).toHaveLength(10);
  });

  it('rejects a missing domain or empty query list', async () => {
    const { runVisibilityCheck } = await import('./check');
    await expect(runVisibilityCheck({ domain: 'nodot', queries: ['q one'] })).rejects.toThrow(/Enter your site/);
    await expect(runVisibilityCheck({ domain: 'site.com', queries: [' '] })).rejects.toThrow(/at least one query/);
  });
});
