/** Clone a hotel rate row as a sister meal plan (same season window + occupancy). */

const MEAL_ORDER = ['EP', 'CP', 'MAP', 'AP'] as const;

/** Relative buy index vs MAP — used only to nudge costs when copying meal plans. */
const MEAL_COST_INDEX: Record<string, number> = {
  EP: 0.82,
  CP: 0.9,
  MAP: 1,
  AP: 1.2,
};

export function normalizeMealPlanCode(raw: string | null | undefined): string {
  const c = String(raw || '')
    .trim()
    .toUpperCase();
  return c || 'MAP';
}

/** Next meal in EP→CP→MAP→AP cycle (skipping current). */
export function nextMealPlanForClone(current: string | null | undefined): string {
  const c = normalizeMealPlanCode(current);
  const i = MEAL_ORDER.indexOf(c as (typeof MEAL_ORDER)[number]);
  if (i < 0) return 'CP';
  return MEAL_ORDER[(i + 1) % MEAL_ORDER.length]!;
}

export function scaleCostForMealPlan(
  cost: number,
  fromMeal: string | null | undefined,
  toMeal: string | null | undefined,
): number {
  if (!Number.isFinite(cost) || cost < 0) return 0;
  const from = MEAL_COST_INDEX[normalizeMealPlanCode(fromMeal)] ?? 1;
  const to = MEAL_COST_INDEX[normalizeMealPlanCode(toMeal)] ?? 1;
  if (!(from > 0)) return Math.round(cost);
  return Math.round((cost * to) / from);
}

export type HotelRateMealCloneSource = {
  mealPlan?: string | null;
  unitCost: number | string;
  weekendUnitCost?: number | string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  roomType?: string | null;
  roomProductId?: string | null;
  roomProduct?: { id?: string | null; name?: string | null } | null;
  contractId?: string | null;
  place?: { id: string; name: string; kind?: string } | null;
  occupancyPricingJson?: unknown;
};

export type HotelRateMealCloneForm = {
  mealPlan: string;
  unitCost: string;
  weekendUnitCost: string;
  startDate: string;
  endDate: string;
  roomType: string;
  roomProductId: string;
  contractId: string;
  place: { placeId: string; name: string; kind?: string } | null;
  /** Scaled adult-band unit costs when present on source. */
  adultBandRows?: Array<{
    adults: 1 | 2 | 3;
    unitCost: string;
    weekendUnitCost: string;
  }>;
  extraAdultPerNight?: string;
  childWithBedPerNight?: string;
  childWithoutBedPerNight?: string;
};

function isoDate(raw?: string | Date | null): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  return raw.toISOString().slice(0, 10);
}

function scaleMoneyField(
  raw: string | number | null | undefined,
  fromMeal: string,
  toMeal: string,
): string {
  if (raw == null || raw === '') return '';
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return '';
  return String(scaleCostForMealPlan(n, fromMeal, toMeal));
}

/**
 * Build create-form fields for a sister meal plan on the same season.
 * Keeps dates/room/contract/occupancy meta; nudges buy costs by meal index.
 */
export function cloneHotelRateFormForMealPlan(
  rate: HotelRateMealCloneSource,
  opts?: { mealPlan?: string; defaultContractId?: string },
): HotelRateMealCloneForm {
  const fromMeal = normalizeMealPlanCode(rate.mealPlan);
  const toMeal = normalizeMealPlanCode(
    opts?.mealPlan || nextMealPlanForClone(fromMeal),
  );
  const o =
    rate.occupancyPricingJson &&
    typeof rate.occupancyPricingJson === 'object' &&
    !Array.isArray(rate.occupancyPricingJson)
      ? (rate.occupancyPricingJson as Record<string, unknown>)
      : null;

  const adultBandRows: Array<{
    adults: 1 | 2 | 3;
    unitCost: string;
    weekendUnitCost: string;
  }> = [
    { adults: 1, unitCost: '', weekendUnitCost: '' },
    { adults: 2, unitCost: '', weekendUnitCost: '' },
    { adults: 3, unitCost: '', weekendUnitCost: '' },
  ];
  if (o && Array.isArray(o.adultBands)) {
    for (const row of o.adultBands) {
      if (!row || typeof row !== 'object') continue;
      const adults = Number((row as { adults?: unknown }).adults);
      const cost =
        (row as { unitCostPerNight?: unknown; unitCost?: unknown }).unitCostPerNight ??
        (row as { unitCost?: unknown }).unitCost;
      const weekend =
        (row as { weekendUnitCostPerNight?: unknown; weekendUnitCost?: unknown })
          .weekendUnitCostPerNight ??
        (row as { weekendUnitCost?: unknown }).weekendUnitCost;
      if (adults === 1 || adults === 2 || adults === 3) {
        const idx = adults - 1;
        adultBandRows[idx] = {
          adults,
          unitCost: scaleMoneyField(
            cost != null ? Number(cost) : '',
            fromMeal,
            toMeal,
          ),
          weekendUnitCost: scaleMoneyField(
            weekend != null ? Number(weekend) : '',
            fromMeal,
            toMeal,
          ),
        };
      }
    }
  }

  return {
    mealPlan: toMeal,
    unitCost: scaleMoneyField(rate.unitCost, fromMeal, toMeal) || '0',
    weekendUnitCost: scaleMoneyField(rate.weekendUnitCost, fromMeal, toMeal),
    startDate: isoDate(rate.startDate),
    endDate: isoDate(rate.endDate),
    roomType: rate.roomType || rate.roomProduct?.name || '',
    roomProductId: rate.roomProductId || rate.roomProduct?.id || '',
    contractId: rate.contractId || opts?.defaultContractId || '',
    place: rate.place
      ? {
          placeId: rate.place.id,
          name: rate.place.name,
          kind: rate.place.kind,
        }
      : null,
    adultBandRows,
    extraAdultPerNight: scaleMoneyField(
      o?.extraAdultPerNight != null ? Number(o.extraAdultPerNight) : '',
      fromMeal,
      toMeal,
    ),
    childWithBedPerNight: scaleMoneyField(
      o?.childWithBedPerNight != null ? Number(o.childWithBedPerNight) : '',
      fromMeal,
      toMeal,
    ),
    childWithoutBedPerNight: scaleMoneyField(
      o?.childWithoutBedPerNight != null ? Number(o.childWithoutBedPerNight) : '',
      fromMeal,
      toMeal,
    ),
  };
}
