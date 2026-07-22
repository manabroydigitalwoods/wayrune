import { describe, expect, it } from 'vitest';
import {
  composeDashboardTabs,
  dashboardTabAttention,
  defaultDashboardTab,
  isDashboardTab,
} from './dashboardHome';

describe('dashboardHome tabs', () => {
  it('always includes overview and appends enabled bands', () => {
    expect(
      composeDashboardTabs({
        sales: true,
        operations: false,
        finance: true,
        insights: false,
      }),
    ).toEqual(['overview', 'sales', 'finance']);
  });

  it('defaults landing tab by workspace', () => {
    const all = composeDashboardTabs({
      sales: true,
      operations: true,
      finance: true,
      insights: true,
    });
    expect(defaultDashboardTab('operations', all)).toBe('operations');
    expect(defaultDashboardTab('finance', all)).toBe('finance');
    expect(defaultDashboardTab('sales_executive', all)).toBe('sales');
    expect(defaultDashboardTab('owner', all)).toBe('overview');
  });

  it('validates tab ids', () => {
    expect(isDashboardTab('overview')).toBe(true);
    expect(isDashboardTab('bogus')).toBe(false);
  });

  it('computes attention badges from urgent counts', () => {
    const flags = {
      sales: true,
      operations: true,
      finance: true,
      insights: true,
    };
    const counts = dashboardTabAttention(
      {
        followUpsDue: 2,
        followUpsOverdue: 1,
        quotesAwaiting: 3,
        unconfirmedBookings: 4,
        overduePayments: 5,
        inboxUnreadThreads: 0,
      },
      flags,
    );
    expect(counts.sales).toBe(6);
    expect(counts.operations).toBe(4);
    expect(counts.finance).toBe(5);
    expect(counts.overview).toBe(15);
  });
});
