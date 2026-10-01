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
import { buildFactSheet, factSheetBlock } from './facts';
import { assessArticle, plannedOutline, revisionInstructions } from './quality';
import { lengthBudget } from './brief';
import { sanitizeDraft } from '@/lib/style/sanitize';
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

async function load(id: string): Promise<SemanticProject> {
  const project = await getProject(id);
  if (!project) throw new ProjectNotFoundError();
  return project;
}

async function save(id: string, data: Partial<ProjectData>): Promise<SemanticProject> {
  const next = await updateProject(id, { data });
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
  const project = await load(id);
  const targets = urls?.length ? urls : project.data.competitors.map((c) => c.url);

  const results = await Promise.all(targets.map((url) => extractOutline(url)));

  // Replace results for the URLs just fetched, keep the rest.
  const kept = project.data.outlines.filter((o) => !targets.includes(o.url));
  return await save(id, { outlines: [...kept, ...results] });
}

export async function combineOutlines(id: string): Promise<SemanticProject> {
  const project = await load(id);
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
  return await save(id, { combinedOutline: headings });
}

const clampLevel = (n: number) => (Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 2);

// ── Stage 4: competitor content ─────────────────────────────────────────────

export async function extractCompetitorContent(id: string, urls?: string[]): Promise<SemanticProject> {
  const project = await load(id);
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

  return await save(id, patch);
}

export async function analyseCompetitorStyle(id: string): Promise<SemanticProject> {
  const project = await load(id);
  const corpus = corpusText(project, 40000);
  if (!corpus) throw new Error('No competitor content extracted yet.');

  const res = await complete('reason', {
    prompt: P.contentAnalysisPrompt(project, corpus, makeClock()),
    temperature: 0.4,
  });
  return await save(id, { contentAnalysis: res.text.trim() });
}

// ── Stage 5: entities ───────────────────────────────────────────────────────

export type EntityScope = 'all' | 'competitor' | 'ai' | 'unique';

