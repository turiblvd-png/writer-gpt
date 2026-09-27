import Link from 'next/link';
import { Shell, PageHeader } from '@/components/shell';
import { IconDoc, IconHub, IconLink, IconSpark, IconWand } from '@/components/icons';
import { configuredProviders } from '@/lib/ai';
import { listArticles } from '@/lib/db/store';
import { SEMANTIC_WRITER_READY } from '@/lib/pipelines/semantic-writer';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const providers = configuredProviders();
  const articles = listArticles(5);
  const totalWords = articles.reduce((sum, a) => sum + a.wordCount, 0);

  const tools = [
    { href: '/generate', icon: IconSpark, title: 'Generate Content', body: 'Grounded research, then a full SEO draft in six steps.', status: 'Ready' },
    { href: '/semantic', icon: IconHub, title: 'Semantic Writer', body: 'The 14-step entity-first pipeline. Engine built, steps pending.', status: SEMANTIC_WRITER_READY ? 'Ready' : 'Awaiting steps' },
    { href: '/humanizer', icon: IconWand, title: 'Humanizer', body: 'Rewrites drafts to read naturally without losing meaning.', status: 'Not built' },
    { href: '/rewrite', icon: IconLink, title: 'Rewrite from URL', body: 'Pulls an existing page and rebuilds it against current intent.', status: 'Not built' },
  ];

  return (
    <Shell>
      <PageHeader title="Dashboard" subtitle="Four tools on one research-grounded engine." />

      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        <Stat label="Articles" value={String(articles.length)} />
        <Stat label="Words generated" value={totalWords.toLocaleString()} />
        <Stat
          label="Gemini API"
          value={providers.gemini ? 'Connected' : 'Not set'}
          tone={providers.gemini ? 'ok' : 'warn'}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tools.map(({ href, icon: Icon, title, body, status }) => {
          const live = status === 'Ready';
          const inner = (
            <>
              <div className="mb-3 flex items-center gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${live ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-ink-3'}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-bold">{title}</span>
                <span className={`ml-auto rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                  live ? 'bg-ok/15 text-ok' : 'bg-surface-3 text-ink-3'
                }`}>
                  {status}
                </span>
              </div>
              <p className="text-sm text-ink-2">{body}</p>
            </>
          );

          return live || href === '/semantic' ? (
            <Link key={href} href={href} className="card p-5 transition-colors hover:border-accent/50">{inner}</Link>
          ) : (
            <div key={href} className="card p-5 opacity-60">{inner}</div>
          );
        })}
      </div>

      {articles.length > 0 && (
        <section className="mt-7">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-2">
            <IconDoc className="h-4 w-4" /> Recent articles
          </h3>
          <div className="card divide-y divide-line">
            {articles.map((a) => (
              <Link key={a.id} href={`/articles/${a.id}`} className="flex items-center gap-4 p-4 hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                <span className="shrink-0 font-mono text-xs text-ink-3">{a.wordCount.toLocaleString()}w</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!providers.gemini && (
        <p className="mt-7 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-ink-2">
          Set <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-accent-2">GEMINI_API_KEY</code>{' '}
          in <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-accent-2">.env.local</code> to
          enable generation. See <code className="font-mono text-xs">.env.example</code>.
        </p>
      )}
    </Shell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-1.5 text-2xl font-extrabold ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  );
}
