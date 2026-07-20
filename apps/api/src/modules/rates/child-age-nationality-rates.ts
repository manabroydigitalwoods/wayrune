/**
 * Hotel child rates by age band × nationality (Sembark-style chart columns).
 * Falls back to flat childWithBed / childWithoutBed when no band matches.
 */

import { normalizeHotelNationality } from './hotel-nationality';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function numField(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
    const n = Number(v);
    return n >= 0 ? n : undefined;
  }
  return undefined;
}

export type ChildAgeNationalityRate = {
  /** Inclusive age lower bound (years). */
  ageMin: number;
  /** Inclusive age upper bound (years). */
  ageMax: number;
  /** Market: IN | INTL | ISO-3166; omit/blank = any. */
  nationality?: string;
  withBedPerNight: number;
  withoutBedPerNight?: number;
};

export type ChildAgeNationalityPick = {
  withBedPerNight: number;
  withoutBedPerNight: number | null;
  ageMin: number;
  ageMax: number;
  nationality: string | null;
};

const MAX_ROWS = 24;

/** Parse ≤24 unique age×nationality child rate rows from occupancy JSON. */
export function parseChildAgeNationalityRates(
  raw: unknown,
): ChildAgeNationalityRate[] {
  if (!Array.isArray(raw)) return [];
  const out: ChildAgeNationalityRate[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const ageMin = numField(o.ageMin ?? o.minAge);
    const ageMax = numField(o.ageMax ?? o.maxAge);
    const withBed = numField(o.withBedPerNight ?? o.childWithBedPerNight);
    if (ageMin == null || ageMax == null || withBed == null) continue;
    const aMin = Math.floor(ageMin);
    const aMax = Math.floor(ageMax);
    if (aMin < 0 || aMax < aMin || aMax > 17) continue;
    const nat = normalizeHotelNationality(
      typeof o.nationality === 'string' ? o.nationality : null,
    );
    const without = numField(
      o.withoutBedPerNight ?? o.childWithoutBedPerNight,
    );
    const key = `${aMin}:${aMax}:${nat ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ageMin: aMin,
      ageMax: aMax,
      ...(nat ? { nationality: nat } : {}),
      withBedPerNight: withBed,
      ...(without != null ? { withoutBedPerNight: without } : {}),
    });
    if (out.length >= MAX_ROWS) break;
  }
  return out.sort(
    (a, b) =>
      a.ageMin - b.ageMin ||
      a.ageMax - b.ageMax ||
      (a.nationality ?? '').localeCompare(b.nationality ?? ''),
  );
}

/**
 * Pick best chart column for one child: age in band, then nationality
 * exact → INTL → any (blank nationality row).
 */
export function pickChildAgeNationalityRate(opts: {
  age: number | null | undefined;
  nationality: string | null | undefined;
  rates: ChildAgeNationalityRate[];
}): ChildAgeNationalityPick | null {
  if (!opts.rates.length) return null;
  const age =
    opts.age != null && Number.isFinite(Number(opts.age))
      ? Math.floor(Number(opts.age))
      : null;
  if (age == null || age < 0) return null;

  const inBand = opts.rates.filter((r) => age >= r.ageMin && age <= r.ageMax);
  if (!inBand.length) return null;

  const want = normalizeHotelNationality(opts.nationality);
  const rank = (r: ChildAgeNationalityRate): number => {
    const n = r.nationality ?? null;
    if (want && n && n === want) return 0;
    if (want && n === 'INTL' && want !== 'IN') return 1;
    if (!n) return 2;
    return 9;
  };
  const ranked = [...inBand].sort((a, b) => rank(a) - rank(b));
  const best = ranked.find((r) => rank(r) < 9) ?? ranked[0];
  if (!best) return null;
  return {
    withBedPerNight: best.withBedPerNight,
    withoutBedPerNight: best.withoutBedPerNight ?? null,
    ageMin: best.ageMin,
    ageMax: best.ageMax,
    nationality: best.nationality ?? null,
  };
}

export type ChildAgeNationalityShare = {
  age: number | null;
  nationality: string;
  withBed: boolean;
  perNight: number;
  total: number;
  ageMin: number;
  ageMax: number;
  columnNationality: string | null;
};

/**
 * Price billable children using age×nationality columns when ages are known.
 * Returns null when no child can be priced from columns (caller keeps flat path).
 */
export function sumChildExtrasByAgeNationality(opts: {
  nights: number;
  /** Ages aligned with billable children (pad/truncate). */
  childAges: Array<number | null | undefined> | null | undefined;
  childNationalities: Array<string | null | undefined> | null | undefined;
  childrenWithoutBed: number;
  billableChildren: number;
  rates: ChildAgeNationalityRate[];
  /** Flat fallback rates when a child has no band match. */
  flatWithBed?: number | null;
  flatWithoutBed?: number | null;
}): {
  occupancyExtraTotal: number;
  childWithBedCount: number;
  childWithoutBedCount: number;
  childWithBedTotal: number;
  childWithoutBedTotal: number;
  shares: ChildAgeNationalityShare[];
} | null {
  const billable = Math.max(0, Math.floor(opts.billableChildren) || 0);
  if (billable < 1 || !opts.rates.length) return null;

  const nights = Math.max(1, Math.floor(opts.nights) || 1);
  const ages = Array.isArray(opts.childAges) ? opts.childAges : [];
  const nats = Array.isArray(opts.childNationalities)
    ? opts.childNationalities
    : [];

  let withoutLeft = Math.min(
    billable,
    Math.max(0, Math.floor(opts.childrenWithoutBed) || 0),
  );

  const shares: ChildAgeNationalityShare[] = [];
  let childWithBedCount = 0;
  let childWithoutBedCount = 0;
  let childWithBedTotal = 0;
  let childWithoutBedTotal = 0;
  let anyColumn = false;

  for (let i = 0; i < billable; i++) {
    const age = ages[i] != null ? Number(ages[i]) : null;
    const nationality =
      normalizeHotelNationality(
        typeof nats[i] === 'string' ? nats[i] : null,
      ) ?? 'INTL';
    const picked = pickChildAgeNationalityRate({
      age: Number.isFinite(age as number) ? (age as number) : null,
      nationality,
      rates: opts.rates,
    });

    const wantWithout = withoutLeft > 0;
    let perNight: number | null = null;
    let withBed = true;
    let ageMin = 0;
    let ageMax = 0;
    let columnNationality: string | null = null;

    if (picked) {
      anyColumn = true;
      ageMin = picked.ageMin;
      ageMax = picked.ageMax;
      columnNationality = picked.nationality;
      if (wantWithout && picked.withoutBedPerNight != null) {
        perNight = picked.withoutBedPerNight;
        withBed = false;
        withoutLeft -= 1;
      } else {
        perNight = picked.withBedPerNight;
      }
    } else if (wantWithout && opts.flatWithoutBed != null) {
      perNight = Number(opts.flatWithoutBed) || 0;
      withBed = false;
      withoutLeft -= 1;
    } else if (opts.flatWithBed != null) {
      perNight = Number(opts.flatWithBed) || 0;
    }

    if (perNight == null) return null;

    const total = round2(perNight * nights);
    shares.push({
      age: Number.isFinite(age as number) ? Math.floor(age as number) : null,
      nationality,
      withBed,
      perNight,
      total,
      ageMin,
      ageMax,
      columnNationality,
    });
    if (withBed) {
      childWithBedCount += 1;
      childWithBedTotal = round2(childWithBedTotal + total);
    } else {
      childWithoutBedCount += 1;
      childWithoutBedTotal = round2(childWithoutBedTotal + total);
    }
  }

  if (!anyColumn) return null;

  return {
    occupancyExtraTotal: round2(childWithBedTotal + childWithoutBedTotal),
    childWithBedCount,
    childWithoutBedCount,
    childWithBedTotal,
    childWithoutBedTotal,
    shares,
  };
}

/** Build up to 2 age bands × IN/INTL from hotel CSV columns. */
export function buildChildAgeNationalityRatesFromCsvRow(row: {
  childAgeBand1Min?: number | null;
  childAgeBand1Max?: number | null;
  childAgeBand1InWithBed?: number | null;
  childAgeBand1InWithoutBed?: number | null;
  childAgeBand1IntlWithBed?: number | null;
  childAgeBand1IntlWithoutBed?: number | null;
  childAgeBand2Min?: number | null;
  childAgeBand2Max?: number | null;
  childAgeBand2InWithBed?: number | null;
  childAgeBand2InWithoutBed?: number | null;
  childAgeBand2IntlWithBed?: number | null;
  childAgeBand2IntlWithoutBed?: number | null;
}): ChildAgeNationalityRate[] | null {
  const rates: ChildAgeNationalityRate[] = [];
  const pushBand = (
    min: number | null | undefined,
    max: number | null | undefined,
    inWith: number | null | undefined,
    inWithout: number | null | undefined,
    intlWith: number | null | undefined,
    intlWithout: number | null | undefined,
  ) => {
    if (min == null || max == null) return;
    const aMin = Math.floor(min);
    const aMax = Math.floor(max);
    if (aMin < 0 || aMax < aMin) return;
    if (inWith != null) {
      rates.push({
        ageMin: aMin,
        ageMax: aMax,
        nationality: 'IN',
        withBedPerNight: inWith,
        ...(inWithout != null ? { withoutBedPerNight: inWithout } : {}),
      });
    }
    if (intlWith != null) {
      rates.push({
        ageMin: aMin,
        ageMax: aMax,
        nationality: 'INTL',
        withBedPerNight: intlWith,
        ...(intlWithout != null ? { withoutBedPerNight: intlWithout } : {}),
      });
    }
  };
  pushBand(
    row.childAgeBand1Min,
    row.childAgeBand1Max,
    row.childAgeBand1InWithBed,
    row.childAgeBand1InWithoutBed,
    row.childAgeBand1IntlWithBed,
    row.childAgeBand1IntlWithoutBed,
  );
  pushBand(
    row.childAgeBand2Min,
    row.childAgeBand2Max,
    row.childAgeBand2InWithBed,
    row.childAgeBand2InWithoutBed,
    row.childAgeBand2IntlWithBed,
    row.childAgeBand2IntlWithoutBed,
  );
  const parsed = parseChildAgeNationalityRates(rates);
  return parsed.length ? parsed : null;
}
