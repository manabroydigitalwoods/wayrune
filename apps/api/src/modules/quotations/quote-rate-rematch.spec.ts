import { describe, expect, it } from 'vitest';
import type { QuotationItem } from '@wayrune/contracts';
import {
  applyRateResolveHitToItem,
  buildResolveRatesInput,
  resolvePayloadFromQuoteItem,
} from './quote-rate-rematch';

function hotelItem(overrides: Partial<QuotationItem> = {}): QuotationItem {
  return {
    id: 'h1',
    description: 'Heritage Deluxe',
    quantity: 1,
    unitCost: null,
    unitSell: null,
    taxPercent: 5,
    pricingUnit: 'per_room',
    serviceType: 'hotel',
    rateKind: 'hotel',
    details: {
      supplierId: 'sup-1',
      placeId: 'place-1',
      roomType: 'Deluxe',
      mealPlan: 'MAP',
      checkIn: '2026-10-10',
      checkOut: '2026-10-12',
      nights: 2,
      rooms: 1,
      adults: 2,
      markupMode: 'percent',
      markupValue: 20,
    },
    ...overrides,
  };
}

function transferItem(overrides: Partial<QuotationItem> = {}): QuotationItem {
  return {
    id: 't1',
    description: 'IXB → DAJ',
    quantity: 1,
    unitCost: null,
    unitSell: null,
    taxPercent: 5,
    pricingUnit: 'per_service',
    serviceType: 'transfer',
    rateKind: 'transfer',
    details: {
      fromPlaceId: 'ixb',
      toPlaceId: 'daj',
      vehicleTypeId: 'veh-1',
      serviceDate: '2026-10-10',
      adults: 8,
      children: 0,
      vehicles: 1,
      markupMode: 'percent',
      markupValue: 20,
    },
    ...overrides,
  };
}

describe('resolvePayloadFromQuoteItem / buildResolveRatesInput', () => {
  it('builds hotel resolve payload with nights from stay', () => {
    const payload = resolvePayloadFromQuoteItem(hotelItem(), '2026-10-01');
    expect(payload).toMatchObject({
      itemId: 'h1',
      type: 'hotel',
      date: '2026-10-10',
      details: {
        supplierId: 'sup-1',
        placeId: 'place-1',
        roomType: 'Deluxe',
        mealPlan: 'MAP',
        nights: 2,
        rooms: 1,
      },
    });
  });

  it('passes guest nationality / nationalities on rematch payload', () => {
    const payload = resolvePayloadFromQuoteItem(
      hotelItem({
        details: {
          supplierId: 'sup-1',
          placeId: 'place-1',
          roomType: 'Deluxe',
          mealPlan: 'MAP',
          checkIn: '2026-10-10',
          checkOut: '2026-10-12',
          nights: 2,
          rooms: 1,
          nationality: 'INTL',
          nationalities: ['IN', 'US'],
        },
      }),
      '2026-10-01',
    );
    expect(payload?.details).toMatchObject({
      nationality: 'INTL',
      nationalities: ['IN', 'US'],
    });
  });

  it('passes traveller nationality fallback on batch rematch input', () => {
    const input = buildResolveRatesInput({
      items: [hotelItem()],
      startDate: '2026-10-10',
      adults: 2,
      nationality: 'IN',
    });
    expect(input?.nationality).toBe('IN');
  });

  it('skips custom lines when building batch input', () => {
    const input = buildResolveRatesInput({
      items: [
        hotelItem(),
        {
          id: 'c1',
          description: 'Fee',
          quantity: 1,
          unitCost: null,
          unitSell: null,
          taxPercent: 0,
          pricingUnit: 'per_service',
          serviceType: 'custom',
        },
      ],
      startDate: '2026-10-10',
      adults: 2,
    });
    expect(input?.items).toHaveLength(1);
    expect(input?.items[0]?.itemId).toBe('h1');
    expect(input?.adults).toBe(2);
  });
});

