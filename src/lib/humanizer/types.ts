import { z } from 'zod';

/**
 * Stealth modes trade cost against how far the rewrite goes.
 *
 * Mini fixes surface tells. High restructures paragraphs, which is what is
 * actually needed when the problem is rhythm rather than vocabulary.
 */
export const STEALTH_MODES = {
  mini: {
    label: 'Stealth Mode 2.0 Mini',
    hint: 'Fast humanization',
    creditMultiplier: 1,
    /** Minimum human score to stop repairing at. */
    threshold: 70,
    maxRounds: 1,
    depth: 'Fix stock phrasing, punctuation and obvious tells. Keep sentence structure largely intact.',
  },
  medium: {
    label: 'Stealth Mode 2.0 Medium',
    hint: 'Deeper language refinement',
    creditMultiplier: 1.5,
    threshold: 80,
    maxRounds: 2,
    depth: 'Rewrite sentence by sentence. Vary rhythm deliberately, replace generic verbs, and break up even paragraphs.',
  },
  high: {
    label: 'Stealth Mode 2.0 High',
    hint: 'Maximum refinement',
    creditMultiplier: 2,
    threshold: 88,
    maxRounds: 3,
    depth: 'Restructure freely. Reorder sentences within paragraphs, merge and split them, and change how points are introduced, while keeping every fact identical.',
  },
} as const;

export type StealthMode = keyof typeof STEALTH_MODES;

export const MIN_WORDS = 50;
export const MAX_WORDS = 12000;

export const humanizeSchema = z.object({
  text: z.string().min(1, 'Paste some content to humanize.'),
  mode: z.enum(['mini', 'medium', 'high']).default('medium'),
  /** "auto" detects from the text rather than assuming English. */
  language: z.string().default('auto'),
  title: z.string().max(200).optional(),
  /** Set when humanizing an existing article from the library. */
  sourceArticleId: z.string().optional(),
});

export type HumanizeInput = z.infer<typeof humanizeSchema>;

export interface HumanizedArticle {
  id: string;
  title: string;
  mode: StealthMode;
  language: string;
  sourceText: string;
  humanizedText: string;
  words: number;
  scoreBefore: number;
  scoreAfter: number;
  /** Tells present before the rewrite, for the before/after panel. */
  tellsBefore: string[];
  tellsAfter: string[];
  createdAt: number;
}

export function creditsFor(words: number, mode: StealthMode): number {
  return Math.ceil((words / 100) * STEALTH_MODES[mode].creditMultiplier);
}
