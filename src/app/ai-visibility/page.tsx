import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { listChecks } from '@/lib/visibility/check';
import { safeRead } from '@/lib/db/safe';
import { VisibilityWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Visibility · Writer-GPT' };

export default async function VisibilityPage() {
  const history = await safeRead(() => listChecks(), [], 'listChecks');
  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="AI Visibility"
        subtitle="Ask Google's AI the questions your customers ask, and see whether it cites your site, and who it cites instead."
      />
      <VisibilityWorkspace initialHistory={history} />
    </Shell>
  );
}
