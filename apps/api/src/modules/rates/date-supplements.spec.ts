import { describe, expect, it } from 'vitest';
import {
  applyDateSupplements,
  nightMatchesSupplement,
  parseDateSupplements,
} from './date-supplements';

describe('date-supplements', () => {
  it('parses gala nights from occupancyPricingJson', () => {
    const list = parseDateSupplements({
      baseAdults: 2,
      dateSupplements: [
        { date: '2026-12-24', amount: 2500, label: 'Christmas Eve gala' },
        { from: '2026-12-31', to: '2027-01-01', amount: 3500, label: 'NY Eve' },
        { date: 'bad', amount: 100 },
      ],
    });
    expect(list).toHaveLength(2);
    expect(list[0]?.label).toBe('Christmas Eve gala');
    expect(nightMatchesSupplement('2026-12-31', list[1]!)).toBe(true);
    expect(nightMatchesSupplement('2027-01-01', list[1]!)).toBe(true);
    expect(nightMatchesSupplement('2027-01-02', list[1]!)).toBe(false);
  });

  it('applies per-room supplements on matching stay nights', () => {
    const result = applyDateSupplements(
      10000,
      [
        { date: '2026-12-24', amount: 2500, label: 'Christmas Eve gala' },
        { date: '2026-12-25', amount: 1500, label: 'Christmas' },
      ],
      ['2026-12-24', '2026-12-25', '2026-12-26'],
      2,
    );
    expect(result.matched).toHaveLength(2);
    expect(result.supplementTotal).toBe(8000); // (2500+1500)*2
    expect(result.totalBuy).toBe(18000);
  });
});
