/** Compact post-Match cue when hotel buy includes weekend night rates. */

export type HotelWeekendNightCalc = {
  weekendNights?: number | null;
  weekendUnit?: number | null;
  rooms?: number | null;
};

export function formatHotelWeekendNightNote(
  calc: HotelWeekendNightCalc | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): string | null {
  const nights = Math.round(Number(calc?.weekendNights) || 0);
  if (nights <= 0) return null;
  if (calc?.weekendUnit == null) return null;
  const unit = Number(calc.weekendUnit);
  if (!Number.isFinite(unit) || unit < 0) return null;

  const amount =
    opts?.formatAmount?.(unit) ??
    `₹${Math.round(unit).toLocaleString('en-IN')}`;
  const rooms = Math.max(1, Math.round(Number(calc?.rooms) || 1));
  const bits = [
    `${nights} weekend night${nights === 1 ? '' : 's'}`,
    `weekend ${amount}`,
  ];
  if (rooms > 1) bits.push(`${rooms} rooms`);
  return bits.join(' · ');
}
