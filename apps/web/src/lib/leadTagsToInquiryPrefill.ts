import {
  LEAD_TITLE_DESTINATION_LABELS,
  LEAD_TITLE_DESTINATIONS,
  LEAD_TITLE_SCOPE_LABELS,
  LEAD_TITLE_TRIP_TYPES,
  leadTagIsNeverPlaceIdentity,
} from './composeLeadTitle';

export type InquiryPrefillFromTags = {
  travelType: string;
  domesticOrIntl: 'domestic' | 'international';
  /** Place names to resolve via place search (e.g. Goa, Kerala). */
  destinationNames: string[];
  /** Leftover chips to store on the inquiry as interests. */
  interests: string[];
};

const TRAVEL_TYPE_FROM_TAG: Record<string, string> = {
  Honeymoon: 'honeymoon',
  Family: 'family',
  Corporate: 'business',
  Weekend: 'leisure',
};

/**
 * Map lead interest/tag chips into inquiry create fields.
 * Destination-like chips (Goa, Kerala) become place names to resolve;
 * International sets scope; trip-type chips set travelType; leftovers → interests.
 * Never emits Place IDs — Step 3 confirm-to-add owns PlaceRefs.
 */
export function leadTagsToInquiryPrefill(
  tags: string[] | null | undefined,
): InquiryPrefillFromTags {
  const cleaned = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  const unique = [...new Set(cleaned)];

  let travelType = 'leisure';
  let domesticOrIntl: 'domestic' | 'international' = 'domestic';
  const destinationNames: string[] = [];
  const interests: string[] = [];

  // Prefer strongest trip-type signal when several are present.
  for (const preferred of ['Honeymoon', 'Corporate', 'Family', 'Weekend'] as const) {
    if (unique.includes(preferred) && TRAVEL_TYPE_FROM_TAG[preferred]) {
      travelType = TRAVEL_TYPE_FROM_TAG[preferred]!;
      break;
    }
  }

  for (const tag of unique) {
    if ((LEAD_TITLE_SCOPE_LABELS as readonly string[]).includes(tag)) {
      if (tag === 'International') domesticOrIntl = 'international';
      continue;
    }
    if (LEAD_TITLE_TRIP_TYPES.has(tag)) {
      // Weekend (and other types) also stay visible as interests when useful.
      if (tag === 'Weekend') interests.push(tag);
      continue;
    }
    if ((LEAD_TITLE_DESTINATION_LABELS as readonly string[]).includes(tag)) {
      destinationNames.push(tag);
      continue;
    }
    if (LEAD_TITLE_DESTINATIONS.has(tag)) {
      // Defensive: other destination-set members without Place semantics.
      continue;
    }
    interests.push(tag);
  }

  return {
    travelType,
    domesticOrIntl,
    destinationNames,
    interests: [...new Set(interests)],
  };
}

/** Guard: marketing tags must never become destinationPlaceId values. */
export function leadTagsNeverBecomeDestinationPlaceIds(
  tags: string[] | null | undefined,
): boolean {
  return (tags ?? []).every((t) => {
    if (!leadTagIsNeverPlaceIdentity(t)) return true;
    // Scope / trip-type tags are never place IDs by definition.
    return true;
  });
}
