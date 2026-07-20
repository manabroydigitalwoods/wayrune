import { describe, expect, it } from 'vitest';
import { markupDetailsFromPreset, markupPresetSummary } from './markupPresets';

describe('markupPresets web re-export', () => {
  it('stamps line details from an org preset', () => {
    expect(
      markupDetailsFromPreset({
        id: 'b2b',
        label: 'B2B',
        mode: 'fixed',
        value: 400,
      }),
    ).toMatchObject({
      markupMode: 'fixed',
      markupValue: 400,
      markupPresetId: 'b2b',
      sellManual: false,
    });
    expect(
      markupPresetSummary({ label: 'B2B', mode: 'fixed', value: 400 }),
    ).toBe('B2B (+₹400)');
  });
});
