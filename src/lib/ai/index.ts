import { GeminiProvider, OpenAiCompatProvider } from './gemini';
import type { CompletionRequest, CompletionResult, LlmProvider, ProviderId } from './types';

export * from './types';

/**
 * Steps request a *role*, not a model. Roles are mapped to concrete models here,
 * so tuning cost/quality across the whole pipeline is a single-file change.
 *
 * - `research`  needs live grounding and citations. Must be a grounding provider.
 * - `reason`    planning, outlining, intent analysis. Quality over cost.
 * - `draft`     long-form prose. The token-heavy role, so cost matters most.
 * - `structure` JSON extraction (metadata, schema, outlines). Cheap and strict.
 * - `verify`    re-checks drafted claims against sources. Needs grounding.
 */
export type ModelRole = 'research' | 'reason' | 'draft' | 'structure' | 'verify';

interface RoleBinding {
  provider: ProviderId;
  model: string;
}

/**
 * Model IDs move fast. Override any role with an env var rather than editing
 * code, e.g. MODEL_DRAFT="deepseek:deepseek-chat".
 */
const DEFAULT_BINDINGS: Record<ModelRole, RoleBinding> = {
  research: { provider: 'gemini', model: 'gemini-2.5-flash' },
  reason: { provider: 'gemini', model: 'gemini-2.5-pro' },
  draft: { provider: 'gemini', model: 'gemini-2.5-flash' },
  structure: { provider: 'gemini', model: 'gemini-2.5-flash' },
  verify: { provider: 'gemini', model: 'gemini-2.5-flash' },
};

const ENV_BY_ROLE: Record<ModelRole, string> = {
  research: 'MODEL_RESEARCH',
  reason: 'MODEL_REASON',
  draft: 'MODEL_DRAFT',
  structure: 'MODEL_STRUCTURE',
  verify: 'MODEL_VERIFY',
};

function resolveBinding(role: ModelRole): RoleBinding {
  const raw = process.env[ENV_BY_ROLE[role]];
  if (!raw) return DEFAULT_BINDINGS[role];

  const [provider, ...rest] = raw.split(':');
  const model = rest.join(':');
  if (!provider || !model) {
    throw new Error(
      `${ENV_BY_ROLE[role]}="${raw}" is malformed. Expected "<provider>:<model>", e.g. "gemini:gemini-2.5-flash".`,
    );
  }
  if (provider !== 'gemini' && provider !== 'deepseek' && provider !== 'grok') {
    throw new Error(`${ENV_BY_ROLE[role]} names unknown provider "${provider}".`);
  }
  return { provider, model };
}

const cache = new Map<string, LlmProvider>();

function buildProvider({ provider, model }: RoleBinding): LlmProvider {
  const key = `${provider}:${model}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let built: LlmProvider;
  switch (provider) {
    case 'gemini':
      built = new GeminiProvider(process.env.GEMINI_API_KEY, model);
      break;
    case 'deepseek':
      built = new OpenAiCompatProvider(
        'deepseek',
        process.env.DEEPSEEK_API_KEY,
        process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
        model,
        'DEEPSEEK_API_KEY',
      );
      break;
    case 'grok':
      built = new OpenAiCompatProvider(
        'grok',
        process.env.XAI_API_KEY,
        process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1',
        model,
        'XAI_API_KEY',
      );
      break;
  }
  cache.set(key, built);
  return built;
}

export function providerFor(role: ModelRole): LlmProvider {
  return buildProvider(resolveBinding(role));
}

const RETRYABLE = /\b(429|500|502|503|504|overloaded|unavailable|timeout|ECONNRESET|rate.?limit)\b/i;

/**
 * Run a completion for a role, retrying transient upstream failures with
 * exponential backoff. A generation run is long and expensive; losing one at
 * step 11 to a transient 503 is the worst possible outcome.
 */
export async function complete(
  role: ModelRole,
  req: CompletionRequest,
  opts: { retries?: number } = {},
): Promise<CompletionResult> {
  const retries = opts.retries ?? 3;
  const provider = providerFor(role);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await provider.complete(req);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      // An aborted run and a misconfigured request will never succeed on retry.
      if (req.signal?.aborted) throw err;
      if (attempt === retries || !RETRYABLE.test(message)) throw err;
      await sleep(2 ** attempt * 800 + Math.random() * 400);
    }
  }
  throw lastError;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Which providers have credentials present. Drives the Model Hub UI. */
export function configuredProviders(): Record<ProviderId, boolean> {
  return {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    grok: Boolean(process.env.XAI_API_KEY),
  };
}

/** The model each role uses, for the Account page. Malformed overrides are reported, not thrown. */
export function roleBindings(): { role: ModelRole; binding: string; overridden: boolean; error?: string }[] {
  return (Object.keys(DEFAULT_BINDINGS) as ModelRole[]).map((role) => {
    const overridden = Boolean(process.env[ENV_BY_ROLE[role]]);
    try {
      const b = resolveBinding(role);
      return { role, binding: `${b.provider}:${b.model}`, overridden };
    } catch (err) {
      return { role, binding: process.env[ENV_BY_ROLE[role]] ?? '', overridden, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
