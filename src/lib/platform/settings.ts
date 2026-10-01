import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import type { ProviderId } from '@/lib/ai/types';

/**
 * Settings the developer edits from the dashboard: which AI provider and model
 * runs each task, API keys, the fallback order, sign-ups and the menu layout.
 *
 * Dashboard values win over environment variables, so the site can be
 * reconfigured without a redeploy. API keys are encrypted (AES-256-GCM) with a
 * key derived from AUTH_SECRET or APP_PASSWORD before they are stored, and are
 * never sent back to the browser.
 */

export type ModelRole = 'research' | 'reason' | 'draft' | 'structure' | 'verify';
export const ROLES: ModelRole[] = ['research', 'reason', 'draft', 'structure', 'verify'];
export const PROVIDERS: ProviderId[] = ['gemini', 'deepseek', 'grok'];

export interface RoleChoice {
  provider: ProviderId;
  model: string;
}

export interface AiSettings {
  /** Encrypted keys, by provider. */
  keys: Partial<Record<ProviderId, string>>;
  roles: Partial<Record<ModelRole, RoleChoice>>;
  /** Tried in this order when a task's own provider fails. */
  fallbackOrder: ProviderId[];
  /**
   * Research and fact checks need live Google Search, which only Gemini
   * provides here. When true, they may run on another provider without search
   * if Gemini fails, rather than stopping the job.
   */
  allowUngrounded: boolean;
}

export interface NavSettings {
  /** Item hrefs per section id, in display order. */
  order: Record<string, string[]>;
  /** Hrefs hidden from subscribers. */
  hidden: string[];
}

export interface PlatformSettings {
  signupsOpen: boolean;
  nav: NavSettings;
}

interface SettingsDoc {
  id: string;
  value: unknown;
  updatedAt: number;
}

const store = collection<SettingsDoc>('settings', { global: true });

export const DEFAULT_AI: AiSettings = { keys: {}, roles: {}, fallbackOrder: ['gemini', 'deepseek', 'grok'], allowUngrounded: false };
export const DEFAULT_PLATFORM: PlatformSettings = { signupsOpen: true, nav: { order: {}, hidden: [] } };

const TTL = 15_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function read<T>(id: string, fallback: T): Promise<T> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  let value = fallback;
  try {
    const doc = await store.get(id);
    if (doc?.value && typeof doc.value === 'object') value = { ...fallback, ...(doc.value as object) } as T;
  } catch {
    // Settings must never take the site down; defaults are always usable.
  }
  cache.set(id, { at: Date.now(), value });
  return value;
}

async function write<T>(id: string, value: T): Promise<T> {
  await store.put({ id, value, updatedAt: Date.now() });
  cache.set(id, { at: Date.now(), value });
  return value;
}

export function clearSettingsCache(): void {
  cache.clear();
}

// ── Encryption of stored keys ───────────────────────────────────────────────

function cryptoKey(): Buffer | null {
  const secret = process.env.AUTH_SECRET || process.env.APP_PASSWORD;
  return secret ? createHash('sha256').update(`writer-gpt-keys:${secret}`).digest() : null;
}

export function encryptSecret(plain: string): string {
  const key = cryptoKey();
  if (!key) throw new Error('Set APP_PASSWORD (or AUTH_SECRET) before saving API keys in the dashboard.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

/** Null when missing, or when the site secret changed and the key can no longer be read. */
export function decryptSecret(stored: string | undefined): string | null {
  const key = cryptoKey();
  if (!stored || !key) return null;
  const [v, iv, tag, data] = stored.split(':');
  if (v !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// ── AI settings ─────────────────────────────────────────────────────────────

export async function getAiSettings(): Promise<AiSettings> {
  const s = await read<AiSettings>('ai', DEFAULT_AI);
  const order = s.fallbackOrder.filter((p) => PROVIDERS.includes(p));
  return { ...s, fallbackOrder: [...order, ...PROVIDERS.filter((p) => !order.includes(p))] };
}

const ENV_KEYS: Record<ProviderId, string> = { gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', grok: 'XAI_API_KEY' };

export interface KeySource {
  present: boolean;
  source: 'dashboard' | 'env' | 'none';
  /** Last four characters, so the developer can tell keys apart. */
  hint: string;
}

/** The key to use for a provider: dashboard first, then environment. */
export async function apiKeyFor(provider: ProviderId): Promise<{ key: string | null; source: KeySource['source'] }> {
  const s = await getAiSettings();
  const saved = decryptSecret(s.keys[provider]);
  if (saved) return { key: saved, source: 'dashboard' };
  const env = process.env[ENV_KEYS[provider]];
  return env ? { key: env, source: 'env' } : { key: null, source: 'none' };
}

export async function keySources(): Promise<Record<ProviderId, KeySource>> {
  const out = {} as Record<ProviderId, KeySource>;
  for (const p of PROVIDERS) {
    const { key, source } = await apiKeyFor(p);
    out[p] = { present: Boolean(key), source, hint: key ? `…${key.slice(-4)}` : '' };
  }
  return out;
}

export interface AiSettingsPatch {
  /** A new key to store, '' to delete the stored one, undefined to keep it. */
  keys?: Partial<Record<ProviderId, string>>;
  roles?: Partial<Record<ModelRole, RoleChoice | null>>;
  fallbackOrder?: ProviderId[];
  allowUngrounded?: boolean;
}

export async function updateAiSettings(patch: AiSettingsPatch): Promise<AiSettings> {
  const current = await getAiSettings();
  const keys = { ...current.keys };
  for (const p of PROVIDERS) {
    const v = patch.keys?.[p];
    if (v === undefined) continue;
    if (v.trim() === '') delete keys[p];
    else keys[p] = encryptSecret(v.trim());
  }
  const roles = { ...current.roles };
  for (const r of ROLES) {
    if (!patch.roles || !(r in patch.roles)) continue;
    const choice = patch.roles[r];
    if (!choice) delete roles[r];
    else if (PROVIDERS.includes(choice.provider) && choice.model.trim()) roles[r] = { provider: choice.provider, model: choice.model.trim().slice(0, 100) };
  }
  const fallbackOrder = patch.fallbackOrder
    ? [...new Set(patch.fallbackOrder.filter((p) => PROVIDERS.includes(p)))]
    : current.fallbackOrder;
  return write<AiSettings>('ai', {
    keys,
    roles,
    fallbackOrder,
    allowUngrounded: patch.allowUngrounded ?? current.allowUngrounded,
  });
}

// ── Platform settings ───────────────────────────────────────────────────────

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const s = await read<PlatformSettings>('platform', DEFAULT_PLATFORM);
  return { ...DEFAULT_PLATFORM, ...s, nav: { ...DEFAULT_PLATFORM.nav, ...s.nav } };
}

export async function updatePlatformSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const nav = patch.nav
    ? {
        order: Object.fromEntries(
          Object.entries(patch.nav.order ?? {}).map(([k, v]) => [k, (Array.isArray(v) ? v : []).filter((h) => typeof h === 'string').slice(0, 50)]),
        ),
        hidden: (patch.nav.hidden ?? []).filter((h) => typeof h === 'string').slice(0, 100),
      }
    : current.nav;
  return write<PlatformSettings>('platform', {
    signupsOpen: patch.signupsOpen ?? current.signupsOpen,
    nav,
  });
}
