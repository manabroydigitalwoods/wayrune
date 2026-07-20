/** First-class agency workspace routes — relative paths; wrap with {@link orgPath}. */
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
  operationsMovement: '/operations/movement',
  operationsSuppliers: '/operations/suppliers',
  operationsIncidents: '/operations/incidents',
  finance: '/finance',
  financeOverdue: '/finance/overdue',
  financePayables: '/finance/payables',
  financeProfitability: '/finance/profitability',
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
  settingsInbox: '/settings/inbox',
  settingsInboxChat: '/settings/inbox/chat',
  settingsInboxChatflows: '/settings/inbox/chat/chatflows',
  settingsIntegrations: '/settings/integrations',
  settingsIntegrationHelp: '/settings/integrations/help',
  settingsLeadSources: '/settings/lead-sources',
  /** Relative presence root — use {@link presencePagesPath} for the full URL. */
  settingsPresence: '/presence',
} as const;

export type AgencyRoutePath = (typeof AGENCY_ROUTES)[keyof typeof AGENCY_ROUTES];

/**
 * Org-scoped portal id for URLs.
 * Prefer numeric `publicCode`; cuid accepted as fallback.
 */
export function orgPortalRef(org: {
  id: string;
  publicCode?: number | null;
}): string {
  return org.publicCode != null ? String(org.publicCode) : org.id;
}

/** @deprecated Use {@link orgPortalRef} */
export const presenceOrgRef = orgPortalRef;

/** Prefix an app-relative path with the org portal ref: `/10001/inbox`. */
export function orgPath(orgRef: string | number, path = '/'): string {
  const ref = String(orgRef).replace(/^\/+|\/+$/g, '');
  if (!ref) return path.startsWith('/') ? path : `/${path}`;
  let rest = path || '/';
  if (!rest.startsWith('/')) rest = `/${rest}`;
  // Avoid double-prefixing if already scoped
  if (rest === `/${ref}` || rest.startsWith(`/${ref}/`)) return rest;
  if (rest === '/') return `/${ref}`;
  return `/${ref}${rest}`;
}

/**
 * Strip leading `/:orgRef` from a pathname when it matches the given ref
 * (or any org-looking first segment when orgRef is omitted).
 */
export function stripOrgPrefix(pathname: string, orgRef?: string | number | null): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (orgRef != null && String(orgRef)) {
    const ref = String(orgRef);
    if (path === `/${ref}`) return '/';
    if (path.startsWith(`/${ref}/`)) return path.slice(ref.length + 1) || '/';
    return path;
  }
  // Strip first segment when it looks like a portal id (numeric or cuid-ish)
  const match = path.match(/^\/([^/]+)(\/.*)?$/);
  if (!match) return path;
  const seg = match[1]!;
  const rest = match[2] || '/';
  if (/^\d+$/.test(seg) || /^c[a-z0-9]{20,}$/i.test(seg)) {
    return rest === '' ? '/' : rest;
  }
  return path;
}

/** App-relative path + search for nav matching (ignores org prefix). */
export function agencyRelativePath(pathname: string, orgRef?: string | number | null): string {
  return stripOrgPrefix(pathname, orgRef);
}

export function presencePagesPath(orgRef: string | number): string {
  return orgPath(orgRef, '/presence/pages');
}

export function presencePageEditorPath(orgRef: string | number, pageId: string): string {
  return orgPath(orgRef, `/presence/pages/${pageId}/builder`);
}

export function presenceSitePath(orgRef: string | number, siteId: string): string {
  return orgPath(orgRef, `/presence/sites/${siteId}`);
}

export function presenceThemesPath(orgRef: string | number): string {
  return orgPath(orgRef, '/presence/themes');
}

export function presenceModulesPath(orgRef: string | number): string {
  return orgPath(orgRef, '/presence/modules');
}

export function presenceFormsPath(orgRef: string | number): string {
  return orgPath(orgRef, '/presence/forms');
}

export function presenceWidgetsPath(orgRef: string | number): string {
  // Legacy path; chat widgets moved to Inbox → Chat → Chatflows.
  return settingsInboxChatflowsPath(orgRef);
}

