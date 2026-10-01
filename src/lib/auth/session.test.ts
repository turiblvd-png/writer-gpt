import { afterEach, describe, expect, it } from 'vitest';
import { isPublicPath, isValidSession, safeEqual, sessionToken } from './session';

afterEach(() => { delete process.env.APP_PASSWORD; });

describe('site password', () => {
  it('lets everything through when no password is set', async () => {
    expect(await isValidSession(undefined)).toBe(true);
  });

  it('accepts only the token for the current password', async () => {
    process.env.APP_PASSWORD = 'correct horse';
    const good = await sessionToken('correct horse');
    expect(good).not.toContain('correct');
    expect(await isValidSession(good)).toBe(true);
    expect(await isValidSession(await sessionToken('wrong'))).toBe(false);
    expect(await isValidSession(undefined)).toBe(false);
    process.env.APP_PASSWORD = 'rotated';
    expect(await isValidSession(good)).toBe(false);
  });

  it('compares safely across lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
  });

  it('keeps health, cron and login public but nothing else', () => {
    for (const p of ['/login', '/api/health', '/api/cron/autopilot', '/api/auth/login', '/_next/static/x.js']) expect(isPublicPath(p)).toBe(true);
    for (const p of ['/', '/generate', '/api/generate', '/api/publishing/publish', '/loginx']) expect(isPublicPath(p)).toBe(false);
  });
});
