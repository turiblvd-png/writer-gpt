import { complete } from '@/lib/ai';
import { makeClock } from '@/lib/pipeline/engine';
import { countWords } from '@/lib/seo/text';
import { detectTells, tellsAsInstructions } from '@/lib/style/detect';
import { sanitizeDraft } from '@/lib/style/sanitize';
import { NATURAL_WRITING_RULES, NLP_RULES, USER_FIRST_RULES, systemPreamble } from '@/lib/style/rules';
import { saveHumanized } from './store';
import { MAX_WORDS, MIN_WORDS, STEALTH_MODES, type HumanizeInput, type HumanizedArticle } from './types';

export class HumanizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HumanizeError';
  }
}

/**
 * Rewrites AI-sounding text so it reads as though a person wrote it.
 *
 * Two passes, because they solve different problems. The first is a full
 * rewrite guided by the tells actually present in this text, rather than a
 * generic "make it sound human" instruction. The second is the shared repair
 * loop, which re-measures and fixes whatever survived. Facts are held constant
 * throughout: this is a style operation, and a humanizer that quietly alters a
 * date or a figure is worse than useless.
 */
export async function humanize(
  input: HumanizeInput,
  opts: { signal?: AbortSignal; onProgress?: (m: string) => void } = {},
): Promise<HumanizedArticle> {
  const clock = makeClock();
  const words = countWords(input.text);

  if (words < MIN_WORDS) {
    throw new HumanizeError(`Needs at least ${MIN_WORDS} words. You pasted ${words}.`);
  }
  if (words > MAX_WORDS) {
    throw new HumanizeError(`Limit is ${MAX_WORDS.toLocaleString()} words. You pasted ${words.toLocaleString()}.`);
  }

  const mode = STEALTH_MODES[input.mode];
  const language = input.language === 'auto' ? detectLanguage(input.text) : input.language;

  // Measure first, so the rewrite is told what is actually wrong with this text.
  const before = detectTells(input.text);
  opts.onProgress?.(`Analysed: ${before.humanScore}/100, ${before.hits.length} pattern(s) found.`);

  const findings = tellsAsInstructions(before);

  opts.onProgress?.(`Rewriting in ${mode.label}…`);
  const res = await complete('draft', {
    system: systemPreamble(clock, language),
    prompt: humanizePrompt(input.text, findings, mode.depth, language),
    temperature: 0.85,
    maxOutputTokens: Math.min(32000, Math.ceil(words * 3) + 1200),
    signal: opts.signal,
  });

  let humanizedText = sanitizeDraft(res.text).text;
  if (!humanizedText.trim()) throw new HumanizeError('The model returned nothing.');

  let after = detectTells(humanizedText);

  // Second pass, only if the rewrite did not clear the bar for this mode.
  if (after.humanScore < mode.threshold && mode.maxRounds > 1) {
    const { enforceStyle } = await import('@/lib/style/repair');
    const enforced = await enforceStyle(humanizedText, {
      clock,
      language,
      threshold: mode.threshold,
      maxRounds: mode.maxRounds - 1,
      signal: opts.signal,
      onProgress: opts.onProgress,
    });
    humanizedText = enforced.markdown;
    after = enforced.after;
  }

  opts.onProgress?.(`Done: ${before.humanScore} → ${after.humanScore}/100.`);

  return saveHumanized({
    title: input.title?.trim() || deriveTitle(humanizedText, input.text),
    mode: input.mode,
    language,
    sourceText: input.text,
    humanizedText,
    words: countWords(humanizedText),
    scoreBefore: before.humanScore,
    scoreAfter: after.humanScore,
    tellsBefore: before.hits.map((h) => `${h.label} (${h.count}×)`),
    tellsAfter: after.hits.map((h) => `${h.label} (${h.count}×)`),
  });
}

function humanizePrompt(text: string, findings: string[], depth: string, language: string): string {
  return [
    `Rewrite the text below so it reads as though an experienced human writer produced it. Write in ${language}.`,
    '',
    `How far to go: ${depth}`,
    '',
    ...(findings.length
      ? ['Automated analysis found these specific problems. Every one must be gone from your output:',
         ...findings.map((f) => `- ${f}`), '']
      : []),
    NATURAL_WRITING_RULES,
    '',
    NLP_RULES,
    '',
    USER_FIRST_RULES,
    '',
    'ABSOLUTE CONSTRAINTS',
    '',
    '- Preserve every fact exactly: names, dates, numbers, prices, statistics, quotes, URLs and product names must survive unchanged.',
    '- Do not add any claim that is not in the source. Do not remove information.',
    '- Keep the heading structure and the markdown formatting.',
    '- Keep the length within 10% of the source.',
    '- Preserve the meaning of every paragraph. You are changing how it is said, not what is said.',
    '',
    'Text to rewrite:',
    text,
    '',
    'Return the rewritten text only. No preamble, no commentary, no notes about what you changed, no code fences.',
  ].join('\n');
}

/**
 * Crude language detection from stop-word hits. Enough to avoid the common
 * failure of rewriting a Spanish article into English because the UI defaulted
 * to "Automatic (English)".
 */
export function detectLanguage(text: string): string {
  const sample = text.toLowerCase().slice(0, 4000);
  const markers: [string, RegExp][] = [
    ['Spanish', /\b(que|para|como|pero|porque|también|más|está|son|del)\b/g],
    ['French', /\b(que|pour|avec|dans|cette|être|plus|sont|mais|leur)\b/g],
    ['German', /\b(und|der|die|das|nicht|sich|auch|eine|werden|kann)\b/g],
    ['Portuguese', /\b(que|para|como|mais|não|uma|com|dos|são|pelo)\b/g],
    ['Italian', /\b(che|per|come|sono|nella|questo|anche|della|più|dei)\b/g],
    ['Dutch', /\b(het|een|van|niet|ook|deze|wordt|zijn|maar|voor)\b/g],
    ['English', /\b(the|and|that|with|this|from|have|which|about|would)\b/g],
  ];

  let best = 'English';
  let bestScore = 0;
  for (const [language, re] of markers) {
    const hits = (sample.match(re) ?? []).length;
    if (hits > bestScore) {
      bestScore = hits;
      best = language;
    }
  }
  return best;
}

function deriveTitle(humanized: string, source: string): string {
  const heading = /^\s{0,3}#{1,3}\s+(.+)$/m.exec(humanized)?.[1]?.trim();
  if (heading) return heading.slice(0, 120);

  const firstLine = source.split('\n').map((l) => l.trim()).find((l) => l.length > 10);
  return (firstLine ?? 'Humanized content').slice(0, 80);
}
