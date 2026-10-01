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
    `- Order sections by what a reader searching "${project.mainKeyword}" needs first, not by what competitors happen to do.`,
    '- Every H2 and H3 is a question a searcher asks or a concrete claim ("When Is X 2026?", "Ticket prices by category"). Never a vague label like "Overview", "Details" or "Tickets and entry".',
    '- Use H3s to nest detail under H2s. A flat list of H2s is a failure, but so is an H2 with one H3.',
    `- Size it for about ${project.data.wordCount.target} words: at most ${sizes.h2} H2s and ${sizes.h3} H3s in total. Merge or cut the least useful sections to stay within that.`,
    '- Add headings for subtopics the competitors miss but a reader would want. Mark those with "gap": true.',
    '- One H1 only, first. Use the main keyword once in it; do not repeat it.',
    '- Do not include a "Key takeaways" or "Introduction" heading; the article opens with those without a heading.',
    '- Include an H2 for frequently asked questions near the end, with each question as its own H3.',
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
    markdown.slice(0, 14000),
    '',
    'Extract every checkable specific in the draft: dates, names, venues, numbers, scores, prices, and "first/only/largest" claims. Ignore opinion and generic description.',
    '',
    'Classify each: "supported" (the fact sheet states it), "unsupported" (the fact sheet does not state it), or "contradicted" (the fact sheet says otherwise; say what).',
    '',
    'Be strict. A plausible-sounding specific that is not on the fact sheet is "unsupported".',
    '',
    'Return JSON only:',
    '{ "claims": [ { "text": "", "verdict": "supported", "note": "" } ] }',
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
