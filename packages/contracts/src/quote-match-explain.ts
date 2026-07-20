/**
 * Match explain → durable quote provenance (Why this rate).
 * Rejected rows stay diagnostic / read-only — never apply targets.
 */

export type MatchRejectedCompact = {
  rateId?: string;
  label: string;
  reason: string;
};

const ACCEPTED_CAP = 24;
const REJECTED_CAP = 8;
/** Always-visible Why bullets before “more match notes”. */
export const MATCH_ACCEPTED_PRIMARY_LIMIT = 3;

/**
 * Hygiene / default-pass lines that crowd Why this rate.
 * Still persisted — only demoted in the drawer display.
 */
const MATCH_ACCEPTED_NOISE: RegExp[] = [
  /^no blackout$/i,
  /^no stop-sale$/i,
  /^agency rate preferred$/i,
  /^dates covered$/i,
  /^open private\/sic$/i,
  /^default room rate$/i,
];

export function isMatchAcceptedNoise(reason: string): boolean {
  const t = reason.trim();
  if (!t) return true;
  return MATCH_ACCEPTED_NOISE.some((re) => re.test(t));
}

export type MatchAcceptedDisplay = {
  primary: string[];
  secondary: string[];
};

/**
 * Split accepted reasons into primary (always shown) vs secondary (disclosure).
 * Signal lines rank above hygiene noise; empty signal falls back to noise.
 */
export function partitionMatchAcceptedForDisplay(
  accepted: readonly string[],
  primaryLimit = MATCH_ACCEPTED_PRIMARY_LIMIT,
): MatchAcceptedDisplay {
  const cleaned = accepted
    .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
    .map((x) => x.trim());
  if (!cleaned.length) return { primary: [], secondary: [] };

  const limit = Math.max(1, Math.min(8, Math.floor(Number(primaryLimit) || 3)));
  const signal = cleaned.filter((r) => !isMatchAcceptedNoise(r));
  const noise = cleaned.filter((r) => isMatchAcceptedNoise(r));
  const ranked = signal.length ? [...signal, ...noise] : noise;
  return {
    primary: ranked.slice(0, limit),
    secondary: ranked.slice(limit),
  };
}

export function matchAcceptedFromMeta(
  meta?: Record<string, unknown> | null,
): string[] {
  const explain = meta?.matchExplain;
  if (!explain || typeof explain !== 'object') return [];
  const accepted = (explain as Record<string, unknown>).accepted;
  if (!Array.isArray(accepted)) return [];
  return accepted
    .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
    .map((x) => x.trim())
    .slice(0, ACCEPTED_CAP);
}

export function matchRejectedCompactFromMeta(
  meta?: Record<string, unknown> | null,
  limit = REJECTED_CAP,
): MatchRejectedCompact[] {
  const explain = meta?.matchExplain;
  if (!explain || typeof explain !== 'object') return [];
  const rejected = (explain as Record<string, unknown>).rejected;
  if (!Array.isArray(rejected)) return [];
  const cap = Math.max(0, Math.min(REJECTED_CAP, Math.floor(Number(limit) || 0)));
  if (cap <= 0) return [];
  return rejected.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
    if (!label && !reason) return [];
    return [
      {
        rateId: typeof r.rateId === 'string' ? r.rateId.trim() || undefined : undefined,
        label: label || 'Rate',
        reason: reason || 'Not selected',
      },
    ];
  }).slice(0, cap);
}

export function matchSummaryFromAccepted(accepted: string[]): string | undefined {
  return accepted.length ? accepted.join('; ') : undefined;
}

/** Reopen bullets from provenance (array preferred; legacy joined summary fallback). */
export function matchAcceptedFromProvenance(opts: {
  matchAccepted?: string[] | null;
  matchSummary?: string | null;
}): string[] {
  if (Array.isArray(opts.matchAccepted) && opts.matchAccepted.length) {
    return opts.matchAccepted
      .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
      .map((x) => x.trim())
      .slice(0, ACCEPTED_CAP);
  }
  const summary = opts.matchSummary?.trim();
  if (!summary) return [];
  return summary
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, ACCEPTED_CAP);
}

export function matchRejectedFromProvenance(
  rows?: MatchRejectedCompact[] | null,
): MatchRejectedCompact[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    if (!label && !reason) return [];
    return [
      {
        rateId:
          typeof row.rateId === 'string' ? row.rateId.trim() || undefined : undefined,
        label: label || 'Rate',
        reason: reason || 'Not selected',
      },
    ];
  }).slice(0, REJECTED_CAP);
}
