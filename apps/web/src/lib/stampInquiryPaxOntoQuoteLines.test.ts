import { describe, expect, it } from 'vitest';
import {
  resolveInquiryPaxForStamp,
  stampInquiryPaxOntoQuoteLines,
} from './stampInquiryPaxOntoQuoteLines';

describe('stampInquiryPaxOntoQuoteLines', () => {
  it('resolves inquiry pax with default rooms', () => {
    expect(resolveInquiryPaxForStamp({ adults: 0, children: 0 })).toBeNull();
    expect(resolveInquiryPaxForStamp({ adults: 2, children: 1 })).toEqual({
      adults: 2,
      children: 1,
      rooms: 1,
    });
    expect(resolveInquiryPaxForStamp({ adults: 3, children: 0 })).toEqual({
      adults: 3,
      children: 0,
      rooms: 2,
    });
    expect(resolveInquiryPaxForStamp({ adults: null, children: 2 })).toEqual({
      adults: 1,
      children: 2,
      rooms: 1,
    });
    expect(
      resolveInquiryPaxForStamp({ adults: 4, children: 0, rooms: 3 }),
    ).toEqual({
      adults: 4,
      children: 0,
      rooms: 3,
    });
  });

  it('stamps hotel rooms only; transfer/activity get adults/children', () => {
    const { items, stampedCount } = stampInquiryPaxOntoQuoteLines(
      [
        {
          id: 'h1',
          serviceType: 'hotel',
          details: { adults: 1, children: 0, roomType: 'DLX', rooms: 1 },
        },
        { id: 'm1', serviceType: 'meal', details: { adults: 9 } },
        { id: 't1', rateKind: 'transfer', details: {} },
      ],
      { adults: 4, children: 1, rooms: 2 },
    );
    expect(stampedCount).toBe(2);
    expect(items[0]?.details).toMatchObject({
      adults: 4,
      children: 1,
      roomType: 'DLX',
      rooms: 2,
    });
    expect(items[1]?.details).toEqual({ adults: 9 });
    expect(items[2]?.details).toEqual({ adults: 4, children: 1 });
  });
});
