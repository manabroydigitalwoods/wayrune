import { describe, expect, it } from 'vitest';
import { composeDashboardWidgets } from './composeDashboard';

describe('composeDashboardWidgets', () => {
  it('includes movement and portfolio widgets for owner with perms', () => {
    const keys = composeDashboardWidgets('owner', [
      'ops.read',
      'trip.read',
      'finance.cost.read',
      'finance.margin.read',
      'finance.settlement.read',
      'report.sales.read',
    ]).map((w) => w.key);
    expect(keys).toContain('movement_window');
    expect(keys).toContain('portfolio_margin');
    expect(keys).toContain('business_health');
  });

  it('scopes finance workspace to finance widgets', () => {
    const keys = composeDashboardWidgets('finance', [
      'finance.cost.read',
      'finance.margin.read',
      'finance.settlement.read',
    ]).map((w) => w.key);
    expect(keys).toContain('overdue_receivables');
    expect(keys).toContain('portfolio_margin');
    expect(keys).not.toContain('movement_window');
    expect(keys).not.toContain('followups_today');
  });

  it('includes sales_sla for sales executive', () => {
    const keys = composeDashboardWidgets('sales_executive', [
      'lead.read.own',
      'lead.write',
      'task.read',
      'inquiry.read',
      'quote.read',
    ]).map((w) => w.key);
    expect(keys).toContain('sales_sla');
    expect(keys).toContain('followups_today');
  });
});
