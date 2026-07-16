/** Rich destination-guide fields stored on Place.profileJson. */
export type PlaceProfile = {
  description?: string;
  imageUrls?: string[];
  latitude?: number;
  longitude?: number;
  openingHours?: string;
  durationMin?: number;
  bestTime?: string;
  entryFee?: string;
  suitabilityTags?: string[];
  googleMapsUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  reviewSnippet?: string;
  iataCode?: string;
  icaoCode?: string;
  stationCode?: string;
  officialName?: string;
  shortName?: string;
};

export type PlaceWithProfile = {
  id: string;
  name: string;
  profile?: PlaceProfile | null;
};

export type PlaceSnapshotResult = {
  catalogPlaceId: string;
  catalogProvenance: 'destination_guide';
  title: string;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  bestVisitTime?: string;
  googleMapsUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  reviewSnippet?: string;
  openingHours?: string;
  durationMin?: number;
  entryFee?: string;
  suitabilityTags?: string[];
};

/** Map a catalog place profile into itinerary item snapshot fields. */
export function snapshotFromPlaceProfile(place: PlaceWithProfile): PlaceSnapshotResult {
  const profile = place.profile ?? {};
  const imageUrls = profile.imageUrls?.filter(Boolean) ?? [];
  return {
    catalogPlaceId: place.id,
    catalogProvenance: 'destination_guide',
    title: place.name,
    description: profile.description?.trim() || undefined,
    imageUrl: imageUrls[0],
    imageUrls: imageUrls.length ? imageUrls : undefined,
    bestVisitTime: profile.bestTime?.trim() || undefined,
    googleMapsUrl: profile.googleMapsUrl?.trim() || undefined,
    googleRating: profile.googleRating,
    googleReviewCount: profile.googleReviewCount,
    reviewSnippet: profile.reviewSnippet?.trim() || undefined,
    openingHours: profile.openingHours?.trim() || undefined,
    durationMin: profile.durationMin,
    entryFee: profile.entryFee?.trim() || undefined,
    suitabilityTags: profile.suitabilityTags?.filter(Boolean),
  };
}

/** Fields refreshed from the guide — user notes and times are preserved separately. */
export type PlaceSnapshotRefreshFields = Pick<
  PlaceSnapshotResult,
  | 'catalogPlaceId'
  | 'catalogProvenance'
  | 'title'
  | 'description'
  | 'imageUrl'
  | 'imageUrls'
  | 'bestVisitTime'
  | 'googleMapsUrl'
  | 'googleRating'
  | 'googleReviewCount'
  | 'reviewSnippet'
  | 'openingHours'
  | 'durationMin'
  | 'entryFee'
  | 'suitabilityTags'
>;

export function snapshotRefreshFields(place: PlaceWithProfile): PlaceSnapshotRefreshFields {
  return snapshotFromPlaceProfile(place);
}
