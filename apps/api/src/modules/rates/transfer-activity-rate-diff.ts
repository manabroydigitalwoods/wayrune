/** Thin tip-vs-active diff for transfer fare + activity rate History. */

export type CommercialTipDiff = {
  changes: string[];
  /** Compact one-liner, or null when identical. */
  summary: string | null;
};

function moneyKey(v: unknown): string {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '';
}

function dateKey(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return '';
}

function summarize(changes: string[]): CommercialTipDiff {
  if (!changes.length) return { changes: [], summary: null };
  const summary =
    changes.length <= 3
      ? changes.join(' · ')
      : `${changes.slice(0, 2).join(' · ')} +${changes.length - 2} more`;
  return { changes, summary };
}

export type TransferFareTipSnapshot = {
  unitCost?: number | string | null;
  childUnitCost?: number | string | null;
  infantUnitCost?: number | string | null;
  pricingMode?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

export function diffTransferFareTips(
  prior: TransferFareTipSnapshot,
  active: TransferFareTipSnapshot,
): CommercialTipDiff {
  const changes: string[] = [];
  if (moneyKey(prior.unitCost) !== moneyKey(active.unitCost)) {
    changes.push('adult cost');
  }
  if (moneyKey(prior.childUnitCost) !== moneyKey(active.childUnitCost)) {
    changes.push('child cost');
  }
  if (moneyKey(prior.infantUnitCost) !== moneyKey(active.infantUnitCost)) {
    changes.push('infant cost');
  }
  if ((prior.pricingMode || '').trim() !== (active.pricingMode || '').trim()) {
    changes.push('pricing mode');
  }
  if (
    dateKey(prior.startDate) !== dateKey(active.startDate) ||
    dateKey(prior.endDate) !== dateKey(active.endDate)
  ) {
    changes.push('dates');
  }
  return summarize(changes);
}

export type ActivityRateTipSnapshot = {
  unitCost?: number | string | null;
  adultUnitCost?: number | string | null;
  childUnitCost?: number | string | null;
  privateOrSic?: string | null;
  activityName?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

export function diffActivityRateTips(
  prior: ActivityRateTipSnapshot,
  active: ActivityRateTipSnapshot,
): CommercialTipDiff {
  const changes: string[] = [];
  const priorAdult = prior.adultUnitCost ?? prior.unitCost;
  const activeAdult = active.adultUnitCost ?? active.unitCost;
  if (moneyKey(priorAdult) !== moneyKey(activeAdult)) {
    changes.push('adult cost');
  }
  if (moneyKey(prior.childUnitCost) !== moneyKey(active.childUnitCost)) {
    changes.push('child cost');
  }
  if ((prior.privateOrSic || '').trim() !== (active.privateOrSic || '').trim()) {
    changes.push('private/SIC');
  }
  if ((prior.activityName || '').trim() !== (active.activityName || '').trim()) {
    changes.push('activity name');
  }
  if (
    dateKey(prior.startDate) !== dateKey(active.startDate) ||
    dateKey(prior.endDate) !== dateKey(active.endDate)
  ) {
    changes.push('dates');
  }
  return summarize(changes);
}
