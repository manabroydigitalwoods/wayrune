import type { QuotationItem, QuoteTemplateContent } from '@wayrune/contracts';
import { QuotationItemSchema, QuoteTemplateContentSchema } from '@wayrune/contracts';

export function checklistToText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    const lines = value
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean);
    return lines.length ? lines.join('\n') : null;
  }
  return null;
}

export function parseQuoteTemplateContent(raw: unknown): QuoteTemplateContent {
  const parsed = QuoteTemplateContentSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return {};
}

/** Fresh line ids so template copies do not collide with live quote lines. */
export function remintQuoteItems(items: QuotationItem[], prefix = 'tpl'): QuotationItem[] {
  const stamp = Date.now();
  return items.map((item, i) => {
    const next = {
      ...item,
      id: `${prefix}-${stamp}-${i}`,
      description: item.description,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitSell: item.unitSell,
      taxPercent: item.taxPercent,
      pricingUnit: item.pricingUnit,
    };
    return QuotationItemSchema.parse(next);
  });
}

export function contentFromVersionFields(input: {
  currency: string;
  itemsJson: unknown;
  inclusions: string | null;
  exclusions: string | null;
  terms: string | null;
  destinationHint?: string | null;
}): QuoteTemplateContent {
  const itemsRaw = Array.isArray(input.itemsJson) ? input.itemsJson : [];
  const items: QuotationItem[] = [];
  for (const row of itemsRaw) {
    const parsed = QuotationItemSchema.safeParse(row);
    if (parsed.success) items.push(parsed.data);
  }
  return {
    currency: input.currency || 'INR',
    items,
    inclusions: input.inclusions ?? undefined,
    exclusions: input.exclusions ?? undefined,
    terms: input.terms,
    destinationHint: input.destinationHint ?? undefined,
  };
}
