import { notFound } from 'next/navigation';
import { safeRead } from '@/lib/db/safe';
import { Shell } from '@/components/shell';
import { getProject } from '@/lib/semantic/store';
import { Workspace } from './workspace';
import { StorageBanner } from '@/components/storage-banner';

export const dynamic = 'force-dynamic';

export default async function SemanticProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = safeRead(() => getProject(id), null, 'getProject');
  if (!project) notFound();

  return (
    <Shell banner={<StorageBanner />}>
      <Workspace initial={project} />
    </Shell>
  );
}
