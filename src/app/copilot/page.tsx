import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { listConversations, STARTER_PROMPTS } from '@/lib/copilot/chat';
import { safeRead } from '@/lib/db/safe';
import { CopilotChat } from './chat';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SEO Copilot · Writer-GPT' };

export default async function CopilotPage() {
  const conversations = await safeRead(() => listConversations(), [], 'listConversations');
  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader
        title="SEO Copilot"
        subtitle="Ask anything about rankings, competitors or content. Every answer is checked against live search and shows its sources."
      />
      <CopilotChat initialConversations={conversations} starters={STARTER_PROMPTS} />
    </Shell>
  );
}
