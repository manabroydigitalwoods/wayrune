import { describe, expect, it } from 'vitest';
import {
  parseContractCancellationPolicy,
  previewCancellationCharge,
  summarizeCancellationForMatch,
} from './cancellation-policy';

const heritagePolicy = {
  text: 'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours.',
  rules: [
    { beforeHours: 168, chargeType: 'PERCENTAGE' as const, chargeValue: 0 },
    { beforeHours: 72, chargeType: 'PERCENTAGE' as const, chargeValue: 50 },
    { beforeHours: 24, chargeType: 'PERCENTAGE' as const, chargeValue: 100 },
  ],
  noShowChargePercentage: 100,
};

describe('cancellation-policy', () => {
  it('parses structured contract policy', () => {
    const p = parseContractCancellationPolicy(heritagePolicy);
    expect(p?.rules).toHaveLength(3);
    expect(p?.noShowChargePercentage).toBe(100);
  });

  it('summarizes free-cancel + tiers for Match explain', () => {
    const s = summarizeCancellationForMatch(heritagePolicy);
    expect(s?.accepted[0]).toMatch(/Free cancel until 7d/);
    expect(s?.snapshot.freeCancelBeforeHours).toBe(168);
    expect(s?.humanText).toContain('7 days');
  });

  it('evaluates charge inside a window', () => {
    const checkIn = new Date('2026-12-24T14:00:00.000Z');
    const asOf = new Date('2026-12-22T14:00:00.000Z'); // 48h before
    const result = previewCancellationCharge({
      policy: heritagePolicy,
      baseAmount: 10000,
      serviceStartAt: checkIn,
      asOf,
      nightCount: 2,
    });
    expect(result.customerCharge).toBe(5000);
    expect(result.applicableRule?.chargeValue).toBe(50);
  });
});
