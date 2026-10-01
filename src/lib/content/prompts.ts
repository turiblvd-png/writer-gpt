import type { RunClock } from '@/lib/pipeline/types';
import { houseStyle, systemPreamble } from '@/lib/style/rules';
import { SEO_MODES, type GenerateInput, type SeoMode } from './types';

/**
 * Shared preamble for every model call in every pipeline.
 *
 * Three rules, each traceable to an observed failure:
 *  1. The date is stated, never inferred. A model asked about a recurring event
 *     defaults to the most recent one in its training data.
 *  2. Unverified specifics are forbidden. The failure that motivated this was a
 *     confident, plausible, invented claim about a venue rename.
 *  3. Uncertainty is reported, not smoothed over. A gap the writer can fill is
 *     worth more than a fluent guess.
 */
export function baseSystem(clock: RunClock, language: string): string {
  return systemPreamble(clock, language);
}

export function researchPrompt(input: GenerateInput, clock: RunClock): string {
  return [
    `Research the topic: "${input.topic}"`,
    '',
    `Search the web for what is true and current as of ${clock.today}. Then write a research brief covering:`,
    '',
    '1. STATUS NOW: Is this topic time-bound (an event, release, season, ranking, price)? If so, what is the state of it right now, and what is the next upcoming instance with its date? If it is evergreen, say so.',
    '2. KEY FACTS: The specific, checkable facts a reader needs. Attach the source for each. Mark anything you could not verify as UNVERIFIED.',
    '3. RECENT CHANGES: What changed in the last 12 months that an older article would get wrong.',
    '4. OPEN QUESTIONS: What a reader will want to know that you could not confirm.',
    '',
    'Be concrete. Dates, numbers and names beat description. If search results conflict, report both and say which is better sourced.',
  ].join('\n');
}

export function intentPrompt(input: GenerateInput, research: string, clock: RunClock): string {
  return [
    `Topic: "${input.topic}"`,
    input.audience ? `Intended audience: ${input.audience}` : '',
    '',
    'Research brief:',
    research,
    '',
    `Given it is ${clock.today}, analyse search intent and decide the angle.`,
    '',
    'Cover:',
    '- DOMINANT INTENT: What is somebody searching this actually trying to do right now: understand, decide, buy, attend, or troubleshoot? If the topic is time-bound, live intent is usually about the *next* instance, not past ones.',
    '- WINNABLE ANGLE: Competing head-on for a generic head term against Wikipedia or an official site is not winnable. Name the specific, modified query this article should own, and say why it is reachable.',
    '- MUST-ANSWER QUESTIONS: The 5 to 8 questions the page has to answer to satisfy that intent.',
    '- WHAT TO LEAVE OUT: Tempting material that does not serve the intent.',
    '',
    'Be decisive. Recommend one angle, not a menu.',
  ].join('\n');
}

export function outlinePrompt(
  input: GenerateInput,
  research: string,
  intent: string,
  clock: RunClock,
): string {
  return [
    `Topic: "${input.topic}"`,
    `Target length: roughly ${input.targetWords} words.`,
    `SEO mode: ${SEO_MODES[input.seoMode].label}, ${SEO_MODES[input.seoMode].hint}`,
    '',
    'Research brief:',
    research,
    '',
    'Intent analysis:',
    intent,
    '',
    `Produce the heading outline. It is ${clock.today}; the structure must serve current intent.`,
    '',
    'Requirements:',
    `- Between 6 and 12 H2 sections, sized to the ${input.targetWords}-word target.`,
    '- Use H3s to nest detail. A flat wall of H2s is a failure.',
    input.includeFaq ? '- Include an FAQ section whose H3s are real questions people ask.' : '- Do not include an FAQ section.',
    '- Front-load the sections that answer the dominant intent.',
    '- Headings must be specific and descriptive, not one-word labels.',
    '',
    'Return JSON only, no prose:',
    '{ "headings": ["## First section", "### A nested detail", "## Second section"] }',
    'Each string must start with its markdown heading marker (## or ###).',
  ].join('\n');
}

