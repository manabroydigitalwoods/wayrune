import { describe, expect, it } from 'vitest';
import { diffHotelRateTips } from './hotel-rate-diff';

describe('diffHotelRateTips', () => {
  it('returns null summary when identical', () => {
    const tip = {
      unitCost: 5000,
      weekendUnitCost: 5500,
      mealPlan: 'MAP',
      roomType: 'Deluxe',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      occupancyPricingJson: { baseAdults: 2 },
    };
    expect(diffHotelRateTips(tip, tip).summary).toBeNull();
  });

  it('lists commercial changes vs active', () => {
    const prior = {
      unitCost: 5000,
      weekendUnitCost: null,
      mealPlan: 'CP',
      roomType: 'Deluxe',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    };
    const active = {
      unitCost: 5200,
      weekendUnitCost: 5600,
      mealPlan: 'MAP',
      roomType: 'Deluxe',
      startDate: '2026-04-01',
      endDate: '2026-09-30',
    };
    const diff = diffHotelRateTips(prior, active);
    expect(diff.changes).toEqual(
      expect.arrayContaining(['weekday cost', 'weekend cost', 'meal plan', 'dates']),
    );
    expect(diff.summary).toBeTruthy();
  });
});
