import type { RunClock } from '@/lib/pipeline/types';
import type { SemanticProject } from './types';

/**
 * Compiles all 14 stages into the single brief the writer receives.
 *
 * This is the whole point of the workspace. A one-shot prompt asks a model to
 * recall a topic; this hands it measured evidence — the phrases competitors
 * actually use, entities with coverage targets derived from how many ranking
 * pages mention them, and the questions searchers actually ask — plus explicit
 * limits on what it may assert. The model composes; it does not remember.
 */

export interface MegaPromptOptions {
  /** Cap on how many items of each kind are injected, to keep the brief usable. */
  maxEntities?: number;
  maxNgrams?: number;
  maxKeywords?: number;
  maxSkipGrams?: number;
}

export function buildMegaPrompt(
  project: SemanticProject,
  clock: RunClock,
  opts: MegaPromptOptions = {},
): string {
  const { data, mainKeyword, language } = project;
  const maxEntities = opts.maxEntities ?? 45;
  const maxNgrams = opts.maxNgrams ?? 35;
  const maxKeywords = opts.maxKeywords ?? 40;
  const maxSkipGrams = opts.maxSkipGrams ?? 20;

  const excludedEntities = new Set(data.excludedEntities.map(lower));
  const excludedNgrams = new Set(data.excludedNgrams.map(lower));
  const excludedKeywords = new Set(data.excludedKeywords.map(lower));

  const entities = data.entities.filter((e) => !excludedEntities.has(lower(e.name))).slice(0, maxEntities);
  const ngrams = data.ngrams.filter((g) => !excludedNgrams.has(lower(g.text))).slice(0, maxNgrams);
  const keywords = data.nlpKeywords.filter((k) => !excludedKeywords.has(lower(k.term))).slice(0, maxKeywords);
  const skipGrams = data.skipGrams.slice(0, maxSkipGrams);
  const questions = data.selectedQuestions.length ? data.selectedQuestions : data.autoSuggest.slice(0, 8);

  const sections: string[] = [];

  sections.push(
    section('BRIEF', [
      `Main keyword: ${mainKeyword}`,
      `Language: ${language}`,
      `Target length: ${data.wordCount.target} words${data.wordCount.competitorAverage ? ` (competitor average: ${data.wordCount.competitorAverage})` : ''}`,
      `Today's date: ${clock.today}. The current year is ${clock.year}.`,
    ]),
  );

  if (data.combinedOutline.length) {
    sections.push(
      section('REQUIRED STRUCTURE', [
        'Follow this heading structure exactly, in order. Do not add, drop or reorder headings.',
        '',
        ...data.combinedOutline.map((h) => `${'#'.repeat(Math.max(1, Math.min(6, h.level)))} ${h.text}`),
      ]),
    );
  }

  if (entities.length) {
    // Coverage targets come from competitor document frequency: an entity every
    // ranking page names is required; one only a single page names is optional.
    const required = entities.filter((e) => (e.documentFrequency ?? 0) >= 2);
    const optional = entities.filter((e) => (e.documentFrequency ?? 0) < 2);

    sections.push(
      section('ENTITY COVERAGE', [
        'Name these entities explicitly and correctly. Entities are how search engines classify a page — referring to something vaguely does not count as covering it.',
        '',
        ...(required.length
          ? ['REQUIRED (named by two or more ranking competitors — the article is incomplete without them):',
             ...required.map((e) => `- ${e.name}${e.documentFrequency ? ` [in ${e.documentFrequency} competitor pages]` : ''}`), '']
          : []),
        ...(optional.length
          ? ['WORTH INCLUDING (differentiators — these are where you beat the competitors):',
             ...optional.map((e) => `- ${e.name}`)]
          : []),
      ]),
    );
  }

  if (ngrams.length) {
    sections.push(
      section('PHRASES USED BY RANKING PAGES', [
        'These phrases were counted across the competitor corpus. Work them in where they fit naturally. Never force one into a sentence that reads worse for it.',
        '',
        ...ngrams.map((g) => `- "${g.text}" (${g.count}× across ${g.documents} pages)`),
      ]),
    );
  }

  if (keywords.length) {
    sections.push(
      section('HIGH-SALIENCE TERMS', [
        'Ranked by TF-IDF against the competitor corpus — these define the topic rather than merely appearing in it.',
        '',
        keywords.map((k) => k.term).join(', '),
      ]),
    );
  }

  if (skipGrams.length) {
    sections.push(
      section('CONCEPT RELATIONSHIPS', [
        'These pairs co-occur repeatedly in ranking content. Write sentences that genuinely relate them, rather than listing both.',
        '',
        ...skipGrams.map((s) => `- ${s.text.replace(' … ', ' ↔ ')} (${s.count}×)`),
      ]),
    );
  }

  if (questions.length) {
    sections.push(
      section('QUESTIONS TO ANSWER', [
        'Answer each directly, in its own section, in the first two sentences under the heading. A direct answer is what wins featured snippets and AI Overview citations.',
        '',
        ...questions.map((q) => `- ${q}`),
      ]),
    );
  }

  if (data.contentAnalysis) {
    sections.push(
      section('COMPETITOR STYLE ANALYSIS', [
        'Match or exceed this depth. Do not imitate weaknesses.',
        '',
        data.contentAnalysis,
      ]),
    );
  }

  const g = data.grammar;
  sections.push(
    section('VOICE & STYLE', [
      `Tone: ${g.tone}`,
      `Point of view: ${pov(g.pointOfView)}`,
      `Reading level: ${g.readingLevel}`,
      g.sentenceVariety ? 'Vary sentence length deliberately. Follow a long sentence with a short one.' : '',
      '',
      'Never use these phrases — they are the clearest signal that nobody with expertise wrote the page:',
      g.avoidPhrases.map((p) => `"${p}"`).join(', '),
    ].filter(Boolean)),
  );

  const s = data.seoRules;
  sections.push(
    section('SEO TARGETS', [
      `Keyword density: about ${s.targetKeywordDensity}% for "${mainKeyword}". Going over reads as stuffing and is penalised.`,
      `At least ${s.minTransitionRatio}% of sentences should open with a transition word.`,
      `No more than ${s.maxPassiveRatio}% of sentences in passive voice.`,
      s.includeKeyTakeaways ? '- Open with a short key-takeaways block that answers the query immediately.' : '',
      s.includeTables ? '- Use a markdown table wherever comparison genuinely helps. Do not add one for decoration.' : '',
      s.includeFaq ? '- Include an FAQ section built from the questions above.' : '',
      s.internalLinks ? `- Link naturally to these internal pages: ${s.internalLinks}` : '',
      s.externalLinksPolicy === 'cite-sources' ? '- Cite external sources for statistics and quoted claims.' : '',
    ].filter(Boolean)),
  );

  sections.push(
    section('WRITE FOR THE READER FIRST', [
      'Every rule above is subordinate to this one. If following a keyword target makes a sentence worse, the sentence wins.',
      '',
      '- Answer the question in the first two sentences. No preamble, no restating the title.',
      '- Give specifics: dates, numbers, names, steps. Vague advice is worthless and ranks accordingly.',
      '- Cut any sentence that carries no information. Padding to hit a word count is self-defeating.',
      '- Write as somebody who has actually done this, not as somebody summarising what others wrote.',
    ]),
  );

  sections.push(
    section('FACTUAL LIMITS — NON-NEGOTIABLE', [
      `It is ${clock.today}. Your training data is older than that. Never assume the most recent event, edition or release you remember is the current one.`,
      '',
      '- Every specific — name, date, venue, score, price, statistic, quote — must come from the research supplied above.',
      '- If a detail is not in the brief, omit it or state plainly that it is unconfirmed. Do not resolve uncertainty by guessing.',
      '- A plausible-sounding invented specific is the worst possible output. It is worse than leaving a gap.',
      '- For anything that changes over time, anchor it: name the year, or write "as of <date>".',
      '- Never fabricate a citation or attribute a claim to a source that does not support it.',
    ]),
  );

  if (data.aiInstructions.trim()) {
    sections.push(section('ADDITIONAL INSTRUCTIONS FROM THE USER', [data.aiInstructions.trim()]));
  }

  sections.push(
    section('OUTPUT', [
      'Return the complete article as markdown. Start with a single H1.',
      'No preamble, no commentary, no code fences around the article.',
    ]),
  );

  return sections.join('\n\n');
}

