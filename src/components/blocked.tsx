'use client';

export function BlockedScreen({ reason }: { reason: 'suspended' | 'deleted' }) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="card max-w-sm p-7 text-center">
        <h1 className="mb-2 text-xl font-bold">{reason === 'suspended' ? 'Account suspended' : 'Account not found'}</h1>
        <p className="mb-5 text-sm text-ink-3">
          {reason === 'suspended'
            ? 'This account has been suspended. Contact the site owner if you think this is a mistake.'
            : 'This account no longer exists. Sign in with another account or create a new one.'}
        </p>
        <button
          className="btn-primary w-full"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.assign('/login');
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
