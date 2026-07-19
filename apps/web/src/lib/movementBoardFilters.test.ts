import { describe, expect, it } from 'vitest';
import {
  applyMovementBoardFilters,
  movementBoardFilterHref,
  movementBoardHasActiveFilters,
  parseMovementBoardFilters,
} from './movementBoardFilters';

describe('movementBoardFilters', () => {
  const rows = [
    {
      type: 'hotel',
      flags: [{ code: 'voucher_pending', severity: 'info' }],
    },
    {
      type: 'hotel',
      flags: [{ code: 'payment_overdue', severity: 'danger' }],
    },
    {
      type: 'transfer',
      flags: [{ code: 'driver_conflict', severity: 'danger' }],
    },
    {
      type: 'transfer',
      flags: [{ code: 'voucher_pending', severity: 'info' }],
    },
    {
      type: 'activity',
      flags: [{ code: 'voucher_pending', severity: 'warn' }],
    },
  ];

  it('parses type / flagged / overduePay / voucherPending from search params', () => {
    expect(
      parseMovementBoardFilters(
        new URLSearchParams(
          'type=hotel&flagged=1&overduePay=1&voucherPending=1',
        ),
      ),
    ).toEqual({
      type: 'hotel',
      flagged: true,
      overduePay: true,
      voucherPending: true,
    });
    expect(parseMovementBoardFilters(new URLSearchParams('type=activity'))).toEqual(
      {
        type: 'activity',
        flagged: false,
        overduePay: false,
        voucherPending: false,
      },
    );
    expect(parseMovementBoardFilters(new URLSearchParams('type=flight'))).toEqual(
      {
        type: null,
        flagged: false,
        overduePay: false,
        voucherPending: false,
      },
    );
  });

  it('filters by type', () => {
    expect(
      applyMovementBoardFilters(rows, {
        type: 'transfer',
        flagged: false,
        overduePay: false,
        voucherPending: false,
      }),
    ).toHaveLength(2);
  });

  it('filters flagged (non-info), overdue pay, and voucher pending', () => {
    expect(
      applyMovementBoardFilters(rows, {
        type: null,
        flagged: true,
        overduePay: false,
        voucherPending: false,
      }),
    ).toHaveLength(3);
    expect(
      applyMovementBoardFilters(rows, {
        type: null,
        flagged: false,
        overduePay: true,
        voucherPending: false,
      }),
    ).toEqual([rows[1]]);
    expect(
      applyMovementBoardFilters(rows, {
        type: null,
        flagged: false,
        overduePay: false,
        voucherPending: true,
      }),
    ).toHaveLength(3);
  });

  it('builds hrefs and detects active filters', () => {
    expect(movementBoardFilterHref({ type: 'hotel' })).toBe(
      '/operations/movement?type=hotel',
    );
    expect(movementBoardFilterHref({ flagged: true })).toBe(
      '/operations/movement?flagged=1',
    );
    expect(movementBoardFilterHref({ overduePay: true, days: 7 })).toBe(
      '/operations/movement?overduePay=1&days=7',
    );
    expect(movementBoardFilterHref({ voucherPending: true })).toBe(
      '/operations/movement?voucherPending=1',
    );
    expect(
      movementBoardHasActiveFilters({
        type: null,
        flagged: false,
        overduePay: false,
        voucherPending: false,
      }),
    ).toBe(false);
    expect(
      movementBoardHasActiveFilters({
        type: 'hotel',
        flagged: false,
        overduePay: false,
        voucherPending: false,
      }),
    ).toBe(true);
  });
});
