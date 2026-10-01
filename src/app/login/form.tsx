'use client';

import { useState } from 'react';
import Link from 'next/link';

export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(signup ? '/api/auth/signup' : '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signup ? { name, email, password, setupCode } : { email, password }),
    });
    if (res.ok) {
      window.location.assign(next);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 && /setup code/i.test(data.error ?? '')) setShowSetup(true);
    setError(data.error ?? 'Something went wrong.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-7">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-black text-accent-ink">W</span>
        <span className="text-lg font-extrabold">Writer-GPT</span>
      </div>
      <h1 className="mb-1 text-xl font-bold">{signup ? 'Create your account' : 'Sign in'}</h1>
      <p className="mb-5 text-sm text-ink-3">{signup ? 'Research-grounded SEO writing, ready in a minute.' : 'Welcome back.'}</p>

      {signup && (
        <input className="field mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Name" autoComplete="name" />
      )}
      <input className="field mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
             placeholder="Email" aria-label="Email" autoComplete="email" autoFocus required />
      <input className="field mb-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
             placeholder={signup ? 'Password (8+ characters)' : 'Password'} aria-label="Password"
             autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : undefined} />

      {signup && (showSetup ? (
        <input className="field mb-3" type="password" value={setupCode} onChange={(e) => setSetupCode(e.target.value)}
               placeholder="Setup code (your APP_PASSWORD)" aria-label="Setup code" autoComplete="off" />
      ) : (
        <button type="button" className="mb-3 text-xs text-ink-3 underline hover:text-ink" onClick={() => setShowSetup(true)}>
          Site owner? Enter your setup code
        </button>
      ))}

      {error && <p className="mb-3 text-sm text-bad">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !email || !password}>
        {busy ? (signup ? 'Creating…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}
      </button>
      <p className="mt-4 text-center text-sm text-ink-3">
        {signup ? <>Already have an account? <Link href="/login" className="text-accent underline">Sign in</Link></>
                : <>New here? <Link href="/signup" className="text-accent underline">Create an account</Link></>}
      </p>
    </form>
  );
}
