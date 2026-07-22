/** Lead queue filters shared by list, board, and facets. */
export type LeadListFilters = {
  stageKey?: string;
  q?: string;
  priority?: string;
  followUp?: string;
  owner?: string;
  followUpFrom?: string | null;
  followUpTo?: string | null;
  sourceKey?: string;
  campaignId?: string;
};

export type LeadFacetKey =
  | 'source'
  | 'stage'
  | 'priority'
  | 'owner'
  | 'followUp'
  | 'campaign';

export const LEAD_FACET_KEYS: readonly LeadFacetKey[] = [
  'source',
  'stage',
  'priority',
  'owner',
  'followUp',
  'campaign',
] as const;

/** Drop the selected value for one facet so counts show alternatives in context. */
export function filtersOmittingFacet(
  filters: LeadListFilters,
  omit: LeadFacetKey,
): LeadListFilters {
  const next = { ...filters };
  if (omit === 'source') next.sourceKey = undefined;
  if (omit === 'stage') next.stageKey = undefined;
  if (omit === 'priority') next.priority = undefined;
  if (omit === 'owner') next.owner = undefined;
  if (omit === 'followUp') {
    next.followUp = undefined;
    next.followUpFrom = null;
    next.followUpTo = null;
  }
  if (omit === 'campaign') next.campaignId = undefined;
  return next;
}

export type LeadFacetsResult = {
  source: Record<string, number>;
  stage: Record<string, number>;
  priority: Record<string, number>;
  owner: Record<string, number>;
  followUp: Record<string, number>;
  campaign: Record<string, number>;
};

export function emptyLeadFacets(): LeadFacetsResult {
  return {
    source: {},
    stage: {},
    priority: {},
    owner: {},
    followUp: {},
    campaign: {},
  };
}
