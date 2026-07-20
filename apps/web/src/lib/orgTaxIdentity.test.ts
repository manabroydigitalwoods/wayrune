import { describe, expect, it } from 'vitest';
import {
  formatOrgTaxDisplaySplitLinesUi,
  formatOrgTaxIdentityLinesUi,
  orgTaxTotalsLabelUi,
  parseOrgTaxIdentityUi,
} from './orgTaxIdentity';

describe('orgTaxIdentity', () => {
  it('parses GST label and identity lines', () => {
    const id = parseOrgTaxIdentityUi('GST', {
      business: {
        gstin: '29AABCD1234E1Z5',
        placeOfSupply: 'Karnataka',
        destinationPlaceOfSupply: 'MH',
      },
    });
    expect(orgTaxTotalsLabelUi(id)).toBe('GST');
    expect(formatOrgTaxIdentityLinesUi(id)).toEqual([
      'GSTIN: 29AABCD1234E1Z5',
      'Place of supply: Karnataka',
      'Destination POS: MH',
    ]);
    expect(formatOrgTaxDisplaySplitLinesUi(id, 100)).toEqual(['IGST ₹100']);
  });
});
