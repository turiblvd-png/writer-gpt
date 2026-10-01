import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { listAudits } from '@/lib/audit/audit';
import { safeRead } from '@/lib/db/safe';
import { AuditWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content Audit · Writer-GPT' };

export default async function AuditPage() {
  const history = await safeRead(() => listAudits(30), [], 'listAudits');
  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="Content Audit"
        subtitle="Score any live page or draft: SEO assessments, AI writing patterns, freshness, links and structure. Measured locally, so it is instant and free."
      />
      <AuditWorkspace initialHistory={history} />
    </Shell>
  );
}
