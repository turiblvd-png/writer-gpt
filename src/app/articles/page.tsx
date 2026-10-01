import Link from 'next/link';
import { safeRead } from '@/lib/db/safe';
import { Shell, PageHeader } from '@/components/shell';
import { IconDoc } from '@/components/icons';
import { listArticles } from '@/lib/db/store';
import { StorageBanner } from '@/components/storage-banner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Articles · Writer-GPT' };

export default function ArticlesPage() {
  const articles = safeRead(() => listArticles(), [], 'listArticles');

  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="My Articles"
        subtitle="View and manage your generated articles"
        action={<Link href="/generate" className="btn-primary">Generate content</Link>}
      />

      {articles.length === 0 ? (
        <div className="card grid place-items-center gap-3 p-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-3 text-ink-3">
            <IconDoc className="h-6 w-6" />
          </span>
          <p className="font-semibold">No articles yet</p>
          <p className="max-w-sm text-sm text-ink-2">
            Generated articles land here with their SEO metadata, outline, schema and score.
          </p>
          <Link href="/generate" className="btn-primary mt-2">Write your first article</Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-5 py-3 font-bold">Title</th>
                <th className="px-5 py-3 font-bold">Words</th>
                <th className="hidden px-5 py-3 font-bold sm:table-cell">Language</th>
                <th className="hidden px-5 py-3 font-bold md:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {articles.map((a) => (
                <tr key={a.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-5 py-4">
                    <Link href={`/articles/${a.id}`} className="font-medium hover:text-accent">{a.title}</Link>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">/{a.slug}</p>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-ink-2">{a.wordCount.toLocaleString()}</td>
                  <td className="hidden px-5 py-4 text-ink-2 sm:table-cell">{a.language}</td>
                  <td className="hidden px-5 py-4 text-ink-3 md:table-cell">
                    {new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
