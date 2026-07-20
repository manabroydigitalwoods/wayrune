import { describe, expect, it } from 'vitest';
import {
  ctaLabelForTripFlag,
  pickPrimaryTripNextAction,
  type TripNextActionFlag,
} from './tripNextAction';

function flag(
  overrides: Partial<TripNextActionFlag> & Pick<TripNextActionFlag, 'id' | 'code'>,
): TripNextActionFlag {
  return {
    severity: 'warn',
    label: overrides.code,
    tab: 'operations',
    ...overrides,
  };
}

describe('pickPrimaryTripNextAction', () => {
  it('prefers danger overdue over open hotel enquiry', () => {
    const next = pickPrimaryTripNextAction({
      tripStatus: 'confirmed',
      flags: [
        flag({
          id: 'h1',
          code: 'unconfirmed_hotel',
          severity: 'warn',
          label: 'Hotel enquiry open',
          bookingId: 'b1',
        }),
        flag({
          id: 'o1',
          code: 'payment_overdue',
          severity: 'danger',
          label: '1 overdue payment',
          tab: 'finance',
        }),
      ],
    });
    expect(next.flag?.code).toBe('payment_overdue');
    expect(next.ctaLabel).toBe('Chase overdue');
    expect(next.tab).toBe('finance');
    expect(next.moreCount).toBe(1);
  });

  it('ranks hotel enquiry before voucher when both warn', () => {
    const next = pickPrimaryTripNextAction({
      tripStatus: 'confirmed',
      flags: [
        flag({
          id: 'v1',
          code: 'voucher_pending',
          severity: 'warn',
          label: 'Hotel voucher note pending',
          bookingId: 'b2',
        }),
        flag({
          id: 'h1',
          code: 'unconfirmed_hotel',
          severity: 'warn',
          label: 'Hotel enquiry open',
          bookingId: 'b1',
        }),
      ],
    });
    expect(next.flag?.code).toBe('unconfirmed_hotel');
    expect(next.bookingId).toBe('b1');
    expect(next.ctaLabel).toBe('Open hotel enquiry');
  });

  it('allows info voucher_pending as primary when nothing hotter', () => {
    const next = pickPrimaryTripNextAction({
      tripStatus: 'confirmed',
      flags: [
        flag({
          id: 'v1',
          code: 'voucher_pending',
          severity: 'info',
          label: 'Hotel voucher note pending',
          bookingId: 'bv',
        }),
      ],
    });
    expect(next.flag?.code).toBe('voucher_pending');
    expect(next.ctaLabel).toBe('Add voucher note');
  });

  it('ranks missing instalments before voucher when both info', () => {
    const next = pickPrimaryTripNextAction({
      tripStatus: 'confirmed',
      flags: [
        flag({
          id: 'v1',
          code: 'voucher_pending',
          severity: 'info',
          label: 'Hotel voucher note pending',
          tab: 'operations',
        }),
        flag({
          id: 'm1',
          code: 'missing_customer_instalments',
          severity: 'info',
          label: 'No customer instalments scheduled',
          tab: 'finance',
        }),
      ],
    });
    expect(next.flag?.code).toBe('missing_customer_instalments');
    expect(next.ctaLabel).toBe('Schedule instalments');
    expect(next.tab).toBe('finance');
  });

  it('falls back to status tab when no flags', () => {
    const next = pickPrimaryTripNextAction({
      tripStatus: 'confirmed',
      flags: [],
    });
    expect(next.allClear).toBe(true);
    expect(next.tab).toBe('operations');
    expect(next.ctaLabel).toBe('Open operations');
  });

  it('uses Focus booking when already on the target tab', () => {
    const next = pickPrimaryTripNextAction({
      tripStatus: 'confirmed',
      activeTab: 'operations',
      flags: [
        flag({
          id: 'h1',
          code: 'unconfirmed_hotel',
          severity: 'warn',
          label: 'Hotel enquiry open',
          bookingId: 'b9',
        }),
      ],
    });
    expect(next.ctaLabel).toBe('Focus booking');
  });
});

describe('ctaLabelForTripFlag', () => {
  it('maps common codes', () => {
    expect(
      ctaLabelForTripFlag(
        flag({ id: '1', code: 'customer_balance_pending', tab: 'finance' }),
      ),
    ).toBe('Collect balance');
  });
});
