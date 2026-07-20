import { describe, expect, it } from 'vitest';
import {
  applyRateResolveHit,
  lineNeedsRateDriftAck,
  rateBuyChangedMessage,
  rateChartChangedSinceMatch,
  rateMatchFingerprint,
  resolvePayloadFromQuoteDetails,
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

  it('changes when activity date changes', () => {
    const a = rateMatchFingerprint('activity', {
      propertyName: 'Tiger Hill sunrise',
      activityDate: '2026-12-01',
      privateOrSic: 'private',
    });
    const b = rateMatchFingerprint('activity', {
      propertyName: 'Tiger Hill sunrise',
      activityDate: '2026-12-02',
      privateOrSic: 'private',
    });
    expect(a).not.toBe(b);
  });
});

describe('resolvePayloadFromQuoteDetails (activity)', () => {
  it('builds activity resolve payload', () => {
    const payload = resolvePayloadFromQuoteDetails(
      'line-1',
      'activity',
      {
        propertyName: 'Tiger Hill sunrise',
        activityDate: '2026-10-05',
        privateOrSic: 'sic',
        adults: 2,
        children: 1,
        supplierId: 'sup-1',
        placeId: 'place-1',
      },
    );
    expect(payload).toMatchObject({
      itemId: 'line-1',
      type: 'activity',
      date: '2026-10-05',
      details: {
        propertyName: 'Tiger Hill sunrise',
        privateOrSic: 'sic',
        adults: 2,
        children: 1,
        supplierId: 'sup-1',
        placeId: 'place-1',
      },
    });
  });
});

describe('applyRateResolveHit (activity)', () => {
  it('applies matched activity pricing per person', () => {
    const applied = applyRateResolveHit({
      serviceType: 'activity',
      details: {
        propertyName: 'Tiger Hill sunrise',
        privateOrSic: 'private',
        adults: 2,
        children: 1,
        activityDate: '2026-10-05',
      },
      hit: {
        matched: true,
        rateKind: 'activity',
        rateId: 'act-1',
        unitCost: 1500,
        unitSell: 1800,
        quantity: 3,
        taxPercent: 5,
        pricingUnit: 'per_person',
        rateMeta: {
          activityName: 'Tiger Hill sunrise',
          updatedAt: '2026-07-01T00:00:00.000Z',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        },
      },
      defaultMarkupPercent: 20,
      forceSell: true,
    });
    expect(applied.rateUnmatched).toBe(false);
    expect(applied.rateKind).toBe('activity');
    expect(applied.unitCost).toBe(1500);
    expect(applied.quantity).toBe(3);
    expect(applied.details.priceSource).toBe('matched');
    expect(applied.details.rateLabel).toContain('Tiger Hill sunrise');
  });
});

