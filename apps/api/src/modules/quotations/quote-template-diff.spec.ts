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
    expect(diff.rows).toEqual([
      { field: 'Innova · unit sell', thisTip: '3000', current: '3500' },
    ]);
  });

  it('builds side-by-side rows for add/remove and meta', () => {
    const prior: QuoteTemplateContent = {
      destinationHint: 'Goa',
      folder: 'Beach/Goa',
      items: [line({ description: 'Old hotel', rateKind: 'hotel' })],
    };
    const active: QuoteTemplateContent = {
      destinationHint: 'North Goa',
      folder: 'Beach/Goa North',
      items: [line({ description: 'New hotel', rateKind: 'hotel' })],
    };
    const diff = diffQuoteTemplateContent(prior, active);
    expect(diff.rows).toEqual(
      expect.arrayContaining([
        { field: 'Old hotel', thisTip: 'in this version', current: '—' },
        { field: 'New hotel', thisTip: '—', current: 'in current' },
        {
          field: 'Destination',
          thisTip: 'Goa',
          current: 'North Goa',
        },
        {
          field: 'Folder',
          thisTip: 'Beach/Goa',
          current: 'Beach/Goa North',
        },
      ]),
    );
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

  it('diffs story days by dayNumber (title + item count)', () => {
    const prior: QuoteTemplateContent = {
      items: [],
      itinerary: {
        days: [
          {
            id: 'd1',
            dayNumber: 1,
            title: 'Arrive',
            items: [{ id: 'i1', type: 'sightseeing', title: 'Check-in' }],
          },
          {
            id: 'd2',
            dayNumber: 2,
            title: 'Explore',
            items: [
              { id: 'i2', type: 'sightseeing', title: 'Market' },
              { id: 'i3', type: 'sightseeing', title: 'Sunset' },
            ],
          },
        ],
      },
    };
    const active: QuoteTemplateContent = {
      items: [],
      itinerary: {
        days: [
          {
            id: 'd1b',
            dayNumber: 1,
            title: 'Arrival',
            items: [{ id: 'i1b', type: 'sightseeing', title: 'Check-in' }],
          },
          {
            id: 'd2b',
            dayNumber: 2,
            title: 'Explore',
            items: [{ id: 'i2b', type: 'sightseeing', title: 'Market' }],
          },
          {
            id: 'd3b',
            dayNumber: 3,
            title: 'Depart',
            items: [],
          },
        ],
      },
    };
    const diff = diffQuoteTemplateContent(prior, active);
    expect(diff.metaChanges.some((m) => m.includes('story days'))).toBe(true);
    expect(diff.rows).toEqual(
      expect.arrayContaining([
        {
          field: 'Day 1 · title',
          thisTip: 'Arrive',
          current: 'Arrival',
        },
        {
          field: 'Day 2 · items',
          thisTip: '2 items',
          current: '1 item',
        },
        {
          field: 'Day 3',
          thisTip: '—',
          current: 'Depart',
        },
      ]),
    );
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
