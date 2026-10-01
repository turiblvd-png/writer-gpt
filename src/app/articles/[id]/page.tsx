import { notFound } from 'next/navigation';
import Link from 'next/link';
import { safeRead } from '@/lib/db/safe';
import { Shell } from '@/components/shell';
import { getArticle } from '@/lib/db/store';
import { analyseSeo } from '@/lib/seo/analysis';
import { buildSchema } from '@/lib/seo/schema';
import { renderMarkdown } from '@/lib/content/render';
import { extractHeadings } from '@/lib/seo/text';
import { ArticleTabs } from './tabs';
import { StorageBanner } from '@/components/storage-banner';

export const dynamic = 'force-dynamic';

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = safeRead(() => getArticle(id), null, 'getArticle');
  if (!article) notFound();

  const report = analyseSeo({
    markdown: article.markdown,
    title: article.title,
    metaDescription: article.metaDescription,
    focusKeyword: article.focusKeyword,
    slug: article.slug,
  });

  return (
    <Shell banner={<StorageBanner />}>
      <div className="mb-5">
        <Link href="/articles" className="text-sm text-ink-3 hover:text-accent">← My Articles</Link>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight">{article.title}</h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
          <span>{report.stats.words.toLocaleString()} words</span>
          <span>•</span>
          <span>{article.language}</span>
          <span>•</span>
          <span>{new Date(article.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </p>
      </div>

      <ArticleTabs
        article={article}
        report={report}
        html={renderMarkdown(article.markdown)}
        headings={extractHeadings(article.markdown)}
        schema={buildSchema(article)}
      />
    </Shell>
  );
}
