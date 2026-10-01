import { GoogleGenAI } from '@google/genai';
import { pickModel, tierOf } from './models';
import { describeQuota, fallbackChain, isExhausted, isQuotaError, markExhausted, parseQuota, type QuotaInfo } from './quota';
import {
  GroundingUnsupportedError,
  ProviderNotConfiguredError,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  type Source,
} from './types';

/**
 * Gemini adapter. Chosen as the default because `googleSearch` grounding returns
 * real citations, which is what lets the pipeline verify claims instead of
 * trusting the model's memory.
 */
export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini' as const;
  readonly supportsGrounding = true;
  readonly supportsUrlContext = true;

  private client: GoogleGenAI;
  /** The model actually used, once discovery has confirmed it exists. */
  private resolved: string | null = null;

  constructor(
    apiKey: string | undefined,
    private model: string,
  ) {
    if (!apiKey) throw new ProviderNotConfiguredError('gemini', 'GEMINI_API_KEY');
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        // Optional gateway or proxy in front of the Gemini API.
        ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}),
        // One hung call must not consume the whole request's time budget; the
        // retry wrapper gets a chance instead.
        timeout: Number(process.env.GEMINI_TIMEOUT_MS) || 120_000,
      },
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const primary = this.resolved ?? this.model;
    const chain = req.exact ? [primary] : fallbackChain(primary);
    // Skip models already known to be out of quota; if every one is, still try
    // the smallest, since its limit may have reset.
    const order = chain.filter((m) => !isExhausted(m));
    if (!order.length) order.push(chain[chain.length - 1]!);

    const tried: string[] = [];
    let quota: QuotaInfo | null = null;

    for (const model of order) {
      try {
        const result = await this.callResolving(model, req, model === primary);
        if (result.model !== primary) console.warn(`[gemini] ${primary} could not answer; answered with ${result.model}.`);
        return result;
      } catch (err) {
        if (isQuotaError(err)) {
          quota = parseQuota(err);
          markExhausted(model, quota);
          tried.push(model);
          continue;
        }
        // A fallback that does not exist for this key is skipped, not fatal.
        if (model !== primary && isModelNotFound(err)) continue;
        throw explainGeminiError(err, model);
      }
    }

    // A per-minute limit with a short wait: wait once instead of failing.
    if (quota && !quota.daily && quota.retryAfterMs !== null && quota.retryAfterMs <= 20_000 && !req.signal?.aborted) {
      await new Promise((r) => setTimeout(r, quota!.retryAfterMs! + 500));
      try {
        return await this.callResolving(order[0]!, req, order[0] === primary);
      } catch (err) {
        if (!isQuotaError(err)) throw explainGeminiError(err, order[0]!);
        quota = parseQuota(err);
      }
    }

    throw new QuotaExceededError(describeQuota(tried.length ? tried : order, quota ?? parseQuota('')));
  }

  /** Calls a model; for the primary, swaps in a live replacement if the ID was retired. */
  private async callResolving(model: string, req: CompletionRequest, isPrimary: boolean): Promise<CompletionResult> {
    const target = replacements.get(model) ?? model;
    try {
      return await this.call(target, req);
    } catch (err) {
      // A retired model ID returns NOT_FOUND on every call, and Google also
      // withdraws older models from new keys. Rather than fail, find the best
      // live model of the same family this key can use, and remember it.
      if (!isModelNotFound(err)) throw err;
      const replacement = await discoverModel(this.client, tierOf(model));
      if (!replacement || replacement === target) throw err;
      replacements.set(model, replacement);
      if (isPrimary) this.resolved = replacement;
      console.warn(`[gemini] "${model}" is unavailable to this key, using "${replacement}" instead.`);
      return await this.call(replacement, req);
    }
  }


  private async call(model: string, req: CompletionRequest): Promise<CompletionResult> {
    // Gemini rejects responseMimeType=json together with search tools. Rather
    // than silently dropping one, surface it: the caller should split the step.
    if (req.json && req.grounded) {
      throw new Error(
        'Gemini cannot combine JSON mode with search grounding. ' +
          'Split into a grounded research step and a JSON structuring step.',
      );
    }

    const tools = [];
    if (req.grounded) tools.push({ googleSearch: {} });
    if (req.readUrls?.length) tools.push({ urlContext: {} });

    const prompt = req.readUrls?.length
      ? `${req.prompt}\n\nRead these URLs directly:\n${req.readUrls.map((u) => `- ${u}`).join('\n')}`
      : req.prompt;

    const res = await this.client.models.generateContent({
      model,
      contents: prompt,
      config: {
        ...(req.system ? { systemInstruction: req.system } : {}),
        temperature: req.temperature ?? 0.7,
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
        ...(tools.length ? { tools } : {}),
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
        ...(req.signal ? { abortSignal: req.signal } : {}),
      },
    });

    const text = res.text ?? '';
    if (!text.trim()) {
      const reason = res.promptFeedback?.blockReason;
      throw new Error(
        reason
          ? `Gemini returned no content (blocked: ${reason}).`
          : 'Gemini returned an empty response.',
      );
    }

    const meta = res.candidates?.[0]?.groundingMetadata;
    const sources: Source[] = (meta?.groundingChunks ?? [])
      .map((c) => c.web)
      .filter((w): w is NonNullable<typeof w> => Boolean(w?.uri))
      .map((w) => ({ uri: w.uri!, title: w.title, domain: w.domain }));

    return {
      text,
      sources: dedupeByUri(sources),
      searchQueries: meta?.webSearchQueries ?? [],
      usage: {
        input: res.usageMetadata?.promptTokenCount ?? 0,
        output: res.usageMetadata?.candidatesTokenCount ?? 0,
        total: res.usageMetadata?.totalTokenCount ?? 0,
      },
      model,
      provider: this.id,
    };
  }
}

