import { describe, expect, it } from 'vitest';
import {
  resolvePartyMarkupStamp,
  stampPartyMarkupOntoQuoteItems,
} from '@wayrune/contracts';

describe('party markup stamp on send', () => {
  it('freezes client override onto unstamped quote lines', () => {
    const stamp = resolvePartyMarkupStamp(
      { defaultMarkupPercent: 20, agentMarkupPercent: 12 },
      { businessType: 'travel_agency', markupPercent: 9 },
    );
    expect(stamp).toEqual({ percent: 9, source: 'party_override' });
    const { stampedCount, items } = stampPartyMarkupOntoQuoteItems(
      [{ id: 'h1', details: { markupMode: 'percent', markupValue: 20 } }],
      stamp,
    );
    expect(stampedCount).toBe(1);
    expect(items[0]?.details).toMatchObject({
      partyMarkupPercent: 9,
      partyMarkupSource: 'party_override',
    });
  });
});
