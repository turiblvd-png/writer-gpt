import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import { CHANNELS, STATUSES, type CalendarChannel, type CalendarEntry, type CalendarStatus } from './types';

/**
 * Content Calendar: dated plan entries, optionally linked to a saved article.
 * Dates are plain YYYY-MM-DD strings so an entry lands on the same day for
 * every viewer whatever their timezone.
 */

export { CHANNELS, STATUSES, type CalendarChannel, type CalendarEntry, type CalendarStatus };

const store = collection<CalendarEntry>('calendar');

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidDate(date: string): boolean {
  if (!DATE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export type CalendarInput = Partial<Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>> & { date: string; title: string };

function normalise(input: CalendarInput) {
  if (!isValidDate(input.date)) throw new Error('Pick a valid date.');
  const title = input.title.trim();
  if (!title) throw new Error('Give the entry a title.');
  return {
    date: input.date,
    title: title.slice(0, 200),
    channel: CHANNELS.includes(input.channel as CalendarChannel) ? (input.channel as CalendarChannel) : 'blog',
    status: STATUSES.includes(input.status as CalendarStatus) ? (input.status as CalendarStatus) : 'planned',
    keyword: (input.keyword ?? '').trim().slice(0, 200),
    articleId: input.articleId || null,
    notes: (input.notes ?? '').trim().slice(0, 2000),
  };
}

export async function addEntry(input: CalendarInput): Promise<CalendarEntry> {
  const now = Date.now();
  return store.put({ id: randomUUID(), ...normalise(input), createdAt: now, updatedAt: now });
}

export async function updateEntry(id: string, input: CalendarInput): Promise<CalendarEntry | null> {
  const next = normalise(input);
  return store.mutate(id, (current) => ({ ...current, ...next, updatedAt: Date.now() }));
}

export async function removeEntry(id: string): Promise<void> {
  await store.remove(id);
}

/** Entries in [from, to], both inclusive YYYY-MM-DD, earliest first. */
export async function listEntries(from?: string, to?: string): Promise<CalendarEntry[]> {
  return (await store.all())
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}
