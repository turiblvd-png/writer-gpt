import { Shell, PageHeader } from '@/components/shell';
import { adminPage } from '@/lib/auth/admin-page';
import { subscriberRows } from '@/lib/admin/subscribers';
import { getPlatformSettings } from '@/lib/platform/settings';
import { getViewer } from '@/lib/auth/viewer';
import { SubscribersWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Subscribers · Writer-GPT' };

export default async function SubscribersPage() {
  await adminPage();
  const [rows, platform, viewer] = await Promise.all([subscriberRows(), getPlatformSettings(), getViewer()]);
  return (
    <Shell>
      <PageHeader title="Subscribers" subtitle="Everyone with an account: plan, activity and this month's AI usage. Costs are estimates from token counts." />
      <SubscribersWorkspace initialRows={rows} initialSignupsOpen={platform.signupsOpen} viewerIsOwner={viewer.user?.role === 'owner'} viewerId={viewer.user?.id ?? null} />
    </Shell>
  );
}
