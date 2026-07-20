import { describe, expect, it } from 'vitest';
import {
  buildHotelRateTipDiffRows,
  formatHotelOccupancyDiffValue,
  showHotelRateTipDiffExpand,
} from './hotelRateVersion';

describe('hotelRateVersion tip Diff', () => {
  const prior = {
    unitCost: 8000,
    weekendUnitCost: 9000,
    mealPlan: 'MAP',
    roomType: 'Deluxe',
    startDate: '2026-04-01',
    endDate: '2026-06-30',
    occupancyPricingJson: { nationality: 'IN', adultBands: [{ adults: 2 }] },
  };
  const active = {
    unitCost: 8500,
    weekendUnitCost: null,
    mealPlan: 'CP',
    roomType: 'Deluxe',
    startDate: '2026-04-01',
    endDate: '2026-09-30',
    occupancyPricingJson: { nationality: 'INTL', adultBands: [{ adults: 2 }, { adults: 3 }] },
  };

  it('builds changed-only side-by-side rows', () => {
    const rows = buildHotelRateTipDiffRows(prior, active, [
      'weekday cost',
      'weekend cost',
      'meal plan',
      'dates',
      'occupancy',
    ]);
    expect(rows.map((r) => r.field)).toEqual([
      'Weekday cost',
      'Weekend cost',
      'Meal plan',
      'Dates',
      'Occupancy',
    ]);
    expect(rows[0]?.thisTip).toMatch(/8,?000/);
    expect(rows[0]?.current).toMatch(/8,?500/);
    expect(rows[0]?.restoreField).toBe('unitCost');
    expect(rows[1]?.thisTip).toMatch(/9,?000/);
    expect(rows[1]?.current).toBe('—');
    expect(rows[1]?.restoreField).toBe('weekendUnitCost');
    expect(rows[2]).toMatchObject({ thisTip: 'MAP', current: 'CP', restoreField: 'mealPlan' });
    expect(rows[3]?.thisTip).toBe('2026-04-01 → 2026-06-30');
    expect(rows[3]?.current).toBe('2026-04-01 → 2026-09-30');
    expect(rows[3]?.restoreField).toBe('dates');
    expect(rows[4]?.thisTip).toMatch(/IN/);
    expect(rows[4]?.current).toMatch(/INTL/);
    expect(rows[4]?.current).toMatch(/2 bands/);
    expect(rows[4]?.restoreField).toBe('occupancyPricingJson');
  });

  it('returns empty when no changes or no active tip', () => {
    expect(buildHotelRateTipDiffRows(prior, active, [])).toEqual([]);
    expect(buildHotelRateTipDiffRows(prior, null, ['weekday cost'])).toEqual([]);
  });

  it('formats occupancy compactly', () => {
    expect(formatHotelOccupancyDiffValue(null)).toBe('—');
    expect(formatHotelOccupancyDiffValue({ nationality: 'us' })).toBe('US');
    expect(formatHotelOccupancyDiffValue({})).toBe('set');
  });

  it('offers Diff expand only for superseded tips with summary', () => {
    expect(
      showHotelRateTipDiffExpand({
        isActive: true,
        diffVsActive: { summary: 'weekday cost' },
      }),
    ).toBe(false);
    expect(
      showHotelRateTipDiffExpand({
        isActive: false,
        diffVsActive: { summary: null },
      }),
    ).toBe(false);
    expect(
      showHotelRateTipDiffExpand({
        isActive: false,
        diffVsActive: { summary: 'weekday cost · meal plan' },
      }),
    ).toBe(true);
  });
});
