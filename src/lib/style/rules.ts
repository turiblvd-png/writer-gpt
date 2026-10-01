import type { RunClock } from '@/lib/pipeline/types';
import { PHRASE_TELLS } from './patterns';

/**
 * The house style, shared by all four tools.
 *
 * Kept in one module so Generate Content, Semantic Writer, Humanizer and
 * Rewrite from URL cannot drift apart. Every block here exists because of a
 * specific failure mode, and the detector in ./detect.ts measures whether the
 * output actually complied, so these are enforced rather than merely requested.
 */

/** The phrases the detector will flag, fed to the model so it avoids them up front. */
export function bannedPhraseList(): string {
  return PHRASE_TELLS
    .filter((t) => t.severity !== 'minor')
    .map((t) => t.label.replace(/^"|"$/g, ''))
    .join(', ');
}

/**
 * Punctuation and phrasing rules. The em dash ban is absolute: it is the single
 * most recognisable machine tell in English prose, and a sanitiser strips any
 * that survive, so producing them only makes the output worse.
 */
export const NATURAL_WRITING_RULES = `WRITE LIKE A PERSON, NOT A MODEL

Punctuation:
- Never use an em dash or an en dash as punctuation. Use a comma, a colon, or start a new sentence. En dashes are allowed only between numbers, as in "October 15-18".
- Do not use semicolons to join clauses a full stop would handle better.

Banned phrasing, without exception:
${bannedPhraseList()}

Rhythm, which matters more than vocabulary:
- Vary sentence length deliberately. Follow a 30-word sentence with a 5-word one. Prose where every sentence runs 15 to 20 words reads as generated even when the words are fine.
- Start most sentences with the subject. No more than one sentence in five may open with a transition word.
- Do not open consecutive paragraphs with the same construction.
- Avoid the three-item list as a default rhythm. Use two items, or four, when that is what is true.

Tone:
- Do not hedge reflexively. "This usually takes two days" beats "this may potentially take approximately two days".
- Do not announce what you are about to do. Do it.
- Answer directly under each heading, but do not copy the heading's wording into the first sentence.
- No rhetorical questions as openers. No "It's not just X, it's Y". No "Here's the thing". No exclamation marks.
- Do not end every section with a summary sentence. Stop when the point is made.
- Do not open with "From X to Y". Do not use a mid-sentence colon for drama ("The answer: simple.").
- Cut any sentence that would not be missed. Padding to reach a word count is self-defeating.
- No cheerleading. Do not call anything revolutionary, powerful or essential. Show the reader and let them judge.`;

/**
 * Answer Engine and LLM optimisation.
 *
 * Getting cited by an AI answer is a different problem from ranking a blue link:
 * the passage has to be extractable and verifiable on its own, without the
 * surrounding page for context.
 */
export const AEO_LLM_RULES = `BUILT TO BE QUOTED BY SEARCH AND AI ANSWERS

- Answer the question in the first two sentences under its heading, in plain declarative form, before any context or caveats. This is the passage an answer engine lifts.
- Make every heading a question or a concrete claim, never a one-word label.
- Write self-contained passages. Each section must make sense quoted alone, so name the subject instead of relying on "it", "this" or "the above".
- Attach specifics to claims: dates, figures, names, versions. A sentence with a number in it is citable; a sentence of adjectives is not.
- Where a fact has a source, say what the source is in the sentence.
- Use tables for genuine comparison and short lists for genuine sequences. Do not decorate.
- State the answer before the reasoning, then give the reasoning.`;

/**
 * Google NLP optimisation: what the Natural Language API actually parses.
 * Entity salience is computed from how clearly and often an entity is the
 * grammatical subject, so pronoun-heavy prose dilutes it.
 */