/** Every model that could answer is out of quota. Retrying immediately cannot help. */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

let discovered: { at: number; names: string[] } | null = null;

/** Retired or withheld model ID → the live model used instead, for this key. */
const replacements = new Map<string, string>();

/** Lists models the key can use, cached for an hour, and picks the best for a tier. */
async function discoverModel(client: GoogleGenAI, tier: 'pro' | 'flash'): Promise<string | null> {
  if (!discovered || Date.now() - discovered.at > 60 * 60 * 1000) {
    const names: string[] = [];
    try {
      const pager = await client.models.list({ config: { pageSize: 200 } });
      for await (const m of pager) {
        if (m.name && (m.supportedActions ?? ['generateContent']).includes('generateContent')) names.push(m.name);
      }
    } catch {
      return null;
    }
    discovered = { at: Date.now(), names };
  }
  return pickModel(discovered.names, tier);
}

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; code?: number };
  if (typeof e?.status === 'number') return e.status;
  if (typeof e?.code === 'number') return e.code;
  const m = /\b(400|401|403|404|429|500|503)\b/.exec(String((err as Error)?.message ?? err));
  return m ? Number(m[1]) : undefined;
}

function isModelNotFound(err: unknown): boolean {
  const text = String((err as Error)?.message ?? err);
  return statusOf(err) === 404 || /NOT_FOUND|is not found|not supported for generateContent/i.test(text);
}

/**
 * Turn SDK failures into messages a non-developer can act on. The raw errors are
 * JSON blobs that, shown in the UI, look like the app itself is broken.
 */
