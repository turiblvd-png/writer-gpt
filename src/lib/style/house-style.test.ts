import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The product bans em dashes in generated articles, so its own interface must
 * not use them either. Caught in review: the brand voice picker read
 * "Automatic — infer from source".
 */
function walk(dir: string, ext: string[]): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, ext);
    return ext.some((e) => entry.endsWith(e)) ? [full] : [];
  });
}

/** The one legitimate use: an em dash as a glyph meaning "no value set". */
const ALLOWED = [/\|\|\s*'—'/];

/** Everything whose text a user can read: components, pages, and prose in lib. */
const UI_FILES = () => [
  ...walk('src/app', ['.tsx']),
  ...walk('src/components', ['.tsx']),
  'src/lib/semantic/steps.ts',
  'src/lib/content/types.ts',
  'src/lib/humanizer/types.ts',
  'src/lib/rewrite/types.ts',
];

describe('house style, applied to our own UI', () => {
  it('uses no em dashes in interface copy', () => {
    const offenders: string[] = [];

    // Covers lib copy too: the step descriptions are user-facing prose and had
    // an em dash that a .tsx-only scan missed.
    for (const file of UI_FILES()) {
      const source = readFileSync(file, 'utf8');
      source.split('\n').forEach((line, i) => {
        if (!line.includes('—')) return;
        if (ALLOWED.some((re) => re.test(line))) return;
        offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }

    expect(offenders).toEqual([]);
  });

  it('uses no em dashes in strings anywhere in lib: progress messages, errors and prompts', () => {
    // Progress logs reach the UI ("Checked 2 claims — 1 supported" did), and
    // prompts teach the model by example, so both are held to the same rule.
    const SKIP = /style\/(patterns|sanitize|detect)\.ts$|\.test\.ts$/;
    const offenders: string[] = [];
    for (const file of walk('src/lib', ['.ts']).filter((f) => !SKIP.test(f))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim();
        const code = t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') ? '' : line.split('//')[0]!;
        if (code.includes('—') && /['"`]/.test(code)) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the banned-phrase list out of our own copy too', () => {
    const banned = /\b(delve into|game-?changer|seamlessly|in today'?s digital age|rich tapestry)\b/i;
    const offenders: string[] = [];

    for (const file of UI_FILES()) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (banned.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
