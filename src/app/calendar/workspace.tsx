'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CHANNELS, STATUSES, type CalendarEntry, type CalendarStatus } from '@/lib/calendar/types';
import { Notice, Panel } from '@/components/semantic-ui';
import { IconCalendar, IconChevron, IconPlus } from '@/components/icons';

const STATUS_STYLE: Record<CalendarStatus, string> = {
  planned: 'border-line bg-surface-3 text-ink-2',
  written: 'border-info/30 bg-info/15 text-info',
  published: 'border-ok/30 bg-ok/15 text-ok',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Six weeks starting on the Monday on or before the 1st. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));
}

type Draft = Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

const blank = (date: string): Draft => ({
  date, title: '', channel: 'blog', status: 'planned', keyword: '', articleId: null, notes: '',
});

export function CalendarWorkspace({
  initialEntries,
  articles,
}: {
  initialEntries: CalendarEntry[];
  articles: { id: string; title: string }[];
}) {
  const today = iso(new Date());
  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [entries]);
  const monthKey = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const monthEntries = entries.filter((e) => e.date.startsWith(monthKey));
  const label = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const articleTitle = (id: string | null) => articles.find((a) => a.id === id)?.title;

  function shift(delta: number) {
    setCursor(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(draft.id ? `/api/calendar/${draft.id}` : '/api/calendar', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save.');
      setEntries((list) => [...list.filter((e) => e.id !== data.entry.id), data.entry]);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
    setEntries((list) => list.filter((e) => e.id !== id));
    setDraft(null);
  }

  const chip = (e: CalendarEntry) => (
    <button key={e.id} onClick={(ev) => { ev.stopPropagation(); setDraft({ ...e }); }}
            className={`block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium ${STATUS_STYLE[e.status]}`}
            title={`${e.title} (${e.channel}, ${e.status})`}>
      {e.title}
    </button>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card min-w-0 p-4">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost px-2.5 py-1.5" onClick={() => shift(-1)} aria-label="Previous month">
            <IconChevron className="h-4 w-4 rotate-180" />
          </button>
          <h3 className="min-w-[128px] text-center font-bold sm:min-w-[160px]">{label}</h3>
          <button className="btn-ghost px-2.5 py-1.5" onClick={() => shift(1)} aria-label="Next month">
            <IconChevron className="h-4 w-4" />
          </button>
          <button className="btn-ghost ml-1 px-3 py-1.5 text-xs" onClick={() => { const n = new Date(); setCursor({ y: n.getFullYear(), m: n.getMonth() }); }}>
            Today
          </button>
          <button className="btn-primary ml-auto whitespace-nowrap px-3 py-1.5 text-sm" onClick={() => setDraft(blank(today))}>
            <IconPlus className="h-4 w-4" /> Add entry
          </button>
        </header>

        <div className="hidden md:block">
          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-bold uppercase text-ink-3">
            {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const key = iso(d);
              const inMonth = d.getMonth() === cursor.m;
              const list = byDay.get(key) ?? [];
              return (
                <div key={key} role="button" tabIndex={0}
                     onClick={() => setDraft(blank(key))}
                     onKeyDown={(e) => { if (e.key === 'Enter') setDraft(blank(key)); }}
                     className={`min-h-[96px] cursor-pointer rounded-lg border p-1.5 transition-colors hover:border-accent/50 ${
                       inMonth ? 'border-line bg-surface' : 'border-transparent bg-surface-2/40 opacity-50'
                     }`}>
                  <div className={`mb-1 text-xs font-semibold ${key === today ? 'inline-grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-ink' : 'text-ink-3'}`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map(chip)}
                    {list.length > 3 && <div className="text-[10px] text-ink-3">+{list.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="md:hidden">
          {monthEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">Nothing planned this month.</p>
          ) : (
            <ul className="divide-y divide-line">
              {monthEntries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-12 shrink-0 font-mono text-xs text-ink-3">{e.date.slice(5)}</span>
                  <div className="min-w-0 flex-1">{chip(e)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <aside>
        {draft ? (
          <Panel icon={<IconCalendar />} title={draft.id ? 'Edit entry' : 'New entry'}>
            <div className="space-y-3">
              <input className="field" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" aria-label="Title" autoFocus />
              <input className="field" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} aria-label="Date" />
              <div className="grid grid-cols-2 gap-2">
                <select className="field capitalize" value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as Draft['channel'] })} aria-label="Channel">
                  {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="field capitalize" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as CalendarStatus })} aria-label="Status">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <input className="field" value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} placeholder="Target keyword (optional)" aria-label="Keyword" />
              <select className="field" value={draft.articleId ?? ''} onChange={(e) => setDraft({ ...draft, articleId: e.target.value || null })} aria-label="Linked article">
                <option value="">No linked article</option>
                {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
              <textarea className="field min-h-[80px]" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Notes" aria-label="Notes" />

              {error && <Notice tone="bad">{error}</Notice>}

              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={saving || !draft.title.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
                <button className="btn-ghost" onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
                {draft.id && <button className="btn-ghost ml-auto text-bad" onClick={() => void remove(draft.id!)}>Delete</button>}
              </div>

              {draft.id && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-3 text-xs">
                  {draft.articleId ? (
                    <>
                      <Link className="btn-ghost px-3 py-1.5 text-xs" href={`/articles/${draft.articleId}`}>Open article</Link>
                      <Link className="btn-ghost px-3 py-1.5 text-xs" href={`/social?article=${draft.articleId}`}>Social posts</Link>
                    </>
                  ) : (
                    <Link className="btn-ghost px-3 py-1.5 text-xs" href={`/generate?topic=${encodeURIComponent(draft.keyword || draft.title)}`}>Write it now</Link>
                  )}
                </div>
              )}
              {draft.articleId && !draft.id && <p className="text-xs text-ink-3">Linked to “{articleTitle(draft.articleId)}”.</p>}
            </div>
          </Panel>
        ) : (
          <Panel icon={<IconCalendar />} title="This month">
            <div className="grid grid-cols-3 gap-2 text-center">
              {STATUSES.map((s) => (
                <div key={s} className={`rounded-xl border p-3 ${STATUS_STYLE[s]}`}>
                  <div className="text-xl font-bold">{monthEntries.filter((e) => e.status === s).length}</div>
                  <div className="text-[11px] font-semibold capitalize">{s}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-3">Click any day to plan something for it.</p>
          </Panel>
        )}
      </aside>
    </div>
  );
}
