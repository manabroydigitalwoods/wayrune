import { describe, expect, it } from 'vitest';
import { rateChartPath, supplierContractsPath } from './quoteServiceDetails';

describe('supplierContractsPath', () => {
  it('returns contracts deep-link', () => {
    expect(supplierContractsPath('sup-1')).toBe('/suppliers/sup-1#contracts');
    expect(supplierContractsPath('  ')).toBeNull();
    expect(supplierContractsPath(null)).toBeNull();
  });
});

describe('rateChartPath', () => {
  it('points hotel suppliers at rate chart hash', () => {
    expect(rateChartPath({ rateKind: 'hotel', supplierId: 'sup-1' })).toBe(
      '/suppliers/sup-1#supplier-rate-chart',
    );
    expect(rateChartPath({ rateKind: 'transfer' })).toBe('/rates');
  });
});
