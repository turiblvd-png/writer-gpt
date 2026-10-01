import { redirect } from 'next/navigation';
import { requireAdmin } from './viewer';

/** For admin pages: send anyone else back to the dashboard. */
export async function adminPage(): Promise<void> {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }
}
