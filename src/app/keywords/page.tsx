import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { listResearch } from '@/lib/keywords/research';
import { safeRead } from '@/lib/db/safe';
import { KeywordWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Keyword Research · Writer-GPT' };

export default async function KeywordsPage() {
  const history = await safeRead(() => listResearch(), [], 'listResearch');
  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="Keyword Research"
        subtitle="Clusters, intent and real questions for any seed, read from the live results page. Send any keyword straight into a writer."
      />
      <KeywordWorkspace initialHistory={history} />
    </Shell>
  );
}
