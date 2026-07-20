import { describe, expect, it } from 'vitest';
import {
  markupDetailsFromPreset,
  markupPresetSummary,
  normalizeMarkupPresets,
  sellFromMarkupPreset,
} from './markup-presets';

describe('markup-presets', () => {
  it('normalizes valid preset arrays', () => {
    expect(
      normalizeMarkupPresets([
        { id: 'a', label: 'Retail', mode: 'percent', value: 20 },
      ]),
    ).toHaveLength(1);
    expect(normalizeMarkupPresets([{ bad: true }])).toEqual([]);
  });

  it('computes percent and fixed sell', () => {
    expect(
      sellFromMarkupPreset(1000, { mode: 'percent', value: 20 }),
    ).toBe(1200);
    expect(
      sellFromMarkupPreset(1000, { mode: 'fixed', value: 250 }),
    ).toBe(1250);
  });

  it('summarizes presets for UI', () => {
    expect(
      markupPresetSummary({ label: 'Agent', mode: 'percent', value: 12 }),
    ).toBe('Agent (12%)');
    expect(
      markupPresetSummary({ label: 'Premium', mode: 'fixed', value: 500 }),
    ).toBe('Premium (+₹500)');
  });

  it('stamps preset fields onto quote line details', () => {
    expect(
      markupDetailsFromPreset({
        id: 'retail',
        label: 'Retail',
        mode: 'percent',
        value: 18,
      }),
    ).toEqual({
      markupMode: 'percent',
      markupValue: 18,
      markupPresetId: 'retail',
      markupPresetLabel: 'Retail',
      sellManual: false,
    });
  });
});
