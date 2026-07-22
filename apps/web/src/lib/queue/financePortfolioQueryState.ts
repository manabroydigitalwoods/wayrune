import { omitEmptyParams } from './types';

export type FinancePortfolioStatusFilter =
  | 'confirmed'
  | 'booking_in_progress'
  | 'ready_to_travel'
  | 'completed';

const STATUS_OPTIONS: readonly FinancePortfolioStatusFilter[] = [
  'confirmed',
  'booking_in_progress',
  'ready_to_travel',
  'completed',
];

const KNOWN_KEYS = ['q', 'from', 'to', 'period', 'status'] as const;

/** Stable Finance profitability (portfolio) queue query — travel-date window + status. */
export type FinancePortfolioQueryState = {
  q?: string;
  from?: string | null;
  to?: string | null;
  period?: string | null;
  status?: FinancePortfolioStatusFilter;
};

function parseStatus(raw: string | null | undefined): FinancePortfolioStatusFilter | undefined {
  const value = raw?.trim();
  return value && (STATUS_OPTIONS as readonly string[]).includes(value)
    ? (value as FinancePortfolioStatusFilter)
    : undefined;
}

export function parseFinancePortfolioQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): FinancePortfolioQueryState {
  return {
    q: params.get('q')?.trim() || undefined,
    from: params.get('from') || null,
    to: params.get('to') || null,
    period: params.get('period') || null,
    status: parseStatus(params.get('status')),
  };
}

export function serializeFinancePortfolioQueryState(
  state: FinancePortfolioQueryState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.from) params.set('from', state.from);
  if (state.to) params.set('to', state.to);
  if (state.period && state.period !== 'custom') params.set('period', state.period);
  if (state.status) params.set('status', state.status);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchFinancePortfolioQueryParams(
  current: URLSearchParams,
  patch: Partial<FinancePortfolioQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseFinancePortfolioQueryState(current);
  const next: FinancePortfolioQueryState = patch.clearFilters
    ? {
        q: patch.q !== undefined ? patch.q : parsed.q,
        // Travel window is the board's working range, not a filter chip — keep it.
        from: parsed.from,
        to: parsed.to,
        period: parsed.period,
      }
    : {
        ...parsed,
        ...patch,
        from: patch.from !== undefined ? patch.from : parsed.from,
        to: patch.to !== undefined ? patch.to : parsed.to,
        period: patch.period !== undefined ? patch.period : parsed.period,
      };

  const serialized = serializeFinancePortfolioQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function financePortfolioQueryHasFilters(state: FinancePortfolioQueryState): boolean {
  return Boolean(state.from || state.to || state.status);
}

/** Build the `/operations/finance/portfolio` API query string from Portfolio queue state. */
export function financePortfolioApiQueryFromState(state: FinancePortfolioQueryState): string {
  const q = new URLSearchParams();
  if (state.from) q.set('from', state.from);
  if (state.to) q.set('to', state.to);
  return q.toString();
}
