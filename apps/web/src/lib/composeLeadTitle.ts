/**
 * Lead interest chips are marketing / title labels — not catalog Places.
 * Place identity starts only when an employee confirms a PlaceRef on enquiry (Step 3).
 * Never write these tags into destinationPlaceId or lead PlaceRefs.
 */

/** Geographic destination-like chips (still free-text tags, not Place IDs). */
export const LEAD_TITLE_DESTINATION_LABELS = ['Goa', 'Kerala'] as const;

/** Scope / market chips (e.g. International is not a Place). */
export const LEAD_TITLE_SCOPE_LABELS = ['International'] as const;

/** Trip-type / segment chips. */
export const LEAD_TITLE_TRIP_TYPE_LABELS = [
  'Honeymoon',
  'Family',
  'Weekend',
  'Corporate',
] as const;

/** Destination + scope chips used when composing a short lead title. */
export const LEAD_TITLE_DESTINATIONS = new Set<string>([
  ...LEAD_TITLE_DESTINATION_LABELS,
  ...LEAD_TITLE_SCOPE_LABELS,
]);

/** Trip-type / segment chips used when composing a short lead title. */
export const LEAD_TITLE_TRIP_TYPES = new Set<string>([...LEAD_TITLE_TRIP_TYPE_LABELS]);

/** Prefer a clear head noun when multiple trip types are selected. */
const TRIP_TYPE_NOUN_PRIORITY = ['Honeymoon', 'Corporate', 'Family', 'Weekend'] as const;

/**
 * Short display title: `{contact} — {destination} {trip type}`.
 * Interests are building blocks — not all chips are joined into the title.
 */
export function composeLeadTitle(input: {
  contactName?: string | null;
  interests?: string[];
}): string {
  const contact = (input.contactName ?? '').trim();
  const interests = (input.interests ?? []).map((s) => s.trim()).filter(Boolean);
  const destinations = interests.filter((i) => LEAD_TITLE_DESTINATIONS.has(i));
  const tripTypes = interests.filter((i) => LEAD_TITLE_TRIP_TYPES.has(i));
  const phrase = composeInterestPhrase(destinations, tripTypes, interests);
  if (contact && phrase) return `${contact} — ${phrase}`;
  if (contact) return contact;
  if (phrase) return phrase;
  return 'New lead';
}

function pickPrimaryTripType(tripTypes: string[]): string | undefined {
  for (const preferred of TRIP_TYPE_NOUN_PRIORITY) {
    if (tripTypes.includes(preferred)) return preferred;
  }
  return tripTypes[0];
}

function composeInterestPhrase(
  destinations: string[],
  tripTypes: string[],
  all: string[],
): string {
  const dest = destinations[0];
  const primaryType = pickPrimaryTripType(tripTypes);
  const modifier = tripTypes.find((t) => t !== primaryType);

  if (dest && primaryType) return `${dest} ${primaryType.toLowerCase()}`;
  if (modifier && primaryType) return `${modifier} ${primaryType.toLowerCase()}`;
  if (dest) return dest;
  if (primaryType) return primaryType;
  // Unknown chips: use at most two so titles stay short.
  if (all.length >= 2) return `${all[0]} ${all[1]!.toLowerCase()}`;
  return all[0] ?? '';
}

/** Stage keys that must never appear as a title suffix (Stage column owns status). */
const LEAD_STAGE_TITLE_SUFFIXES = [
  'new',
  'attempted_contact',
  'contacted',
  'requirements_pending',
  'qualified',
  'proposal_sent',
  'negotiation',
  'won',
  'lost',
] as const;

const STAGE_SUFFIX_RE = new RegExp(
  `\\s*[·•]\\s*(?:${LEAD_STAGE_TITLE_SUFFIXES.join('|')})\\s*$`,
  'i',
);

/** Strip machine-style stage keys appended to stored titles (e.g. `SCN Lead · attempted_contact`). */
export function displayLeadTitle(title: string | null | undefined): string {
  const raw = (title ?? '').trim();
  if (!raw) return 'Untitled lead';
  return raw.replace(STAGE_SUFFIX_RE, '').trim() || raw;
}

/** Tags that must never be treated as catalog Place IDs / destinationPlaceId. */
export function leadTagIsNeverPlaceIdentity(tag: string): boolean {
  const t = tag.trim();
  if (!t) return false;
  if ((LEAD_TITLE_SCOPE_LABELS as readonly string[]).includes(t)) return true;
  if ((LEAD_TITLE_TRIP_TYPE_LABELS as readonly string[]).includes(t)) return true;
  return false;
}
