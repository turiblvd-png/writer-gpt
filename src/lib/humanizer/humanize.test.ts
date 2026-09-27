import { beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.fn();
const saveHumanized = vi.fn((a: Record<string, unknown>) => ({ ...a, id: 'h1', createdAt: 1 }));
vi.mock('@/lib/ai', () => ({ complete: (...a: unknown[]) => complete(...a) }));
vi.mock('./store', () => ({ saveHumanized: (a: Record<string, unknown>) => saveHumanized(a) }));

const { humanize, detectLanguage, HumanizeError } = await import('./humanize');
const { creditsFor } = await import('./types');

const reply = (text: string) => ({
  text, sources: [], searchQueries: [],
  usage: { input: 10, output: 20, total: 30 }, model: 'test', provider: 'gemini' as const,
});

const MACHINE = `# The Six Kings Slam

In today's digital age, the Six Kings Slam has become a game-changer. It is important to note that we must delve into the rich tapestry of this event.

Furthermore, the tournament leverages a robust format. Moreover, it offers a seamless experience. Additionally, this article will explore the prize fund of 6 million dollars awarded on 18 October 2025.`;

const HUMAN = `# The Six Kings Slam

Six players. Four days. A prize fund of 6 million dollars, handed over on 18 October 2025.

The format skips the usual seeding drama. Two players go straight to the semifinals, which annoys purists and makes for better television, and the rest fight it out from the quarterfinals.`;

beforeEach(() => { complete.mockReset(); saveHumanized.mockClear(); });

describe('humanize', () => {
  const base = { text: MACHINE, mode: 'medium' as const, language: 'auto' };

  it('rewrites and reports the score improvement', async () => {
    complete.mockResolvedValueOnce(reply(HUMAN));
    const result = await humanize(base);

    expect(result.humanizedText).toBe(HUMAN);
    expect(result.scoreAfter).toBeGreaterThan(result.scoreBefore);
    expect(result.tellsBefore.join(' ')).toMatch(/delve/i);
    expect(result.tellsAfter).toEqual([]);
  });

  it('tells the model which specific tells this text contains', async () => {
    complete.mockResolvedValueOnce(reply(HUMAN));
    await humanize(base);

    const prompt = complete.mock.calls[0]![1].prompt as string;
    expect(prompt).toMatch(/delve into/i);
    expect(prompt).toMatch(/game-changer/i);
    expect(prompt).toContain('Preserve every fact exactly');
  });

  it('sends a harder instruction for High than for Mini', async () => {
    complete.mockResolvedValue(reply(HUMAN));
    await humanize({ ...base, mode: 'mini' });
    const mini = complete.mock.calls[0]![1].prompt as string;

    complete.mockClear();
    await humanize({ ...base, mode: 'high' });
    const high = complete.mock.calls[0]![1].prompt as string;

    expect(mini).toContain('Keep sentence structure largely intact');
    expect(high).toContain('Restructure freely');
  });

  it('strips em dashes the model left behind without another call', async () => {
    complete.mockResolvedValueOnce(reply(HUMAN.replace('Four days.', 'Four days — long ones.')));
    const result = await humanize(base);

    expect(result.humanizedText).not.toMatch(/—/);
    expect(result.humanizedText).toContain('Four days, long ones.');
  });

  it('rejects text below the minimum length before spending a call', async () => {
    await expect(humanize({ ...base, text: 'Too short by far.' })).rejects.toThrow(HumanizeError);
    expect(complete).not.toHaveBeenCalled();
  });

  it('rejects text above the maximum length', async () => {
    const huge = Array.from({ length: 12100 }, () => 'word').join(' ');
    await expect(humanize({ ...base, text: huge })).rejects.toThrow(/12,000 words/);
    expect(complete).not.toHaveBeenCalled();
  });

  it('runs a second pass when the first rewrite misses the mode threshold', async () => {
    complete
      .mockResolvedValueOnce(reply(MACHINE.replace("In today's digital age, ", '')))
      .mockResolvedValueOnce(reply(HUMAN));

    const result = await humanize({ ...base, mode: 'high' });
    expect(complete.mock.calls.length).toBeGreaterThan(1);
    expect(result.scoreAfter).toBeGreaterThan(result.scoreBefore);
  });

  it('uses an explicit language over detection', async () => {
    complete.mockResolvedValueOnce(reply(HUMAN));
    const result = await humanize({ ...base, language: 'German' });
    expect(result.language).toBe('German');
    expect(complete.mock.calls[0]![1].system).toContain('German');
  });

  it('derives a title from the first heading when none is given', async () => {
    complete.mockResolvedValueOnce(reply(HUMAN));
    expect((await humanize(base)).title).toBe('The Six Kings Slam');
  });

  it('throws rather than saving when the model returns nothing', async () => {
    complete.mockResolvedValueOnce(reply('   '));
    await expect(humanize(base)).rejects.toThrow(/returned nothing/i);
    expect(saveHumanized).not.toHaveBeenCalled();
  });
});

describe('detectLanguage', () => {
  it('identifies the language from stop words', () => {
    expect(detectLanguage('The tournament that we have seen, and which about would from this')).toBe('English');
    expect(detectLanguage('El torneo que para como pero porque también más está son del')).toBe('Spanish');
    expect(detectLanguage('Das Turnier und der die das nicht sich auch eine werden kann')).toBe('German');
  });

  it('falls back to English on an unrecognisable sample', () => {
    expect(detectLanguage('xxxx yyyy zzzz')).toBe('English');
  });
});

describe('creditsFor', () => {
  it('scales with word count and mode multiplier', () => {
    expect(creditsFor(1000, 'mini')).toBe(10);
    expect(creditsFor(1000, 'medium')).toBe(15);
    expect(creditsFor(1000, 'high')).toBe(20);
  });
});
