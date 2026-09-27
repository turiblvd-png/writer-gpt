import { Shell } from '@/components/shell';
import { seedDefaultVoices, listRewritten } from '@/lib/rewrite/store';
import { RewriteWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rewrite from URL · Writer-GPT' };

export default function RewritePage() {
  // Seed the starter voices once so the picker is never empty on first visit.
  const voices = seedDefaultVoices();

  return (
    <Shell>
      <RewriteWorkspace voices={voices} initialHistory={listRewritten()} />
    </Shell>
  );
}
