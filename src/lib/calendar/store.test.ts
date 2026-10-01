import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-cal-')), 'data.json');
});

describe('content calendar', () => {
  it('validates real calendar dates', async () => {
    const { isValidDate } = await import('./store');
    expect(isValidDate('2026-10-31')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('31/10/2026')).toBe(false);
  });

  it('adds, filters by range, updates and removes', async () => {
    const { addEntry, listEntries, updateEntry, removeEntry } = await import('./store');
    const a = await addEntry({ date: '2026-10-05', title: 'Heat pump guide', channel: 'blog' });
    await addEntry({ date: '2026-11-02', title: 'LinkedIn recap', channel: 'linkedin' });
    await addEntry({ date: '2026-10-01', title: 'Kickoff', channel: 'nonsense' as never });

    const october = await listEntries('2026-10-01', '2026-10-31');
    expect(october.map((e) => e.title)).toEqual(['Kickoff', 'Heat pump guide']);
    expect(october[0]!.channel).toBe('blog');

    const updated = await updateEntry(a.id, { date: '2026-10-06', title: 'Heat pump guide', status: 'published' });
    expect(updated?.status).toBe('published');
    await removeEntry(a.id);
    expect(await listEntries()).toHaveLength(2);
  });

  it('rejects entries without a title or with a bad date', async () => {
    const { addEntry } = await import('./store');
    await expect(addEntry({ date: '2026-10-05', title: '  ' })).rejects.toThrow(/title/);
    await expect(addEntry({ date: 'tomorrow', title: 'x' })).rejects.toThrow(/date/);
  });
});
