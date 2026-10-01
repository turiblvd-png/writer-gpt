import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { listQueue } from '@/lib/autopilot/queue';
import { safeRead } from '@/lib/db/safe';
import { AutopilotWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Autopilot · Writer-GPT' };

export default async function AutopilotPage() {
  const queue = await safeRead(() => listQueue(), [], 'listQueue');
  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="Autopilot"
        subtitle="Queue keywords and Writer-GPT writes them one by one with the full Generate Content pipeline: live research, intent, outline, draft, metadata and fact check."
      />
      <AutopilotWorkspace initialQueue={queue} cronEnabled={Boolean(process.env.CRON_SECRET)} />
    </Shell>
  );
}
