import Link from 'next/link';
import { Shell, PageHeader, Icon } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { adminPage } from '@/lib/auth/admin-page';
import { overview, subscriberRows } from '@/lib/admin/subscribers';
import { aiAdminView } from '@/lib/ai/admin-view';
import { NAV } from '@/lib/nav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Developer · Writer-GPT' };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export default async function AdminOverviewPage() {
  await adminPage();
  const [o, rows, ai] = await Promise.all([overview(), subscriberRows(), aiAdminView()]);
  const recent = [...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const connected = Object.entries(ai.keys).filter(([, k]) => k.present).map(([p]) => p);
  const links = NAV.find((s) => s.id === 'developer')!.items.slice(1);

  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader title="Developer dashboard" subtitle="Your SaaS at a glance: who signed up, what they use and what the AI costs you this month." />

      {connected.length === 0 && (
        <p className="mb-4 rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm">
          No AI provider is connected, so no tool can write. <Link href="/admin/ai" className="font-semibold text-accent underline">Add an API key</Link>.
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Accounts" value={o.users.toLocaleString()} hint={`${o.newThisMonth} new this month`} />
        <Tile label="Active this week" value={o.activeThisWeek.toLocaleString()} />
        <Tile label="AI requests this month" value={o.requests.toLocaleString()} />
        <Tile label="Est. AI cost this month" value={`$${o.costUsd.toFixed(2)}`} hint="From token counts at list prices" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="card flex items-start gap-3 p-4 transition-colors hover:border-accent/50">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Icon name={l.icon} className="h-4 w-4" /></span>
            <span><span className="block font-bold">{l.label}</span><span className="block text-xs text-ink-3">{l.description}</span></span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-3 font-bold">AI spend by provider</h3>
          {Object.keys(o.byProvider).length === 0 ? <p className="text-sm text-ink-3">No AI requests yet this month.</p> : (
            <ul className="divide-y divide-line text-sm">
              {Object.entries(o.byProvider).map(([p, v]) => (
                <li key={p} className="flex items-center justify-between py-2">
                  <span className="capitalize">{p}</span>
                  <span className="font-mono text-xs">{v.requests} requests · ${v.costUsd.toFixed(3)}</span>
                </li>
              ))}
            </ul>
          )}
          <h4 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-ink-3">Model per task now</h4>
          <ul className="space-y-1 text-sm">
            {Object.entries(ai.roles).map(([role, b]) => (
              <li key={role} className="flex justify-between gap-3"><span className="capitalize text-ink-2">{role}</span><span className="font-mono text-xs">{b.provider}:{b.model}</span></li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h3 className="mb-3 font-bold">Newest accounts</h3>
          {recent.length === 0 ? <p className="text-sm text-ink-3">No accounts yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{r.name} <span className="text-ink-3">· {r.email}</span></span>
                  <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-bold uppercase">{r.role === 'owner' ? 'developer' : r.plan}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/subscribers" className="mt-3 inline-block text-sm text-accent underline">All subscribers</Link>
        </section>
      </div>
    </Shell>
  );
}