export function draftPrompt(
  input: GenerateInput,
  research: string,
  intent: string,
  outline: string[],
  clock: RunClock,
): string {
  return [
    `Write the full article on "${input.topic}".`,
    '',
    'Research brief (your only source of facts):',
    research,
    '',
    'Intent analysis (the angle to hold):',
    intent,
    '',
    'Outline to follow exactly:',
    outline.join('\n'),
    '',
    `Length: about ${input.targetWords} words.`,
    `SEO mode: ${SEO_MODES[input.seoMode].label}, ${modeGuidance(input.seoMode)}`,
    '',
    houseStyle(clock),
    '',
    'Task rules:',
    '- Start with an H1, then follow the outline headings in order.',
    '- Every fact must trace to the research brief. If the brief marks something UNVERIFIED, omit it or write that it is unconfirmed.',
    input.notes ? `\nAdditional instructions from the user:\n${input.notes}` : '',
    '',
    'Return the article as markdown only. No preamble, no commentary, no code fences.',
  ].filter(Boolean).join('\n');
}

function modeGuidance(mode: SeoMode): string {
  switch (mode) {
    case 'nlp-semantic':
      return 'Build explicit entity relationships. Name entities precisely and state how they relate in subject-predicate-object form.';
    case 'rank-math':
      return 'Keyword in title, first paragraph, a third of subheadings, and the URL. Keep density near 1%.';
    case 'yoast':
      return 'Short paragraphs, under 20% long sentences, over 30% transition words, under 10% passive voice.';
    case 'hybrid':
      return 'Apply entity modelling, keyword placement and readability targets together, prioritising readability on conflict.';
    case 'hcu':
      return 'Demonstrate first-hand experience and specific expertise. No filler, no restating the question, no padding.';
    case 'full-seo':
    default:
      return 'Balanced on-page optimisation with a genuine FAQ section answering real questions.';
  }
}

export function metaPrompt(input: GenerateInput, markdown: string, clock: RunClock): string {
  return [
    'Produce SEO metadata for this article.',
    '',
    markdown.slice(0, 6000),
    '',
    'Rules:',
    '- seoTitle: 50–60 characters. Put the focus keyword at the start. Include a number and one power word where it reads naturally.',
    `- If the article is about something time-bound, put ${clock.year} in the title, year modifiers carry high intent.`,
    '- metaDescription: 140–155 characters, contains the focus keyword, and gives a reason to click.',
    '- slug: lowercase, hyphenated, under 60 characters, contains the focus keyword, no stop-word padding.',
    '- focusKeyword: the single phrase this page should rank for. 2–5 words. Not a full sentence.',
    '- keywords: 6–10 supporting phrases actually used in the article.',
    '',
    'Return JSON only:',
    '{ "seoTitle": "", "metaDescription": "", "slug": "", "focusKeyword": "", "keywords": [] }',
  ].join('\n');
}

/**
 * The anti-fabrication pass. Re-reads the finished draft against live search and
 * flags claims the research does not support. This is the step that would have
 * caught the invented venue-rename claim.
 */
export function verifyPrompt(markdown: string, research: string, clock: RunClock): string {
  return [
    `It is ${clock.today}. Fact-check this draft.`,
    '',
    'Research brief the draft was written from:',
    research,
    '',
    'Draft:',
    markdown.slice(0, 12000),
    '',
    'Extract every checkable factual claim, dates, names, venues, numbers, scores, prices, superlatives, "first/only/largest" statements. Ignore opinion and generic description.',
    '',
    'For each, search to confirm it, then classify:',
    '- "supported": the research or a search result confirms it.',
    '- "unsupported": you cannot confirm it. Includes anything the draft states confidently that the brief never mentioned.',
    '- "contradicted": a source says otherwise. Say what the source says.',
    '',
    'Be strict. A plausible-sounding specific with no source is "unsupported", not "supported".',
    '',
    'Return JSON only:',
    '{ "claims": [ { "text": "", "sourceUri": null, "verdict": "supported", "note": "" } ] }',
  ].join('\n');
}
