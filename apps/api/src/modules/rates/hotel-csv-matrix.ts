/**
 * Hotel CSV meal×occupancy expand: one sheet row → EP/CP/MAP/AP sibling tips.
 */

import {
  buildAdultBandsFromHotelCsvRow,
  type AdultBand,
} from './occupancy-pricing';

export const HOTEL_CSV_MATRIX_MEALS = ['EP', 'CP', 'MAP', 'AP'] as const;
export type HotelCsvMatrixMeal = (typeof HOTEL_CSV_MATRIX_MEALS)[number];

export type HotelCsvMealCosts = {
  unitCost?: number | null;
  weekendUnitCost?: number | null;
  sglUnitCost?: number | null;
  sglWeekendUnitCost?: number | null;
  dblUnitCost?: number | null;
  dblWeekendUnitCost?: number | null;
  tplUnitCost?: number | null;
  tplWeekendUnitCost?: number | null;
};

export type HotelCsvMatrixMealTip = {
  mealPlan: HotelCsvMatrixMeal;
  unitCost: number;
  weekendUnitCost: number | null;
  adultBands: AdultBand[] | null;
};

function mealKey(meal: HotelCsvMatrixMeal): string {
  return meal.toLowerCase();
}

/** True when any meal-prefixed weekday column is set. */
export function hotelCsvRowHasMatrixMealColumns(
  row: Record<string, unknown>,
): boolean {
  for (const meal of HOTEL_CSV_MATRIX_MEALS) {
    const p = mealKey(meal);
    const keys = [
      `${p}UnitCost`,
      `${p}SglUnitCost`,
      `${p}DblUnitCost`,
      `${p}TplUnitCost`,
    ];
    for (const k of keys) {
      const v = row[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return true;
    }
  }
  return false;
}

function readMealCosts(
  row: Record<string, unknown>,
  meal: HotelCsvMatrixMeal,
): HotelCsvMealCosts {
  const p = mealKey(meal);
  const num = (k: string): number | null | undefined => {
    const v = row[k];
    if (v == null) return undefined;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    return null;
  };
  return {
    unitCost: num(`${p}UnitCost`),
    weekendUnitCost: num(`${p}WeekendUnitCost`),
    sglUnitCost: num(`${p}SglUnitCost`),
    sglWeekendUnitCost: num(`${p}SglWeekendUnitCost`),
    dblUnitCost: num(`${p}DblUnitCost`),
    dblWeekendUnitCost: num(`${p}DblWeekendUnitCost`),
    tplUnitCost: num(`${p}TplUnitCost`),
    tplWeekendUnitCost: num(`${p}TplWeekendUnitCost`),
  };
}

function mealHasWeekday(costs: HotelCsvMealCosts): boolean {
  return (
    costs.unitCost != null ||
    costs.sglUnitCost != null ||
    costs.dblUnitCost != null ||
    costs.tplUnitCost != null
  );
}

/**
 * Expand a CSV row with meal-prefixed columns into sibling tips.
 * Returns null when not in expand mode (no meal prefixes).
 * Returns [] when expand mode but every meal is blank (caller should skip).
 */
export function expandHotelCsvMatrixMeals(
  row: Record<string, unknown>,
): HotelCsvMatrixMealTip[] | null {
  if (!hotelCsvRowHasMatrixMealColumns(row)) return null;

  const tips: HotelCsvMatrixMealTip[] = [];
  for (const meal of HOTEL_CSV_MATRIX_MEALS) {
    const costs = readMealCosts(row, meal);
    if (!mealHasWeekday(costs)) continue;

    const chartUnit =
      costs.unitCost ??
      costs.dblUnitCost ??
      costs.sglUnitCost ??
      costs.tplUnitCost;
    if (chartUnit == null || !Number.isFinite(chartUnit) || chartUnit < 0) {
      continue;
    }

    const adultBands = buildAdultBandsFromHotelCsvRow({
      unitCost: chartUnit,
      weekendUnitCost: costs.weekendUnitCost,
      sglUnitCost: costs.sglUnitCost,
      sglWeekendUnitCost: costs.sglWeekendUnitCost,
      dblUnitCost: costs.dblUnitCost,
      dblWeekendUnitCost: costs.dblWeekendUnitCost,
      tplUnitCost: costs.tplUnitCost,
      tplWeekendUnitCost: costs.tplWeekendUnitCost,
    });

    const dblWeekend = adultBands?.find((b) => b.adults === 2)
      ?.weekendUnitCostPerNight;
    const weekendUnitCost =
      costs.weekendUnitCost ?? dblWeekend ?? null;

    tips.push({
      mealPlan: meal,
      unitCost: chartUnit,
      weekendUnitCost:
        weekendUnitCost != null && Number.isFinite(weekendUnitCost)
          ? weekendUnitCost
          : null,
      adultBands,
    });
  }
  return tips;
}
