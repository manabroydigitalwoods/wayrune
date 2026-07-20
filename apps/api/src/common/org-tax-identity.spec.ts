import { describe, expect, it } from 'vitest';
import {
  formatOrgTaxDisplaySplitLines,
  formatOrgTaxIdentityLines,
  orgTaxTotalsLabel,
  parseOrgTaxIdentity,
} from './org-tax-identity';

describe('org-tax-identity', () => {
  it('defaults label and reads GSTIN / place of supply', () => {
    const id = parseOrgTaxIdentity('GST', {
      business: {
        gstin: '29AABCD1234E1Z5',
        placeOfSupply: 'KA',
        destinationPlaceOfSupply: 'MH',
      },
    });
    expect(id.taxLabel).toBe('GST');
    expect(id.gstin).toBe('29AABCD1234E1Z5');
    expect(id.placeOfSupply).toBe('KA');
    expect(id.destinationPlaceOfSupply).toBe('MH');
    expect(orgTaxTotalsLabel(id)).toBe('GST');
    expect(formatOrgTaxIdentityLines(id)).toEqual([
      'GSTIN: 29AABCD1234E1Z5',
      'Place of supply: KA',
      'Destination POS: MH',
    ]);
    expect(formatOrgTaxDisplaySplitLines(id, 100)).toEqual(['IGST ₹100']);
  });

  it('maps None label to Tax', () => {
    expect(parseOrgTaxIdentity('None', {}).taxLabel).toBe('Tax');
    expect(parseOrgTaxIdentity(null, {}).taxLabel).toBe('Tax');
  });
});
