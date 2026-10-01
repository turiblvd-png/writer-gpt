'use client';

import { useState } from 'react';
import type { VisibilityCheck } from '@/lib/visibility/check';
import { Notice, Panel, Spinner, StatTile } from '@/components/semantic-ui';
import { IconCheck, IconAlert, IconRadar, IconSpark } from '@/components/icons';

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function VisibilityWorkspace({ initialHistory }: { initialHistory: VisibilityCheck[] }) {
  const last = initialHistory[0];
  const [domain, setDomain] = useState(last?.domain ?? '');
  const [brand, setBrand] = useState(last?.brand ?? '');
  const [topic, setTopic] = useState('');
  const [queries, setQueries] = useState(last ? last.results.map((r) => r.query).join('\n') : '');
  const [busy, setBusy] = useState<'check' | 'suggest' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<VisibilityCheck | null>(last ?? null);
  const [history, setHistory] = useState(initialHistory);

  const list = queries.split('\n').map((q) => q.trim()).filter(Boolean);

  async function suggest() {
    setBusy('suggest');
    setError(null);
    try {
      const res = await fetch('/api/ai-visibility/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, brand }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not suggest queries.');
      setQueries((data.queries as string[]).join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not suggest queries.');
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy('check');
    setError(null);
    try {
      const res = await fetch('/api/ai-visibility', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, brand, queries: list }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Check failed.');
      setCurrent(data.check);
      setHistory((h) => [data.check, ...h]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Panel icon={<IconRadar />} title="Your site and the questions to test">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="domain">Your site</label>
            <input id="domain" className="field" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="riyadhticketsmap.com" />
          </div>
          <div>
            <label className="label" htmlFor="brand">Brand name <span className="font-normal text-ink-3">(optional)</span></label>
            <input id="brand" className="field" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="RiyadhTicketsMap" />
          </div>
        </div>

        <label className="label mt-4" htmlFor="queries">Questions customers ask an AI, one per line <span className="font-normal text-ink-3">(up to 10)</span></label>
        <textarea id="queries" className="field min-h-[160px] resize-y" value={queries} onChange={(e) => setQueries(e.target.value)}
                  placeholder={'how much are six kings slam tickets\nwhere to buy six kings slam tickets\nsix kings slam 2026 schedule'} />

        <div className="mt-3 flex flex-wrap gap-2">
          <input className="field max-w-xs" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, to suggest questions" aria-label="Topic for suggestions" />
          <button className="btn-ghost" disabled={Boolean(busy) || !topic.trim()} onClick={suggest}>
            {busy === 'suggest' ? <Spinner /> : <><IconSpark className="h-4 w-4" /> Suggest questions</>}
          </button>
        </div>

        {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}

        <button className="btn-primary mt-4 w-full py-3" disabled={Boolean(busy) || !domain.includes('.') || !list.length} onClick={check}>
          {busy === 'check' ? <><Spinner /> Asking {Math.min(list.length, 10)} question(s)…</> : <><IconRadar className="h-4 w-4" /> Check visibility</>}
        </button>
        <p className="mt-2 text-xs text-ink-3">
          Measures Google&rsquo;s AI (Gemini with Google Search), the closest proxy for AI Overviews. ChatGPT and
          Perplexity retrieve differently and are not covered here.
        </p>
      </Panel>

      {current && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Cited in" value={pct(current.citationRate)} tone={current.citationRate >= 0.5 ? 'ok' : current.citationRate > 0 ? 'warn' : 'bad'} />
            <StatTile label="Named in" value={pct(current.mentionRate)} />
            <StatTile label="Questions" value={current.results.length} />
            <StatTile label="Site" value={current.domain} />
          </div>

          <Panel icon={<IconRadar />} title="Question by question">
            <ul className="space-y-2">
              {current.results.map((r) => (
                <li key={r.query} className="rounded-xl border border-line bg-surface-2 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.error ? <IconAlert className="h-4 w-4 text-warn" /> : r.cited ? <IconCheck className="h-4 w-4 text-ok" /> : <IconAlert className="h-4 w-4 text-bad" />}
                    <span className="flex-1 text-sm font-semibold text-ink">{r.query}</span>
                    {r.cited && <span className="rounded-md bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok">cited #{r.position}</span>}
                    {!r.cited && !r.error && <span className="rounded-md bg-bad/15 px-2 py-0.5 text-[11px] font-bold text-bad">not cited</span>}
                    {r.mentioned && <span className="rounded-md bg-info/15 px-2 py-0.5 text-[11px] font-bold text-info">named</span>}
                  </div>
                  {r.error ? (
                    <p className="mt-1.5 text-xs text-warn">{r.error}</p>
                  ) : (
                    <>
                      {r.answerExcerpt && <p className="mt-1.5 text-xs text-ink-3">{r.answerExcerpt}</p>}
                      {r.citedDomains.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.citedDomains.map((d) => (
                            <span key={d} className={`rounded-md px-2 py-0.5 text-[11px] ${d === current.domain || d.endsWith(`.${current.domain}`) ? 'bg-ok/15 text-ok' : 'bg-surface-3 text-ink-3'}`}>{d}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          {current.topCompetitors.length > 0 && (
            <Panel icon={<IconRadar />} title="Who the AI cites instead" subtitle="Study these pages: they are what you are being compared against.">
              <ul className="space-y-1.5">
                {current.topCompetitors.map((c) => (
                  <li key={c.domain} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-ink-2">{c.domain}</span>
                    <span className="font-mono text-xs text-ink-3">{c.count} of {current.results.length}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      {history.length > 1 && (
        <section className="card mt-4 p-5">
          <h4 className="mb-3 text-sm font-bold">Earlier checks</h4>
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id}>
                <button onClick={() => setCurrent(h)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                  <span className="flex-1 text-ink-2">{h.domain} · {h.results.length} questions</span>
                  <span className="font-mono text-xs text-ink-3">{pct(h.citationRate)} cited</span>
                  <span className="text-xs text-ink-3">{new Date(h.createdAt).toLocaleDateString('en-GB')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
