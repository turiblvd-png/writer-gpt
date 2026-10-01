import { storageStatus } from '@/lib/db/store';

/**
 * Tells the user when their data will not be kept.
 *
 * On a serverless host only /tmp is writable, and that is wiped on every cold
 * start, so articles and projects disappear without explanation. Saying so is
 * better than letting someone build a 14-stage project that vanishes.
 */
export function StorageBanner() {
  const { mode, error, perInstance } = storageStatus();
  if (mode === 'persistent') return null;

  return (
    <div
      className={`mb-5 rounded-xl border p-4 text-sm ${
        mode === 'memory' ? 'border-bad/30 bg-bad/10' : 'border-warn/30 bg-warn/10'
      }`}
      role="status"
    >
      <p className={`font-semibold ${perInstance ? 'text-bad' : 'text-warn'}`}>
        {perInstance ? 'Saving will not work reliably on this host' : 'Temporary storage'}
      </p>
      <p className="mt-1 text-ink-2">
        {mode === 'memory'
          ? 'The data file could not be opened, so nothing is being saved at all.'
          : perInstance
            ? 'This host runs the app across separate instances that do not share a disk, so a project saved by one request can be invisible to the next. Creating a project may appear to fail even when it succeeded.'
            : 'This host only allows writes to a temporary directory, so saved work is lost whenever the server restarts.'}{' '}
        The writing tools themselves work. To save work reliably, deploy to a host with a persistent disk
        (Railway, Render, Fly, or a VPS) and set{' '}
        <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs text-accent-2">DATABASE_PATH</code> to a
        mounted volume.
      </p>
      {error && <p className="mt-1.5 font-mono text-[11px] text-ink-3">{error}</p>}
    </div>
  );
}
