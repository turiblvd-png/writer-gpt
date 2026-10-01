import { GoogleGenAI } from '@google/genai';
import { apiKeyFor } from '@/lib/platform/settings';
import type { ProviderId } from './types';
import { explainGeminiError } from './gemini';

/**
 * The models each provider offers, for the dashboard dropdowns. Read live from
 * the provider with the stored key, so new models appear without a code change;
 * a short built-in list is the fallback when no key is set or the call fails.
 */

export const KNOWN_MODELS: Record<ProviderId, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  grok: ['grok-4.3', 'grok-4.7', 'grok-4.6', 'grok-4.5', 'grok-4.20-0309-non-reasoning', 'grok-4.20-0309-reasoning', 'grok-build-0.1'],
};

const BASE: Record<Exclude<ProviderId, 'gemini'>, string> = {
  deepseek: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  grok: process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1',
};

/** Text models only: embeddings, speech, image and video models cannot write articles. */
const NOT_TEXT = /embed|tts|audio|image|imagen|veo|vision-exp|aqa|learnlm|live|native-audio|robotics|computer-use/i;

export interface ModelList {
  models: string[];
  live: boolean;
  error?: string;
}

export async function listModels(provider: ProviderId): Promise<ModelList> {
  const { key } = await apiKeyFor(provider);
  if (!key) return { models: KNOWN_MODELS[provider], live: false, error: 'No API key yet, showing the usual models.' };
  try {
    let names: string[] = [];
    if (provider === 'gemini') {
      const client = new GoogleGenAI({
        apiKey: key,
        httpOptions: { ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}), timeout: 20_000 },
      });
      const pager = await client.models.list({ config: { pageSize: 200 } });
      for await (const m of pager) {
        if (m.name && (m.supportedActions ?? ['generateContent']).includes('generateContent')) names.push(m.name.replace(/^models\//, ''));
      }
      names = names.filter((n) => n.startsWith('gemini'));
    } else {
      const res = await fetch(`${BASE[provider]}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data?: { id?: string }[] };
      names = (data.data ?? []).map((m) => m.id ?? '').filter(Boolean);
    }
    const models = [...new Set(names.filter((n) => !NOT_TEXT.test(n)))].sort();
    return models.length ? { models, live: true } : { models: KNOWN_MODELS[provider], live: false, error: 'The provider listed no text models.' };
  } catch (err) {
    const reason = provider === 'gemini' ? explainGeminiError(err, '').message : err instanceof Error ? err.message : String(err);
    return { models: KNOWN_MODELS[provider], live: false, error: `Showing the usual models. ${reason}` };
  }
}
