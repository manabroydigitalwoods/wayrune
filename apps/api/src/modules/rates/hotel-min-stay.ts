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

export function hotelMinStayMatchAccepted(evalResult: HotelMinStayEval): string[] {
  if (evalResult.short) {
    return [evalResult.note];
  }
  return [`Min stay ${evalResult.minStayNights}n met`];
}
