import { describe, expect, it } from 'vitest';
import {
  formatOrgTaxDisplaySplitLinesUi,
  formatOrgTaxIdentityLinesUi,
  inferredDestinationPosCueUi,
  orgTaxTotalsLabelUi,
  parseOrgTaxIdentityUi,
} from './orgTaxIdentity';
import { inferDestinationPlaceOfSupplyFromLabelsUi } from './destinationPosInfer';

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
    expect(id.destinationPlaceOfSupplySource).toBe('org');
    expect(formatOrgTaxIdentityLinesUi(id)).toEqual([
      'GSTIN: 29AABCD1234E1Z5',
      'Place of supply: Karnataka',
      'Destination POS: MH',
    ]);
    expect(formatOrgTaxDisplaySplitLinesUi(id, 100)).toEqual(['IGST ₹100']);
  });

  it('applies trip destination POS override', () => {
    const settings = {
      business: { placeOfSupply: 'KA', destinationPlaceOfSupply: 'MH' },
    };
    expect(
      parseOrgTaxIdentityUi('GST', settings, {
        destinationPlaceOfSupply: 'KA',
      }).destinationPlaceOfSupply,
    ).toBe('KA');
    expect(
      formatOrgTaxDisplaySplitLinesUi(
        parseOrgTaxIdentityUi('GST', settings, {
          destinationPlaceOfSupply: 'KA',
        }),
        80,
      ),
    ).toEqual(['CGST ₹40', 'SGST ₹40']);
  });

  it('prefers inferred over org when trip override blank', () => {
    const id = parseOrgTaxIdentityUi(
      'GST',
      { business: { placeOfSupply: 'KA', destinationPlaceOfSupply: 'MH' } },
      { inferredDestinationPlaceOfSupply: 'WB' },
    );
    expect(id.destinationPlaceOfSupply).toBe('WB');
    expect(id.destinationPlaceOfSupplySource).toBe('inferred');
    expect(inferredDestinationPosCueUi(id)).toMatch(/WB/);
    expect(inferDestinationPlaceOfSupplyFromLabelsUi(['Goa'])).toBe('GA');
  });
});
