import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const complete = vi.fn();
vi.mock('@/lib/ai', () => ({ complete: (...a: unknown[]) => complete(...a) }));

const reply = (text: string) => ({
  text,
  sources: [
    { uri: 'https://a.example/1', domain: 'a.example' },
    { uri: 'https://a.example/2', domain: 'a.example' },
    { uri: 'https://b.example/', domain: 'b.example' },
  ],
  searchQueries: [], usage: { input: 1, output: 1, total: 2 }, model: 'm', provider: 'gemini' as const,
});

beforeEach(() => {
  vi.resetModules();
  complete.mockReset();
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-cop-')), 'data.json');
});

describe('SEO Copilot', () => {
  it('starts a conversation, grounds the call and strips em dashes', async () => {
    complete.mockResolvedValueOnce(reply('Short answer — rewrite the title.'));
    const { sendMessage, listConversations } = await import('./chat');
    const c = await sendMessage({ message: 'How do I fix my title?' });

    expect(complete.mock.calls[0]![1].grounded).toBe(true);
    expect(c.messages).toHaveLength(2);
    expect(c.messages[1]!.content).not.toMatch(/—/);
    expect(c.messages[1]!.sources).toHaveLength(2);
    expect(c.title).toBe('How do I fix my title?');
    expect((await listConversations()).map((x) => x.id)).toEqual([c.id]);
  });

  it('continues the same thread and sends the history', async () => {
    complete.mockResolvedValueOnce(reply('First answer.')).mockResolvedValueOnce(reply('Second answer.'));
    const { sendMessage, getConversation } = await import('./chat');
    const first = await sendMessage({ message: 'Question one' });
    await sendMessage({ conversationId: first.id, message: 'Question two' });

    const prompt = complete.mock.calls[1]![1].prompt as string;
    expect(prompt).toContain('Question one');
    expect(prompt).toContain('First answer.');
    expect((await getConversation(first.id))!.messages).toHaveLength(4);
  });

  it('rejects an empty message without calling the model', async () => {
    const { sendMessage } = await import('./chat');
    await expect(sendMessage({ message: '   ' })).rejects.toThrow(/question/);
    expect(complete).not.toHaveBeenCalled();
  });
});
