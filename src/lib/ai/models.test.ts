import { describe, expect, it } from 'vitest';
import { parseModelId, pickModel, tierOf } from './models';

describe('pickModel', () => {
  const live = [
    'models/gemini-2.0-flash', 'models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite',
    'models/gemini-2.5-pro', 'models/gemini-3-pro-preview', 'models/embedding-001',
  ];

  it('prefers the newest stable model of the requested tier', () => {
    expect(pickModel(live, 'flash')).toBe('gemini-2.5-flash');
    // A newer preview exists, but stable wins.
    expect(pickModel(live, 'pro')).toBe('gemini-2.5-pro');
  });

  it('never picks a lite model when a full one exists', () => {
    expect(pickModel(['models/gemini-2.5-flash-lite', 'models/gemini-2.5-flash'], 'flash')).toBe('gemini-2.5-flash');
  });

  it('moves to a newer generation once the old one is retired', () => {
    // The failure this guards: 2.5 withdrawn, configured ID now 404s.
    expect(pickModel(['models/gemini-3-flash', 'models/gemini-3-pro'], 'flash')).toBe('gemini-3-flash');
  });

  it('falls back to a preview only when nothing stable exists', () => {
    expect(pickModel(['models/gemini-3-pro-preview'], 'pro')).toBe('gemini-3-pro-preview');
  });

  it('crosses tiers rather than returning nothing', () => {
    expect(pickModel(['models/gemini-2.5-flash'], 'pro')).toBe('gemini-2.5-flash');
  });

  it('prefers the plain alias over a dated snapshot of the same version', () => {
    expect(pickModel(['models/gemini-2.5-flash-001', 'models/gemini-2.5-flash'], 'flash')).toBe('gemini-2.5-flash');
  });

  it('returns null when nothing usable is listed', () => {
    expect(pickModel(['models/embedding-001', 'models/imagen-3'], 'flash')).toBeNull();
  });
});

describe('parseModelId / tierOf', () => {
  it('parses versions and tiers', () => {
    expect(parseModelId('models/gemini-2.5-pro')).toMatchObject({ id: 'gemini-2.5-pro', version: 2.5, tier: 'pro', preview: false });
    expect(parseModelId('gemini-3-flash-preview')).toMatchObject({ version: 3, tier: 'flash', preview: true });
    expect(parseModelId('gemini-2.5-flash-lite').tier).toBe('lite');
  });

  it('classifies a configured ID by tier', () => {
    expect(tierOf('gemini-2.5-pro')).toBe('pro');
    expect(tierOf('gemini-2.5-flash')).toBe('flash');
  });
});
