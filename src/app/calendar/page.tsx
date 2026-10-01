import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { listEntries } from '@/lib/calendar/store';
import { listArticles } from '@/lib/db/store';
import { safeRead } from '@/lib/db/safe';
import { CalendarWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content Calendar · Writer-GPT' };

export default async function CalendarPage() {
  const [entries, articles] = await Promise.all([
    safeRead(() => listEntries(), [], 'listEntries'),
    safeRead(() => listArticles(200), [], 'listArticles'),
  ]);
  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader title="Content Calendar" subtitle="Plan what goes out when. Link entries to finished articles, or start writing straight from a planned keyword." />
      <CalendarWorkspace initialEntries={entries} articles={articles.map((a) => ({ id: a.id, title: a.title }))} />
    </Shell>
  );
}
