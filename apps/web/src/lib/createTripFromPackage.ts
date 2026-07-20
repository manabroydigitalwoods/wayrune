/** Compose New trip + optional package template apply (client-side). */

import { CreateTripSchema, tripTravelEndOnOrAfterStart } from '@wayrune/contracts';

export type CreateTripFromPackageForm = {
  title: string;
  partyId?: string;
  startDate?: string;
  endDate?: string;
  /** Active QuoteTemplate id — when set, travel start is required. */
  templateId?: string;
  adults?: number;
  children?: number;
  childAges?: number[];
  childrenWithoutBed?: number;
  rooms?: number;
};

export type CreateTripFromPackagePlan = {
  ok: true;
  createBody: {
    title: string;
    partyId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  };
  apply?: {
    templateId: string;
    startDate: string;
    adults: number;
    children: number;
    rooms: number;
    childAges?: number[];
    childrenWithoutBed?: number;
  };
};

export type CreateTripFromPackageInvalid = {
  ok: false;
  error: string;
};

/** Parse "8, 11" style ages for apply dialogs (0–17). */
export function parseApplyChildAgesCsv(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .map((x) => Math.round(Number(x)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17);
}

export function defaultRoomsFromAdults(adults: number): number {
  const a = Math.max(1, Math.round(Number(adults) || 1));
  return Math.max(1, Math.ceil(a / 2));
}

/** Validate create (+ optional package) before POST /trips or /trips/from-package. */
export function planCreateTripFromPackage(
  input: CreateTripFromPackageForm,
): CreateTripFromPackagePlan | CreateTripFromPackageInvalid {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: 'Enter a trip title' };
  }
  if (!tripTravelEndOnOrAfterStart(input.startDate, input.endDate)) {
    return { ok: false, error: 'Travel end must be on or after travel start' };
  }

  const parsed = CreateTripSchema.safeParse({
    title,
    partyId: input.partyId || undefined,
    startDate: input.startDate || undefined,
    endDate: input.endDate || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message || 'Check trip details',
    };
  }

  const templateId = (input.templateId || '').trim();
  if (!templateId) {
    return { ok: true, createBody: parsed.data };
  }

  const startDate = (input.startDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return {
      ok: false,
      error: 'Travel start is required when starting from a package',
    };
  }

  const adults = Math.max(1, Math.round(Number(input.adults) || 2));
  const children = Math.max(0, Math.round(Number(input.children) || 0));
  const roomsRaw = input.rooms != null ? Math.round(Number(input.rooms)) : NaN;
  const rooms =
    Number.isFinite(roomsRaw) && roomsRaw >= 1
      ? Math.min(99, roomsRaw)
      : defaultRoomsFromAdults(adults);
  const childAges =
    children > 0 && input.childAges?.length
      ? input.childAges.filter((n) => Number.isFinite(n) && n >= 0 && n <= 17)
      : undefined;
  let childrenWithoutBed: number | undefined;
  if (children > 0 && input.childrenWithoutBed != null) {
    const n = Math.round(Number(input.childrenWithoutBed));
    if (Number.isFinite(n) && n > 0) {
      childrenWithoutBed = Math.min(n, children);
    }
  }

  return {
    ok: true,
    createBody: {
      ...parsed.data,
      startDate,
    },
    apply: {
      templateId,
      startDate,
      adults,
      children,
      rooms,
      ...(childAges?.length ? { childAges } : {}),
      ...(childrenWithoutBed != null ? { childrenWithoutBed } : {}),
    },
  };
}

/** Body for atomic `POST /trips/from-package` when plan includes apply. */
export function fromPackageRequestBody(
  plan: Extract<CreateTripFromPackagePlan, { ok: true }>,
): Record<string, unknown> | null {
  if (!plan.apply) return null;
  return {
    ...plan.createBody,
    templateId: plan.apply.templateId,
    startDate: plan.apply.startDate,
    adults: plan.apply.adults,
    children: plan.apply.children,
    rooms: plan.apply.rooms,
    ...(plan.apply.childAges?.length ? { childAges: plan.apply.childAges } : {}),
    ...(plan.apply.childrenWithoutBed != null
      ? { childrenWithoutBed: plan.apply.childrenWithoutBed }
      : {}),
  };
}
export function formatCreateTripFromPackageToast(opts: {
  appliedPackage: boolean;
  quoteNumber?: string | null;
  packageName?: string | null;
  rematchMatched?: number | null;
  rematchUnmatched?: number | null;
}): string {
  if (!opts.appliedPackage) return 'Trip created';
  const pkg = opts.packageName?.trim();
  let base: string;
  if (opts.quoteNumber && pkg) {
    base = `Trip created · ${opts.quoteNumber} from ${pkg}`;
  } else if (opts.quoteNumber) {
    base = `Trip created · started ${opts.quoteNumber} from package`;
  } else if (pkg) {
    base = `Trip created · ${pkg} applied`;
  } else {
    base = 'Trip created · package applied';
  }
  const matched = Number(opts.rematchMatched) || 0;
  const unmatched = Number(opts.rematchUnmatched) || 0;
  if (matched <= 0 && unmatched <= 0) return base;
  const bits = [`${matched} rate-matched`];
  if (unmatched > 0) bits.push(`${unmatched} need rates`);
  return `${base} · ${bits.join(' · ')}`;
}

/** Prefer destination-hint matches, then name. */
export function sortQuoteTemplatesForPicker<
  T extends { name: string; content?: { destinationHint?: string | null } | null },
>(templates: T[], destinationHint?: string | null): T[] {
  const hint = (destinationHint || '').trim().toLowerCase();
  return [...templates].sort((a, b) => {
    if (hint) {
      const aHit = String(a.content?.destinationHint || '')
        .toLowerCase()
        .includes(hint)
        ? 0
        : 1;
      const bHit = String(b.content?.destinationHint || '')
        .toLowerCase()
        .includes(hint)
        ? 0
        : 1;
      if (aHit !== bHit) return aHit - bHit;
    }
    return a.name.localeCompare(b.name);
  });
}