export function settingsInboxPath(orgRef: string | number): string {
  return orgPath(orgRef, AGENCY_ROUTES.settingsInbox);
}

export function settingsInboxChatPath(orgRef: string | number): string {
  return orgPath(orgRef, AGENCY_ROUTES.settingsInboxChat);
}

export function settingsInboxChatflowsPath(orgRef: string | number): string {
  return orgPath(orgRef, AGENCY_ROUTES.settingsInboxChatflows);
}

export function settingsInboxChatflowPath(orgRef: string | number, chatflowId: string): string {
  return orgPath(orgRef, `${AGENCY_ROUTES.settingsInboxChatflows}/${chatflowId}`);
}

export function presenceDomainsPath(orgRef: string | number): string {
  return orgPath(orgRef, '/presence/domains');
}

export function presenceAssetsPath(orgRef: string | number): string {
  return orgPath(orgRef, '/presence/assets');
}

export function presenceCollectionsPath(orgRef: string | number): string {
  return orgPath(orgRef, '/presence/collections');
}

export function presenceMarketplacePath(orgRef: string | number): string {
  return orgPath(orgRef, '/presence/marketplace');
}

export function presenceSettingsPath(orgRef: string | number): string {
  return presenceThemesPath(orgRef);
}

/** Rewrite a possibly org-prefixed path onto a new org portal ref. */
export function rewriteOrgPrefix(
  pathname: string,
  search: string,
  newOrgRef: string | number,
  oldOrgRef?: string | number | null,
): string {
  const relative = stripOrgPrefix(pathname, oldOrgRef);
  return `${orgPath(newOrgRef, relative)}${search || ''}`;
}

/** Legacy query-param URLs → canonical relative routes (bookmarks, old links). */
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
 * Flat agency paths that should redirect into `/:orgRef/...` when logged in as agency.
 * Detail wildcards handled separately in the router.
 */
export const AGENCY_FLAT_REDIRECT_PATHS = [
  AGENCY_ROUTES.inbox,
  AGENCY_ROUTES.workRequests,
  AGENCY_ROUTES.workPlanning,
  AGENCY_ROUTES.workQuotations,
  AGENCY_ROUTES.workQuotationDrafts,
  AGENCY_ROUTES.workFollowUps,
  AGENCY_ROUTES.operations,
  AGENCY_ROUTES.operationsBookings,
  AGENCY_ROUTES.operationsMovement,
  AGENCY_ROUTES.operationsSuppliers,
  AGENCY_ROUTES.operationsIncidents,
  AGENCY_ROUTES.finance,
  AGENCY_ROUTES.financeOverdue,
  AGENCY_ROUTES.financePayables,
  AGENCY_ROUTES.financeProfitability,
  AGENCY_ROUTES.financeReconciliation,
  AGENCY_ROUTES.financeDocuments,
  AGENCY_ROUTES.financePayments,
  AGENCY_ROUTES.inquiries,
  AGENCY_ROUTES.leads,
  AGENCY_ROUTES.trips,
  AGENCY_ROUTES.tasks,
  AGENCY_ROUTES.parties,
  AGENCY_ROUTES.businessSales,
  AGENCY_ROUTES.businessCustomers,
  AGENCY_ROUTES.teamMembers,
  AGENCY_ROUTES.teamRoles,
  AGENCY_ROUTES.teamPermissions,
  AGENCY_ROUTES.teamActivity,
  AGENCY_ROUTES.rates,
  AGENCY_ROUTES.places,
  AGENCY_ROUTES.network,
  AGENCY_ROUTES.suppliers,
  AGENCY_ROUTES.settings,
  AGENCY_ROUTES.settingsAudit,
  AGENCY_ROUTES.settingsIntegrations,
  AGENCY_ROUTES.settingsIntegrationHelp,
  AGENCY_ROUTES.settingsLeadSources,
] as const;

/**
 * Determines whether a sidebar item should appear active.
 * `navPath` and `pathname` may be org-prefixed; matching uses relative paths.
 */
