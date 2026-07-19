import { hasAnyPermission } from '@wayrune/rbac';
import type { AgencyWorkspace, WorkspaceWidget } from './types';

/** Shared dashboard widgets — composed per workspace in DashboardPage. */
export const WORKSPACE_WIDGETS: readonly WorkspaceWidget[] = [
  {
    key: 'sales_sla',
    title: 'Sales response',
    requiredAnyPermissions: ['lead.read.own', 'lead.read', 'report.sales.read'],
    allowedWorkspaces: ['sales_executive', 'sales_manager', 'owner'],
    priority: 8,
  },
  {
    key: 'followups_today',
    title: 'Follow-ups due',
    requiredAnyPermissions: ['task.read', 'lead.read.own', 'lead.read'],
    allowedWorkspaces: ['sales_executive', 'sales_manager', 'owner'],
    priority: 10,
  },
  {
    key: 'new_requests',
    title: 'New requests',
    requiredAnyPermissions: ['inquiry.read'],
    allowedWorkspaces: ['sales_executive', 'sales_manager', 'owner', 'travel_consultant'],
    priority: 20,
  },
  {
    key: 'quotes_to_send',
    title: 'Quotes to send',
    requiredAnyPermissions: ['quote.read', 'trip.read'],
    allowedWorkspaces: ['sales_executive', 'sales_manager', 'owner', 'travel_consultant'],
    priority: 30,
  },
  {
    key: 'customers_waiting',
    title: 'Customers waiting',
    requiredAnyPermissions: ['inquiry.read'],
    allowedWorkspaces: ['sales_executive'],
    priority: 40,
  },
  {
    key: 'channel_journeys',
    title: 'Channel journeys',
    requiredAnyPermissions: ['report.sales.read', 'lead.read'],
    allowedWorkspaces: ['sales_manager', 'owner'],
    priority: 18,
  },
  {
    key: 'team_pipeline',
    title: 'Team pipeline',
    requiredAnyPermissions: ['lead.read', 'report.sales.read'],
    allowedWorkspaces: ['sales_manager', 'owner'],
    priority: 15,
  },
  {
    key: 'unassigned_requests',
    title: 'Unassigned requests',
    requiredAnyPermissions: ['lead.assign', 'inquiry.read'],
    allowedWorkspaces: ['sales_manager', 'owner'],
    priority: 25,
  },
  {
    key: 'stale_opportunities',
    title: 'Stale opportunities',
    requiredAnyPermissions: ['lead.read', 'report.sales.read'],
    allowedWorkspaces: ['sales_manager', 'owner'],
    priority: 28,
  },
  {
    key: 'quote_approvals',
    title: 'Quotation approvals',
    requiredAnyPermissions: ['quote.approve'],
    allowedWorkspaces: ['sales_manager', 'owner'],
    priority: 35,
  },
  {
    key: 'conversion_movement',
    title: 'Conversion movement',
    requiredAnyPermissions: ['report.sales.read', 'lead.read'],
    allowedWorkspaces: ['sales_manager', 'owner'],
    priority: 45,
  },
  {
    key: 'arrivals_today',
    title: 'Arrivals today',
    requiredAnyPermissions: ['ops.read', 'trip.read'],
    allowedWorkspaces: ['operations', 'owner'],
    priority: 10,
  },
  {
    key: 'unconfirmed_bookings',
    title: 'Unconfirmed bookings',
    requiredAnyPermissions: ['ops.read', 'trip.read'],
    allowedWorkspaces: ['operations', 'owner'],
    priority: 20,
  },
  {
    key: 'readiness_blockers',
    title: 'Readiness blockers',
    requiredAnyPermissions: ['ops.read'],
    allowedWorkspaces: ['operations', 'owner'],
    priority: 30,
  },
  {
    key: 'open_incidents',
    title: 'Open incidents',
    requiredAnyPermissions: ['incident.manage', 'ops.read'],
    allowedWorkspaces: ['operations', 'owner'],
    priority: 40,
  },
  {
    key: 'movement_window',
    title: 'Movement window',
    requiredAnyPermissions: ['ops.read', 'trip.read'],
    allowedWorkspaces: ['operations', 'owner'],
    priority: 15,
  },
  {
    key: 'due_today',
    title: 'Due today',
    requiredAnyPermissions: ['finance.cost.read'],
    allowedWorkspaces: ['finance', 'owner'],
    priority: 10,
  },
  {
    key: 'overdue_receivables',
    title: 'Overdue receivables',
    requiredAnyPermissions: ['finance.cost.read'],
    allowedWorkspaces: ['finance', 'owner'],
    priority: 20,
  },
  {
    key: 'supplier_payables',
    title: 'Supplier payables',
    requiredAnyPermissions: ['finance.settlement.read', 'finance.cost.read'],
    allowedWorkspaces: ['finance', 'owner'],
    priority: 30,
  },
  {
    key: 'portfolio_margin',
    title: 'Portfolio margin',
    requiredAnyPermissions: ['finance.margin.read', 'finance.cost.read'],
    allowedWorkspaces: ['finance', 'owner'],
    priority: 35,
  },
  {
    key: 'unallocated_payments',
    title: 'Unallocated payments',
    requiredAnyPermissions: ['finance.payment.manage'],
    allowedWorkspaces: ['finance', 'owner'],
    priority: 40,
  },
  {
    key: 'business_health',
    title: 'Business health',
    requiredAnyPermissions: ['report.sales.read', 'ops.read', 'finance.cost.read'],
    allowedWorkspaces: ['owner'],
    priority: 5,
  },
] as const;

export function composeDashboardWidgets(
  workspace: AgencyWorkspace,
  permissions: readonly string[],
): WorkspaceWidget[] {
  return WORKSPACE_WIDGETS.filter((w) => {
    if (!w.allowedWorkspaces.includes(workspace)) return false;
    if (w.requiredAnyPermissions?.length) {
      return hasAnyPermission(permissions, w.requiredAnyPermissions);
    }
    return true;
  }).sort((a, b) => a.priority - b.priority);
}
