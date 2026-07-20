import { describe, expect, it } from 'vitest';
import {
  buildMealOccupancyMatrix,
  countFilledMatrixCells,
  diffMealOccupancyMatrix,
  hotelRateSeasonKey,
  occupancyJsonWithAdultBands,
  setMatrixCellCost,
  setMatrixCellWeekendCost,
} from './hotelRateMealOccupancyMatrix';

const springMap = {
  id: 'map-1',
  mealPlan: 'MAP',
  roomType: 'Deluxe',
  contractId: 'c1',
  placeId: 'p1',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  unitCost: 4500,
  weekendUnitCost: 5200,
  occupancyPricingJson: {
    baseAdults: 2,
    adultBands: [
      {
        adults: 1,
        unitCostPerNight: 3600,
        weekendUnitCostPerNight: 4100,
      },
      {
        adults: 2,
        unitCostPerNight: 4500,
        weekendUnitCostPerNight: 5200,
      },
      {
        adults: 3,
        unitCostPerNight: 5800,
        weekendUnitCostPerNight: 6600,
      },
    ],
  },
};

const springCp = {
  id: 'cp-1',
  mealPlan: 'CP',
  roomType: 'Deluxe',
  contractId: 'c1',
  placeId: 'p1',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  unitCost: 4050,
  weekendUnitCost: 4680,
  occupancyPricingJson: {
    adultBands: [
      { adults: 1, unitCostPerNight: 3240 },
      { adults: 2, unitCostPerNight: 4050 },
      { adults: 3, unitCostPerNight: 5220 },
    ],
  },
};

const autumnMap = {
  ...springMap,
  id: 'map-2',
  startDate: '2026-09-01',
  endDate: '2026-11-30',
};

describe('hotelRateSeasonKey', () => {
  it('groups same room+contract+place+dates+nationality', () => {
    expect(hotelRateSeasonKey(springMap)).toBe(hotelRateSeasonKey(springCp));
    expect(hotelRateSeasonKey(springMap)).not.toBe(hotelRateSeasonKey(autumnMap));
    expect(
      hotelRateSeasonKey({
        ...springMap,
        occupancyPricingJson: { nationality: 'INTL' },
      }),
    ).not.toBe(hotelRateSeasonKey(springMap));
  });
});

describe('buildMealOccupancyMatrix', () => {
  it('fills CP and MAP band cells from siblings including weekends', () => {
    const built = buildMealOccupancyMatrix(
      [springMap, springCp, autumnMap],
      springMap,
    );
    expect(built.byMeal.MAP?.id).toBe('map-1');
    expect(built.byMeal.CP?.id).toBe('cp-1');
    expect(built.byMeal.EP).toBeUndefined();
    const mapDbl = built.cells.find(
      (c) => c.mealPlan === 'MAP' && c.adults === 2,
    );
    const mapSgl = built.cells.find(
      (c) => c.mealPlan === 'MAP' && c.adults === 1,
    );
    const cpSgl = built.cells.find(
      (c) => c.mealPlan === 'CP' && c.adults === 1,
    );
    const epDbl = built.cells.find(
      (c) => c.mealPlan === 'EP' && c.adults === 2,
    );
    expect(mapDbl?.unitCost).toBe('4500');
    expect(mapDbl?.weekendUnitCost).toBe('5200');
    expect(mapSgl?.weekendUnitCost).toBe('4100');
    expect(cpSgl?.unitCost).toBe('3240');
    expect(cpSgl?.weekendUnitCost).toBe('');
    expect(epDbl?.unitCost).toBe('');
    expect(countFilledMatrixCells(built.cells)).toBe(6);
  });

  it('seeds DBL from chart unitCost when bands missing', () => {
    const bare = {
      id: 'ep-1',
      mealPlan: 'EP',
      roomType: 'Deluxe',
      contractId: 'c1',
      placeId: 'p1',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      unitCost: 3700,
      weekendUnitCost: 4100,
    };
    const built = buildMealOccupancyMatrix([bare], bare);
    const epDbl = built.cells.find(
      (c) => c.mealPlan === 'EP' && c.adults === 2,
    );
    expect(epDbl?.unitCost).toBe('3700');
    expect(epDbl?.weekendUnitCost).toBe('4100');
  });
});

