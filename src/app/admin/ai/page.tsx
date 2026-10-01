import { Shell, PageHeader } from '@/components/shell';
import { adminPage } from '@/lib/auth/admin-page';
import { aiAdminView } from '@/lib/ai/admin-view';
import { AiModelsWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Models · Writer-GPT' };

export default async function AiModelsPage() {
  await adminPage();
  const view = await aiAdminView();
  return (
    <Shell>
      <PageHeader
        title="AI Models"
        subtitle="Connect providers, pick the model for each task and set what takes over when one fails. Changes apply at once, no redeploy."
      />
      <AiModelsWorkspace initial={view} />
    </Shell>
  );
}
