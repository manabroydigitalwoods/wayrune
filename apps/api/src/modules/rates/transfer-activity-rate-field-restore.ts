/** Merge one commercial field from a prior transfer/activity tip onto the active tip. */

export type TransferFareRestorableField =
  | 'unitCost'
  | 'childUnitCost'
  | 'infantUnitCost'
  | 'pricingMode'
  | 'startDate'
  | 'endDate'
  | 'dates';

export type ActivityRateRestorableField =
  | 'adultUnitCost'
  | 'childUnitCost'
  | 'privateOrSic'
  | 'activityName'
  | 'startDate'
  | 'endDate'
  | 'dates';

export const TRANSFER_FARE_RESTORABLE_FIELDS: TransferFareRestorableField[] = [
  'unitCost',
  'childUnitCost',
  'infantUnitCost',
  'pricingMode',
  'startDate',
  'endDate',
  'dates',
];

export const ACTIVITY_RATE_RESTORABLE_FIELDS: ActivityRateRestorableField[] = [
  'adultUnitCost',
  'childUnitCost',
  'privateOrSic',
  'activityName',
  'startDate',
  'endDate',
  'dates',
];

export function transferFareDiffChangeToRestorableField(
  changeLabel: string,
): TransferFareRestorableField | null {
  const key = changeLabel.trim().toLowerCase();
  switch (key) {
    case 'adult cost':
      return 'unitCost';
    case 'child cost':
      return 'childUnitCost';
    case 'infant cost':
      return 'infantUnitCost';
    case 'pricing mode':
      return 'pricingMode';
    case 'dates':
      return 'dates';
    default:
      return null;
  }
}

export function activityRateDiffChangeToRestorableField(
  changeLabel: string,
): ActivityRateRestorableField | null {
  const key = changeLabel.trim().toLowerCase();
  switch (key) {
    case 'adult cost':
      return 'adultUnitCost';
    case 'child cost':
      return 'childUnitCost';
    case 'private/sic':
      return 'privateOrSic';
    case 'activity name':
      return 'activityName';
    case 'dates':
      return 'dates';
    default:
      return null;
  }
}

export type TransferFareFieldRestoreSnapshot = {
  unitCost?: number | string | null;
  childUnitCost?: number | string | null;
  infantUnitCost?: number | string | null;
  pricingMode?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

export type ActivityRateFieldRestoreSnapshot = {
  adultUnitCost?: number | string | null;
  childUnitCost?: number | string | null;
  privateOrSic?: string | null;
  activityName?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

export function mergeTransferFareFieldFromPrior<
  T extends TransferFareFieldRestoreSnapshot,
>(
  active: T,
  prior: TransferFareFieldRestoreSnapshot,
  field: TransferFareRestorableField,
): T {
  const next = { ...active };
  switch (field) {
    case 'unitCost':
      next.unitCost = prior.unitCost ?? null;
      break;
    case 'childUnitCost':
      next.childUnitCost = prior.childUnitCost ?? null;
      break;
    case 'infantUnitCost':
      next.infantUnitCost = prior.infantUnitCost ?? null;
      break;
    case 'pricingMode':
      next.pricingMode = prior.pricingMode ?? null;
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

export function mergeActivityRateFieldFromPrior<
  T extends ActivityRateFieldRestoreSnapshot,
>(
  active: T,
  prior: ActivityRateFieldRestoreSnapshot,
  field: ActivityRateRestorableField,
): T {
  const next = { ...active };
  switch (field) {
    case 'adultUnitCost':
      next.adultUnitCost = prior.adultUnitCost ?? null;
      break;
    case 'childUnitCost':
      next.childUnitCost = prior.childUnitCost ?? null;
      break;
    case 'privateOrSic':
      next.privateOrSic = prior.privateOrSic ?? null;
      break;
    case 'activityName':
      next.activityName = prior.activityName ?? null;
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
