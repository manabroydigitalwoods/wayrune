/**
 * Compact CP/MAP/AP × SGL/DBL/TPL matrix for hotel rate charts.
 * Meal stays on the season row; occupancy bands stay on occupancyPricingJson.
 */

import { normalizeHotelNationalityUi } from './hotelNationalityNote';

export const MEAL_MATRIX_PLANS = ['EP', 'CP', 'MAP', 'AP'] as const;
export type MealMatrixPlan = (typeof MEAL_MATRIX_PLANS)[number];

export const MATRIX_ADULT_BANDS = [1, 2, 3] as const;
export type MatrixAdultBand = (typeof MATRIX_ADULT_BANDS)[number];

export type MealOccupancyMatrixCell = {
  mealPlan: MealMatrixPlan;
  adults: MatrixAdultBand;
  unitCost: string;
  weekendUnitCost: string;
};

export type MealOccupancyMatrixRate = {
  id: string;
  mealPlan?: string | null;
  roomType?: string | null;
  roomProductId?: string | null;
  contractId?: string | null;
  placeId?: string | null;
  place?: { id: string } | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  unitCost: number | string;
  weekendUnitCost?: number | string | null;
  occupancyPricingJson?: unknown;
};

export type MealOccupancyMatrixSeason = {
  roomType: string | null;
  roomProductId: string | null;
  contractId: string | null;
  placeId: string | null;
  startDate: string;
  endDate: string;
};

export type MealOccupancyMatrixBand = {
  adults: number;
  unitCostPerNight: number;
  weekendUnitCostPerNight?: number;
};

export type MealOccupancyMatrixUpsert = {
  mealPlan: MealMatrixPlan;
  existingId: string | null;
  unitCost: number;
  weekendUnitCost: number | null;
  adultBands: MealOccupancyMatrixBand[];
  /** True when adult bands or chart unitCost differ from existing. */
  changed: boolean;
};

export type MealOccupancyMatrixDelete = {
  mealPlan: MealMatrixPlan;
  existingId: string;
};

function isoDate(raw?: string | Date | null): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  return raw.toISOString().slice(0, 10);
}

export function normalizeMatrixMealPlan(
  raw: string | null | undefined,
): MealMatrixPlan | null {
  const c = String(raw || '')
    .trim()
    .toUpperCase();
  return (MEAL_MATRIX_PLANS as readonly string[]).includes(c)
    ? (c as MealMatrixPlan)
    : null;
}

/** Season family key — same room + contract + place + date window + nationality market. */
export function hotelRateSeasonKey(rate: {
  roomType?: string | null;
  roomProductId?: string | null;
  contractId?: string | null;
  placeId?: string | null;
  place?: { id: string } | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  occupancyPricingJson?: unknown;
}): string {
  const placeId = rate.placeId || rate.place?.id || '';
  const room =
    rate.roomProductId?.trim() ||
    (rate.roomType || '').trim().toLowerCase() ||
    '';
  const natRaw =
    rate.occupancyPricingJson &&
    typeof rate.occupancyPricingJson === 'object' &&
    !Array.isArray(rate.occupancyPricingJson) &&
    typeof (rate.occupancyPricingJson as { nationality?: unknown }).nationality ===
      'string'
      ? String(
          (rate.occupancyPricingJson as { nationality: string }).nationality,
        )
      : '';
  const nat = normalizeHotelNationalityUi(natRaw);
  return [
    room,
    rate.contractId || '',
    placeId,
    isoDate(rate.startDate),
    isoDate(rate.endDate),
    nat,
  ].join('|');
}

export function emptyMealOccupancyMatrixCells(): MealOccupancyMatrixCell[] {
  const cells: MealOccupancyMatrixCell[] = [];
  for (const mealPlan of MEAL_MATRIX_PLANS) {
    for (const adults of MATRIX_ADULT_BANDS) {
      cells.push({ mealPlan, adults, unitCost: '', weekendUnitCost: '' });
    }
  }
  return cells;
}

