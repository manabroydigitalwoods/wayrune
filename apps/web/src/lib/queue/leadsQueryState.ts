import { omitEmptyParams } from './types';

export type LeadsView = 'board' | 'table';
export type LeadsSortDir = 'asc' | 'desc';
export type LeadsFollowUpFilter = 'overdue' | 'none';

/** Column ids allowed in `?sort=` (table view). */
export const LEADS_TABLE_SORT_IDS = [
  'title',
  'contact',
  'email',
  'phone',
  'stage',
  'followUp',
  'priority',
  'source',
  'owner',
  'createdAt',
] as const;

export type LeadsTableSortId = (typeof LEADS_TABLE_SORT_IDS)[number];

const LEADS_TABLE_SORT_ID_SET = new Set<string>(LEADS_TABLE_SORT_IDS);

/** Stable Leads queue query — backward-compatible with existing deep-links. */
export type LeadsQueryState = {
  view: LeadsView;
  owner?: 'me' | 'unassigned' | string;
  followUp?: LeadsFollowUpFilter;
  followUpFrom?: string | null;
  followUpTo?: string | null;
  followUpPeriod?: string | null;
  stage?: string;
  priority?: string;
  source?: string;
  campaign?: string;
  q?: string;
  /** Table column id when sorted. */
  sort?: LeadsTableSortId;
  /** Sort direction; only meaningful when `sort` is set. */
  dir?: LeadsSortDir;
};

function parseSortId(raw: string | null | undefined): LeadsTableSortId | undefined {
  const id = raw?.trim();
  if (!id || !LEADS_TABLE_SORT_ID_SET.has(id)) return undefined;
  return id as LeadsTableSortId;
}

function parseSortDir(raw: string | null | undefined): LeadsSortDir | undefined {
  if (raw === 'asc' || raw === 'desc') return raw;
  return undefined;
}

function parseFollowUp(raw: string | null | undefined): LeadsFollowUpFilter | undefined {
  if (raw === 'overdue' || raw === 'none') return raw;
  return undefined;
}

export function parseLeadsQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
  fallbackView: LeadsView = 'board',
): LeadsQueryState {
  const rawView = params.get('view');
  const view: LeadsView = rawView === 'table' || rawView === 'board' ? rawView : fallbackView;
  const ownerRaw = params.get('owner')?.trim() || undefined;
  const followUp = parseFollowUp(params.get('followUp'));
  const sort = parseSortId(params.get('sort'));
  const dir = sort ? parseSortDir(params.get('dir')) ?? 'asc' : undefined;
  return {
    view,
    owner: ownerRaw || undefined,
    followUp,
    followUpFrom: params.get('followUpFrom') || null,
    followUpTo: params.get('followUpTo') || null,
    followUpPeriod: params.get('followUpPeriod') || null,
    stage: params.get('stage')?.trim() || undefined,
    priority: params.get('priority')?.trim() || undefined,
    source: params.get('source')?.trim() || undefined,
    campaign: params.get('campaign')?.trim() || undefined,
    q: params.get('q')?.trim() || undefined,
    sort,
    dir,
  };
}

export function serializeLeadsQueryState(state: LeadsQueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('view', state.view);
  if (state.owner) params.set('owner', state.owner);
  if (state.followUp) params.set('followUp', state.followUp);
  if (state.followUpFrom) params.set('followUpFrom', state.followUpFrom);
  if (state.followUpTo) params.set('followUpTo', state.followUpTo);
  if (state.followUpPeriod && state.followUpPeriod !== 'custom') {
    params.set('followUpPeriod', state.followUpPeriod);
  }
  if (state.stage) params.set('stage', state.stage);
  if (state.priority) params.set('priority', state.priority);
  if (state.source) params.set('source', state.source);
  if (state.campaign) params.set('campaign', state.campaign);
  if (state.q) params.set('q', state.q);
  if (state.sort) {
    params.set('sort', state.sort);
    params.set('dir', state.dir === 'desc' ? 'desc' : 'asc');
  }
  return omitEmptyParams(params);
}

/** TanStack SortingState shape used by DataTable (avoid importing table types here). */
export type LeadsSortingState = Array<{ id: string; desc: boolean }>;

export function leadsSortingFromQuery(state: LeadsQueryState): LeadsSortingState {
  if (!state.sort) return [];
  return [{ id: state.sort, desc: state.dir === 'desc' }];
}

