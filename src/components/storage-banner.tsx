import { storageStatus } from '@/lib/db/store';

/**
 * Tells the user when their data will not be kept, and exactly how to fix it.
 *
 * On a serverless host each instance has its own throwaway disk, so a project
 * saved by one request is invisible to the next. Only a shared database fixes
 * that, and only the site owner can create one in their hosting account, so
 * the banner gives the steps plus what the app can currently see.
 */
export async function StorageBanner() {
  const status = await storageStatus();
  const { mode, error, perInstance, envNames = [] } = status;

  if (mode === 'postgres' && !error) return null;
  if (mode === 'persistent') return null;

  if (mode === 'postgres') {
    return (
      <div className="mb-5 rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm" role="status">
        <p className="font-semibold text-bad">The database is connected but not answering</p>
        <p className="mt-1 text-ink-2">
          The app found a database in <code className="font-mono text-xs">{status.source}</code> but could not reach it.
          In Vercel open Storage, check the Neon database is active and still connected to this project, then redeploy.
        </p>
        <p className="mt-1.5 font-mono text-[11px] text-ink-3">{error}</p>
      </div>
    );
  }

  return (
    <div
      className={`mb-5 rounded-xl border p-4 text-sm ${mode === 'memory' || perInstance ? 'border-bad/30 bg-bad/10' : 'border-warn/30 bg-warn/10'}`}
      role="status"
    >
      <p className={`font-semibold ${perInstance ? 'text-bad' : 'text-warn'}`}>
        {perInstance ? 'No database connected, so saving does not work on Vercel' : 'Temporary storage'}
      </p>
      <p className="mt-1 text-ink-2">
        {perInstance
          ? 'Vercel runs this site as many separate copies, each with its own throwaway disk. Without a shared database, what one copy saves the next one cannot see. This is a one-time setup in your Vercel account:'
          : 'This host only writes to a temporary directory, so saved work is lost when the server restarts. Connect a Postgres database:'}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
        <li>Open vercel.com, then this project, then the <strong className="text-ink">Storage</strong> tab.</li>
        <li>Click <strong className="text-ink">Create Database</strong>, choose <strong className="text-ink">Neon</strong> (free plan), accept, and click <strong className="text-ink">Connect</strong> with all environments ticked.</li>
        <li>Open <strong className="text-ink">Deployments</strong>, click the three dots on the top deployment, then <strong className="text-ink">Redeploy</strong>. New settings only reach new deployments.</li>
      </ol>
      <p className="mt-2 text-xs text-ink-3">
        {envNames.length
          ? <>Database-like settings this deployment can see: <code className="font-mono">{envNames.join(', ')}</code>, but none holds a postgres:// address.</>
          : 'This deployment sees no database settings at all. If you already connected one, it was added after this deployment was built: redeploy.'}
      </p>
      {error && <p className="mt-1.5 font-mono text-[11px] text-ink-3">{error}</p>}
    </div>
  );
}