type BandCosts = { unitCost: number; weekendUnitCost?: number };

function adultBandsFromOccupancy(raw: unknown): Map<number, BandCosts> {
  const map = new Map<number, BandCosts>();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map;
  const bands = (raw as { adultBands?: unknown }).adultBands;
  if (!Array.isArray(bands)) return map;
  for (const row of bands) {
    if (!row || typeof row !== 'object') continue;
    const adults = Number((row as { adults?: unknown }).adults);
    const cost = Number(
      (row as { unitCostPerNight?: unknown; unitCost?: unknown })
        .unitCostPerNight ?? (row as { unitCost?: unknown }).unitCost,
    );
    if (
      !(adults === 1 || adults === 2 || adults === 3) ||
      !Number.isFinite(cost) ||
      cost < 0
    ) {
      continue;
    }
    const weekend = moneyField(
      (row as { weekendUnitCostPerNight?: unknown; weekendUnitCost?: unknown })
        .weekendUnitCostPerNight ??
        (row as { weekendUnitCost?: unknown }).weekendUnitCost,
    );
    map.set(adults, {
      unitCost: cost,
      ...(weekend != null ? { weekendUnitCost: weekend } : {}),
    });
  }
  return map;
}

/**
 * Build editable cells for a season family, using the anchor rate's siblings.
 * When a meal row has no adultBands, DBL is seeded from chart unitCost.
 */
export function buildMealOccupancyMatrix(
  rates: MealOccupancyMatrixRate[],
  anchor: MealOccupancyMatrixRate,
): {
  season: MealOccupancyMatrixSeason;
  cells: MealOccupancyMatrixCell[];
  byMeal: Partial<Record<MealMatrixPlan, MealOccupancyMatrixRate>>;
} {
  const key = hotelRateSeasonKey(anchor);
  const siblings = rates.filter((r) => hotelRateSeasonKey(r) === key);
  const byMeal: Partial<Record<MealMatrixPlan, MealOccupancyMatrixRate>> = {};
  for (const r of siblings) {
    const meal = normalizeMatrixMealPlan(r.mealPlan);
    if (!meal) continue;
    byMeal[meal] = r;
  }

  const cells = emptyMealOccupancyMatrixCells().map((cell) => {
    const rate = byMeal[cell.mealPlan];
    if (!rate) return cell;
    const bands = adultBandsFromOccupancy(rate.occupancyPricingJson);
    if (bands.has(cell.adults)) {
      const band = bands.get(cell.adults)!;
      return {
        ...cell,
        unitCost: String(band.unitCost),
        weekendUnitCost:
          band.weekendUnitCost != null ? String(band.weekendUnitCost) : '',
      };
    }
    if (cell.adults === 2 && bands.size === 0) {
      const n = Number(rate.unitCost);
      if (Number.isFinite(n) && n >= 0) {
        const w =
          rate.weekendUnitCost != null && rate.weekendUnitCost !== ''
            ? Number(rate.weekendUnitCost)
            : null;
        return {
          ...cell,
          unitCost: String(n),
          weekendUnitCost:
            w != null && Number.isFinite(w) && w >= 0 ? String(w) : '',
        };
      }
    }
    return cell;
  });

  return {
    season: {
      roomType: anchor.roomType?.trim() || null,
      roomProductId: anchor.roomProductId || null,
      contractId: anchor.contractId || null,
      placeId: anchor.placeId || anchor.place?.id || null,
      startDate: isoDate(anchor.startDate),
      endDate: isoDate(anchor.endDate),
    },
    cells,
    byMeal,
  };
}

function parseCellCost(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function bandsWeekdayEqual(
  a: MealOccupancyMatrixBand[],
  b: MealOccupancyMatrixBand[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i]!.adults !== b[i]!.adults ||
      a[i]!.unitCostPerNight !== b[i]!.unitCostPerNight
    ) {
      return false;
    }
  }
  return true;
}

