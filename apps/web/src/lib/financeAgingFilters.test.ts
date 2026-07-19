import { describe, expect, it } from 'vitest';
import {
  financeAgingBucketHref,
  isAgingBucketKey,
  parseAgingBucketParam,
} from './financeAgingFilters';

describe('financeAgingFilters', () => {
  it('parses valid bucket query params', () => {
    expect(parseAgingBucketParam(new URLSearchParams('bucket=d31_60'))).toBe(
      'd31_60',
    );
    expect(parseAgingBucketParam(new URLSearchParams('bucket=current'))).toBe(
      'current',
    );
    expect(parseAgingBucketParam(new URLSearchParams('bucket=weird'))).toBeNull();
    expect(isAgingBucketKey('d90_plus')).toBe(true);
    expect(isAgingBucketKey('all')).toBe(false);
  });

  it('builds mode + bucket hrefs', () => {
    expect(financeAgingBucketHref({})).toBe('/finance');
    expect(financeAgingBucketHref({ mode: 'overdue', bucket: 'd1_30' })).toBe(
      '/finance/overdue?bucket=d1_30',
    );
    expect(
      financeAgingBucketHref({ mode: 'payables', bucket: 'd61_90' }),
    ).toBe('/finance/payables?bucket=d61_90');
  });
});
