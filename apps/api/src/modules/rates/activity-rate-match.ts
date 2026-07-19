/** Normalize activity labels for rate-card matching. */
export function normalizeActivityKey(name: string | null | undefined): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type ActivityRateCandidate = {
  id: string;
  supplierId: string | null;
  placeId: string | null;
  activityName: string;
  activityKey: string;
  privateOrSic: string | null;
  adultUnitCost: number;
  childUnitCost: number | null;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
  currency?: string | null;
};

export function activityNameMatches(
  rate: Pick<ActivityRateCandidate, 'activityKey' | 'activityName'>,
  wantedRaw: string,
): boolean {
  const wanted = normalizeActivityKey(wantedRaw);
  if (!wanted) return false;
  const rateKey = rate.activityKey || normalizeActivityKey(rate.activityName);
  if (!rateKey) return false;
  if (rateKey === wanted) return true;
  if (rateKey.includes(wanted) || wanted.includes(rateKey)) return true;
  const rateNameKey = normalizeActivityKey(rate.activityName);
  if (rateNameKey && (rateNameKey === wanted || rateNameKey.includes(wanted) || wanted.includes(rateNameKey))) {
    return true;
  }
  return false;
}

export function activityPrivateMatches(
  ratePrivate: string | null | undefined,
  wanted: string | null | undefined,
): boolean {
  if (!ratePrivate) return true;
  if (!wanted) return true;
  return ratePrivate === wanted;
}

export function dateInActivityWindow(
  asOf: Date,
  start: Date | null,
  end: Date | null,
): boolean {
  const t = asOf.getTime();
  if (start && t < start.getTime()) return false;
  if (end && t > end.getTime()) return false;
  return true;
}

function windowTightness(start: Date | null, end: Date | null): number {
  if (!start && !end) return 0;
  if (start && end) return 20;
  return 10;
}

/** Higher score wins. */
export function scoreActivityRate(
  rate: ActivityRateCandidate,
  opts: {
    supplierId?: string | null;
    placeId?: string | null;
    privateOrSic?: string | null;
    wantedName: string;
  },
): number {
  if (!activityNameMatches(rate, opts.wantedName)) return -1;
  if (!activityPrivateMatches(rate.privateOrSic, opts.privateOrSic)) return -1;

  let score = windowTightness(rate.startDate, rate.endDate);
  if (opts.supplierId && rate.supplierId === opts.supplierId) score += 40;
  else if (opts.supplierId && rate.supplierId && rate.supplierId !== opts.supplierId) {
    return -1;
  } else if (!rate.supplierId) {
    score += 5;
  }

  if (opts.placeId && rate.placeId === opts.placeId) score += 15;
  else if (opts.placeId && rate.placeId && rate.placeId !== opts.placeId) {
    score -= 5;
  }

  if (opts.privateOrSic && rate.privateOrSic === opts.privateOrSic) score += 10;

  const wantedKey = normalizeActivityKey(opts.wantedName);
  const rateKey = rate.activityKey || normalizeActivityKey(rate.activityName);
  if (wantedKey && rateKey === wantedKey) score += 25;

  return score;
}

export function pickBestActivityRate(
  pool: ActivityRateCandidate[],
  opts: {
    asOf: Date;
    supplierId?: string | null;
    placeId?: string | null;
    privateOrSic?: string | null;
    wantedName: string;
  },
): ActivityRateCandidate | undefined {
  let best: ActivityRateCandidate | undefined;
  let bestScore = -1;
  for (const rate of pool) {
    if (!dateInActivityWindow(opts.asOf, rate.startDate, rate.endDate)) continue;
    const score = scoreActivityRate(rate, opts);
    if (score > bestScore) {
      bestScore = score;
      best = rate;
    }
  }
  return best;
}

/** Blended per-person buy so qty × unitCost equals adult+child total. */
export function blendedActivityUnitCost(opts: {
  adultUnitCost: number;
  childUnitCost?: number | null;
  adults: number;
  children: number;
}): { unitCost: number; quantity: number; totalBuy: number; childUnit: number } {
  const adults = Math.max(0, Math.round(opts.adults));
  const children = Math.max(0, Math.round(opts.children));
  const childUnit =
    opts.childUnitCost != null && Number.isFinite(opts.childUnitCost)
      ? opts.childUnitCost
      : opts.adultUnitCost;
  const quantity = Math.max(1, adults + children);
  const totalBuy =
    adults * opts.adultUnitCost +
    children * childUnit +
    (adults + children === 0 ? opts.adultUnitCost : 0);
  const unitCost = Math.round((totalBuy / quantity) * 100) / 100;
  return { unitCost, quantity, totalBuy: Math.round(totalBuy * 100) / 100, childUnit };
}