/** True when an explicitly filled weekend differs from existing band weekend. */
function weekendBandsChanged(
  edited: MealOccupancyMatrixBand[],
  existing: MealOccupancyMatrixBand[],
): boolean {
  for (const b of edited) {
    if (b.weekendUnitCostPerNight == null) continue;
    const prior = existing.find((e) => e.adults === b.adults);
    if (prior?.weekendUnitCostPerNight !== b.weekendUnitCostPerNight) {
      return true;
    }
  }
  return false;
}

/**
 * Diff edited cells against existing sibling rates.
 * Empty meal rows with a sibling → delete (except the open/anchor tip).
 * Blank weekend = preserve prior / ratio-stamp (season-form semantics).
 */
export function diffMealOccupancyMatrix(opts: {
  cells: MealOccupancyMatrixCell[];
  byMeal: Partial<Record<MealMatrixPlan, MealOccupancyMatrixRate>>;
  /** Anchor used for weekend ratio on creates; cannot be matrix-deleted. */
  anchor: MealOccupancyMatrixRate;
}): {
  upserts: MealOccupancyMatrixUpsert[];
  deletes: MealOccupancyMatrixDelete[];
  errors: string[];
} {
  const errors: string[] = [];
  const upserts: MealOccupancyMatrixUpsert[] = [];
  const deletes: MealOccupancyMatrixDelete[] = [];
  const anchorMeal = normalizeMatrixMealPlan(opts.anchor.mealPlan);
  const anchorCost = Number(opts.anchor.unitCost);
  const anchorWeekend =
    opts.anchor.weekendUnitCost != null && opts.anchor.weekendUnitCost !== ''
      ? Number(opts.anchor.weekendUnitCost)
      : null;
  const weekendRatio =
    Number.isFinite(anchorCost) &&
    anchorCost > 0 &&
    anchorWeekend != null &&
    Number.isFinite(anchorWeekend) &&
    anchorWeekend >= 0
      ? anchorWeekend / anchorCost
      : null;

  for (const meal of MEAL_MATRIX_PLANS) {
    const mealCells = opts.cells.filter((c) => c.mealPlan === meal);
    const adultBands: MealOccupancyMatrixBand[] = [];
    for (const cell of mealCells) {
      const weekdayRaw = cell.unitCost.trim();
      const weekendRaw = cell.weekendUnitCost.trim();
      if (!weekdayRaw && !weekendRaw) continue;
      if (!weekdayRaw) {
        errors.push(
          `${meal} ${cell.adults}A needs a weekday cost before weekend`,
        );
        continue;
      }
      const n = parseCellCost(weekdayRaw);
      if (n == null) {
        errors.push(`${meal} ${cell.adults}A must be a valid cost`);
        continue;
      }
      const weekend = weekendRaw ? parseCellCost(weekendRaw) : null;
      if (weekendRaw && weekend == null) {
        errors.push(`${meal} ${cell.adults}A weekend must be a valid cost`);
        continue;
      }
      adultBands.push({
        adults: cell.adults,
        unitCostPerNight: n,
        ...(weekend != null ? { weekendUnitCostPerNight: weekend } : {}),
      });
    }
    const existing = opts.byMeal[meal] ?? null;
    if (!adultBands.length) {
      if (!existing) continue;
      if (existing.id === opts.anchor.id || meal === anchorMeal) {
        errors.push(
          `Cannot clear ${meal} — that is the open tip. Delete the rate row instead`,
        );
        continue;
      }
      deletes.push({ mealPlan: meal, existingId: existing.id });
      continue;
    }

    const dbl = adultBands.find((b) => b.adults === 2)?.unitCostPerNight;
    const unitCost = dbl ?? adultBands[0]!.unitCostPerNight;
    const weekendUnitCost =
      weekendRatio != null
        ? Math.round(unitCost * weekendRatio)
        : existing?.weekendUnitCost != null && existing.weekendUnitCost !== ''
          ? Number(existing.weekendUnitCost)
          : null;

    const existingBands: MealOccupancyMatrixBand[] = existing
      ? [...adultBandsFromOccupancy(existing.occupancyPricingJson).entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([adults, costs]) => ({
            adults,
            unitCostPerNight: costs.unitCost,
            ...(costs.weekendUnitCost != null
              ? { weekendUnitCostPerNight: costs.weekendUnitCost }
              : {}),
          }))
      : [];
    const existingUnit = existing != null ? Number(existing.unitCost) : null;
    const changed =
      !existing ||
      !bandsWeekdayEqual(adultBands, existingBands) ||
      existingUnit !== unitCost ||
      weekendBandsChanged(adultBands, existingBands);

    upserts.push({
      mealPlan: meal,
      existingId: existing?.id ?? null,
      unitCost,
      weekendUnitCost:
        weekendUnitCost != null && Number.isFinite(weekendUnitCost)
          ? weekendUnitCost
          : null,
      adultBands,
      changed,
    });
  }

  return { upserts, deletes, errors };
}