export function leadsSortPatchFromSorting(
  sorting: LeadsSortingState,
): Pick<LeadsQueryState, 'sort' | 'dir'> {
  const first = sorting[0];
  const sort = first ? parseSortId(first.id) : undefined;
  if (!sort) return { sort: undefined, dir: undefined };
  return { sort, dir: first.desc ? 'desc' : 'asc' };
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchLeadsQueryParams(
  current: URLSearchParams,
  patch: Partial<LeadsQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseLeadsQueryState(current);
  const next: LeadsQueryState = patch.clearFilters
    ? {
        view: patch.view ?? parsed.view,
        q: patch.q !== undefined ? patch.q : parsed.q,
        // Sort is table chrome, not a filter chip — keep unless explicitly patched.
        sort: patch.sort !== undefined ? patch.sort : parsed.sort,
        dir: patch.dir !== undefined ? patch.dir : parsed.dir,
      }
    : {
        ...parsed,
        ...patch,
        followUpFrom:
          patch.followUpFrom !== undefined ? patch.followUpFrom : parsed.followUpFrom,
        followUpTo: patch.followUpTo !== undefined ? patch.followUpTo : parsed.followUpTo,
        followUpPeriod:
          patch.followUpPeriod !== undefined ? patch.followUpPeriod : parsed.followUpPeriod,
      };

  if (!next.sort) {
    next.dir = undefined;
  } else if (!next.dir) {
    next.dir = 'asc';
  }

  if (patch.followUp === 'overdue' || patch.followUp === 'none') {
    next.followUpFrom = null;
    next.followUpTo = null;
    next.followUpPeriod = null;
  }
  if (patch.followUpFrom || patch.followUpTo || patch.followUpPeriod) {
    next.followUp = undefined;
  }

  const serialized = serializeLeadsQueryState(next);
  // Preserve unknown keys (e.g. future params)
  for (const [key, value] of current.entries()) {
    if (
      ![
        'view',
        'owner',
        'followUp',
        'followUpFrom',
        'followUpTo',
        'followUpPeriod',
        'stage',
        'priority',
        'source',
        'campaign',
        'q',
        'sort',
        'dir',
      ].includes(key) &&
      !serialized.has(key)
    ) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function leadsQueryHasFilters(state: LeadsQueryState): boolean {
  return Boolean(
    state.owner ||
      state.followUp ||
      state.followUpFrom ||
      state.followUpTo ||
      state.stage ||
      state.priority ||
      state.source ||
      state.campaign,
  );
}

export function leadsPinLabel(state: LeadsQueryState): string {
  const parts: string[] = [];
  if (state.followUp === 'overdue') parts.push('Overdue');
  if (state.followUp === 'none') parts.push('No follow-up');
  if (state.owner === 'me') parts.push('My leads');
  else if (state.owner === 'unassigned') parts.push('Unassigned');
  else if (state.owner) parts.push('Owner');
  if (state.stage) parts.push(state.stage);
  if (state.priority) parts.push(state.priority);
  if (state.source) parts.push(state.source);
  if (state.campaign) parts.push('Campaign');
  if (state.followUpFrom || state.followUpTo) parts.push('Due range');
  if (state.q) parts.push(`“${state.q.slice(0, 16)}”`);
  if (!parts.length) return 'Leads';
  return `Leads · ${parts.slice(0, 3).join(' · ')}`;
}

export function canPinLeadsView(state: LeadsQueryState): boolean {
  return leadsQueryHasFilters(state) || Boolean(state.q);
}

/** Build list/board API query string from Leads queue state. */
export function leadsApiQueryFromState(
  state: LeadsQueryState,
  opts?: { pageSize?: number },
): string {
  const q = new URLSearchParams();
  if (opts?.pageSize) q.set('pageSize', String(opts.pageSize));
  if (state.followUp === 'overdue' || state.followUp === 'none') {
    q.set('followUp', state.followUp);
  } else {
    if (state.followUpFrom) q.set('followUpFrom', state.followUpFrom);
    if (state.followUpTo) q.set('followUpTo', state.followUpTo);
  }
  if (state.owner === 'me') q.set('owner', 'me');
  else if (state.owner) q.set('owner', state.owner);
  if (state.stage) q.set('stageKey', state.stage);
  if (state.priority) q.set('priority', state.priority);
  if (state.source) q.set('sourceKey', state.source);
  if (state.campaign) q.set('campaignId', state.campaign);
  if (state.q) q.set('q', state.q);
  return q.toString();
}

/** Same filters as list/board — used by GET /leads/facets. */
export function leadsFacetsApiQueryFromState(state: LeadsQueryState): string {
  return leadsApiQueryFromState(state);
}

export type LeadFacets = {
  source: Record<string, number>;
  stage: Record<string, number>;
  priority: Record<string, number>;
  owner: Record<string, number>;
  followUp: Record<string, number>;
  campaign: Record<string, number>;
};

export function facetCountLabel(
  facets: LeadFacets | null | undefined,
  dimension: keyof LeadFacets,
  value: string,
): string | undefined {
  if (!facets) return undefined;
  const count = facets[dimension]?.[value];
  if (count == null || count <= 0) return undefined;
  return String(count);
}
