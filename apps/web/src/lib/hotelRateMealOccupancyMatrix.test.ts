import { describe, expect, it } from 'vitest';
import {
  buildMealOccupancyMatrix,
  countFilledMatrixCells,
  diffMealOccupancyMatrix,
  hotelRateSeasonKey,
  occupancyJsonWithAdultBands,
  setMatrixCellCost,
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
      { adults: 1, unitCostPerNight: 3600 },
      { adults: 2, unitCostPerNight: 4500 },
      { adults: 3, unitCostPerNight: 5800 },
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
  it('fills CP and MAP band cells from siblings', () => {
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
    const cpSgl = built.cells.find(
      (c) => c.mealPlan === 'CP' && c.adults === 1,
    );
    const epDbl = built.cells.find(
      (c) => c.mealPlan === 'EP' && c.adults === 2,
    );
    expect(mapDbl?.unitCost).toBe('4500');
    expect(cpSgl?.unitCost).toBe('3240');
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
    };
    const built = buildMealOccupancyMatrix([bare], bare);
    expect(
      built.cells.find((c) => c.mealPlan === 'EP' && c.adults === 2)?.unitCost,
    ).toBe('3700');
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

  it('reports invalid costs', () => {
    const built = buildMealOccupancyMatrix([springMap], springMap);
    const cells = setMatrixCellCost(built.cells, 'AP', 1, 'abc');
    const { errors } = diffMealOccupancyMatrix({
      cells,
      byMeal: built.byMeal,
      anchor: springMap,
    });
    expect(errors[0]).toMatch(/AP 1A/);
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
});