describe('applyRateResolveHit (transfer capacity bump)', () => {
  it('raises vehicles so party fits seats and clears capacityWarn', () => {
    const applied = applyRateResolveHit({
      serviceType: 'transfer',
      details: {
        fromPlaceName: 'Bagdogra',
        toPlaceName: 'Darjeeling',
        vehicleLabel: 'Innova',
        vehicles: 1,
        adults: 6,
        children: 2,
        markupMode: 'percent',
        markupValue: 20,
      },
      hit: {
        matched: true,
        rateKind: 'transfer',
        rateId: 'tf-1',
        unitCost: 4500,
        unitSell: 5400,
        quantity: 1,
        taxPercent: 5,
        pricingUnit: 'per_vehicle',
        rateMeta: {
          vehicleSeats: 7,
          capacity: 7,
          currency: 'INR',
        },
      },
      forceSell: true,
    });
    expect(applied.details.vehicles).toBe(2);
    expect(applied.quantity).toBe(2);
    expect(applied.vehiclesBumped).toEqual({ from: 1, to: 2 });
    expect(applied.rateProvenance?.capacityWarn).toBeUndefined();
    expect(applied.rateProvenance?.capacityNote).toMatch(/^Party of 8 fits 14/);
    expect(applied.rateProvenance?.vehicleSeats).toBe(7);
  });

  it('does not lower a higher user vehicle count', () => {
    const applied = applyRateResolveHit({
      serviceType: 'transfer',
      details: {
        vehicles: 3,
        adults: 8,
        children: 0,
        markupMode: 'percent',
        markupValue: 20,
      },
      hit: {
        matched: true,
        rateKind: 'transfer',
        rateId: 'tf-2',
        unitCost: 4500,
        quantity: 1,
        taxPercent: 0,
        rateMeta: { vehicleSeats: 7, currency: 'INR' },
      },
      forceSell: true,
    });
    expect(applied.details.vehicles).toBe(3);
    expect(applied.vehiclesBumped).toBeUndefined();
    expect(applied.rateProvenance?.capacityWarn).toBeUndefined();
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
        rateMeta: {
          isSystem: false,
          supplierId: 'sup-1',
          roomType: 'Deluxe',
          mealPlan: 'MAP',
          startDate: '2026-04-01',
          endDate: '2026-09-30',
          updatedAt: '2026-07-01T10:00:00.000Z',
          currency: 'INR',
          roomProductId: 'rp-1',
          contractId: 'ctr-1',
          contractTitle: 'Annual rate',
          contractVersionNumber: 2,
          matchExplain: {
            accepted: ['Active contract v2', 'room product match'],
            rejected: [],
          },
        },
      },
      forceSell: true,
    });
    expect(applied.rateUnmatched).toBe(false);
    expect(applied.unitCost).toBe(1000);
    expect(applied.quantity).toBe(4); // 2 rooms × 2 nights
    expect(applied.unitSell).toBe(1200); // markup on unit
    expect(applied.details.priceSource).toBe('matched');
    expect(applied.details.rateLastUpdated).toBe('2026-07-01T10:00:00.000Z');
    expect(applied.rateProvenance).toMatchObject({
      rateId: 'rate-1',
      rateKind: 'hotel',
      supplierId: 'sup-1',
      unitCostAtMatch: 1000,
      isSystem: false,
      startDate: '2026-04-01',
      endDate: '2026-09-30',
      roomProductId: 'rp-1',
      contractId: 'ctr-1',
      contractTitle: 'Annual rate',
      contractVersionNumber: 2,
      matchSummary: 'Active contract v2; room product match',
    });
  });

  it('captures calculation and match summary from rateMeta', () => {
    const applied = applyRateResolveHit({
      serviceType: 'hotel',
      details: { checkIn: '2026-12-01', checkOut: '2026-12-03', rooms: 1 },
      hit: {
        matched: true,
        rateKind: 'hotel',
        rateId: 'rate-2',
        unitCost: 5000,
        unitSell: 6000,
        quantity: 2,
        taxPercent: 0,
        rateMeta: {
          calculation: {
            weekdayNights: 2,
            weekendNights: 0,
            weekdayUnit: 5000,
            weekendUnit: null,
            rooms: 1,
            totalBuy: 10000,
          },
          matchExplain: {
            accepted: ['Season window', 'MAP meal plan'],
            rejected: [{ label: 'Suite MAP', reason: 'Higher cost' }],
          },
        },
      },
      forceSell: true,
    });
    expect(applied.rateProvenance?.calculation).toMatchObject({
      weekdayNights: 2,
      totalBuy: 10000,
    });
    expect(applied.rateProvenance?.matchSummary).toBe('Season window; MAP meal plan');
    expect(applied.rateProvenance?.matchAccepted).toEqual([
      'Season window',
      'MAP meal plan',
    ]);
    expect(applied.rateProvenance?.matchRejectedCompact).toEqual([
      { label: 'Suite MAP', reason: 'Higher cost' },
    ]);
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

  it('surfaces blackout / stop-sell block reasons from rateMeta', () => {
    const blocked = applyRateResolveHit({
      serviceType: 'hotel',
      details: { placeId: 'p1', nights: 2 },
      hit: {
        matched: false,
        rateKind: 'hotel',
        rateId: null,
        unitCost: 0,
        unitSell: 0,
        quantity: 1,
        taxPercent: 5,
        rateMeta: { blockReason: 'blackout' },
      },
    });
    expect(blocked.rateUnmatched).toBe(true);
    expect(blocked.rateBlockReason).toBe('blackout');
  });

  it('maps matchExplain.accepted into provenance matchSummary', () => {
    const applied = applyRateResolveHit({
      serviceType: 'hotel',
      details: {
        checkIn: '2026-10-05',
        checkOut: '2026-10-07',
        rooms: 1,
        markupMode: 'percent',
        markupValue: 20,
      },
      hit: {
        matched: true,
        rateKind: 'hotel',
        rateId: 'rate-deluxe',
        unitCost: 4500,
        unitSell: 5400,
        quantity: 2,
        taxPercent: 5,
        pricingUnit: 'per_room',
        rateMeta: {
          isSystem: false,
          supplierId: 'sup-heritage',
          roomType: 'Deluxe mountain view',
          roomProductId: 'prod-deluxe',
          mealPlan: 'MAP',
          contractId: 'contract-1',
          contractTitle: 'FY26 FIT',
          contractVersionNumber: 1,
          startDate: '2026-04-01',
          endDate: '2026-12-20',
          updatedAt: '2026-07-01T10:00:00.000Z',
          currency: 'INR',
          matchExplain: {
            accepted: ['room product match', 'active contract v1'],
            rejected: [{ label: 'Heritage suite · CP', reason: 'room product does not match' }],
          },
        },
      },
      forceSell: true,
    });
    expect(applied.rateProvenance).toMatchObject({
      rateId: 'rate-deluxe',
      roomProductId: 'prod-deluxe',
      contractId: 'contract-1',
      contractTitle: 'FY26 FIT',
      contractVersionNumber: 1,
      matchSummary: 'room product match; active contract v1',
    });
  });
});

