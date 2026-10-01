import Link from 'next/link';
import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { loadReport } from '@/lib/reports/summary';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports · Writer-GPT' };

function tone(score: number | null, good: number, ok: number) {
  if (score === null) return 'text-ink-3';
  return score >= good ? 'text-ok' : score >= ok ? 'text-warn' : 'text-bad';
}

function Tile({ label, value, hint, className = '' }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${className}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export default async function ReportsPage() {
  const r = await loadReport();
  const maxWords = Math.max(1, ...r.weekly.map((w) => w.words));
  const fmt = (n: number | null, suffix = '') => (n === null ? 'n/a' : `${n}${suffix}`);

  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="Reports"
        subtitle="What you have produced and how it measures. Scores are recalculated from the saved text every time you open this page."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Articles" value={r.totals.articles.toLocaleString()} hint={`${r.totals.published} published to WordPress`} />
        <Tile label="Words written" value={r.totals.words.toLocaleString()} hint="Generated articles only" />
        <Tile label="Avg SEO score" value={fmt(r.quality.avgSeo)} className={tone(r.quality.avgSeo, 80, 60)} hint="On-page checks, out of 100" />
        <Tile label="Avg human score" value={fmt(r.quality.avgHuman)} className={tone(r.quality.avgHuman, 80, 60)} hint="AI-pattern detector, out of 100" />
        <Tile label="Free of em dashes" value={fmt(r.quality.dashFreeShare, '%')} className={tone(r.quality.dashFreeShare, 100, 90)} hint="Share of articles" />
        <Tile label="Humanizer uplift" value={r.quality.humanizerUplift === null ? 'n/a' : `+${r.quality.humanizerUplift}`} hint={`${r.totals.humanized} texts humanized`} />
        <Tile label="Rewrite overlap" value={r.quality.avgRewriteSimilarity === null ? 'n/a' : `${Math.round(r.quality.avgRewriteSimilarity * 100)}%`}
              className={r.quality.avgRewriteSimilarity === null ? '' : r.quality.avgRewriteSimilarity <= 0.15 ? 'text-ok' : 'text-warn'}
              hint={`${r.totals.rewrites} rewrites, lower is more original`} />
        <Tile label="Autopilot" value={r.totals.autopilotWritten.toLocaleString()} hint="Articles written from the queue" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-5">
          <h3 className="mb-4 font-bold">Words per week</h3>
          <div className="flex h-44 items-end gap-2">
            {r.weekly.map((w) => (
              <div key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="font-mono text-[10px] text-ink-3">{w.words ? w.words.toLocaleString() : ''}</span>
                <div className="w-full rounded-t-md bg-gradient-to-t from-accent to-accent-2" style={{ height: `${Math.max(2, (w.words / maxWords) * 100)}%`, opacity: w.words ? 1 : 0.25 }} />
                <span className="text-[10px] text-ink-3">{new Date(`${w.week}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-3 font-bold">Tool usage</h3>
          <dl className="space-y-2 text-sm">
            {[
              ['Semantic Writer projects', r.totals.semanticProjects, '/semantic'],
              ['Keyword research runs', r.totals.keywordResearch, '/keywords'],
              ['Content audits', r.totals.audits, '/audit'],
              ['AI visibility checks', r.totals.visibilityChecks, '/ai-visibility'],
              ['Social post sets', r.totals.socialSets, '/social'],
              ['Humanized texts', r.totals.humanized, '/humanizer'],
              ['Rewrites from URL', r.totals.rewrites, '/rewrite'],
            ].map(([label, count, href]) => (
              <div key={label as string} className="flex items-center justify-between">
                <dt><Link href={href as string} className="text-ink-2 hover:text-accent">{label}</Link></dt>
                <dd className="font-mono font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-1 font-bold">Needs attention</h3>
          <p className="mb-3 text-xs text-ink-3">Lowest combined SEO and human scores. Open one, or run it through the Humanizer.</p>
          {r.weakest.length === 0 ? <p className="text-sm text-ink-3">No articles yet.</p> : (
            <ul className="divide-y divide-line">
              {r.weakest.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link href={`/articles/${a.id}`} className="min-w-0 flex-1 truncate hover:text-accent">{a.title}</Link>
                  <span className={`font-mono text-xs ${tone(a.seoScore, 80, 60)}`}>SEO {a.seoScore}</span>
                  <span className={`font-mono text-xs ${tone(a.humanScore, 80, 60)}`}>Human {a.humanScore}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h3 className="mb-1 font-bold">AI answer citations</h3>
          <p className="mb-3 text-xs text-ink-3">Share of tracked queries where AI answers cite your site, latest check against the one before.</p>
          {r.visibility.length === 0 ? (
            <p className="text-sm text-ink-3">No checks yet. <Link href="/ai-visibility" className="text-accent underline">Run one</Link>.</p>
          ) : (
            <ul className="divide-y divide-line">
              {r.visibility.map((v) => {
                const delta = v.previous === null ? null : Math.round((v.latest - v.previous) * 100);
                return (
                  <li key={v.domain} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{v.domain}</span>
                    <span className="font-mono font-semibold">{Math.round(v.latest * 100)}%</span>
                    <span className={`w-14 text-right font-mono text-xs ${delta === null ? 'text-ink-3' : delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-ink-3'}`}>
                      {delta === null ? 'first' : `${delta > 0 ? '+' : ''}${delta} pts`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
