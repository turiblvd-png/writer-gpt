/**
 * Signed session tokens, shared by middleware (edge) and server code.
 *
 * A token is base64url(JSON payload) + "." + HMAC-SHA256 signature, keyed by
 * AUTH_SECRET, or APP_PASSWORD when no separate secret is set. Nothing secret
 * lives in the payload; the signature only proves the server issued it. Web
 * Crypto only, because middleware runs on the edge.
 *
 * With neither variable set the app runs open and single-user, which keeps
 * local development and the test suite working without accounts.
 */

export const SESSION_COOKIE = 'wg_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type Role = 'owner' | 'admin' | 'subscriber';

export interface SessionPayload {
  uid: string;
  email: string;
  role: Role;
  /** Expiry, seconds since epoch. */
  exp: number;
}

/** The developer account. Signing up with this email requires the setup code. */
export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL || 'turi.ishtiaq@gmail.com').trim().toLowerCase();
}

function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || null;
}

export function authEnabled(): boolean {
  return Boolean(secret());
}

export function isAdminRole(role: Role | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function sign(data: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data))));
}

/** Length-independent comparison, so timing does not leak how much matched. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function createSessionToken(user: { id: string; email: string; role: Role }, now = Date.now()): Promise<string> {
  const key = secret();
  if (!key) throw new Error('Set AUTH_SECRET or APP_PASSWORD to enable accounts.');
  const payload: SessionPayload = { uid: user.id, email: user.email, role: user.role, exp: Math.floor(now / 1000) + SESSION_MAX_AGE };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await sign(body, key)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<SessionPayload | null> {
  const key = secret();
  if (!key || !token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!safeEqual(sig, await sign(body, key))) return null;
  try {
    const payload = JSON.parse(fromB64url(body)) as SessionPayload;
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Paths that stay reachable without a session. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/health' ||
    // Cron has its own bearer secret.
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/icon.svg' ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt'
  );
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
}
