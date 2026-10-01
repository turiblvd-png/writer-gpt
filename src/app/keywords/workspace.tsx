'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Difficulty, Intent, KeywordResearch } from '@/lib/keywords/research';
import { Notice, Panel, Spinner } from '@/components/semantic-ui';
import { IconCopy, IconCheck, IconHub, IconKey, IconSpark } from '@/components/icons';

const INTENT_STYLE: Record<Intent, string> = {
  informational: 'bg-info/15 text-info',
  commercial: 'bg-warn/15 text-warn',
  transactional: 'bg-ok/15 text-ok',
  navigational: 'bg-surface-3 text-ink-3',
};
const DIFF_STYLE: Record<Difficulty, string> = {
  low: 'text-ok', medium: 'text-warn', high: 'text-bad',
};

export function KeywordWorkspace({ initialHistory }: { initialHistory: KeywordResearch[] }) {
  const [seed, setSeed] = useState('');
  const [location, setLocation] = useState('Worldwide');
  const [language, setLanguage] = useState('English');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<KeywordResearch | null>(initialHistory[0] ?? null);
  const [history, setHistory] = useState(initialHistory);
  const [intentFilter, setIntentFilter] = useState<Intent | 'all'>('all');
  const [copied, setCopied] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);

  async function queueAll(terms: string[]) {
    setQueued('Adding…');
    const res = await fetch('/api/autopilot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: terms, language }),
    });
    const data = await res.json().catch(() => ({}));
    setQueued(res.ok ? `${data.added.length} added to Autopilot` : data.error ?? 'Could not queue.');
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed, location, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Research failed.');
      setCurrent(data.research);
      setHistory((h) => [data.research, ...h]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed.');
    } finally {
      setBusy(false);
    }
  }

  const allTerms = useMemo(() => current?.clusters.flatMap((c) => c.keywords.map((k) => k.term)) ?? [], [current]);

  return (
    <>
      <Panel icon={<IconKey />} title="Seed keyword">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_160px_auto]">
          <input
            className="field" value={seed} onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && seed.trim().length > 1 && !busy) void run(); }}
            placeholder="e.g. six kings slam tickets" aria-label="Seed keyword"
          />
          <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" placeholder="Location" />
          <input className="field" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language" placeholder="Language" />
          <button className="btn-primary" disabled={busy || seed.trim().length < 2} onClick={run}>
            {busy ? <><Spinner /> Researching…</> : 'Research'}
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Difficulty is judged from who ranks today. There are no search-volume figures: real volumes need a paid
          clickstream source, and a guessed number would look precise while being invented.
        </p>
        {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
      </Panel>

      {busy && <Notice tone="info">Reading the live results page, then clustering. Usually 20 to 40 seconds.</Notice>}

      {current && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-lg font-bold">“{current.seed}”</h3>
            {(['all', 'informational', 'commercial', 'transactional', 'navigational'] as const).map((i) => (
              <button
                key={i}
                onClick={() => setIntentFilter(i)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  intentFilter === i ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-3 hover:text-ink'
                }`}
              >
                {i}
              </button>
            ))}
            <button
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => void navigator.clipboard?.writeText(allTerms.join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            >
              {copied ? <><IconCheck className="h-3.5 w-3.5" /> Copied</> : <><IconCopy className="h-3.5 w-3.5" /> Copy all {allTerms.length}</>}
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={queued === 'Adding…'}
                    onClick={() => void queueAll(current.clusters.flatMap((c) => c.keywords).filter((k) => intentFilter === 'all' || k.intent === intentFilter).map((k) => k.term))}>
              Queue {intentFilter === 'all' ? 'all' : intentFilter} in Autopilot
            </button>
            {queued && <span className="text-xs text-ink-3">{queued}{queued.includes('added') && <> · <Link href="/autopilot" className="text-accent underline">open Autopilot</Link></>}</span>}
          </div>

          {current.angle && <Notice tone="info"><strong className="text-ink">Winning angle:</strong> {current.angle}</Notice>}

          <div className="grid gap-4 lg:grid-cols-2">
            {current.clusters.map((cluster) => {
              const rows = cluster.keywords.filter((k) => intentFilter === 'all' || k.intent === intentFilter);
              if (!rows.length) return null;
              return (
                <section key={cluster.name} className="card p-5">
                  <header className="mb-3 flex items-center gap-2">
                    <h4 className="flex-1 font-bold">{cluster.name}</h4>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${INTENT_STYLE[cluster.intent]}`}>{cluster.intent}</span>
                  </header>
                  <ul className="divide-y divide-line">
                    {rows.map((k) => (
                      <li key={k.term} className="flex items-center gap-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">{k.term}</span>
                          {k.note && <span className="block text-xs text-ink-3">{k.note}</span>}
                        </span>
                        <span className={`shrink-0 text-[11px] font-bold uppercase ${DIFF_STYLE[k.difficulty]}`}>{k.difficulty}</span>
                        <Link href={`/generate?topic=${encodeURIComponent(k.term)}`} title="Write with Generate Content"
                              className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-accent/10 hover:text-accent" aria-label={`Write about ${k.term}`}>
                          <IconSpark className="h-4 w-4" />
                        </Link>
                        <Link href={`/semantic?keyword=${encodeURIComponent(k.term)}`} title="Start a Semantic Writer project"
                              className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-accent/10 hover:text-accent" aria-label={`Semantic project for ${k.term}`}>
                          <IconHub className="h-4 w-4" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="card p-5 lg:col-span-2">
              <h4 className="mb-3 font-bold">Questions people ask</h4>
              {current.questions.length ? (
                <ul className="space-y-1.5">
                  {current.questions.map((q) => (
                    <li key={q} className="flex items-center gap-2 text-sm text-ink-2">
                      <span className="flex-1">{q}</span>
                      <Link href={`/generate?topic=${encodeURIComponent(q)}`} className="shrink-0 text-xs text-accent hover:underline">Answer it</Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ink-3">None found.</p>}
            </section>
            <section className="card p-5">
              <h4 className="mb-2 font-bold">On the results page</h4>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {current.serpFeatures.length
                  ? current.serpFeatures.map((f) => <span key={f} className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-ink-2">{f}</span>)
                  : <span className="text-sm text-ink-3">Not reported.</span>}
              </div>
              <h4 className="mb-2 font-bold">Ranking now</h4>
              <ul className="space-y-1 text-sm text-ink-2">
                {current.competitors.length ? current.competitors.map((c) => <li key={c}>{c}</li>) : <li className="text-ink-3">Not reported.</li>}
              </ul>
            </section>
          </div>
        </>
      )}

      {history.length > 1 && (
        <section className="card mt-4 p-5">
          <h4 className="mb-3 text-sm font-bold">Earlier research</h4>
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <button key={h.id} onClick={() => setCurrent(h)}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${current?.id === h.id ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-surface-2 text-ink-2 hover:text-ink'}`}>
                {h.seed}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
