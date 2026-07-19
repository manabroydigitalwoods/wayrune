/** Compact post-Match cue when hotel buy includes occupancy extras or SGL/DBL/TPL band. */

export type HotelOccupancyExtraCalc = {
  occupancyExtraTotal?: number | null;
  extraAdultCount?: number | null;
  childWithBedCount?: number | null;
  childWithoutBedCount?: number | null;
  adultBandAdults?: number | null;
  adultBandUnitCost?: number | null;
};

export function formatHotelAdultBandNote(
  calc: HotelOccupancyExtraCalc | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): string | null {
  const adults = Math.max(0, Math.round(Number(calc?.adultBandAdults) || 0));
  const unit = Number(calc?.adultBandUnitCost);
  if (adults < 1 || !Number.isFinite(unit) || unit < 0) return null;
  const amount =
    opts?.formatAmount?.(unit) ??
    `₹${Math.round(unit).toLocaleString('en-IN')}`;
  return `${adults}A band · ${amount}/n`;
}

export function formatHotelOccupancyExtraNote(
  calc: HotelOccupancyExtraCalc | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): string | null {
  const band = formatHotelAdultBandNote(calc, opts);
  const total = Number(calc?.occupancyExtraTotal);
  const hasExtras = Number.isFinite(total) && total > 0;

  if (!band && !hasExtras) return null;

  const bits: string[] = [];
  if (band) bits.push(band);

  if (hasExtras) {
    const amount =
      opts?.formatAmount?.(total) ??
      `₹${Math.round(total).toLocaleString('en-IN')}`;
    bits.push(`+${amount}`);

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
  }

  return bits.join(' · ');
}