export const NLP_RULES = `PARSEABLE BY GOOGLE'S NATURAL LANGUAGE API

- Prefer subject-verb-object order. Keep the subject near the verb.
- Name entities explicitly on first use in each section, with their canonical name. Do not carry a subject across paragraphs by pronoun alone.
- Expand an abbreviation on first use, then use it consistently.
- Write in active voice. Passive is acceptable only when the actor is genuinely unknown or irrelevant.
- One idea per sentence. Split anything carrying two independent clauses joined by "and".
- Keep each paragraph to one point: one to three sentences, at most 50 words. A single-sentence paragraph is fine.
- State relationships between entities as plain subject-verb-object facts, e.g. "The Model Y is made by Tesla, so it charges at Tesla Superchargers." These are the sentences knowledge graphs and AI answers extract.`;

/** User-first, in the Helpful Content sense: written by someone who knows the thing. */
export const USER_FIRST_RULES = `WRITE FOR THE READER FIRST

This rule outranks every SEO instruction above. If hitting a keyword target makes a sentence worse, the sentence wins.

- Open by answering what the reader came for. No preamble, no scene-setting.
- Be specific enough to act on. Give the number, the step, the exact name.
- Say the useful thing even when it is inconvenient: the limitation, the cheaper alternative, the case where this does not apply.
- Write with the practical knowledge of someone who has done this: the order of steps, the catch, the cheaper option. Do not claim first-person experience ("when I went", "we tested") you cannot have.
- If you do not know something, say so plainly. A stated gap is worth more than a confident guess.`;

/** Originality: the point of a rewrite is to be better, not to be different. */
export const ORIGINALITY_RULES = `OUTRANK THE SOURCES, DO NOT ECHO THEM

- Never reuse a source's sentence structure. Read the fact, then write it your own way from scratch.
- Do not paraphrase sentence by sentence. Reorganise around what the reader needs first, which is rarely the order the source used.
- Add what the sources omit: the practical consequence, the exception, the comparison they avoided, the question they left hanging.
- Where sources agree on a weak framing, say so and give a better one.
- Match every fact in the sources. Copy none of their wording.`;

/** Factual limits. The date is stated because models default to their training cutoff. */
export function factualRules(clock: RunClock): string {
  return `FACTUAL LIMITS, NON-NEGOTIABLE

- Today is ${clock.today}. The current year is ${clock.year}. Your training data is older than that, so never assume the most recent event, edition or release you remember is the current one.
- Every specific, meaning names, dates, venues, scores, prices, statistics and quotes, must come from the material supplied to you. If a detail is not there, leave it out or say plainly that it is unconfirmed.
- A plausible-sounding invented specific is the worst possible output. It is worse than a gap.
- For anything that changes over time, anchor it: name the year, or write "as of ${clock.today}".
- Never fabricate a citation or attribute a claim to a source that does not support it.`;
}

/**
 * The full house style. Ordering is deliberate: mechanics first, then the
 * optimisation rules, then the reader-first override, then the factual limits
 * last so they are the most recent instruction before the task.
 */
export function houseStyle(clock: RunClock, opts: { originality?: boolean } = {}): string {
  return [
    NATURAL_WRITING_RULES,
    AEO_LLM_RULES,
    NLP_RULES,
    opts.originality ? ORIGINALITY_RULES : '',
    USER_FIRST_RULES,
    factualRules(clock),
  ].filter(Boolean).join('\n\n');
}

/** Compact system preamble for every model call across all four tools. */
export function systemPreamble(clock: RunClock, language: string): string {
  return [
    `Today is ${clock.today}. The current year is ${clock.year}.`,
    `Write in ${language}.`,
    '',
    'Hard rules:',
    '- Never use em dashes. Use commas, colons or separate sentences.',
    '- Never use stock AI phrasing. No "delve into", "in today\'s digital age", "it is important to note", "game-changer", "tapestry", "landscape", "seamless", "leverage", "robust".',
    '- Vary sentence length. Uniform rhythm is the clearest machine tell.',
    '- Never invent a specific. If it is not in the supplied material, leave it out.',
  ].join('\n');
}
