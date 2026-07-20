import { describe, expect, it } from 'vitest';
import {
  balanceDueDateFromTerms,
  buildCustomerInstalmentPlan,
  percentStepsFromTermsText,
} from '@wayrune/contracts';

describe('customer instalment schedule from terms', () => {
  it('builds default Advance/Balance with Net due from trip start', () => {
    const rows = buildCustomerInstalmentPlan({
      sellTotal: 88000,
      partyPaymentTerms: 'Net 7',
      tripStartDate: '2026-10-01',
      fromDate: new Date(2026, 8, 1),
    });
    expect(rows.map((r) => r.label)).toEqual(['Advance', 'Balance']);
    expect(rows[0]?.dueAt).toBe('2026-09-01');
    expect(rows[1]?.dueAt).toBe('2026-10-08');
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(88000);
  });

  it('parses quote terms percents', () => {
    expect(percentStepsFromTermsText('30% now, 70% later')).toEqual([
      { label: 'Advance', percent: 30 },
      { label: 'Balance', percent: 70 },
    ]);
    expect(
      balanceDueDateFromTerms({
        partyPaymentTerms: 'Pay on confirm',
        tripStartDate: '2026-10-01',
        fromDate: new Date(2026, 8, 1),
      }),
    ).toBe('2026-10-01');
  });
});
