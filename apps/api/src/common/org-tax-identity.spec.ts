import { describe, expect, it } from 'vitest';
import {
  formatOrgTaxDisplaySplitLines,
  formatOrgTaxIdentityLines,
  inferredDestinationPosCue,
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
    expect(id.destinationPlaceOfSupplySource).toBe('org');
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

  it('lets trip destination POS override org default', () => {
    const settings = {
      business: {
        placeOfSupply: 'KA',
        destinationPlaceOfSupply: 'MH',
      },
    };
    expect(
      parseOrgTaxIdentity('GST', settings, {
        destinationPlaceOfSupply: 'KA',
      }).destinationPlaceOfSupply,
    ).toBe('KA');
    expect(
      formatOrgTaxDisplaySplitLines(
        parseOrgTaxIdentity('GST', settings, {
          destinationPlaceOfSupply: 'KA',
        }),
        100,
      ),
    ).toEqual(['CGST ₹50', 'SGST ₹50']);
    expect(
      parseOrgTaxIdentity('GST', settings, {
        destinationPlaceOfSupply: null,
      }).destinationPlaceOfSupply,
    ).toBe('MH');
    expect(
      parseOrgTaxIdentity('GST', settings).destinationPlaceOfSupply,
    ).toBe('MH');
  });

  it('surfaces inferred destination POS cue without claiming compliance', () => {
    const id = parseOrgTaxIdentity(
      'GST',
      { business: { placeOfSupply: 'KA', destinationPlaceOfSupply: 'MH' } },
      { inferredDestinationPlaceOfSupply: 'WB' },
    );
    expect(id.destinationPlaceOfSupply).toBe('WB');
    expect(id.destinationPlaceOfSupplySource).toBe('inferred');
    expect(formatOrgTaxIdentityLines(id)).toContain(
      'Destination POS: WB (suggested from destinations)',
    );
    expect(inferredDestinationPosCue(id)).toMatch(/Suggested from destinations: WB/);
    expect(inferredDestinationPosCue(id)).toMatch(/not saved/);
  });
});
