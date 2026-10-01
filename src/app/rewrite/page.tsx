import { safeRead } from '@/lib/db/safe';
import { Shell } from '@/components/shell';
import { seedDefaultVoices, listRewritten } from '@/lib/rewrite/store';
import { RewriteWorkspace } from './workspace';
import { StorageBanner } from '@/components/storage-banner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rewrite from URL · Writer-GPT' };

export default function RewritePage() {
  // Seed the starter voices once so the picker is never empty on first visit.
  const voices = safeRead(() => seedDefaultVoices(), [], 'seedDefaultVoices');

  return (
    <Shell banner={<StorageBanner />}>
      <RewriteWorkspace voices={voices} initialHistory={safeRead(() => listRewritten(), [], 'listRewritten')} />
    </Shell>
  );
}
