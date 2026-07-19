/** Compact post-Match cue when hotel buy includes occupancy extras. */

export type HotelOccupancyExtraCalc = {
  occupancyExtraTotal?: number | null;
  extraAdultCount?: number | null;
  childWithBedCount?: number | null;
  childWithoutBedCount?: number | null;
};

export function formatHotelOccupancyExtraNote(
  calc: HotelOccupancyExtraCalc | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): string | null {
  const total = Number(calc?.occupancyExtraTotal);
  if (!Number.isFinite(total) || total <= 0) return null;

  const amount =
    opts?.formatAmount?.(total) ??
    `₹${Math.round(total).toLocaleString('en-IN')}`;
  const bits = [`+${amount}`];

  const adults = Math.max(0, Math.round(Number(calc?.extraAdultCount) || 0));
  if (adults > 0) {
    bits.push(`${adults} extra adult${adults === 1 ? '' : 's'}`);
  }

  const withBed = Math.max(0, Math.round(Number(calc?.childWithBedCount) || 0));
  if (withBed > 0) {
    bits.push(`${withBed} child w/ bed`);
  }

  const withoutBed = Math.max(
    0,
    Math.round(Number(calc?.childWithoutBedCount) || 0),
  );
  if (withoutBed > 0) {
    bits.push(`${withoutBed} child w/o bed`);
  }

  return bits.join(' · ');
}
