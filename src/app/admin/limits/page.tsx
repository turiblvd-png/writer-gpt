import { Shell, PageHeader } from '@/components/shell';
import { adminPage } from '@/lib/auth/admin-page';
import { getLimits, monthSpendUsd } from '@/lib/usage/limits';
import { LimitsWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plans & Limits · Writer-GPT' };

export default async function LimitsPage() {
  await adminPage();
  const [limits, spend] = await Promise.all([getLimits(), monthSpendUsd()]);
  return (
    <Shell>
      <PageHeader
        title="Plans & Limits"
        subtitle="How many AI requests each plan gets per month, and a cap on what the AI may cost you. You and admins are never limited."
      />
      <LimitsWorkspace initial={limits} spendUsd={spend} />
    </Shell>
  );
}
