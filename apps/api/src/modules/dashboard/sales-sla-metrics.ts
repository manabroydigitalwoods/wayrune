/** Pure helpers for sales response / quote-turnaround telemetry (no schema). */

export type LeadSlaRow = {
  createdAt: Date;
  firstTouchAt: Date | null;
  firstQuoteAt: Date | null;
};

export type FitBuildTimingRow = {
  minutes: number;
};

export type SalesSlaMetrics = {
  medianFirstTouchHours: number | null;
  medianLeadToQuoteHours: number | null;
  firstTouchSampleSize: number;
  leadToQuoteSampleSize: number;
  medianFitBuildMinutes: number | null;
  fitBuildSampleSize: number;
};

export function medianSorted(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

export function computeSalesSlaMetrics(
  rows: LeadSlaRow[],
  fitRows: FitBuildTimingRow[] = [],
): SalesSlaMetrics {
  const touchHours: number[] = [];
  const quoteHours: number[] = [];
  for (const row of rows) {
    if (row.firstTouchAt && row.firstTouchAt.getTime() >= row.createdAt.getTime()) {
      touchHours.push(hoursBetween(row.createdAt, row.firstTouchAt));
    }
    if (row.firstQuoteAt && row.firstQuoteAt.getTime() >= row.createdAt.getTime()) {
      quoteHours.push(hoursBetween(row.createdAt, row.firstQuoteAt));
    }
  }
  const fitMinutes = fitRows
    .map((r) => r.minutes)
    .filter((m) => Number.isFinite(m) && m >= 0 && m <= 24 * 60);
  return {
    medianFirstTouchHours: medianSorted(touchHours),
    medianLeadToQuoteHours: medianSorted(quoteHours),
    firstTouchSampleSize: touchHours.length,
    leadToQuoteSampleSize: quoteHours.length,
    medianFitBuildMinutes: medianSorted(fitMinutes),
    fitBuildSampleSize: fitMinutes.length,
  };
}

/** Compact display for dashboard strip (hours → m / h / d). */
export function formatHoursCompact(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded}h`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

/** Compact display for FIT build minutes. */
export function formatMinutesCompact(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h`;
}

export type SalesSlaTargets = {
  firstTouchTargetHours: number | null;
  leadToQuoteTargetHours: number | null;
  fitBuildTargetMinutes: number | null;
};

function optionalPositiveTarget(
  settings: Record<string, unknown>,
  key: string,
  max: number,
): number | null {
  const raw = settings[key];
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return n;
}

/** Read optional sales SLA targets from org settingsJson. */
export function salesSlaTargetsFromSettings(settings: unknown): SalesSlaTargets {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {
      firstTouchTargetHours: null,
      leadToQuoteTargetHours: null,
      fitBuildTargetMinutes: null,
    };
  }
  const s = settings as Record<string, unknown>;
  return {
    firstTouchTargetHours: optionalPositiveTarget(s, 'firstTouchTargetHours', 168),
    leadToQuoteTargetHours: optionalPositiveTarget(s, 'leadToQuoteTargetHours', 720),
    fitBuildTargetMinutes: optionalPositiveTarget(s, 'fitBuildTargetMinutes', 1440),
  };
}

export type SalesSlaTone = 'neutral' | 'success' | 'warn' | 'danger';

/**
 * Tone a median against an optional target (same units).
 * Over target → warn; over 1.5× → danger; at/under → success; missing → neutral.
 */
export function salesSlaMedianTone(
  median: number | null | undefined,
  target: number | null | undefined,
): SalesSlaTone {
  if (median == null || !Number.isFinite(median) || target == null || !(target > 0)) {
    return 'neutral';
  }
  if (median <= target) return 'success';
  if (median > target * 1.5) return 'danger';
  return 'warn';
}

/** Public &lt;3m FIT claim gate — do not advertise until ready. */
export const FIT_CLAIM_TARGET_MINUTES = 3;
export const FIT_CLAIM_MIN_SAMPLE_SIZE = 20;
export const FIT_CLAIM_PROTOCOL_DEFINITION =
  'Workspace open → first successful quote send (INR FIT path). Timer excludes prior contract/load setup; includes in-session Match and pricing.';

export type FitClaimStatus = 'testing' | 'ready';

export type FitClaimProtocol = {
  definition: string;
  targetMinutes: number;
  minSampleSize: number;
  sampleSize: number;
  medianMinutes: number | null;
  claimStatus: FitClaimStatus;
  /** True only when sample ≥ min and median ≤ target. */
  publicClaimAllowed: boolean;
};

export function buildFitClaimProtocol(opts: {
  sampleSize: number;
  medianMinutes: number | null | undefined;
}): FitClaimProtocol {
  const sampleSize = Math.max(0, Math.floor(Number(opts.sampleSize)) || 0);
  const median =
    opts.medianMinutes != null && Number.isFinite(opts.medianMinutes)
      ? Number(opts.medianMinutes)
      : null;
  const publicClaimAllowed =
    sampleSize >= FIT_CLAIM_MIN_SAMPLE_SIZE &&
    median != null &&
    median <= FIT_CLAIM_TARGET_MINUTES;
  return {
    definition: FIT_CLAIM_PROTOCOL_DEFINITION,
    targetMinutes: FIT_CLAIM_TARGET_MINUTES,
    minSampleSize: FIT_CLAIM_MIN_SAMPLE_SIZE,
    sampleSize,
    medianMinutes: median,
    claimStatus: publicClaimAllowed ? 'ready' : 'testing',
    publicClaimAllowed,
  };
}
