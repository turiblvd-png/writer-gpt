import { beforeEach, describe, expect, it, vi } from 'vitest';

// The shape Google returns for a free key with no Pro allowance.
const PRO_ZERO = JSON.stringify({ error: {
  code: 429, status: 'RESOURCE_EXHAUSTED',
  message: 'You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.5-pro\nPlease retry in 34.5s.',
  details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '0' }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34s' },
  ],
} });
const PER_MINUTE = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded', details: [
  { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaValue: '10' }] },
  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1s' },
] } });

const apiError = (message: string, status: number) => Object.assign(new Error(message), { status });

describe('quota parsing', () => {
  it('reads limit, daily scope and retry delay', async () => {
    const { parseQuota, isQuotaError, describeQuota } = await import('./quota');
    const err = apiError(PRO_ZERO, 429);
    expect(isQuotaError(err)).toBe(true);
    const info = parseQuota(err);
    expect(info).toMatchObject({ daily: true, limit: 0, retryAfterMs: 34_000, freeTier: true });
    expect(describeQuota(['gemini-2.5-pro'], info)).toMatch(/limit to 0/);
    expect(parseQuota(apiError(PER_MINUTE, 429))).toMatchObject({ daily: false, limit: 10, retryAfterMs: 1000 });
  });

  it('steps down a tier at a time', async () => {
    const { fallbackChain } = await import('./quota');
    expect(fallbackChain('gemini-2.5-pro')).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    expect(fallbackChain('gemini-2.5-flash')).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    expect(fallbackChain('gemini-2.5-flash-lite')).toEqual(['gemini-2.5-flash-lite']);
  });
});

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: (...a: unknown[]) => generateContent(...a), list: async () => [] }; },
}));
const ok = (text: string) => ({ text, candidates: [{}], usageMetadata: {} });

describe('Gemini provider under quota pressure', () => {
  beforeEach(async () => {
    vi.resetModules();
    generateContent.mockReset();
  });

  it('answers with Flash when Pro has no quota, and stops asking Pro', async () => {
    generateContent.mockImplementation(async ({ model }: { model: string }) => {
      if (model === 'gemini-2.5-pro') throw apiError(PRO_ZERO, 429);
      return ok(`from ${model}`);
    });
    const { GeminiProvider } = await import('./gemini');
    const p = new GeminiProvider('key', 'gemini-2.5-pro');
    expect((await p.complete({ prompt: 'x' })).model).toBe('gemini-2.5-flash');
    await p.complete({ prompt: 'y' });
    const models = generateContent.mock.calls.map((c) => c[0].model);
    expect(models).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash']);
  });

  it('explains plainly, and is not retried, when every model is exhausted', async () => {
    generateContent.mockRejectedValue(apiError(PRO_ZERO, 429));
    const { GeminiProvider } = await import('./gemini');
    const err = await new GeminiProvider('key', 'gemini-2.5-pro').complete({ prompt: 'x' }).catch((e) => e);
    expect(err.name).toBe('QuotaExceededError');
    expect(err.message).toMatch(/gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite/);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it('waits out a short per-minute limit once', async () => {
    let calls = 0;
    generateContent.mockImplementation(async () => {
      calls += 1;
      if (calls <= 2) throw apiError(PER_MINUTE, 429);
      return ok('after waiting');
    });
    const { GeminiProvider } = await import('./gemini');
    const res = await new GeminiProvider('key', 'gemini-2.5-flash').complete({ prompt: 'x' });
    expect(res.text).toBe('after waiting');
  });

  it('does not touch other errors', async () => {
    generateContent.mockRejectedValue(apiError('API key not valid. API_KEY_INVALID', 400));
    const { GeminiProvider } = await import('./gemini');
    const err = await new GeminiProvider('key', 'gemini-2.5-pro').complete({ prompt: 'x' }).catch((e) => e);
    expect(err.message).toMatch(/rejected/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