export async function generateEntities(id: string, scope: EntityScope = 'all'): Promise<SemanticProject> {
  const project = await load(id);
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
  return await save(id, { entities: annotateEntities(merged, docs) });
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

export async function computeNgrams(id: string): Promise<SemanticProject> {
  const project = await load(id);
  const docs = corpusDocs(project);
  if (!docs.length) throw new Error('Extract competitor content first, n-grams are counted from it.');
  return await save(id, { ngrams: extractNGrams(docs, 3, 2).slice(0, 150) });
}

export async function computeNlpKeywords(id: string): Promise<SemanticProject> {
  const project = await load(id);
  const docs = corpusDocs(project);
  if (!docs.length) throw new Error('Extract competitor content first, salience is measured against it.');
  return await save(id, { nlpKeywords: extractNlpKeywords(docs, 80) });
}

export async function computeSkipGrams(id: string): Promise<SemanticProject> {
  const project = await load(id);
  const docs = corpusDocs(project);
  if (!docs.length) throw new Error('Extract competitor content first, skip-grams are counted from it.');
  return await save(id, { skipGrams: extractSkipGrams(docs, 4, 3).slice(0, 80) });
}

/** Re-run every measurement at once after content changes. */
export async function recomputeAll(id: string): Promise<SemanticProject> {
  const project = await load(id);
  const docs = corpusDocs(project);
  if (!docs.length) throw new Error('Extract competitor content first.');

  return await save(id, {
    ngrams: extractNGrams(docs, 3, 2).slice(0, 150),
    nlpKeywords: extractNlpKeywords(docs, 80),
    skipGrams: extractSkipGrams(docs, 4, 3).slice(0, 80),
    entities: annotateEntities(project.data.entities, docs),
  });
}

// ── Stage 9: questions ──────────────────────────────────────────────────────

export async function generateQuestions(id: string): Promise<SemanticProject> {
  const project = await load(id);
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
  return await save(id, { autoSuggest: questions });
}

// ── Stage 13: verified facts ────────────────────────────────────────────────

/**
 * Researches the fact sheet. Facts the user added or edited by hand survive a
 * re-run, since they are the user's own knowledge of the topic.
 */
export async function researchFacts(id: string, opts: { live?: boolean } = {}): Promise<SemanticProject> {
  const project = await load(id);
  const sheet = await buildFactSheet(project, makeClock(), opts);
  const manual = project.data.facts?.facts.filter((f) => f.manual) ?? [];
  return await save(id, { facts: { ...sheet, facts: [...manual, ...sheet.facts] } });
}

// ── Stage 12: mega prompt ───────────────────────────────────────────────────

export async function compileMegaPrompt(id: string): Promise<SemanticProject> {
  const project = await load(id);
  return await save(id, { megaPrompt: buildMegaPrompt(project, makeClock()) });
}

// ── Stage 13/14: generate and verify ────────────────────────────────────────

export interface GenerateProgress {
  (stage: string, message: string): void;
}

/** The article steps in order. The UI runs them one request at a time. */
export const ARTICLE_STEPS = ['write-draft', 'polish-article', 'revise-article', 'finish-article'] as const;
export type ArticleStep = (typeof ARTICLE_STEPS)[number];

function requireArticle(project: SemanticProject): ArticleOutput {
  const article = project.data.article;
  if (!article?.markdown) throw new Error('No draft yet. Write the draft first.');
  return article;
}

/** Step 1: the draft, from the master prompt. Facts are researched first if missing. */
export async function writeDraft(id: string, onProgress?: GenerateProgress): Promise<SemanticProject> {
  let project = await load(id);
  const clock = makeClock();
  if (!project.data.combinedOutline.length) {
    throw new Error('No outline. Combine competitor outlines or add headings before generating.');
  }
  // Facts first. The brief supplies structure and vocabulary; it does not
  // supply truth, and the writer must not fill that gap from memory.
  if (!project.data.facts?.facts.length) {
    onProgress?.('research', 'Getting facts from the competitor pages…');
    try {
      project = await researchFacts(id);
    } catch {
      // Facts improve the article but must not block it: the brief then tells
      // the writer to leave out specifics it cannot attribute.
    }
  }
  const budget = lengthBudget(plannedOutline(project), project.data.wordCount.target);
  const megaPrompt = buildMegaPrompt(project, clock);

  onProgress?.('draft', `Writing ~${budget.effective} words…`);
  const draft = await complete(
    'draft',
    { prompt: megaPrompt, temperature: 0.7, maxOutputTokens: Math.min(32000, Math.ceil(budget.effective * 3)) },
    // A long draft is one big call; retrying it three times cannot fit the time limit.
    { retries: 1 },
  );
  const markdown = sanitizeDraft(stripFences(draft.text)).text;
  const title = firstHeading(markdown) || project.name;
  const article: ArticleOutput = {
    markdown,
    seoTitle: title,
    metaDescription: '',
    slug: slugify(title),
    generatedAt: Date.now(),
    humanScore: detectTells(markdown).humanScore,
    quality: assessArticle(project, markdown),
    stage: 'draft',
  };
  return await save(id, { article, megaPrompt });
}

/** Step 2: one style repair round, if the draft still reads as machine-written. */
export async function polishArticle(id: string, onProgress?: GenerateProgress): Promise<SemanticProject> {
  const project = await load(id);
  const article = requireArticle(project);
  onProgress?.('style', 'Checking for AI writing patterns…');
  const enforced = await enforceStyle(article.markdown, {
    clock: makeClock(),
    language: project.language,
    maxRounds: 1,
    onProgress: (m) => onProgress?.('style', m),
  });
  const markdown = enforced.markdown;
  return await save(id, {
    article: { ...article, markdown, humanScore: enforced.after.humanScore, quality: assessArticle(project, markdown), stage: 'polished' },
  });
}

/**
 * Step 3: the brief's self-check, done for real. One targeted revision when
 * the draft missed headings, entities, keyword ranges, length or paragraph
 * size, kept only if it scores better.
 */
export async function reviseArticle(id: string, onProgress?: GenerateProgress): Promise<SemanticProject> {
  const project = await load(id);
  const article = requireArticle(project);
  const clock = makeClock();
  let markdown = article.markdown;
  let quality = assessArticle(project, markdown);

  if (quality.passed < quality.total) {
    onProgress?.('revise', `Fixing ${quality.total - quality.passed} failed check(s)…`);
    const budget = lengthBudget(plannedOutline(project), project.data.wordCount.target);
    const factText = project.data.facts ? factSheetBlock(project.data.facts, clock).join('\n') : '';
    try {
      const revision = await complete(
        'draft',
        {
          prompt: [
            'Revise the article below so it passes these checks. Change only what the checks require; keep every correct fact, heading and passage as it is.',
            '',
            ...revisionInstructions(quality).map((l) => `- ${l}`),
            '',
            'Rules that still apply: no em dashes, paragraphs of one to three sentences, no stock AI phrases, and every specific must come from these facts:',
            factText,
            '',
            'Required heading structure, exact wording and order:',
            ...plannedOutline(project).map((h) => `${'#'.repeat(Math.max(1, Math.min(6, h.level)))} ${h.text}`),
            '',
            'ARTICLE:',
            markdown,
            '',
            'Return the complete revised article as markdown, nothing else.',
          ].join('\n'),
          temperature: 0.4,
          maxOutputTokens: Math.min(32000, Math.ceil(budget.effective * 3)),
        },
        { retries: 1 },
      );
      const revised = sanitizeDraft(stripFences(revision.text)).text;
      const after = assessArticle(project, revised, true);
      // Keep the revision only if it is genuinely better.
      if (after.passed > quality.passed) {
        markdown = revised;
        quality = after;
      }
    } catch {
      onProgress?.('revise', 'Revision pass failed; keeping the current draft.');
    }
  }
  return await save(id, {
    article: { ...article, markdown, quality, humanScore: detectTells(markdown).humanScore, stage: 'revised' },
  });
}

/** Step 4: metadata and fact check, side by side. Either may fail without losing the article. */
export async function finishArticle(id: string, onProgress?: GenerateProgress): Promise<SemanticProject> {
  const project = await load(id);
  const article = requireArticle(project);
  const clock = makeClock();
  const markdown = article.markdown;
  const factText = project.data.facts ? factSheetBlock(project.data.facts, clock).join('\n') : '';
  onProgress?.('finish', 'Writing metadata and fact-checking…');

  const [meta, check] = await Promise.allSettled([
    complete('structure', { prompt: P.metaPrompt(project, markdown, clock), json: true, temperature: 0.5 }, { retries: 1 }),
    // Checked against the fact sheet, not a fresh web search: fast, and it is
    // the sheet the article was required to stay within.
    complete('structure', { prompt: P.verifyPrompt(markdown, factText, clock), json: true, temperature: 0.1 }, { retries: 1 }),
  ]);

  let { seoTitle, metaDescription, slug } = article;
  let altTexts = article.altTexts ?? [];
  if (meta.status === 'fulfilled') {
    try {
      const parsed = extractJson<{ seoTitle?: string; metaDescription?: string; slug?: string; altTexts?: unknown }>(meta.value.text);
      seoTitle = parsed.seoTitle?.trim() || seoTitle;
      metaDescription = parsed.metaDescription?.trim() || metaDescription;
      slug = slugify(parsed.slug?.trim() || seoTitle);
      if (Array.isArray(parsed.altTexts)) altTexts = parsed.altTexts.filter((t): t is string => typeof t === 'string').slice(0, 6);
    } catch {
      // Metadata is recoverable by hand; a finished article is not worth losing.
    }
  }

  let unverifiedClaims = article.unverifiedClaims ?? [];
  if (check.status === 'fulfilled') {
    try {
      const parsed = extractJson<{ claims?: unknown }>(check.value.text);
      if (Array.isArray(parsed.claims)) {
        unverifiedClaims = parsed.claims
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .filter((c) => c.verdict !== 'supported')
          .map((c) => `${String(c.text ?? '')}${c.note ? `, ${String(c.note)}` : ''}`)
          .filter((t) => t.trim().length > 0);
      }
    } catch {
      onProgress?.('verify', 'Fact-check output could not be parsed; claims were not verified.');
    }
  }

  onProgress?.('done', `${analyseDocument(markdown).words} words written.`);
  return await save(id, {
    article: { ...article, seoTitle, metaDescription, slug, altTexts, unverifiedClaims, generatedAt: Date.now(), stage: 'done' },
  });
}

/** All steps in one go, for callers without a time limit (scripts, tests). */
export async function generateArticle(id: string, onProgress?: GenerateProgress): Promise<SemanticProject> {
  await writeDraft(id, onProgress);
  await polishArticle(id, onProgress);
  await reviseArticle(id, onProgress);
  return finishArticle(id, onProgress);
}

function stripFences(text: string): string {
  const fenced = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n?```\s*$/i.exec(text.trim());
  return (fenced?.[1] ?? text).trim();
}

function firstHeading(markdown: string): string {
  return /^\s{0,3}#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
}
