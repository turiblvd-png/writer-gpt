import { Shell, PageHeader } from '@/components/shell';
import { adminPage } from '@/lib/auth/admin-page';
import { listActivity } from '@/lib/activity/log';
import { listUsers } from '@/lib/auth/users';
import { ActivityWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity · Writer-GPT' };

export default async function ActivityPage() {
  await adminPage();
  const [events, users] = await Promise.all([listActivity({ limit: 200 }), listUsers()]);
  return (
    <Shell>
      <PageHeader
        title="Activity"
        subtitle="Every AI request, sign-in and dashboard change: who, which tool, which model, tokens, cost, time taken and the result. Kept for 90 days."
      />
      <ActivityWorkspace initial={events} users={users.map((u) => ({ id: u.id, email: u.email }))} />
    </Shell>
  );
}
