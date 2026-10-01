import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { listArticles } from '@/lib/db/store';
import { listSocialSets } from '@/lib/social/posts';
import { safeRead } from '@/lib/db/safe';
import { SocialWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Social Media Posts · Writer-GPT' };

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ article?: string }> }) {
  const { article } = await searchParams;
  const [articles, sets] = await Promise.all([
    safeRead(() => listArticles(100), [], 'listArticles'),
    safeRead(() => listSocialSets(), [], 'listSocialSets'),
  ]);
  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="Social Media Posts"
        subtitle="Turn any article into native posts for LinkedIn, X, Facebook and Instagram. Every post carries a real specific from the article, and limits are measured, not guessed."
      />
      <SocialWorkspace
        articles={articles.map((a) => ({ id: a.id, title: a.title }))}
        initialSets={sets}
        initialArticleId={article}
      />
    </Shell>
  );
}
