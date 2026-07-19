import { describe, expect, it } from 'vitest';
import {
  hotelRateVersionLabel,
  orderHotelRateVersionChain,
  planHotelRateNewVersion,
} from './hotel-rate-version';

describe('hotel-rate-version', () => {
  it('plans next tip', () => {
    expect(planHotelRateNewVersion({ id: 'r1', versionNumber: 1 })).toEqual({
      versionNumber: 2,
      supersedesId: 'r1',
      previousVersionNumber: 1,
    });
  });

  it('orders chain oldest → newest', () => {
    const v1 = {
      id: 'a',
      versionNumber: 1,
      supersedesId: null,
      isActive: false,
    };
    const v2 = {
      id: 'b',
      versionNumber: 2,
      supersedesId: 'a',
      isActive: false,
    };
    const v3 = {
      id: 'c',
      versionNumber: 3,
      supersedesId: 'b',
      isActive: true,
    };
    const byId = new Map([
      ['a', v1],
      ['b', v2],
      ['c', v3],
    ]);
    expect(orderHotelRateVersionChain(v3, byId).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('labels versions', () => {
    expect(hotelRateVersionLabel(2)).toBe('v2');
  });
});
