'use client';

/** Last resort: catches failures in the root layout, where error.tsx cannot run. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#070b14', color: '#e8eefc', fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <div style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 520, border: '1px solid rgba(239,68,68,.3)', borderRadius: 16, padding: 28 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>The application failed to start</h1>
            <pre style={{
              marginTop: 16, padding: 12, borderRadius: 12, background: '#0b1220',
              fontSize: 11, color: '#93a4c4', overflow: 'auto',
            }}>
              {error.message}{error.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
            <button
              onClick={reset}
              style={{
                marginTop: 20, padding: '10px 20px', borderRadius: 999, border: 0,
                background: '#1d9bf0', color: '#04121f', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
