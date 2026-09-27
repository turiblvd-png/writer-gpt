import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the full Generate Content pipeline against a scripted provider, so
 * step wiring, JSON recovery, citation accumulation and warning propagation are
 * all verified without a network call or an API key.
 */
const complete = vi.fn();
vi.mock('@/lib/ai', () => ({ complete: (...args: unknown[]) => complete(...args) }));

const { runPipeline } = await import('@/lib/pipeline/engine');
const { generateContentPipeline, initialGenerateState } = await import('./generate-content');

const usage = { input: 100, output: 200, total: 300 };
const reply = (text: string, sources: { uri: string; title?: string }[] = []) =>
  ({ text, sources, searchQueries: [], usage, model: 'test', provider: 'gemini' as const });

const ARTICLE = [
  '# Six Kings Slam 2026: Dates, Players and How to Watch',
  '',
  'The 2026 edition runs 21–24 October in Riyadh. Here is the confirmed field and how to stream it.',
  '',
  '## The 2026 field',
  '',
  'Six players compete, with two receiving semifinal byes.',
].join('\n');

/** Happy-path script, one reply per step in order. */
function scriptSuccess() {
  complete
    .mockResolvedValueOnce(reply('STATUS NOW: the 2026 edition runs 21–24 October.', [
      { uri: 'https://example.com/a', title: 'Source A' },
      { uri: 'https://example.com/b', title: 'Source B' },
    ]))
    .mockResolvedValueOnce(reply('DOMINANT INTENT: find 2026 dates and how to watch.'))
    .mockResolvedValueOnce(reply('```json\n{"headings":["## The 2026 field","### Byes"]}\n```'))
    .mockResolvedValueOnce(reply(ARTICLE))
    .mockResolvedValueOnce(reply(JSON.stringify({
      seoTitle: 'Six Kings Slam 2026: Dates, Players & How to Watch',
      metaDescription: 'Confirmed dates, the six-player field and how to stream every match of the Six Kings Slam 2026 live.',
      slug: 'Six Kings Slam 2026 Dates!!',
      focusKeyword: 'six kings slam 2026',
      keywords: ['six kings slam', 'riyadh tennis'],
    })))
    .mockResolvedValueOnce(reply(
      'Here are the claims:\n```json\n{"claims":[{"text":"Runs 21–24 October","sourceUri":"https://example.com/a","verdict":"supported"}]}\n```',
      [{ uri: 'https://example.com/c' }],
    ));
}

const run = () =>
  runPipeline({
    runId: 'test-run',
    pipeline: generateContentPipeline,
    initialState: initialGenerateState({
      topic: 'Six Kings Slam 2026', language: 'English', seoMode: 'full-seo',
      targetWords: 1800, includeFaq: true,
    }),
    now: new Date('2026-09-27T12:00:00Z'),
  });

beforeEach(() => complete.mockReset());

