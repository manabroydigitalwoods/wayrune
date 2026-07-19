/** URL / click-through filters for finance aging Age buckets. */

export const AGING_BUCKET_KEYS = [
  'current',
  'd1_30',
  'd31_60',
  'd61_90',
  'd90_plus',
  'noDue',
] as const;

export type AgingBucketKey = (typeof AGING_BUCKET_KEYS)[number];

export function isAgingBucketKey(value: string | null | undefined): value is AgingBucketKey {
  return Boolean(value && (AGING_BUCKET_KEYS as readonly string[]).includes(value));
}

export function parseAgingBucketParam(
  params: URLSearchParams | { get: (key: string) => string | null },
): AgingBucketKey | null {
  const raw = (params.get('bucket') || '').trim();
  return isAgingBucketKey(raw) ? raw : null;
}

/** Relative finance aging path with optional Age bucket. */
export function financeAgingBucketHref(opts: {
  mode?: 'receivables' | 'overdue' | 'payables';
  bucket?: AgingBucketKey | null;
}): string {
  const base =
    opts.mode === 'overdue'
      ? '/finance/overdue'
      : opts.mode === 'payables'
        ? '/finance/payables'
        : '/finance';
  if (!opts.bucket) return base;
  const q = new URLSearchParams();
  q.set('bucket', opts.bucket);
  return `${base}?${q.toString()}`;
}
