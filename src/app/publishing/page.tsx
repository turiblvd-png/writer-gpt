import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { listArticles } from '@/lib/db/store';
import { getWpConfigView } from '@/lib/publishing/wordpress';
import { safeRead } from '@/lib/db/safe';
import { PublishingWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'WordPress Publishing · Writer-GPT' };

export default async function PublishingPage() {
  const [wordpress, articles] = await Promise.all([
    safeRead(() => getWpConfigView(), { siteUrl: '', username: '', source: 'none' as const, connected: false }, 'getWpConfigView'),
    safeRead(() => listArticles(200), [], 'listArticles'),
  ]);
  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="WordPress Publishing"
        subtitle="Connect your site once, then send any article as a draft, publish it now or schedule it. Re-publishing updates the same post instead of creating a duplicate."
      />
      <PublishingWorkspace
        initialConfig={wordpress}
        articles={articles.map((a) => ({
          id: a.id, title: a.title, wordCount: a.wordCount, status: a.status,
          publishedUrl: a.publishedUrl ?? null, wpPostId: a.wpPostId ?? null, createdAt: a.createdAt,
        }))}
      />
    </Shell>
  );
}
