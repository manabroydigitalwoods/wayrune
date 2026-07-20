import { describe, expect, it } from 'vitest';
import {
  financeReportPackDeliveryDue,
  financeReportPackNextDueAt,
  type FinanceReportPackDelivery,
} from './finance-report-packs';

const weekly: FinanceReportPackDelivery = {
  enabled: true,
  cadence: 'weekly',
  toEmails: ['ops@demo.travel'],
};

describe('finance-report-packs delivery due', () => {
  it('returns null next-due when delivery is off or empty', () => {
    expect(financeReportPackNextDueAt(undefined)).toBeNull();
    expect(
      financeReportPackNextDueAt({
        enabled: false,
        cadence: 'weekly',
        toEmails: ['ops@demo.travel'],
      }),
    ).toBeNull();
    expect(
      financeReportPackNextDueAt({
        enabled: true,
        cadence: 'weekly',
        toEmails: [],
      }),
    ).toBeNull();
  });

  it('treats never-sent packs as due now', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    expect(financeReportPackNextDueAt(weekly, now)).toBe(now.toISOString());
    expect(financeReportPackDeliveryDue(weekly, now)).toBe(true);
  });

  it('advances weekly and daily next-due from lastSentAt', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    const lastSentAt = '2026-07-19T12:00:00.000Z';
    expect(
      financeReportPackNextDueAt({ ...weekly, lastSentAt }, now),
    ).toBe('2026-07-26T12:00:00.000Z');
    expect(
      financeReportPackDeliveryDue({ ...weekly, lastSentAt }, now),
    ).toBe(false);

    const daily: FinanceReportPackDelivery = {
      enabled: true,
      cadence: 'daily',
      toEmails: ['ops@demo.travel'],
      lastSentAt,
    };
    expect(financeReportPackNextDueAt(daily, now)).toBe(
      '2026-07-20T12:00:00.000Z',
    );
    expect(financeReportPackDeliveryDue(daily, now)).toBe(false);
    expect(
      financeReportPackDeliveryDue(
        daily,
        new Date('2026-07-20T12:00:00.000Z'),
      ),
    ).toBe(true);
  });
});
