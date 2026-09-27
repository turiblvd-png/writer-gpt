import { DOUBLE_HYPHEN } from './patterns';

/**
 * Deterministic cleanup applied to every draft before it is saved.
 *
 * The prompts forbid these constructions, but models still produce them, so this
 * is the safety net that makes "no em dashes" an actual guarantee rather than a
 * request. It only makes changes that cannot alter meaning.
 */

export interface SanitizeResult {
  text: string;
  emDashesReplaced: number;
  changed: boolean;
}

/**
 * Replace an em dash with the punctuation a careful writer would have used.
 *
 * A comma is grammatical almost everywhere an em dash appears, so it is the
 * default. The exceptions handled here are the cases where a comma would be
 * wrong or ugly: next to existing punctuation, at the start of a line (where the
 * dash is acting as a bullet), and before a list-introducing clause.
 */
export function replaceEmDashes(text: string): SanitizeResult {
  let replaced = 0;

  const out = text
    // Line-leading dash is a bullet, not punctuation.
    .replace(/^(\s*)[—–](\s+)/gm, (_m, indent: string, space: string) => {
      replaced++;
      return `${indent}-${space}`;
    })
    // ASCII double hyphen standing in for an em dash.
    .replace(DOUBLE_HYPHEN, () => {
      replaced++;
      return ', ';
    })
    // The real case: an em dash (or an en dash not between numbers) mid-sentence.
    .replace(/\s*(—|(?<!\d\s?)–(?!\s?\d))\s*/g, (match, _d, offset: number, whole: string) => {
      replaced++;
      const before = whole.slice(Math.max(0, offset - 1), offset).trim();
      const after = whole.slice(offset + match.length, offset + match.length + 1);

      // Already punctuated on the left, so only the dash needs removing.
      if (/[,;:.!?]/.test(before)) return ' ';
      // A capital letter after usually starts an independent clause.
      if (/[A-Z]/.test(after)) return '. ';
      return ', ';
    })
    // Collapse any doubled punctuation the replacements could have produced.
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');

  return { text: out, emDashesReplaced: replaced, changed: replaced > 0 || out !== text };
}

/** Full cleanup pass for generated markdown. */
export function sanitizeDraft(markdown: string): SanitizeResult {
  const dashes = replaceEmDashes(markdown);
  const text = dashes.text
    // Models sometimes wrap the whole article in a fence despite instructions.
    .replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n?```\s*$/i, '$1')
    // Normalise runaway blank lines without touching intentional spacing.
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return { text, emDashesReplaced: dashes.emDashesReplaced, changed: text !== markdown };
}
