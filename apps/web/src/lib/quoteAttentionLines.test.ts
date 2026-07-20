import { describe, expect, it } from 'vitest';
import {
  attentionLineIdsForReason,
  listQuoteAttentionLines,
  nextQuoteAttentionLineId,
  quoteAttentionReasonLabel,
  quoteAttentionReasons,
} from './quoteAttentionLines';

describe('quoteAttentionLines', () => {
  it('labels reasons', () => {
    expect(quoteAttentionReasonLabel('no_sell')).toBe('No sell');
    expect(quoteAttentionReasonLabel('below_margin')).toBe('Below margin');
  });

  it('flags missing sell / buy / unmatched', () => {
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: null,
          unitSell: null,
          rateUnmatched: true,
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toEqual(['no_rate', 'no_sell', 'no_buy']);
  });

  it('prefers blackout over generic no_rate', () => {
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 120,
          rateUnmatched: true,
          rateBlockReason: 'blackout',
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toEqual(['blackout']);
  });

  it('flags hard stop-sale even when buy/sell are set', () => {
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Transfer',
          unitCost: 3600,
          unitSell: 4500,
          rateUnmatched: true,
          rateBlockReason: 'stop_sell',
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toEqual(['stop_sell']);
  });

  it('flags below-margin without override', () => {
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 90,
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toContain('below_margin');

    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 90,
          marginOverride: { reason: 'Manager ok' },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).not.toContain('below_margin');
  });

  it('flags rate drift when chart is newer than snapshot', () => {
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            matchedAt: '2026-07-01T00:00:00.000Z',
            rateUpdatedAt: '2026-07-01T00:00:00.000Z',
          },
          chartUpdatedAt: '2026-07-10T00:00:00.000Z',
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toContain('rate_drift');

    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            matchedAt: '2026-07-01T00:00:00.000Z',
            rateUpdatedAt: '2026-07-01T00:00:00.000Z',
            rateDriftAckForUpdatedAt: '2026-07-10T00:00:00.000Z',
          },
          chartUpdatedAt: '2026-07-10T00:00:00.000Z',
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toContain('rate_drift');

    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            matchedAt: '2026-07-01T00:00:00.000Z',
            rateUpdatedAt: '2026-07-01T00:00:00.000Z',
            rateDriftAckForUpdatedAt: '2026-07-10T00:00:00.000Z',
            rateDriftAckReason: 'Supplier holds prior buy',
          },
          chartUpdatedAt: '2026-07-10T00:00:00.000Z',
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).not.toContain('rate_drift');
  });

  it('flags allotment risk from provenance (blocks send)', () => {
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            allotmentWarn: true,
            allotmentNote: 'Insufficient allotment: no rooms remaining for these nights.',
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toContain('allotment_risk');
  });

  it('clears allotment attention when shortfall is acknowledged with reason', () => {
    const note = 'Insufficient allotment: no rooms remaining for these nights.';
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            allotmentWarn: true,
            allotmentNote: note,
            allotmentRiskAckForNote: note,
            allotmentRiskAckReason: 'Hotel confirmed walk-in',
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).not.toContain('allotment_risk');
  });

  it('keeps allotment attention when ack lacks reason', () => {
    const note = 'Insufficient allotment: no rooms remaining for these nights.';
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            allotmentWarn: true,
            allotmentNote: note,
            allotmentRiskAckForNote: note,
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toContain('allotment_risk');
  });

  it('flags capacity risk from provenance (blocks send)', () => {
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Transfer',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            capacityWarn: true,
            capacityNote: 'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toContain('capacity_risk');
  });

  it('clears min-stay attention when shortfall is acknowledged with reason', () => {
    const note = 'Min stay 3 nights — this stay is 2';
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            minStayWarn: true,
            minStayNote: note,
            minStayRiskAckForNote: note,
            minStayRiskAckReason: 'Surcharge agreed',
            calculation: { minStayShort: true, minStayNote: note },
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).not.toContain('min_stay');
  });

  it('clears max-stay attention when overage is acknowledged with reason', () => {
    const note = 'Max stay 3 nights — this stay is 5';
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            maxStayWarn: true,
            maxStayNote: note,
            maxStayRiskAckForNote: note,
            maxStayRiskAckReason: 'Extended booking agreed',
            calculation: { maxStayLong: true, maxStayNote: note },
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).not.toContain('max_stay');
  });

  it('flags occupancy / gala / weekend / cancel / ages match cues', () => {
    expect(
      quoteAttentionReasons(
        {
          id: '1',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            calculation: {
              occupancyExtraTotal: 1500,
              extraAdultCount: 1,
              dateSupplementTotal: 4000,
              dateSupplements: [{ night: '2026-12-24', label: 'Christmas Eve', amount: 4000 }],
              weekendNights: 2,
              weekendUnit: 5200,
              rooms: 1,
              minStayShort: true,
              minStayNote: 'Min stay 3 nights — this stay is 2',
              nationality: 'IN',
              guestNationality: 'IN',
              cancellationSummary: 'Free to 7d; 50% within 3d',
            },
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toEqual(
      expect.arrayContaining([
        'occupancy_extra',
        'gala',
        'weekend',
        'min_stay',
        'nationality',
        'cancel_policy',
      ]),
    );

    // Cancel alone does not put a healthy line into attention.
    expect(
      quoteAttentionReasons(
        {
          id: '1b',
          description: 'Hotel',
          unitCost: 100,
          unitSell: 150,
          rateProvenance: {
            calculation: {
              cancellationSummary: 'Free to 7d; 50% within 3d',
            },
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toEqual([]);

    expect(
      quoteAttentionReasons(
        {
          id: '2',
          description: 'Activity',
          unitCost: 50,
          unitSell: 80,
          rateProvenance: {
            calculation: {
              partyAdults: 2,
              adultsCharged: 3,
              childAgeMin: 0,
              childAgeMax: 11,
            },
          },
        },
        { canViewCost: true, minMarginPercent: 0 },
      ),
    ).toContain('ages_as_adult');

    expect(quoteAttentionReasonLabel('occupancy_extra')).toBe('Occupancy');
    expect(quoteAttentionReasonLabel('gala')).toBe('Gala');
    expect(quoteAttentionReasonLabel('weekend')).toBe('Weekend');
    expect(quoteAttentionReasonLabel('cancel_policy')).toBe('Cancel');
    expect(quoteAttentionReasonLabel('ages_as_adult')).toBe('Ages');
  });

  it('lists only attention rows in table order', () => {
    const rows = listQuoteAttentionLines(
      [
        {
          id: 'ok',
          description: 'Fine',
          unitCost: 100,
          unitSell: 150,
        },
        {
          id: 'bad',
          description: 'Needs sell',
          unitCost: 100,
          unitSell: null,
        },
      ],
      { canViewCost: true, minMarginPercent: 15 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('bad');
    expect(rows[0].reasons).toContain('no_sell');
  });
});

describe('nextQuoteAttentionLineId', () => {
  it('advances middle → last → null (no wrap)', () => {
    const ids = ['a', 'b', 'c'];
    expect(nextQuoteAttentionLineId(ids, 'a')).toBe('b');
    expect(nextQuoteAttentionLineId(ids, 'b')).toBe('c');
    expect(nextQuoteAttentionLineId(ids, 'c')).toBeNull();
  });

  it('returns first when current is unknown / fixed', () => {
    expect(nextQuoteAttentionLineId(['b', 'c'], 'a')).toBe('b');
    expect(nextQuoteAttentionLineId([], 'a')).toBeNull();
  });
});

describe('attentionLineIdsForReason', () => {
  it('returns only ids with the requested reason', () => {
    const rows = listQuoteAttentionLines(
      [
        {
          id: 'ok',
          description: 'Ok',
          unitCost: 100,
          unitSell: 120,
        },
        {
          id: 'drift',
          description: 'Drifted',
          unitCost: 100,
          unitSell: 120,
          rateId: 'r1',
          rateProvenance: {
            rateId: 'r1',
            rateUpdatedAt: '2026-01-01T00:00:00.000Z',
          },
          chartUpdatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'nosell',
          description: 'No sell',
          unitCost: 100,
          unitSell: null,
        },
      ],
      { canViewCost: true, minMarginPercent: 0 },
    );
    expect(attentionLineIdsForReason(rows, 'rate_drift')).toEqual(['drift']);
    expect(attentionLineIdsForReason(rows, 'no_sell')).toEqual(['nosell']);
  });
});
