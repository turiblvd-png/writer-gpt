import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-users-')), 'data.json');
  process.env.APP_PASSWORD = 'setup-code-123';
  delete process.env.OWNER_EMAIL;
});

describe('accounts', () => {
  it('needs the setup code for the developer account', async () => {
    const { signUp } = await import('./users');
    await expect(signUp({ email: 'Turi.Ishtiaq@gmail.com', password: 'longenough' })).rejects.toThrow(/setup code/);
    const owner = await signUp({ email: 'Turi.Ishtiaq@gmail.com', password: 'longenough', setupCode: 'setup-code-123' });
    expect(owner).toMatchObject({ email: 'turi.ishtiaq@gmail.com', role: 'owner' });
    expect(owner).not.toHaveProperty('passwordHash');
  });

  it('signs subscribers up and in, and refuses bad passwords and duplicates', async () => {
    const { signUp, signIn } = await import('./users');
    const u = await signUp({ email: 'reader@example.com', password: 'longenough', name: 'Reader' });
    expect(u.role).toBe('subscriber');
    await expect(signUp({ email: 'READER@example.com', password: 'longenough' })).rejects.toThrow(/already exists/);
    await expect(signUp({ email: 'x@example.com', password: 'short' })).rejects.toThrow(/8 characters/);
    expect((await signIn('reader@example.com', 'longenough')).id).toBe(u.id);
    await expect(signIn('reader@example.com', 'wrong-password')).rejects.toThrow(/Wrong password/);
    await expect(signIn('nobody@example.com', 'longenough')).rejects.toThrow(/No account with this email/);
  });

  it('suspends subscribers but never the developer', async () => {
    const { signUp, signIn, updateUser, deleteUser } = await import('./users');
    const owner = await signUp({ email: 'turi.ishtiaq@gmail.com', password: 'longenough', setupCode: 'setup-code-123' });
    const u = await signUp({ email: 'reader@example.com', password: 'longenough' });
    await updateUser(u.id, { status: 'suspended', plan: 'pro' });
    await expect(signIn('reader@example.com', 'longenough')).rejects.toThrow(/suspended/);
    await expect(updateUser(owner.id, { status: 'suspended' })).rejects.toThrow(/cannot be suspended/);
    await expect(deleteUser(owner.id)).rejects.toThrow(/cannot be deleted/);
  });
});

describe('private data', () => {
  it('keeps each user to their own records, and gives the owner pre-account records', async () => {
    const { collection } = await import('@/lib/db/engine');
    const { runAs } = await import('./actor');
    const notes = collection<{ id: string; text: string }>('notes');
    const alice = { id: 'alice', email: 'a@x.co', role: 'subscriber' as const };
    const bob = { id: 'bob', email: 'b@x.co', role: 'subscriber' as const };
    const owner = { id: 'owner', email: 'o@x.co', role: 'owner' as const };

    await runAs(null, () => notes.put({ id: 'legacy', text: 'from before accounts' }));
    await runAs(alice, () => notes.put({ id: 'a1', text: 'alice' }));
    await runAs(bob, () => notes.put({ id: 'b1', text: 'bob' }));

    expect((await runAs(alice, () => notes.all())).map((n) => n.id)).toEqual(['a1']);
    expect((await runAs(bob, () => notes.list('id' as never))).map((n) => n.id)).toEqual(['b1']);
    expect(await runAs(bob, () => notes.get('a1'))).toBeNull();
    expect(await runAs(bob, () => notes.mutate('a1', (n) => ({ ...n, text: 'hacked' })))).toBeNull();
    await runAs(bob, () => notes.remove('a1'));
    await expect(runAs(bob, () => notes.put({ id: 'a1', text: 'overwrite' }))).rejects.toThrow();
    expect((await runAs(alice, () => notes.get('a1')))?.text).toBe('alice');

    expect((await runAs(owner, () => notes.all())).map((n) => n.id)).toEqual(['legacy']);
    expect(await runAs(null, () => notes.all())).toHaveLength(3);
  });
});

describe('never locked out', () => {
  it('lets the developer in with the setup code, creating the account if needed', async () => {
    const { signIn } = await import('./users');
    const first = await signIn('turi.ishtiaq@gmail.com', 'setup-code-123');
    expect(first.role).toBe('owner');
    const again = await signIn('Turi.Ishtiaq@gmail.com', 'setup-code-123');
    expect(again.id).toBe(first.id);
    await expect(signIn('someone@else.com', 'setup-code-123')).rejects.toThrow(/No account/);
  });

  it('explains a missing account and a wrong password differently', async () => {
    const { signUp, signIn } = await import('./users');
    await expect(signIn('turi.ishtiaq@gmail.com', 'whatever-1')).rejects.toThrow(/No developer account yet/);
    await signUp({ email: 'reader@example.com', password: 'longenough' });
    await expect(signIn('reader@example.com', 'nope-nope-1')).rejects.toThrow(/Wrong password/);
  });

  it('recovers the developer password with the setup code only', async () => {
    const { signUp, signIn, resetOwnerPassword, resetPasswordByAdmin } = await import('./users');
    await signUp({ email: 'turi.ishtiaq@gmail.com', password: 'forgotten-1', setupCode: 'setup-code-123' });
    await expect(resetOwnerPassword('turi.ishtiaq@gmail.com', 'wrong', 'brand-new-1')).rejects.toThrow(/setup code/);
    await expect(resetOwnerPassword('reader@example.com', 'setup-code-123', 'brand-new-1')).rejects.toThrow(/Only the developer/);
    await resetOwnerPassword('turi.ishtiaq@gmail.com', 'setup-code-123', 'brand-new-1');
    expect((await signIn('turi.ishtiaq@gmail.com', 'brand-new-1')).role).toBe('owner');

    const u = await signUp({ email: 'reader@example.com', password: 'longenough' });
    const temp = await resetPasswordByAdmin(u.id);
    expect((await signIn('reader@example.com', temp)).id).toBe(u.id);
  });
});
