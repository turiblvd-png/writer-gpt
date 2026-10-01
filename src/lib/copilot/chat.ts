import { randomUUID } from 'node:crypto';
import { complete, type Source } from '@/lib/ai';
import { collection } from '@/lib/db/engine';
import { makeClock } from '@/lib/pipeline/engine';
import { NATURAL_WRITING_RULES, factualRules } from '@/lib/style/rules';
import { sanitizeDraft } from '@/lib/style/sanitize';

/**
 * SEO Copilot: a conversation with an SEO strategist that reads live search
 * before answering.
 *
 * Every turn is grounded, so "what ranks for X right now" gets today's answer
 * rather than whatever the model remembers. Conversations are stored whole,
 * one document each, so a reload or a different serverless instance picks up
 * the same thread.
 */

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  createdAt: number;
}

export interface CopilotConversation {
  id: string;
  title: string;
  messages: CopilotMessage[];
  createdAt: number;
  updatedAt: number;
}

const store = collection<CopilotConversation>('copilot_conversations');

/** Turns of history sent back to the model. Older turns are summarised by omission. */
const HISTORY_TURNS = 12;
const MAX_MESSAGE = 4000;

export const STARTER_PROMPTS = [
  'What ranks on page one for "best running shoes for flat feet" right now, and what would it take to beat it?',
  'Audit my title and meta description for a page about home solar battery costs.',
  'Give me a topical map for a new site about indoor plant care.',
  'How should I structure an FAQ section so AI answers quote it?',
];

function systemPrompt(): string {
  const clock = makeClock();
  return [
    'You are a senior SEO strategist working inside Writer-GPT. You give specific, current, actionable advice.',
    '',
    'How you work:',
    '- Search before answering anything about rankings, competitors, SERP features, algorithm updates or current events. Say what you saw, and name the sites.',
    '- Lead with the answer. Then the reasoning. Then the next action the user should take.',
    '- Use short sections, numbered steps and tables where they make the answer easier to act on.',
    '- Never invent search volumes, traffic numbers or backlink counts. If a number would need a paid tool, say which kind of tool and what to look for.',
    '- When the user wants content written, point them to the right Writer-GPT tool: Generate Content for a full article, Semantic Writer for entity-first long form, Humanizer to clean up a draft, Rewrite from URL to rebuild a page, Keyword Research for clusters, Content Audit to score a page, AI Visibility to check AI citations.',
    '- If you are not sure, say so and say how to check.',
    '',
    factualRules(clock),
    '',
    NATURAL_WRITING_RULES,
  ].join('\n');
}

function transcript(messages: CopilotMessage[]): string {
  return messages
    .slice(-HISTORY_TURNS)
    .map((m) => `${m.role === 'user' ? 'USER' : 'YOU'}: ${m.content}`)
    .join('\n\n');
}

function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}...` : clean;
}

export async function sendMessage(input: { conversationId?: string; message: string; signal?: AbortSignal }): Promise<CopilotConversation> {
  const text = input.message.trim().slice(0, MAX_MESSAGE);
  if (!text) throw new Error('Type a question first.');

  const now = Date.now();
  const existing = input.conversationId ? await store.get(input.conversationId) : null;
  const conversation: CopilotConversation = existing ?? {
    id: randomUUID(),
    title: titleFrom(text),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const userMessage: CopilotMessage = { role: 'user', content: text, createdAt: now };
  const history = [...conversation.messages, userMessage];

  const result = await complete('research', {
    system: systemPrompt(),
    grounded: true,
    temperature: 0.4,
    signal: input.signal,
    prompt: [
      'The conversation so far:',
      '',
      transcript(history),
      '',
      'Reply to the last USER message. Do not repeat earlier answers unless asked.',
    ].join('\n'),
  });

  const reply: CopilotMessage = {
    role: 'assistant',
    content: sanitizeDraft(result.text.trim()).text,
    sources: dedupeSources(result.sources).slice(0, 8),
    createdAt: Date.now(),
  };

  const saved: CopilotConversation = {
    ...conversation,
    messages: [...history, reply],
    updatedAt: reply.createdAt,
  };
  return store.put(saved);
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = s.domain || s.title || s.uri;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function listConversations(limit = 40): Promise<CopilotConversation[]> {
  return store.list('updatedAt', limit);
}

export async function getConversation(id: string): Promise<CopilotConversation | null> {
  return store.get(id);
}

export async function deleteConversation(id: string): Promise<void> {
  await store.remove(id);
}
