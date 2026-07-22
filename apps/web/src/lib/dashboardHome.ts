/** Dashboard home tabs — mirrors trip workspace tab pattern. */

export const DASHBOARD_TABS = [
  'overview',
  'sales',
  'operations',
  'finance',
  'insights',
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  overview: 'Overview',
  sales: 'Sales',
  operations: 'Operations',
  finance: 'Finance',
  insights: 'Insights',
};

export type DashboardTabFlags = {
  sales: boolean;
  operations: boolean;
  finance: boolean;
  insights: boolean;
};

/** Which tabs appear for this workspace (Overview always). */
export function composeDashboardTabs(flags: DashboardTabFlags): DashboardTab[] {
  const tabs: DashboardTab[] = ['overview'];
  if (flags.sales) tabs.push('sales');
  if (flags.operations) tabs.push('operations');
  if (flags.finance) tabs.push('finance');
  if (flags.insights) tabs.push('insights');
  return tabs;
}

export function isDashboardTab(value: string | null | undefined): value is DashboardTab {
  return !!value && (DASHBOARD_TABS as readonly string[]).includes(value);
}

/** Sensible landing tab when URL has no ?tab=. */
export function defaultDashboardTab(
  workspace: string | null | undefined,
  tabs: readonly DashboardTab[],
): DashboardTab {
  const pick = (preferred: DashboardTab) =>
    tabs.includes(preferred) ? preferred : tabs[0] ?? 'overview';
  switch (workspace) {
    case 'operations':
      return pick('operations');
    case 'finance':
      return pick('finance');
    case 'sales_executive':
    case 'sales_manager':
    case 'travel_consultant':
      return pick('sales');
    default:
      return pick('overview');
  }
}

export type DashboardAttentionInput = {
  followUpsOverdue?: number;
  followUpsDue?: number;
  quotesAwaiting?: number;
  unconfirmedBookings?: number;
  overduePayments?: number;
  inboxUnreadThreads?: number;
  unassignedInquiries?: number;
};

/** Counts for tab badges (non-zero attention only). */
export function dashboardTabAttention(
  input: DashboardAttentionInput,
  flags: DashboardTabFlags,
): Partial<Record<DashboardTab, number>> {
  const sales =
    (input.followUpsOverdue ?? 0) +
    (input.followUpsDue ?? 0) +
    (input.quotesAwaiting ?? 0) +
    (input.unassignedInquiries ?? 0) +
    (input.inboxUnreadThreads ?? 0);
  const operations = input.unconfirmedBookings ?? 0;
  const finance = input.overduePayments ?? 0;
  const overview = sales + operations + finance;
  const out: Partial<Record<DashboardTab, number>> = {};
  if (overview > 0) out.overview = overview;
  if (flags.sales && sales > 0) out.sales = sales;
  if (flags.operations && operations > 0) out.operations = operations;
  if (flags.finance && finance > 0) out.finance = finance;
  return out;
}
