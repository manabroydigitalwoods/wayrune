import { describe, expect, it } from 'vitest';
import {
  tripFinanceWriteOffHref,
  writeOffAmountExceedsOutstandingUi,
} from './tripPaymentWriteOff';

describe('tripPaymentWriteOff', () => {
  it('builds finance deep-link', () => {
    expect(tripFinanceWriteOffHref('trip-1', 'pay-2')).toBe(
      '/trips/trip-1?tab=finance&paymentId=pay-2',
    );
  });

  it('flags write-off above outstanding', () => {
    expect(
      writeOffAmountExceedsOutstandingUi({
        writeOffAmount: 500,
        outstanding: 400,
      }),
    ).toBe(true);
    expect(
      writeOffAmountExceedsOutstandingUi({
        writeOffAmount: 400,
        outstanding: 400,
      }),
    ).toBe(false);
  });
});
