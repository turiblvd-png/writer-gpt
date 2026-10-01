import { createHash } from 'node:crypto';
import { GeminiProvider, OpenAiCompatProvider } from './gemini';
import type { CompletionRequest, CompletionResult, LlmProvider, ProviderId } from './types';
import { apiKeyFor, getAiSettings, PROVIDERS, ROLES, type ModelRole } from '@/lib/platform/settings';
import { estimateCost, recordUsage } from '@/lib/usage/meter';
import { assertWithinLimits } from '@/lib/usage/limits';
import { logActivity } from '@/lib/activity/log';
import { currentActor } from '@/lib/auth/actor';

/**
 * What a customer sees when every provider failed. The technical reason goes
 * to the Activity log and is shown in full only to the developer and admins:
 * provider names, quotas and keys are not the customer's concern.
 */
export const CUSTOMER_AI_ERROR =
  'Our AI is very busy right now and could not finish this step. Please try again in a minute. Your work so far is saved.';

async function forViewer(error: Error): Promise<Error> {
  const actor = await currentActor();
  if (!actor || actor.role === 'owner' || actor.role === 'admin') return error;
  const friendly = new Error(CUSTOMER_AI_ERROR);
  friendly.name = 'AiUnavailableError';
  return friendly;
}

export * from './types';
export type { ModelRole };

/**
 * Steps request a *role*, not a model. Which provider and model serve a role
 * is decided, in order of precedence, by:
 *
 *  1. the developer dashboard (Developer → AI Models),
 *  2. an environment override such as MODEL_DRAFT="deepseek:deepseek-flash",
 *  3. the defaults below.
 *
 * - `research`  needs live grounding and citations (Gemini).
 * - `reason`    planning, outlining, intent analysis.
 * - `draft`     long-form prose. The token-heavy role, so cost matters most.
 * - `structure` JSON extraction (metadata, schema, outlines).
 * - `verify`    re-checks drafted claims against sources. Needs grounding.
 */

export interface RoleBinding {
  provider: ProviderId;
  model: string;
}

/** The model each provider uses for a role when nothing else is chosen. */
export const DEFAULT_MODELS: Record<ProviderId, Record<ModelRole, string>> = {
  gemini: {
    research: 'gemini-2.5-flash',
    reason: 'gemini-2.5-pro',
    draft: 'gemini-2.5-flash',
    structure: 'gemini-2.5-flash',
    verify: 'gemini-2.5-flash',
  },
  deepseek: { research: 'deepseek-flash', reason: 'deepseek-flash', draft: 'deepseek-flash', structure: 'deepseek-flash', verify: 'deepseek-flash' },
  grok: { research: 'grok-4.3', reason: 'grok-4.3', draft: 'grok-4.3', structure: 'grok-4.3', verify: 'grok-4.3' },
};

const ENV_BY_ROLE: Record<ModelRole, string> = {
  research: 'MODEL_RESEARCH',
  reason: 'MODEL_REASON',
  draft: 'MODEL_DRAFT',
  structure: 'MODEL_STRUCTURE',
  verify: 'MODEL_VERIFY',
};

function parseEnvBinding(role: ModelRole): RoleBinding | null {
  const raw = process.env[ENV_BY_ROLE[role]];
  if (!raw) return null;
  const [provider, ...rest] = raw.split(':');
  const model = rest.join(':');
  if (!provider || !model) {
    throw new Error(`${ENV_BY_ROLE[role]}="${raw}" is malformed. Expected "<provider>:<model>", e.g. "gemini:gemini-2.5-flash".`);
  }
  if (!PROVIDERS.includes(provider as ProviderId)) throw new Error(`${ENV_BY_ROLE[role]} names unknown provider "${provider}".`);
  return { provider: provider as ProviderId, model };
}

export type BindingSource = 'dashboard' | 'env' | 'default';

export async function resolveBinding(role: ModelRole): Promise<RoleBinding & { source: BindingSource }> {
  const chosen = (await getAiSettings()).roles[role];
  if (chosen) return { ...chosen, source: 'dashboard' };
  const env = parseEnvBinding(role);
  if (env) return { ...env, source: 'env' };
  return { provider: 'gemini', model: DEFAULT_MODELS.gemini[role], source: 'default' };
}

