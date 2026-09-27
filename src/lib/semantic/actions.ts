import { complete } from '@/lib/ai';
import { extractJson } from '@/lib/content/json';
import { makeClock } from '@/lib/pipeline/engine';
import { slugify } from '@/lib/content/slug';
import { analyseDocument } from '@/lib/seo/text';
import { enforceStyle } from '@/lib/style/repair';
import { detectTells } from '@/lib/style/detect';
import { extractContent, extractOutline } from './extract';
import { annotateEntities, extractNGrams, extractNlpKeywords, extractSkipGrams, type Doc } from './nlp';
import { buildMegaPrompt } from './megaprompt';
import * as P from './prompts';
import { getProject, updateProject } from './store';
import type { ArticleOutput, Entity, OutlineHeading, ProjectData, SemanticProject } from './types';

/**
 * One function per stage action the UI can trigger.
 *
 * Each loads the project, does its work, persists a patch, and returns the
 * updated project. Deterministic stages (n-grams, salience, skip-grams) never
 * touch a model — they measure the extracted corpus, so they are free, instant
 * and reproducible.
 */

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found.');
    this.name = 'ProjectNotFoundError';
  }
}

function load(id: string): SemanticProject {
  const project = getProject(id);
  if (!project) throw new ProjectNotFoundError();
  return project;
}

function save(id: string, data: Partial<ProjectData>): SemanticProject {
  const next = updateProject(id, { data });
  if (!next) throw new ProjectNotFoundError();
  return next;
}

/** Extracted competitor text, in the shape the NLP functions expect. */
function corpusDocs(project: SemanticProject): Doc[] {
  return project.data.competitorContent
    .filter((c) => !c.error && c.text.length > 0)
    .map((c) => ({ url: c.url, text: c.text }));
}

function corpusText(project: SemanticProject, limit = 60000): string {
  return corpusDocs(project)
    .map((d) => d.text)
    .join('\n\n')
    .slice(0, limit);
}

// ── Stage 2: outline ────────────────────────────────────────────────────────

export async function extractOutlines(id: string, urls?: string[]): Promise<SemanticProject> {
  const project = load(id);
  const targets = urls?.length ? urls : project.data.competitors.map((c) => c.url);

  const results = await Promise.all(targets.map((url) => extractOutline(url)));

  // Replace results for the URLs just fetched, keep the rest.
  const kept = project.data.outlines.filter((o) => !targets.includes(o.url));
  return save(id, { outlines: [...kept, ...results] });
}

export async function combineOutlines(id: string): Promise<SemanticProject> {
  const project = load(id);
  const usable = project.data.outlines.filter((o) => o.headings.length > 0);
  if (!usable.length) {
    throw new Error('No competitor outlines extracted yet. Run extraction first, or add headings manually.');
  }

  const clock = makeClock();
  const res = await complete('reason', {
    prompt: P.combineOutlinesPrompt(project, usable, clock),
    json: true,
    temperature: 0.4,
  });

  const parsed = extractJson<{ headings?: unknown }>(res.text);
  const headings: OutlineHeading[] = Array.isArray(parsed.headings)
    ? parsed.headings
        .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
        .map((h) => ({
          level: clampLevel(Number(h.level)),
          text: String(h.text ?? '').trim(),
        }))
        .filter((h) => h.text.length > 0)
    : [];

  if (!headings.length) throw new Error('The model returned no usable headings.');
  return save(id, { combinedOutline: headings });
}

const clampLevel = (n: number) => (Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 2);

// ── Stage 4: competitor content ─────────────────────────────────────────────

export async function extractCompetitorContent(id: string, urls?: string[]): Promise<SemanticProject> {
  const project = load(id);
  const targets = urls?.length ? urls : project.data.competitors.map((c) => c.url);

  const results = await Promise.all(targets.map((url) => extractContent(url)));
  const kept = project.data.competitorContent.filter((c) => !targets.includes(c.url));
  const competitorContent = [...kept, ...results];

  // The auto word-count target tracks the competitor average, so it stays
  // meaningful as pages are added or removed.
  const extracted = competitorContent.filter((c) => !c.error && c.words > 0);
  const patch: Partial<ProjectData> = { competitorContent };

  // The corpus just changed, so every measurement derived from it is stale.
  // Entity counts especially: they drive the required/optional split in the mega
  // prompt, and a user who generated entities before extracting content would
  // otherwise keep zero counts forever and get every entity filed as optional.
  const docs: Doc[] = extracted.map((c) => ({ url: c.url, text: c.text }));
  if (docs.length && project.data.entities.length) {
    patch.entities = annotateEntities(project.data.entities, docs);
  }

  if (extracted.length) {
    const average = Math.round(extracted.reduce((sum, c) => sum + c.words, 0) / extracted.length);
    patch.wordCount = {
      ...project.data.wordCount,
      competitorAverage: average,
      // Aim modestly above the average: enough to cover everything they cover,
      // not so much that the article is padded.
      target: project.data.wordCount.auto
        ? Math.min(6000, Math.max(800, Math.round((average * 1.15) / 50) * 50))
        : project.data.wordCount.target,
    };
  }

  return save(id, patch);
}

