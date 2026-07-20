import { useEffect, useState } from 'react';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import {
  AlertCircle,
  CheckCircle2,
  Contact,
  FileText,
  Inbox,
  LayoutDashboard,
  Plane,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader, StatCard, formatCurrency, Button } from '@wayrune/ui';
import { api } from '../api';
import { AgencyOnboardingChecklist } from '../components/agency/AgencyOnboardingChecklist';
import { OpsCentreStats } from '../components/agency/OpsCentreStats';
import { FinanceHomeStats } from '../components/agency/FinanceHomeStats';
import { MovementHomeStats } from '../components/agency/MovementHomeStats';
import { SalesSlaHomeStats } from '../components/agency/SalesSlaHomeStats';
import { CommercialDocumentsPanel } from '../components/commerce/CommercialDocumentsPanel';
import { ConversationsPanel } from '../components/commerce/ConversationsPanel';
import { ServiceRequestsPanel } from '../components/commerce/ServiceRequestsPanel';
import { WorkflowRecoveryPanel } from '../components/commerce/WorkflowRecoveryPanel';
import { DmcFulfilmentBoard } from '../components/dmc/DmcFulfilmentBoard';
import { useAuth } from '../auth';
import { usePermissions } from '../lib/permissions';
import { PLANNING_INQUIRIES_LABEL } from '../lib/agencyStatusLabels';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { useAgencyWorkspace } from '../hooks/useAgencyWorkspace';
import { composeDashboardSections, WORKSPACE_LABELS } from '../lib/progressiveComplexity';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  agencyWorkspaceSubtitle,
  isDmcOrgKind,
} from '../lib/orgKind';

type AgingBucket = { count: number; amount: number };

type SalesDash = {
  myNewLeads: number;
  followUpsDue: number;
  followUpsOverdue?: number;
  openInquiries: number;
  quotesAwaiting: number;
  won: number;
  lost: number;
  activeTrips: number;
  unconfirmedBookings: number;
  overduePayments: number;
  bookingsLast30d?: number;
  bookingsPrior30d?: number;
  conversionRate?: number | null;
  quoteToWinRate?: number | null;
  quotesSentLast30d?: number;
  arAging?: {
    current: AgingBucket;
    d1_30: AgingBucket;
    d31_60: AgingBucket;
    d61_plus: AgingBucket;
    noDue: AgingBucket;
  };
  unassignedInquiries?: number;
  teamFollowUpsDue?: number;
  staleOpportunities?: number;
  medianFirstTouchHours30d?: number | null;
  medianLeadToQuoteHours30d?: number | null;
  firstTouchSampleSize30d?: number;
  leadToQuoteSampleSize30d?: number;
  medianFitBuildMinutes30d?: number | null;
  fitBuildSampleSize30d?: number;
  fitBuildDemoSampleSize30d?: number;
  fitClaimProtocol?: {
    definition?: string;
    targetMinutes?: number;
    minSampleSize?: number;
    sampleSize?: number;
    medianMinutes?: number | null;
    claimStatus?: 'testing' | 'ready';
    publicClaimAllowed?: boolean;
    demoSampleSize?: number;
    demoClaimReady?: boolean;
  } | null;
  firstTouchTargetHours?: number | null;
  leadToQuoteTargetHours?: number | null;
  fitBuildTargetMinutes?: number | null;
  inboxUnreadThreads?: number;
  inboxAgingUnreadThreads?: number;
  inboxAgingHours?: number;
};

type JourneyAnalytics = {
  windowDays: number;
  total: number;
  unread: number;
  byChannel: Array<{ channel: string; count: number }>;
  byAcquisition: Array<{ sourceKey: string; count: number }>;
  byOutcome: Array<{ outcome: string; count: number }>;
};

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function humanizeKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function outcomeFunnelLabel(outcome: string) {
  switch (outcome) {
    case 'created_travel_request':
      return 'Travel request';
    case 'attached_existing':
      return 'Attached';
    case 'follow_up':
      return 'Follow-up';
    case 'spam':
      return 'Spam';
    case 'no_interest':
      return 'No interest';
    case 'pending':
      return 'Pending';
    default:
      return humanizeKey(outcome);
  }
}

