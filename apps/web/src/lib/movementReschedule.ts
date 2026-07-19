/** Pure date helpers for movement calendar drag-to-reschedule. */

export function utcDayDelta(fromIso: string, toIso: string): number {
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);
  const a = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export function addUtcDaysIso(isoDay: string, deltaDays: number): string {
  const day = isoDay.slice(0, 10);
  const d = new Date(
    Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      Number(day.slice(8, 10)),
    ),
  );
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Shift booking start (and end by the same delta when present) to a new UTC day.
 * Preserves hotel stay length when endAt is set.
 */
export function rescheduleBookingDates(input: {
  movementAt: string;
  endAt?: string | null;
  targetDay: string;
}): { startAt: string; endAt?: string } | null {
  const from = input.movementAt.slice(0, 10);
  const to = input.targetDay.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  if (from === to) return null;
  const delta = utcDayDelta(from, to);
  const startAt = to;
  const endRaw = input.endAt?.slice(0, 10);
  if (endRaw && /^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
    return { startAt, endAt: addUtcDaysIso(endRaw, delta) };
  }
  return { startAt };
}
