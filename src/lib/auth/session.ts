/**
 * Optional site password.
 *
 * When APP_PASSWORD is set, every page and API needs a session cookie. The
 * cookie holds an HMAC of a fixed label keyed by the password, so it proves
 * knowledge of the password without containing it, and changing the password
 * signs everyone out. Web Crypto only, because middleware runs on the edge.
 */

export const SESSION_COOKIE = 'wg_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode('writer-gpt-session-v1')));
}

/** Length-independent comparison, so timing does not leak how much matched. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  if (!cookie) return false;
  return safeEqual(cookie, await sessionToken(password));
}

/** Paths that stay reachable without a session. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
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
