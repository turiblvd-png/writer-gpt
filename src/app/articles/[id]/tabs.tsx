'use client';

import { useState } from 'react';
import type { ArticleRecord } from '@/lib/db/store';
import type { SeoReport, CheckStatus } from '@/lib/seo/analysis';
import type { Heading } from '@/lib/seo/text';
import { pixelWidth } from '@/lib/seo/text';
import { IconAlert, IconCheck } from '@/components/icons';

const TABS = ['Content', 'SEO Meta Data', 'Outline', 'Schema', 'SEO Score', 'Sources'] as const;
type Tab = (typeof TABS)[number];

export function ArticleTabs({
  article, report, html, headings, schema,
}: {
  article: ArticleRecord;
  report: SeoReport;
  html: string;
  headings: Heading[];
  schema: string;
}) {
  const [tab, setTab] = useState<Tab>('Content');

  return (
    <>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Content' && (
        <article className="card prose-article max-w-none p-7" dangerouslySetInnerHTML={{ __html: html }} />
      )}

      {tab === 'SEO Meta Data' && (
        <div className="card space-y-5 p-6">
          <Meta label="SEO Title" value={article.title} limit={60} />
          <Meta label="Meta Description" value={article.metaDescription} limit={155} showPixels />
          <Meta label="URL Slug" value={article.slug} limit={75} mono />
          <div>
            <p className="label">Focus Keyword</p>
            <span className="inline-block rounded-lg bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent">
              {article.focusKeyword || '—'}
            </span>
          </div>
          {article.keywords.length > 0 && (
            <div>
              <p className="label">Supporting Keywords</p>
              <div className="flex flex-wrap gap-2">
                {article.keywords.map((k) => (
                  <span key={k} className="rounded-lg bg-surface-3 px-2.5 py-1 text-xs text-ink-2">{k}</span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-4">
            <Stat label="Words" value={report.stats.words.toLocaleString()} />
            <Stat label="Characters" value={report.stats.characters.toLocaleString()} />
            <Stat label="Headings" value={String(report.stats.headings.length)} />
            <Stat label="Paragraphs" value={String(report.stats.paragraphs)} />
          </div>
        </div>
      )}

      {tab === 'Outline' && (
        <div className="card p-6">
          <p className="mb-4 text-sm text-ink-3">{headings.length} headings</p>
          <ol className="space-y-1">
            {headings.map((h, i) => (
              <li key={`${h.offset}-${i}`} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2"
                  style={{ paddingLeft: `${(h.level - 1) * 18 + 8}px` }}>
                <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-3">
                  H{h.level}
                </span>
                <span className="text-sm text-ink-2">{h.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === 'Schema' && (
        <div className="card overflow-hidden">
          <pre className="max-h-[600px] overflow-auto p-6 font-mono text-xs leading-relaxed text-ink-2">
            {schema}
          </pre>
        </div>
      )}

      {tab === 'SEO Score' && <ScorePanel report={report} />}

      {tab === 'Sources' && (
        <div className="card p-6">
          {article.sources.length === 0 ? (
            <p className="text-sm text-ink-2">
              No sources recorded. This article was not grounded in live search — verify its facts before publishing.
            </p>
          ) : (
            <ul className="space-y-2">
              {article.sources.map((s) => (
                <li key={s.uri}>
                  <a href={s.uri} target="_blank" rel="noopener noreferrer"
                     className="block rounded-xl border border-line p-3 hover:border-accent/50">
                    <span className="block text-sm font-medium text-ink">{s.title ?? s.uri}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-3">{s.uri}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function ScorePanel({ report }: { report: SeoReport }) {
  const tone = report.score >= 80 ? 'text-ok' : report.score >= 55 ? 'text-warn' : 'text-bad';
  const groups = [...new Set(report.checks.map((c) => c.category))];

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-6 p-6">
        <div className="text-center">
          <p className={`text-5xl font-extrabold ${tone}`}>{report.score}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-ink-3">SEO score</p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Passed" value={String(report.passed)} tone="ok" />
          <Stat label="Warnings" value={String(report.warnings)} tone="warn" />
          <Stat label="Problems" value={String(report.problems)} tone="bad" />
          <Stat label="Density" value={`${report.keywordDensity}%`} />
        </div>
      </div>

      {groups.map((group) => (
        <div key={group} className="card p-5">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-3">{group}</h4>
          <ul className="space-y-2">
            {report.checks.filter((c) => c.category === group).map((c) => (
              <li key={c.id} className="flex gap-3 text-sm">
                <StatusDot status={c.status} />
                <span className="text-ink-2">{c.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: CheckStatus }) {
  if (status === 'good') return <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />;
  if (status === 'bad') return <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-bad" />;
  return <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />;
}

function Meta({ label, value, limit, mono, showPixels }: {
  label: string; value: string; limit: number; mono?: boolean; showPixels?: boolean;
}) {
  const over = value.length > limit;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink-2">{label}</span>
        <span className={`font-mono text-xs ${over ? 'text-bad' : 'text-ink-3'}`}>
          {value.length}/{limit}
          {showPixels && ` · ~${pixelWidth(value)}px`}
        </span>
      </div>
      <p className={`rounded-xl border border-line bg-surface-2 p-3.5 text-sm text-ink ${mono ? 'font-mono text-xs' : ''}`}>
        {value || <span className="text-ink-3">Not set</span>}
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const colour = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-center">
      <p className={`text-lg font-bold ${colour}`}>{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-3">{label}</p>
    </div>
  );
}