export function DashboardPage() {
  const { navigate } = useOrgNavigate();
  const { me } = useAuth();
  const { workspace, workspaceLabel } = useAgencyWorkspace();
  const sections = workspace
    ? composeDashboardSections(workspace, me?.permissions ?? [])
    : { primary: [], secondary: [] };
  const [showSecondaryDashboard, setShowSecondaryDashboard] = useState(false);
  const activeWidgetKeys = new Set([
    ...sections.primary.map((w) => w.key),
    ...(showSecondaryDashboard ? sections.secondary.map((w) => w.key) : []),
  ]);
  const hasWidget = (key: string) => activeWidgetKeys.has(key);
  const showSalesStats =
    hasWidget('followups_today') ||
    hasWidget('new_requests') ||
    hasWidget('team_pipeline') ||
    hasWidget('business_health') ||
    hasWidget('quotes_to_send') ||
    hasWidget('customers_waiting');
  const showSalesSla = hasWidget('sales_sla');
  const showOpsPanels =
    hasWidget('arrivals_today') ||
    hasWidget('unconfirmed_bookings') ||
    hasWidget('readiness_blockers') ||
    hasWidget('open_incidents');
  const showManagerStats =
    hasWidget('unassigned_requests') ||
    hasWidget('team_pipeline') ||
    hasWidget('stale_opportunities') ||
    hasWidget('conversion_movement');
  const showChannelJourneys = hasWidget('channel_journeys');
  const showFinancePanels =
    hasWidget('due_today') ||
    hasWidget('overdue_receivables') ||
    hasWidget('supplier_payables') ||
    hasWidget('portfolio_margin') ||
    hasWidget('unallocated_payments');
  const showMovement =
    hasWidget('movement_window') || hasWidget('arrivals_today');

  useDocumentTitle(workspaceLabel ?? 'Dashboard');
  const { has } = usePermissions();
  const canOps = has('ops.read');
  const canFinanceDocs = has('finance.cost.read');
  const dmc = isDmcOrgKind(me?.organization.kind);
  const [data, setData] = useState<SalesDash | null>(null);
  const [journeyAnalytics, setJourneyAnalytics] = useState<JourneyAnalytics | null>(null);
  const [error, setError] = useState('');
  const needSales = showSalesStats || showManagerStats || showSalesSla;

  useEffect(() => {
    if (!needSales) return;
    api<SalesDash>('/dashboard/sales')
      .then(setData)
      .catch((e) => setError(e.message));
  }, [needSales]);

  useEffect(() => {
    if (!showChannelJourneys) return;
    api<JourneyAnalytics>('/interactions/analytics/summary')
      .then(setJourneyAnalytics)
      .catch(() => setJourneyAnalytics(null));
  }, [showChannelJourneys]);

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title={workspace ? WORKSPACE_LABELS[workspace] : dmc ? 'DMC operations' : 'Sales & operations'}
        subtitle={
          workspace
            ? sections.primary.map((w) => w.title).slice(0, 3).join(' · ') ||
              agencyWorkspaceSubtitle(me?.organization.kind)
            : agencyWorkspaceSubtitle(me?.organization.kind)
        }
      />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {workspace === 'owner' || hasWidget('business_health') ? (
        <AgencyOnboardingChecklist />
      ) : null}
      {needSales && !data && !error ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
      {data && showSalesSla ? <SalesSlaHomeStats data={data} /> : null}
      {data && showSalesStats ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3">
            <StatCard
              label="My new leads"
              value={data.myNewLeads}
              tone="neutral"
              icon={Users}
              onClick={() => navigate(AGENCY_ROUTES.inbox)}
            />
            <StatCard
              label="Follow-ups due"
              value={data.followUpsDue}
              tone="warn"
              icon={AlertCircle}
              onClick={() => navigate(AGENCY_ROUTES.workFollowUps)}
            />
            <StatCard
              label={PLANNING_INQUIRIES_LABEL}
              value={data.openInquiries}
              tone="neutral"
              icon={Contact}
              onClick={() => navigate(AGENCY_ROUTES.workPlanning)}
            />
            <StatCard
              label="Quotes awaiting"
              value={data.quotesAwaiting}
              tone="warn"
              icon={FileText}
              onClick={() => navigate(AGENCY_ROUTES.workQuotations)}
            />
            <StatCard
              label="Active trips"
              value={data.activeTrips}
              tone="neutral"
              icon={Plane}
              onClick={() => navigate('/trips')}
            />
            <StatCard
              label="Bookings (30d)"
              value={data.bookingsLast30d ?? 0}
              tone="neutral"
              icon={CheckCircle2}
              onClick={() => navigate('/trips')}
            />
            <StatCard
              label="Win rate"
              value={pct(data.conversionRate)}
              tone="success"
              icon={TrendingDown}
              onClick={() => navigate('/leads?stage=won')}
            />
            <StatCard
              label="Unconfirmed bookings"
              value={data.unconfirmedBookings}
              tone="warn"
              icon={AlertCircle}
              onClick={() => navigate('/trips')}
            />
            <StatCard
              label="Payments due"
              value={data.overduePayments}
              tone="danger"
              icon={Wallet}
              onClick={() => navigate(AGENCY_ROUTES.financeOverdue)}
            />
            <StatCard
              label="Won"
              value={data.won}
              tone="success"
              icon={CheckCircle2}
              onClick={() => navigate('/leads?stage=won')}
            />
            <StatCard
              label="Lost"
              value={data.lost}
              tone="danger"
              icon={TrendingDown}
              onClick={() => navigate('/leads?stage=lost')}
            />
          </div>

          {data.arAging ? (
            <div className="mt-6 rounded-xl border border-border/60 p-4">
              <h2 className="text-sm font-semibold">AR aging (open invoices)</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Outstanding receivable by days past due. Prior 30d bookings:{' '}
                {data.bookingsPrior30d ?? 0}
                {data.quoteToWinRate != null
                  ? ` · Quote→win (approx): ${pct(data.quoteToWinRate)}`
                  : ''}
              </p>
              <div className="grid gap-2 sm:grid-cols-5">
                {(
                  [
                    ['Current', data.arAging.current],
                    ['1–30', data.arAging.d1_30],
                    ['31–60', data.arAging.d31_60],
                    ['61+', data.arAging.d61_plus],
                    ['No due date', data.arAging.noDue],
                  ] as const
                ).map(([label, bucket]) => (
                  <div key={label} className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-semibold tabular-nums">{bucket.count}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(bucket.amount, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showChannelJourneys && journeyAnalytics ? (
        <div className="mt-6 rounded-xl border border-border/60 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Channel journeys</h2>
              <p className="text-xs text-muted-foreground">
                Last {journeyAnalytics.windowDays} days · {journeyAnalytics.total} interactions ·{' '}
                {journeyAnalytics.unread} unread
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              onClick={() => navigate(AGENCY_ROUTES.inbox)}
            >
              <Inbox className="size-3.5" />
              Open inbox
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">By channel</p>
              <div className="flex flex-wrap gap-2">
                {journeyAnalytics.byChannel.length ? (
                  journeyAnalytics.byChannel.map((row) => (
                    <button
                      key={row.channel}
                      type="button"
                      className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm hover:bg-muted/70"
                      onClick={() => navigate(`${AGENCY_ROUTES.inbox}?channel=${encodeURIComponent(row.channel)}`)}
                    >
                      {humanizeKey(row.channel)} · {row.count}
                    </button>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No channel data yet</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">By acquisition</p>
              <div className="flex flex-wrap gap-2">
                {journeyAnalytics.byAcquisition.length ? (
                  journeyAnalytics.byAcquisition.map((row) => (
                    <span key={row.sourceKey} className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
                      {humanizeKey(row.sourceKey)} · {row.count}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No acquisition data yet</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">By outcome</p>
              <div className="flex flex-wrap gap-2">
                {journeyAnalytics.byOutcome?.length ? (
                  journeyAnalytics.byOutcome.map((row) => (
                    <span key={row.outcome} className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
                      {outcomeFunnelLabel(row.outcome)} · {row.count}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No outcome data yet</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {data && showManagerStats ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {hasWidget('unassigned_requests') ? (
            <StatCard
              label="Unassigned requests"
              value={data.unassignedInquiries ?? 0}
              tone="warn"
              icon={Contact}
              onClick={() => navigate(AGENCY_ROUTES.inquiries)}
            />
          ) : null}
          {hasWidget('team_pipeline') ? (
            <StatCard
              label="Team follow-ups due"
              value={data.teamFollowUpsDue ?? 0}
              tone="warn"
              icon={Users}
              onClick={() => navigate(AGENCY_ROUTES.workFollowUps)}
            />
          ) : null}
          {hasWidget('stale_opportunities') ? (
            <StatCard
              label="Stale opportunities"
              value={data.staleOpportunities ?? 0}
              tone="danger"
              icon={TrendingDown}
              onClick={() => navigate(AGENCY_ROUTES.leads)}
            />
          ) : null}
        </div>
      ) : null}

      {sections.secondary.length > 0 ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSecondaryDashboard((v) => !v)}
          >
            {showSecondaryDashboard
              ? 'Hide extra metrics'
              : `Show ${sections.secondary.length} more metric${sections.secondary.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      ) : null}

      {canOps && showOpsPanels ? (
        <>
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold">Ops command centre</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Cross-trip risks: unconfirmed bookings, open service requests, incidents, and arrivals.
            </p>
            <OpsCentreStats />
          </div>

          {showMovement ? (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-semibold">Movement (14 days)</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Upcoming hotel check-ins and transfers with risk chips.
              </p>
              <MovementHomeStats />
            </div>
          ) : null}

          <div className="mt-4">
            <WorkflowRecoveryPanel />
          </div>
        </>
      ) : null}

      {dmc && canOps && showOpsPanels ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Ground fulfilment</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Local supplier service requests, line items, and partner settlements.
          </p>
          <DmcFulfilmentBoard />
        </div>
      ) : null}

      {canOps && showOpsPanels ? (
        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          {dmc ? null : <ServiceRequestsPanel />}
          <ConversationsPanel />
        </div>
      ) : null}

      {showFinancePanels ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Finance</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Receivables, payables, and accepted-quote portfolio margin.
          </p>
          <FinanceHomeStats />
          {canFinanceDocs ? (
            <div className="mt-4">
              <CommercialDocumentsPanel />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
