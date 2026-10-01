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
  let inFence = false;

  const out = text
    .split('\n')
    .map((line) => {
      // Code blocks and tables are never touched: a table's |---| separator
      // row is made of hyphens, and rewriting it destroys the table.
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || /^\s*\|/.test(line)) return line;

      // Links and inline code keep their characters exactly.
      const kept: string[] = [];
      const masked = line.replace(/`[^`]*`|\]\([^)]*\)|https?:\/\/\S+/g, (m) => {
        kept.push(m);
        return `\u0000${kept.length - 1}\u0000`;
      });

      const fixed = masked
        // Line-leading dash is a bullet, not punctuation.
        .replace(/^(\s*)[—–](\s+)/, (_m, indent: string, space: string) => {
          replaced++;
          return `${indent}-${space}`;
        })
        // ASCII double hyphen standing in for an em dash, between words only.
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
        .replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ')
        .replace(/[ \t]+$/, '');

      return fixed.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)]!);
    })
    .join('\n');

  return { text: out, emDashesReplaced: replaced, changed: replaced > 0 || out !== text };
}

/** Full cleanup pass for generated markdown. */
export function sanitizeDraft(markdown: string): SanitizeResult {
  // Models sometimes wrap the whole article in a fence despite instructions.
  // Unwrapped first, so the dash cleanup does not take it for a code block.
  const unwrapped = markdown.replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n?```\s*$/i, '$1');
  const dashes = replaceEmDashes(unwrapped);
  const text = dashes.text
    // Normalise runaway blank lines without touching intentional spacing.
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return { text, emDashesReplaced: dashes.emDashesReplaced, changed: text !== markdown };
}
