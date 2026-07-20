import { describe, expect, it } from 'vitest';
import {
  formatTaxDisplaySplitLines,
  normalizePlaceOfSupply,
  splitTaxDisplay,
  taxDisplaySplitCue,
} from './tax-display-split';

describe('tax-display-split', () => {
  it('normalizes common state aliases', () => {
    expect(normalizePlaceOfSupply('ka')).toBe('KA');
    expect(normalizePlaceOfSupply('Karnataka')).toBe('KA');
    expect(normalizePlaceOfSupply('West Bengal')).toBe('WB');
    expect(normalizePlaceOfSupply('')).toBeNull();
  });

  it('splits intra-state with odd remainder so parts sum to tax', () => {
    const s = splitTaxDisplay({
      orgPlaceOfSupply: 'KA',
      destinationPlaceOfSupply: 'Karnataka',
      taxTotal: 10.01,
    });
    expect(s.regime).toBe('intra');
    expect(s.cgst + s.sgst).toBeCloseTo(10.01, 2);
    expect(s.igst).toBe(0);
    const half = Math.round((10.01 / 2) * 100) / 100;
    expect(s.sgst).toBe(half);
    expect(s.cgst).toBeCloseTo(10.01 - half, 2);
  });

  it('splits inter-state as IGST', () => {
    const s = splitTaxDisplay({
      orgPlaceOfSupply: 'KA',
      destinationPlaceOfSupply: 'MH',
      taxTotal: 100,
    });
    expect(s.regime).toBe('inter');
    expect(s.igst).toBe(100);
    expect(s.cgst).toBe(0);
    expect(s.sgst).toBe(0);
    expect(formatTaxDisplaySplitLines(s)).toEqual(['IGST ₹100']);
    expect(taxDisplaySplitCue(s)).toMatch(/inter-state/);
    expect(taxDisplaySplitCue(s)).toMatch(/not a GST invoice/);
  });

  it('hides breakdown when POS missing or tax zero', () => {
    expect(
      splitTaxDisplay({
        orgPlaceOfSupply: 'KA',
        destinationPlaceOfSupply: null,
        taxTotal: 50,
      }).regime,
    ).toBe('unknown');
    expect(
      formatTaxDisplaySplitLines(
        splitTaxDisplay({
          orgPlaceOfSupply: 'KA',
          destinationPlaceOfSupply: 'MH',
          taxTotal: 0,
        }),
      ),
    ).toEqual([]);
  });
});
