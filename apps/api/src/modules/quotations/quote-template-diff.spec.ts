import { describe, expect, it } from 'vitest';
import type { QuotationItem, QuoteTemplateContent } from '@wayrune/contracts';
import {
  diffQuoteTemplateContent,
  formatQuoteTemplateDiffSummary,
  templateLineDiffKey,
} from './quote-template-diff';

function line(
  overrides: Partial<QuotationItem> & { description: string },
): QuotationItem {
  return {
    id: overrides.id ?? `id-${overrides.description}`,
    description: overrides.description,
    quantity: overrides.quantity ?? 1,
    unitCost: overrides.unitCost ?? 1000,
    unitSell: overrides.unitSell ?? 1200,
    taxPercent: overrides.taxPercent ?? 0,
    pricingUnit: overrides.pricingUnit ?? 'per_service',
    rateKind: overrides.rateKind,
    serviceType: overrides.serviceType,
  } as QuotationItem;
}

describe('templateLineDiffKey', () => {
  it('ignores reminted ids', () => {
    const a = line({ id: 'a', description: 'Hotel stay', rateKind: 'hotel' });
    const b = line({ id: 'b', description: 'Hotel stay', rateKind: 'hotel' });
    expect(templateLineDiffKey(a)).toBe(templateLineDiffKey(b));
  });
});

describe('diffQuoteTemplateContent', () => {
  it('returns null summary when identical', () => {
    const content: QuoteTemplateContent = {
      destinationHint: 'Goa',
      items: [line({ description: 'Hotel', rateKind: 'hotel' })],
    };
    const diff = diffQuoteTemplateContent(content, content);
    expect(diff.summary).toBeNull();
    expect(diff.addedTitles).toEqual([]);
    expect(diff.removedTitles).toEqual([]);
  });

  it('detects added and removed lines', () => {
    const prior: QuoteTemplateContent = {
      items: [
        line({ description: 'Old hotel', rateKind: 'hotel' }),
        line({ description: 'Transfer', rateKind: 'transfer' }),
      ],
    };
    const active: QuoteTemplateContent = {
      items: [
        line({ description: 'New hotel', rateKind: 'hotel' }),
        line({ description: 'Transfer', rateKind: 'transfer' }),
      ],
    };
    const diff = diffQuoteTemplateContent(prior, active);
    expect(diff.removedTitles).toEqual(['Old hotel']);
    expect(diff.addedTitles).toEqual(['New hotel']);
    expect(diff.summary).toMatch(/\+1/);
    expect(diff.summary).toMatch(/−1/);
  });

  it('detects commercial changes on same line key', () => {
    const prior: QuoteTemplateContent = {
      items: [line({ description: 'Innova', rateKind: 'transfer', unitSell: 3000 })],
    };
    const active: QuoteTemplateContent = {
      items: [line({ description: 'Innova', rateKind: 'transfer', unitSell: 3500 })],
    };
    const diff = diffQuoteTemplateContent(prior, active);
    expect(diff.changedTitles).toEqual(['Innova']);
    expect(diff.summary).toMatch(/~1/);
  });

  it('detects meta-only changes', () => {
    const prior: QuoteTemplateContent = {
      destinationHint: 'Goa',
      inclusions: 'Breakfast',
      items: [],
    };
    const active: QuoteTemplateContent = {
      destinationHint: 'Goa North',
      inclusions: 'Breakfast\nDinner',
      items: [],
    };
    const diff = diffQuoteTemplateContent(prior, active);
    expect(diff.metaChanges).toEqual(expect.arrayContaining(['destination', 'inclusions']));
    expect(diff.summary).toMatch(/meta:/);
  });
});

describe('formatQuoteTemplateDiffSummary', () => {
  it('returns null when empty', () => {
    expect(
      formatQuoteTemplateDiffSummary({
        addedTitles: [],
        removedTitles: [],
        changedTitles: [],
        metaChanges: [],
      }),
    ).toBeNull();
  });
});
