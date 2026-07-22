export type PlaceRef = {
  placeId?: string | null;
  name: string;
  kind?: string;
};

export function placeName(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'name' in raw) {
    const name = (raw as { name?: unknown }).name;
    return typeof name === 'string' ? name.trim() : '';
  }
  return '';
}

export function toPlaceRef(raw: unknown): PlaceRef | null {
  if (typeof raw === 'string' && raw.trim()) {
    return { placeId: null, name: raw.trim() };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'name' in raw) {
    const obj = raw as PlaceRef;
    if (obj.name?.trim()) {
      return {
        placeId: obj.placeId ?? null,
        name: obj.name.trim(),
        kind: obj.kind,
      };
    }
  }
  return null;
}

export function placeRefsFromJson(raw: unknown): PlaceRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toPlaceRef).filter(Boolean) as PlaceRef[];
}

/** Prefer canonical originJson; fall back to deprecated origin + originPlaceId. */
export function originRefFromInquiry(row: {
  originJson?: unknown;
  origin?: string | null;
  originPlaceId?: string | null;
}): PlaceRef | null {
  const fromJson = toPlaceRef(row.originJson);
  if (fromJson) return fromJson;
  if (typeof row.origin === 'string' && row.origin.trim()) {
    return {
      placeId: row.originPlaceId ?? null,
      name: row.origin.trim(),
    };
  }
  return null;
}

export function placeRefKey(ref: PlaceRef) {
  return ref.placeId || ref.name.toLowerCase();
}

export function samePlace(a: unknown, b: unknown) {
  const ra = toPlaceRef(a);
  const rb = toPlaceRef(b);
  if (!ra || !rb) return false;
  if (ra.placeId && rb.placeId) return ra.placeId === rb.placeId;
  return ra.name.toLowerCase() === rb.name.toLowerCase();
}
