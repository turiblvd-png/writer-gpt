'use client';

import { readJson } from '@/lib/http/read-json';
import { useState } from 'react';
import Link from 'next/link';

export function AuthForm({ mode: initialMode, next }: { mode: 'login' | 'signup'; next: string }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';
  const reset = mode === 'reset';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const url = signup ? '/api/auth/signup' : reset ? '/api/auth/reset' : '/api/auth/login';
    const payload = signup ? { name, email, password, setupCode } : reset ? { email, password, setupCode } : { email, password };
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
      return;
    }
    if (res.ok) {
      window.location.assign(next);
      return;
    }
    const data = await readJson(res);
    if (res.status === 403 && /setup code/i.test(data.error ?? '')) setShowSetup(true);
    setError(data.error ?? `Something went wrong on the server (HTTP ${res.status}). Try again in a minute.`);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-7">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-black text-accent-ink">W</span>
        <span className="text-lg font-extrabold">Writer-GPT</span>
      </div>
      <h1 className="mb-1 text-xl font-bold">{signup ? 'Create your account' : reset ? 'Reset developer password' : 'Sign in'}</h1>
      <p className="mb-5 text-sm text-ink-3">
        {signup ? 'Research-grounded SEO writing, ready in a minute.'
          : reset ? 'For the site owner. Your setup code is the APP_PASSWORD value in Vercel → Settings → Environment Variables.'
          : 'Welcome back.'}
      </p>

      {signup && (
        <input className="field mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Name" autoComplete="name" />
      )}
      <input className="field mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
             placeholder="Email" aria-label="Email" autoComplete="email" autoFocus required />
      <input className="field mb-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
             placeholder={signup || reset ? 'New password (8+ characters)' : 'Password'} aria-label="Password"
             autoComplete={signup || reset ? 'new-password' : 'current-password'} required minLength={signup || reset ? 8 : undefined} />

      {reset && (
        <input className="field mb-3" type="password" value={setupCode} onChange={(e) => setSetupCode(e.target.value)}
               placeholder="Setup code (your APP_PASSWORD)" aria-label="Setup code" autoComplete="off" required />
      )}

      {signup && (showSetup ? (
        <input className="field mb-3" type="password" value={setupCode} onChange={(e) => setSetupCode(e.target.value)}
               placeholder="Setup code (your APP_PASSWORD)" aria-label="Setup code" autoComplete="off" />
      ) : (
        <button type="button" className="mb-3 text-xs text-ink-3 underline hover:text-ink" onClick={() => setShowSetup(true)}>
          Site owner? Enter your setup code
        </button>
      ))}

      {error && <p className="mb-3 rounded-lg border border-bad/30 bg-bad/10 p-2.5 text-sm text-bad" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !email || !password || (reset && !setupCode)}>
        {busy ? 'Please wait…' : signup ? 'Create account' : reset ? 'Set new password and sign in' : 'Sign in'}
      </button>
      <p className="mt-4 text-center text-sm text-ink-3">
        {signup ? <>Already have an account? <Link href="/login" className="text-accent underline">Sign in</Link></>
          : reset ? <button type="button" className="text-accent underline" onClick={() => { setMode('login'); setError(null); }}>Back to sign in</button>
          : <>New here? <Link href="/signup" className="text-accent underline">Create an account</Link></>}
      </p>
      {mode === 'login' && (
        <p className="mt-2 text-center text-xs text-ink-3">
          <button type="button" className="underline hover:text-ink" onClick={() => { setMode('reset'); setError(null); setPassword(''); }}>
            Forgot password?
          </button>
        </p>
      )}
    </form>
  );
}