export async function analyseCompetitorStyle(id: string): Promise<SemanticProject> {
  const project = load(id);
  const corpus = corpusText(project, 40000);
  if (!corpus) throw new Error('No competitor content extracted yet.');

  const res = await complete('reason', {
    prompt: P.contentAnalysisPrompt(project, corpus, makeClock()),
    temperature: 0.4,
  });
  return save(id, { contentAnalysis: res.text.trim() });
}

// ── Stage 5: entities ───────────────────────────────────────────────────────

export type EntityScope = 'all' | 'competitor' | 'ai' | 'unique';

export async function generateEntities(id: string, scope: EntityScope = 'all'): Promise<SemanticProject> {
  const project = load(id);
  const docs = corpusDocs(project);

  const res = await complete('reason', {
    prompt: P.entityPrompt(project, corpusText(project, 40000), makeClock()),
    json: true,
    temperature: 0.3,
  });

  const parsed = extractJson<{ competitor?: unknown; ai?: unknown; unique?: unknown }>(res.text);
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim()) : [];

  const incoming: Entity[] = [
    ...asList(parsed.competitor).map((name) => ({ name, source: 'competitor' as const })),
    ...asList(parsed.ai).map((name) => ({ name, source: 'ai' as const })),
    ...asList(parsed.unique).map((name) => ({ name, source: 'unique' as const })),
  ];

  // Regenerating one column must not wipe the others the user has curated.
  const fresh = scope === 'all' ? incoming : incoming.filter((e) => e.source === scope);
  const retained = scope === 'all' ? [] : project.data.entities.filter((e) => e.source !== scope);

  const merged = dedupeEntities([...retained, ...fresh]);
  return save(id, { entities: annotateEntities(merged, docs) });
}

function dedupeEntities(entities: Entity[]): Entity[] {
  const seen = new Map<string, Entity>();
  for (const e of entities) {
    const key = e.name.toLowerCase().trim();
    // First writer wins, so a curated competitor entity is not demoted by a
    // later AI suggestion of the same name.
    if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()];
}

// ── Stages 6–8: deterministic corpus analysis ───────────────────────────────

export function computeNgrams(id: string): SemanticProject {
  const project = load(id);
  const docs = corpusDocs(project);
  if (!docs.length) throw new Error('Extract competitor content first — n-grams are counted from it.');
  return save(id, { ngrams: extractNGrams(docs, 3, 2).slice(0, 150) });
}

export function computeNlpKeywords(id: string): SemanticProject {
  const project = load(id);
  const docs = corpusDocs(project);
  if (!docs.length) throw new Error('Extract competitor content first — salience is measured against it.');
  return save(id, { nlpKeywords: extractNlpKeywords(docs, 80) });
}

export function computeSkipGrams(id: string): SemanticProject {
  const project = load(id);
  const docs = corpusDocs(project);
  if (!docs.length) throw new Error('Extract competitor content first — skip-grams are counted from it.');
  return save(id, { skipGrams: extractSkipGrams(docs, 4, 3).slice(0, 80) });
}

/** Re-run every measurement at once after content changes. */
export function recomputeAll(id: string): SemanticProject {
  const project = load(id);
  const docs = corpusDocs(project);
  if (!docs.length) throw new Error('Extract competitor content first.');

  return save(id, {
    ngrams: extractNGrams(docs, 3, 2).slice(0, 150),
    nlpKeywords: extractNlpKeywords(docs, 80),
    skipGrams: extractSkipGrams(docs, 4, 3).slice(0, 80),
    entities: annotateEntities(project.data.entities, docs),
  });
}

// ── Stage 9: questions ──────────────────────────────────────────────────────

