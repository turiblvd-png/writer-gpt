import { z } from 'zod';

/**
 * Semantic Writer is a *workspace*, not a pipeline.
 *
 * Generate Content runs unattended start to finish. This does not: the user
 * drives each stage, triggers AI actions, edits and excludes results, and comes
 * back to the project later. So state is persisted per project and every stage
 * is independently re-runnable, rather than being a single sequential run.
 */

export interface CompetitorUrl {
  url: string;
  domain: string;
}

export interface OutlineHeading {
  level: number;
  text: string;
}

export interface CompetitorOutline {
  url: string;
  domain: string;
  headings: OutlineHeading[];
  error?: string;
}

export interface CompetitorContent {
  url: string;
  domain: string;
  text: string;
  words: number;
  /** Set when extraction failed, so the UI can show why rather than an empty box. */
  error?: string;
}

export type EntitySource = 'competitor' | 'ai' | 'unique';

export interface Entity {
  name: string;
  source: EntitySource;
  /** How many competitor documents mention it. Drives the coverage target. */
  documentFrequency?: number;
  /** Total mentions across competitor corpus. */
  mentions?: number;
}

export interface NGram {
  text: string;
  n: number;
  count: number;
  /** In how many competitor documents the phrase appears. */
  documents: number;
}

export interface SkipGram {
  text: string;
  count: number;
  /** Tokens skipped between the pair, e.g. 2 for "semantic __ __ optimisation". */
  gap: number;
}

export interface NlpKeyword {
  term: string;
  /** Term frequency × inverse document frequency against the competitor corpus. */
  salience: number;
  count: number;
  category?: string;
}

export interface SeoRules {
  targetKeywordDensity: number;
  minTransitionRatio: number;
  maxPassiveRatio: number;
  includeFaq: boolean;
  includeTables: boolean;
  includeKeyTakeaways: boolean;
  internalLinks: string;
  externalLinksPolicy: 'cite-sources' | 'none';
}

export interface GrammarRules {
  tone: string;
  pointOfView: 'first-person-plural' | 'second-person' | 'third-person';
  readingLevel: string;
  sentenceVariety: boolean;
  avoidPhrases: string[];
}

export interface ArticleOutput {
  markdown: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  generatedAt: number;
  /** Populated by the review stage; each is a claim the model could not support. */
  unverifiedClaims?: string[];
  /** 0–100 from the AI-tell detector, after any style repair rounds. */
  humanScore?: number;
  /** The post-writing self-check against the brief. */
  quality?: QualityReport;
  /** Suggested alt text for the article's images. */
  altTexts?: string[];
  /**
   * How far the article has got. Writing runs as separate requests (each well
   * inside the host's time limit) and each step saves, so a failure part-way
   * keeps the work and the next step can resume from here.
   */
  stage?: 'draft' | 'polished' | 'revised' | 'done';
}

export type FactStatus = 'confirmed' | 'reported' | 'conflicting' | 'unconfirmed';

export interface VerifiedFact {
  id: string;
  /** What the fact is about, e.g. "2026 dates". */
  label: string;
  value: string;
  status: FactStatus;
  /** Name of the source (site or publication), and its URL when known. */
  source?: string;
  url?: string;
  /** True when the user added or edited it by hand. */
  manual?: boolean;
}

export interface FactSheet {
  facts: VerifiedFact[];
  /** Sources the article may cite in its Sources section. */
  sources: { name: string; url?: string }[];
  /** False when live search was unavailable, so nothing could be confirmed. */
  liveSearch: boolean;
  researchedAt: number;
}

export interface QualityCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface QualityReport {
  checks: QualityCheck[];
  passed: number;
  total: number;
  /** True when an automatic revision pass ran to fix failed checks. */
  revised: boolean;
}

/** Everything the 14 stages accumulate. Each key belongs to one stage. */
export interface ProjectData {
  competitors: CompetitorUrl[];
  outlines: CompetitorOutline[];
  combinedOutline: OutlineHeading[];
  wordCount: { target: number; auto: boolean; competitorAverage?: number };
  competitorContent: CompetitorContent[];
  contentAnalysis?: string;
  entities: Entity[];
  excludedEntities: string[];
  ngrams: NGram[];
  excludedNgrams: string[];
  nlpKeywords: NlpKeyword[];
  excludedKeywords: string[];
  skipGrams: SkipGram[];
  autoSuggest: string[];
  selectedQuestions: string[];
  grammar: GrammarRules;
  seoRules: SeoRules;
  aiInstructions: string;
  megaPrompt?: string;
  /** Checked facts the writer may use for specifics (Master Prompt stage). */
  facts?: FactSheet;
  article?: ArticleOutput;
}

export interface SemanticProject {
  id: string;
  name: string;
  language: string;
  mainKeyword: string;
  currentStepIndex: number;
  completedSteps: string[];
  data: ProjectData;
  createdAt: number;
  updatedAt: number;
}

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Give the project a name.').max(120),
  mainKeyword: z.string().min(2, 'Enter the keyword you want to rank for.').max(200),
  language: z.string().min(2).default('English'),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const DEFAULT_GRAMMAR: GrammarRules = {
  tone: 'Professional and direct',
  pointOfView: 'second-person',
  readingLevel: 'Grade 8–10',
  sentenceVariety: true,
  avoidPhrases: [
    'in conclusion', 'in the ever-evolving landscape', 'delve into', 'it is important to note',
    'in today’s digital age', 'unlock the power', 'game-changer', 'navigate the complexities',
  ],
};

export const DEFAULT_SEO_RULES: SeoRules = {
  targetKeywordDensity: 1.2,
  minTransitionRatio: 30,
  maxPassiveRatio: 10,
  includeFaq: true,
  includeTables: true,
  includeKeyTakeaways: true,
  internalLinks: '',
  externalLinksPolicy: 'cite-sources',
};

export function emptyProjectData(): ProjectData {
  return {
    competitors: [],
    outlines: [],
    combinedOutline: [],
    wordCount: { target: 1800, auto: true },
    competitorContent: [],
    entities: [],
    excludedEntities: [],
    ngrams: [],
    excludedNgrams: [],
    nlpKeywords: [],
    excludedKeywords: [],
    skipGrams: [],
    autoSuggest: [],
    selectedQuestions: [],
    grammar: { ...DEFAULT_GRAMMAR },
    seoRules: { ...DEFAULT_SEO_RULES },
    aiInstructions: '',
  };
}
