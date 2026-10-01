import type { RunClock } from '@/lib/pipeline/types';
import { systemPreamble } from '@/lib/style/rules';
import type { CompetitorOutline, SemanticProject } from './types';
import { maxSectionsFor } from './brief';

const rules = (clock: RunClock, language: string) => systemPreamble(clock, language);

export function combineOutlinesPrompt(
  project: SemanticProject,
  outlines: CompetitorOutline[],
  clock: RunClock,
): string {
  const sizes = maxSectionsFor(project.data.wordCount.target);
  const rendered = outlines
    .filter((o) => o.headings.length)
    .map((o) => [`--- ${o.domain} ---`, ...o.headings.map((h) => `H${h.level}: ${h.text}`)].join('\n'))
    .join('\n\n');

  return [
    rules(clock, project.language),
    '',
    `Main keyword: "${project.mainKeyword}"`,
    '',
    'Competitor heading structures:',
    rendered,
    '',
    'Merge these into ONE outline that covers everything the competitors cover, plus the gaps they leave.',
    '',
    'Rules:',
    '- Drop site chrome that is not article content (navigation, "Related posts", newsletter prompts, cookie notices).',
    '- Merge headings that say the same thing in different words. Never keep two sections on the same subject (one accessibility section, one streaming section).',
    `- Order the H2s as the questions a reader searching "${project.mainKeyword}" asks, in the order they ask them (for an event: what and when, can I go, tickets, what it is like there, how to watch, background; for a product: is it good, who is it for, price, downsides, alternatives; for a how-to: short answer, what you need, steps, mistakes, fixes).`,
    '- Every H2 and H3 is a question a searcher asks or a concrete claim ("When Is X 2026?", "Ticket prices by category"). Never a vague label like "Overview", "Details" or "Tickets and entry".',
    '- Each topic has one home. Never put a subject under a heading where the reader is not thinking about it (no broadcasting inside the player section).',
    '- Use an H3 only when its H2 section will run past about 250 words AND has clearly separate parts; then give it at least two. A section under 80 words does not get its own heading.',
    `- Size it for about ${project.data.wordCount.target} words, about one heading per 200 to 300 words: at most ${sizes.h2} H2s and ${sizes.h3} H3s outside the FAQ. Merge or cut the least useful sections to stay within that.`,
    '- Add headings for subtopics the competitors miss but a reader would want. Mark those with "gap": true.',
    '- One H1 only, first. Use the main keyword once in it; do not repeat it.',
    '- Do not include a "Key takeaways" or "Introduction" heading; the article opens with those without a heading.',
    '- Include an H2 for frequently asked questions near the end, with up to 6 real search questions as their own H3s, ones the body does not already answer in full.',
    '- End with an H2 "Sources".',
    `- If the topic is time-bound, the structure must serve ${clock.year}, not a past edition.`,
    '',
    'Return JSON only:',
    '{ "headings": [ { "level": 1, "text": "", "gap": false } ] }',
  ].join('\n');
}

export function contentAnalysisPrompt(project: SemanticProject, corpus: string, clock: RunClock): string {
  return [
    rules(clock, project.language),
    '',
    `Main keyword: "${project.mainKeyword}"`,
    '',
    'Competitor article text:',
    corpus.slice(0, 40000),
    '',
    'Analyse how these pages are written, in under 250 words. Cover:',
    '- Tone and register, with a short example phrase.',
    '- Sentence and paragraph length; how scannable the pages are.',
    '- Vocabulary level and how much jargon is assumed.',
    '- Which structural devices earn their place (tables, lists, direct answers under headings).',
    '- The clearest weakness shared across them, the opening for a better article.',
    '',
    'Be specific and concrete. Do not pad. Return prose, not JSON.',
  ].join('\n');
}

export function entityPrompt(project: SemanticProject, corpus: string, clock: RunClock): string {
  return [
    rules(clock, project.language),
    '',
    `Main keyword: "${project.mainKeyword}"`,
    corpus ? `\nCompetitor content:\n${corpus.slice(0, 40000)}` : '',
    '',
    'Identify the named entities relevant to this topic, in three groups.',
    '',
    'Entities are real-world things a knowledge graph holds: people, organisations, places, products, events, technologies, standards, brands. They are NOT generic noun phrases, "tennis tournament" is not an entity; "ATP Tour" is.',
    '',
    corpus
      ? '1. "competitor": entities that actually appear in the competitor text above. Only include ones genuinely present; do not add plausible extras.'
      : '1. "competitor": leave this array empty, since no competitor content was supplied.',
    '2. "ai": entities strongly associated with this topic that a thorough article should name, whether or not the competitors do.',
    '3. "unique": entities that are genuinely relevant but that competitors are likely missing. These are the differentiators. Be specific: named bodies, specific rules, specific products.',
    '',
    'Use each entity\'s canonical name. Expand abbreviations on first use, e.g. "ATP (Association of Tennis Professionals)".',
    'Do not duplicate an entity across groups.',
    '',
    'Return JSON only:',
    '{ "competitor": [""], "ai": [""], "unique": [""] }',
  ].join('\n');
}

