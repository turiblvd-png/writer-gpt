/**
 * Gemini model discovery.
 *
 * Model IDs are retired on a schedule of roughly a year. A hardcoded ID that
 * Google has withdrawn makes every call return 404 NOT_FOUND, which presents as
 * "the tool does nothing". So the configured ID is treated as a preference, and
 * when it is unavailable the best live model of the same tier is used instead.
 */

export type ModelTier = 'pro' | 'flash';

interface ParsedModel {
  id: string;
  version: number;
  tier: ModelTier | 'lite' | 'other';
  preview: boolean;
}

/** "gemini-2.5-flash" → { version: 2.5, tier: 'flash' }. Anything unparseable sorts last. */
export function parseModelId(id: string): ParsedModel {
  const clean = id.replace(/^models\//, '');
  const m = /^gemini-(\d+(?:\.\d+)?)-(pro|flash)(-lite)?(?:-([\w.-]+))?$/.exec(clean);
  if (!m) return { id: clean, version: 0, tier: 'other', preview: true };

  const suffix = m[4] ?? '';
  return {
    id: clean,
    version: Number(m[1]),
    tier: m[3] ? 'lite' : (m[2] as ModelTier),
    // Dated snapshots and "-latest" aliases are fine; experiments and previews
    // can change behaviour without notice, so they are only a last resort.
    preview: /preview|exp|experimental/i.test(suffix),
  };
}

/**
 * Pick the best available model for a tier: newest stable version first, then
 * newest preview, then any model of the other main tier. Returns null when the
 * list holds nothing usable.
 */
export function pickModel(available: string[], tier: ModelTier): string | null {
  const parsed = available.map(parseModelId).filter((m) => m.tier === 'pro' || m.tier === 'flash');

  const rank = (list: ParsedModel[]) =>
    [...list].sort((a, b) =>
      Number(a.preview) - Number(b.preview) ||
      b.version - a.version ||
      // Prefer the plain alias ("gemini-2.5-flash") over a dated snapshot.
      a.id.length - b.id.length,
    );

  const sameTier = rank(parsed.filter((m) => m.tier === tier));
  if (sameTier[0]) return sameTier[0].id;

  const otherTier = rank(parsed.filter((m) => m.tier !== tier));
  return otherTier[0]?.id ?? null;
}

export function tierOf(modelId: string): ModelTier {
  return /-pro\b/.test(modelId) ? 'pro' : 'flash';
}