describe('applyRateResolveHitToItem', () => {
  it('stamps matched hotel buy/sell from markup', () => {
    const out = applyRateResolveHitToItem({
      item: hotelItem(),
      defaultMarkupPercent: 20,
      hit: {
        itemId: 'h1',
        matched: true,
        rateKind: 'hotel',
        rateId: 'rate-1',
        unitCost: 5000,
        unitSell: 6000,
        quantity: 2,
        taxPercent: 5,
        pricingUnit: 'per_room',
        rateMeta: {
          updatedAt: '2026-07-01T00:00:00.000Z',
          supplierId: 'sup-1',
        },
      },
    });
    expect(out.rateId).toBe('rate-1');
    expect(out.unitCost).toBe(5000);
    // 2 nights × 1 room × 5000 = 10000 base → +20% = 12000 → unit 6000
    expect(out.quantity).toBe(2);
    expect(out.unitSell).toBe(6000);
    expect(out.details?.priceSource).toBe('matched');
    expect(out.rateProvenance?.rateUpdatedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(out.rateUnmatched).toBe(false);
  });

  it('bumps transfer vehicles when party exceeds seats', () => {
    const out = applyRateResolveHitToItem({
      item: transferItem(),
      defaultMarkupPercent: 20,
      hit: {
        itemId: 't1',
        matched: true,
        rateKind: 'transfer',
        rateId: 'fare-1',
        unitCost: 4500,
        unitSell: 5400,
        quantity: 1,
        taxPercent: 5,
        rateMeta: { vehicleSeats: 7, capacity: 7 },
      },
    });
    expect(out.details?.vehicles).toBe(2);
    expect(out.quantity).toBe(2);
    expect(out.rateProvenance?.capacityNote).toMatch(/^Party of 8 fits 14/);
    expect(out.rateProvenance?.vehicleSeats).toBe(7);
  });

  it('preserves childAges when applying a matched hit', () => {
    const out = applyRateResolveHitToItem({
      item: hotelItem({
        details: {
          ...hotelItem().details,
          children: 2,
          childAges: [5, 14],
        },
      }),
      defaultMarkupPercent: 20,
      hit: {
        itemId: 'h1',
        matched: true,
        rateKind: 'hotel',
        rateId: 'rate-1',
        unitCost: 5000,
        unitSell: 6000,
        quantity: 2,
        taxPercent: 5,
        pricingUnit: 'per_room',
        rateMeta: { updatedAt: '2026-07-01T00:00:00.000Z' },
      },
    });
    expect(out.details?.childAges).toEqual([5, 14]);
  });

  it('marks unmatched when resolve misses', () => {
    const out = applyRateResolveHitToItem({
      item: hotelItem(),
      defaultMarkupPercent: 20,
      hit: {
        itemId: 'h1',
        matched: false,
        rateKind: 'hotel',
        rateId: null,
        unitCost: 0,
        unitSell: 0,
        quantity: 1,
      },
    });
    expect(out.rateUnmatched).toBe(true);
    expect(out.unitCost).toBeNull();
    expect(out.unitSell).toBeNull();
    expect(out.details?.priceSource).toBe('none');
  });

  it('stamps Why this rate provenance from matchExplain on rematch', () => {
    const out = applyRateResolveHitToItem({
      item: hotelItem(),
      defaultMarkupPercent: 20,
      hit: {
        itemId: 'h1',
        matched: true,
        rateKind: 'hotel',
        rateId: 'rate-1',
        unitCost: 5000,
        unitSell: 6000,
        quantity: 2,
        taxPercent: 5,
        pricingUnit: 'per_room',
        rateMeta: {
          matchExplain: {
            accepted: ['Room matched', 'Dates covered'],
            rejected: [
              { rateId: 'r2', label: 'Suite', reason: 'room type does not match' },
            ],
          },
        },
      },
    });
    expect(out.rateProvenance?.matchSummary).toBe('Room matched; Dates covered');
    expect(out.rateProvenance?.matchAccepted).toEqual([
      'Room matched',
      'Dates covered',
    ]);
    expect(out.rateProvenance?.matchRejectedCompact).toEqual([
      {
        rateId: 'r2',
        label: 'Suite',
        reason: 'room type does not match',
      },
    ]);
  });
});
