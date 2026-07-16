import { calcQuoteTotals, computeMissingInquiryFields } from '../common/helpers';
import { describe, expect, it } from 'vitest';

describe('computeMissingInquiryFields', () => {
  it('requires startDate only for international trips', () => {
    expect(
      computeMissingInquiryFields({
        destinations: ['Kerala'],
        adults: 2,
        budgetAmount: 50000,
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
      }),
    ).not.toContain('startDate');

    expect(
      computeMissingInquiryFields({
        destinations: ['Kerala'],
        adults: 2,
        budgetAmount: 50000,
        travelType: 'leisure',
        domesticOrIntl: 'international',
      }),
    ).toContain('startDate');
  });
});

describe('calcQuoteTotals', () => {
  it('computes margin and tax', () => {
    const totals = calcQuoteTotals(
      [{ quantity: 2, unitCost: 100, unitSell: 150, taxPercent: 10 }],
      20,
    );
    expect(totals.costTotal).toBe(200);
    expect(totals.taxTotal).toBe(30);
    expect(totals.sellTotal).toBe(310);
    expect(totals.marginAmount).toBe(80);
  });
});
