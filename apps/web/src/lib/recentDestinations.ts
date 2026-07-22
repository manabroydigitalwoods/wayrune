import type { PlaceKind } from '@wayrune/contracts';
import { salesPlaceSecondaryLabel } from '@wayrune/contracts';

export type RecentPlace = {
  id: string;
  name: string;
  kind: PlaceKind | string;
  secondaryLabel?: string;
  usedAt: string;
};

const MAX_RECENT = 8;

function storageKey(orgId: string) {
  return `wayrune:${orgId}:recent-destinations`;
}

export function readRecentDestinations(orgId: string | null | undefined): RecentPlace[] {
  if (!orgId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPlace[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberRecentDestination(
  orgId: string | null | undefined,
  place: {
    id: string;
    name: string;
    kind?: string;
    country?: string | null;
    region?: string | null;
    parent?: { name: string; kind: string } | null;
    profile?: { iataCode?: string | null; stationCode?: string | null } | null;
    salesDescription?: string;
  },
) {
  if (!orgId || !place.id) return;
  const secondaryLabel =
    place.salesDescription ||
    salesPlaceSecondaryLabel({
      name: place.name,
      kind: place.kind || 'city',
      country: place.country,
      region: place.region,
      parent: place.parent,
      profile: place.profile,
    });
  const next: RecentPlace = {
    id: place.id,
    name: place.name,
    kind: place.kind || 'city',
    secondaryLabel,
    usedAt: new Date().toISOString(),
  };
  const prev = readRecentDestinations(orgId).filter((p) => p.id !== place.id);
  const merged = [next, ...prev].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(merged));
  } catch {
    // quota / private mode
  }
}

export function dropRecentDestination(orgId: string | null | undefined, placeId: string) {
  if (!orgId) return;
  const next = readRecentDestinations(orgId).filter((p) => p.id !== placeId);
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(next));
  } catch {
    // ignore
  }
}
