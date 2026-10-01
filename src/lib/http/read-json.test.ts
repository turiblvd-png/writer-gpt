import { describe, expect, it } from 'vitest';
import { readJson } from './read-json';

describe('readJson', () => {
  it('turns the host timeout page into a plain explanation', async () => {
    const res = new Response('An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT', { status: 504 });
    expect((await readJson(res)).error).toMatch(/hosting time limit/);
  });
  it('explains other non-JSON failures by status', async () => {
    expect((await readJson(new Response('<html>Bad gateway</html>', { status: 502 }))).error).toMatch(/HTTP 502/);
    expect((await readJson(new Response('', { status: 401 }))).error).toMatch(/sign in/);
  });
  it('passes real JSON through, errors included', async () => {
    expect(await readJson(new Response('{"ok":true}'))).toEqual({ ok: true });
    expect((await readJson(new Response('{"error":"Nope"}', { status: 400 }))).error).toBe('Nope');
  });
});
