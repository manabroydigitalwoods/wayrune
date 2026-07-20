import { describe, expect, it } from 'vitest';
import {
  buildFitReviseMoves,
  firstHotelLineId,
  firstUnmatchedLineIdFromAttention,
  prepareHotelSwapLine,
} from './fitReviseMoves';

describe('fitReviseMoves', () => {
  it('picks first hotel and unmatched attention line', () => {
    expect(
      firstHotelLineId([
        { id: 't1', serviceType: 'transfer' },
        { id: 'h1', rateKind: 'hotel' },
      ]),
    ).toBe('h1');
    expect(
      firstUnmatchedLineIdFromAttention([
        { id: 'a', reasons: ['below_margin'] },
        { id: 'b', reasons: ['no_rate'] },
      ]),
    ).toBe('b');
  });

  it('shows locked revise cue', () => {
    const moves = buildFitReviseMoves({
      mode: 'locked',
      itemCount: 3,
      rateDriftCount: 0,
      firstUnmatchedLineId: null,
      firstHotelLineId: 'h1',
      inquiryPax: null,
      canTripWrite: true,
      canQuoteWrite: true,
      quoteAccepted: true,
    });
    expect(moves.visible).toBe(true);
    expect(moves.actions.map((a) => a.id)).toEqual([
      'revise_draft',
      'edit_dates',
    ]);
    expect(moves.actions[0]?.label).toBe('Revise from accepted');
  });

  it('builds post-revise action set', () => {
    const moves = buildFitReviseMoves({
      mode: 'post_revise',
      itemCount: 4,
      rateDriftCount: 2,
      firstUnmatchedLineId: 'u1',
      firstHotelLineId: 'h1',
      inquiryPax: { adults: 2, children: 1, rooms: 1 },
      canTripWrite: true,
      canQuoteWrite: true,
    });
    expect(moves.visible).toBe(true);
    expect(moves.actions.map((a) => a.id)).toEqual([
      'edit_dates',
      'rematch_all',
      'rematch_drift',
      'open_unmatched',
      'swap_hotel',
      'apply_inquiry_pax',
    ]);
    expect(moves.actions.find((a) => a.id === 'apply_inquiry_pax')?.label).toBe(
      'Apply 2A+1C · 1R',
    );
  });

  it('swap hotel keeps dates + story day, clears property and rate', () => {
    const swapped = prepareHotelSwapLine({
      details: {
        supplierId: 'sup-1',
        supplierName: 'Old Hotel',
        propertyName: 'Old Hotel',
        roomType: 'Deluxe',
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
        nights: 2,
        storyDayId: 'day-2',
        rooms: 1,
        adults: 2,
        markupMode: 'percent',
        markupValue: 18,
        rateLabel: 'Old · Deluxe',
      },
      rateId: 'rate-1',
      rateProvenance: { rateId: 'rate-1' },
      unitCost: 5000,
      unitSell: 5900,
    });
    // Preserved
    expect(swapped.details?.checkIn).toBe('2026-08-01');
    expect(swapped.details?.checkOut).toBe('2026-08-03');
    expect(swapped.details?.nights).toBe(2);
    expect(swapped.details?.storyDayId).toBe('day-2');
    expect(swapped.details?.rooms).toBe(1);
    expect(swapped.details?.markupValue).toBe(18);
    // Cleared
    expect(swapped.details?.supplierId).toBeUndefined();
    expect(swapped.details?.propertyName).toBeUndefined();
    expect(swapped.details?.roomType).toBeUndefined();
    expect(swapped.details?.priceSource).toBe('none');
    expect(swapped.rateId).toBeNull();
    expect(swapped.rateProvenance).toBeUndefined();
    expect(swapped.rateUnmatched).toBe(true);
    expect(swapped.unitCost).toBeNull();
    expect(swapped.unitSell).toBeNull();
  });

  it('hides when idle or empty draft', () => {
    expect(
      buildFitReviseMoves({
        mode: 'idle',
        itemCount: 2,
        rateDriftCount: 1,
        firstUnmatchedLineId: null,
        firstHotelLineId: null,
        inquiryPax: null,
        canTripWrite: true,
        canQuoteWrite: true,
      }).visible,
    ).toBe(false);
    expect(
      buildFitReviseMoves({
        mode: 'post_revise',
        itemCount: 0,
        rateDriftCount: 0,
        firstUnmatchedLineId: null,
        firstHotelLineId: null,
        inquiryPax: null,
        canTripWrite: true,
        canQuoteWrite: true,
      }).visible,
    ).toBe(false);
  });
});
