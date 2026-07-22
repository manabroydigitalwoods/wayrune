import { useLocation } from 'react-router-dom';
import { AGENCY_ROUTES, stripOrgPrefix } from './agencyRoutes';

export type InquiriesPageVariant = 'all' | 'requests' | 'planning' | 'sales';

export function useInquiriesPageVariant(): InquiriesPageVariant {
  const { pathname } = useLocation();
  const path = stripOrgPrefix(pathname);
  if (path === AGENCY_ROUTES.businessSales) return 'sales';
  if (path === AGENCY_ROUTES.workPlanning) return 'planning';
  if (path === AGENCY_ROUTES.workRequests) return 'requests';
  return 'all';
}

export type TripsPageVariant =
  | 'all'
  | 'quotations'
  | 'drafts'
  | 'operations'
  | 'operations-bookings'
  | 'operations-suppliers'
  | 'operations-incidents'
  | 'finance'
  | 'finance-overdue'
  | 'finance-payables'
  | 'finance-reconciliation'
  | 'finance-documents'
  | 'finance-payments';

export function useTripsPageVariant(): TripsPageVariant {
  const { pathname } = useLocation();
  switch (stripOrgPrefix(pathname)) {
    case AGENCY_ROUTES.workQuotations:
      return 'quotations';
    case AGENCY_ROUTES.workQuotationDrafts:
      return 'drafts';
    case AGENCY_ROUTES.operations:
      return 'operations';
    case AGENCY_ROUTES.operationsBookings:
      return 'operations-bookings';
    case AGENCY_ROUTES.operationsSuppliers:
      return 'operations-suppliers';
    case AGENCY_ROUTES.operationsIncidents:
      return 'operations-incidents';
    case AGENCY_ROUTES.finance:
      return 'finance';
    case AGENCY_ROUTES.financeOverdue:
      return 'finance-overdue';
    case AGENCY_ROUTES.financePayables:
      return 'finance-payables';
    case AGENCY_ROUTES.financeReconciliation:
      return 'finance-reconciliation';
    case AGENCY_ROUTES.financeDocuments:
      return 'finance-documents';
    case AGENCY_ROUTES.financePayments:
      return 'finance-payments';
    default:
      return 'all';
  }
}

export type TasksPageVariant = 'all' | 'follow-ups';

export function useTasksPageVariant(): TasksPageVariant {
  const { pathname } = useLocation();
  if (stripOrgPrefix(pathname) === AGENCY_ROUTES.workFollowUps) return 'follow-ups';
  return 'all';
}

export const INQUIRIES_PAGE_COPY: Record<
  InquiriesPageVariant,
  { title: string; subtitle: string; documentTitle: string }
> = {
  all: {
    title: 'Inquiries',
    subtitle: 'Canonical inquiry list with full filters.',
    documentTitle: 'Inquiries',
  },
  requests: {
    title: 'Travel requests',
    subtitle: 'Active travel requests — yours or the team’s, depending on role.',
    documentTitle: 'Travel requests',
  },
  planning: {
    title: 'Planning',
    subtitle: 'Open requests that still need itinerary and quotation work.',
    documentTitle: 'Planning',
  },
  sales: {
    title: 'Sales dashboard',
    subtitle: 'Travel requests across the team — status, completeness, and conversion readiness.',
    documentTitle: 'Sales dashboard',
  },
};

export const TRIPS_PAGE_COPY: Record<
  TripsPageVariant,
  { title: string; subtitle: string; documentTitle: string }
> = {
  all: { title: 'Trips', subtitle: 'Plan, quote, confirm, and operate trips end to end.', documentTitle: 'Trips' },
  quotations: {
    title: 'Quotes',
    subtitle: 'Trips with proposals out or awaiting customer decision.',
    documentTitle: 'Quotes',
  },
  drafts: {
    title: 'Quote drafts',
    subtitle: 'Packages still being priced before sending.',
    documentTitle: 'Quote drafts',
  },
  operations: {
    title: 'Operations',
    subtitle: 'Readiness, confirmations, and fulfilment risks across trips.',
    documentTitle: 'Operations',
  },
  'operations-bookings': {
    title: 'Open bookings',
    subtitle: 'Ops trips that still need supplier bookings confirmed — filtered from Operations.',
    documentTitle: 'Open bookings',
  },
  'operations-suppliers': {
    title: 'Supplier requests',
    subtitle: 'Open service requests awaiting supplier response.',
    documentTitle: 'Supplier requests',
  },
  'operations-incidents': {
    title: 'Alerts & risks',
    subtitle: 'Trips needing operational intervention.',
    documentTitle: 'Alerts & risks',
  },
  finance: {
    title: 'Invoices & payments',
    subtitle: 'Open customer instalments aged by due date.',
    documentTitle: 'Invoices & payments',
  },
  'finance-overdue': {
    title: 'Overdue',
    subtitle: 'Customer payments past due.',
    documentTitle: 'Overdue receivables',
  },
  'finance-payables': {
    title: 'Supplier payables',
    subtitle: 'Amounts owed to suppliers, aged by due date.',
    documentTitle: 'Supplier payables',
  },
  'finance-reconciliation': {
    title: 'Reconciliation',
    subtitle: 'Payments and allocations that need matching.',
    documentTitle: 'Reconciliation',
  },
  'finance-documents': {
    title: 'Commercial documents',
    subtitle: 'Invoices, vouchers, and commercial paperwork across trips.',
    documentTitle: 'Commercial documents',
  },
  'finance-payments': {
    title: 'Payments',
    subtitle: 'Customer receipts and supplier settlements for audit review.',
    documentTitle: 'Payments',
  },
};

export const TASKS_PAGE_COPY: Record<
  TasksPageVariant,
  { title: string; subtitle: string; documentTitle: string }
> = {
  all: { title: 'Tasks', subtitle: 'Team tasks and reminders.', documentTitle: 'Tasks' },
  'follow-ups': {
    title: 'Follow-ups',
    subtitle: 'Overdue and due-today follow-ups that need action.',
    documentTitle: 'Follow-ups',
  },
};

export const LEADS_PAGE_COPY = {
  title: 'Leads',
  subtitle: 'Interested travelers by stage — assignment, follow-ups, and conversion.',
  documentTitle: 'Leads',
} as const;

export type PartiesPageVariant = 'all' | 'customers';

export function usePartiesPageVariant(): PartiesPageVariant {
  const { pathname } = useLocation();
  if (stripOrgPrefix(pathname) === AGENCY_ROUTES.businessCustomers) return 'customers';
  return 'all';
}

export const PARTIES_PAGE_COPY: Record<
  PartiesPageVariant,
  { title: string; subtitle: string; documentTitle: string }
> = {
  all: {
    title: 'Clients',
    subtitle: 'Individuals, B2B agencies and corporate accounts.',
    documentTitle: 'Clients',
  },
  customers: {
    title: 'Customers',
    subtitle: 'People you sell trips to — open a hub for history, or quick-edit contact details.',
    documentTitle: 'Customers',
  },
};
