import { z } from 'zod';

export const SEO_MODES = {
  'full-seo': { label: 'Full SEO + FAQs', hint: 'Complete SEO optimization with FAQ section' },
  'nlp-semantic': { label: 'NLP Semantic', hint: 'Entity-focused, semantic triple optimization' },
  'rank-math': { label: 'Rank Math SEO', hint: 'Optimized for Rank Math scoring criteria' },
  yoast: { label: 'Yoast SEO', hint: 'Targets Yoast green-light metrics' },
  hybrid: { label: 'Hybrid Max', hint: 'Combines all SEO strategies for maximum coverage' },
  hcu: { label: 'HCU Optimized', hint: 'Helpful Content Update compliant writing' },
} as const;

export type SeoMode = keyof typeof SEO_MODES;

export const generateInputSchema = z.object({
  topic: z.string().min(3, 'Give the topic at least a few words.').max(200),
  language: z.string().min(2).default('English'),
  seoMode: z.enum(Object.keys(SEO_MODES) as [SeoMode, ...SeoMode[]]).default('full-seo'),
  /** Target length. The model is told to hit this, then measured against it. */
  targetWords: z.number().int().min(300).max(6000).default(1800),
  includeFaq: z.boolean().default(true),
  audience: z.string().max(200).optional(),
  /** Extra instructions appended verbatim to the drafting prompt. */
  notes: z.string().max(2000).optional(),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

export interface Claim {
  text: string;
  /** Index into the run's source list, or null when the model cited nothing. */
  sourceUri: string | null;
  verdict: 'supported' | 'unsupported' | 'contradicted';
  note?: string;
}

export interface ArticleMeta {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  focusKeyword: string;
  keywords: string[];
}

/** Accumulated state for the Generate Content pipeline. */
export interface GenerateState {
  input: GenerateInput;
  /** Grounded research brief, with citations attached to the run. */
  research?: string;
  /** What searchers actually want right now, and the angle that wins. */
  intent?: string;
  outline?: string[];
  markdown?: string;
  meta?: ArticleMeta;
  claims?: Claim[];
  warnings: string[];
}
