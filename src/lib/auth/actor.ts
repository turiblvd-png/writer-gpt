import { AsyncLocalStorage } from 'node:async_hooks';
import { authEnabled, SESSION_COOKIE, verifySessionToken, type Role } from './session';

/**
 * Who the current code is acting for.
 *
 * Inside a request it is the signed-in user, read from the session cookie.
 * Background work (the Autopilot cron, a stream that outlives its request)
 * sets it explicitly with runAs. Null means "the system": no accounts are
 * configured, or the code runs outside any request, and it sees everything.
 */
export interface Actor {
  id: string;
  email: string;
  role: Role;
}

const store = new AsyncLocalStorage<Actor | null>();

export function runAs<T>(actor: Actor | null, fn: () => Promise<T>): Promise<T> {
  return store.run(actor, fn);
}

export async function currentActor(): Promise<Actor | null> {
  const explicit = store.getStore();
  if (explicit !== undefined) return explicit;
  if (!authEnabled()) return null;
  try {
    const { cookies } = await import('next/headers');
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = await verifySessionToken(token);
    return session ? { id: session.uid, email: session.email, role: session.role } : null;
  } catch {
    // Not inside a request (tests, scripts, cron before runAs).
    return null;
  }
}
