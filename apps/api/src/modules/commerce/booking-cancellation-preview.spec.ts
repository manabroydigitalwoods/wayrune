import { describe, expect, it } from 'vitest';
import {
  buildBookingCancellationPreview,
  nightCountFromStay,
  pickBookingBaseAmount,
  policyFromQuoteProvenance,
} from './booking-cancellation-preview';

const heritagePolicy = {
  text: 'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours.',
  rules: [
    { beforeHours: 168, chargeType: 'PERCENTAGE', chargeValue: 0 },
    { beforeHours: 72, chargeType: 'PERCENTAGE', chargeValue: 50 },
    { beforeHours: 24, chargeType: 'PERCENTAGE', chargeValue: 100 },
  ],
  noShowChargePercentage: 100,
};

describe('booking-cancellation-preview', () => {
  it('prefers quote-line stamped policy over supplier contract', () => {
    const preview = buildBookingCancellationPreview({
      bookingId: 'b1',
      tripId: 't1',
      title: 'Heritage Deluxe',
      baseAmount: 10000,
      currency: 'INR',
      serviceStartAt: new Date('2026-10-10T12:00:00.000Z'),
      quoteLinePolicy: {
        rules: [{ beforeHours: 48, chargeType: 'PERCENTAGE', chargeValue: 25 }],
      },
      contractPolicy: heritagePolicy,
      asOf: new Date('2026-10-09T12:00:00.000Z'), // 24h before
    });

    expect(preview.policySource).toBe('quote_line');
    expect(preview.evaluation.customerCharge).toBe(2500);
    expect(preview.evaluation.expectedRefund).toBe(7500);
  });

  it('falls back to supplier contract when quote has no cancel policy', () => {
    const preview = buildBookingCancellationPreview({
      bookingId: 'b1',
      tripId: 't1',
      title: 'Heritage Deluxe',
      baseAmount: 10000,
      serviceStartAt: new Date('2026-10-10T12:00:00.000Z'),
      quoteLinePolicy: null,
      contractPolicy: heritagePolicy,
      asOf: new Date('2026-10-08T12:00:00.000Z'), // 48h → 50% tier (≤72h)
    });

    expect(preview.policySource).toBe('supplier_contract');
    expect(preview.evaluation.customerCharge).toBe(5000);
    expect(preview.evaluation.expectedRefund).toBe(5000);
    expect(preview.evaluation.humanExplanation.join(' ')).toMatch(/50/);
  });

  it('returns zero fee when no policy', () => {
    const preview = buildBookingCancellationPreview({
      bookingId: 'b1',
      tripId: 't1',
      title: 'Cab',
      baseAmount: 4100,
      serviceStartAt: new Date('2026-10-05T06:00:00.000Z'),
      quoteLinePolicy: null,
      contractPolicy: null,
      asOf: new Date('2026-10-04T06:00:00.000Z'),
    });

    expect(preview.policySource).toBe('none');
    expect(preview.evaluation.customerCharge).toBe(0);
    expect(preview.evaluation.expectedRefund).toBe(4100);
  });

  it('extracts policy from rateProvenance.calculation', () => {
    const raw = policyFromQuoteProvenance({
      rateId: 'r1',
      calculation: { cancellationPolicy: heritagePolicy },
    });
    expect(raw).toEqual(heritagePolicy);
    expect(policyFromQuoteProvenance(null)).toBeNull();
  });

  it('picks confirmed > quoted > cost for base amount', () => {
    expect(
      pickBookingBaseAmount({
        confirmedAmount: '12000',
        quotedAmount: 9000,
        costAmount: 8000,
      }),
    ).toBe(12000);
    expect(pickBookingBaseAmount({ quotedAmount: 9000, costAmount: 8000 })).toBe(
      9000,
    );
    expect(pickBookingBaseAmount({ costAmount: 8000 })).toBe(8000);
  });

  it('computes night count from stay window', () => {
    expect(
      nightCountFromStay(
        new Date('2026-10-10T12:00:00.000Z'),
        new Date('2026-10-12T12:00:00.000Z'),
      ),
    ).toBe(2);
    expect(nightCountFromStay(null, null)).toBe(1);
  });
});
