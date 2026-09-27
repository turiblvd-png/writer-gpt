import { beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.fn();
const extractContent = vi.fn();
const saveRewritten = vi.fn((a: Record<string, unknown>) => ({ ...a, id: 'r1', createdAt: 1 }));
const getBrandVoice = vi.fn((_id: string) => null as unknown);

vi.mock('@/lib/ai', () => ({ complete: (...a: unknown[]) => complete(...a) }));
vi.mock('@/lib/semantic/extract', () => ({ extractContent: (u: string) => extractContent(u) }));
vi.mock('./store', () => ({
  saveRewritten: (a: Record<string, unknown>) => saveRewritten(a),
  getBrandVoice: (id: string) => getBrandVoice(id),
}));

const { rewriteFromUrl, RewriteError } = await import('./rewrite');

const SOURCE_TEXT = `The Six Kings Slam is an exhibition tennis tournament staged in Riyadh during Riyadh Season.
Organisers launched the inaugural edition in 2024 to bring the world's best players to Middle Eastern fans.
Because the competition is unsanctioned, players do not earn official ATP Tour ranking points.
Instead, organisers reward participants with guaranteed appearance fees and historic prize money sums.
Jannik Sinner won the 2025 final against Carlos Alcaraz with a scoreline of 6-2, 6-4 on 18 October.`;

const ORIGINAL_REWRITE = `# Riyadh's Six-Man Tennis Showcase

Six players fly into Riyadh each autumn for four days of tennis that counts for nothing and pays enormously.

No ranking points change hands. The ATP has never sanctioned this event, so lifting the trophy leaves a player exactly where they started on paper. What they collect instead is an appearance fee, banked whether they win or lose their first match.

Jannik Sinner took the 2025 title on 18 October, beating Carlos Alcaraz 6-2, 6-4. The first edition ran in 2024, built to put elite tennis in front of a Gulf crowd that rarely sees it live.`;

const reply = (text: string) => ({
  text, sources: [], searchQueries: [],
  usage: { input: 10, output: 20, total: 30 }, model: 'test', provider: 'gemini' as const,
});

const goodSource = () => ({
  url: 'https://example.com/a', domain: 'example.com', text: SOURCE_TEXT,
  words: SOURCE_TEXT.split(/\s+/).length * 4, // long enough to pass the floor
});

/** voice → facts → draft → factcheck */
function scriptHappyPath(draft = ORIGINAL_REWRITE) {
  complete
    .mockResolvedValueOnce(reply('Direct, factual, short sentences.'))
    .mockResolvedValueOnce(reply('Sinner won 2025 final 6-2, 6-4 on 18 October.\nInaugural edition 2024.\nNo ATP ranking points.'))
    .mockResolvedValueOnce(reply(draft))
    .mockResolvedValueOnce(reply('NONE'));
}

const input = { url: 'https://example.com/a', brandVoiceId: 'auto', targetLanguage: 'same', targetWords: 1000 };

beforeEach(() => {
  complete.mockReset();
  extractContent.mockReset();
  saveRewritten.mockClear();
  getBrandVoice.mockReset().mockReturnValue(null);
  extractContent.mockResolvedValue(goodSource());
});

describe('rewriteFromUrl', () => {
  it('produces an original article and records low similarity', async () => {
    scriptHappyPath();
    const result = await rewriteFromUrl(input);

    expect(result.markdown).toBe(ORIGINAL_REWRITE);
    expect(result.similarityToSource).toBeLessThan(0.1);
    expect(result.factWarnings).toEqual([]);
    expect(result.sourceDomain).toBe('example.com');
  });

  it('works from an extracted fact list rather than the source prose', async () => {
    scriptHappyPath();
    await rewriteFromUrl(input);

    const draftPrompt = complete.mock.calls[2]![1].prompt as string;
    expect(draftPrompt).toContain('FACTS THAT MUST SURVIVE');
    expect(draftPrompt).toContain('Take the facts. Leave the wording.');
    expect(draftPrompt).toContain('OUTRANK THE SOURCES');
  });

  it('retries once when the first attempt paraphrases the source', async () => {
    complete
      .mockResolvedValueOnce(reply('voice'))
      .mockResolvedValueOnce(reply('facts'))
      // Near-verbatim: must be rejected.
      .mockResolvedValueOnce(reply(`# Copy\n\n${SOURCE_TEXT}`))
      .mockResolvedValueOnce(reply(ORIGINAL_REWRITE))
      .mockResolvedValueOnce(reply('NONE'));

    const result = await rewriteFromUrl(input);

    expect(result.markdown).toBe(ORIGINAL_REWRITE);
    expect(result.similarityToSource).toBeLessThan(0.1);

    const retryPrompt = complete.mock.calls[3]![1].prompt as string;
    expect(retryPrompt).toContain('ORIGINALITY PROBLEM WITH YOUR PREVIOUS ATTEMPT');
    expect(retryPrompt).toContain('Start over from the facts');
  });

  it('warns on the saved article when both attempts stay too close', async () => {
    const copy = `# Copy\n\n${SOURCE_TEXT}`;
    complete
      .mockResolvedValueOnce(reply('voice'))
      .mockResolvedValueOnce(reply('facts'))
      .mockResolvedValueOnce(reply(copy))
      .mockResolvedValueOnce(reply(copy))
      .mockResolvedValueOnce(reply('NONE'));

    const result = await rewriteFromUrl(input);
    expect(result.similarityToSource).toBeGreaterThan(0.5);
    expect(result.factWarnings[0]).toMatch(/matches the source/i);
  });

  it('surfaces facts the rewrite dropped', async () => {
    complete
      .mockResolvedValueOnce(reply('voice'))
      .mockResolvedValueOnce(reply('facts'))
      .mockResolvedValueOnce(reply(ORIGINAL_REWRITE))
      .mockResolvedValueOnce(reply('- The 2024 inaugural edition date\n- The prize fund total'));

    const result = await rewriteFromUrl(input);
    expect(result.factWarnings).toEqual(['The 2024 inaugural edition date', 'The prize fund total']);
  });

  it('skips voice inference when a saved brand voice is chosen', async () => {
    getBrandVoice.mockReturnValue({
      id: 'v1', name: 'Plain and direct', description: 'Short sentences, no hype.',
      avoidPhrases: ['revolutionary'], createdAt: 0,
    } as never);

    complete
      .mockResolvedValueOnce(reply('facts'))
      .mockResolvedValueOnce(reply(ORIGINAL_REWRITE))
      .mockResolvedValueOnce(reply('NONE'));

    await rewriteFromUrl({ ...input, brandVoiceId: 'v1' });

    const draftPrompt = complete.mock.calls[1]![1].prompt as string;
    expect(draftPrompt).toContain('BRAND VOICE: Plain and direct');
    expect(draftPrompt).toContain('This brand never uses: revolutionary');
  });

  it('refuses a page that could not be read, before spending a model call', async () => {
    extractContent.mockResolvedValue({ url: 'x', domain: 'x', text: '', words: 0, error: 'Returned HTTP 403.' });
    await expect(rewriteFromUrl(input)).rejects.toThrow(/HTTP 403/);
    expect(complete).not.toHaveBeenCalled();
  });

  it('refuses a page with too little readable text', async () => {
    extractContent.mockResolvedValue({ url: 'x', domain: 'x', text: 'short', words: 30 });
    await expect(rewriteFromUrl(input)).rejects.toThrow(RewriteError);
    expect(complete).not.toHaveBeenCalled();
  });

  it('translates when a target language is chosen', async () => {
    scriptHappyPath();
    const result = await rewriteFromUrl({ ...input, targetLanguage: 'Spanish' });
    expect(result.language).toBe('Spanish');
    expect(complete.mock.calls[0]![1].system).toContain('Spanish');
  });
});
