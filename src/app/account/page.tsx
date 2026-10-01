import Link from 'next/link';
import { Shell, PageHeader } from '@/components/shell';
import { getViewer } from '@/lib/auth/viewer';
import { usageFor } from '@/lib/usage/meter';
import { listArticles } from '@/lib/db/store';
import { safeRead } from '@/lib/db/safe';
import { SignOutButton } from './sign-out';
import { PasswordForm } from './password';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account · Writer-GPT' };

export default async function AccountPage() {
  const viewer = await getViewer();
  const user = viewer.user;
  const usage = user ? await safeRead(() => usageFor(user.id), null, 'usageFor') : null;
  const articles = await safeRead(() => listArticles(1000), [], 'listArticles');
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Shell>
      <PageHeader title="Account" subtitle="Your profile, plan and usage." />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-3 font-bold">Profile</h3>
          {user ? (
            <dl className="space-y-2 text-sm">
              <Row label="Name" value={user.name} />
              <Row label="Email" value={user.email} />
              <Row label="Plan" value={<span className="capitalize">{user.plan}</span>} />
              <Row label="Role" value={<span className="capitalize">{user.role === 'owner' ? 'Developer (owner)' : user.role}</span>} />
              <Row label="Member since" value={new Date(user.createdAt).toLocaleDateString()} />
            </dl>
          ) : (
            <p className="text-sm text-ink-3">Accounts are not switched on for this site, so everyone shares one workspace.</p>
          )}
          {viewer.isAdmin && (
            <p className="mt-4 rounded-xl bg-accent/10 p-3 text-sm">
              You are the developer. Manage AI models, subscribers and the menu in{' '}
              <Link href="/admin" className="font-semibold text-accent underline">the Developer dashboard</Link>.
            </p>
          )}
          {user && <div className="mt-4 border-t border-line pt-4"><SignOutButton /></div>}
        </section>

        <section className="card p-5">
          <h3 className="mb-3 font-bold">Usage in {month}</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Articles in your library" value={articles.length.toLocaleString()} />
            <Row label="AI requests" value={(usage?.requests ?? 0).toLocaleString()} />
            <Row label="Words read and written by AI" value={Math.round(((usage?.input ?? 0) + (usage?.output ?? 0)) * 0.75).toLocaleString()} />
          </dl>
        </section>

        {user && (
          <section className="card p-5">
            <h3 className="mb-3 font-bold">Change password</h3>
            <PasswordForm />
          </section>
        )}
      </div>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-2 last:border-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
