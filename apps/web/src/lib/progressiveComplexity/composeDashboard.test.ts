import { describe, expect, it } from 'vitest';
import { composeDashboardWidgets, composeDashboardSections } from './composeDashboard';

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

  it('splits primary vs secondary dashboard widgets', () => {
    const { primary, secondary } = composeDashboardSections('owner', [
      'ops.read',
      'trip.read',
      'finance.cost.read',
      'finance.margin.read',
      'finance.settlement.read',
      'report.sales.read',
      'lead.read',
    ]);
    expect(primary.length).toBe(4);
    expect(secondary.length).toBeGreaterThan(0);
    expect(primary[0]?.key).toBe('business_health');
    expect(secondary.some((w) => w.key === 'movement_window')).toBe(true);
  });

  it('includes travel consultant quote widgets', () => {
    const keys = composeDashboardWidgets('travel_consultant', [
      'inquiry.read',
      'quote.read',
      'trip.read',
    ]).map((w) => w.key);
    expect(keys).toContain('new_requests');
    expect(keys).toContain('quotes_to_send');
    expect(keys).not.toContain('team_pipeline');
  });
});
