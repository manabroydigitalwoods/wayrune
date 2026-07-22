import { salesPlaceSecondaryLabel } from '@wayrune/contracts';
import { api } from '../api';
import {
  classifyDestinationSearchHits,
  type DestinationResolveResult,
} from './destinationEnquirySuggestions';
import type { PlaceRef } from './placeRefs';

type PlaceSearchHit = {
  id: string;
  name: string;
  kind: string;
  salesDescription?: string;
  country?: string;
  region?: string | null;
  parent?: { id: string; name: string; kind: string } | null;
  profile?: unknown;
};

async function searchDestinationHits(
  name: string,
  opts?: { domesticOrIntl?: string },
): Promise<PlaceSearchHit[]> {
  const params = new URLSearchParams();
  params.set('q', name.trim());
  params.set('purpose', 'destination');
  params.set('limit', '8');
  if (opts?.domesticOrIntl) params.set('domesticOrIntl', opts.domesticOrIntl);
  const res = await api<{ items: PlaceSearchHit[] }>(`/places?${params.toString()}`);
  return res.items || [];
}

function hitDescription(p: PlaceSearchHit): string | undefined {
  if (p.salesDescription) return p.salesDescription;
  return salesPlaceSecondaryLabel({
    name: p.name,
    kind: p.kind,
    country: p.country,
    region: p.region,
    parent: p.parent,
    profile: p.profile as never,
  });
}

/** Strict classify for enquiry suggestion UI (exact / ambiguous / unresolved). */
export async function classifyDestinationSuggestion(
  name: string,
  opts?: { domesticOrIntl?: string },
): Promise<DestinationResolveResult> {
  const items = await searchDestinationHits(name, opts);
  const result = classifyDestinationSearchHits(name, items);
  if (result.status === 'exact' && result.match) {
    const hit = items.find((p) => p.id === result.match!.placeId);
    return {
      status: 'exact',
      match: {
        ...result.match,
        description: result.match.description || (hit ? hitDescription(hit) : undefined),
      },
    };
  }
  return result;
}

/** Resolve a free-text name to a PlaceRef when unambiguous (exact or unique prefix). */
export async function resolveDestinationSuggestion(
  name: string,
  opts?: { domesticOrIntl?: string },
): Promise<PlaceRef | null> {
  const classified = await classifyDestinationSuggestion(name, opts);
  if (classified.status !== 'exact' || !classified.match) return null;
  return {
    placeId: classified.match.placeId,
    name: classified.match.name,
    kind: classified.match.kind,
  };
}
