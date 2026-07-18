import { describe, expect, it } from 'vitest';
import {
  applyRateResolveHit,
  rateMatchFingerprint,
  shouldAutoRematchRate,
} from './quoteServiceDetails';

describe('shouldAutoRematchRate', () => {
  it('rematches when hotel stay keys are complete and stale', () => {
    expect(
      shouldAutoRematchRate({
        open: true,
        rateMatchStale: true,
        serviceType: 'hotel',
        details: {
          checkIn: '2026-12-01',
          checkOut: '2026-12-03',
          placeId: 'p1',
          roomType: 'Deluxe',
          mealPlan: 'MAP',
        },
      }),
    ).toBe(true);
  });

  it('skips while matching or keep-manual confirmed', () => {
    const base = {
      open: true,
      rateMatchStale: true,
      serviceType: 'hotel' as const,
      details: {
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
      },
    };
    expect(shouldAutoRematchRate({ ...base, matching: true })).toBe(false);
    expect(shouldAutoRematchRate({ ...base, keepManualConfirmed: true })).toBe(false);
    expect(shouldAutoRematchRate({ ...base, readOnly: true })).toBe(false);
  });

  it('skips when match prerequisites are missing', () => {
    expect(
      shouldAutoRematchRate({
        open: true,
        rateMatchStale: true,
        serviceType: 'hotel',
        details: { checkIn: '2026-12-01' },
      }),
    ).toBe(false);
  });
});

describe('rateMatchFingerprint', () => {
  it('changes when check-out (nights) changes', () => {
    const a = rateMatchFingerprint('hotel', {
      placeId: 'p1',
      checkIn: '2026-12-01',
      checkOut: '2026-12-03',
      roomType: 'Deluxe',
    });
    const b = rateMatchFingerprint('hotel', {
      placeId: 'p1',
      checkIn: '2026-12-01',
      checkOut: '2026-12-04',
      roomType: 'Deluxe',
    });
    expect(a).not.toBe(b);
  });
});

describe('applyRateResolveHit', () => {
  it('sets matched pricing and quantity from hotel nights × rooms', () => {
    const applied = applyRateResolveHit({
      serviceType: 'hotel',
      details: {
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
        rooms: 2,
        rateBasis: 'per_room_night',
        markupMode: 'percent',
        markupValue: 20,
      },
      hit: {
        matched: true,
        rateKind: 'hotel',
        rateId: 'rate-1',
        unitCost: 1000,
        unitSell: 1200,
        quantity: 2,
        taxPercent: 5,
        pricingUnit: 'per_room',
      },
      forceSell: true,
    });
    expect(applied.rateUnmatched).toBe(false);
    expect(applied.unitCost).toBe(1000);
    expect(applied.quantity).toBe(4); // 2 rooms × 2 nights
    expect(applied.unitSell).toBe(1200); // markup on unit
    expect(applied.details.priceSource).toBe('matched');
  });

  it('clears prices when unmatched', () => {
    const applied = applyRateResolveHit({
      serviceType: 'transfer',
      details: { fromPlaceId: 'a', toPlaceId: 'b' },
      hit: {
        matched: false,
        rateKind: 'transfer',
        rateId: null,
        unitCost: 0,
        unitSell: 0,
        quantity: 1,
        taxPercent: 5,
      },
    });
    expect(applied.rateUnmatched).toBe(true);
    expect(applied.unitCost).toBeNull();
    expect(applied.details.priceSource).toBe('none');
  });
});
