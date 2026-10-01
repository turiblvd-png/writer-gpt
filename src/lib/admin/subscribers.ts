import { listUsers, type PublicUser } from '@/lib/auth/users';
import { usageForMonth, type UsageDoc } from '@/lib/usage/meter';
import { collection } from '@/lib/db/engine';
import { runAs } from '@/lib/auth/actor';

export interface SubscriberRow extends PublicUser {
  usage: Pick<UsageDoc, 'requests' | 'input' | 'output' | 'costUsd'>;
  articles: number;
}

/** Every account with this month's AI usage and article count, for the dashboard. */
export async function subscriberRows(): Promise<SubscriberRow[]> {
  const [users, usage] = await Promise.all([listUsers(), usageForMonth()]);
  // Counted as the system, which sees every user's articles.
  const articles = await runAs(null, () => collection<{ id: string; ownerId?: string }>('articles').all());
  const owner = users.find((u) => u.role === 'owner');
  const counts = new Map<string, number>();
  for (const a of articles) {
    const id = a.ownerId ?? owner?.id ?? 'system';
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return users.map((u) => {
    const doc = usage.find((d) => d.userId === u.id);
    return {
      ...u,
      usage: { requests: doc?.requests ?? 0, input: doc?.input ?? 0, output: doc?.output ?? 0, costUsd: doc?.costUsd ?? 0 },
      articles: counts.get(u.id) ?? 0,
    };
  });
}

export interface Overview {
  users: number;
  activeThisWeek: number;
  newThisMonth: number;
  byPlan: Record<string, number>;
  requests: number;
  costUsd: number;
  articles: number;
  byProvider: Record<string, { requests: number; costUsd: number }>;
}

export async function overview(): Promise<Overview> {
  const rows = await subscriberRows();
  const usage = await usageForMonth();
  const now = Date.now();
  const monthStart = new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`).getTime();
  const byProvider: Overview['byProvider'] = {};
  for (const doc of usage) {
    for (const [p, v] of Object.entries(doc.byProvider)) {
      const cur = byProvider[p] ?? { requests: 0, costUsd: 0 };
      byProvider[p] = { requests: cur.requests + (v?.requests ?? 0), costUsd: cur.costUsd + (v?.costUsd ?? 0) };
    }
  }
  return {
    users: rows.length,
    activeThisWeek: rows.filter((r) => now - r.lastSeenAt < 7 * 86_400_000).length,
    newThisMonth: rows.filter((r) => r.createdAt >= monthStart).length,
    byPlan: rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.plan]: (acc[r.plan] ?? 0) + 1 }), {}),
    requests: usage.reduce((s, d) => s + d.requests, 0),
    costUsd: usage.reduce((s, d) => s + d.costUsd, 0),
    articles: rows.reduce((s, r) => s + r.articles, 0),
    byProvider,
  };
}
