import { z } from 'zod';

export interface BrandVoice {
  id: string;
  name: string;
  /** Free-text description of tone, vocabulary and habits. */
  description: string;
  /** Phrases this brand never uses, on top of the shared banned list. */
  avoidPhrases: string[];
  createdAt: number;
}

export const WORD_COUNT_OPTIONS = [500, 750, 1000, 1500, 2000, 2500, 3000] as const;

export const rewriteSchema = z.object({
  url: z.string().min(4, 'Paste the URL of the article to rewrite.'),
  /** "auto" infers the voice from the source page. */
  brandVoiceId: z.string().default('auto'),
  /** "same" keeps the source language. */
  targetLanguage: z.string().default('same'),
  targetWords: z.number().int().min(300).max(6000).default(1000),
});

export type RewriteInput = z.infer<typeof rewriteSchema>;

export interface RewrittenArticle {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  markdown: string;
  language: string;
  brandVoiceId: string;
  words: number;
  humanScore: number;
  /** Highest overlap with the source found in any window, 0–1. */
  similarityToSource: number;
  /** Facts the rewrite dropped or could not carry across. */
  factWarnings: string[];
  createdAt: number;
}

export const DEFAULT_VOICES: Omit<BrandVoice, 'id' | 'createdAt'>[] = [
  {
    name: 'Plain and direct',
    description: 'Short sentences. Concrete nouns. No hype, no hedging. Explains the thing and stops.',
    avoidPhrases: ['revolutionary', 'cutting-edge', 'best-in-class'],
  },
  {
    name: 'Expert practitioner',
    description:
      'Writes as somebody who has done the work. Names specifics, admits limitations, and mentions the case where the advice does not apply.',
    avoidPhrases: ['simply', 'just', 'effortlessly'],
  },
  {
    name: 'Consumer guide',
    description:
      'Addresses the reader directly as "you". Leads with the decision they need to make, then the evidence. Prices and dates up front.',
    avoidPhrases: ['dive in', 'let us explore'],
  },
];
