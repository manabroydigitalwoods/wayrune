import { describe, expect, it } from 'vitest';
import {
  cloneHotelRateFormForMealPlan,
  nextMealPlanForClone,
  scaleCostForMealPlan,
} from './hotelRateMealClone';

describe('hotelRateMealClone', () => {
  it('cycles meal plans and scales costs MAP→CP', () => {
    expect(nextMealPlanForClone('MAP')).toBe('AP');
    expect(nextMealPlanForClone('AP')).toBe('EP');
    expect(scaleCostForMealPlan(4500, 'MAP', 'CP')).toBe(4050);
    expect(scaleCostForMealPlan(4500, 'MAP', 'AP')).toBe(5400);
  });

  it('clones season window and nudges bands for sister meal', () => {
    const form = cloneHotelRateFormForMealPlan(
      {
        mealPlan: 'MAP',
        unitCost: 4500,
        weekendUnitCost: 5200,
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        roomType: 'Deluxe mountain view',
        occupancyPricingJson: {
          baseAdults: 2,
          extraAdultPerNight: 1500,
          adultBands: [
            {
              adults: 1,
              unitCostPerNight: 3600,
              weekendUnitCostPerNight: 4100,
            },
            {
              adults: 2,
              unitCostPerNight: 4500,
              weekendUnitCostPerNight: 5200,
            },
            {
              adults: 3,
              unitCostPerNight: 5800,
              weekendUnitCostPerNight: 6700,
            },
          ],
        },
      },
      { mealPlan: 'CP' },
    );
    expect(form.mealPlan).toBe('CP');
    expect(form.startDate).toBe('2026-04-01');
    expect(form.endDate).toBe('2026-06-30');
    expect(form.unitCost).toBe('4050');
    expect(form.weekendUnitCost).toBe('4680');
    expect(form.extraAdultPerNight).toBe('1350');
    expect(form.adultBandRows?.map((r) => r.unitCost)).toEqual([
      '3240',
      '4050',
      '5220',
    ]);
    expect(form.adultBandRows?.map((r) => r.weekendUnitCost)).toEqual([
      '3690',
      '4680',
      '6030',
    ]);
  });
});
