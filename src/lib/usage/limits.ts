import { collection } from '@/lib/db/engine';
import { currentActor } from '@/lib/auth/actor';
import { getUser, type Plan } from '@/lib/auth/users';
import { usageFor, usageForMonth } from './meter';

/**
 * Spending controls set in the developer dashboard:
 *
 * - a monthly allowance of AI requests per plan (null = unlimited),
 * - a per-subscriber override of that allowance,
 * - a site-wide monthly AI budget in US dollars, after which only admins can
 *   keep generating.
 *
 * Checked before every AI request. The developer and admins are never limited.
 * A full article is roughly 6 to 10 requests (research, intent, outline,
 * draft, metadata, fact check, plus style repairs).
 */

export interface Limits {
  plans: Record<Plan, number | null>;
  budgetUsd: number | null;
}

export const DEFAULT_LIMITS: Limits = { plans: { free: 100, pro: 2000, business: null }, budgetUsd: null };

const settings = collection<{ id: string; value: Limits; updatedAt: number }>('settings', { global: true });
let cache: { at: number; value: Limits } | null = null;

export async function getLimits(): Promise<Limits> {
  if (cache && Date.now() - cache.at < 15_000) return cache.value;
  let value = DEFAULT_LIMITS;
  try {
    const doc = await settings.get('limits');
    if (doc?.value) value = { plans: { ...DEFAULT_LIMITS.plans, ...doc.value.plans }, budgetUsd: doc.value.budgetUsd ?? null };
  } catch {
    // Unreadable settings must not block anyone; defaults apply.
  }
  cache = { at: Date.now(), value };
  return value;
}

const cleanLimit = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function updateLimits(patch: Partial<Limits>): Promise<Limits> {
  const current = await getLimits();
  const next: Limits = {
    plans: {
      free: patch.plans && 'free' in patch.plans ? cleanLimit(patch.plans.free) : current.plans.free,
      pro: patch.plans && 'pro' in patch.plans ? cleanLimit(patch.plans.pro) : current.plans.pro,
      business: patch.plans && 'business' in patch.plans ? cleanLimit(patch.plans.business) : current.plans.business,
    },
    budgetUsd: 'budgetUsd' in patch ? (patch.budgetUsd === null ? null : Math.max(0, Number(patch.budgetUsd) || 0)) : current.budgetUsd,
  };
  await settings.put({ id: 'limits', value: next, updatedAt: Date.now() });
  cache = { at: Date.now(), value: next };
  return next;
}

export class LimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitReachedError';
  }
}

export interface Allowance {
  used: number;
  limit: number | null;
  source: 'plan' | 'custom' | 'unlimited';
}

/** A user's allowance this month: their own override, else their plan's. */
export async function allowanceFor(userId: string): Promise<Allowance> {
  const user = await getUser(userId);
  const used = (await usageFor(userId))?.requests ?? 0;
  if (!user || user.role === 'owner' || user.role === 'admin') return { used, limit: null, source: 'unlimited' };
  if (user.requestLimit !== undefined && user.requestLimit !== null) return { used, limit: user.requestLimit, source: 'custom' };
  return { used, limit: (await getLimits()).plans[user.plan] ?? null, source: 'plan' };
}

let spend: { at: number; value: number } | null = null;

export async function monthSpendUsd(): Promise<number> {
  if (spend && Date.now() - spend.at < 30_000) return spend.value;
  const value = (await usageForMonth()).reduce((s, d) => s + d.costUsd, 0);
  spend = { at: Date.now(), value };
  return value;
}

/** Throws LimitReachedError when the signed-in subscriber may not make another AI request. */
export async function assertWithinLimits(): Promise<void> {
  const actor = await currentActor();
  if (!actor || actor.role === 'owner' || actor.role === 'admin') return;

  const { used, limit } = await allowanceFor(actor.id);
  if (limit !== null && used >= limit) {
    throw new LimitReachedError(
      `You have used all ${limit.toLocaleString()} AI requests in your plan this month. It resets on the 1st, or ask the site owner to raise your limit.`,
    );
  }
  const { budgetUsd } = await getLimits();
  if (budgetUsd !== null && (await monthSpendUsd()) >= budgetUsd) {
    throw new LimitReachedError('Writer-GPT has reached its AI budget for this month. Please try again later.');
  }
}
