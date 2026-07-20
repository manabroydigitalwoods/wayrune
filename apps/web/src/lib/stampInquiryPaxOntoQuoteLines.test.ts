import { describe, expect, it } from 'vitest';
import {
  resolveInquiryPaxForStamp,
  stampInquiryPaxOntoQuoteLines,
} from './stampInquiryPaxOntoQuoteLines';

describe('stampInquiryPaxOntoQuoteLines', () => {
  it('resolves inquiry pax', () => {
    expect(resolveInquiryPaxForStamp({ adults: 0, children: 0 })).toBeNull();
    expect(resolveInquiryPaxForStamp({ adults: 2, children: 1 })).toEqual({
      adults: 2,
      children: 1,
    });
    expect(resolveInquiryPaxForStamp({ adults: null, children: 2 })).toEqual({
      adults: 1,
      children: 2,
    });
  });

  it('stamps hotel/transfer/activity only', () => {
    const { items, stampedCount } = stampInquiryPaxOntoQuoteLines(
      [
        {
          id: 'h1',
          serviceType: 'hotel',
          details: { adults: 1, children: 0, roomType: 'DLX' },
        },
        { id: 'm1', serviceType: 'meal', details: { adults: 9 } },
        { id: 't1', rateKind: 'transfer', details: {} },
      ],
      { adults: 2, children: 1 },
    );
    expect(stampedCount).toBe(2);
    expect(items[0]?.details).toMatchObject({ adults: 2, children: 1, roomType: 'DLX' });
    expect(items[1]?.details).toEqual({ adults: 9 });
    expect(items[2]?.details).toMatchObject({ adults: 2, children: 1 });
  });
});