/** Count cells with a weekday cost — for empty-state / toast. */
export function countFilledMatrixCells(cells: MealOccupancyMatrixCell[]): number {
  return cells.filter((c) => c.unitCost.trim()).length;
}

export function setMatrixCellCost(
  cells: MealOccupancyMatrixCell[],
  mealPlan: MealMatrixPlan,
  adults: MatrixAdultBand,
  unitCost: string,
): MealOccupancyMatrixCell[] {
  return cells.map((c) =>
    c.mealPlan === mealPlan && c.adults === adults ? { ...c, unitCost } : c,
  );
}

export function setMatrixCellWeekendCost(
  cells: MealOccupancyMatrixCell[],
  mealPlan: MealMatrixPlan,
  adults: MatrixAdultBand,
  weekendUnitCost: string,
): MealOccupancyMatrixCell[] {
  return cells.map((c) =>
    c.mealPlan === mealPlan && c.adults === adults
      ? { ...c, weekendUnitCost }
      : c,
  );
}

/**
 * Merge adultBands into existing occupancy JSON (preserve extras / gala).
 * When weekday-only bands are supplied, keep prior weekend-per-band if present;
 * else stamp weekend from ratio when provided.
 */
export function occupancyJsonWithAdultBands(
  existing: unknown,
  adultBands: Array<{
    adults: number;
    unitCostPerNight: number;
    weekendUnitCostPerNight?: number;
  }>,
  opts?: { weekendRatio?: number | null },
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : { baseAdults: 2, baseChildren: 0 };
  const priorRows =
    existing &&
    typeof existing === 'object' &&
    Array.isArray((existing as { adultBands?: unknown }).adultBands)
      ? ((existing as { adultBands: Array<Record<string, unknown>> }).adultBands)
      : [];
  const ratio =
    opts?.weekendRatio != null &&
    Number.isFinite(opts.weekendRatio) &&
    opts.weekendRatio > 0
      ? opts.weekendRatio
      : null;
  const merged = adultBands.map((b) => {
    if (b.weekendUnitCostPerNight != null) {
      return {
        adults: b.adults,
        unitCostPerNight: b.unitCostPerNight,
        weekendUnitCostPerNight: b.weekendUnitCostPerNight,
      };
    }
    const priorRow = priorRows.find((r) => Number(r?.adults) === b.adults);
    const priorWeekend = moneyField(
      priorRow?.weekendUnitCostPerNight ?? priorRow?.weekendUnitCost,
    );
    if (priorWeekend != null) {
      return {
        adults: b.adults,
        unitCostPerNight: b.unitCostPerNight,
        weekendUnitCostPerNight: priorWeekend,
      };
    }
    if (ratio != null) {
      return {
        adults: b.adults,
        unitCostPerNight: b.unitCostPerNight,
        weekendUnitCostPerNight: Math.round(b.unitCostPerNight * ratio),
      };
    }
    return {
      adults: b.adults,
      unitCostPerNight: b.unitCostPerNight,
    };
  });
  return {
    ...base,
    adultBands: merged,
  };
}

function moneyField(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
    const n = Number(v);
    return n >= 0 ? n : undefined;
  }
  return undefined;
}
