import { describe, expect, it } from 'vitest';
import {
  activityRateDiffChangeToRestorableField,
  mergeActivityRateFieldFromPrior,
  mergeTransferFareFieldFromPrior,
  transferFareDiffChangeToRestorableField,
} from './transfer-activity-rate-field-restore';

describe('transfer-activity-rate-field-restore', () => {
  it('maps transfer diff labels', () => {
    expect(transferFareDiffChangeToRestorableField('adult cost')).toBe(
      'unitCost',
    );
    expect(transferFareDiffChangeToRestorableField('pricing mode')).toBe(
      'pricingMode',
    );
    expect(transferFareDiffChangeToRestorableField('dates')).toBe('dates');
  });

  it('maps activity diff labels', () => {
    expect(activityRateDiffChangeToRestorableField('adult cost')).toBe(
      'adultUnitCost',
    );
    expect(activityRateDiffChangeToRestorableField('private/SIC')).toBe(
      'privateOrSic',
    );
    expect(activityRateDiffChangeToRestorableField('activity name')).toBe(
      'activityName',
    );
  });

  it('merges one transfer field from prior', () => {
    const active = {
      unitCost: 5000,
      childUnitCost: 2500,
      infantUnitCost: null as number | null,
      pricingMode: 'per_vehicle',
      startDate: '2026-04-01',
      endDate: '2026-09-30',
    };
    const prior = {
      unitCost: 4500,
      childUnitCost: 2000,
      infantUnitCost: 500,
      pricingMode: 'per_seat',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    };
    expect(
      mergeTransferFareFieldFromPrior(active, prior, 'unitCost').unitCost,
    ).toBe(4500);
    expect(
      mergeTransferFareFieldFromPrior(active, prior, 'unitCost').pricingMode,
    ).toBe('per_vehicle');
    const dates = mergeTransferFareFieldFromPrior(active, prior, 'dates');
    expect(dates.startDate).toBe('2026-01-01');
    expect(dates.endDate).toBe('2026-03-31');
  });

  it('merges one activity field from prior', () => {
    const active = {
      adultUnitCost: 2000,
      childUnitCost: 1000,
      privateOrSic: 'sic',
      activityName: 'Rafting',
      startDate: '2026-04-01',
      endDate: '2026-09-30',
    };
    const prior = {
      adultUnitCost: 1800,
      childUnitCost: 900,
      privateOrSic: 'private',
      activityName: 'River rafting',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    };
    expect(
      mergeActivityRateFieldFromPrior(active, prior, 'activityName')
        .activityName,
    ).toBe('River rafting');
    expect(
      mergeActivityRateFieldFromPrior(active, prior, 'activityName')
        .adultUnitCost,
    ).toBe(2000);
  });
});
