import { describe, expect, it } from 'vitest';
import {
  formatHotelRateVersionHistoryLine,
  hotelRateVersionLabel,
} from './hotelRateVersion';

describe('hotelRateVersion', () => {
  it('labels versions', () => {
    expect(hotelRateVersionLabel(3)).toBe('v3');
    expect(hotelRateVersionLabel(null)).toBe('v1');
  });

  it('formats history lines', () => {
    expect(
      formatHotelRateVersionHistoryLine({
        id: 'r1',
        versionNumber: 2,
        supersedesId: 'r0',
        isActive: true,
        unitCost: 4500,
        mealPlan: 'MAP',
      }),
    ).toBe('v2 · MAP · ₹4,500 · active');
  });
});
