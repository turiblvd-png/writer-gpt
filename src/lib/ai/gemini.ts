import { GoogleGenAI } from '@google/genai';
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

  constructor(
    apiKey: string | undefined,
    private model: string,
  ) {
    if (!apiKey) throw new ProviderNotConfiguredError('gemini', 'GEMINI_API_KEY');
    this.client = new GoogleGenAI({ apiKey });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
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
      model: this.model,
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
      model: this.model,
      provider: this.id,
    };
  }
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
