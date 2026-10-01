import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Scripted providers: behaviour[provider] decides what each call does. */
const behaviour: Record<string, (req: { grounded?: boolean; prompt: string }, model: string) => unknown> = {};
const calls: { provider: string; model: string; key?: string; grounded?: boolean; prompt: string }[] = [];

vi.mock('./gemini', () => {
  const make = (provider: string) =>
    class {
      readonly id = provider;
      constructor(...args: unknown[]) {
        const key = provider === 'gemini' ? args[0] : args[1];
        const model = provider === 'gemini' ? args[1] : args[3];
        if (!key) throw new Error(`No ${provider} API key.`);
        Object.assign(this, { key, model });
      }
      async complete(req: { grounded?: boolean; prompt: string }) {
        const self = this as unknown as { key: string; model: string };
        calls.push({ provider, model: self.model, key: self.key, grounded: req.grounded, prompt: req.prompt });
        const r = (behaviour[provider] ?? (() => 'ok'))(req, self.model);
        if (r instanceof Error) throw r;
        return { text: String(r), sources: [], searchQueries: [], usage: { input: 10, output: 20, total: 30 }, model: self.model, provider };
      }
    };
  return {
    GeminiProvider: make('gemini'),
    OpenAiCompatProvider: class {
      private inner: { complete: (r: unknown) => Promise<unknown> };
      constructor(id: string, key: string, base: string, model: string) {
        const C = make(id);
        this.inner = new C(undefined, key, base, model) as never;
      }
      complete(r: unknown) {
        return this.inner.complete(r);
      }
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  for (const k of Object.keys(behaviour)) delete behaviour[k];
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-router-')), 'data.json');
  process.env.APP_PASSWORD = 'secret-for-tests';
  for (const k of ['GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'XAI_API_KEY', 'MODEL_DRAFT']) delete process.env[k];
});

describe('AI router', () => {
  it('uses dashboard keys and models over environment variables', async () => {
    process.env.GEMINI_API_KEY = 'env-gemini';
    process.env.MODEL_DRAFT = 'gemini:gemini-2.5-pro';
    const { updateAiSettings, getAiSettings } = await import('@/lib/platform/settings');
    await updateAiSettings({ keys: { deepseek: 'ds-key-1234' }, roles: { draft: { provider: 'deepseek', model: 'deepseek-flash' } } });
    expect(JSON.stringify(await getAiSettings())).not.toContain('ds-key-1234');

    const { complete } = await import('./index');
    const res = await complete('draft', { prompt: 'write' });
    expect(res.provider).toBe('deepseek');
    expect(calls[0]).toMatchObject({ provider: 'deepseek', model: 'deepseek-flash', key: 'ds-key-1234' });

    await complete('reason', { prompt: 'plan' });
    expect(calls[1]).toMatchObject({ provider: 'gemini', key: 'env-gemini' });
  });

  it('falls back in the saved order when the chosen provider fails', async () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.DEEPSEEK_API_KEY = 'd';
    process.env.XAI_API_KEY = 'x';
    behaviour.gemini = () => new Error('Google rejected the Gemini API key.');
    const { updateAiSettings } = await import('@/lib/platform/settings');
    await updateAiSettings({ fallbackOrder: ['grok', 'deepseek', 'gemini'] });
    const { complete } = await import('./index');

    const res = await complete('draft', { prompt: 'write' });
    expect(res.provider).toBe('grok');
    expect(calls.map((c) => c.provider)).toEqual(['gemini', 'grok']);
  });

  it('hands a search step to the next provider without search, unless told to stop', async () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.DEEPSEEK_API_KEY = 'd';
    behaviour.gemini = () => new Error('Gemini rate limit or quota reached.');
    const { complete } = await import('./index');
    const res = await complete('research', { prompt: 'research', grounded: true }, { retries: 0 });
    expect(res.provider).toBe('deepseek');
    const last = calls.at(-1)!;
    expect(last.grounded).toBe(false);
    expect(last.prompt).toMatch(/live web search is unavailable/);

    const { updateAiSettings } = await import('@/lib/platform/settings');
    await updateAiSettings({ strictSearch: true });
    calls.length = 0;
    await expect(complete('research', { prompt: 'research', grounded: true }, { retries: 0 })).rejects.toThrow(/set to stop/);
    expect(calls.map((c) => c.provider)).toEqual(['gemini']);
  });

  it('shows customers a friendly message and the developer the real reason', async () => {
    process.env.GEMINI_API_KEY = 'g';
    behaviour.gemini = () => new Error("Gemini's per-minute limit was reached for gemini-2.5-flash-lite.");
    const { complete, CUSTOMER_AI_ERROR } = await import('./index');
    const { runAs } = await import('@/lib/auth/actor');
    const customer = { id: 'c1', email: 'c@x.co', role: 'subscriber' as const };
    const dev = { id: 'd1', email: 'turi.ishtiaq@gmail.com', role: 'owner' as const };
    await expect(runAs(customer, () => complete('draft', { prompt: 'x' }, { retries: 0 }))).rejects.toThrow(CUSTOMER_AI_ERROR);
    await expect(runAs(dev, () => complete('draft', { prompt: 'x' }, { retries: 0 }))).rejects.toThrow(/per-minute limit/);
    const { listActivity } = await import('@/lib/activity/log');
    const failed = (await listActivity({ ok: false })).find((e) => e.userId === 'c1');
    expect(failed?.error).toMatch(/per-minute limit/);
  });

  it('records usage against the signed-in user', async () => {
    process.env.GEMINI_API_KEY = 'g';
    const { complete } = await import('./index');
    const { runAs } = await import('@/lib/auth/actor');
    const { usageFor } = await import('@/lib/usage/meter');
    await runAs({ id: 'u1', email: 'u@x.co', role: 'subscriber' }, () => complete('draft', { prompt: 'a' }));
    await runAs({ id: 'u1', email: 'u@x.co', role: 'subscriber' }, () => complete('draft', { prompt: 'b' }));
    const u = await usageFor('u1');
    expect(u).toMatchObject({ requests: 2, input: 20, output: 40 });
    expect(u!.costUsd).toBeGreaterThan(0);
  });

  it('says plainly when no provider is connected', async () => {
    const { aiReady, complete } = await import('./index');
    expect(await aiReady()).toBe(false);
    await expect(complete('draft', { prompt: 'x' })).rejects.toThrow(/No gemini API key/);
  });
});

describe('limits and activity', () => {
  it('stops a subscriber at their monthly allowance, but never the developer', async () => {
    process.env.GEMINI_API_KEY = 'g';
    const { signUp, updateUser } = await import('@/lib/auth/users');
    const { updateLimits } = await import('@/lib/usage/limits');
    const { runAs } = await import('@/lib/auth/actor');
    const { complete } = await import('./index');
    const sub = await signUp({ email: 'reader@example.com', password: 'longenough' });
    await updateLimits({ plans: { free: 2, pro: 10, business: null } });
    const asSub = { id: sub.id, email: sub.email, role: 'subscriber' as const };

    await runAs(asSub, () => complete('draft', { prompt: '1' }));
    await runAs(asSub, () => complete('draft', { prompt: '2' }));
    await expect(runAs(asSub, () => complete('draft', { prompt: '3' }))).rejects.toThrow(/used all 2 AI requests/);
    expect(calls).toHaveLength(2);

    // A personal override beats the plan.
    await updateUser(sub.id, { requestLimit: 5 });
    await runAs(asSub, () => complete('draft', { prompt: '4' }));

    const owner = { id: 'owner-id', email: 'turi.ishtiaq@gmail.com', role: 'owner' as const };
    await updateLimits({ budgetUsd: 0 });
    await runAs(owner, () => complete('draft', { prompt: 'owner is never limited' }));
    await expect(runAs(asSub, () => complete('draft', { prompt: 'over budget' }))).rejects.toThrow(/AI budget/);
  });

  it('logs every request with who, model, tokens, cost and result', async () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.DEEPSEEK_API_KEY = 'd';
    behaviour.gemini = () => new Error('Google rejected the Gemini API key.');
    const { runAs } = await import('@/lib/auth/actor');
    const { complete } = await import('./index');
    const { listActivity } = await import('@/lib/activity/log');
    const me = { id: 'u9', email: 'me@x.co', role: 'owner' as const };
    await runAs(me, () => complete('draft', { prompt: 'x' }, { retries: 0 }));
    behaviour.deepseek = () => new Error('DeepSeek rejected the API key.');
    await expect(runAs(me, () => complete('draft', { prompt: 'y' }, { retries: 0 }))).rejects.toThrow();

    const [failed, ok] = await listActivity({ kind: 'ai' });
    expect(ok).toMatchObject({ ok: true, userId: 'u9', email: 'me@x.co', provider: 'deepseek', fallbackFrom: 'gemini:gemini-2.5-flash', input: 10, output: 20, role: 'draft' });
    expect(ok!.costUsd).toBeGreaterThan(0);
    expect(failed).toMatchObject({ ok: false, userId: 'u9' });
    expect(failed!.error).toMatch(/rejected/);
  });
});