describe('diffMealOccupancyMatrix', () => {
  it('creates EP and patches MAP when cells change', () => {
    const built = buildMealOccupancyMatrix([springMap, springCp], springMap);
    let cells = setMatrixCellCost(built.cells, 'EP', 2, '3700');
    cells = setMatrixCellCost(cells, 'MAP', 2, '4600');
    const { upserts, errors } = diffMealOccupancyMatrix({
      cells,
      byMeal: built.byMeal,
      anchor: springMap,
    });
    expect(errors).toEqual([]);
    const ep = upserts.find((u) => u.mealPlan === 'EP');
    const map = upserts.find((u) => u.mealPlan === 'MAP');
    const cp = upserts.find((u) => u.mealPlan === 'CP');
    expect(ep).toMatchObject({
      existingId: null,
      unitCost: 3700,
      changed: true,
    });
    expect(ep?.weekendUnitCost).toBe(Math.round(3700 * (5200 / 4500)));
    expect(map).toMatchObject({
      existingId: 'map-1',
      unitCost: 4600,
      changed: true,
    });
    expect(cp?.changed).toBe(false);
  });

  it('patches when only weekend-per-band changes', () => {
    const built = buildMealOccupancyMatrix([springMap], springMap);
    const cells = setMatrixCellWeekendCost(built.cells, 'MAP', 1, '4300');
    const { upserts, errors } = diffMealOccupancyMatrix({
      cells,
      byMeal: built.byMeal,
      anchor: springMap,
    });
    expect(errors).toEqual([]);
    const map = upserts.find((u) => u.mealPlan === 'MAP');
    expect(map?.changed).toBe(true);
    expect(map?.adultBands).toEqual(
      expect.arrayContaining([
        {
          adults: 1,
          unitCostPerNight: 3600,
          weekendUnitCostPerNight: 4300,
        },
      ]),
    );
  });

  it('reports invalid costs and weekend-without-weekday', () => {
    const built = buildMealOccupancyMatrix([springMap], springMap);
    let cells = setMatrixCellCost(built.cells, 'AP', 1, 'abc');
    cells = setMatrixCellWeekendCost(cells, 'EP', 2, '4000');
    const { errors } = diffMealOccupancyMatrix({
      cells,
      byMeal: built.byMeal,
      anchor: springMap,
    });
    expect(errors.some((e) => /AP 1A/.test(e))).toBe(true);
    expect(errors.some((e) => /EP 2A needs a weekday/.test(e))).toBe(true);
  });
});

describe('occupancyJsonWithAdultBands', () => {
  it('preserves extras, gala, and stamps weekend from ratio', () => {
    const next = occupancyJsonWithAdultBands(
      {
        baseAdults: 2,
        extraAdultPerNight: 1500,
        dateSupplements: [{ date: '2026-12-24', amount: 2500 }],
        adultBands: [
          { adults: 2, unitCostPerNight: 4000, weekendUnitCostPerNight: 4800 },
        ],
      },
      [{ adults: 2, unitCostPerNight: 4500 }],
    );
    expect(next.extraAdultPerNight).toBe(1500);
    expect(next.dateSupplements).toEqual([
      { date: '2026-12-24', amount: 2500 },
    ]);
    expect(next.adultBands).toEqual([
      {
        adults: 2,
        unitCostPerNight: 4500,
        weekendUnitCostPerNight: 4800,
      },
    ]);

    const created = occupancyJsonWithAdultBands(
      null,
      [{ adults: 1, unitCostPerNight: 3600 }],
      { weekendRatio: 5200 / 4500 },
    );
    expect(created.adultBands).toEqual([
      {
        adults: 1,
        unitCostPerNight: 3600,
        weekendUnitCostPerNight: Math.round(3600 * (5200 / 4500)),
      },
    ]);
  });

  it('honours explicit weekend from matrix cells', () => {
    const next = occupancyJsonWithAdultBands(
      { adultBands: [{ adults: 1, unitCostPerNight: 3600, weekendUnitCostPerNight: 4100 }] },
      [{ adults: 1, unitCostPerNight: 3600, weekendUnitCostPerNight: 4300 }],
    );
    expect(next.adultBands).toEqual([
      {
        adults: 1,
        unitCostPerNight: 3600,
        weekendUnitCostPerNight: 4300,
      },
    ]);
  });
});
