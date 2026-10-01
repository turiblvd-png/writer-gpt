import Link from 'next/link';
import { Shell, PageHeader } from '@/components/shell';
import { StorageBanner } from '@/components/storage-banner';
import { configuredProviders, roleBindings } from '@/lib/ai';
import { probeStorage, storageStatus } from '@/lib/db/store';
import { getWpConfigView } from '@/lib/publishing/wordpress';
import { authEnabled } from '@/lib/auth/session';
import { safeRead } from '@/lib/db/safe';
import { SignOutButton } from './sign-out';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account & Setup · Writer-GPT' };

function Row({ ok, label, detail, fix }: { ok: boolean | 'warn'; label: string; detail: string; fix?: React.ReactNode }) {
  const style = ok === true ? 'bg-ok/15 text-ok' : ok === 'warn' ? 'bg-warn/15 text-warn' : 'bg-bad/15 text-bad';
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <span className={`mt-0.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${style}`}>{ok === true ? 'OK' : ok === 'warn' ? 'Check' : 'Missing'}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-ink-3">{detail}</div>
        {fix && ok !== true && <div className="mt-1 text-xs text-ink-2">{fix}</div>}
      </div>
    </li>
  );
}

export default async function AccountPage() {
  const providers = configuredProviders();
  const bindings = roleBindings();
  const storage = await safeRead(async () => ({ ...(await storageStatus()), ...(await probeStorage()) }), null, 'storageStatus');
  const wordpress = await safeRead(() => getWpConfigView(), { siteUrl: '', username: '', source: 'none' as const, connected: false }, 'getWpConfigView');
  const gate = authEnabled();
  const cron = Boolean(process.env.CRON_SECRET);
  const onVercel = Boolean(process.env.VERCEL);
  const sharedStorage = storage?.mode === 'postgres' || storage?.mode === 'persistent';

  return (
    <Shell banner={<StorageBanner />}>
      <PageHeader title="Account & Setup" subtitle="Everything this workspace needs to run, and how to fix whatever is missing." />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-1 font-bold">Setup checklist</h3>
          <p className="mb-2 text-xs text-ink-3">Environment variables are set in your host, for Vercel under Project → Settings → Environment Variables. Redeploy after changing them.</p>
          <ul className="divide-y divide-line">
            <Row ok={providers.gemini} label="Gemini API key" detail={providers.gemini ? 'GEMINI_API_KEY is set.' : 'No AI tool can run without it.'}
                 fix={<>Create a key at aistudio.google.com, then add it as <code>GEMINI_API_KEY</code>.</>} />
            <Row ok={sharedStorage ? true : storage?.writable ? 'warn' : false}
                 label="Database"
                 detail={storage ? `${storage.driver ?? storage.mode}${storage.writable ? ', writable' : ', not writable'}${storage.perInstance ? ', not shared between server instances' : ''}` : 'Could not read storage status.'}
                 fix={<>On Vercel open Storage → Create Database → Neon (Postgres) and connect it to this project. That sets <code>DATABASE_URL</code>.</>} />
            <Row ok={gate ? true : onVercel ? false : 'warn'} label="Workspace password"
                 detail={gate ? 'APP_PASSWORD is set. Visitors must sign in.' : 'Anyone with the link can use your API quota and publish to your site.'}
                 fix={<>Add <code>APP_PASSWORD</code> with a long passphrase.</>} />
            <Row ok={cron ? true : 'warn'} label="Scheduled Autopilot"
                 detail={cron ? 'CRON_SECRET is set. The queue runs once a day automatically.' : 'Optional. Without it, Autopilot runs only from the Run buttons.'}
                 fix={<>Add <code>CRON_SECRET</code> with any random string.</>} />
            <Row ok={wordpress.connected ? true : 'warn'} label="WordPress"
                 detail={wordpress.connected ? `${wordpress.siteUrl} as ${wordpress.username}` : 'Optional. Needed to publish from Writer-GPT.'}
                 fix={<Link href="/publishing" className="text-accent underline">Connect on the Publishing page</Link>} />
          </ul>
        </section>

        <section className="card p-5">
          <h3 className="mb-3 font-bold">AI providers</h3>
          <ul className="mb-4 flex flex-wrap gap-2">
            {(Object.entries(providers) as [string, boolean][]).map(([id, on]) => (
              <li key={id} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${on ? 'bg-ok/15 text-ok' : 'bg-surface-3 text-ink-3'}`}>
                {id} {on ? 'connected' : 'not set'}
              </li>
            ))}
          </ul>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-3">Model per task</h4>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {bindings.map((b) => (
                <tr key={b.role}>
                  <td className="py-2 capitalize text-ink-2">{b.role}</td>
                  <td className="py-2 font-mono text-xs">{b.binding}{b.overridden && <span className="ml-1 text-ink-3">(override)</span>}</td>
                  {b.error && <td className="py-2 text-xs text-bad">{b.error}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-3">
            Retired Gemini models are replaced automatically with the newest stable one. To pin a model, set e.g.
            <code className="mx-1">MODEL_DRAFT=gemini:gemini-2.5-pro</code>, or route a role to DeepSeek or Grok with their keys.
          </p>
          {gate && <div className="mt-4 border-t border-line pt-4"><SignOutButton /></div>}
        </section>
      </div>
    </Shell>
  );
}
