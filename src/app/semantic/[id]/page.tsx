import { notFound } from 'next/navigation';
import { Shell } from '@/components/shell';
import { getProject } from '@/lib/semantic/store';
import { Workspace } from './workspace';

export const dynamic = 'force-dynamic';

export default async function SemanticProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  return (
    <Shell>
      <Workspace initial={project} />
    </Shell>
  );
}
