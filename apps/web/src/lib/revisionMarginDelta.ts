/**
 * Revision margin delta — draft vs prior version (or trip accepted).
 * Uses the same skip-null line math as TripWorkspacePage Pricing summary.
 */

export type QuoteCommercialSnapshot = {
  costTotal: number;
  sellExTax: number;
  sellTotal: number;
  marginAmount: number;
  marginPercent: number;
  /** True when any line is missing buy or sell. */
  incomplete: boolean;
};

export type RevisionBaselineSource = 'prior_version' | 'accepted';

export type RevisionBaselineVersion = {
  id: string;
  versionNumber?: number | null;
  status?: string | null;
  label?: string | null;
  costHidden?: boolean;
  costTotal?: number | string | null;
  sellTotal?: number | string | null;
  marginAmount?: number | string | null;
  marginPercent?: number | string | null;
  itemsJson?: unknown;
};

export type QuoteLineForTotals = {
  quantity: number;
  unitCost: number | null | undefined;
  unitSell: number | null | undefined;
  taxPercent?: number | null;
};

function num(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(n) ? n : null;
}

/** Live Pricing summary math (null lines skipped, not zeroed). */
export function commercialTotalsFromLines(
  items: QuoteLineForTotals[],
): QuoteCommercialSnapshot {
  let costTotal = 0;
  let sellExTax = 0;
  let taxTotal = 0;
  let missingCost = false;
  let missingSell = false;
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const taxPct = Number(item.taxPercent) || 0;
    if (item.unitCost == null) missingCost = true;
    else costTotal += qty * item.unitCost;
    if (item.unitSell == null) missingSell = true;
    else {
      const lineSell = qty * item.unitSell;
      sellExTax += lineSell;
      taxTotal += lineSell * (taxPct / 100);
    }
  }
  const sellTotal = sellExTax + taxTotal;
  const marginAmount = sellExTax - costTotal;
  const marginPercent = sellExTax > 0 ? (marginAmount / sellExTax) * 100 : 0;
  return {
    costTotal,
    sellExTax,
    sellTotal,
    marginAmount,
    marginPercent,
    incomplete: items.length > 0 && (missingCost || missingSell),
  };
}

function linesFromItemsJson(itemsJson: unknown): QuoteLineForTotals[] {
  if (!Array.isArray(itemsJson)) return [];
  return itemsJson.map((raw) => {
    const item = raw as Record<string, unknown>;
    const unmatched = Boolean(item.rateUnmatched);
    const parseMoney = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      if (n === 0 && unmatched) return null;
      return n;
    };
    return {
      quantity: Number(item.quantity) || 0,
      unitCost: parseMoney(item.unitCost),
      unitSell: parseMoney(item.unitSell),
      taxPercent: Number(item.taxPercent) || 0,
    };
  });
}

/**
 * Prefer recomputing from itemsJson (parity with live draft).
 * Fall back to persisted cost/sell/margin when items are unavailable.
 */
export function commercialTotalsFromVersion(
  version: RevisionBaselineVersion | null | undefined,
): QuoteCommercialSnapshot | null {
  if (!version || version.costHidden) return null;
  const fromItems = linesFromItemsJson(version.itemsJson);
  if (fromItems.length > 0) {
    return commercialTotalsFromLines(fromItems);
  }
  const costTotal = num(version.costTotal);
  const sellTotal = num(version.sellTotal);
  const marginAmount = num(version.marginAmount);
  const marginPercent = num(version.marginPercent);
  if (costTotal == null || sellTotal == null) return null;
  // API margin is ex-tax: sellSubtotal ≈ cost + margin (discount ignored).
  const sellExTax =
    marginAmount != null ? costTotal + marginAmount : sellTotal;
  return {
    costTotal,
    sellExTax,
    sellTotal,
    marginAmount: marginAmount ?? sellExTax - costTotal,
    marginPercent:
      marginPercent ?? (sellExTax > 0 ? ((sellExTax - costTotal) / sellExTax) * 100 : 0),
    incomplete: false,
  };
}

export function resolveRevisionBaseline(input: {
  versions: RevisionBaselineVersion[];
  selectedVersionId: string | null | undefined;
  /** Accepted versions across the trip (any quotation). */
  tripAcceptedVersions?: RevisionBaselineVersion[];
}): {
  baseline: RevisionBaselineVersion;
  source: RevisionBaselineSource;
} | null {
  const selectedId = input.selectedVersionId || null;
  const selected = selectedId
    ? input.versions.find((v) => v.id === selectedId)
    : null;
  if (selected) {
    const prior = input.versions
      .filter(
        (v) =>
          v.id !== selected.id &&
          Number(v.versionNumber) < Number(selected.versionNumber),
      )
      .sort(
        (a, b) => Number(b.versionNumber) - Number(a.versionNumber),
      )[0];
    if (prior) {
      return { baseline: prior, source: 'prior_version' };
    }
  }

  const accepted = (input.tripAcceptedVersions || []).filter(
    (v) => v.status === 'accepted' && v.id !== selectedId,
  );
  if (accepted.length) {
    // Prefer most recent by versionNumber when comparable; else first.
    const picked = [...accepted].sort(
      (a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0),
    )[0];
    if (picked) return { baseline: picked, source: 'accepted' };
  }

  // New QT from accepted/clone often has a single v1 — still try label cue
  // with any other version on the same quotation list that isn't selected.
  const other = input.versions.find((v) => v.id !== selectedId);
  if (other && (selected?.label || '').toLowerCase().includes('from accepted')) {
    // Without trip accepted payload, no baseline.
    return null;
  }
  return null;
}

export type RevisionMarginDelta = {
  before: QuoteCommercialSnapshot;
  after: QuoteCommercialSnapshot;
  deltaCost: number;
  deltaSellExTax: number;
  deltaSellTotal: number;
  deltaMarginAmount: number;
  deltaMarginPp: number;
  source: RevisionBaselineSource;
  baselineLabel: string;
  visible: boolean;
};

export function buildRevisionMarginDelta(input: {
  before: QuoteCommercialSnapshot | null;
  after: QuoteCommercialSnapshot | null;
  source: RevisionBaselineSource | null;
  baselineLabel?: string;
  canViewCost: boolean;
}): RevisionMarginDelta | null {
  if (!input.canViewCost || !input.before || !input.after || !input.source) {
    return null;
  }
  return {
    before: input.before,
    after: input.after,
    deltaCost: input.after.costTotal - input.before.costTotal,
    deltaSellExTax: input.after.sellExTax - input.before.sellExTax,
    deltaSellTotal: input.after.sellTotal - input.before.sellTotal,
    deltaMarginAmount: input.after.marginAmount - input.before.marginAmount,
    deltaMarginPp: input.after.marginPercent - input.before.marginPercent,
    source: input.source,
    baselineLabel: input.baselineLabel || (input.source === 'accepted' ? 'Accepted' : 'Prior version'),
    visible: true,
  };
}

export function signedMoneyDelta(n: number): { sign: '+' | '−' | ''; abs: number } {
  if (Math.abs(n) < 0.005) return { sign: '', abs: 0 };
  return { sign: n > 0 ? '+' : '−', abs: Math.abs(n) };
}

export function signedPpDelta(n: number): { sign: '+' | '−' | ''; abs: number } {
  if (Math.abs(n) < 0.05) return { sign: '', abs: 0 };
  return { sign: n > 0 ? '+' : '−', abs: Math.abs(n) };
}
