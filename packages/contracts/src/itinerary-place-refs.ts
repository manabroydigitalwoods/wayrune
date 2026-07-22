/** Itinerary day/item PlaceRef canonicalization (Step 2). */

export type ItineraryPlaceRef = {
  placeId: string | null;
  name: string;
  kind?: string | null;
  shortName?: string | null;
};

function coercePlaceRef(raw: unknown): ItineraryPlaceRef | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { placeId: null, name } : null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw) && 'name' in raw) {
    const obj = raw as {
      placeId?: string | null;
      name?: unknown;
      kind?: string | null;
      shortName?: string | null;
    };
    if (typeof obj.name === 'string' && obj.name.trim()) {
      return {
        placeId: obj.placeId ?? null,
        name: obj.name.trim(),
        kind: obj.kind ?? undefined,
        shortName: obj.shortName ?? undefined,
      };
    }
  }
  return null;
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/** Read: locationRef → legacy location PlaceRef/string. */
export function locationRefFromItem(item: {
  locationRef?: unknown;
  location?: unknown;
}): ItineraryPlaceRef | null {
  return coercePlaceRef(item.locationRef) ?? coercePlaceRef(item.location);
}

/** Read: destinationRef → legacy destination PlaceRef/string. */
export function destinationRefFromDay(day: {
  destinationRef?: unknown;
  destination?: unknown;
}): ItineraryPlaceRef | null {
  return coercePlaceRef(day.destinationRef) ?? coercePlaceRef(day.destination);
}

/**
 * Display label precedence:
 * locationLabel → locationRef.name → legacy location → empty
 */
export function locationDisplayLabel(item: {
  locationLabel?: unknown;
  locationRef?: unknown;
  location?: unknown;
}): string | null {
  if (typeof item.locationLabel === 'string' && item.locationLabel.trim()) {
    return item.locationLabel.trim();
  }
  const ref = locationRefFromItem(item);
  if (ref?.name) return ref.name;
  return null;
}

export function destinationDisplayLabel(day: {
  destinationLabel?: unknown;
  destinationRef?: unknown;
  destination?: unknown;
}): string | null {
  if (typeof day.destinationLabel === 'string' && day.destinationLabel.trim()) {
    return day.destinationLabel.trim();
  }
  const ref = destinationRefFromDay(day);
  if (ref?.name) return ref.name;
  return null;
}

/** Pure: return new day with canonical destination fields; omit legacy destination. */
export function withCanonicalDayDestination<T extends Record<string, unknown>>(
  day: T,
  ref: ItineraryPlaceRef | null,
  label?: string | null,
): T {
  const next = { ...day } as Record<string, unknown>;
  delete next.destination;
  if (ref) {
    next.destinationRef = {
      placeId: ref.placeId ?? null,
      name: ref.name,
      ...(ref.kind != null ? { kind: ref.kind } : {}),
      ...(ref.shortName != null ? { shortName: ref.shortName } : {}),
    };
  } else {
    delete next.destinationRef;
  }
  const trimmed = typeof label === 'string' ? label.trim() : '';
  if (trimmed && (!ref || trimmed !== ref.name)) {
    next.destinationLabel = trimmed;
  } else {
    delete next.destinationLabel;
  }
  return omitUndefined(next) as T;
}

/** Pure: return new item with canonical location fields; omit legacy location. */
export function withCanonicalItemLocation<T extends Record<string, unknown>>(
  item: T,
  ref: ItineraryPlaceRef | null,
  label?: string | null,
): T {
  const next = { ...item } as Record<string, unknown>;
  delete next.location;
  if (ref) {
    next.locationRef = {
      placeId: ref.placeId ?? null,
      name: ref.name,
      ...(ref.kind != null ? { kind: ref.kind } : {}),
      ...(ref.shortName != null ? { shortName: ref.shortName } : {}),
    };
  } else {
    delete next.locationRef;
  }
  const trimmed = typeof label === 'string' ? label.trim() : '';
  if (trimmed && (!ref || trimmed !== ref.name)) {
    next.locationLabel = trimmed;
  } else {
    delete next.locationLabel;
  }
  return omitUndefined(next) as T;
}

/**
 * In-memory read normalize: ensure Ref fields exist from legacy without omitting legacy
 * (builder may still see both until save). Returns a deep-ish copy of days.
 */
export function normalizeItineraryDaysForRead(
  days: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(days)) return [];
  return days.map((rawDay) => {
    if (!rawDay || typeof rawDay !== 'object' || Array.isArray(rawDay)) {
      return {} as Record<string, unknown>;
    }
    const day = { ...(rawDay as Record<string, unknown>) };
    const destRef = destinationRefFromDay(day);
    if (destRef && !coercePlaceRef(day.destinationRef)) {
      day.destinationRef = destRef;
    }
    if (typeof day.destinationLabel !== 'string') {
      // keep existing custom label only
    }
    const items = Array.isArray(day.items) ? day.items : [];
    day.items = items.map((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        return {};
      }
      const item = { ...(rawItem as Record<string, unknown>) };
      const locRef = locationRefFromItem(item);
      if (locRef && !coercePlaceRef(item.locationRef)) {
        item.locationRef = locRef;
      }
      return item;
    });
    return day;
  });
}

/**
 * Canonical write normalize: PlaceRef only, omit legacy location/destination.
 * Preserves unknown fields via spread. Pure — does not mutate input.
 */
export function normalizeItineraryContentForWrite(content: unknown): {
  days: Array<Record<string, unknown>>;
  [key: string]: unknown;
} {
  const base =
    content && typeof content === 'object' && !Array.isArray(content)
      ? { ...(content as Record<string, unknown>) }
      : {};
  const rawDays = Array.isArray(base.days)
    ? base.days
    : Array.isArray(content)
      ? content
      : [];

  const days = rawDays.map((rawDay) => {
    if (!rawDay || typeof rawDay !== 'object' || Array.isArray(rawDay)) {
      return {} as Record<string, unknown>;
    }
    const day = { ...(rawDay as Record<string, unknown>) };
    const destLabel =
      typeof day.destinationLabel === 'string' ? day.destinationLabel : null;
    const destRef = destinationRefFromDay(day);
    const withDest = withCanonicalDayDestination(day, destRef, destLabel);

    const items = Array.isArray(withDest.items) ? withDest.items : [];
    withDest.items = items.map((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        return {};
      }
      const item = { ...(rawItem as Record<string, unknown>) };
      const locLabel =
        typeof item.locationLabel === 'string' ? item.locationLabel : null;
      return withCanonicalItemLocation(item, locationRefFromItem(item), locLabel);
    });
    return withDest;
  });

  return { ...base, days };
}

/**
 * Assign destination refs for seeded days.
 * Arrival → first; departure → last; middle → null unless single destination.
 */
export function assignSeedDestinationRefs(
  dayCount: number,
  dayNumber: number,
  destinations: ItineraryPlaceRef[],
): ItineraryPlaceRef | null {
  if (!destinations.length) return null;
  const first = destinations[0]!;
  const last = destinations[destinations.length - 1]!;
  const toRef = (d: ItineraryPlaceRef): ItineraryPlaceRef => ({
    placeId: d.placeId ?? null,
    name: d.name,
    kind: d.kind ?? undefined,
  });

  if (destinations.length === 1) return toRef(first);
  if (dayNumber === 1) return toRef(first);
  if (dayNumber === dayCount) return toRef(last);
  return null;
}