function section(heading: string, lines: string[]): string {
  return `${'═'.repeat(70)}\n${heading}\n${'═'.repeat(70)}\n${lines.join('\n')}`;
}

function pov(p: string): string {
  if (p === 'first-person-plural') return 'First person plural ("we"). Speak as the publication.';
  if (p === 'third-person') return 'Third person. No "you" or "we".';
  return 'Second person ("you"). Address the reader directly.';
}

const lower = (s: string) => s.toLowerCase().trim();

/** Coverage summary for the Review stage. */
export function reviewSummary(project: SemanticProject) {
  const d = project.data;
  const extracted = d.competitorContent.filter((c) => !c.error && c.words > 0);

  return {
    competitors: d.competitors.length,
    outlinesExtracted: d.outlines.filter((o) => !o.error && o.headings.length > 0).length,
    headings: d.combinedOutline.length,
    contentExtracted: extracted.length,
    corpusWords: extracted.reduce((sum, c) => sum + c.words, 0),
    entities: d.entities.length - d.excludedEntities.length,
    ngrams: d.ngrams.length - d.excludedNgrams.length,
    keywords: d.nlpKeywords.length - d.excludedKeywords.length,
    skipGrams: d.skipGrams.length,
    questions: (d.selectedQuestions.length ? d.selectedQuestions : d.autoSuggest).length,
    targetWords: d.wordCount.target,
  };
}

/** Blocking and advisory gaps, shown before the user spends a generation. */
export function reviewWarnings(project: SemanticProject): { blocking: string[]; advisory: string[] } {
  const s = reviewSummary(project);
  const blocking: string[] = [];
  const advisory: string[] = [];

  if (!s.competitors) blocking.push('No competitor URLs added — there is nothing to build the brief from.');
  if (!s.headings) blocking.push('No outline. Extract competitor outlines or add headings manually.');

  if (!s.contentExtracted) {
    advisory.push('No competitor content extracted, so n-grams, salience and entity counts are unmeasured.');
  }
  if (!s.entities) advisory.push('No entities selected. Entity coverage is the core of semantic optimisation.');
  if (s.corpusWords > 0 && s.corpusWords < 1500) {
    advisory.push(`Corpus is only ${s.corpusWords} words. Phrase statistics from this little text are unreliable.`);
  }
  if (!s.questions) advisory.push('No questions selected, so the article will not target featured snippets.');

  return { blocking, advisory };
}
