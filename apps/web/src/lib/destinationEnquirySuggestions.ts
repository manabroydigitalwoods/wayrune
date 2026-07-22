import { LEAD_TITLE_DESTINATION_LABELS } from './composeLeadTitle';
import { leadTagsToInquiryPrefill } from './leadTagsToInquiryPrefill';
import type { PlaceRef } from './placeRefs';

/** Durable Lead custom field — original visitor destination free-text. */
export const LEAD_DESTINATION_TEXT_KEY = 'destinationText';

export type DestinationSuggestionSource = 'visitor_text' | 'lead_tag';

export type EnquiryDestinationSuggestion = {
  /** Original fragment (visitor spelling or tag label). */
  name: string;
  sources: DestinationSuggestionSource[];
};

/** Normalize for dedupe / exact compare — trim + collapse whitespace + lowercase. */
export function normalizeDestinationSuggestionKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Conservatively split visitor destination text into suggestion names.
 * Splits on commas, newlines, and semicolons only — never on spaces
 * (preserves "North Sikkim", "New Delhi", "Abu Dhabi").
 */
export function parseDestinationSuggestionNames(text: string | null | undefined): string[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const parts = text
    .split(/[,;\n\r]+/)
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = normalizeDestinationSuggestionKey(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

export function readLeadDestinationText(customFields: unknown): string | undefined {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) {
    return undefined;
  }
  const raw = (customFields as Record<string, unknown>)[LEAD_DESTINATION_TEXT_KEY];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

/**
 * Precedence for suggestion names:
 * 1. Explicit destinationText (current interaction / defaults)
 * 2. Lead destinationText (caller passes as destinationText already resolved)
 * 3. Destination-related lead tags
 *
 * Dedupes by normalized name; merges sources when both text and tag contribute.
 * Selected PlaceRefs are still returned so the UI can show “Already added”.
 */
export function mergeEnquiryDestinationSuggestions(input: {
  destinationText?: string | null;
  tags?: string[] | null;
  /** @deprecated Classification UI handles already-added; kept for call-site compatibility. */
  selectedDestinations?: PlaceRef[];
}): EnquiryDestinationSuggestion[] {
  const fromText = parseDestinationSuggestionNames(input.destinationText);
  const fromTags = leadTagsToInquiryPrefill(input.tags).destinationNames.filter((n) =>
    (LEAD_TITLE_DESTINATION_LABELS as readonly string[]).includes(n),
  );

  const byKey = new Map<string, EnquiryDestinationSuggestion>();

  for (const name of fromText) {
    const key = normalizeDestinationSuggestionKey(name);
    byKey.set(key, { name, sources: ['visitor_text'] });
  }
  for (const name of fromTags) {
    const key = normalizeDestinationSuggestionKey(name);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.sources.includes('lead_tag')) {
        existing.sources = [...existing.sources, 'lead_tag'];
      }
    } else {
      byKey.set(key, { name, sources: ['lead_tag'] });
    }
  }

  return [...byKey.values()];
}

export type DestinationSearchHit = {
  id: string;
  name: string;
  kind?: string;
  salesDescription?: string;
  country?: string | null;
  region?: string | null;
  parent?: { id: string; name: string; kind: string } | null;
};

export type DestinationResolveStatus = 'exact' | 'ambiguous' | 'unresolved';

export type DestinationResolveResult = {
  status: DestinationResolveStatus;
  match?: {
    placeId: string;
    name: string;
    kind?: string;
    description?: string;
  };
};

/**
 * Strict classification from catalog search hits (no fuzzy auto-pick).
 * - One exact normalized name → exact
 * - Multiple exact (any kind/parent) → ambiguous
 * - No exact + one unique prefix → exact (strong prefix)
 * - Otherwise → unresolved (includes substring-only hits)
 */
export function classifyDestinationSearchHits(
  query: string,
  items: DestinationSearchHit[],
): DestinationResolveResult {
  const nq = normalizeDestinationSuggestionKey(query);
  if (!nq) return { status: 'unresolved' };

  const exact = items.filter((p) => normalizeDestinationSuggestionKey(p.name) === nq);
  if (exact.length === 1) {
    const p = exact[0]!;
    return {
      status: 'exact',
      match: {
        placeId: p.id,
        name: p.name,
        kind: p.kind,
        description: p.salesDescription,
      },
    };
  }
  if (exact.length > 1) {
    return { status: 'ambiguous' };
  }

  const prefix = items.filter((p) =>
    normalizeDestinationSuggestionKey(p.name).startsWith(nq),
  );
  if (prefix.length === 1) {
    const p = prefix[0]!;
    return {
      status: 'exact',
      match: {
        placeId: p.id,
        name: p.name,
        kind: p.kind,
        description: p.salesDescription,
      },
    };
  }
  if (prefix.length > 1) {
    return { status: 'ambiguous' };
  }

  return { status: 'unresolved' };
}
