import { omitEmptyParams } from './types';
import { AGING_BUCKET_KEYS, isAgingBucketKey, type AgingBucketKey } from '../financeAgingFilters';

export type FinanceAgingStatusFilter = 'scheduled' | 'partial' | 'overdue';

const STATUS_OPTIONS: readonly FinanceAgingStatusFilter[] = ['scheduled', 'partial', 'overdue'];
const KNOWN_KEYS = ['q', 'bucket', 'status'] as const;

/**
 * Stable Finance aging queue query — backward-compatible with the existing
 * `?bucket=` deep-link (see `financeAgingFilters.ts` / `agingPackHref`).
 * Aging mode (receivables / overdue / payables) lives on the route, not here.
 */
export type FinanceAgingQueryState = {
  q?: string;
  bucket?: AgingBucketKey;
  status?: FinanceAgingStatusFilter;
};

function parseStatus(raw: string | null | undefined): FinanceAgingStatusFilter | undefined {
  const value = raw?.trim();
  return value && (STATUS_OPTIONS as readonly string[]).includes(value)
    ? (value as FinanceAgingStatusFilter)
    : undefined;
}

export function parseFinanceAgingQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): FinanceAgingQueryState {
  const bucket = params.get('bucket');
  return {
    q: params.get('q')?.trim() || undefined,
    bucket: isAgingBucketKey(bucket) ? bucket : undefined,
    status: parseStatus(params.get('status')),
  };
}

export function serializeFinanceAgingQueryState(state: FinanceAgingQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.bucket) params.set('bucket', state.bucket);
  if (state.status) params.set('status', state.status);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchFinanceAgingQueryParams(
  current: URLSearchParams,
  patch: Partial<FinanceAgingQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseFinanceAgingQueryState(current);
  const next: FinanceAgingQueryState = patch.clearFilters
    ? { q: patch.q !== undefined ? patch.q : parsed.q }
    : { ...parsed, ...patch };

  const serialized = serializeFinanceAgingQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function financeAgingQueryHasFilters(state: FinanceAgingQueryState): boolean {
  return Boolean(state.bucket || state.status);
}

export { AGING_BUCKET_KEYS };
export type { AgingBucketKey };