export async function generateQuestions(id: string): Promise<SemanticProject> {
  const project = load(id);
  const res = await complete('research', {
    prompt: P.questionsPrompt(project, makeClock()),
    grounded: true,
    temperature: 0.5,
  });

  const questions = res.text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 8 && line.length < 200)
    .slice(0, 20);

  if (!questions.length) throw new Error('No questions returned.');
  return save(id, { autoSuggest: questions });
}

// ── Stage 12: mega prompt ───────────────────────────────────────────────────

export function compileMegaPrompt(id: string): SemanticProject {
  const project = load(id);
  return save(id, { megaPrompt: buildMegaPrompt(project, makeClock()) });
}

// ── Stage 13/14: generate and verify ────────────────────────────────────────

export interface GenerateProgress {
  (stage: string, message: string): void;
}

export async function generateArticle(id: string, onProgress?: GenerateProgress): Promise<SemanticProject> {
  const project = load(id);
  const clock = makeClock();

  if (!project.data.combinedOutline.length) {
    throw new Error('No outline. Combine competitor outlines or add headings before generating.');
  }

  // Ground the facts first. The mega prompt supplies structure and vocabulary;
  // it does not supply truth, and the writer must not fill that gap from memory.
  onProgress?.('research', 'Researching current facts…');
  const research = await complete('research', {
    prompt: P.researchPrompt(project, clock),
    grounded: true,
    temperature: 0.3,
  });

  const megaPrompt = buildMegaPrompt(project, clock);

  onProgress?.('draft', `Writing ~${project.data.wordCount.target} words…`);
  const draft = await complete('draft', {
    prompt: [
      megaPrompt,
      '',
      '═'.repeat(70),
      'RESEARCH — YOUR ONLY SOURCE OF FACTS',
      '═'.repeat(70),
      research.text,
    ].join('\n'),
    temperature: 0.7,
    maxOutputTokens: Math.min(32000, Math.ceil(project.data.wordCount.target * 3)),
  });

  onProgress?.('style', 'Checking for AI writing patterns…');
  const enforced = await enforceStyle(stripFences(draft.text), {
    clock,
    language: project.language,
    onProgress: (m) => onProgress?.('style', m),
  });
  const markdown = enforced.markdown;

  onProgress?.('metadata', 'Generating SEO metadata…');
  let seoTitle = firstHeading(markdown) || project.name;
  let metaDescription = '';
  let slug = slugify(seoTitle);

  try {
    const meta = await complete('structure', {
      prompt: P.metaPrompt(project, markdown, clock),
      json: true,
      temperature: 0.5,
    });
    const parsed = extractJson<{ seoTitle?: string; metaDescription?: string; slug?: string }>(meta.text);
    seoTitle = parsed.seoTitle?.trim() || seoTitle;
    metaDescription = parsed.metaDescription?.trim() ?? '';
    slug = slugify(parsed.slug?.trim() || seoTitle);
  } catch {
    // Metadata is recoverable by hand; a finished article is not worth losing.
    onProgress?.('metadata', 'Metadata generation failed — using the H1 as the title.');
  }

  onProgress?.('verify', 'Fact-checking the draft…');
  let unverifiedClaims: string[] = [];
  try {
    const check = await complete('verify', {
      prompt: P.verifyPrompt(markdown, research.text, clock),
      grounded: true,
      temperature: 0.1,
    });
    const parsed = extractJson<{ claims?: unknown }>(check.text);
    if (Array.isArray(parsed.claims)) {
      unverifiedClaims = parsed.claims
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .filter((c) => c.verdict !== 'supported')
        .map((c) => `${String(c.text ?? '')}${c.note ? ` — ${String(c.note)}` : ''}`)
        .filter((t) => t.trim().length > 0);
    }
  } catch {
    onProgress?.('verify', 'Fact-check output could not be parsed; claims were not verified.');
  }

  const article: ArticleOutput = {
    markdown,
    seoTitle,
    metaDescription,
    slug,
    generatedAt: Date.now(),
    unverifiedClaims,
    humanScore: enforced.after.humanScore,
  };

  onProgress?.('done', `${analyseDocument(markdown).words} words written.`);
  return save(id, { article, megaPrompt });
}

function stripFences(text: string): string {
  const fenced = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n?```\s*$/i.exec(text.trim());
  return (fenced?.[1] ?? text).trim();
}

function firstHeading(markdown: string): string {
  return /^\s{0,3}#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
}
