import { describe, expect, it } from 'vitest';
import { applyStylePreset, listStylePresets } from './presence-style-presets';

describe('presence style presets', () => {
  it('lists horizon and atelier presets', () => {
    expect(listStylePresets('horizon')).toEqual(['ocean', 'sunset', 'forest', 'urban']);
    expect(listStylePresets('atelier')).toEqual(['ivory', 'ink', 'champagne', 'slate']);
  });

  it('applies sunset deltas over horizon base tokens', () => {
    const next = applyStylePreset(
      'horizon',
      { primary: '#0f766e', background: '#f4faf9', radius: '14px' },
      'sunset',
    );
    expect(next.primary).toBe('#c2410c');
    expect(next.background).toBe('#fff7ed');
    expect(next.radius).toBe('14px');
  });

  it('no-ops for unknown preset or family', () => {
    const base = { primary: '#111' };
    expect(applyStylePreset('horizon', base, 'nope')).toEqual(base);
    expect(applyStylePreset('altitude', base, 'trail')).toEqual(base);
  });
});
