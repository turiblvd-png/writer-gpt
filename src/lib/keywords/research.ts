import { randomUUID } from 'node:crypto';
import { complete } from '@/lib/ai';
import { extractJson } from '@/lib/content/json';
import { collection } from '@/lib/db/engine';
import { makeClock } from '@/lib/pipeline/engine';
import { systemPreamble } from '@/lib/style/rules';
import type { Source } from '@/lib/ai';

/**
 * Keyword research grounded in the live results page.
 *
 * Two calls, because Gemini cannot return strict JSON while search grounding is
 * on: a grounded call reads the current results, then a structuring call turns
 * that into clusters. Search volumes are deliberately absent. Real volumes come
 * from paid clickstream data; a model-estimated number would look authoritative
 * and be invented, which is the failure this product is built to avoid.
 */

export type Intent = 'informational' | 'commercial' | 'transactional' | 'navigational';
export type Difficulty = 'low' | 'medium' | 'high';

export interface KeywordIdea {
  term: string;
  intent: Intent;
  /** Estimated from who ranks now, not from a backlink index. */
  difficulty: Difficulty;
  note: string;
}

export interface KeywordCluster {
  name: string;
  intent: Intent;
  keywords: KeywordIdea[];
}

export interface KeywordResearch {
  id: string;
  seed: string;
  language: string;
  location: string;
  clusters: KeywordCluster[];
  questions: string[];
  serpFeatures: string[];
  /** Who ranks now, as read from the grounded search. */
  competitors: string[];
  angle: string;
  sources: Source[];
  createdAt: number;
}

const store = collection<KeywordResearch>('keyword_research');

const INTENTS: Intent[] = ['informational', 'commercial', 'transactional', 'navigational'];
const DIFFICULTIES: Difficulty[] = ['low', 'medium', 'high'];

export async function researchKeywords(input: { seed: string; language?: string; location?: string }): Promise<KeywordResearch> {
  const seed = input.seed.trim();
  if (seed.length < 2) throw new Error('Enter a seed keyword.');
  const language = input.language?.trim() || 'English';
  const location = input.location?.trim() || 'Worldwide';
  const clock = makeClock();
  const system = systemPreamble(clock, language);

  const research = await complete('research', {
    system,
    grounded: true,
    temperature: 0.3,
    prompt: [
      `Search for "${seed}"${location !== 'Worldwide' ? ` as a searcher in ${location} would` : ''}, as of ${clock.today}.`,
      '',
      'Report what you find, plainly:',
      '1. WHO RANKS: the sites in the top results, and whether they are major brands, niche sites, forums or official sources.',
      '2. SERP FEATURES: featured snippet, People Also Ask, video, local results, shopping, AI overview, news. Only those you actually see.',
      '3. RELATED SEARCHES: real related and long-tail queries people use around this topic.',
      '4. QUESTIONS: questions people ask about it.',
      '5. INTENT: what most searchers want, and how that splits.',
      `If the topic is time-bound, note what is current in ${clock.year}.`,
    ].join('\n'),
  });

  const structured = await complete('structure', {
    system,
    json: true,
    temperature: 0.2,
    prompt: [
      `Seed keyword: "${seed}". Language: ${language}. Location: ${location}.`,
      '',
      'Research from live search:',
      research.text,
      '',
      'Turn this into keyword clusters for content planning.',
      '- 4 to 7 clusters, each a distinct subtopic someone could write one page about.',
      '- 4 to 8 keywords per cluster, phrased as people search them. Include the long tail.',
      '- intent: one of informational, commercial, transactional, navigational.',
      '- difficulty: low, medium or high, judged only from who ranks. Major brands or official sites ranking means high; forums and thin pages ranking means low.',
      '- note: a few words on why this keyword is worth targeting, or what the page must do to win it.',
      '- Do not include search volumes or any numbers you did not see.',
      '',
      'Return JSON only:',
      '{ "clusters": [ { "name": "", "intent": "informational", "keywords": [ { "term": "", "intent": "informational", "difficulty": "medium", "note": "" } ] } ],',
      '  "questions": [""], "serpFeatures": [""], "competitors": ["domain.com"], "angle": "one sentence: the page that would win this seed" }',
    ].join('\n'),
  });

  const raw = extractJson<Record<string, unknown>>(structured.text);
  const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  const strings = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()).slice(0, max) : [];

  const clusters: KeywordCluster[] = Array.isArray(raw.clusters)
    ? (raw.clusters as unknown[])
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .map((c) => ({
          name: String(c.name ?? '').trim() || 'Cluster',
          intent: pick(c.intent, INTENTS, 'informational'),
          keywords: (Array.isArray(c.keywords) ? (c.keywords as unknown[]) : [])
            .filter((k): k is Record<string, unknown> => typeof k === 'object' && k !== null && typeof (k as Record<string, unknown>).term === 'string')
            .map((k) => ({
              term: String(k.term).trim().toLowerCase(),
              intent: pick(k.intent, INTENTS, pick(c.intent, INTENTS, 'informational')),
              difficulty: pick(k.difficulty, DIFFICULTIES, 'medium'),
              note: String(k.note ?? '').trim(),
            }))
            .filter((k) => k.term.length > 1),
        }))
        .filter((c) => c.keywords.length > 0)
    : [];

  if (!clusters.length) throw new Error('No keyword clusters came back. Try a broader seed.');

  // The same term can surface in two clusters; keep its first placement.
  const seen = new Set<string>();
  for (const c of clusters) c.keywords = c.keywords.filter((k) => (seen.has(k.term) ? false : (seen.add(k.term), true)));

  const record: KeywordResearch = {
    id: randomUUID(),
    seed,
    language,
    location,
    clusters: clusters.filter((c) => c.keywords.length > 0),
    questions: strings(raw.questions, 20),
    serpFeatures: strings(raw.serpFeatures, 10),
    competitors: strings(raw.competitors, 10),
    angle: typeof raw.angle === 'string' ? raw.angle.trim() : '',
    sources: research.sources,
    createdAt: Date.now(),
  };
  return store.put(record);
}

export async function listResearch(limit = 30): Promise<KeywordResearch[]> {
  return store.list('createdAt', limit);
}

export async function deleteResearch(id: string): Promise<void> {
  await store.remove(id);
}
