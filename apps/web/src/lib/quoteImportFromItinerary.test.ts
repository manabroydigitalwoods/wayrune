import { describe, expect, it } from 'vitest';
import {
  buildQuoteImportCandidates,
  detailsFromImportCandidate,
} from './quoteImportFromItinerary';

describe('buildQuoteImportCandidates', () => {
  it('defaults commercial hotels/transfers on, meals and free sights off', () => {
    const rows = buildQuoteImportCandidates({
      days: [
        {
          dayNumber: 1,
          items: [
            {
              id: 'h1',
              title: 'Heritage Stay',
              type: 'hotel',
              details: { catalogPlaceId: 'place-dajeeling', nights: 2 },
            },
            { id: 'm1', title: 'Welcome breakfast', type: 'meal' },
            { id: 't1', title: 'Bagdogra → Darjeeling', type: 'transfer' },
            { id: 's1', title: 'Mall Road evening', type: 'sightseeing' },
            { id: 's2', title: 'Tiger Hill sunrise', type: 'sightseeing' },
          ],
        },
      ],
    });

    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.h1?.selected).toBe(true);
    expect(byId.h1?.disposition).toBe('import_as_service');
    expect(byId.t1?.selected).toBe(true);
    expect(byId.m1?.selected).toBe(false);
    expect(byId.m1?.disposition).toBe('included_with_hotel');
    expect(byId.s1?.selected).toBe(false);
    expect(byId.s1?.disposition).toBe('no_price_required');
    expect(byId.s2?.selected).toBe(false);
    expect(byId.s2?.reason).toMatch(/Potential activity/i);
  });

  it('consolidates consecutive hotel nights at the same property', () => {
    const rows = buildQuoteImportCandidates({
      days: [
        {
          dayNumber: 1,
          items: [
            {
              id: 'h1',
              title: 'Heritage Stay',
              type: 'hotel',
              details: { catalogPlaceId: 'place-a' },
            },
          ],
        },
        {
          dayNumber: 2,
          items: [
            {
              id: 'h2',
              title: 'Heritage Stay',
              type: 'hotel',
              details: { catalogPlaceId: 'place-a' },
            },
            { id: 'm2', title: 'Breakfast at hotel', type: 'meal' },
          ],
        },
        {
          dayNumber: 3,
          items: [
            {
              id: 'h3',
              title: 'Kalimpong Lodge',
              type: 'hotel',
              details: { catalogPlaceId: 'place-b' },
            },
          ],
        },
      ],
    });

    const selectedHotels = rows.filter((r) => r.itemType === 'hotel' && r.selected);
    expect(selectedHotels).toHaveLength(2);
    expect(selectedHotels[0]?.title).toMatch(/2 nights/i);
    expect(selectedHotels[0]?.resolveItem?.details?.nights).toBe(2);
    expect(selectedHotels[1]?.id).toBe('h3');

    const includedNight = rows.find((r) => r.id === 'h2');
    expect(includedNight?.disposition).toBe('included_with_hotel');
    expect(includedNight?.selected).toBe(false);
  });

  it('skips items already on the quotation', () => {
    const rows = buildQuoteImportCandidates({
      days: [
        {
          dayNumber: 1,
          items: [{ id: 't1', title: 'Airport transfer', type: 'transfer' }],
        },
      ],
      existingLineIds: new Set(['itin-t1']),
    });
    expect(rows).toHaveLength(0);
  });

  it('seeds hotel resolve details with check-in and idle rate preview', () => {
    const rows = buildQuoteImportCandidates({
      tripStartDate: '2026-04-10',
      days: [
        {
          dayNumber: 1,
          date: '2026-04-10',
          items: [
            {
              id: 'h1',
              title: 'Heritage Stay',
              type: 'hotel',
              details: { catalogPlaceId: 'place-a', nights: 2, roomType: 'Deluxe' },
            },
          ],
        },
      ],
    });
    const hotel = rows.find((r) => r.id === 'h1');
    expect(hotel?.ratePreview?.status).toBe('idle');
    expect(hotel?.resolveItem?.details?.checkIn).toBe('2026-04-10');
    expect(hotel?.resolveItem?.details?.nights).toBe(2);
    expect(hotel?.resolveItem?.details?.rooms).toBe(1);
  });
});

describe('detailsFromImportCandidate', () => {
  it('marks matched hotels with provenance and checkout', () => {
    const details = detailsFromImportCandidate({
      id: 'h1',
      lineId: 'itin-h1',
      dayNumber: 1,
      date: '2026-04-10',
      title: 'Heritage Stay',
      itemType: 'hotel',
      serviceType: 'hotel',
      disposition: 'import_as_service',
      selected: true,
      reason: 'Hotel',
      resolveItem: {
        itemId: 'itin-h1',
        type: 'hotel',
        date: '2026-04-10',
        details: {
          propertyName: 'Heritage Stay',
          checkIn: '2026-04-10',
          nights: 2,
          rooms: 1,
          roomType: 'Deluxe',
          mealPlan: 'MAP',
        },
      },
      ratePreview: {
        status: 'matched',
        unitCost: 4000,
        unitSell: 5000,
        quantity: 2,
        rateMeta: { roomType: 'Deluxe', isSystem: false, startDate: '2026-04-01', endDate: '2026-04-30' },
      },
    });
    expect(details.priceSource).toBe('matched');
    expect(details.checkOut).toBe('2026-04-12');
    expect(details.rateLabel).toMatch(/Heritage Stay/);
    expect(details.rateSupplierLabel).toBe('Direct contract');
  });

  it('seeds transfer serviceDate, vehicles and matched label', () => {
    const details = detailsFromImportCandidate({
      id: 't1',
      lineId: 'itin-t1',
      dayNumber: 1,
      date: '2026-04-10',
      title: 'Airport transfer',
      itemType: 'transfer',
      serviceType: 'transfer',
      disposition: 'import_as_service',
      selected: true,
      reason: 'Transfer',
      resolveItem: {
        itemId: 'itin-t1',
        type: 'transfer',
        date: '2026-04-10',
        details: {
          fromPlaceId: 'from-1',
          toPlaceId: 'to-1',
          fromPlaceName: 'Bagdogra',
          toPlaceName: 'Darjeeling',
          vehicleTypeId: 'veh-1',
          vehicleLabel: 'Innova',
        },
      },
      ratePreview: {
        status: 'matched',
        unitCost: 3000,
        unitSell: 3600,
        quantity: 1,
        rateMeta: { pricingMode: 'per_vehicle', isSystem: false },
      },
    });
    expect(details.serviceDate).toBe('2026-04-10');
    expect(details.vehicles).toBe(1);
    expect(details.priceSource).toBe('matched');
    expect(details.rateLabel).toBe('Bagdogra → Darjeeling · Innova');
  });
});
