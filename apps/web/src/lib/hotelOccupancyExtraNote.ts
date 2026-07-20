/** Compact post-Match cue when hotel buy includes occupancy extras or SGL/DBL/TPL band. */

export type HotelPaxBuySplitShareUi = {
  nationality?: string | null;
  sharePerNight?: number | null;
};

export type HotelOccupancyExtraCalc = {
  occupancyExtraTotal?: number | null;
  extraAdultCount?: number | null;
  childWithBedCount?: number | null;
  childWithoutBedCount?: number | null;
  adultBandAdults?: number | null;
  adultBandUnitCost?: number | null;
  buyMode?: string | null;
  paxBuySplitTotalPerNight?: number | null;
  paxBuySplits?: HotelPaxBuySplitShareUi[] | null;
  rooms?: number | null;
  composition?: string | null;
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

/** Mixed-nationality per-pax / composed-room cue (Match buyMode per_pax_split). */
export function formatHotelPaxBuySplitNote(
  calc: HotelOccupancyExtraCalc | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): string | null {
  if (calc?.buyMode !== 'per_pax_split') return null;
  const shares = Array.isArray(calc.paxBuySplits) ? calc.paxBuySplits : [];
  if (!shares.length) return null;
  const fmt =
    opts?.formatAmount ??
    ((n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`);
  const bits = shares
    .map((s) => {
      const code = String(s.nationality || '').trim().toUpperCase();
      const share = Number(s.sharePerNight);
      if (!code || !Number.isFinite(share) || share < 0) return null;
      return `${code} ${fmt(share)}`;
    })
    .filter((x): x is string => Boolean(x));
  if (!bits.length) return null;
  const total = Number(calc.paxBuySplitTotalPerNight);
  const totalBit =
    Number.isFinite(total) && total >= 0 ? ` = ${fmt(total)}/n` : '';
  const rooms = Math.max(0, Math.round(Number(calc.rooms) || 0));
  const adults = shares.length;
  let dblSglLabel = 'DBL+SGL';
  if (rooms >= 2 && adults > rooms && adults < 2 * rooms) {
    const doubles = adults - rooms;
    const singles = 2 * rooms - adults;
    const dBit = doubles <= 1 ? 'DBL' : `${doubles}DBL`;
    const sBit = singles <= 1 ? 'SGL' : `${singles}SGL`;
    dblSglLabel = `${dBit}+${sBit}`;
  }
  const suffix =
    calc.composition === 'dbl_sgl'
      ? ` · ${dblSglLabel}`
      : rooms > 1
        ? ` · × ${rooms} rooms`
        : '';
  return `Split · ${bits.join(' + ')}${totalBit}${suffix}`;
}

function occupancyExtraBits(
  calc: HotelOccupancyExtraCalc | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): string[] {
  const total = Number(calc?.occupancyExtraTotal);
  if (!Number.isFinite(total) || total <= 0) return [];
  const bits: string[] = [];
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
  return bits;
}

export function formatHotelOccupancyExtraNote(
  calc: HotelOccupancyExtraCalc | null | undefined,
  opts?: { formatAmount?: (n: number) => string },
): string | null {
  const split = formatHotelPaxBuySplitNote(calc, opts);
  const extras = occupancyExtraBits(calc, opts);
  if (split) {
    return extras.length ? `${split} · ${extras.join(' · ')}` : split;
  }

  const band = formatHotelAdultBandNote(calc, opts);
  if (!band && !extras.length) return null;

  const bits: string[] = [];
  if (band) bits.push(band);
  bits.push(...extras);
  return bits.join(' · ');
}
