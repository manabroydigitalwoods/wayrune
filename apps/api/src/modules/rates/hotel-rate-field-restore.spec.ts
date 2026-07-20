import { describe, expect, it } from 'vitest';
import {
  hotelRateDiffChangeToRestorableField,
  isHotelRateRestorableField,
  mergeHotelRateFieldFromPrior,
} from './hotel-rate-field-restore';

describe('hotel-rate-field-restore', () => {
  const active = {
    unitCost: 5000,
    weekendUnitCost: 5500,
    mealPlan: 'MAP',
    startDate: '2026-04-01',
    endDate: '2026-09-30',
  };
  const prior = {
    unitCost: 4500,
    weekendUnitCost: 4800,
    mealPlan: 'CP',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
  };

  it('maps diff labels to restorable fields', () => {
    expect(hotelRateDiffChangeToRestorableField('weekday cost')).toBe(
      'unitCost',
    );
    expect(hotelRateDiffChangeToRestorableField('weekend cost')).toBe(
      'weekendUnitCost',
    );
    expect(hotelRateDiffChangeToRestorableField('meal plan')).toBe('mealPlan');
    expect(hotelRateDiffChangeToRestorableField('dates')).toBe('dates');
    expect(hotelRateDiffChangeToRestorableField('occupancy')).toBeNull();
    expect(hotelRateDiffChangeToRestorableField('room type')).toBeNull();
  });

  it('merges one field from prior onto active', () => {
    expect(
      mergeHotelRateFieldFromPrior(active, prior, 'unitCost').unitCost,
    ).toBe(4500);
    expect(
      mergeHotelRateFieldFromPrior(active, prior, 'unitCost').mealPlan,
    ).toBe('MAP');
    expect(
      mergeHotelRateFieldFromPrior(active, prior, 'mealPlan').mealPlan,
    ).toBe('CP');
    const dates = mergeHotelRateFieldFromPrior(active, prior, 'dates');
    expect(dates.startDate).toBe('2026-01-01');
    expect(dates.endDate).toBe('2026-03-31');
    expect(dates.unitCost).toBe(5000);
  });

  it('validates restorable field keys', () => {
    expect(isHotelRateRestorableField('unitCost')).toBe(true);
    expect(isHotelRateRestorableField('occupancyPricingJson')).toBe(false);
  });
});
