import { afterEach, describe, expect, it } from 'vitest';
import { createSessionToken, isAdminPath, isPublicPath, safeEqual, verifySessionToken } from './session';

afterEach(() => {
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_SECRET;
});

const user = { id: 'u1', email: 'a@b.co', role: 'subscriber' as const };

describe('sessions', () => {
  it('round-trips a signed token', async () => {
    process.env.APP_PASSWORD = 'correct horse';
    const token = await createSessionToken(user);
    expect(token).not.toContain('correct');
    expect(await verifySessionToken(token)).toMatchObject({ uid: 'u1', role: 'subscriber' });
  });

  it('rejects tampering, expiry and a rotated secret', async () => {
    process.env.APP_PASSWORD = 'correct horse';
    const token = await createSessionToken(user);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'u1', email: 'a@b.co', role: 'owner', exp: 9e9 })).toString('base64url');
    expect(await verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(await verifySessionToken(`${body}.x${sig}`)).toBeNull();
    expect(await verifySessionToken(token, Date.now() + 31 * 86_400_000)).toBeNull();
    process.env.APP_PASSWORD = 'rotated';
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('is off without a secret', async () => {
    expect(await verifySessionToken('anything')).toBeNull();
    await expect(createSessionToken(user)).rejects.toThrow(/APP_PASSWORD/);
  });

  it('compares safely across lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('keeps sign-in, health and cron public, and fences the dashboard', () => {
    for (const p of ['/login', '/signup', '/api/health', '/api/cron/autopilot', '/api/auth/login']) expect(isPublicPath(p)).toBe(true);
    for (const p of ['/', '/generate', '/admin', '/api/publishing/publish', '/loginx']) expect(isPublicPath(p)).toBe(false);
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/api/admin/users')).toBe(true);
    expect(isAdminPath('/administer')).toBe(false);
  });
});
