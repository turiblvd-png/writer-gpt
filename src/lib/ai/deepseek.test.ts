import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatProvider } from './gemini';

/** Replays scripted HTTP replies and records each request body. */
function script(replies: { status?: number; body: unknown }[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const r = replies.shift()!;
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
  return bodies;
}

const answer = (content: string, finish = 'stop') => ({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });

afterEach(() => vi.unstubAllGlobals());

describe('DeepSeek provider', () => {
  const ds = () => new OpenAiCompatProvider('deepseek', 'sk-test', 'https://api.example/v1', 'deepseek-flash', 'DEEPSEEK_API_KEY');

  it('never sends a cap too small for thinking plus the answer', async () => {
    const bodies = script([{ body: answer('Hello.') }]);
    await ds().complete({ prompt: 'p', maxOutputTokens: 1500 });
    expect(bodies[0]!.max_tokens).toBeGreaterThanOrEqual(16_384);
  });

  it('asks again with the full allowance when thinking used up the cap', async () => {
    const bodies = script([{ body: { choices: [{ message: { content: '', reasoning_content: 'long thoughts' }, finish_reason: 'length' }] } }, { body: answer('The article.') }]);
    const res = await ds().complete({ prompt: 'p' });
    expect(res.text).toBe('The article.');
    expect(bodies[1]!.max_tokens).toBe(32_768);
  });

  it('turns thinking off for fast prose, and drops the switch if the API refuses it', async () => {
    const bodies = script([{ status: 400, body: '{"error":{"message":"Unknown parameter: thinking"}}' }, { body: answer('Fast.') }]);
    const res = await ds().complete({ prompt: 'p', fast: true });
    expect(res.text).toBe('Fast.');
    expect(bodies[0]!.thinking).toEqual({ type: 'disabled' });
    expect(bodies[1]!.thinking).toBeUndefined();
  });

  it('reports a still-empty answer in words the router retries', async () => {
    script([{ body: answer('') }, { body: answer('') }]);
    await expect(ds().complete({ prompt: 'p' })).rejects.toThrow(/empty answer.*unavailable/);
  });
});
