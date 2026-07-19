import { describe, expect, it } from 'vitest';
import { diffActivityRateTips, diffTransferFareTips } from './transfer-activity-rate-diff';

describe('diffTransferFareTips', () => {
  it('returns null summary when identical', () => {
    const tip = {
      unitCost: 2500,
      childUnitCost: 1500,
      infantUnitCost: 0,
      pricingMode: 'PER_VEHICLE',
      startDate: '2026-04-01',
      endDate: '2026-10-31',
    };
    expect(diffTransferFareTips(tip, tip).summary).toBeNull();
  });

  it('lists commercial changes vs active', () => {
    const prior = {
      unitCost: 2500,
      childUnitCost: 1500,
      infantUnitCost: 0,
      pricingMode: 'PER_VEHICLE',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    };
    const active = {
      unitCost: 2800,
      childUnitCost: 1600,
      infantUnitCost: 0,
      pricingMode: 'PER_SEAT',
      startDate: '2026-04-01',
      endDate: '2026-10-31',
    };
    const diff = diffTransferFareTips(prior, active);
    expect(diff.changes).toEqual(
      expect.arrayContaining(['adult cost', 'child cost', 'pricing mode', 'dates']),
    );
    expect(diff.summary).toBeTruthy();
  });
});

describe('diffActivityRateTips', () => {
  it('returns null summary when identical', () => {
    const tip = {
      unitCost: 1200,
      childUnitCost: 800,
      privateOrSic: 'SIC',
      activityName: 'Shikara',
      startDate: '2026-04-01',
      endDate: '2026-10-31',
    };
    expect(diffActivityRateTips(tip, tip).summary).toBeNull();
  });

  it('lists commercial changes vs active', () => {
    const prior = {
      adultUnitCost: 1200,
      childUnitCost: 800,
      privateOrSic: 'SIC',
      activityName: 'Shikara',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    };
    const active = {
      adultUnitCost: 1400,
      childUnitCost: 900,
      privateOrSic: 'PRIVATE',
      activityName: 'Shikara ride',
      startDate: '2026-04-01',
      endDate: '2026-10-31',
    };
    const diff = diffActivityRateTips(prior, active);
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        'adult cost',
        'child cost',
        'private/SIC',
        'activity name',
        'dates',
      ]),
    );
    expect(diff.summary).toBeTruthy();
  });
});
