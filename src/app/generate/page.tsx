import { Shell, PageHeader } from '@/components/shell';
import { GenerateWizard } from './wizard';

export const metadata = { title: 'Generate Content · Writer-GPT' };

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  return (
    <Shell>
      <PageHeader
        title="Generate Content"
        subtitle="Researches the topic against live search first, then writes from what it finds."
      />
      <GenerateWizard initialTopic={typeof topic === 'string' ? topic.slice(0, 200) : ''} />
    </Shell>
  );
}
