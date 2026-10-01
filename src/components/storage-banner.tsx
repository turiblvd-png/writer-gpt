import { storageStatus } from '@/lib/db/store';

/**
 * Tells the user when their data will not be kept.
 *
 * On a serverless host only /tmp is writable, and that is wiped on every cold
 * start, so articles and projects disappear without explanation. Saying so is
 * better than letting someone build a 14-stage project that vanishes.
 */
export function StorageBanner() {
  const { mode, error } = storageStatus();
  if (mode === 'persistent') return null;

  return (
    <div
      className={`mb-5 rounded-xl border p-4 text-sm ${
        mode === 'memory' ? 'border-bad/30 bg-bad/10' : 'border-warn/30 bg-warn/10'
      }`}
      role="status"
    >
      <p className={`font-semibold ${mode === 'memory' ? 'text-bad' : 'text-warn'}`}>
        {mode === 'memory' ? 'Storage unavailable, running in memory' : 'Temporary storage'}
      </p>
      <p className="mt-1 text-ink-2">
        {mode === 'memory'
          ? 'The database could not be opened, so nothing is being saved at all.'
          : 'This host only allows writes to a temporary directory, so saved articles and projects are lost whenever the server restarts.'}{' '}
        The tools all work; the data is just not kept. For durable storage, deploy to a host with a persistent
        volume and set <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs text-accent-2">DATABASE_PATH</code> to it,
        or move the store to Postgres.
      </p>
      {error && <p className="mt-1.5 font-mono text-[11px] text-ink-3">{error}</p>}
    </div>
  );
}
