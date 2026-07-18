import { describe, expect, it } from 'vitest';
import {
  checklistToText,
  contentFromVersionFields,
  parseQuoteTemplateContent,
  remintQuoteItems,
} from './quote-template-content';

describe('quote-template-content', () => {
  it('joins legacy checklist arrays', () => {
    expect(checklistToText(['Stay', 'Breakfast'])).toBe('Stay\nBreakfast');
    expect(checklistToText('Stay\nBreakfast')).toBe('Stay\nBreakfast');
    expect(checklistToText([])).toBeNull();
  });

  it('parses seed-style template content', () => {
    const content = parseQuoteTemplateContent({
      inclusions: ['Stay', 'Breakfast', 'Airport transfer'],
      exclusions: ['Flights', 'Personal expenses'],
    });
    expect(checklistToText(content.inclusions)).toContain('Airport transfer');
    expect(checklistToText(content.exclusions)).toContain('Flights');
  });

  it('remints item ids', () => {
    const items = remintQuoteItems([
      {
        id: 'old-1',
        description: 'Hotel',
        quantity: 2,
        unitCost: 1000,
        unitSell: 1200,
        taxPercent: 5,
        pricingUnit: 'per_room',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].id).not.toBe('old-1');
    expect(items[0].description).toBe('Hotel');
  });

  it('builds content from a quotation version', () => {
    const content = contentFromVersionFields({
      currency: 'INR',
      itemsJson: [
        {
          id: 'line-1',
          description: 'Transfer',
          quantity: 1,
          unitCost: 500,
          unitSell: 800,
          taxPercent: 0,
          pricingUnit: 'per_service',
        },
      ],
      inclusions: 'Stay',
      exclusions: 'Flights',
      terms: 'Pay 50% to confirm',
    });
    expect(content.items).toHaveLength(1);
    expect(content.inclusions).toBe('Stay');
  });
});