export function questionsPrompt(project: SemanticProject, clock: RunClock): string {
  return [
    rules(clock, project.language),
    '',
    `Main keyword: "${project.mainKeyword}"`,
    '',
    `Search for what people actually ask about this, as of ${clock.today}. Use autocomplete continuations, People Also Ask style queries and forum questions.`,
    '',
    'Return 12–18 real questions. Rules:',
    '- Phrase each as a searcher would type it, not as a marketer would write a heading.',
    `- If the topic is time-bound, most live intent concerns ${clock.year} or the next upcoming instance. Weight accordingly.`,
    '- Cover the whole intent range: what/how/when/where/who, cost, comparison, troubleshooting.',
    '- No duplicates that differ only in wording.',
    '',
    'Return a plain list, one question per line, no numbering, no JSON, no commentary.',
  ].join('\n');
}

export function verifyPrompt(markdown: string, facts: string, clock: RunClock): string {
  return [
    `It is ${clock.today}. Check this draft against the fact sheet it was written from.`,
    '',
    facts ? `FACT SHEET:\n${facts}\n` : 'FACT SHEET: (none)\n',
    'DRAFT:',
    markdown.slice(0, 30000),
    '',
    'Find the specifics in the draft that a reader could act on or be misled by: dates, times, names, venues, numbers, scores, prices, and "first/only/largest" claims.',
    '',
    'Classify each:',
    '- "supported": the fact sheet states it, in any wording. A paraphrase, a rounded figure, a unit conversion or a fact derived directly from the sheet is supported.',
    '- "unsupported": a specific the fact sheet does not state.',
    '- "contradicted": the fact sheet says otherwise; say what it says.',
    'Ignore opinion, advice, generic description, the headings, and stable background knowledge (for example what a well-known company or city is).',
    'List each distinct claim once, even if the draft repeats it.',
    '',
    'Return JSON only, listing ONLY claims that are not supported, contradicted ones first, at most 25:',
    '{ "claims": [ { "text": "", "verdict": "unsupported", "note": "" } ] }',
  ].join('\n');
}

/**
 * The final editor. It returns a few exact-text edits rather than a rewrite:
 * small output, so it is fast, and nothing it does can break the structure.
 */
export function editPrompt(markdown: string, facts: string, clock: RunClock, repeats: { text: string; count: number }[]): string {
  return [
    `It is ${clock.today}. You are the final editor of the article below, written in parts by several writers. Return a short list of exact text edits; do not rewrite the article.`,
    '',
    facts ? `FACT SHEET (the truth for this article):\n${facts}\n` : 'FACT SHEET: (none)\n',
    ...(repeats.length ? ['REPEATED FIGURES (measured):', ...repeats.map((r) => `- "${r.text}" appears ${r.count} times`), ''] : []),
    'ARTICLE:',
    markdown.slice(0, 40000),
    '',
    'Fix, in this order of importance:',
    '1. Contradictions: two places that disagree (dates, times, prices, counts, who broadcasts it), or anything that contradicts the fact sheet. Keep what the fact sheet supports; if it supports neither, say plainly that it is not yet confirmed.',
    '2. Wrong counts and superlatives (for example "four champions" when the sheet names three). Correct or remove.',
    '3. Repetition: a figure or fact stated in full more than once outside the Key takeaways. Keep it in the section it belongs to; elsewhere cut it to a brief reference or delete the sentence.',
    '4. Forced names: an entity mentioned where the reader of that section has no reason to meet it. Delete that clause.',
    '5. Attribution overload: the same source named more than once in a section ("according to", "X lists"). Keep the first.',
    '',
    'Rules for each edit:',
    '- "find" is copied character for character from the article, at least 12 characters, within one paragraph. Never a heading, a table row or a link.',
    '- "replace" is the corrected text; "" deletes it. Keep the voice, no em dashes, no new facts.',
    '- Make each "find" long enough to occur only once.',
    '- At most 30 edits. Skip anything you are not sure is wrong.',
    '',
    'Return JSON only:',
    '{ "edits": [ { "find": "", "replace": "", "why": "" } ] }',
  ].join('\n');
}

export function metaPrompt(project: SemanticProject, markdown: string, clock: RunClock): string {
  return [
    rules(clock, project.language),
    '',
    `Focus keyword: "${project.mainKeyword}"`,
    '',
    markdown.slice(0, 6000),
    '',
    'Produce SEO metadata.',
    '- seoTitle: 50–60 characters, focus keyword at the start, include a number and one power word where natural.',
    `- If the topic is time-bound, include ${clock.year}, year modifiers carry high intent.`,
    '- metaDescription: 140–155 characters, contains the focus keyword, gives a reason to click.',
    '- slug: lowercase, hyphenated, under 60 characters, contains the focus keyword.',
    '- altTexts: 3 to 5 alt texts for images this article should carry (venue, people, tables as images, maps). Each under 125 characters, literal and descriptive, keyword only where it is true.',
    '',
    'Return JSON only:',
    '{ "seoTitle": "", "metaDescription": "", "slug": "", "altTexts": [""] }',
  ].join('\n');
}