describe('generateContentPipeline', () => {
  it('runs all six steps and produces a complete article', async () => {
    scriptSuccess();
    const snap = await run();

    expect(snap.status).toBe('done');
    expect(snap.steps.map((s) => s.id)).toEqual([
      'research', 'intent', 'outline', 'draft', 'metadata', 'verify',
    ]);
    expect(snap.state.markdown).toContain('Six Kings Slam 2026');
    expect(snap.state.outline).toEqual(['## The 2026 field', '### Byes']);
    expect(snap.state.claims).toHaveLength(1);
  });

  it('grounds research and verification, but not drafting', async () => {
    scriptSuccess();
    await run();

    const grounded = complete.mock.calls.map(([role, req]) => [role, Boolean(req.grounded)]);
    expect(grounded).toEqual([
      ['research', true], ['reason', false], ['structure', false],
      ['draft', false], ['structure', false], ['verify', true],
    ]);
  });

  it('tells the model what today is, so it cannot default to its training cutoff', async () => {
    scriptSuccess();
    await run();
    expect(complete.mock.calls[0]![1].system).toContain('27 September 2026');
    expect(complete.mock.calls[0]![1].system).toContain('current year is 2026');
  });

  it('accumulates de-duplicated sources and sums usage across steps', async () => {
    scriptSuccess();
    const snap = await run();

    expect(snap.sources.map((s) => s.uri)).toEqual([
      'https://example.com/a', 'https://example.com/b', 'https://example.com/c',
    ]);
    expect(snap.usage.total).toBe(300 * 6);
  });

  it('normalises a messy slug the model returned', async () => {
    scriptSuccess();
    const snap = await run();
    expect(snap.state.meta?.slug).toBe('six-kings-slam-2026-dates');
  });

  it('warns loudly when research comes back with no citations', async () => {
    complete
      .mockResolvedValueOnce(reply('Some ungrounded recollection.'))
      .mockResolvedValueOnce(reply('intent'))
      .mockResolvedValueOnce(reply('{"headings":["## One"]}'))
      .mockResolvedValueOnce(reply(ARTICLE))
      .mockResolvedValueOnce(reply('{"seoTitle":"T","metaDescription":"D","slug":"t","focusKeyword":"k","keywords":[]}'))
      .mockResolvedValueOnce(reply('{"claims":[]}'));

    const snap = await run();
    expect(snap.status).toBe('done');
    expect(snap.state.warnings.some((w) => w.includes('no citations'))).toBe(true);
  });

  it('surfaces unverified claims as a warning rather than passing them silently', async () => {
    complete
      .mockResolvedValueOnce(reply('research', [{ uri: 'https://example.com/a' }]))
      .mockResolvedValueOnce(reply('intent'))
      .mockResolvedValueOnce(reply('{"headings":["## One"]}'))
      .mockResolvedValueOnce(reply(ARTICLE))
      .mockResolvedValueOnce(reply('{"seoTitle":"T","metaDescription":"D","slug":"t","focusKeyword":"k","keywords":[]}'))
      .mockResolvedValueOnce(reply(JSON.stringify({
        claims: [
          { text: 'Venue was renamed from Kingdom Arena', sourceUri: null, verdict: 'contradicted', note: 'Sources say otherwise.' },
          { text: 'Runs in October', sourceUri: 'https://example.com/a', verdict: 'supported' },
        ],
      })));

    const snap = await run();
    expect(snap.state.claims?.filter((c) => c.verdict !== 'supported')).toHaveLength(1);
    expect(snap.state.warnings.some((w) => w.includes('1 claim(s) could not be verified'))).toBe(true);
  });

  it('keeps a finished article even when fact-check output is unparseable', async () => {
    complete
      .mockResolvedValueOnce(reply('research', [{ uri: 'https://example.com/a' }]))
      .mockResolvedValueOnce(reply('intent'))
      .mockResolvedValueOnce(reply('{"headings":["## One"]}'))
      .mockResolvedValueOnce(reply(ARTICLE))
      .mockResolvedValueOnce(reply('{"seoTitle":"T","metaDescription":"D","slug":"t","focusKeyword":"k","keywords":[]}'))
      .mockResolvedValueOnce(reply('I could not produce JSON for this.'));

    const snap = await run();
    expect(snap.status).toBe('done');
    expect(snap.state.markdown).toContain('Six Kings Slam 2026');
    expect(snap.state.claims).toEqual([]);
  });

  it('fails the run when the outline step yields no headings', async () => {
    complete
      .mockResolvedValueOnce(reply('research', [{ uri: 'https://example.com/a' }]))
      .mockResolvedValueOnce(reply('intent'))
      .mockResolvedValueOnce(reply('{"headings":[]}'));

    const snap = await run();
    expect(snap.status).toBe('failed');
    expect(snap.error).toContain('no headings');
    // Research and intent survive, so a retry need not repeat them.
    expect(snap.state.research).toBeTruthy();
    expect(snap.state.intent).toBe('intent');
  });

  it('flags a draft that falls well short of the requested length', async () => {
    complete
      .mockResolvedValueOnce(reply('research', [{ uri: 'https://example.com/a' }]))
      .mockResolvedValueOnce(reply('intent'))
      .mockResolvedValueOnce(reply('{"headings":["## One"]}'))
      .mockResolvedValueOnce(reply('# Tiny\n\nToo short.'))
      .mockResolvedValueOnce(reply('{"seoTitle":"T","metaDescription":"D","slug":"t","focusKeyword":"k","keywords":[]}'))
      .mockResolvedValueOnce(reply('{"claims":[]}'));

    const snap = await run();
    expect(snap.state.warnings.some((w) => w.includes('1800-word target'))).toBe(true);
  });
});
