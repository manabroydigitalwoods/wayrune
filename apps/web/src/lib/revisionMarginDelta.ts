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
 * When cost is redacted for the role (`costHidden`), still build a sell/tax
 * snapshot so revision Δ is visible to sales without quote.view_cost.
 */
export function commercialTotalsFromVersion(
  version: RevisionBaselineVersion | null | undefined,
): QuoteCommercialSnapshot | null {
  if (!version) return null;
  const fromItems = linesFromItemsJson(version.itemsJson);
  if (fromItems.length > 0) {
    return commercialTotalsFromLines(fromItems);
  }
  const sellTotal = num(version.sellTotal);
  if (version.costHidden) {
    if (sellTotal == null) return null;
    // Margin/cost unknown — sell-side comparison only.
    return {
      costTotal: 0,
      sellExTax: sellTotal,
      sellTotal,
      marginAmount: 0,
      marginPercent: 0,
      incomplete: true,
    };
  }
  const costTotal = num(version.costTotal);
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
  deltaTax: number;
  deltaMarginAmount: number;
  deltaMarginPp: number;
  source: RevisionBaselineSource;
  baselineLabel: string;
  changedLineSummaries: string[];
  /** False when staff lacks quote.view_cost — hide cost/margin cells. */
  showCost: boolean;
  visible: boolean;
};

export type RevisionLineSnapshot = {
  id?: string;
  description?: string;
  serviceType?: string;
  quantity: number;
  unitCost: number | null | undefined;
  unitSell: number | null | undefined;
  taxPercent?: number | null;
};

function lineKey(line: RevisionLineSnapshot): string {
  return (
    line.id?.trim() ||
    `${(line.serviceType || '').toLowerCase()}|${(line.description || '')
      .trim()
      .toLowerCase()}`
  );
}

function lineFingerprint(line: RevisionLineSnapshot): string {
  return [
    line.quantity,
    line.unitCost ?? 'x',
    line.unitSell ?? 'x',
    line.taxPercent ?? 0,
    (line.description || '').trim(),
  ].join('|');
}

/** Short staff-facing list of lines that changed vs baseline. */
export function revisionChangedLineSummaries(
  beforeLines: RevisionLineSnapshot[],
  afterLines: RevisionLineSnapshot[],
  limit = 6,
): string[] {
  const beforeMap = new Map(beforeLines.map((l) => [lineKey(l), l]));
  const afterMap = new Map(afterLines.map((l) => [lineKey(l), l]));
  const out: string[] = [];
  for (const [key, after] of afterMap) {
    const before = beforeMap.get(key);
    if (!before) {
      out.push(`+ ${after.description || after.serviceType || 'line'}`);
    } else if (lineFingerprint(before) !== lineFingerprint(after)) {
      out.push(`~ ${after.description || after.serviceType || 'line'}`);
    }
    if (out.length >= limit) return out;
  }
  for (const [key, before] of beforeMap) {
    if (afterMap.has(key)) continue;
    out.push(`− ${before.description || before.serviceType || 'line'}`);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildRevisionMarginDelta(input: {
  before: QuoteCommercialSnapshot | null;
  after: QuoteCommercialSnapshot | null;
  source: RevisionBaselineSource | null;
  baselineLabel?: string;
  /** When false, strip still shows sell/tax Δ but hides cost/margin. */
  canViewCost: boolean;
  beforeLines?: RevisionLineSnapshot[];
  afterLines?: RevisionLineSnapshot[];
}): RevisionMarginDelta | null {
  if (!input.before || !input.after || !input.source) {
    return null;
  }
  const beforeTax = input.before.sellTotal - input.before.sellExTax;
  const afterTax = input.after.sellTotal - input.after.sellExTax;
  return {
    before: input.before,
    after: input.after,
    deltaCost: input.after.costTotal - input.before.costTotal,
    deltaSellExTax: input.after.sellExTax - input.before.sellExTax,
    deltaSellTotal: input.after.sellTotal - input.before.sellTotal,
    deltaTax: afterTax - beforeTax,
    deltaMarginAmount: input.after.marginAmount - input.before.marginAmount,
    deltaMarginPp: input.after.marginPercent - input.before.marginPercent,
    source: input.source,
    baselineLabel: input.baselineLabel || (input.source === 'accepted' ? 'Accepted' : 'Prior version'),
    changedLineSummaries: revisionChangedLineSummaries(
      input.beforeLines || [],
      input.afterLines || [],
    ),
    showCost: input.canViewCost,
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
