import { Shell, PageHeader } from '@/components/shell';
import { adminPage } from '@/lib/auth/admin-page';
import { getPlatformSettings } from '@/lib/platform/settings';
import { NavigationWorkspace } from './workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Menu & Tools · Writer-GPT' };

export default async function NavigationPage() {
  await adminPage();
  const settings = await getPlatformSettings();
  return (
    <Shell>
      <PageHeader title="Menu & Tools" subtitle="Drag tools into the order subscribers see them, and hide any tool you do not want to offer. Hidden tools stay visible to you, marked Hidden." />
      <NavigationWorkspace initial={settings.nav} />
    </Shell>
  );
}
