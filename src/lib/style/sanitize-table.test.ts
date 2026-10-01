import { describe, expect, it } from 'vitest';
import { sanitizeDraft } from './sanitize';

describe('dash cleanup keeps markdown intact', () => {
  it('never touches tables, code, links or ordinary hyphens', () => {
    const md = [
      '| Night | Price |',
      '|---|:---:|',
      '| 21-24 Oct | 150 SAR |',
      '',
      'A well-known event -- held in Riyadh — runs 21–24 October.',
      '',
      'See [the guide](https://example.com/six--kings-slam) or `npm run --watch`.',
      '',
      '```',
      'a -- b — c',
      '```',
    ].join('\n');
    const out = sanitizeDraft(md).text.split('\n');
    expect(out.slice(0, 3)).toEqual(['| Night | Price |', '|---|:---:|', '| 21-24 Oct | 150 SAR |']);
    expect(out[4]).toBe('A well-known event, held in Riyadh, runs 21–24 October.');
    expect(out[6]).toBe('See [the guide](https://example.com/six--kings-slam) or `npm run --watch`.');
    expect(out[9]).toBe('a -- b — c');
  });
});
