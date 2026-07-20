import { describe, expect, it } from 'vitest';
import {
  expandHotelCsvMatrixMeals,
  hotelCsvRowHasMatrixMealColumns,
} from './hotel-csv-matrix';

describe('hotel-csv-matrix', () => {
  it('detects meal-prefixed columns', () => {
    expect(hotelCsvRowHasMatrixMealColumns({ unitCost: 4500 })).toBe(false);
    expect(
      hotelCsvRowHasMatrixMealColumns({ mapUnitCost: 4500, unitCost: 1 }),
    ).toBe(true);
    expect(
      hotelCsvRowHasMatrixMealColumns({ cpSglUnitCost: 3200 }),
    ).toBe(true);
  });

  it('expands MAP+CP tips with bands and skips blank meals', () => {
    const tips = expandHotelCsvMatrixMeals({
      mapUnitCost: 4500,
      mapWeekendUnitCost: 5200,
      mapSglUnitCost: 3600,
      mapSglWeekendUnitCost: 4100,
      mapDblUnitCost: 4500,
      mapDblWeekendUnitCost: 5200,
      mapTplUnitCost: 5800,
      mapTplWeekendUnitCost: 6400,
      cpUnitCost: 4050,
      cpWeekendUnitCost: 4680,
      cpSglUnitCost: 3240,
      cpDblUnitCost: 4050,
      cpTplUnitCost: 5220,
    });
    expect(tips).not.toBeNull();
    expect(tips!.map((t) => t.mealPlan)).toEqual(['CP', 'MAP']);
    const map = tips!.find((t) => t.mealPlan === 'MAP')!;
    expect(map.unitCost).toBe(4500);
    expect(map.weekendUnitCost).toBe(5200);
    expect(map.adultBands).toEqual([
      { adults: 1, unitCostPerNight: 3600, weekendUnitCostPerNight: 4100 },
      { adults: 2, unitCostPerNight: 4500, weekendUnitCostPerNight: 5200 },
      { adults: 3, unitCostPerNight: 5800, weekendUnitCostPerNight: 6400 },
    ]);
    const cp = tips!.find((t) => t.mealPlan === 'CP')!;
    expect(cp.adultBands?.find((b) => b.adults === 1)?.unitCostPerNight).toBe(
      3240,
    );
  });

  it('returns null for legacy single-meal rows', () => {
    expect(
      expandHotelCsvMatrixMeals({
        mealPlan: 'MAP',
        unitCost: 4500,
        sglUnitCost: 3600,
      }),
    ).toBeNull();
  });

  it('skips meals that only have weekend without weekday', () => {
    const tips = expandHotelCsvMatrixMeals({
      mapUnitCost: 4500,
      epWeekendUnitCost: 4000,
    });
    expect(tips!.map((t) => t.mealPlan)).toEqual(['MAP']);
  });
});
