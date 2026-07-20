import { describe, expect, it } from 'vitest';
import { agingHomeStatLabel } from './financeHomeAgingLabel';

describe('agingHomeStatLabel', () => {
  it('appends FX excl. when other-currency rows exist', () => {
    expect(agingHomeStatLabel('Open receivables', 2)).toBe(
      'Open receivables · 2 FX excl.',
    );
    expect(agingHomeStatLabel('Supplier payables', 1)).toBe(
      'Supplier payables · 1 FX excl.',
    );
  });

  it('appends FX conv. when foreign trips rolled at org FX', () => {
    expect(agingHomeStatLabel('Portfolio margin', 0, 2)).toBe(
      'Portfolio margin · 2 FX conv.',
    );
    expect(agingHomeStatLabel('Portfolio margin', 1, 2)).toBe(
      'Portfolio margin · 2 FX conv. · 1 FX excl.',
    );
  });

  it('keeps base label when count is zero or missing', () => {
    expect(agingHomeStatLabel('Overdue receivables', 0)).toBe(
      'Overdue receivables',
    );
    expect(agingHomeStatLabel('Open receivables')).toBe('Open receivables');
    expect(agingHomeStatLabel('Open receivables', null)).toBe('Open receivables');
  });
});
