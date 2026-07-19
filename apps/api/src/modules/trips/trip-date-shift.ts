/** Pure helpers for shifting quote/story dates when trip travel start changes. */

export function tripStartIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const day = value.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

/**
 * Shift draft quote lines + story when travel start actually changes
 * and the client did not opt out.
 */
export function shouldShiftQuoteDatesOnTripEdit(input: {
  previousStartIso: string | null;
  nextStartIso: string | null;
  shiftQuoteDates: boolean;
}): boolean {
  if (!input.shiftQuoteDates) return false;
  if (!input.nextStartIso) return false;
  return input.previousStartIso !== input.nextStartIso;
}

export type CommercialQuoteRewriteStatus = 'accepted' | 'approved' | 'sent';

/**
 * Prefer accepted → approved → sent (newest within band) for date-shift rewrite.
 * Never mutates these versions — caller clones into a draft.
 */
export function pickCommercialQuoteSourceForRewrite(
  versions: Array<{
    id: string;
    status: string;
    acceptedAt?: Date | string | null;
    updatedAt?: Date | string | null;
  }>,
): { id: string; status: CommercialQuoteRewriteStatus } | null {
  const rank = (status: string): number => {
    if (status === 'accepted') return 3;
    if (status === 'approved') return 2;
    if (status === 'sent') return 1;
    return 0;
  };
  const ts = (v: { acceptedAt?: Date | string | null; updatedAt?: Date | string | null }) => {
    const raw = v.acceptedAt ?? v.updatedAt;
    if (raw == null) return 0;
    const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
    return Number.isFinite(ms) ? ms : 0;
  };
  const candidates = versions
    .map((v) => {
      const r = rank(v.status);
      if (!r) return null;
      return {
        id: v.id,
        status: v.status as CommercialQuoteRewriteStatus,
        rank: r,
        at: ts(v),
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    status: CommercialQuoteRewriteStatus;
    rank: number;
    at: number;
  }>;
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.rank - a.rank || b.at - a.at);
  return { id: candidates[0]!.id, status: candidates[0]!.status };
}
