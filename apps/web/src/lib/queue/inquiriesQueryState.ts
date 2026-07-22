import { omitEmptyParams } from './types';

/**
 * Stable Inquiries queue query — backward-compatible with existing deep-links.
 *
 * NB: the FilterMenu status filter is serialized as `statusFilter` (not `status`)
 * because `?status=open` is a reserved legacy redirect key on this page
 * (see `apps/web/src/lib/agencyRoutes.ts` LEGACY_REDIRECTS).
 */
export type InquiriesQueryState = {
  q?: string;
  statusFilter?: string;
  incomplete?: boolean;
  unassigned?: boolean;
  stale?: boolean;
};

const KNOWN_KEYS = ['q', 'statusFilter', 'incomplete', 'unassigned', 'stale'] as const;

function parseBool(raw: string | null | undefined): boolean {
  return raw === '1' || raw === 'true';
}

export function parseInquiriesQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): InquiriesQueryState {
  return {
    q: params.get('q')?.trim() || undefined,
    statusFilter: params.get('statusFilter')?.trim() || undefined,
    incomplete: parseBool(params.get('incomplete')),
    unassigned: parseBool(params.get('unassigned')),
    stale: parseBool(params.get('stale')),
  };
}

export function serializeInquiriesQueryState(state: InquiriesQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.statusFilter) params.set('statusFilter', state.statusFilter);
  if (state.incomplete) params.set('incomplete', '1');
  if (state.unassigned) params.set('unassigned', '1');
  if (state.stale) params.set('stale', '1');
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys (e.g. `leadId`). */
export function patchInquiriesQueryParams(
  current: URLSearchParams,
  patch: Partial<InquiriesQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseInquiriesQueryState(current);
  const next: InquiriesQueryState = patch.clearFilters
    ? { q: patch.q !== undefined ? patch.q : parsed.q }
    : { ...parsed, ...patch };

  const serialized = serializeInquiriesQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function inquiriesQueryHasFilters(state: InquiriesQueryState): boolean {
  return Boolean(state.statusFilter || state.incomplete || state.unassigned || state.stale);
}
