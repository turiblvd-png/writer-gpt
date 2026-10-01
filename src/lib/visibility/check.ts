import { randomUUID } from 'node:crypto';
import { complete, type Source } from '@/lib/ai';
import { collection } from '@/lib/db/engine';
import { extractJson } from '@/lib/content/json';
import { makeClock } from '@/lib/pipeline/engine';

/**
 * AI Visibility: does an AI answer cite your site?
 *
 * Each query is put to Gemini with Google Search grounding, the same retrieval
 * behind Google's AI answers, and the citations it returns are inspected. That
 * is a measurement, not a model's opinion of your visibility. It covers Google's
 * AI only; ChatGPT and Perplexity use different retrieval and need their own
 * keys to measure.
 */

export interface QueryResult {
  query: string;
  /** Your domain appears among the cited sources. */
  cited: boolean;
  /** Your brand or domain is named in the answer text itself. */
  mentioned: boolean;
  /** 1-based position of your first citation, or null. */
  position: number | null;
  citedDomains: string[];
  answerExcerpt: string;
  error?: string;
}

export interface VisibilityCheck {
  id: string;
  domain: string;
  brand: string;
  results: QueryResult[];
  /** Share of queries where you were cited. */
  citationRate: number;
  mentionRate: number;
  /** Domains cited most often across all queries, i.e. who you compete with. */
  topCompetitors: { domain: string; count: number }[];
  createdAt: number;
}

const checks = collection<VisibilityCheck>('visibility_checks');
const MAX_QUERIES = 10;

export function normaliseDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  try {
    return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^www\./, '').split('/')[0] ?? raw;
  }
}

/**
 * The domain a citation points at. Gemini often returns a redirect URL in
 * `uri` and puts the real site in `domain` or `title`, so all three are tried.
 */
export function sourceDomain(s: Source): string {
  for (const candidate of [s.domain, s.title, s.uri]) {
    if (!candidate) continue;
    const d = normaliseDomain(candidate);
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && !d.includes('vertexaisearch') && !d.includes('googleusercontent')) return d;
  }
  return '';
}

/** Matches the domain or any subdomain of it, never a lookalike suffix. */
export function isSameSite(candidate: string, domain: string): boolean {
  return candidate === domain || candidate.endsWith(`.${domain}`);
}

export async function checkQuery(query: string, domain: string, brand: string): Promise<QueryResult> {
  const clock = makeClock();
  try {
    const res = await complete('research', {
      grounded: true,
      temperature: 0.2,
      system: `Today is ${clock.today}. Answer as a helpful search assistant would, citing sources.`,
      prompt: query,
    });

    const citedDomains = res.sources.map(sourceDomain).filter(Boolean);
    const index = citedDomains.findIndex((d) => isSameSite(d, domain));
    const text = res.text.toLowerCase();
    const needles = [domain, brand.toLowerCase()].filter((n) => n.length > 2);

    return {
      query,
      cited: index !== -1,
      mentioned: needles.some((n) => text.includes(n)),
      position: index === -1 ? null : index + 1,
      citedDomains: [...new Set(citedDomains)],
      answerExcerpt: res.text.replace(/\s+/g, ' ').trim().slice(0, 400),
    };
  } catch (err) {
    return {
      query, cited: false, mentioned: false, position: null, citedDomains: [], answerExcerpt: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runVisibilityCheck(input: { domain: string; brand?: string; queries: string[] }): Promise<VisibilityCheck> {
  const domain = normaliseDomain(input.domain);
  if (!domain.includes('.')) throw new Error('Enter your site, e.g. riyadhticketsmap.com.');
  const brand = input.brand?.trim() || domain.split('.')[0]!;
  const queries = [...new Set(input.queries.map((q) => q.trim()).filter((q) => q.length > 2))].slice(0, MAX_QUERIES);
  if (!queries.length) throw new Error('Add at least one query a customer might ask.');

  // Three at a time: fast enough to finish inside a request, gentle enough on
  // per-minute rate limits.
  const results: QueryResult[] = [];
  for (let i = 0; i < queries.length; i += 3) {
    results.push(...(await Promise.all(queries.slice(i, i + 3).map((q) => checkQuery(q, domain, brand)))));
  }

  const answered = results.filter((r) => !r.error);
  if (!answered.length) throw new Error(results[0]?.error ?? 'Every query failed.');

  const counts = new Map<string, number>();
  for (const r of answered) {
    for (const d of r.citedDomains) if (!isSameSite(d, domain)) counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  return checks.put({
    id: randomUUID(),
    domain,
    brand,
    results,
    citationRate: answered.filter((r) => r.cited).length / answered.length,
    mentionRate: answered.filter((r) => r.mentioned).length / answered.length,
    topCompetitors: [...counts.entries()].map(([d, count]) => ({ domain: d, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    createdAt: Date.now(),
  });
}

/** Proposes realistic questions for a topic, so users need not invent them. */
export async function suggestQueries(topic: string, brand: string): Promise<string[]> {
  const res = await complete('structure', {
    json: true,
    temperature: 0.5,
    prompt: [
      `Topic: "${topic}". Business: "${brand}".`,
      'List 8 questions real customers would ask an AI assistant about this topic, where this business would hope to be the cited source.',
      'Mix: what/how/when questions, comparison questions, and buying questions. Phrase them as people type them. Do not name the business in them.',
      'Return JSON only: { "queries": [""] }',
    ].join('\n'),
  });
  const parsed = extractJson<{ queries?: unknown }>(res.text);
  return Array.isArray(parsed.queries)
    ? parsed.queries.filter((q): q is string => typeof q === 'string' && q.trim().length > 3).map((q) => q.trim()).slice(0, 10)
    : [];
}

export async function listChecks(limit = 30): Promise<VisibilityCheck[]> {
  return checks.list('createdAt', limit);
}
