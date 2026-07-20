/** Merge one commercial field from a prior hotel tip onto the active tip. */

export type HotelRateRestorableField =
  | 'unitCost'
  | 'weekendUnitCost'
  | 'mealPlan'
  | 'startDate'
  | 'endDate'
  | 'dates';

export const HOTEL_RATE_RESTORABLE_FIELDS: HotelRateRestorableField[] = [
  'unitCost',
  'weekendUnitCost',
  'mealPlan',
  'startDate',
  'endDate',
  'dates',
];

/** Diff change label → restorable field key (occupancy / room type not in thin v1). */
export function hotelRateDiffChangeToRestorableField(
  changeLabel: string,
): HotelRateRestorableField | null {
  const key = changeLabel.trim().toLowerCase();
  switch (key) {
    case 'weekday cost':
      return 'unitCost';
    case 'weekend cost':
      return 'weekendUnitCost';
    case 'meal plan':
      return 'mealPlan';
    case 'dates':
      return 'dates';
    default:
      return null;
  }
}

export type HotelRateFieldRestoreSnapshot = {
  unitCost?: number | string | null;
  weekendUnitCost?: number | string | null;
  mealPlan?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

export function isHotelRateRestorableField(
  field: string,
): field is HotelRateRestorableField {
  return (HOTEL_RATE_RESTORABLE_FIELDS as string[]).includes(field);
}

/**
 * Copy one field (or both date bounds) from `prior` onto a clone of `active`.
 * Other commercial fields stay from active.
 */
export function mergeHotelRateFieldFromPrior<T extends HotelRateFieldRestoreSnapshot>(
  active: T,
  prior: HotelRateFieldRestoreSnapshot,
  field: HotelRateRestorableField,
): T {
  const next = { ...active };
  switch (field) {
    case 'unitCost':
      next.unitCost = prior.unitCost ?? null;
      break;
    case 'weekendUnitCost':
      next.weekendUnitCost = prior.weekendUnitCost ?? null;
      break;
    case 'mealPlan':
      next.mealPlan = prior.mealPlan ?? null;
      break;
    case 'startDate':
      next.startDate = prior.startDate ?? null;
      break;
    case 'endDate':
      next.endDate = prior.endDate ?? null;
      break;
    case 'dates':
      next.startDate = prior.startDate ?? null;
      next.endDate = prior.endDate ?? null;
      break;
    default:
      break;
  }
  return next;
}
