import { describe, expect, it } from 'vitest';
import {
  partyMarkupStampSourceLabel,
  stampPartyMarkupOntoQuoteItems,
} from './orgMarkup';

describe('orgMarkup web re-export', () => {
  it('stamps party markup onto quote lines', () => {
    const { items, stampedCount } = stampPartyMarkupOntoQuoteItems(
      [{ id: '1', details: {} }],
      { percent: 15, source: 'org_default' },
    );
    expect(stampedCount).toBe(1);
    expect(items[0]?.details).toMatchObject({
      partyMarkupPercent: 15,
      partyMarkupSource: 'org_default',
    });
    expect(partyMarkupStampSourceLabel('party_override')).toBe('client override');
  });
});
