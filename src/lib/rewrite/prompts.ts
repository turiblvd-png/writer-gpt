import type { RunClock } from '@/lib/pipeline/types';
import { houseStyle } from '@/lib/style/rules';
import type { BrandVoice } from './types';

export function inferVoicePrompt(sourceText: string, language: string): string {
  return [
    `Read this article and describe its writing voice in under 120 words. Respond in ${language}.`,
    '',
    sourceText.slice(0, 12000),
    '',
    'Cover tone, sentence length, how formal it is, who it addresses, and any habits worth keeping.',
    'Describe the voice only. Do not summarise the content, and do not judge the quality.',
  ].join('\n');
}

export function extractFactsPrompt(sourceText: string, language: string): string {
  return [
    `Extract every checkable fact from this article. Respond in ${language}.`,
    '',
    sourceText.slice(0, 30000),
    '',
    'List names, dates, figures, prices, statistics, locations, product names and quoted claims.',
    'One fact per line, stated plainly. Do not add anything the article does not say.',
    'Do not include opinion, description or marketing language.',
    '',
    'Return the list only, one per line, no numbering.',
  ].join('\n');
}

export function rewritePrompt(opts: {
  facts: string;
  sourceText: string;
  voice: BrandVoice | null;
  inferredVoice: string | null;
  language: string;
  targetWords: number;
  clock: RunClock;
  /** Set on a retry when the first attempt tracked the source too closely. */
  originalityFeedback?: string;
}): string {
  const voiceBlock = opts.voice
    ? [
        `BRAND VOICE: ${opts.voice.name}`,
        opts.voice.description,
        ...(opts.voice.avoidPhrases.length
          ? [`This brand never uses: ${opts.voice.avoidPhrases.join(', ')}`]
          : []),
      ].join('\n')
    : `BRAND VOICE, inferred from the source page:\n${opts.inferredVoice ?? 'Neutral and informative.'}`;

  return [
    `Write a new article covering the same subject as the source below. Write in ${opts.language}. Target about ${opts.targetWords} words.`,
    '',
    'FACTS THAT MUST SURVIVE',
    'Every one of these must appear in your article, accurate and unchanged:',
    opts.facts,
    '',
    voiceBlock,
    '',
    ...(opts.originalityFeedback
      ? ['ORIGINALITY PROBLEM WITH YOUR PREVIOUS ATTEMPT', opts.originalityFeedback,
         'Start over from the facts. Do not look at the source sentence order. Decide what the reader needs first and build the article around that.', '']
      : []),
    houseStyle(opts.clock, { originality: true }),
    '',
    'HOW TO USE THE SOURCE',
    '- Take the facts. Leave the wording.',
    '- Do not follow the source\'s section order unless it genuinely serves the reader best.',
    '- Do not paraphrase sentence by sentence. Read a fact, look away, then write it your way.',
    '- Beat the source: answer what it left unanswered, and add the practical consequence it skipped.',
    '',
    'SOURCE ARTICLE, for facts only:',
    opts.sourceText.slice(0, 30000),
    '',
    'Return the article as markdown, starting with an H1. No preamble, no commentary, no code fences.',
  ].join('\n');
}

export function factCheckPrompt(rewrite: string, facts: string, language: string): string {
  return [
    `Check that the rewritten article carries every required fact. Respond in ${language}.`,
    '',
    'Required facts:',
    facts,
    '',
    'Rewritten article:',
    rewrite.slice(0, 24000),
    '',
    'List only the facts that are MISSING from the article, or that the article states differently from the list.',
    'One per line. If a fact is present and correct in any wording, do not list it.',
    'If everything is present and correct, return the single word NONE.',
  ].join('\n');
}
