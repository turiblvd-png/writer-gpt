import { beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.fn();
vi.mock('@/lib/ai', () => ({ complete: (...a: unknown[]) => complete(...a) }));

const { enforceStyle } = await import('./repair');
const { makeClock } = await import('@/lib/pipeline/engine');

const clock = makeClock(new Date('2026-09-27T12:00:00Z'));
const opts = { clock, language: 'English' };

const MACHINE = `# Guide

In today's digital age, this is a game-changer. It is important to note that we must delve into the rich tapestry of options available to everyone.

Furthermore, the platform leverages a robust and seamless approach. Moreover, it plays a crucial role. Additionally, this article will explore the details.`;

const CLEAN = `# Guide

The platform launched in March. Three features shipped with it, and two of those only work on paid plans.

Pricing starts at 19 dollars a month. That covers 25 articles. Going over costs 40 cents each, which adds up faster than most teams expect when they first sign up and start testing it properly.`;

const reply = (text: string) => ({
  text, sources: [], searchQueries: [],
  usage: { input: 10, output: 20, total: 30 }, model: 'test', provider: 'gemini' as const,
});

beforeEach(() => complete.mockReset());

describe('enforceStyle', () => {
  it('leaves clean prose alone and never calls a model', async () => {
    const result = await enforceStyle(CLEAN, opts);

    expect(complete).not.toHaveBeenCalled();
    expect(result.rounds).toBe(0);
    expect(result.markdown).toBe(CLEAN);
    expect(result.after.humanScore).toBeGreaterThanOrEqual(75);
    expect(result.stillFlagged).toBe(false);
  });

  it('repairs machine-sounding prose and reports the improvement', async () => {
    complete.mockResolvedValueOnce(reply(CLEAN));
    const result = await enforceStyle(MACHINE, opts);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.rounds).toBe(1);
    expect(result.markdown).toBe(CLEAN);
    expect(result.after.humanScore).toBeGreaterThan(result.before.humanScore);
    expect(result.stillFlagged).toBe(false);
  });

  it('tells the model exactly which tells to remove', async () => {
    complete.mockResolvedValueOnce(reply(CLEAN));
    await enforceStyle(MACHINE, opts);

    const prompt = complete.mock.calls[0]![1].prompt as string;
    expect(prompt).toMatch(/delve into/i);
    expect(prompt).toMatch(/game-changer/i);
    expect(prompt).toContain('Keep every fact, figure, name and date exactly as written');
  });

  it('keeps the better version when a repair round makes things worse', async () => {
    const worse = `${MACHINE}\n\nFurthermore, we must delve into the tapestry once more.`;
    complete.mockResolvedValueOnce(reply(worse));

    const result = await enforceStyle(MACHINE, opts);

    expect(result.markdown).not.toContain('once more');
    expect(result.after.humanScore).toBe(result.before.humanScore);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('stops after maxRounds rather than looping on stubborn text', async () => {
    complete.mockResolvedValue(reply(MACHINE.replace("In today's digital age, ", '')));
    const result = await enforceStyle(MACHINE, { ...opts, maxRounds: 2 });

    expect(complete.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.rounds).toBeLessThanOrEqual(2);
  });

  it('strips em dashes deterministically before scoring, without a model call', async () => {
    const result = await enforceStyle('# T\n\nThe match, which ran late — nobody minded — finished after ten.', opts);

    expect(result.markdown).not.toMatch(/[—]/);
    expect(result.markdown).toContain('which ran late, nobody minded, finished');
    expect(complete).not.toHaveBeenCalled();
  });

  it('reports stillFlagged when the text cannot be brought up to standard', async () => {
    complete.mockResolvedValue(reply(MACHINE));
    const result = await enforceStyle(MACHINE, { ...opts, maxRounds: 1 });
    expect(result.stillFlagged).toBe(true);
  });
});
