import { describe, expect, it } from 'vitest';
import {
  hotelRateTipPendingActivation,
  hotelRateVersionRequiresPendingActivation,
  rateTipPendingActivation,
  rateTipVersionRequiresPendingActivation,
} from './hotel-rate-pending';

describe('hotel-rate-pending', () => {
  it('requires pending when actor cannot activate', () => {
    expect(hotelRateVersionRequiresPendingActivation(false)).toBe(true);
    expect(hotelRateVersionRequiresPendingActivation(true)).toBe(false);
    expect(rateTipVersionRequiresPendingActivation(false)).toBe(true);
  });

  it('flags newest inactive tip as pending', () => {
    expect(
      hotelRateTipPendingActivation({
        isActive: false,
        isNewestInFamily: true,
      }),
    ).toBe(true);
    expect(
      rateTipPendingActivation({
        isActive: false,
        isNewestInFamily: true,
      }),
    ).toBe(true);
    expect(
      hotelRateTipPendingActivation({
        isActive: true,
        isNewestInFamily: true,
      }),
    ).toBe(false);
    expect(
      hotelRateTipPendingActivation({
        isActive: false,
        isNewestInFamily: false,
      }),
    ).toBe(false);
  });
});
