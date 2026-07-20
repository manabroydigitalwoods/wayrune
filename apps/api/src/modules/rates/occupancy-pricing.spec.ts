import { describe, expect, it } from 'vitest';
import {
  applyOccupancyPricing,
  buildAdultBandsFromHotelCsvRow,
  classifyHotelOccupancyPax,
  parseAdultBands,
  parseOccupancyPricing,
  pickAdultBand,
} from './occupancy-pricing';

describe('occupancy-pricing', () => {
  it('parses occupancy JSON', () => {
    const p = parseOccupancyPricing({
      baseAdults: 2,
      extraAdultPerNight: 1500,
      childWithBedPerNight: 800,
      childAgeMax: 11,
    });
    expect(p?.baseAdults).toBe(2);
    expect(p?.extraAdultPerNight).toBe(1500);
    expect(p?.childAgeMax).toBe(11);
  });

  it('returns null for empty object', () => {
    expect(parseOccupancyPricing({})).toBeNull();
  });

  it('applies extra adults and children over base', () => {
    const result = applyOccupancyPricing(
      13500,
      {
        baseAdults: 2,
        baseChildren: 0,
        extraAdultPerNight: 1500,
        childWithBedPerNight: 800,
        childWithoutBedPerNight: 400,
      },
      { adults: 3, children: 2, childrenWithoutBed: 1, rooms: 1, nights: 3 },
    );
    // 1 extra adult × 1500 × 3 = 4500; 1 with bed × 800 × 3 = 2400; 1 without × 400 × 3 = 1200
    expect(result.extraAdultCount).toBe(1);
    expect(result.childWithBedCount).toBe(1);
    expect(result.childWithoutBedCount).toBe(1);
    expect(result.occupancyExtraTotal).toBe(8100);
    expect(result.totalBuy).toBe(21600);
  });

  it('scales base occupancy by rooms', () => {
    const result = applyOccupancyPricing(
      20000,
      { baseAdults: 2, baseChildren: 0, extraAdultPerNight: 1000 },
      { adults: 4, children: 0, rooms: 2, nights: 2 },
    );
    expect(result.extraAdultCount).toBe(0);
    expect(result.occupancyExtraTotal).toBe(0);
    expect(result.totalBuy).toBe(20000);
  });

  it('reclassifies over-age children as adults for occupancy', () => {
    const pax = classifyHotelOccupancyPax({
      adults: 2,
      children: 2,
      childAges: [8, 14],
      childAgeMax: 11,
    });
    expect(pax.partyAdults).toBe(2);
    expect(pax.partyChildren).toBe(2);
    expect(pax.adults).toBe(3);
    expect(pax.children).toBe(1);
    expect(pax.reclassifiedAsAdult).toBe(1);
    expect(pax.usedChildAges).toBe(true);

    const priced = applyOccupancyPricing(
      10000,
      {
        baseAdults: 2,
        baseChildren: 0,
        childAgeMax: 11,
        extraAdultPerNight: 1500,
        childWithBedPerNight: 800,
      },
      {
        adults: pax.adults,
        children: pax.children,
        rooms: 1,
        nights: 2,
      },
    );
    // 1 extra adult × 1500 × 2 = 3000; 1 child × 800 × 2 = 1600
    expect(priced.extraAdultCount).toBe(1);
    expect(priced.childWithBedCount).toBe(1);
    expect(priced.occupancyExtraTotal).toBe(4600);
  });

  it('passthrough when no ages or no childAgeMax', () => {
    expect(
      classifyHotelOccupancyPax({
        adults: 2,
        children: 2,
        childAges: [8, 14],
      }).reclassifiedAsAdult,
    ).toBe(0);
    expect(
      classifyHotelOccupancyPax({
        adults: 2,
        children: 2,
        childAgeMax: 11,
      }).usedChildAges,
    ).toBe(false);
  });

  it('parses adult bands with optional weekend costs', () => {
    expect(
      parseAdultBands([
        { adults: 2, unitCostPerNight: 4500, weekendUnitCostPerNight: 5200 },
        { adults: 1, unitCostPerNight: 3600 },
      ]),
    ).toEqual([
      { adults: 1, unitCostPerNight: 3600 },
      { adults: 2, unitCostPerNight: 4500, weekendUnitCostPerNight: 5200 },
    ]);
    expect(
      parseOccupancyPricing({
        adultBands: [{ adults: 2, unitCostPerNight: 4500 }],
      })?.adultBands,
    ).toEqual([{ adults: 2, unitCostPerNight: 4500 }]);
    expect(parseOccupancyPricing({ minStayNights: 2 })?.minStayNights).toBe(2);
  });

  it('picks band weekend absolute over chart ratio', () => {
    const bands = parseAdultBands([
      { adults: 1, unitCostPerNight: 3600, weekendUnitCostPerNight: 4100 },
      { adults: 2, unitCostPerNight: 4500, weekendUnitCostPerNight: 5200 },
    ]);
    const sgl = pickAdultBand({
      bands,
      adults: 1,
      rooms: 1,
      chartUnitCost: 4500,
      chartWeekendUnitCost: 9999,
    });
    expect(sgl).toMatchObject({
      adults: 1,
      unitCostPerNight: 3600,
      weekendUnitCostPerNight: 4100,
    });

    const ratioOnly = pickAdultBand({
      bands: parseAdultBands([{ adults: 1, unitCostPerNight: 3600 }]),
      adults: 1,
      rooms: 1,
      chartUnitCost: 4500,
      chartWeekendUnitCost: 5200,
    });
    expect(ratioOnly?.weekendUnitCostPerNight).toBe(
      Math.round(3600 * (5200 / 4500) * 100) / 100,
    );
  });

  it('builds adultBands from hotel CSV band weekend columns', () => {
    expect(
      buildAdultBandsFromHotelCsvRow({
        unitCost: 4500,
        weekendUnitCost: 5200,
      }),
    ).toBeNull();

    const bands = buildAdultBandsFromHotelCsvRow({
      unitCost: 4500,
      weekendUnitCost: 5200,
      sglUnitCost: 3600,
      sglWeekendUnitCost: 4100,
      tplUnitCost: 5800,
      tplWeekendUnitCost: 6400,
    });
    expect(bands).toEqual([
      { adults: 1, unitCostPerNight: 3600, weekendUnitCostPerNight: 4100 },
      { adults: 2, unitCostPerNight: 4500, weekendUnitCostPerNight: 5200 },
      { adults: 3, unitCostPerNight: 5800, weekendUnitCostPerNight: 6400 },
    ]);

    const dblOnly = buildAdultBandsFromHotelCsvRow({
      unitCost: 4500,
      dblUnitCost: 4600,
      dblWeekendUnitCost: 5300,
    });
    expect(dblOnly).toEqual([
      { adults: 2, unitCostPerNight: 4600, weekendUnitCostPerNight: 5300 },
    ]);
  });
});