/**
 * Split party into adult-rate vs child-rate heads using optional childAges.
 * Ages outside [childAgeMin, childAgeMax] pay adult rate.
 * When childAges absent, uses the provided children count as child-rate heads.
 */
export function classifyActivityPax(opts: {
  adults: number;
  children: number;
  childAges?: number[] | null;
  childAgeMin?: number | null;
  childAgeMax?: number | null;
}): {
  adultHeads: number;
  childHeads: number;
  ageMin: number;
  ageMax: number;
  usedChildAges: boolean;
} {
  const ageMin =
    opts.childAgeMin != null && Number.isFinite(opts.childAgeMin)
      ? Math.max(0, Math.round(opts.childAgeMin))
      : 0;
  const ageMax =
    opts.childAgeMax != null && Number.isFinite(opts.childAgeMax)
      ? Math.max(ageMin, Math.round(opts.childAgeMax))
      : 17;
  const adults = Math.max(0, Math.round(opts.adults));
  const children = Math.max(0, Math.round(opts.children));
  const ages = (opts.childAges || []).filter(
    (a) => typeof a === 'number' && Number.isFinite(a),
  );

  if (ages.length === 0) {
    return {
      adultHeads: adults,
      childHeads: children,
      ageMin,
      ageMax,
      usedChildAges: false,
    };
  }

  let childHeads = 0;
  let adultFromAges = 0;
  for (const age of ages) {
    if (age >= ageMin && age <= ageMax) childHeads += 1;
    else adultFromAges += 1;
  }
  // Extra declared children without ages count as child-rate.
  const undeclared = Math.max(0, children - ages.length);
  childHeads += undeclared;

  return {
    adultHeads: adults + adultFromAges,
    childHeads,
    ageMin,
    ageMax,
    usedChildAges: true,
  };
}

/**
 * Transfer per_adult 3-way split from childAges:
 * age < childAgeMin → infant · [min,max] → child · > max → adult.
 * When ages absent, uses declared children + infants counts.
 * When ages present, infant heads come from ages (manual infants ignored).
 */
export function classifyTransferPax(opts: {
  adults: number;
  children: number;
  infants?: number | null;
  childAges?: number[] | null;
  childAgeMin?: number | null;
  childAgeMax?: number | null;
}): {
  adultHeads: number;
  childHeads: number;
  infantHeads: number;
  ageMin: number;
  ageMax: number;
  usedChildAges: boolean;
} {
  const ageMin =
    opts.childAgeMin != null && Number.isFinite(opts.childAgeMin)
      ? Math.max(0, Math.round(opts.childAgeMin))
      : 0;
  const ageMax =
    opts.childAgeMax != null && Number.isFinite(opts.childAgeMax)
      ? Math.max(ageMin, Math.round(opts.childAgeMax))
      : 17;
  const adults = Math.max(0, Math.round(opts.adults));
  const children = Math.max(0, Math.round(opts.children));
  const infants = Math.max(0, Math.round(Number(opts.infants) || 0));
  const ages = (opts.childAges || []).filter(
    (a) => typeof a === 'number' && Number.isFinite(a),
  );

  if (ages.length === 0) {
    return {
      adultHeads: adults,
      childHeads: children,
      infantHeads: infants,
      ageMin,
      ageMax,
      usedChildAges: false,
    };
  }

  let childHeads = 0;
  let infantHeads = 0;
  let adultFromAges = 0;
  for (const age of ages) {
    if (age < ageMin) infantHeads += 1;
    else if (age <= ageMax) childHeads += 1;
    else adultFromAges += 1;
  }
  // Extra declared children without ages count as child-rate.
  const undeclared = Math.max(0, children - ages.length);
  childHeads += undeclared;

  return {
    adultHeads: adults + adultFromAges,
    childHeads,
    infantHeads,
    ageMin,
    ageMax,
    usedChildAges: true,
  };
}
