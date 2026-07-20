/** Hotel rate maximum stay (Match cue; overage hard-blocks send unless acked). */

import { parseMinStayNights } from './hotel-min-stay';

/** Same 1–30 band as min stay. */
export const parseMaxStayNights = parseMinStayNights;

export type HotelMaxStayEval = {
  maxStayNights: number;
  nights: number;
  long: boolean;
  note: string;
};

/** When stay nights exceed contracted maximum. */
export function evaluateHotelMaxStay(opts: {
  maxStayNights?: number | null;
  nights: number;
}): HotelMaxStayEval | null {
  const max = parseMaxStayNights(opts.maxStayNights);
  if (max == null) return null;
  const nights = Math.max(0, Math.floor(opts.nights) || 0);
  const long = nights > max;
  return {
    maxStayNights: max,
    nights,
    long,
    note: long
      ? `Max stay ${max} night${max === 1 ? '' : 's'} — this stay is ${nights}`
      : `Max stay ${max} night${max === 1 ? '' : 's'}`,
  };
}

export function hotelMaxStayMatchAccepted(
  evalResult: HotelMaxStayEval,
): string[] {
  if (evalResult.long) {
    return [evalResult.note];
  }
  return [`Max stay ${evalResult.maxStayNights}n ok`];
}
