import { describe, expect, it } from 'vitest';
import {
  balanceDueDateFromTerms,
  buildCustomerInstalmentPlan,
  defaultInstalmentPercentSteps,
  instalmentScheduleSourceLabel,
  normalizeInstalmentPercentSteps,
  percentStepsFromTermsText,
} from './instalment-schedule';

describe('normalizeInstalmentPercentSteps', () => {
  it('accepts steps that sum to 100', () => {
    expect(
      normalizeInstalmentPercentSteps([
        { label: 'A', percent: 40 },
        { label: 'B', percent: 60 },
      ]),
    ).toEqual([
      { label: 'A', percent: 40 },
      { label: 'B', percent: 60 },
    ]);
  });

  it('rejects steps that do not sum to ~100', () => {
    expect(
      normalizeInstalmentPercentSteps([
        { label: 'A', percent: 40 },
        { label: 'B', percent: 40 },
      ]),
    ).toBeNull();
  });
});

describe('percentStepsFromTermsText', () => {
  it('parses confirm + balance percents', () => {
    expect(
      percentStepsFromTermsText('Pay 40% to confirm. Balance 60% before travel'),
    ).toEqual([
      { label: 'Advance', percent: 40 },
      { label: 'Balance', percent: 60 },
    ]);
  });
});

describe('buildCustomerInstalmentPlan', () => {
  it('defaults to 50/50 with Net due on trip start anchor', () => {
    const rows = buildCustomerInstalmentPlan({
      sellTotal: 100000,
      partyPaymentTerms: 'Net 15',
      tripStartDate: '2026-08-01',
      fromDate: new Date(2026, 6, 20),
    });
    expect(rows).toEqual([
      {
        label: 'Advance',
        percent: 50,
        amount: 50000,
        dueAt: '2026-07-20',
      },
      {
        label: 'Balance',
        percent: 50,
        amount: 50000,
        dueAt: '2026-08-16',
      },
    ]);
    expect(defaultInstalmentPercentSteps()).toHaveLength(2);
  });

  it('uses story percents and absorbs rounding on last row', () => {
    const rows = buildCustomerInstalmentPlan({
      sellTotal: 10001,
      steps: [
        { label: 'Today', percent: 40 },
        { label: 'Before travel', percent: 60 },
      ],
      tripStartDate: '2026-09-01',
      fromDate: new Date(2026, 6, 20),
    });
    expect(rows[0]?.amount).toBe(4000.4);
    expect(rows[1]?.amount).toBe(6000.6);
    expect(rows[0]!.amount + rows[1]!.amount).toBe(10001);
  });
});

describe('balanceDueDateFromTerms', () => {
  it('falls back to trip start when terms are not Net', () => {
    expect(
      balanceDueDateFromTerms({
        partyPaymentTerms: 'COD',
        tripStartDate: '2026-08-10',
        fromDate: new Date(2026, 6, 1),
      }),
    ).toBe('2026-08-10');
  });
});

describe('instalmentScheduleSourceLabel', () => {
  it('describes the source', () => {
    expect(
      instalmentScheduleSourceLabel({
        usedStorySteps: false,
        usedTermsPercents: false,
        partyPaymentTerms: 'Net 30',
      }),
    ).toMatch(/Default Advance 50%/);
  });
});
