import { Shell, PageHeader } from '@/components/shell';
import { GenerateWizard } from './wizard';

export const metadata = { title: 'Generate Content — Writer-GPT' };

export default function GeneratePage() {
  return (
    <Shell>
      <PageHeader
        title="Generate Content"
        subtitle="Researches the topic against live search first, then writes from what it finds."
      />
      <GenerateWizard />
    </Shell>
  );
}
