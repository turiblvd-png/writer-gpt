'use client';

import { useEffect } from 'react';

/**
 * Replaces the host's blank "Application error: a server-side exception has
 * occurred" with something actionable. That message cost a full debugging
 * round trip because it carried no information beyond a digest.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[page error]', error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6 text-ink">
      <div className="w-full max-w-lg rounded-2xl border border-bad/30 bg-surface p-7">
        <h1 className="text-xl font-extrabold">Something failed while rendering this page</h1>
        <p className="mt-2 text-sm text-ink-2">
          The tools themselves are fine. This is usually storage or a missing environment variable.
        </p>

        <pre className="mt-4 overflow-auto rounded-xl bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-3">
          {error.message || 'No message provided.'}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>

        <p className="mt-4 text-sm text-ink-2">
          Open <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-accent-2">/api/health</code>{' '}
          to see which commit is deployed and what storage reports.
        </p>

        <div className="mt-5 flex gap-3">
          <button className="btn-primary flex-1" onClick={reset}>Try again</button>
          <a className="btn-ghost flex-1" href="/api/health">Open health</a>
        </div>
      </div>
    </div>
  );
}
