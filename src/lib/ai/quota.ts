/**
 * Reading Gemini 429s, and remembering which models are out of quota.
 *
 * Quota is per model. A free AI Studio key often has a limit of 0 for the Pro
 * models while Flash still has plenty, so a 429 on Pro says nothing about
 * Flash. The provider uses this to step down a tier instead of failing, and to
 * skip a model it already knows is exhausted rather than spending a request to
 * find out again.
 */

export interface QuotaInfo {
  /** The daily allowance is used up (or is zero); waiting a minute will not help. */
  daily: boolean;
  /** The quota limit Google reported, when it said. 0 means the tier excludes this model. */
  limit: number | null;
  /** How long Google asked us to wait, in ms. */
  retryAfterMs: number | null;
  freeTier: boolean;
}

export function isQuotaError(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string };
  const raw = String(e?.message ?? err);
  return e?.status === 429 || e?.code === 429 || /\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(raw);
}

export function parseQuota(err: unknown): QuotaInfo {
  const raw = String((err as Error)?.message ?? err);

  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(raw) ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(raw);
  const limit = /"quotaValue"\s*:\s*"(\d+)"/.exec(raw) ?? /limit:\s*(\d+)/i.exec(raw);
  const limitValue = limit ? Number(limit[1]) : null;

  return {
    daily: /PerDay/i.test(raw) || limitValue === 0,
    limit: limitValue,
    retryAfterMs: delay ? Math.ceil(Number(delay[1]) * 1000) : null,
    freeTier: /free.?tier/i.test(raw),
  };
}

const exhausted = new Map<string, number>();

/** Remember a model is out of quota until Google says it will be back. */
export function markExhausted(model: string, info: QuotaInfo, now = Date.now()): void {
  const ms = info.daily ? 60 * 60 * 1000 : Math.max(info.retryAfterMs ?? 60_000, 10_000);
  exhausted.set(model, now + ms);
}

export function isExhausted(model: string, now = Date.now()): boolean {
  const until = exhausted.get(model);
  if (until === undefined) return false;
  if (until <= now) {
    exhausted.delete(model);
    return false;
  }
  return true;
}

export function resetQuotaMemory(): void {
  exhausted.clear();
}

/**
 * Models to try, best first. Each step down has a larger free allowance; for
 * planning and drafting, Flash is close to Pro, and far better than an error.
 */
export function fallbackChain(model: string): string[] {
  const chain = [model];
  if (/pro/i.test(model)) chain.push('gemini-2.5-flash', 'gemini-2.5-flash-lite');
  else if (/flash(?!-lite)/i.test(model)) chain.push('gemini-2.5-flash-lite');
  return [...new Set(chain)];
}

/** A plain-language explanation for when every model in the chain is out of quota. */
export function describeQuota(tried: string[], info: QuotaInfo): string {
  const models = tried.join(', ');
  if (info.limit === 0) {
    return `Your Gemini API key has no quota for ${models} (Google set the limit to 0, which is common on free keys). ` +
      'Turn on billing for the key\'s Google Cloud project in Google AI Studio to lift the limits.';
  }
  if (info.daily) {
    return `Today's Gemini quota for ${models} is used up. It resets at midnight Pacific time, ` +
      'or turn on billing for the key\'s Google project in Google AI Studio to raise it.';
  }
  const wait = info.retryAfterMs ? `${Math.ceil(info.retryAfterMs / 1000)} seconds` : 'a minute';
  return `Gemini's per-minute limit was reached for ${models}. Wait ${wait} and click again.`;
}
