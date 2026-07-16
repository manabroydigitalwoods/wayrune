/** First-class agency workspace routes — sidemenu must use these, not query params. */
export const AGENCY_ROUTES = {
  home: '/',
  inbox: '/inbox',
  workRequests: '/work/requests',
  workPlanning: '/work/planning',
  workQuotations: '/work/quotations',
  workQuotationDrafts: '/work/quotation-drafts',
  workFollowUps: '/work/follow-ups',
  operations: '/operations',
  operationsBookings: '/operations/bookings',
  operationsSuppliers: '/operations/suppliers',
  operationsIncidents: '/operations/incidents',
  finance: '/finance',
  financeOverdue: '/finance/overdue',
  financePayables: '/finance/payables',
  financeReconciliation: '/finance/reconciliation',
  financeDocuments: '/finance/documents',
  financePayments: '/finance/payments',
  inquiries: '/inquiries',
  leads: '/leads',
  trips: '/trips',
  tasks: '/tasks',
  parties: '/parties',
  businessSales: '/business/sales',
  businessCustomers: '/business/customers',
  teamMembers: '/team/members',
  teamRoles: '/team/roles',
  teamPermissions: '/team/permissions',
  teamActivity: '/team/activity',
  rates: '/rates',
  places: '/places',
  network: '/network',
  suppliers: '/suppliers',
  settings: '/settings',
  settingsAudit: '/settings/audit',
  settingsAccess: '/settings/access',
  settingsIntegrations: '/settings/integrations',
  settingsLeadSources: '/settings/lead-sources',
} as const;

export type AgencyRoutePath = (typeof AGENCY_ROUTES)[keyof typeof AGENCY_ROUTES];

/** Legacy query-param URLs → canonical routes (bookmarks, old links). */
export const LEGACY_AGENCY_REDIRECTS: Record<string, string> = {
  '/trips?ops=1': AGENCY_ROUTES.operations,
  '/trips?finance=1': AGENCY_ROUTES.finance,
  '/trips?status=quoted': AGENCY_ROUTES.workQuotations,
  '/trips?status=draft': AGENCY_ROUTES.workQuotationDrafts,
  '/inquiries?status=open': AGENCY_ROUTES.workPlanning,
  '/tasks?due=overdue': AGENCY_ROUTES.workFollowUps,
  '/settings?section=audit': AGENCY_ROUTES.settingsAudit,
  '/settings?section=access': AGENCY_ROUTES.teamMembers,
  '/settings?section=members': AGENCY_ROUTES.teamMembers,
  '/settings?section=integrations': AGENCY_ROUTES.settingsIntegrations,
  '/settings?section=lead-sources': AGENCY_ROUTES.settingsLeadSources,
  '/business/pipeline': AGENCY_ROUTES.leads,
};

/**
 * Determines whether a sidebar item should appear active.
 * Uses exact path match; detail pages highlight their workflow parent, not expert "More" links.
 */
export function isAgencyNavActive(navPath: string, pathname: string, search: string): boolean {
  const legacyTarget = LEGACY_AGENCY_REDIRECTS[`${pathname}${search}`];
  if (legacyTarget && legacyTarget === navPath) return true;

  if (pathname === navPath) return true;

  if (/^\/leads\/[^/]+$/.test(pathname)) {
    if (navPath === AGENCY_ROUTES.leads) return true;
    return false;
  }

  if (pathname === AGENCY_ROUTES.inbox || pathname.startsWith('/inbox/')) {
    return navPath === AGENCY_ROUTES.inbox;
  }

  if (/^\/inquiries\/[^/]+$/.test(pathname)) {
    if (navPath === AGENCY_ROUTES.workRequests || navPath === AGENCY_ROUTES.workPlanning) {
      return navPath === AGENCY_ROUTES.workRequests;
    }
    if (navPath === AGENCY_ROUTES.businessSales) return true;
    return navPath === AGENCY_ROUTES.inquiries;
  }

  if (/^\/trips\/[^/]+$/.test(pathname)) {
    if (navPath === AGENCY_ROUTES.workQuotations || navPath === AGENCY_ROUTES.workQuotationDrafts) {
      return navPath === AGENCY_ROUTES.workQuotations;
    }
    if (navPath.startsWith('/operations')) return navPath === AGENCY_ROUTES.operations;
    if (navPath.startsWith('/finance')) return navPath === AGENCY_ROUTES.finance;
    return navPath === AGENCY_ROUTES.trips;
  }

  if (pathname.startsWith('/settings')) {
    if (navPath === AGENCY_ROUTES.settingsAudit) return pathname === AGENCY_ROUTES.settingsAudit;
    if (navPath === AGENCY_ROUTES.settingsIntegrations) {
      return pathname === AGENCY_ROUTES.settingsIntegrations;
    }
    if (navPath === AGENCY_ROUTES.settingsLeadSources) {
      return pathname === AGENCY_ROUTES.settingsLeadSources;
    }
    if (navPath === AGENCY_ROUTES.teamMembers) {
      return pathname === AGENCY_ROUTES.teamMembers;
    }
    if (navPath === AGENCY_ROUTES.settings) {
      return pathname === AGENCY_ROUTES.settings;
    }
    return false;
  }

  if (pathname.startsWith('/team/')) {
    return pathname === navPath;
  }

  if (pathname.startsWith('/business/')) {
    return pathname === navPath;
  }

  if (/^\/parties\/[^/]+$/.test(pathname)) {
    return navPath === AGENCY_ROUTES.businessCustomers || navPath === AGENCY_ROUTES.parties;
  }

  if (pathname.startsWith('/operations/') && navPath.startsWith('/operations')) {
    return pathname === navPath;
  }

  if (pathname.startsWith('/finance/') && navPath.startsWith('/finance')) {
    return pathname === navPath;
  }

  if (pathname.startsWith('/work/') && navPath.startsWith('/work/')) {
    return pathname === navPath;
  }

  return false;
}
