import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { collection } from '@/lib/db/engine';
import { ownerEmail, safeEqual, type Role } from './session';

/**
 * Accounts. Passwords are stored as scrypt hashes with a per-user salt and are
 * never returned by any function here; callers get PublicUser.
 *
 * The owner (developer) account is the configured owner email. Since there is
 * no email verification yet, anyone could otherwise register that address
 * first and take over the dashboard, so creating it needs the setup code: the
 * APP_PASSWORD already set in the hosting dashboard.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type UserStatus = 'active' | 'suspended';
export type Plan = 'free' | 'pro' | 'business';
export const PLANS: Plan[] = ['free', 'pro', 'business'];

interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  plan: Plan;
  createdAt: number;
  lastSeenAt: number;
}

export type PublicUser = Omit<UserRecord, 'passwordHash'>;

const users = collection<UserRecord>('users', { global: true });

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'AuthError';
  }
}

function toPublic({ passwordHash: _hash, ...rest }: UserRecord): PublicUser {
  return rest;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function findByEmail(email: string): Promise<UserRecord | null> {
  const target = normaliseEmail(email);
  return (await users.all()).find((u) => u.email === target) ?? null;
}

export async function signUp(input: { email: string; password: string; name?: string; setupCode?: string }): Promise<PublicUser> {
  const email = normaliseEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('Enter a valid email address.');
  if (input.password.length < 8) throw new AuthError('Use a password of at least 8 characters.');
  if (await findByEmail(email)) throw new AuthError('An account with this email already exists. Sign in instead.', 409);

  const isOwner = email === ownerEmail();
  if (isOwner) {
    if (!isSetupCode(input.setupCode ?? '')) {
      throw new AuthError('This is the developer account. Enter the setup code (your APP_PASSWORD) to create it.', 403);
    }
  }

  const now = Date.now();
  const record: UserRecord = {
    id: randomUUID(),
    email,
    name: (input.name ?? '').trim().slice(0, 80) || email.split('@')[0]!,
    passwordHash: await hashPassword(input.password),
    role: isOwner ? 'owner' : 'subscriber',
    status: 'active',
    plan: isOwner ? 'business' : 'free',
    createdAt: now,
    lastSeenAt: now,
  };
  await users.put(record);
  return toPublic(record);
}

function setupCode(): string {
  return process.env.APP_PASSWORD ?? process.env.AUTH_SECRET ?? '';
}

/** True when the given text is the site's setup code (APP_PASSWORD). */
export function isSetupCode(text: string): boolean {
  const code = setupCode();
  return Boolean(code) && safeEqual(text, code);
}

export async function signIn(email: string, password: string): Promise<PublicUser> {
  const target = normaliseEmail(email);
  const user = await findByEmail(target);

  // The developer can never be locked out: the setup code (APP_PASSWORD) is a
  // master key for the owner email. It signs in, and creates the account if
  // it does not exist yet. Whoever holds it controls the site anyway.
  if (target === ownerEmail() && isSetupCode(password)) {
    if (!user) return signUp({ email: target, password, name: 'Developer', setupCode: password });
    if (user.role !== 'owner') await users.mutate(user.id, (u) => ({ ...u, role: 'owner', status: 'active' }));
    await users.mutate(user.id, (u) => ({ ...u, lastSeenAt: Date.now() }));
    return toPublic({ ...user, role: 'owner', status: 'active' });
  }

  if (!user) {
    throw new AuthError(
      target === ownerEmail()
        ? 'No developer account yet. Click "Create an account", or sign in with your setup code (APP_PASSWORD) as the password.'
        : 'No account with this email yet. Click "Create an account" below.',
      404,
    );
  }
  if (!(await checkPassword(password, user.passwordHash))) throw new AuthError('Wrong password for this email.', 401);
  if (user.status === 'suspended') throw new AuthError('This account is suspended. Contact the site owner.', 403);
  await users.mutate(user.id, (u) => ({ ...u, lastSeenAt: Date.now() }));
  return toPublic(user);
}

/** Developer password recovery: the setup code proves who is asking. */
export async function resetOwnerPassword(email: string, code: string, next: string): Promise<PublicUser> {
  const target = normaliseEmail(email);
  if (target !== ownerEmail()) throw new AuthError('Only the developer account can be recovered here. Subscribers: ask the site owner to reset your password.', 403);
  if (!isSetupCode(code)) throw new AuthError('That setup code is not right. It is the APP_PASSWORD value in your Vercel settings.', 403);
  if (next.length < 8) throw new AuthError('Use a password of at least 8 characters.');
  const user = await findByEmail(target);
  if (!user) return signUp({ email: target, password: next, name: 'Developer', setupCode: code });
  const hash = await hashPassword(next);
  const updated = await users.mutate(user.id, (u) => ({ ...u, passwordHash: hash, role: 'owner', status: 'active' }));
  return toPublic(updated!);
}

/** An admin sets a temporary password for a subscriber, shown to the admin once. */
export async function resetPasswordByAdmin(id: string): Promise<string> {
  const user = await users.get(id);
  if (!user) throw new AuthError('User not found.', 404);
  if (user.role === 'owner') throw new AuthError('The developer resets their own password from the sign-in page.');
  const temp = randomBytes(9).toString('base64url');
  const hash = await hashPassword(temp);
  await users.mutate(id, (u) => ({ ...u, passwordHash: hash }));
  return temp;
}

export async function getUser(id: string): Promise<PublicUser | null> {
  const u = await users.get(id);
  return u ? toPublic(u) : null;
}

export async function listUsers(): Promise<PublicUser[]> {
  return (await users.list('createdAt', 1000)).map(toPublic);
}

export async function updateUser(id: string, patch: { status?: UserStatus; plan?: Plan; role?: Role }): Promise<PublicUser | null> {
  const target = await users.get(id);
  if (!target) return null;
  if (target.role === 'owner' && (patch.status === 'suspended' || (patch.role && patch.role !== 'owner'))) {
    throw new AuthError('The developer account cannot be suspended or demoted.');
  }
  if (patch.role === 'owner') throw new AuthError('There is only one developer account.');
  const next = await users.mutate(id, (u) => ({
    ...u,
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.plan && PLANS.includes(patch.plan) ? { plan: patch.plan } : {}),
    ...(patch.role ? { role: patch.role } : {}),
  }));
  return next ? toPublic(next) : null;
}

export async function deleteUser(id: string): Promise<void> {
  const target = await users.get(id);
  if (target?.role === 'owner') throw new AuthError('The developer account cannot be deleted.');
  await users.remove(id);
}

export async function changePassword(id: string, current: string, next: string): Promise<void> {
  const user = await users.get(id);
  if (!user || !(await checkPassword(current, user.passwordHash))) throw new AuthError('Your current password is wrong.', 401);
  if (next.length < 8) throw new AuthError('Use a password of at least 8 characters.');
  const hash = await hashPassword(next);
  await users.mutate(id, (u) => ({ ...u, passwordHash: hash }));
}

/** Records activity at most every few minutes, so page views do not each write. */
export async function touch(id: string): Promise<void> {
  const user = await users.get(id);
  if (user && Date.now() - user.lastSeenAt > 5 * 60_000) {
    await users.mutate(id, (u) => ({ ...u, lastSeenAt: Date.now() }));
  }
}

