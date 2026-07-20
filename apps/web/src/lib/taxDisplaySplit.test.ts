import { describe, expect, it } from 'vitest';
import {
  formatTaxDisplaySplitLinesUi,
  splitTaxDisplayUi,
  taxDisplaySplitCueUi,
} from './taxDisplaySplit';

describe('taxDisplaySplit', () => {
  it('splits intra and inter for UI', () => {
    expect(
      splitTaxDisplayUi({
        orgPlaceOfSupply: 'KA',
        destinationPlaceOfSupply: 'KA',
        taxTotal: 100,
      }),
    ).toMatchObject({ regime: 'intra', cgst: 50, sgst: 50, igst: 0 });
    expect(
      formatTaxDisplaySplitLinesUi(
        splitTaxDisplayUi({
          orgPlaceOfSupply: 'KA',
          destinationPlaceOfSupply: 'MH',
          taxTotal: 200,
        }),
      ),
    ).toEqual(['IGST ₹200']);
    expect(
      taxDisplaySplitCueUi(
        splitTaxDisplayUi({
          orgPlaceOfSupply: 'KA',
          destinationPlaceOfSupply: 'MH',
          taxTotal: 200,
        }),
      ),
    ).toMatch(/not a GST invoice/);
  });
});
