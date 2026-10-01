'use client';

import { readJson } from '@/lib/http/read-json';
import { useState } from 'react';
import type { AuditReport } from '@/lib/audit/audit';
import { renderMarkdown } from '@/lib/content/render';
import { Notice, Panel, Spinner, StatTile } from '@/components/semantic-ui';
import { IconAlert, IconCheck, IconClipboard, IconSpark } from '@/components/icons';

const SEVERITY = {
  high: 'border-bad/30 bg-bad/10 text-bad',
  medium: 'border-warn/30 bg-warn/10 text-warn',
  low: 'border-line bg-surface-2 text-ink-3',
} as const;

const tone = (n: number): 'ok' | 'warn' | 'bad' => (n >= 80 ? 'ok' : n >= 55 ? 'warn' : 'bad');

export function AuditWorkspace({ initialHistory }: { initialHistory: AuditReport[] }) {
  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState<'audit' | 'advice' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(initialHistory[0] ?? null);
  const [history, setHistory] = useState(initialHistory);

  async function run() {
    setBusy('audit');
    setError(null);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'url' ? { url, keyword } : { text, keyword }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Audit failed.');
      setReport(data.audit);
      setHistory((h) => [data.audit, ...h.filter((x) => x.id !== data.audit.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed.');
    } finally {
      setBusy(null);
    }
  }

  async function advise() {
    if (!report) return;
    setBusy('advice');
    setError(null);
    try {
      const res = await fetch(`/api/audit/${report.id}/advice`, { method: 'POST' });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Could not generate a fix plan.');
      setReport(data.audit);
      setHistory((h) => h.map((x) => (x.id === data.audit.id ? data.audit : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a fix plan.');
    } finally {
      setBusy(null);
    }
  }

  const canRun = mode === 'url' ? url.trim().length > 4 : text.trim().length > 40;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <Panel icon={<IconClipboard />} title="What to audit">
          <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
            {(['url', 'text'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  mode === m ? 'bg-gradient-to-r from-accent to-accent-2 text-accent-ink' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {m === 'url' ? 'Live page URL' : 'Paste a draft'}
              </button>
            ))}
          </div>

          {mode === 'url' ? (
            <input
              className="field" value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canRun && !busy) void run(); }}
              placeholder="https://yoursite.com/your-article" aria-label="Page URL"
            />
          ) : (
            <textarea
              className="field min-h-[220px] resize-y font-mono text-xs" value={text}
              onChange={(e) => setText(e.target.value)} placeholder="Paste markdown or plain text…" aria-label="Draft text"
            />
          )}

          <label className="label mt-4" htmlFor="kw">Focus keyword <span className="font-normal text-ink-3">(optional, inferred from the title if blank)</span></label>
          <input id="kw" className="field" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. six kings slam tickets" />

          {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}

          <button className="btn-primary mt-4 w-full py-3" disabled={!canRun || Boolean(busy)} onClick={run}>
            {busy === 'audit' ? <><Spinner /> Auditing…</> : <><IconClipboard className="h-4 w-4" /> Run audit</>}
          </button>
        </Panel>

        {report && <Report report={report} busy={busy === 'advice'} onAdvise={advise} />}
      </div>

      <aside className="card h-fit p-5">
        <h3 className="mb-3 text-sm font-bold">Recent audits</h3>
        {history.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing audited yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setReport(a)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                    report?.id === a.id ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface-2 hover:border-line-soft'
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold ${
                    a.score >= 80 ? 'bg-ok/15 text-ok' : a.score >= 55 ? 'bg-warn/15 text-warn' : 'bg-bad/15 text-bad'
                  }`}>{a.score}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{a.title || 'Untitled'}</span>
                    <span className="block truncate text-[11px] text-ink-3">{a.domain ?? 'Pasted draft'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function Report({ report, busy, onAdvise }: { report: AuditReport; busy: boolean; onAdvise: () => void }) {
  const [showChecks, setShowChecks] = useState(false);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Overall" value={report.score} tone={tone(report.score)} />
        <StatTile label="SEO" value={report.seo.score} tone={tone(report.seo.score)} />
        <StatTile label="Human writing" value={report.style.humanScore} tone={tone(report.style.humanScore)} />
        <StatTile label="Words" value={report.seo.stats.words.toLocaleString()} />
        <StatTile label="Grade" value={report.seo.readability.grade} />
        <StatTile label="Internal links" value={report.links.internal} />
        <StatTile label="Em dashes" value={report.style.emDashes} tone={report.style.emDashes ? 'bad' : 'ok'} />
      </div>

      <Panel
        icon={<IconAlert />}
        title={`${report.issues.length} issue${report.issues.length === 1 ? '' : 's'} found`}
        subtitle={`${report.title || 'Untitled'} · keyword "${report.keyword}"${report.keywordInferred ? ' (inferred)' : ''}`}
        action={
          <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" disabled={busy} onClick={onAdvise}>
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <><IconSpark className="h-3.5 w-3.5" /> {report.advice ? 'Regenerate fix plan' : 'Get AI fix plan'}</>}
          </button>
        }
      >
        {report.issues.length === 0 ? (
          <Notice tone="ok">No problems found by the measured checks.</Notice>
        ) : (
          <ul className="space-y-2">
            {report.issues.map((issue, i) => (
              <li key={i} className={`flex gap-3 rounded-xl border p-3 text-sm ${SEVERITY[issue.severity]}`}>
                <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide">{issue.severity}</span>
                <span className="w-20 shrink-0 text-xs font-semibold text-ink-2">{issue.area}</span>
                <span className="text-ink-2">{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {report.advice && (
        <Panel icon={<IconSpark />} title="Fix plan" subtitle="Generated from the measured issues above.">
          <div className="prose-article max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(report.advice) }} />
        </Panel>
      )}

      <Panel
        icon={<IconCheck />}
        title="All SEO assessments"
        action={<button className="btn-ghost shrink-0 px-3 py-1.5 text-xs" onClick={() => setShowChecks((v) => !v)}>{showChecks ? 'Hide' : 'Show'}</button>}
      >
        {showChecks && (
          <ul className="space-y-2">
            {report.seo.checks.map((c) => (
              <li key={c.id} className="flex gap-3 text-sm">
                {c.status === 'good'
                  ? <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                  : <IconAlert className={`mt-0.5 h-4 w-4 shrink-0 ${c.status === 'bad' ? 'text-bad' : 'text-warn'}`} />}
                <span className="text-ink-2">{c.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {report.headings.length > 0 && (
        <Panel icon={<IconClipboard />} title="Heading structure" subtitle={`${report.headings.length} headings`}>
          <ol className="space-y-1">
            {report.headings.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ paddingLeft: `${(h.level - 1) * 16}px` }}>
                <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-3">H{h.level}</span>
                <span className="text-ink-2">{h.text}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </>
  );
}