describe('resolvePayloadFromQuoteDetails', () => {
  it('prefers hotel check-in over trip start for season matching', () => {
    const payload = resolvePayloadFromQuoteDetails(
      'line-1',
      'hotel',
      {
        checkIn: '2026-04-10',
        checkOut: '2026-04-12',
        supplierId: 'sup-1',
        roomType: 'Deluxe mountain view',
        mealPlan: 'MAP',
        rooms: 1,
        adults: 3,
      },
      '2026-10-05',
    );
    expect(payload?.date).toBe('2026-04-10');
    expect(payload?.details.nights).toBe(2);
    expect(payload?.details.adults).toBe(3);
  });

  it('prefers transfer service date over trip start', () => {
    const payload = resolvePayloadFromQuoteDetails(
      'line-2',
      'transfer',
      {
        serviceDate: '2026-04-11',
        fromPlaceId: 'a',
        toPlaceId: 'b',
        vehicleTypeId: 'v1',
      },
      '2026-10-05',
    );
    expect(payload?.date).toBe('2026-04-11');
  });
});

describe('rate chart freshness', () => {
  it('detects chart drift when live updatedAt is newer than snapshot', () => {
    expect(
      rateChartChangedSinceMatch({
        rateUpdatedAtAtMatch: '2026-07-01T10:00:00.000Z',
        matchedAt: '2026-07-01T12:00:00.000Z',
        currentUpdatedAt: '2026-07-18T08:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      rateChartChangedSinceMatch({
        rateUpdatedAtAtMatch: '2026-07-18T08:00:00.000Z',
        currentUpdatedAt: '2026-07-18T08:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('formats buy-change message when rematch differs', () => {
    expect(
      rateBuyChangedMessage({ previousBuy: 4500, nextBuy: 5200, currency: 'INR' }),
    ).toMatch(/4,500/);
    expect(rateBuyChangedMessage({ previousBuy: 4500, nextBuy: 4500 })).toBeNull();
  });

  it('requires acknowledge when chart drifted unless stamp + reason match', () => {
    expect(
      lineNeedsRateDriftAck({
        rateUpdatedAtAtMatch: '2026-07-01T10:00:00.000Z',
        currentUpdatedAt: '2026-07-18T08:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      lineNeedsRateDriftAck({
        rateUpdatedAtAtMatch: '2026-07-01T10:00:00.000Z',
        currentUpdatedAt: '2026-07-18T08:00:00.000Z',
        ackForUpdatedAt: '2026-07-18T08:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      lineNeedsRateDriftAck({
        rateUpdatedAtAtMatch: '2026-07-01T10:00:00.000Z',
        currentUpdatedAt: '2026-07-18T08:00:00.000Z',
        ackForUpdatedAt: '2026-07-18T08:00:00.000Z',
        ackReason: 'Supplier confirmed old buy holds',
      }),
    ).toBe(false);
  });

  it('preserves fixed markup mode through rate resolve apply', () => {
    const applied = applyRateResolveHit({
      serviceType: 'hotel',
      details: {
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
        rooms: 1,
        markupMode: 'fixed',
        markupValue: 500,
      },
      defaultMarkupPercent: 15,
      hit: {
        matched: true,
        unitCost: 4000,
        quantity: 2,
        taxPercent: 0,
        rateId: 'rate_1',
        rateMeta: { roomType: 'Deluxe', mealPlan: 'MAP', startDate: '2026-01-01' },
      },
    });
    expect(applied.details.markupMode).toBe('fixed');
    expect(applied.details.markupValue).toBe(500);
    expect(applied.unitSell).not.toBeNull();
    expect(applied.unitSell).toBeGreaterThan(4000);
  });
});
