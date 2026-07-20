/** Hotel rate version labels (mirrors API hotel-rate-version). */

import {
  formatHotelRateTipDiffCue,
  formatRateVersionHistoryLine,
  rateVersionLabel,
  type RateVersionListItem,
} from './rateVersion';

export const hotelRateVersionLabel = rateVersionLabel;

export type HotelRateVersionListItem = RateVersionListItem;

export function formatHotelRateVersionHistoryLine(
  row: HotelRateVersionListItem,
  opts?: { formatAmount?: (n: number) => string },
): string {
  return formatRateVersionHistoryLine(row, { kind: 'hotel', ...opts });
}

export { formatHotelRateTipDiffCue };

export type HotelRateTipDiffRow = {
  field: string;
  thisTip: string;
  current: string;
};

const TIP_DIFF_CHANGE_ORDER = [
  'weekday cost',
  'weekend cost',
  'meal plan',
  'room type',
  'dates',
  'occupancy',
] as const;

function tipMoneyDisplay(
  v: unknown,
  formatAmount?: (n: number) => string,
): string {
  if (v == null || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  if (formatAmount) return formatAmount(n);
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function tipDateKey(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return '';
}

function tipDatesDisplay(
  start: unknown,
  end: unknown,
): string {
  const s = tipDateKey(start);
  const e = tipDateKey(end);
  if (!s && !e) return '—';
  if (s && e) return `${s} → ${e}`;
  return s || e;
}

function tipTextDisplay(v: unknown, empty = '—'): string {
  if (typeof v !== 'string') return empty;
  const t = v.trim();
  return t || empty;
}

/** Compact occupancy cue for Diff table (not a full editor dump). */
export function formatHotelOccupancyDiffValue(raw: unknown): string {
  if (raw == null) return '—';
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'set';
  const o = raw as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.nationality === 'string' && o.nationality.trim()) {
    parts.push(o.nationality.trim().toUpperCase());
  }
  if (Array.isArray(o.adultBands) && o.adultBands.length) {
    parts.push(`${o.adultBands.length} band${o.adultBands.length === 1 ? '' : 's'}`);
  }
  if (o.baseAdults != null && Number.isFinite(Number(o.baseAdults))) {
    parts.push(`base ${o.baseAdults}`);
  }
  if (Array.isArray(o.dateSupplements) && o.dateSupplements.length) {
    parts.push(`${o.dateSupplements.length} gala`);
  }
  return parts.length ? parts.join(' · ') : 'set';
}

/** Whether History should offer a Diff expand for this prior tip. */
export function showHotelRateTipDiffExpand(
  item: Pick<HotelRateVersionListItem, 'isActive' | 'diffVsActive'> | null | undefined,
): boolean {
  if (!item || item.isActive) return false;
  return Boolean(formatHotelRateTipDiffCue(item.diffVsActive));
}

/**
 * Side-by-side Diff rows for changed commercial fields (prior tip vs active).
 * Only includes labels present in `changes` (from API `diffVsActive`).
 */
export function buildHotelRateTipDiffRows(
  prior: Pick<
    HotelRateVersionListItem,
    | 'unitCost'
    | 'weekendUnitCost'
    | 'mealPlan'
    | 'roomType'
    | 'startDate'
    | 'endDate'
    | 'occupancyPricingJson'
  >,
  active: Pick<
    HotelRateVersionListItem,
    | 'unitCost'
    | 'weekendUnitCost'
    | 'mealPlan'
    | 'roomType'
    | 'startDate'
    | 'endDate'
    | 'occupancyPricingJson'
  > | null | undefined,
  changes: string[] | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): HotelRateTipDiffRow[] {
  if (!active || !changes?.length) return [];
  const wanted = new Set(
    changes.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );
  const rows: HotelRateTipDiffRow[] = [];
  for (const label of TIP_DIFF_CHANGE_ORDER) {
    if (!wanted.has(label)) continue;
    switch (label) {
      case 'weekday cost':
        rows.push({
          field: 'Weekday cost',
          thisTip: tipMoneyDisplay(prior.unitCost, opts?.formatAmount),
          current: tipMoneyDisplay(active.unitCost, opts?.formatAmount),
        });
        break;
      case 'weekend cost':
        rows.push({
          field: 'Weekend cost',
          thisTip: tipMoneyDisplay(prior.weekendUnitCost, opts?.formatAmount),
          current: tipMoneyDisplay(active.weekendUnitCost, opts?.formatAmount),
        });
        break;
      case 'meal plan':
        rows.push({
          field: 'Meal plan',
          thisTip: tipTextDisplay(prior.mealPlan, 'Any meal'),
          current: tipTextDisplay(active.mealPlan, 'Any meal'),
        });
        break;
      case 'room type':
        rows.push({
          field: 'Room type',
          thisTip: tipTextDisplay(prior.roomType),
          current: tipTextDisplay(active.roomType),
        });
        break;
      case 'dates':
        rows.push({
          field: 'Dates',
          thisTip: tipDatesDisplay(prior.startDate, prior.endDate),
          current: tipDatesDisplay(active.startDate, active.endDate),
        });
        break;
      case 'occupancy':
        rows.push({
          field: 'Occupancy',
          thisTip: formatHotelOccupancyDiffValue(prior.occupancyPricingJson),
          current: formatHotelOccupancyDiffValue(active.occupancyPricingJson),
        });
        break;
      default:
        break;
    }
  }
  return rows;
}
