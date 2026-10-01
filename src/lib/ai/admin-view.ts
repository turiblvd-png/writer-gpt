import { getAiSettings, keySources, ROLES, type ModelRole } from '@/lib/platform/settings';
import { DEFAULT_MODELS, resolveBinding, type BindingSource } from './index';
import type { ProviderId } from './types';

export interface AiAdminView {
  keys: Awaited<ReturnType<typeof keySources>>;
  roles: Record<ModelRole, { provider: ProviderId; model: string; source: BindingSource }>;
  fallbackOrder: ProviderId[];
  allowUngrounded: boolean;
  defaults: typeof DEFAULT_MODELS;
}

/** Everything the AI Models page shows. Never includes a key itself. */
export async function aiAdminView(): Promise<AiAdminView> {
  const settings = await getAiSettings();
  const roles = {} as AiAdminView['roles'];
  for (const r of ROLES) {
    try {
      roles[r] = await resolveBinding(r);
    } catch {
      roles[r] = { provider: 'gemini', model: DEFAULT_MODELS.gemini[r], source: 'default' };
    }
  }
  return {
    keys: await keySources(),
    roles,
    fallbackOrder: settings.fallbackOrder,
    allowUngrounded: settings.allowUngrounded,
    defaults: DEFAULT_MODELS,
  };
}
