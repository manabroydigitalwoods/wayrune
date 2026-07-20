import { describe, expect, it } from 'vitest';
import {
  composePublicPaymentTaxDisplay,
  formatReceivableTaxNotes,
} from './payment-link-tax-display';

const identity = {
  taxLabel: 'GST',
  gstin: '29AAAAA0000A1Z5',
  placeOfSupply: 'KA',
  destinationPlaceOfSupply: 'KA',
  destinationPlaceOfSupplySource: 'trip' as const,
};

describe('composePublicPaymentTaxDisplay', () => {
  it('pro-rates tax onto the instalment and splits intra-state', () => {
    const d = composePublicPaymentTaxDisplay({
      instalmentAmount: 55000,
      quoteSellTotal: 110000,
      quoteTaxTotal: 10000,
      taxIdentity: identity,
    });
    expect(d).toMatchObject({
      instalmentTaxShare: 5000,
      instalmentSellExTax: 50000,
      quoteTaxTotal: 10000,
    });
    expect(d!.split.regime).toBe('intra');
    expect(d!.split.cgst + d!.split.sgst).toBeCloseTo(5000, 2);
    expect(d!.splitLines.some((l) => l.startsWith('CGST'))).toBe(true);
    expect(d!.splitCue).toMatch(/not a GST invoice claim/);
  });

  it('uses IGST when destination POS differs', () => {
    const d = composePublicPaymentTaxDisplay({
      instalmentAmount: 11000,
      quoteSellTotal: 110000,
      quoteTaxTotal: 10000,
      taxIdentity: {
        ...identity,
        destinationPlaceOfSupply: 'MH',
      },
    });
    expect(d!.instalmentTaxShare).toBe(1000);
    expect(d!.split.regime).toBe('inter');
    expect(d!.split.igst).toBe(1000);
  });

  it('returns null without identity, tax, or amount', () => {
    expect(
      composePublicPaymentTaxDisplay({
        instalmentAmount: 1000,
        quoteSellTotal: 10000,
        quoteTaxTotal: 500,
        taxIdentity: null,
      }),
    ).toBeNull();
    expect(
      composePublicPaymentTaxDisplay({
        instalmentAmount: 1000,
        quoteSellTotal: 10000,
        quoteTaxTotal: 0,
        taxIdentity: identity,
      }),
    ).toBeNull();
    expect(
      composePublicPaymentTaxDisplay({
        instalmentAmount: 0,
        quoteSellTotal: 10000,
        quoteTaxTotal: 500,
        taxIdentity: identity,
      }),
    ).toBeNull();
  });

  it('formats receivable tax notes', () => {
    const d = composePublicPaymentTaxDisplay({
      instalmentAmount: 55000,
      quoteSellTotal: 110000,
      quoteTaxTotal: 10000,
      taxIdentity: identity,
    })!;
    const note = formatReceivableTaxNotes(d);
    expect(note).toMatch(/CGST/);
    expect(note).toMatch(/GSTIN/);
    expect(note).toMatch(/not a GST invoice claim/);
  });
});
