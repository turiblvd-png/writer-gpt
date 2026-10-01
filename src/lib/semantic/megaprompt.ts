import type { RunClock } from '@/lib/pipeline/types';
import { houseStyle } from '@/lib/style/rules';
import type { SemanticProject } from './types';
import { keywordTargets, lengthBudget, splitKeywords, usefulPairs, usefulPhrases, usefulTerms } from './brief';
import { plannedOutline, requiredEntities } from './quality';
import { factSheetBlock } from './fact-block';
import type { ArticlePart, PartPlan } from './sections';

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
  /**
   * Brief for one part of an article written in parallel parts. Shared rules
   * come first and are identical for every part, so providers that cache
   * prompt prefixes only bill the part-specific tail in full.
   */
  part?: { part: ArticlePart; plan: PartPlan };
}

export function buildMegaPrompt(
  project: SemanticProject,
  clock: RunClock,
  opts: MegaPromptOptions = {},
): string {
  const { data, language } = project;
  const maxEntities = opts.maxEntities ?? 45;
  const maxNgrams = opts.maxNgrams ?? 25;
  const maxKeywords = opts.maxKeywords ?? 30;
  const maxSkipGrams = opts.maxSkipGrams ?? 15;
  const year = Number(clock.year);

  const excludedEntities = new Set(data.excludedEntities.map(lower));
  const excludedNgrams = new Set(data.excludedNgrams.map(lower));
  const excludedKeywords = new Set(data.excludedKeywords.map(lower));

  const keywords = splitKeywords(project.mainKeyword);
  const primary = keywords[0] ?? project.mainKeyword;
  const keywordSet = new Set(keywords.map(lower));

  const entities = data.entities
    .filter((e) => !excludedEntities.has(lower(e.name)) && !keywordSet.has(lower(e.name)))
    .slice(0, maxEntities);
  const ngrams = usefulPhrases(data.ngrams.filter((g) => !excludedNgrams.has(lower(g.text))), year, maxNgrams);
  const terms = usefulTerms(data.nlpKeywords.filter((k) => !excludedKeywords.has(lower(k.term))), year, maxKeywords);
  const pairs = usefulPairs(data.skipGrams, year, maxSkipGrams);
  const questions = (data.selectedQuestions.length ? data.selectedQuestions : data.autoSuggest).slice(0, 6);
  const outline = plannedOutline(project);
  const budget = lengthBudget(outline, data.wordCount.target);
  const targets = keywordTargets(keywords, budget.effective);
  const facts = data.facts;
  const hasUnconfirmed = Boolean(facts?.facts.some((f) => f.status === 'unconfirmed' || f.status === 'conflicting'));
  const part = opts.part?.part;

  const sections: string[] = [];

  sections.push(
    section('PRIORITY WHEN RULES CONFLICT', [
      '1. Factual accuracy  2. Usefulness to the reader  3. Style rules  4. SEO targets',
      'A lower priority never justifies breaking a higher one.',
    ]),
  );

  sections.push(
    section('BRIEF', part ? [
      `Topic: ${primary}`,
      `Language: ${language}`,
      `The whole article is about ${budget.effective.toLocaleString()} words, written as ${opts.part!.plan.parts.length} parts at the same time by different writers from this same brief. You write one part; its headings, length and targets are under YOUR PART at the end.`,
      `Section budget: about ${budget.perSection} words for a section without subheadings, ${budget.perH3} under each H3, two sentences per FAQ answer. Depth comes from specifics, not length.`,
      `Today's date: ${clock.today}. The current year is ${clock.year}.`,
    ] : [
      `Topic: ${primary}`,
      `Language: ${language}`,
      `Target length: ${budget.effective.toLocaleString()} words${data.wordCount.competitorAverage ? ` (competitor average: ${data.wordCount.competitorAverage.toLocaleString()})` : ''}.` +
        (budget.raised ? ` Raised from ${budget.requested.toLocaleString()} because the outline has ${budget.h2} H2 and ${budget.h3} H3 sections.` : ''),
      `Section budget: about ${budget.perSection} words for a section without subheadings, ${budget.perH3} under each H3, two sentences per FAQ answer. Depth comes from specifics, not length.`,
      `Today's date: ${clock.today}. The current year is ${clock.year}.`,
    ]),
  );

  if (facts && facts.facts.length) {
    sections.push(section('VERIFIED FACTS', factSheetBlock(facts, clock)));
  } else {
    sections.push(
      section('VERIFIED FACTS', [
        'No fact sheet is available. Do not state specific dates, prices, figures or names you cannot attribute to a named source. Where readers need such a detail, say it should be checked with the official source.',
      ]),
    );
  }

  if (!part) sections.push(
    section('ARTICLE OPENING', [
      `1. One H1, first. Use the main keyword once in it.`,
      `2. Directly under the H1: "Last updated: ${clock.today}".`,
      `3. Within the first 50 words, a one-sentence definition: "${primary} is ...". AI answers and featured snippets lift this line.`,
      '4. A "Key takeaways" block of 5 short bullets (not a heading, each under 15 words) that answers the main query. No table in the opening.',
      ...(hasUnconfirmed ? ['5. A short "Confirmed vs not yet announced" list, so readers know what to trust.'] : []),
    ]),
  );

  if (outline.length && !part) {
    sections.push(
      section('REQUIRED STRUCTURE', [
        'Follow this heading structure exactly, in order. Do not add, drop, reword or reorder headings. These headings are fixed, so ignore any general rule about heading wording.',
        ...(data.seoRules.includeFaq && questions.length ? ['Each FAQ heading is a question: answer it in the first one or two sentences under it, then stop.'] : []),
        'The Sources section, if present, lists only the sources named under VERIFIED FACTS.',
        '',
        ...outline.flatMap((h) => [
          `${'#'.repeat(Math.max(1, Math.min(6, h.level)))} ${h.text}`,
          ...(h.covers?.length ? [`   (note, not a heading: cover in prose under this heading: ${h.covers.join('; ')})`] : []),
        ]),
      ]),
    );
  }

  if (!part) sections.push(
    section('KEYWORDS', [
      ...targets.map((t) => `- "${t.term}": ${t.min} to ${t.max} times, exact phrase${t.primary ? ' (primary)' : ''}. Close variants also count toward relevance.`),
      'Uses of a longer keyword that contains a shorter one count toward both.',
      `Required placements for "${primary}": the H1, the first 100 words, at least one H2, the FAQ section and the final section.`,
      ...(targets.length > 1 ? [`Use "${targets[1]!.term}" in the section about it and in at least one FAQ answer.`] : []),
      'Going over the range reads as stuffing. Never bend a sentence to fit a keyword.',
    ]),
  );

  if (entities.length && !part) {
    // Coverage targets come from competitor document frequency: an entity every
    // ranking page names is required; one only a single page names is optional.
    const must = new Set(requiredEntities(project).map(lower));
    const bare = (e: { name: string }) => lower(e.name.replace(/\s*\(.*\)$/, ''));
    const required = entities.filter((e) => must.has(bare(e)));
    const optional = entities.filter((e) => !must.has(bare(e)));

    sections.push(
      section('ENTITY COVERAGE', [
        'Name entities explicitly, with their canonical name. A vague reference does not count as covering it.',
        'State how each entity relates to the topic as a plain subject-verb-object fact, using only the fact sheet.',
        '',
        ...(required.length
          ? ['REQUIRED (named by two or more ranking pages):',
             ...required.map((e) => `- ${e.name}${e.documentFrequency ? ` [${e.documentFrequency} pages]` : ''}`), '']
          : []),
        ...(optional.length
          ? ['OPTIONAL (differentiators). Include one only if the fact sheet connects it to the topic, and state that connection in the sentence. If there is no connection, skip it; an unrelated entity makes the page look like it is about something else.',
             ...optional.map((e) => `- ${e.name}`)]
          : []),
      ]),
    );
  }

  if (ngrams.length) {
    sections.push(
      section('PHRASES USED BY RANKING PAGES', [
        'Counted across the competitor pages. Use them where they fit naturally; never force one into a sentence that reads worse for it.',
        '',
        ...ngrams.map((g) => `- "${g.text}" (${g.count}× across ${g.documents} pages)`),
      ]),
    );
  }

  if (terms.length) {
    sections.push(
      section('HIGH-SALIENCE TERMS', [
        'These define the topic in the ranking pages (TF-IDF). Some may come from unrelated parts of those pages: ignore any that do not apply to this topic.',
        '',
        terms.map((k) => k.term).join(', '),
      ]),
    );
  }

  if (pairs.length) {
    sections.push(
      section('CONCEPT RELATIONSHIPS', [
        'These pairs co-occur in ranking content. Where the fact sheet supports it, write a sentence that states how they relate. Ignore any pair that does not apply.',
        '',
        ...pairs.map((p) => `- ${p.text.replace(' … ', ' ↔ ')} (${p.count}×)`),
      ]),
    );
  }

  if (questions.length) {
    sections.push(
      section('QUESTIONS TO ANSWER', [
        'Answer each directly in the first one or two sentences of its section, before any context.',
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
    section('PROJECT VOICE', [
      `Tone: ${g.tone}`,
      `Point of view: ${pov(g.pointOfView)}`,
      `Reading level: ${g.readingLevel}`,
      ...(g.avoidPhrases.length
        ? ['', 'Additional phrases this project bans:', g.avoidPhrases.map((p) => `"${p}"`).join(', ')]
        : []),
    ]),
  );

  const s = data.seoRules;
  sections.push(
    section('FORMAT AND SEO', [
      '- Paragraphs: one to three sentences, at most 50 words. Single-sentence paragraphs are fine.',
      `- No more than one sentence in five opens with a transition word. No more than ${s.maxPassiveRatio}% of sentences in passive voice.`,
      s.includeTables ? '- Use a markdown table wherever comparison genuinely helps (dates and times, prices, people, where to watch or buy). Do not add one for decoration.' : '',
      '- Where it applies, give local details: times with the time zone and a UTC or GMT conversion, prices in local currency with an approximate USD figure, entry or visa notes for visitors.',
      s.includeFaq ? '- The FAQ section answers the questions above, one question per heading.' : '',
      s.internalLinks ? `- Link naturally to these internal pages: ${s.internalLinks}` : '',
      s.externalLinksPolicy === 'cite-sources' ? '- Name the source once per section for prices, statistics and disputed figures. Not in every sentence: repeated "according to" makes the text choppy.' : '',
      '- Say each fact once, in the section it belongs to. Elsewhere refer to it briefly ("the October rest day") without restating the figures.',
      '- Put an entity only in a section where the reader is thinking about it. Never mention a name just to include it.',
    ].filter(Boolean)),
  );

  // The shared house style carries the natural-writing, AEO, NLP, reader-first
  // and factual rules, so all four tools hold the same bar.
  sections.push(houseStyle(clock, { originality: true }));

  if (data.aiInstructions.trim()) {
    sections.push(section('ADDITIONAL INSTRUCTIONS FROM THE USER', [data.aiInstructions.trim()]));
  }

  if (part) {
    sections.push(...partSections(opts.part!, { primary, questions, entities: entities.map((e) => e.name), hasUnconfirmed, includeFaq: data.seoRules.includeFaq, clock }));
    return sections.join('\n\n');
  }

  sections.push(
    section('BEFORE YOU RETURN, CHECK SILENTLY AND FIX', [
      '- Zero em dashes, and en dashes only between numbers.',
      '- No paragraph over three sentences or 50 words.',
      '- No banned word or pattern from the lists above.',
      '- Every specific traces to the VERIFIED FACTS; nothing is invented.',
      '- Every heading from the structure is present, in order.',
      '- Each FAQ answer stands alone in its first two sentences.',
      `- Length within 10% of ${budget.effective.toLocaleString()} words; keyword counts within their ranges.`,
    ]),
  );

  sections.push(
    section('OUTPUT', [
      'Return the complete article as markdown. Start with the single H1.',
      'No preamble, no commentary, no code fences around the article.',
    ]),
  );

  return sections.join('\n\n');
}

const FAQ_HEADING = /\b(faq|faqs|frequently asked|common questions|questions and answers)\b/i;
const SOURCES_HEADING = /^(sources?|references)\b/i;

/** The part-specific tail of a part brief: what this writer, and only this writer, must produce. */
function partSections(
  { part, plan }: { part: ArticlePart; plan: PartPlan },
  ctx: { primary: string; questions: string[]; entities: string[]; hasUnconfirmed: boolean; includeFaq: boolean; clock: RunClock },
): string[] {
  const mark = (h: { level: number; text: string }) => `${'#'.repeat(Math.max(1, Math.min(6, h.level)))} ${h.text}`;
  const mine = new Set(part.headings.map(mark));
  const asked = new Set(ctx.questions.map((q) => q.trim().replace(/\?$/, '').toLowerCase()));
  const hasFaq = part.headings.some((h) => FAQ_HEADING.test(h.text) || asked.has(h.text.trim().replace(/\?$/, '').toLowerCase()));
  const hasSources = part.headings.some((h) => SOURCES_HEADING.test(h.text.trim()));
  const others = ctx.entities.filter((e) => !part.entities.includes(e));
  const first = part.headings[0];
  const elsewhere = plan.parts.filter((p) => p !== part).flatMap((p) => p.facts);

  const out: string[] = [];
  out.push(
    section('FULL ARTICLE OUTLINE (context only)', [
      'Other writers cover the headings not marked as yours. Do not write about their subjects beyond a passing mention; repeating them makes the joined article repetitive.',
      '',
      ...plan.outline.map((h) => `${mark(h)}${mine.has(mark(h)) ? '   [YOUR PART]' : ''}`),
      '',
      'Whole-article rules: say each fact once, in its home section; never repeat a section that belongs to another writer.',
    ]),
  );

  out.push(
    section(`YOUR PART: ${part.index + 1} OF ${plan.parts.length}`, [
      `Length: about ${part.words.toLocaleString()} words (within 15%).`,
      '',
      ...(part.opening
        ? [
            'This part opens the article. Start with:',
            '1. The H1 below, exactly as written.',
            `2. Directly under it: "Last updated: ${ctx.clock.today}".`,
            `3. Within the first 50 words, a one-sentence definition: "${ctx.primary} is ...".`,
            '4. A "Key takeaways" block of 5 short bullets (not a heading, each under 15 words) with the most important confirmed facts. No table in the opening.',
            ...(ctx.hasUnconfirmed ? ['5. A short "Confirmed vs not yet announced" list, so readers know what to trust.'] : []),
            'Then continue with the rest of your headings.',
          ]
        : ['This part sits in the middle or end of the article. No introduction, no definition, no key takeaways and no summary of the whole article: start directly with your first heading.']),
      ...(part.last && !hasSources ? ['Your part ends the article. Close the final section with a practical next step for the reader, not a recap.'] : []),
      '',
      'Write exactly these headings, with these levels and this exact wording, in this order, and no others. The indented notes are guidance for you, not text or headings:',
      ...part.headings.flatMap((h, i) => [
        mark(h),
        `   (about ${part.headingWords[i] ?? 0} words${h.covers?.length ? `; cover in prose, without extra headings, whichever of these a reader needs: ${h.covers.join('; ')}` : ''})`,
      ]),
      ...(hasFaq ? ['', 'FAQ: answer each question in one or two sentences, then stop. Give the direct answer only; do not repeat details the body already explains.'] : []),
      ...(hasSources ? ['', 'Sources: list only the sources named under VERIFIED FACTS, with their URL where given, each described by what it is (organiser, ticket platform, broadcaster, third-party guide, encyclopedia, news outlet). Never call a third-party site official.'] : []),
      ...(part.facts.length || elsewhere.length ? [''] : []),
      ...(part.facts.length
        ? ['YOUR FACTS. These belong in your sections: state them in full here, once each.', ...part.facts.map((f) => `- ${f}`)]
        : []),
      ...(elsewhere.length
        ? ['', 'Every other fact on the sheet has its home in another part. Do not restate those figures (dates, prices, times, capacities). If your text needs one, refer to it briefly ("the October dates", "see tickets above") without the number. The opening\'s key takeaways are the only exception.']
        : []),
      '',
      'Use a table only where readers compare several items across the same attributes, and never for facts another part already states.',
    ]),
  );

  out.push(
    section('YOUR KEYWORD TARGETS', [
      ...part.keywords.map((k) => `- "${k.term}": ${k.min === k.max ? `${k.min}` : `${k.min} to ${k.max}`} times in your body text (headings do not count), exact phrase${k.primary ? ' (primary)' : ''}.`),
      'Elsewhere refer to it naturally ("the tournament", "the event", "it") rather than repeating the full name.',
      'Uses of a longer keyword that contains a shorter one count toward both.',
      ...(part.opening ? [`"${ctx.primary}" must appear in the H1 and in the first 100 words.`] : []),
      ...(hasFaq ? [`Use "${ctx.primary}" in at least one FAQ answer.`] : []),
      'Going over the range reads as stuffing. Never bend a sentence to fit a keyword.',
    ]),
  );

  out.push(
    section('YOUR ENTITIES', [
      ...(part.entities.length
        ? ['Name each of these where it fits your headings, with its canonical name, and state how it relates to the topic using only the fact sheet:', ...part.entities.map((e) => `- ${e}`)]
        : ['No entity is assigned to your part.']),
      ...(others.length
        ? ['', 'Other entities from the brief. Name one only if the reader of THIS section needs it; skip the rest. A name dropped in where it does not belong hurts the article:', others.join(', ')]
        : []),
    ]),
  );

  out.push(
    section('BEFORE YOU RETURN, CHECK SILENTLY AND FIX', [
      '- Zero em dashes, and en dashes only between numbers.',
      '- No paragraph over three sentences or 50 words.',
      '- No banned word or pattern from the lists above.',
      '- Every specific traces to the VERIFIED FACTS; nothing is invented.',
      '- Every one of your headings is present, in order, worded exactly as given, and no other heading.',
      '- No figure from another part\'s facts is restated, and none of your facts is stated twice.',
      '- No two numbers in your part disagree (times, dates, prices, counts).',
    ]),
  );

  out.push(
    section('OUTPUT', [
      `Return only your part as markdown, starting with the line: ${first ? mark(first) : 'the opening text'}`,
      'No preamble, no commentary, no code fences.',
    ]),
  );
  return out;
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

  if (!s.competitors) blocking.push('No competitor URLs added, there is nothing to build the brief from.');
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
