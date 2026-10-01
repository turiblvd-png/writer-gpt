'use client';

import { useState } from 'react';

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.assign(next);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? 'Could not sign in.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-7">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-black text-accent-ink">W</span>
        <span className="text-lg font-extrabold">Writer-GPT</span>
      </div>
      <h1 className="mb-1 text-xl font-bold">Sign in</h1>
      <p className="mb-5 text-sm text-ink-3">Enter the workspace password.</p>
      <input className="field mb-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
             placeholder="Password" aria-label="Password" autoFocus autoComplete="current-password" />
      {error && <p className="mb-3 text-sm text-bad">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
