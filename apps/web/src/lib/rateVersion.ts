/** Shared rate tip version labels (hotel / transfer / activity). */

export function rateVersionLabel(versionNumber: number | null | undefined): string {
  const n = Math.max(1, Math.floor(Number(versionNumber) || 1));
  return `v${n}`;
}

export type RateVersionListItem = {
  id: string;
  versionNumber: number;
  supersedesId: string | null;
  isActive: boolean;
  /** Newest tip still inactive — awaiting rates.approve Activate. */
  pendingActivation?: boolean;
  unitCost?: number | string | null;
  weekendUnitCost?: number | string | null;
  childUnitCost?: number | string | null;
  infantUnitCost?: number | string | null;
  updatedAt?: string | Date | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  /** Hotel */
  mealPlan?: string | null;
  roomType?: string | null;
  occupancyPricingJson?: unknown;
  diffVsActive?: { summary: string | null; changes?: string[] } | null;
  /** Transfer */
  pricingMode?: string | null;
  /** Activity */
  activityName?: string | null;
  privateOrSic?: string | null;
};

/** Client-side pending tip: inactive tip with no child in the loaded family. */
export function hotelRateLooksPendingActivation(
  rate: {
    id: string;
    isActive: boolean;
    supersedesId?: string | null;
  },
  family: Array<{ id: string; supersedesId?: string | null }>,
): boolean {
  if (rate.isActive) return false;
  if (!rate.supersedesId) return false;
  return !family.some((r) => r.supersedesId === rate.id);
}

export type RateVersionTipDiffRow = {
  field: string;
  thisTip: string;
  current: string;
};

export function formatRateVersionHistoryLine(
  row: RateVersionListItem,
  opts?: {
    kind?: 'hotel' | 'transfer' | 'activity';
    formatAmount?: (n: number) => string;
  },
): string {
  const ver = rateVersionLabel(row.versionNumber);
  const cost = Number(row.unitCost);
  const amount =
    Number.isFinite(cost) && opts?.formatAmount
      ? opts.formatAmount(cost)
      : Number.isFinite(cost)
        ? `₹${Math.round(cost).toLocaleString('en-IN')}`
        : '';
  const state = row.pendingActivation
    ? 'pending activation'
    : row.isActive
      ? 'active'
      : 'superseded';
  const kind = opts?.kind ?? 'hotel';
  if (kind === 'hotel') {
    const meal = row.mealPlan?.trim() || 'Any meal';
    return [ver, meal, amount, state].filter(Boolean).join(' · ');
  }
  if (kind === 'transfer') {
    const mode = row.pricingMode?.trim() || 'fare';
    return [ver, mode, amount, state].filter(Boolean).join(' · ');
  }
  const name = row.activityName?.trim() || 'Activity';
  return [ver, name, amount, state].filter(Boolean).join(' · ');
}

export function formatRateVersionTipDiffCue(
  diff: { summary: string | null } | null | undefined,
): string | null {
  const s = diff?.summary?.trim();
  return s || null;
}

/** @deprecated Prefer formatRateVersionTipDiffCue */
export const formatHotelRateTipDiffCue = formatRateVersionTipDiffCue;

/** Whether History should offer a Diff expand for this prior tip. */
export function showRateVersionTipDiffExpand(
  item: Pick<RateVersionListItem, 'isActive' | 'diffVsActive'> | null | undefined,
): boolean {
  if (!item || item.isActive) return false;
  return Boolean(formatRateVersionTipDiffCue(item.diffVsActive));
}

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

