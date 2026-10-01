import { GoogleGenAI } from '@google/genai';
import { pickModel, tierOf } from './models';
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
    const model = this.resolved ?? this.model;
    try {
      return await this.call(model, req);
    } catch (err) {
      // A retired model ID returns NOT_FOUND on every call. Rather than fail the
      // whole product, find the best live model of the same tier and retry once.
      if (!this.resolved && isModelNotFound(err)) {
        const replacement = await discoverModel(this.client, tierOf(this.model));
        if (replacement && replacement !== model) {
          this.resolved = replacement;
          console.warn(`[gemini] "${model}" is unavailable, using "${replacement}" instead.`);
          return await this.call(replacement, req);
        }
      }
      throw explainGeminiError(err, model);
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

let discovered: { at: number; names: string[] } | null = null;

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
  if (/API key not valid|API_KEY_INVALID/i.test(raw) || status === 401) {
    message = 'The Gemini API key was rejected. Check GEMINI_API_KEY in your hosting environment variables, then redeploy.';
  } else if (status === 403 && /PERMISSION_DENIED|has not been used|disabled/i.test(raw)) {
    message = 'This API key is not allowed to use the Gemini API. Enable the Generative Language API for the key\'s Google project.';
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
        ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : {}),
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: req.signal ?? null,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${this.id} request failed (${res.status}): ${body.slice(0, 400)}`);
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
