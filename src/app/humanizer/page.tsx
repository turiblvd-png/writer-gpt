import { Shell } from '@/components/shell';
import { listArticles } from '@/lib/db/store';
import { listHumanized } from '@/lib/humanizer/store';
import { HumanizerWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Humanizer · Writer-GPT' };

export default function HumanizerPage() {
  return (
    <Shell>
      <HumanizerWorkspace
        articles={listArticles(50).map((a) => ({ id: a.id, title: a.title, words: a.wordCount }))}
        initialHistory={listHumanized()}
      />
    </Shell>
  );
}