export function explainGeminiError(err: unknown, model: string): Error {
  const raw = String((err as Error)?.message ?? err);
  const status = statusOf(err);

  let message: string;
  if (/expired/i.test(raw) && /key/i.test(raw)) {
    message = 'This Gemini API key has expired. Create a new key in Google AI Studio and paste it under Developer → AI Models.';
  } else if (/API key not valid|API_KEY_INVALID/i.test(raw) || status === 401) {
    message = 'Google rejected the Gemini API key. It may be mistyped, have a space in it, or be deleted. Paste it again under Developer → AI Models.';
  } else if (/referer|referrer/i.test(raw)) {
    message = 'This Gemini key only works from certain websites (an HTTP referrer restriction), so the server cannot use it. In Google Cloud Console → Credentials, set the key\'s application restriction to None.';
  } else if (/IP address|API_KEY_IP_ADDRESS_BLOCKED/i.test(raw)) {
    message = 'This Gemini key is restricted to certain IP addresses. In Google Cloud Console → Credentials, set the key\'s application restriction to None.';
  } else if (/API_KEY_SERVICE_BLOCKED|are blocked/i.test(raw)) {
    message = 'This Gemini key is restricted to other APIs. In Google Cloud Console → Credentials, allow the Generative Language API for this key.';
  } else if (/location is not supported|FAILED_PRECONDITION/i.test(raw)) {
    message = 'Google does not offer the free Gemini API in the server\'s region for this key. Turn on billing for the key\'s project in Google AI Studio.';
  } else if (status === 403 && /PERMISSION_DENIED|has not been used|disabled/i.test(raw)) {
    message = 'This API key is not allowed to use the Gemini API. Enable the Generative Language API for the key\'s Google project, or create the key in Google AI Studio (aistudio.google.com).';
  } else if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    message = 'Gemini rate limit or quota reached. Wait a minute and retry, or raise the quota on the key\'s Google project.';
  } else if (isModelNotFound(err)) {
    message = `The model "${model}" is not available to this API key, and no replacement could be found.`;
  } else if (/SAFETY|blocked/i.test(raw)) {
    message = 'Gemini declined this request under its safety filters. Rephrase the topic and retry.';
  } else if (status === 503 || /overloaded|UNAVAILABLE/i.test(raw)) {
    message = 'Gemini is temporarily overloaded. Retry in a moment.';
  } else {
    return err instanceof Error ? err : new Error(raw);
  }

  const wrapped = new Error(message);
  (wrapped as Error & { cause?: unknown }).cause = err;
  return wrapped;
}

function dedupeByUri(sources: Source[]): Source[] {
  const seen = new Map<string, Source>();
  for (const s of sources) if (!seen.has(s.uri)) seen.set(s.uri, s);
  return [...seen.values()];
}

/** DeepSeek and Grok both speak the OpenAI chat-completions dialect. */
export class OpenAiCompatProvider implements LlmProvider {
  readonly supportsGrounding = false;
  readonly supportsUrlContext = false;

  constructor(
    readonly id: 'deepseek' | 'grok',
    private apiKey: string | undefined,
    private baseUrl: string,
    private model: string,
    private envVar: string,
  ) {
    if (!apiKey) throw new ProviderNotConfiguredError(id, envVar);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (req.grounded) throw new GroundingUnsupportedError(this.id);

    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.prompt },
    ];

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: req.temperature ?? 0.7,
        // DeepSeek's default output cap is small, and its thinking mode spends
        // part of the cap on reasoning, which cut long articles off
        // mid-section. Current models allow up to 384K; 32K leaves room for
        // thinking plus a long draft without inviting runaway bills.
        max_tokens: req.maxOutputTokens ?? (this.id === 'deepseek' ? 32_768 : undefined),
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      // A hung call must not eat the whole request's time budget.
      signal: req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw explainCompatError(this.id, this.model, res.status, body);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new Error(`${this.id} returned an empty response.`);

    return {
      text,
      sources: [],
      searchQueries: [],
      usage: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
        total: data.usage?.total_tokens ?? 0,
      },
      model: this.model,
      provider: this.id,
    };
  }
}

const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 120_000;

/** DeepSeek and xAI errors in words a site owner can act on. */
export function explainCompatError(id: 'deepseek' | 'grok', model: string, status: number, body: string): Error {
  const name = id === 'deepseek' ? 'DeepSeek' : 'Grok';
  let message: string;
  if (status === 401 || (status === 403 && /key|auth/i.test(body))) {
    message = `${name} rejected the API key. Paste it again under Developer → AI Models.`;
  } else if (status === 402 || /insufficient.?balance|credit|billing/i.test(body)) {
    message = `Your ${name} account has no balance left. Top it up on the ${name} platform.`;
  } else if (status === 429) {
    message = `${name} rate limit reached. Wait a minute and retry.`;
  } else if ((status === 400 || status === 404) && /model/i.test(body)) {
    message = `${name} does not recognise the model "${model}". Pick another in Developer → AI Models.`;
  } else if (status >= 500) {
    message = `${name} is having trouble (HTTP ${status}). Retry in a moment.`;
  } else {
    message = `${name} request failed (HTTP ${status}).`;
  }
  const err = new Error(message);
  (err as Error & { cause?: unknown }).cause = new Error(`HTTP ${status}: ${body.slice(0, 400)}`);
  return err;
}
