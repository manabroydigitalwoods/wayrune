/** Hotel rate minimum stay (Match cue; shortfall hard-blocks send unless acked). */

export function parseMinStayNights(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
    return Math.min(30, Math.floor(raw));
  }
  if (typeof raw === 'string' && raw.trim() && Number.isFinite(Number(raw))) {
    const n = Number(raw);
    if (n >= 1) return Math.min(30, Math.floor(n));
  }
  return undefined;
}

export type HotelMinStayEval = {
  minStayNights: number;
  nights: number;
  short: boolean;
  note: string;
};

/** When stay nights are below contracted minimum. */
export function evaluateHotelMinStay(opts: {
  minStayNights?: number | null;
  nights: number;
}): HotelMinStayEval | null {
  const min = parseMinStayNights(opts.minStayNights);
  if (min == null) return null;
  const nights = Math.max(0, Math.floor(opts.nights) || 0);
  const short = nights < min;
  return {
    minStayNights: min,
    nights,
    short,
    note: short
      ? `Min stay ${min} night${min === 1 ? '' : 's'} — this stay is ${nights}`
      : `Min stay ${min} night${min === 1 ? '' : 's'}`,
  };
}

/** ISO date + N nights → check-out (YYYY-MM-DD). */
export function checkOutIsoAfterNights(
  checkInIso: string,
  nights: number,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkInIso.trim().slice(0, 10));
  if (!m) return null;
  const n = Math.max(1, Math.floor(nights) || 1);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * When nights &lt; min stay, plan a non-silent check-out bump to meet min.
 * Returns null when no extend needed or check-in missing.
 */
export function planHotelMinStayExtend(opts: {
  checkInIso?: string | null;
  nights: number;
  minStayNights?: number | null;
}): {
  fromNights: number;
  toNights: number;
  checkOut: string;
  note: string;
} | null {
  const min = parseMinStayNights(opts.minStayNights);
  if (min == null) return null;
  const fromNights = Math.max(0, Math.floor(opts.nights) || 0);
  if (fromNights >= min) return null;
  const checkIn = opts.checkInIso?.trim().slice(0, 10) || '';
  const checkOut = checkOutIsoAfterNights(checkIn, min);
  if (!checkOut) return null;
  return {
    fromNights,
    toNights: min,
    checkOut,
    note: `Extended check-out to meet min stay ${min} night${min === 1 ? '' : 's'} (was ${fromNights})`,
  };
}

export function hotelMinStayMatchAccepted(evalResult: HotelMinStayEval): string[] {
  if (evalResult.short) {
    return [evalResult.note];
  }
  return [`Min stay ${evalResult.minStayNights}n met`];
}