const cache = new Map<string, LlmProvider>();

export async function buildProvider({ provider, model }: RoleBinding): Promise<LlmProvider> {
  const { key } = await apiKeyFor(provider);
  // Keyed by a hash of the API key too, so a key changed in the dashboard
  // takes effect without a redeploy.
  const cacheKey = `${provider}:${model}:${createHash('sha256').update(key ?? '').digest('hex').slice(0, 12)}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  let built: LlmProvider;
  switch (provider) {
    case 'gemini':
      built = new GeminiProvider(key ?? undefined, model);
      break;
    case 'deepseek':
      built = new OpenAiCompatProvider('deepseek', key ?? undefined, process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1', model, 'DEEPSEEK_API_KEY');
      break;
    case 'grok':
      built = new OpenAiCompatProvider('grok', key ?? undefined, process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1', model, 'XAI_API_KEY');
      break;
  }
  cache.set(cacheKey, built);
  return built;
}

const RETRYABLE = /\b(429|500|502|503|504|overloaded|unavailable|timeout|ECONNRESET|rate.?limit)\b/i;

/** Errors no other provider would fix: the request itself is wrong or was cancelled. */
const REQUEST_FAULT = /cannot combine JSON mode|declined this request under its safety|blocked: /i;

const UNGROUNDED_NOTE =
  'NOTE: live web search is unavailable for this step. Work from what you know, say so where facts may have changed, ' +
  'and do not invent specific dates, prices or figures you are not sure of.\n\n';

async function attempt(binding: RoleBinding, req: CompletionRequest, retries: number): Promise<CompletionResult> {
  const provider = await buildProvider(binding);
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await provider.complete(req);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (req.signal?.aborted) throw err;
      // The provider already stepped down through cheaper models and waited
      // where that helps; hammering an exhausted quota only burns more of it.
      if (err instanceof Error && err.name === 'QuotaExceededError') throw err;
      if (i === retries || !RETRYABLE.test(message)) throw err;
      await sleep(2 ** i * 800 + Math.random() * 400);
    }
  }
  throw lastError;
}

/**
 * Run a completion for a role. Transient failures are retried; a provider that
 * fails outright (bad key, no quota, outage) hands over to the next provider in
 * the dashboard's fallback order, so one broken key does not stop the product.
 */
export interface CompleteOptions {
  retries?: number;
  /**
   * Try this provider first when it has a key, whatever the role's dashboard
   * choice. The others still stand behind it as fallbacks.
   */
  prefer?: ProviderId;
}

export async function complete(role: ModelRole, req: CompletionRequest, opts: CompleteOptions = {}): Promise<CompletionResult> {
  const started = Date.now();
  const retries = opts.retries ?? 3;

  try {
    await assertWithinLimits();
  } catch (err) {
    await logActivity({ kind: 'ai', action: 'ai.blocked', role, ok: false, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const settings = await getAiSettings();
  let primary = await resolveBinding(role);
  if (opts.prefer && primary.provider !== opts.prefer && !req.grounded && (await apiKeyFor(opts.prefer)).key) {
    primary = { provider: opts.prefer, model: await preferredModel(opts.prefer, role, settings), source: 'default' };
  }

  const candidates: { binding: RoleBinding; chosen: boolean }[] = [{ binding: primary, chosen: true }];
  for (const p of settings.fallbackOrder) {
    if (p !== primary.provider && (await apiKeyFor(p)).key) {
      candidates.push({ binding: { provider: p, model: DEFAULT_MODELS[p][role] }, chosen: false });
    }
  }

  const failures: string[] = [];
  let firstError: unknown = null;

  for (const { binding, chosen } of candidates) {
    let request = req;
    if (req.grounded && binding.provider !== 'gemini') {
      // Only Gemini searches the web here. A non-search provider may stand in
      // when the developer picked it for this task, or allowed it as a fallback.
      if (!chosen && settings.strictSearch) {
        failures.push(`${binding.provider}: skipped, search steps are set to stop when Gemini fails (Developer → AI Models)`);
        continue;
      }
      request = { ...req, grounded: false, prompt: UNGROUNDED_NOTE + req.prompt };
    }
    try {
      const result = await attempt(binding, request, chosen ? retries : 1);
      await recordUsage(result.provider, result.model, result.usage);
      const intended = `${primary.provider}:${primary.model}`;
      const used = `${result.provider}:${result.model}`;
      await logActivity({
        kind: 'ai', action: 'ai.request', role, ok: true,
        provider: result.provider, model: result.model,
        ...(used !== intended ? { fallbackFrom: intended } : {}),
        input: result.usage.input, output: result.usage.output,
        costUsd: estimateCost(result.model, result.usage), ms: Date.now() - started,
        ...(request.grounded === false && req.grounded ? { detail: 'ran without live search' } : {}),
      });
      return result;
    } catch (err) {
      if (req.signal?.aborted) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (REQUEST_FAULT.test(message)) {
        await logActivity({ kind: 'ai', action: 'ai.request', role, ok: false, provider: binding.provider, model: binding.model, ms: Date.now() - started, error: message });
        throw err;
      }
      firstError ??= err;
      failures.push(`${binding.provider}: ${message}`);
    }
  }

  const primaryMessage = firstError instanceof Error ? firstError.message : 'The AI request failed.';
  const others = failures.slice(1);
  const error = new Error(others.length ? `${primaryMessage} Fallbacks also failed. ${others.join(' | ')}` : primaryMessage);
  if (firstError instanceof Error) error.name = firstError.name;
  await logActivity({
    kind: 'ai', action: 'ai.request', role, ok: false,
    provider: primary.provider, model: primary.model, ms: Date.now() - started, error: error.message,
  });
  throw await forViewer(error);
}

/** The model a preferred provider uses: the dashboard's pick for that provider if any, else its default. */
async function preferredModel(provider: ProviderId, role: ModelRole, settings: Awaited<ReturnType<typeof getAiSettings>>): Promise<string> {
  const own = settings.roles[role];
  if (own?.provider === provider) return own.model;
  const any = Object.values(settings.roles).find((b) => b?.provider === provider);
  return any?.model ?? DEFAULT_MODELS[provider][role];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Which providers have a key, from the dashboard or the environment. */
export async function configuredProviders(): Promise<Record<ProviderId, boolean>> {
  const out = {} as Record<ProviderId, boolean>;
  for (const p of PROVIDERS) out[p] = Boolean((await apiKeyFor(p)).key);
  return out;
}

/** True when at least one provider can answer. Routes return 503 otherwise. */
export async function aiReady(): Promise<boolean> {
  return Object.values(await configuredProviders()).some(Boolean);
}

export const AI_NOT_READY =
  'No AI provider is connected. Add a Gemini, DeepSeek or Grok API key under Developer → AI Models.';

/** The model each role uses, for the dashboard. Malformed overrides are reported, not thrown. */
export async function roleBindings(): Promise<{ role: ModelRole; binding: string; source: BindingSource | 'error'; error?: string }[]> {
  const out = [];
  for (const role of ROLES) {
    try {
      const b = await resolveBinding(role);
      out.push({ role, binding: `${b.provider}:${b.model}`, source: b.source });
    } catch (err) {
      out.push({ role, binding: process.env[ENV_BY_ROLE[role]] ?? '', source: 'error' as const, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

/**
 * Sends a tiny request straight to one provider and model, with no fallback,
 * so the dashboard can show exactly why a key does or does not work.
 */
export async function testProvider(binding: RoleBinding): Promise<{ ok: boolean; ms: number; reply?: string; model?: string; error?: string; raw?: string }> {
  const started = Date.now();
  try {
    const provider = await buildProvider(binding);
    const res = await provider.complete({ prompt: 'Reply with the single word OK.', temperature: 0, exact: true });
    await logActivity({ kind: 'admin', action: 'admin.ai_test', ok: true, provider: binding.provider, model: res.model, ms: Date.now() - started });
    return { ok: true, ms: Date.now() - started, reply: res.text.trim().slice(0, 80), model: res.model };
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause;
    const raw = String((cause as Error)?.message ?? cause ?? '').slice(0, 600);
    await logActivity({ kind: 'admin', action: 'admin.ai_test', ok: false, provider: binding.provider, model: binding.model, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err), raw: raw || undefined };
  }
}
