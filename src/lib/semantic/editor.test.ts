import { describe, expect, it } from 'vitest';
import { applyEdits, repeatedSpecifics, thinSections } from './quality';

describe('final editor helpers', () => {
  const md = [
    '# Guide',
    '',
    'It runs October 21-24 at the arena. Tickets cost 150 SAR.',
    '',
    '## Dates',
    '',
    'The event runs October 21-24. Doors open at 7:30 PM. Sessions start at 8:30 PM.',
    '',
    '## Tickets',
    '',
    'Seats for October 21-24 cost 150 SAR. Remember October 21-24.',
    '',
    '| Night | Price |',
    '|---|---|',
    '| October 21-24 | 150 SAR |',
  ].join('\n');

  it('measures figures repeated more than three times, outside headings and tables too', () => {
    const r = repeatedSpecifics(md);
    expect(r[0]).toMatchObject({ text: 'October 21-24' });
    expect(r[0]!.count).toBeGreaterThanOrEqual(4);
  });

  it('applies exact edits and refuses ones that touch headings, tables or are too short', () => {
    const { markdown, applied } = applyEdits(md, [
      { find: 'Remember October 21-24.', replace: '' },
      { find: 'Sessions start at 8:30 PM.', replace: 'Sessions start at 7:30 PM.' },
      { find: '## Dates', replace: '## When' },
      { find: '|---|---|', replace: '' },
      { find: 'short', replace: 'x' },
      { find: 'not in the article at all', replace: 'x' },
    ]);
    expect(applied).toHaveLength(2);
    expect(markdown).not.toContain('Remember');
    expect(markdown).toContain('Sessions start at 7:30 PM.');
    expect(markdown).toContain('## Dates');
    expect(markdown).toContain('|---|---|');
  });

  it('flags headings with a fragment under them, but not FAQ questions or Sources', () => {
    const doc = '# T\n\n## Real\n\n' + 'word '.repeat(60) + '\n\n## Thin\n\nTwo sentences only. That is all.\n\n## FAQ\n\n### Is it short?\n\nYes.\n\n## Sources\n\n- A';
    expect(thinSections(doc)).toEqual(['Thin']);
  });
});
