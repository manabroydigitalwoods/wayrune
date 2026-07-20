import { describe, expect, it } from 'vitest';
import {
  previewActivityLineBuy,
  previewHotelStayBuy,
  previewTransferLineBuy,
} from './match-alternative-preview';
import { tryHotelPaxBuySplit } from './hotel-pax-buy-split';
import {
  composeMultiVehicleTransferSplit,
  multiVehicleSplitTotalBuy,
} from './transfer-seat-matrix';

describe('match-alternative-preview', () => {
  it('hotel stay buy scales nights × rooms with weekend', () => {
    // Fri + Sat nights (UTC): 1 weekday + 1 weekend
    const fri = new Date('2026-10-09T00:00:00.000Z'); // Friday
    const sat = new Date('2026-10-10T00:00:00.000Z'); // Saturday
    const total = previewHotelStayBuy({
      unitCost: 4000,
      weekendUnitCost: 5000,
      stayNights: [fri, sat],
      stayNightIsos: ['2026-10-09', '2026-10-10'],
      rooms: 2,
      adults: 2,
      children: 0,
    });
    // (4000 + 5000) × 2 rooms = 18000
    expect(total).toBe(18000);
  });

  it('hotel stay buy includes adult band + occupancy extras + gala', () => {
    const night = new Date('2026-12-24T00:00:00.000Z');
    const total = previewHotelStayBuy({
      unitCost: 3000,
      weekendUnitCost: null,
      occupancyPricingJson: {
        adultBands: [{ adults: 2, unitCostPerNight: 4500 }],
        baseAdults: 2,
        baseChildren: 0,
        extraAdultPerNight: 1000,
        dateSupplements: [
          { date: '2026-12-24', amount: 500, label: 'Christmas Eve' },
        ],
      },
      stayNights: [night],
      stayNightIsos: ['2026-12-24'],
      rooms: 1,
      adults: 3,
      children: 0,
    });
    // band 4500 + extra adult 1000 + gala 500 = 6000
    expect(total).toBe(6000);
  });

  it('hotel returns null without stay nights', () => {
    expect(
      previewHotelStayBuy({
        unitCost: 4000,
        stayNights: [],
        stayNightIsos: [],
        rooms: 1,
        adults: 2,
        children: 0,
      }),
    ).toBeNull();
  });

  it('transfer per_vehicle uses chart × vehicles', () => {
    expect(
      previewTransferLineBuy({
        unitCost: 3500,
        pricingMode: 'per_vehicle',
        adults: 4,
        children: 0,
        vehicles: 2,
      }),
    ).toBe(7000);
  });

  it('transfer multi-cab bumps vehicles and prices per-slice seats', () => {
    const pricingJson = {
      seatMatrix: [
        { seats: 5, unitCost: 4500 },
        { seats: 7, unitCost: 5500 },
      ],
    };
    const total = previewTransferLineBuy({
      unitCost: 9999,
      pricingMode: 'per_vehicle',
      pricingJson,
      vehicleSeats: 7,
      adults: 11,
      children: 0,
      vehicles: 1,
    });
    const split = composeMultiVehicleTransferSplit({
      party: 11,
      seatsPerVehicle: 7,
      vehicles: 2,
      resolveUnitCost: (p) => (p <= 5 ? 4500 : 5500),
    });
    expect(split).not.toBeNull();
    expect(total).toBe(multiVehicleSplitTotalBuy(split!));
    expect(total).toBe(10000);
  });

  it('transfer multi-cab adds explicit child extras once across fleet', () => {
    const pricingJson = {
      seatMatrix: [
        { seats: 5, unitCost: 4500, childAddOn: 200 },
        { seats: 7, unitCost: 5500, childAddOn: 200 },
      ],
    };
    expect(
      previewTransferLineBuy({
        unitCost: 9999,
        pricingMode: 'per_vehicle',
        pricingJson,
        vehicleSeats: 7,
        adults: 10,
        children: 1,
        vehicles: 1,
      }),
    ).toBe(10000 + 200);
  });

  it('hotel pax-split preview matches tryHotelPaxBuySplit totalBuy', () => {
    const stayDates = [
      new Date('2026-04-10T00:00:00.000Z'),
      new Date('2026-04-11T00:00:00.000Z'),
    ];
    const pool = [
      {
        id: 'in',
        unitCost: 4000,
        weekendUnitCost: null,
        occupancyPricingJson: {
          nationality: 'IN',
          adultBands: [{ adults: 2, unitCostPerNight: 4500 }],
        },
      },
      {
        id: 'us',
        unitCost: 6000,
        weekendUnitCost: null,
        occupancyPricingJson: {
          nationality: 'US',
          adultBands: [{ adults: 2, unitCostPerNight: 6200 }],
        },
      },
    ];
    const pickBest = <T extends { id: string }>(rows: T[]) => rows[0];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US'],
      adults: 2,
      children: 0,
      rooms: 1,
      stayDates,
      candidatePool: pool,
      pickBest,
    });
    expect(split).not.toBeNull();
    const preview = previewHotelStayBuy({
      unitCost: 4000,
      weekendUnitCost: null,
      occupancyPricingJson: pool[0]!.occupancyPricingJson,
      stayNights: stayDates,
      stayNightIsos: ['2026-04-10', '2026-04-11'],
      rooms: 1,
      adults: 2,
      children: 0,
      guestCodes: ['IN', 'US'],
      splitTips: pool,
      pickBestTip: pickBest,
    });
    expect(preview).toBe(split!.totalBuy);
    expect(preview).toBe(5350 * 2);
  });

  it('hotel preview uses age×nationality child columns over flat', () => {
    const night = new Date('2026-04-10T00:00:00.000Z');
    const total = previewHotelStayBuy({
      unitCost: 4000,
      occupancyPricingJson: {
        baseAdults: 2,
        baseChildren: 0,
        childWithBedPerNight: 999,
        childAgeNationalityRates: [
          {
            ageMin: 0,
            ageMax: 11,
            nationality: 'IN',
            withBedPerNight: 500,
          },
        ],
      },
      stayNights: [night],
      stayNightIsos: ['2026-04-10'],
      rooms: 1,
      adults: 2,
      children: 1,
      childAges: [8],
      childNationalities: ['IN'],
    });
    // room 4000 + child column 500 (not flat 999)
    expect(total).toBe(4500);
  });

  it('hotel preview uses cross-tip child nationality extras', () => {
    const night = new Date('2026-04-10T00:00:00.000Z');
    const total = previewHotelStayBuy({
      unitCost: 4000,
      occupancyPricingJson: {
        baseAdults: 2,
        baseChildren: 0,
        childWithBedPerNight: 800,
        // Tip must expose without-bed so flat path keeps the without-bed count
        // for the cross-tip replace (same gate as Match).
        childWithoutBedPerNight: 400,
      },
      stayNights: [night],
      stayNightIsos: ['2026-04-10'],
      rooms: 1,
      adults: 2,
      children: 2,
      childrenWithoutBed: 1,
      childNationalities: ['IN', 'US'],
      pickChildPricing: (code) =>
        code === 'IN'
          ? { childWithBedPerNight: 1000, childWithoutBedPerNight: 500 }
          : { childWithBedPerNight: 1500, childWithoutBedPerNight: 800 },
    });
    // room 4000 + IN without 500 + US with 1500 (not flat 400+800)
    expect(total).toBe(6000);
  });

  it('transfer per_adult blends heads', () => {
    expect(
      previewTransferLineBuy({
        unitCost: 1000,
        childUnitCost: 700,
        infantUnitCost: 0,
        pricingMode: 'per_adult',
        adults: 2,
        children: 1,
        infants: 1,
        vehicles: 1,
      }),
    ).toBe(2700);
  });

  it('activity blends adult/child units', () => {
    expect(
      previewActivityLineBuy({
        adultUnitCost: 1500,
        childUnitCost: 900,
        adults: 2,
        children: 1,
        childAges: [8],
        childAgeMin: 5,
        childAgeMax: 12,
      }),
    ).toBe(3900);
  });
});
