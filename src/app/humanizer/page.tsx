import { safeRead } from '@/lib/db/safe';
import { Shell } from '@/components/shell';
import { listArticles } from '@/lib/db/store';
import { listHumanized } from '@/lib/humanizer/store';
import { HumanizerWorkspace } from './workspace';
import { StorageBanner } from '@/components/storage-banner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Humanizer · Writer-GPT' };

export default async function HumanizerPage() {
  const articles = await safeRead(() => listArticles(50), [], 'listArticles');
  const history = await safeRead(() => listHumanized(), [], 'listHumanized');

  return (
    <Shell banner={<StorageBanner />}>
      <HumanizerWorkspace
        articles={articles.map((a) => ({ id: a.id, title: a.title, words: a.wordCount }))}
        initialHistory={history}
      />
    </Shell>
  );
}