function tipDatesDisplay(start: unknown, end: unknown): string {
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

const TRANSFER_DIFF_ORDER = [
  'adult cost',
  'child cost',
  'infant cost',
  'pricing mode',
  'dates',
] as const;

const ACTIVITY_DIFF_ORDER = [
  'adult cost',
  'child cost',
  'private/sic',
  'activity name',
  'dates',
] as const;

/** Side-by-side Diff rows for transfer fare tip changes. */
export function buildTransferFareTipDiffRows(
  prior: Pick<
    RateVersionListItem,
    | 'unitCost'
    | 'childUnitCost'
    | 'infantUnitCost'
    | 'pricingMode'
    | 'startDate'
    | 'endDate'
  >,
  active: Pick<
    RateVersionListItem,
    | 'unitCost'
    | 'childUnitCost'
    | 'infantUnitCost'
    | 'pricingMode'
    | 'startDate'
    | 'endDate'
  > | null | undefined,
  changes: string[] | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): RateVersionTipDiffRow[] {
  if (!active || !changes?.length) return [];
  const wanted = new Set(
    changes.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );
  const rows: RateVersionTipDiffRow[] = [];
  for (const label of TRANSFER_DIFF_ORDER) {
    if (!wanted.has(label)) continue;
    switch (label) {
      case 'adult cost':
        rows.push({
          field: 'Adult cost',
          thisTip: tipMoneyDisplay(prior.unitCost, opts?.formatAmount),
          current: tipMoneyDisplay(active.unitCost, opts?.formatAmount),
        });
        break;
      case 'child cost':
        rows.push({
          field: 'Child cost',
          thisTip: tipMoneyDisplay(prior.childUnitCost, opts?.formatAmount),
          current: tipMoneyDisplay(active.childUnitCost, opts?.formatAmount),
        });
        break;
      case 'infant cost':
        rows.push({
          field: 'Infant cost',
          thisTip: tipMoneyDisplay(prior.infantUnitCost, opts?.formatAmount),
          current: tipMoneyDisplay(active.infantUnitCost, opts?.formatAmount),
        });
        break;
      case 'pricing mode':
        rows.push({
          field: 'Pricing mode',
          thisTip: tipTextDisplay(prior.pricingMode, 'fare'),
          current: tipTextDisplay(active.pricingMode, 'fare'),
        });
        break;
      case 'dates':
        rows.push({
          field: 'Dates',
          thisTip: tipDatesDisplay(prior.startDate, prior.endDate),
          current: tipDatesDisplay(active.startDate, active.endDate),
        });
        break;
      default:
        break;
    }
  }
  return rows;
}

/** Side-by-side Diff rows for activity rate tip changes. */
export function buildActivityRateTipDiffRows(
  prior: Pick<
    RateVersionListItem,
    | 'unitCost'
    | 'childUnitCost'
    | 'privateOrSic'
    | 'activityName'
    | 'startDate'
    | 'endDate'
  >,
  active: Pick<
    RateVersionListItem,
    | 'unitCost'
    | 'childUnitCost'
    | 'privateOrSic'
    | 'activityName'
    | 'startDate'
    | 'endDate'
  > | null | undefined,
  changes: string[] | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): RateVersionTipDiffRow[] {
  if (!active || !changes?.length) return [];
  const wanted = new Set(
    changes.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );
  const rows: RateVersionTipDiffRow[] = [];
  for (const label of ACTIVITY_DIFF_ORDER) {
    if (!wanted.has(label)) continue;
    switch (label) {
      case 'adult cost':
        rows.push({
          field: 'Adult cost',
          thisTip: tipMoneyDisplay(prior.unitCost, opts?.formatAmount),
          current: tipMoneyDisplay(active.unitCost, opts?.formatAmount),
        });
        break;
      case 'child cost':
        rows.push({
          field: 'Child cost',
          thisTip: tipMoneyDisplay(prior.childUnitCost, opts?.formatAmount),
          current: tipMoneyDisplay(active.childUnitCost, opts?.formatAmount),
        });
        break;
      case 'private/sic':
        rows.push({
          field: 'Private / SIC',
          thisTip: tipTextDisplay(prior.privateOrSic),
          current: tipTextDisplay(active.privateOrSic),
        });
        break;
      case 'activity name':
        rows.push({
          field: 'Activity',
          thisTip: tipTextDisplay(prior.activityName, 'Activity'),
          current: tipTextDisplay(active.activityName, 'Activity'),
        });
        break;
      case 'dates':
        rows.push({
          field: 'Dates',
          thisTip: tipDatesDisplay(prior.startDate, prior.endDate),
          current: tipDatesDisplay(active.startDate, active.endDate),
        });
        break;
      default:
        break;
    }
  }
  return rows;
}
