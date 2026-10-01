import { complete } from '@/lib/ai';
import { makeClock } from '@/lib/pipeline/engine';
import { extractContent } from '@/lib/semantic/extract';
import { safeDomain, normaliseUrl } from '@/lib/semantic/url';
import { countWords } from '@/lib/seo/text';
import { detectTells } from '@/lib/style/detect';
import { enforceStyle } from '@/lib/style/repair';
import { sanitizeDraft } from '@/lib/style/sanitize';
import { systemPreamble } from '@/lib/style/rules';
import { detectLanguage } from '@/lib/humanizer/humanize';
import * as P from './prompts';
import { getBrandVoice, saveRewritten } from './store';
import { measureSimilarity, similarityVerdict } from './similarity';
import type { RewriteInput, RewrittenArticle } from './types';

export class RewriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RewriteError';
  }
}

/**
 * Fetches a public article, extracts its facts, and writes a new article that
 * carries those facts in the user's voice with none of the original wording.
 *
 * The facts are extracted into an explicit list first, and the writer works from
 * that list rather than from the source prose. Handing a model the source and
 * asking it to "rewrite" reliably produces clause-level paraphrase, which reads
 * as duplicate content and never outranks the original. Similarity is then
 * measured, and a rewrite that still tracks the source is redone once.
 */
export async function rewriteFromUrl(
  input: RewriteInput,
  opts: { signal?: AbortSignal; onProgress?: (m: string) => void } = {},
): Promise<RewrittenArticle> {
  const clock = makeClock();
  const url = normaliseUrl(input.url);

  opts.onProgress?.('Fetching the source page…');
  const source = await extractContent(url);
  if (source.error) throw new RewriteError(`Could not read that page: ${source.error}`);
  if (source.words < 120) {
    throw new RewriteError(`That page has only ${source.words} words of readable text. Try a full article URL.`);
  }
  opts.onProgress?.(`Read ${source.words.toLocaleString()} words from ${source.domain}.`);

  const sourceLanguage = detectLanguage(source.text);
  const language = input.targetLanguage === 'same' ? sourceLanguage : input.targetLanguage;
  const system = systemPreamble(clock, language);

  const voice = input.brandVoiceId === 'auto' ? null : await getBrandVoice(input.brandVoiceId);
  let inferredVoice: string | null = null;

  if (!voice) {
    opts.onProgress?.('Analysing the source voice…');
    const res = await complete('reason', {
      system,
      prompt: P.inferVoicePrompt(source.text, language),
      temperature: 0.3,
      signal: opts.signal,
    });
    inferredVoice = res.text.trim();
  }

  opts.onProgress?.('Extracting the facts to preserve…');
  const factsRes = await complete('structure', {
    system,
    prompt: P.extractFactsPrompt(source.text, language),
    temperature: 0.1,
    signal: opts.signal,
  });
  const facts = factsRes.text.trim();
  if (!facts) throw new RewriteError('Could not extract any facts from that page.');

  let markdown = '';
  let similarity = measureSimilarity('', source.text);
  let verdict = similarityVerdict(similarity);

  // Two attempts at most: the retry is what makes the originality guarantee
  // real, but a third pass rarely improves on the second and doubles the cost.
  for (let attempt = 1; attempt <= 2; attempt++) {
    opts.onProgress?.(attempt === 1 ? 'Writing in your brand voice…' : 'Rewriting for originality…');

    const res = await complete('draft', {
      system,
      prompt: P.rewritePrompt({
        facts,
        sourceText: source.text,
        voice,
        inferredVoice,
        language,
        targetWords: input.targetWords,
        clock,
        originalityFeedback: attempt === 2 ? verdict.message : undefined,
      }),
      temperature: attempt === 1 ? 0.75 : 0.9,
      maxOutputTokens: Math.min(32000, Math.ceil(input.targetWords * 3)),
      signal: opts.signal,
    });

    markdown = sanitizeDraft(res.text).text;
    if (!markdown.trim()) throw new RewriteError('The model returned an empty article.');

    similarity = measureSimilarity(markdown, source.text);
    verdict = similarityVerdict(similarity);
    opts.onProgress?.(verdict.message);
    if (verdict.ok) break;
  }

  opts.onProgress?.('Checking for AI writing patterns…');
  const enforced = await enforceStyle(markdown, {
    clock,
    language,
    signal: opts.signal,
    onProgress: opts.onProgress,
  });
  markdown = enforced.markdown;

  // A style repair can reintroduce source phrasing, so re-measure afterwards.
  similarity = measureSimilarity(markdown, source.text);
  verdict = similarityVerdict(similarity);

  opts.onProgress?.('Verifying the facts survived…');
  const factWarnings: string[] = [];
  try {
    const check = await complete('verify', {
      system,
      prompt: P.factCheckPrompt(markdown, facts, language),
      temperature: 0.1,
      signal: opts.signal,
    });
    const missing = check.text.trim();
    if (missing && !/^none\b/i.test(missing)) {
      factWarnings.push(
        ...missing.split('\n').map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 12),
      );
    }
  } catch {
    factWarnings.push('Fact verification did not complete. Check the article against the source before publishing.');
  }

  if (!verdict.ok) factWarnings.unshift(verdict.message);

  const final = detectTells(markdown);
  opts.onProgress?.(`Done: ${countWords(markdown).toLocaleString()} words, human score ${final.humanScore}/100.`);

  return saveRewritten({
    sourceUrl: url,
    sourceDomain: safeDomain(url),
    title: firstHeading(markdown) || `Rewrite of ${safeDomain(url)}`,
    markdown,
    language,
    brandVoiceId: input.brandVoiceId,
    words: countWords(markdown),
    humanScore: final.humanScore,
    similarityToSource: similarity.containment,
    factWarnings,
  });
}

function firstHeading(markdown: string): string {
  return /^\s{0,3}#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
}
