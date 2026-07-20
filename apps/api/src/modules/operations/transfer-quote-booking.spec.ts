import { describe, expect, it } from 'vitest';
import {
  transferBookingTitle,
  transferCapacityStampFromLine,
  transferLinesFromQuoteItems,
  transferLinesMissingSupplier,
  transferServiceWindow,
} from './transfer-quote-booking';

describe('transfer-quote-booking', () => {
  it('filters transfer lines with supplier + id', () => {
    const lines = transferLinesFromQuoteItems([
      { id: 't1', serviceType: 'transfer', details: { supplierId: 's1' } },
      { id: 't2', serviceType: 'transfer', details: {} },
      { id: 'h1', serviceType: 'hotel', details: { supplierId: 's1' } },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.id).toBe('t1');
  });

  it('lists transfer lines missing supplier for accept warnings', () => {
    const missing = transferLinesMissingSupplier([
      {
        id: 't2',
        serviceType: 'transfer',
        description: 'Airport pickup',
        details: {},
      },
      { id: 't1', serviceType: 'transfer', details: { supplierId: 's1' } },
    ]);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.id).toBe('t2');
  });

  it('builds title from corridor', () => {
    expect(
      transferBookingTitle({
        description: 'Airport transfer',
        details: {
          fromPlaceName: 'Bagdogra',
          toPlaceName: 'Darjeeling',
          vehicleTypeName: 'Innova',
        },
      }),
    ).toBe('Bagdogra → Darjeeling Innova');
  });

  it('parses service date window', () => {
    const w = transferServiceWindow({ serviceDate: '2026-10-05' });
    expect(w.startAt?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(w.endAt?.toISOString()).toBe('2026-10-05T02:00:00.000Z');
  });

  it('stamps party and seats from line + provenance', () => {
    expect(
      transferCapacityStampFromLine({
        details: { adults: 4, children: 1, seats: 7 },
      }),
    ).toEqual({ adults: 4, children: 1, vehicleSeats: 7 });
    expect(
      transferCapacityStampFromLine({
        details: { adults: 2 },
        rateProvenance: { vehicleSeats: 6 },
      }),
    ).toEqual({ adults: 2, children: null, vehicleSeats: 6 });
  });
});
