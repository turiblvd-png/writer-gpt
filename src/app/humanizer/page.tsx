import { safeRead } from '@/lib/db/safe';
import { Shell } from '@/components/shell';
import { listArticles } from '@/lib/db/store';
import { listHumanized } from '@/lib/humanizer/store';
import { HumanizerWorkspace } from './workspace';
import { StorageBanner } from '@/components/storage-banner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Humanizer · Writer-GPT' };

export default function HumanizerPage() {
  return (
    <Shell banner={<StorageBanner />}>
      <HumanizerWorkspace
        articles={safeRead(() => listArticles(50), [], 'listArticles').map((a) => ({ id: a.id, title: a.title, words: a.wordCount }))}
        initialHistory={safeRead(() => listHumanized(), [], 'listHumanized')}
      />
    </Shell>
  );
}
