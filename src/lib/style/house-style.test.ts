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

describe('house style, applied to our own UI', () => {
  it('uses no em dashes in interface copy', () => {
    const offenders: string[] = [];

    for (const file of walk('src/app', ['.tsx']).concat(walk('src/components', ['.tsx']))) {
      const source = readFileSync(file, 'utf8');
      source.split('\n').forEach((line, i) => {
        if (!line.includes('—')) return;
        if (ALLOWED.some((re) => re.test(line))) return;
        offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the banned-phrase list out of our own copy too', () => {
    const banned = /\b(delve into|game-?changer|seamlessly|in today'?s digital age|rich tapestry)\b/i;
    const offenders: string[] = [];

    for (const file of walk('src/app', ['.tsx']).concat(walk('src/components', ['.tsx']))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (banned.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
