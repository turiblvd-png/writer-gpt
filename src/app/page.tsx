import Link from 'next/link';
import { safeRead } from '@/lib/db/safe';
import { Shell, PageHeader, Icon } from '@/components/shell';
import { IconDoc } from '@/components/icons';
import { configuredProviders } from '@/lib/ai';
import { listArticles } from '@/lib/db/store';
import { listQueue } from '@/lib/autopilot/queue';
import { NAV } from '@/lib/nav';
import { StorageBanner } from '@/components/storage-banner';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const providers = configuredProviders();
  const [articles, queue] = await Promise.all([
    safeRead(() => listArticles(200), [], 'listArticles'),
    safeRead(() => listQueue(200), [], 'listQueue'),
  ]);
  const totalWords = articles.reduce((sum, a) => sum + a.wordCount, 0);
  const published = articles.filter((a) => a.status === 'published').length;
  const queued = queue.filter((q) => q.status === 'queued').length;
  const sections = NAV.filter((s) => s.id === 'create' || s.id === 'ai' || s.id === 'library' || s.id === 'publishing');

  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="Dashboard"
        subtitle="Research-grounded writing, SEO and publishing in one workspace."
        action={<Link href="/generate" className="btn-primary">New article</Link>}
      />

      {!providers.gemini && (
        <p className="mb-5 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-ink-2">
          The AI tools need a Gemini API key. Add <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs">GEMINI_API_KEY</code> to
          your hosting environment variables and redeploy. <Link href="/account" className="text-accent underline">See the setup checklist</Link>.
        </p>
      )}

      <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Articles" value={articles.length.toLocaleString()} />
        <Stat label="Words generated" value={totalWords.toLocaleString()} />
        <Stat label="Published" value={published.toLocaleString()} />
        <Stat label="In Autopilot queue" value={queued.toLocaleString()} />
      </div>

      {sections.map((section) => (
        <section key={section.id} className="mb-6">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-3">{section.label}</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.items.map((item) => (
              <Link key={item.href} href={item.href} className="card flex items-start gap-3 p-4 transition-colors hover:border-accent/50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-bold">
                    {item.label}
                    {item.badge && <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">{item.badge}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-3">{item.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {articles.length > 0 && (
        <section className="mt-2">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-2">
            <IconDoc className="h-4 w-4" /> Recent articles
          </h3>
          <div className="card divide-y divide-line">
            {articles.slice(0, 5).map((a) => (
              <Link key={a.id} href={`/articles/${a.id}`} className="flex items-center gap-4 p-4 hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                {a.status === 'published' && <span className="rounded-md bg-ok/15 px-2 py-0.5 text-[10px] font-bold uppercase text-ok">Live</span>}
                <span className="shrink-0 font-mono text-xs text-ink-3">{a.wordCount.toLocaleString()}w</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}
