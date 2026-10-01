import { collection } from '@/lib/db/engine';
import { currentActor } from '@/lib/auth/actor';
import type { ProviderId, TokenUsage } from '@/lib/ai/types';

/**
 * Per-user AI usage, one document per user per month, so the developer
 * dashboard can show what each subscriber uses and roughly what it costs.
 */

export interface UsageDoc {
  id: string;
  userId: string;
  month: string;
  requests: number;
  input: number;
  output: number;
  costUsd: number;
  byProvider: Partial<Record<ProviderId, { requests: number; input: number; output: number; costUsd: number }>>;
  updatedAt: number;
}

const usage = collection<UsageDoc>('usage', { global: true });

/**
 * USD per 1M tokens [input, output], standard rates as published in 2026.
 * An estimate for the dashboard, not a bill: thinking tokens, caching and
 * off-peak discounts all move the real figure.
 */
const PRICES: { match: RegExp; price: [number, number] }[] = [
  { match: /gemini.*flash-lite/i, price: [0.1, 0.4] },
  { match: /gemini.*flash/i, price: [0.3, 2.5] },
  { match: /gemini.*pro/i, price: [1.25, 10] },
  { match: /deepseek.*pro/i, price: [1.32, 3.96] },
  { match: /deepseek/i, price: [0.3, 1.2] },
  { match: /grok-4\.(3|20)/i, price: [1.25, 2.5] },
  { match: /grok-build/i, price: [1, 2] },
  { match: /grok/i, price: [2, 6] },
];

export function estimateCost(model: string, tokens: TokenUsage): number {
  const price = PRICES.find((p) => p.match.test(model))?.price ?? [1, 4];
  return (tokens.input * price[0] + tokens.output * price[1]) / 1_000_000;
}

export function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function recordUsage(provider: ProviderId, model: string, tokens: TokenUsage): Promise<void> {
  const actor = await currentActor();
  const userId = actor?.id ?? 'system';
  const month = monthKey();
  const id = `${userId}:${month}`;
  const cost = estimateCost(model, tokens);
  const add = (doc: UsageDoc): UsageDoc => {
    const p = doc.byProvider[provider] ?? { requests: 0, input: 0, output: 0, costUsd: 0 };
    return {
      ...doc,
      requests: doc.requests + 1,
      input: doc.input + tokens.input,
      output: doc.output + tokens.output,
      costUsd: doc.costUsd + cost,
      byProvider: {
        ...doc.byProvider,
        [provider]: { requests: p.requests + 1, input: p.input + tokens.input, output: p.output + tokens.output, costUsd: p.costUsd + cost },
      },
      updatedAt: Date.now(),
    };
  };
  try {
    const updated = await usage.mutate(id, add);
    if (!updated) {
      await usage.put(add({ id, userId, month, requests: 0, input: 0, output: 0, costUsd: 0, byProvider: {}, updatedAt: 0 }));
    }
  } catch {
    // Metering must never fail the user's request.
  }
}

export async function usageForMonth(month = monthKey()): Promise<UsageDoc[]> {
  return (await usage.all()).filter((u) => u.month === month);
}

export async function usageFor(userId: string, month = monthKey()): Promise<UsageDoc | null> {
  return usage.get(`${userId}:${month}`);
}
