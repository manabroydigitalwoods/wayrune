/**
 * Per-child nationality hotel extras: each billable child uses their market tip’s
 * child-with/without-bed rate (exact → INTL → any via caller’s pickPricing).
 */

import { collectGuestNationalityBag, normalizeHotelNationality } from './hotel-nationality';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ChildNationalityExtraShare = {
  nationality: string;
  withBed: boolean;
  perNight: number;
  total: number;
};

export type ChildNationalityExtrasResult = {
  childWithBedCount: number;
  childWithoutBedCount: number;
  childWithBedTotal: number;
  childWithoutBedTotal: number;
  occupancyExtraTotal: number;
  shares: ChildNationalityExtraShare[];
};

export type ChildOccupancyRatePick = {
  childWithBedPerNight?: number | null;
  childWithoutBedPerNight?: number | null;
};

/**
 * Sum child occupancy extras when each child has a nationality tip.
 * `childNationalities` is aligned with billable children (pad/truncate to count).
 * First `childrenWithoutBed` billable children use without-bed rate when set.
 */
export function sumChildExtrasByNationality(opts: {
  nights: number;
  billableChildren: number;
  childrenWithoutBed: number;
  childNationalities: Array<string | null | undefined> | null | undefined;
  pickPricing: (nationality: string) => ChildOccupancyRatePick | null;
}): ChildNationalityExtrasResult | null {
  const nights = Math.max(1, Math.floor(opts.nights) || 1);
  const billable = Math.max(0, Math.floor(opts.billableChildren) || 0);
  if (billable < 1) return null;

  const bag = collectGuestNationalityBag({
    nationalities: opts.childNationalities,
  });
  if (bag.length < 1) return null;

  // Need at least one code per billable child — pad with last / truncate
  const codes: string[] = [];
  for (let i = 0; i < billable; i++) {
    const c = bag[i] || bag[bag.length - 1]!;
    const n = normalizeHotelNationality(c);
    if (!n) return null;
    codes.push(n);
  }

  let withoutBed = Math.min(
    billable,
    Math.max(0, Math.floor(opts.childrenWithoutBed) || 0),
  );

  const shares: ChildNationalityExtraShare[] = [];
  let childWithBedCount = 0;
  let childWithoutBedCount = 0;
  let childWithBedTotal = 0;
  let childWithoutBedTotal = 0;

  for (let i = 0; i < codes.length; i++) {
    const nationality = codes[i]!;
    const pricing = opts.pickPricing(nationality);
    const wantWithout = withoutBed > 0;
    if (wantWithout && pricing?.childWithoutBedPerNight != null) {
      withoutBed -= 1;
      const perNight = Number(pricing.childWithoutBedPerNight) || 0;
      const total = round2(perNight * nights);
      childWithoutBedCount += 1;
      childWithoutBedTotal = round2(childWithoutBedTotal + total);
      shares.push({
        nationality,
        withBed: false,
        perNight,
        total,
      });
      continue;
    }
    const perNight = Number(pricing?.childWithBedPerNight) || 0;
    const total = round2(perNight * nights);
    childWithBedCount += 1;
    childWithBedTotal = round2(childWithBedTotal + total);
    shares.push({
      nationality,
      withBed: true,
      perNight,
      total,
    });
  }

  return {
    childWithBedCount,
    childWithoutBedCount,
    childWithBedTotal,
    childWithoutBedTotal,
    occupancyExtraTotal: round2(childWithBedTotal + childWithoutBedTotal),
    shares,
  };
}
