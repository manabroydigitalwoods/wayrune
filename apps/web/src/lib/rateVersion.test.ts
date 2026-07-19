import { describe, expect, it } from 'vitest';
import {
  formatRateVersionHistoryLine,
  formatRateVersionTipDiffCue,
  rateVersionLabel,
} from './rateVersion';

describe('rateVersion', () => {
  it('labels versions', () => {
    expect(rateVersionLabel(3)).toBe('v3');
  });

  it('formats transfer history line', () => {
    expect(
      formatRateVersionHistoryLine(
        {
          id: '1',
          versionNumber: 2,
          supersedesId: '0',
          isActive: true,
          unitCost: 4500,
          pricingMode: 'per_vehicle',
        },
        { kind: 'transfer' },
      ),
    ).toMatch(/^v2 · per_vehicle/);
  });

  it('formats tip diff cue', () => {
    expect(
      formatRateVersionTipDiffCue({ summary: 'weekday cost · meal plan' }),
    ).toBe('weekday cost · meal plan');
    expect(formatRateVersionTipDiffCue({ summary: null })).toBeNull();
  });
});