export function isAgencyNavActive(navPath: string, pathname: string, search: string): boolean {
  const relNav = stripOrgPrefix(navPath);
  const relPath = stripOrgPrefix(pathname);
  const legacyTarget = LEGACY_AGENCY_REDIRECTS[`${relPath}${search}`];
  if (legacyTarget && legacyTarget === relNav) return true;

  if (relPath === relNav) return true;

  if (/^\/leads\/[^/]+$/.test(relPath)) {
    if (relNav === AGENCY_ROUTES.leads) return true;
    return false;
  }

  if (relPath === AGENCY_ROUTES.inbox || relPath.startsWith('/inbox/')) {
    return relNav === AGENCY_ROUTES.inbox;
  }

  if (/^\/inquiries\/[^/]+$/.test(relPath)) {
    if (relNav === AGENCY_ROUTES.workRequests || relNav === AGENCY_ROUTES.workPlanning) {
      return relNav === AGENCY_ROUTES.workRequests;
    }
    if (relNav === AGENCY_ROUTES.businessSales) return true;
    return relNav === AGENCY_ROUTES.inquiries;
  }

  if (/^\/trips\/[^/]+/.test(relPath)) {
    const tab = new URLSearchParams(search).get('tab') || 'overview';
    // Trip workspace tabs map to exactly one sidebar entry (never highlight several).
    if (tab === 'quotations') return relNav === AGENCY_ROUTES.workQuotations;
    if (tab === 'operations') return relNav === AGENCY_ROUTES.operations;
    if (tab === 'finance') return relNav === AGENCY_ROUTES.finance;
    return relNav === AGENCY_ROUTES.trips;
  }

  if (
    relPath.startsWith('/presence/') ||
    relPath === '/presence' ||
    relPath.startsWith('/settings/presence')
  ) {
    return (
      relNav === AGENCY_ROUTES.settingsPresence ||
      relNav.startsWith('/presence/') ||
      relNav.startsWith('/settings/presence')
    );
  }

  if (relPath.startsWith('/settings')) {
    if (relNav === AGENCY_ROUTES.settingsAudit) return relPath === AGENCY_ROUTES.settingsAudit;
    if (relNav === AGENCY_ROUTES.settingsInbox) {
      return (
        relPath === AGENCY_ROUTES.settingsInbox ||
        relPath.startsWith(`${AGENCY_ROUTES.settingsInbox}/`)
      );
    }
    if (relNav === AGENCY_ROUTES.settingsIntegrations) {
      return (
        relPath === AGENCY_ROUTES.settingsIntegrations ||
        relPath === AGENCY_ROUTES.settingsIntegrationHelp
      );
    }
    if (relNav === AGENCY_ROUTES.settingsLeadSources) {
      return relPath === AGENCY_ROUTES.settingsLeadSources;
    }
    if (relNav === AGENCY_ROUTES.teamMembers) {
      return relPath === AGENCY_ROUTES.teamMembers;
    }
    if (relNav === AGENCY_ROUTES.settings) {
      return (
        relPath === AGENCY_ROUTES.settings ||
        relPath === AGENCY_ROUTES.settingsInbox ||
        relPath.startsWith(`${AGENCY_ROUTES.settingsInbox}/`)
      );
    }
    return false;
  }

  if (relPath.startsWith('/team/')) {
    return relPath === relNav;
  }

  if (relPath.startsWith('/business/')) {
    return relPath === relNav;
  }

  if (/^\/suppliers\/[^/]+$/.test(relPath)) {
    return relNav === AGENCY_ROUTES.suppliers;
  }

  if (/^\/parties\/[^/]+$/.test(relPath)) {
    return relNav === AGENCY_ROUTES.businessCustomers || relNav === AGENCY_ROUTES.parties;
  }

  if (relPath.startsWith('/operations/') && relNav.startsWith('/operations')) {
    return relPath === relNav;
  }

  if (relPath.startsWith('/finance/') && relNav.startsWith('/finance')) {
    return relPath === relNav;
  }

  if (relPath.startsWith('/work/') && relNav.startsWith('/work/')) {
    return relPath === relNav;
  }

  return false;
}
