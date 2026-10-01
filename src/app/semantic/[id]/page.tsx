import Link from 'next/link';
import { safeRead } from '@/lib/db/safe';
import { Shell } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { storageStatus } from '@/lib/db/store';
import { getProject } from '@/lib/semantic/store';
import { Workspace } from './workspace';

export const dynamic = 'force-dynamic';

export default async function SemanticProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await safeRead(() => getProject(id), null, 'getProject');

  if (!project) {
    // A bare 404 here is misleading. On a host where each instance keeps its own
    // storage, the project genuinely was created, just not on the instance
    // serving this request, and the user needs to know that is what happened.
    const { perInstance } = await storageStatus();

    return (
      <Shell banner={<StorageBanner />}>
        <div className="mx-auto max-w-lg py-10 text-center">
          <h2 className="text-xl font-extrabold">Project not found</h2>
          <p className="mt-2 text-sm text-ink-2">
            {perInstance
              ? 'It was most likely created successfully, but this host does not share saved data between server instances, so the request that loaded this page could not see it.'
              : 'This project does not exist, or it was deleted.'}
          </p>
          <Link href="/semantic" className="btn-primary mt-6">Back to Semantic Writer</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell banner={<StorageBanner />}>
      <Workspace initial={project} />
    </Shell>
  );
}
