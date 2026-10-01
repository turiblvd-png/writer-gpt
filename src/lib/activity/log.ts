import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import { currentActor } from '@/lib/auth/actor';

/**
 * A record of everything that matters on the site: every AI request (who,
 * which tool, provider, model, tokens, cost, time, result), every sign-in and
 * sign-up, and every change made in the developer dashboard.
 *
 * Writing an event never fails the action it describes. Events older than
 * RETENTION_DAYS are pruned now and then, so the table cannot grow forever.
 */

export type ActivityKind = 'ai' | 'auth' | 'admin';

export interface ActivityEvent {
  id: string;
  at: number;
  kind: ActivityKind;
  /** e.g. ai.request, auth.login, auth.login_failed, admin.ai_settings */
  action: string;
  userId: string | null;
  email: string | null;
  /** The tool the request came from, e.g. "Generate Content". */
  tool: string | null;
  ok: boolean;
  role?: string;
  provider?: string;
  model?: string;
  /** Set when another provider or model answered instead of the chosen one. */
  fallbackFrom?: string;
  input?: number;
  output?: number;
  costUsd?: number;
  ms?: number;
  error?: string;
  detail?: string;
}

const log = collection<ActivityEvent>('activity', { global: true });
const RETENTION_DAYS = 90;

/** API path → the tool a person would recognise. */
const TOOLS: [RegExp, string][] = [
  [/^\/api\/generate/, 'Generate Content'],
  [/^\/api\/semantic/, 'Semantic Writer'],
  [/^\/api\/humanizer/, 'Humanizer'],
  [/^\/api\/rewrite/, 'Rewrite from URL'],
  [/^\/api\/autopilot/, 'Autopilot'],
  [/^\/api\/cron\/autopilot/, 'Autopilot (scheduled)'],
  [/^\/api\/copilot/, 'SEO Copilot'],
  [/^\/api\/ai-visibility/, 'AI Visibility'],
  [/^\/api\/keywords/, 'Keyword Research'],
  [/^\/api\/audit/, 'Content Audit'],
  [/^\/api\/social/, 'Social Media Posts'],
  [/^\/api\/admin\/ai/, 'Developer: AI Models'],
  [/^\/api\/admin/, 'Developer dashboard'],
  [/^\/api\/auth/, 'Sign-in'],
];

export function toolForPath(path: string | null): string | null {
  if (!path) return null;
  return TOOLS.find(([re]) => re.test(path))?.[1] ?? path;
}

async function requestPath(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    return (await headers()).get('x-wg-path');
  } catch {
    return null;
  }
}

export type NewEvent = Omit<ActivityEvent, 'id' | 'at' | 'userId' | 'email' | 'tool'> & {
  userId?: string | null;
  email?: string | null;
  tool?: string | null;
};

export async function logActivity(event: NewEvent): Promise<void> {
  try {
    const actor = await currentActor();
    await log.put({
      id: randomUUID(),
      at: Date.now(),
      ...event,
      userId: event.userId !== undefined ? event.userId : actor?.id ?? null,
      email: event.email !== undefined ? event.email : actor?.email ?? null,
      tool: event.tool !== undefined ? event.tool : toolForPath(await requestPath()),
      ...(event.error ? { error: event.error.slice(0, 500) } : {}),
    });
    if (Math.random() < 0.01) await prune();
  } catch {
    // The log must never break the thing it is logging.
  }
}

async function prune(): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  for (const e of await log.all()) if (e.at < cutoff) await log.remove(e.id);
}

export interface ActivityFilter {
  kind?: ActivityKind;
  userId?: string;
  ok?: boolean;
  tool?: string;
  /** Only events before this time, for paging back. */
  before?: number;
  limit?: number;
}

export async function listActivity(filter: ActivityFilter = {}): Promise<ActivityEvent[]> {
  const limit = Math.min(filter.limit ?? 200, 1000);
  // Newest first; read a wide window, then filter, so filters still fill a page.
  const rows = await log.list('at', 5000);
  return rows
    .filter((e) =>
      (!filter.kind || e.kind === filter.kind) &&
      (!filter.userId || e.userId === filter.userId) &&
      (filter.ok === undefined || e.ok === filter.ok) &&
      (!filter.tool || e.tool === filter.tool) &&
      (!filter.before || e.at < filter.before))
    .slice(0, limit);
}
