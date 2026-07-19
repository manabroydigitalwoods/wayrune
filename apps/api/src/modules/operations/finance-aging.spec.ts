import { describe, expect, it } from 'vitest';
import {
  agingBucket,
  buildFinanceAging,
  daysPastDue,
  type FinanceAgingPayment,
} from './finance-aging';

const base: FinanceAgingPayment = {
  id: 'p1',
  tripId: 't1',
  tripNumber: 'TRP-01',
  tripTitle: 'Goa',
  partyName: 'Sneha',
  direction: 'customer',
  label: 'Balance',
  amount: 21000,
  amountPaid: 0,
  currency: 'INR',
  dueAt: '2026-06-01',
  status: 'overdue',
  supplierName: null,
};

describe('finance-aging', () => {
  const now = new Date('2026-07-19T12:00:00');

  it('buckets by days past due', () => {
    expect(agingBucket('2026-07-19', now)).toBe('current');
    expect(agingBucket('2026-07-01', now)).toBe('d1_30');
    expect(agingBucket('2026-05-20', now)).toBe('d31_60');
    expect(agingBucket('2026-05-01', now)).toBe('d61_90');
    expect(agingBucket('2026-01-01', now)).toBe('d90_plus');
    expect(agingBucket(null, now)).toBe('noDue');
  });

  it('builds overdue-only customer aging', () => {
    const board = buildFinanceAging({
      payments: [
        base,
        {
          ...base,
          id: 'p2',
          dueAt: '2026-08-01',
          status: 'scheduled',
          label: 'Future',
        },
        {
          ...base,
          id: 'p3',
          direction: 'supplier',
          label: 'Hotel',
          dueAt: '2026-06-01',
        },
      ],
      direction: 'customer',
      overdueOnly: true,
      now,
    });
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]!.bucket).toBe('d31_60');
    expect(board.summary.totalOutstanding).toBe(21000);
    expect(daysPastDue('2026-06-01', now)).toBe(48);
  });

  it('summarises dominant currency only (no FX mix)', () => {
    const board = buildFinanceAging({
      payments: [
        base,
        {
          ...base,
          id: 'p-usd',
          currency: 'USD',
          amount: 500,
          amountPaid: 0,
          label: 'USD deposit',
        },
      ],
      direction: 'customer',
      now,
    });
    expect(board.rows).toHaveLength(2);
    expect(board.summary.currency).toBe('INR');
    expect(board.summary.totalOutstanding).toBe(21000);
    expect(board.summary.otherCurrencyCount).toBe(1);
  });
});
