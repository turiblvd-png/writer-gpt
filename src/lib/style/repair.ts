import { complete, type ModelRole } from '@/lib/ai';
import type { RunClock } from '@/lib/pipeline/types';
import { detectTells, tellsAsInstructions, type StyleReport } from './detect';
import { sanitizeDraft } from './sanitize';
import { NATURAL_WRITING_RULES } from './rules';

/**
 * Measure a draft, and if it still reads like machine output, send the specific
 * findings back for one repair pass.
 *
 * Asking a model to "write naturally" is unreliable; telling it "you used
 * 'delve into' twice and every sentence is 17 words, fix those" is not. The
 * detector turns a style preference into a measurement, which is the only way
 * the no-AI-tells requirement can be enforced rather than hoped for.
 */

export interface EnforceOptions {
  clock: RunClock;
  language: string;
  role?: ModelRole;
  /** Repair below this human score. 100 would loop forever on fine prose. */
  threshold?: number;
  /** Repair rounds to attempt. Each one costs a model call. */
  maxRounds?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface EnforceResult {
  markdown: string;
  before: StyleReport;
  after: StyleReport;
  rounds: number;
  /** True when the text still fails the threshold after every round. */
  stillFlagged: boolean;
}

export async function enforceStyle(input: string, opts: EnforceOptions): Promise<EnforceResult> {
  const threshold = opts.threshold ?? 75;
  const maxRounds = opts.maxRounds ?? 2;

  let markdown = sanitizeDraft(input).text;
  const before = detectTells(markdown);
  let current = before;
  let rounds = 0;

  while (current.humanScore < threshold && rounds < maxRounds) {
    const instructions = tellsAsInstructions(current);
    // Nothing actionable left; another round would only churn the text.
    if (!instructions.length) break;

    rounds++;
    opts.onProgress?.(`Repairing style, round ${rounds} (score ${current.humanScore}/100)…`);

    const res = await complete(opts.role ?? 'draft', {
      prompt: repairPrompt(markdown, instructions, opts.language),
      temperature: 0.75,
      maxOutputTokens: Math.min(32000, Math.ceil(current.words * 3) + 1200),
      signal: opts.signal,
    });

    const repaired = sanitizeDraft(res.text).text;
    const next = detectTells(repaired);

    // Keep the repair only if it actually improved. A model can make things
    // worse, and silently accepting that would defeat the point of measuring.
    if (next.humanScore <= current.humanScore) {
      opts.onProgress?.(`Round ${rounds} did not improve the score, keeping the better version.`);
      break;
    }

    markdown = repaired;
    current = next;
  }

  return {
    markdown,
    before,
    after: current,
    rounds,
    stillFlagged: current.humanScore < threshold,
  };
}

function repairPrompt(markdown: string, instructions: string[], language: string): string {
  return [
    `Rewrite the article below to remove specific writing problems. Keep it in ${language}.`,
    '',
    'Problems found by automated analysis, all of which must be fixed:',
    ...instructions.map((line) => `- ${line}`),
    '',
    NATURAL_WRITING_RULES,
    '',
    'Constraints:',
    '- Keep every fact, figure, name and date exactly as written. This is a style edit, not a rewrite of the content.',
    '- Keep the heading structure identical.',
    '- Keep roughly the same length.',
    '- Do not add new claims, and do not remove information.',
    '',
    'Article:',
    markdown,
    '',
    'Return the corrected article as markdown only. No preamble, no commentary, no code fences.',
  ].join('\n');
}
