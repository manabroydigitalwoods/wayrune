import { describe, expect, it } from 'vitest';
import {
  hotelBookingTitle,
  hotelLinesFromQuoteItems,
  hotelLinesMissingSupplier,
  hotelStayWindow,
  lineBuyTotal,
  lineSellTotal,
} from './hotel-quote-booking';

describe('hotel-quote-booking helpers', () => {
  it('filters hotel lines with supplier and id', () => {
    const lines = hotelLinesFromQuoteItems([
      {
        id: 'line-1',
        serviceType: 'hotel',
        details: { supplierId: 'sup-1', roomType: 'Deluxe' },
      },
      { id: 'line-2', serviceType: 'transfer', details: { supplierId: 'sup-1' } },
      { id: 'line-3', serviceType: 'hotel', details: {} },
      { serviceType: 'hotel', details: { supplierId: 'sup-1' } },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.id).toBe('line-1');
  });

  it('lists hotel lines missing supplier for accept warnings', () => {
    const missing = hotelLinesMissingSupplier([
      {
        id: 'line-3',
        serviceType: 'hotel',
        description: 'No supplier stay',
        details: {},
      },
      {
        id: 'line-1',
        serviceType: 'hotel',
        details: { supplierId: 'sup-1' },
      },
    ]);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.id).toBe('line-3');
  });

  it('computes stay window from check-in and nights', () => {
    const { startAt, endAt } = hotelStayWindow({
      checkIn: '2026-10-05',
      nights: 2,
    });
    expect(startAt?.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(endAt?.toISOString().slice(0, 10)).toBe('2026-10-07');
  });

  it('prefers checkOut when set', () => {
    const { endAt } = hotelStayWindow({
      checkIn: '2026-10-05',
      checkOut: '2026-10-08',
      nights: 99,
    });
    expect(endAt?.toISOString().slice(0, 10)).toBe('2026-10-08');
  });

  it('builds title and totals', () => {
    expect(
      hotelBookingTitle({
        description: 'Stay',
        details: {
          propertyName: 'Heritage Lodge',
          roomType: 'Deluxe',
          mealPlan: 'MAP',
        },
      }),
    ).toBe('Heritage Lodge · Deluxe · MAP');
    expect(
      lineBuyTotal({
        unitCost: 4500,
        quantity: 2,
        details: { supplierId: 's' },
      }),
    ).toBe(9000);
    expect(
      lineSellTotal({
        unitSell: 5400,
        quantity: 2,
        details: { supplierId: 's' },
      }),
    ).toBe(10800);
  });
});
