import { describe, expect, it } from 'vitest';
import {
  previewActivityLineBuy,
  previewHotelStayBuy,
  previewTransferLineBuy,
} from './match-alternative-preview';

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
