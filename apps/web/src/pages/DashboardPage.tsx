import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import {
  PageHeader,
  PageStack,
  SectionStack,
  Skeleton,
  Button,
  DateRangeFilter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Card,
  CardContent,
  type DateRangeValue,
} from '@wayrune/ui';
import { api } from '../api';
import { AgencyOnboardingChecklist } from '../components/agency/AgencyOnboardingChecklist';
import { PilotReadinessPanel } from '../components/agency/PilotReadinessPanel';
import { OpsCentreStats } from '../components/agency/OpsCentreStats';
import { FinanceHomeStats } from '../components/agency/FinanceHomeStats';
import { MovementHomeStats } from '../components/agency/MovementHomeStats';
import { SalesSlaHomeStats } from '../components/agency/SalesSlaHomeStats';
import { DashboardInsightCard } from '../components/agency/DashboardInsightCard';
import { DashboardBarList } from '../components/agency/DashboardBarList';
import { WorkflowRecoveryPanel } from '../components/commerce/WorkflowRecoveryPanel';
import { DmcFulfilmentBoard } from '../components/dmc/DmcFulfilmentBoard';
import { useAuth } from '../auth';
import { usePermissions } from '../lib/permissions';
import { PLANNING_INQUIRIES_LABEL } from '../lib/agencyStatusLabels';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { useAgencyWorkspace } from '../hooks/useAgencyWorkspace';
import { composeDashboardWidgets, WORKSPACE_LABELS } from '../lib/progressiveComplexity';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { agencyWorkspaceSubtitle, isDmcOrgKind } from '../lib/orgKind';
import {
  composeDashboardTabs,
  dashboardTabAttention,
  DASHBOARD_TAB_LABELS,
  defaultDashboardTab,
  isDashboardTab,
  type DashboardTab,
} from '../lib/dashboardHome';

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
  window?: { from: string; to: string; days: number };
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
  const [searchParams, setSearchParams] = useSearchParams();
  const widgets = useMemo(
    () =>
      workspace
        ? composeDashboardWidgets(workspace, me?.permissions ?? [])
        : [],
    [workspace, me?.permissions],
  );
  const hasWidget = (key: string) => widgets.some((w) => w.key === key);

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

  const tabFlags = useMemo(
    () => ({
      sales: showSalesStats || showSalesSla || showManagerStats,
      operations: showOpsPanels || showMovement,
      finance: showFinancePanels,
      insights: showChannelJourneys || showManagerStats || !!showSalesStats,
    }),
    [
      showSalesStats,
      showSalesSla,
      showManagerStats,
      showOpsPanels,
      showMovement,
      showFinancePanels,
      showChannelJourneys,
    ],
  );
  const tabs = useMemo(() => composeDashboardTabs(tabFlags), [tabFlags]);

  const rawTab = searchParams.get('tab');
  const tab: DashboardTab = isDashboardTab(rawTab) && tabs.includes(rawTab)
    ? rawTab
    : defaultDashboardTab(workspace, tabs);

  function changeTab(next: string) {
    if (!isDashboardTab(next) || !tabs.includes(next)) return;
    const params = new URLSearchParams(searchParams);
    if (next === defaultDashboardTab(workspace, tabs)) params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  }

  useDocumentTitle(workspaceLabel ?? 'Dashboard');
  const { has } = usePermissions();
  const canOps = has('ops.read');
  const dmc = isDmcOrgKind(me?.organization.kind);
  const [data, setData] = useState<SalesDash | null>(null);
  const [journeyAnalytics, setJourneyAnalytics] = useState<JourneyAnalytics | null>(
    null,
  );
  const [error, setError] = useState('');
  const [statsRange, setStatsRange] = useState<DateRangeValue>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const period = searchParams.get('period');
    if (from && to) return { from, to, presetId: period || 'custom' };
    // Default: no explicit range → API windowDays=30
    return { from: null, to: null, presetId: null };
  });
  const needSales = showSalesStats || showManagerStats || showSalesSla;

  function salesQuery(range: DateRangeValue): string {
    const params = new URLSearchParams();
    if (range.from && range.to) {
      params.set('from', range.from);
      params.set('to', range.to);
    } else {
      params.set('windowDays', '30');
    }
    return params.toString();
  }

  function onStatsRangeChange(next: DateRangeValue) {
    setStatsRange(next);
    const params = new URLSearchParams(searchParams);
    if (next.from && next.to) {
      params.set('from', next.from);
      params.set('to', next.to);
      if (next.presetId && next.presetId !== 'custom') params.set('period', next.presetId);
      else params.delete('period');
    } else {
      params.delete('from');
      params.delete('to');
      params.delete('period');
    }
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    if (!needSales) return;
    api<SalesDash>(`/dashboard/sales?${salesQuery(statsRange)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [needSales, statsRange.from, statsRange.to]);

  useEffect(() => {
    if (!showChannelJourneys) return;
    api<JourneyAnalytics>('/interactions/analytics/summary')
      .then(setJourneyAnalytics)
      .catch(() => setJourneyAnalytics(null));
  }, [showChannelJourneys]);

  const attention = dashboardTabAttention(
    {
      followUpsOverdue: data?.followUpsOverdue,
      followUpsDue: data?.followUpsDue,
      quotesAwaiting: data?.quotesAwaiting,
      unconfirmedBookings: data?.unconfirmedBookings,
      overduePayments: data?.overduePayments,
      inboxUnreadThreads: data?.inboxUnreadThreads,
      unassignedInquiries: data?.unassignedInquiries,
    },
    tabFlags,
  );

  const showSetup =
    workspace === 'owner' || hasWidget('business_health');

  const overviewHint = (() => {
    if (!data) return 'Open a tab below for sales, operations, or finance detail.';
    if ((data.followUpsOverdue ?? 0) > 0)
      return 'Start with overdue follow-ups — customers waiting on a reply.';
    if ((data.quotesAwaiting ?? 0) > 0)
      return 'Quotes are waiting to send — finish pricing and Send.';
    if ((data.unconfirmedBookings ?? 0) > 0)
      return 'Unconfirmed bookings need supplier confirm before travel.';
    if ((data.overduePayments ?? 0) > 0)
      return 'Overdue collections need chase from Finance.';
    return 'Nothing urgent — keep the pipeline moving from Sales.';
  })();

  return (
    <PageStack>
      <PageHeader
        icon={LayoutDashboard}
        title={
          workspace
            ? WORKSPACE_LABELS[workspace]
            : dmc
              ? 'DMC operations'
              : 'Sales & operations'
        }
        subtitle={
          workspace
            ? agencyWorkspaceSubtitle(me?.organization.kind)
            : agencyWorkspaceSubtitle(me?.organization.kind)
        }
        actions={
          tab === 'overview' || tab === 'insights' || tab === 'sales' ? (
            <DateRangeFilter
              pack="history"
              dimensionLabel="Activity"
              value={statsRange}
              onChange={onStatsRangeChange}
              emptyLabel="Last 30 days"
              data-testid="dashboard-activity-range"
            />
          ) : null
        }
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="w-full sm:w-auto">
          {tabs.map((value) => {
            const cue = attention[value] ?? 0;
            return (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <span>{DASHBOARD_TAB_LABELS[value]}</span>
                {cue > 0 ? (
                  <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-warning-soft px-1 text-[10px] font-semibold tabular-nums text-warning">
                    {cue > 99 ? '99+' : cue}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview">
          <SectionStack>
          {showSetup ? (
            <div className="stack-form">
              <AgencyOnboardingChecklist />
              <PilotReadinessPanel compact />
            </div>
          ) : null}

          <Card className="border-border/60 bg-muted/20">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-[var(--pad-card)]">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What needs attention
                </p>
                <p className="mt-1 text-sm text-foreground">{overviewHint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {tabFlags.sales ? (
                  <Button size="sm" variant="secondary" onClick={() => changeTab('sales')}>
                    Open Sales
                  </Button>
                ) : null}
                {tabFlags.operations ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => changeTab('operations')}
                  >
                    Open Operations
                  </Button>
                ) : null}
                {tabFlags.finance ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => changeTab('finance')}
                  >
                    Open Finance
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {needSales && !data && !error ? (
            <div
              role="status"
              aria-busy="true"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              <span className="sr-only">Loading</span>
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/60 p-[var(--pad-card)] glass"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-7 w-16" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="size-8 shrink-0 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {data ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <DashboardInsightCard
                label="Follow-ups due"
                value={data.followUpsDue}
                hint={
                  (data.followUpsOverdue ?? 0) > 0
                    ? `${data.followUpsOverdue} overdue`
                    : 'Today’s callbacks'
                }
                tone={(data.followUpsOverdue ?? 0) > 0 ? 'danger' : 'warn'}
                icon={AlertCircle}
                onClick={() => navigate(AGENCY_ROUTES.workFollowUps)}
              />
              <DashboardInsightCard
                label="Quotes awaiting"
                value={data.quotesAwaiting}
                hint="Draft / ready to send"
                tone="warn"
                icon={FileText}
                onClick={() => navigate(AGENCY_ROUTES.workQuotations)}
              />
              <DashboardInsightCard
                label="Inbox unread"
                value={data.inboxUnreadThreads ?? 0}
                hint={
                  (data.inboxAgingUnreadThreads ?? 0) > 0
                    ? `${data.inboxAgingUnreadThreads} aging`
                    : 'Threads needing a look'
                }
                tone={(data.inboxAgingUnreadThreads ?? 0) > 0 ? 'warn' : 'neutral'}
                icon={Inbox}
                onClick={() => navigate(AGENCY_ROUTES.inbox)}
              />
              <DashboardInsightCard
                label="Unconfirmed bookings"
                value={data.unconfirmedBookings}
                hint="Supplier confirm still open"
                tone={data.unconfirmedBookings > 0 ? 'warn' : 'neutral'}
                icon={AlertCircle}
                onClick={() => navigate(AGENCY_ROUTES.operationsBookings)}
              />
              <DashboardInsightCard
                label="Payments overdue"
                value={data.overduePayments}
                hint="Customer collections"
                tone={data.overduePayments > 0 ? 'danger' : 'neutral'}
                icon={Wallet}
                onClick={() =>
                  tabFlags.finance
                    ? changeTab('finance')
                    : navigate(AGENCY_ROUTES.financeOverdue)
                }
              />
              <DashboardInsightCard
                label="Active trips"
                value={data.activeTrips}
                hint="In flight or booking"
                tone="neutral"
                icon={Plane}
                onClick={() => navigate('/trips')}
              />
            </div>
          ) : showFinancePanels && !needSales ? (
            <div>
              <h2 className="mb-1 text-sm font-semibold">Money at a glance</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Jump into Finance for aging detail and documents.
              </p>
              <FinanceHomeStats />
            </div>
          ) : null}
          </SectionStack>
        </TabsContent>

        {tabFlags.sales ? (
          <TabsContent value="sales">
            <SectionStack>
            {needSales && !data && !error ? (
              <div className="space-y-2" role="status" aria-busy="true">
                <span className="sr-only">Loading</span>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : null}
            {data && showSalesSla ? <SalesSlaHomeStats data={data} /> : null}
            {data && showSalesStats ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <DashboardInsightCard
                  label="My new leads"
                  value={data.myNewLeads}
                  hint="Fresh inbound"
                  icon={Users}
                  onClick={() => navigate(AGENCY_ROUTES.inbox)}
                />
                <DashboardInsightCard
                  label={PLANNING_INQUIRIES_LABEL}
                  value={data.openInquiries}
                  hint="Open planning queue"
                  icon={Contact}
                  onClick={() => navigate(AGENCY_ROUTES.workPlanning)}
                />
                <DashboardInsightCard
                  label="Quotes awaiting"
                  value={data.quotesAwaiting}
                  hint="Finish and Send"
                  tone="warn"
                  icon={FileText}
                  onClick={() => navigate(AGENCY_ROUTES.workQuotations)}
                />
                <DashboardInsightCard
                  label="Bookings (30d)"
                  value={data.bookingsLast30d ?? 0}
                  hint={
                    data.bookingsPrior30d != null
                      ? `Prior 30d: ${data.bookingsPrior30d}`
                      : 'Confirmed in the last month'
                  }
                  icon={CheckCircle2}
                  onClick={() => navigate('/trips')}
                />
                <DashboardInsightCard
                  label="Win rate"
                  value={pct(data.conversionRate)}
                  hint="Leads won vs closed"
                  tone="success"
                  icon={TrendingDown}
                  onClick={() => navigate('/leads?stage=won')}
                />
                <DashboardInsightCard
                  label="Won / Lost"
                  value={`${data.won} / ${data.lost}`}
                  hint="Pipeline outcomes"
                  icon={CheckCircle2}
                  onClick={() => navigate(AGENCY_ROUTES.leads)}
                />
              </div>
            ) : null}

            {data && showManagerStats ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {hasWidget('unassigned_requests') ? (
                  <DashboardInsightCard
                    label="Unassigned requests"
                    value={data.unassignedInquiries ?? 0}
                    hint="Need an owner"
                    tone="warn"
                    icon={Contact}
                    onClick={() => navigate(AGENCY_ROUTES.inquiries)}
                  />
                ) : null}
                {hasWidget('team_pipeline') ? (
                  <DashboardInsightCard
                    label="Team follow-ups due"
                    value={data.teamFollowUpsDue ?? 0}
                    hint="Across the sales team"
                    tone="warn"
                    icon={Users}
                    onClick={() => navigate(AGENCY_ROUTES.workFollowUps)}
                  />
                ) : null}
                {hasWidget('stale_opportunities') ? (
                  <DashboardInsightCard
                    label="Stale opportunities"
                    value={data.staleOpportunities ?? 0}
                    hint="No recent progress"
                    tone="danger"
                    icon={TrendingDown}
                    onClick={() => navigate(AGENCY_ROUTES.leads)}
                  />
                ) : null}
              </div>
            ) : null}
            </SectionStack>
          </TabsContent>
        ) : null}

        {tabFlags.operations ? (
          <TabsContent value="operations">
            <SectionStack>
            {canOps && showOpsPanels ? (
              <>
                <div>
                  <h2 className="mb-1 text-sm font-semibold">Ops command centre</h2>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Risks that block travel — open items first; zeros stay out of the way.
                  </p>
                  <OpsCentreStats />
                </div>
                {showMovement ? (
                  <div>
                    <h2 className="mb-1 text-sm font-semibold">Movement (14 days)</h2>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Volume and voucher / flag / collection risk before depart.
                    </p>
                    <MovementHomeStats />
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <DashboardInsightCard
                    label="Supplier queue"
                    value="Open"
                    hint="Enquiry → confirm → voucher on bookings"
                    icon={Contact}
                    onClick={() => navigate(AGENCY_ROUTES.operationsSuppliers)}
                  />
                  <DashboardInsightCard
                    label="Inbox"
                    value="Threads"
                    hint="Conversations linked to trips"
                    icon={Inbox}
                    onClick={() => navigate(AGENCY_ROUTES.inbox)}
                  />
                  <DashboardInsightCard
                    label="Readiness"
                    value="Centre"
                    hint="Trip control and next actions"
                    icon={Plane}
                    onClick={() => navigate(AGENCY_ROUTES.operations)}
                  />
                </div>

                <div id="workflow-recovery" className="scroll-mt-4">
                  <WorkflowRecoveryPanel />
                </div>
                {dmc ? (
                  <div>
                    <h2 className="mb-1 text-sm font-semibold">Ground fulfilment</h2>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Local supplier service requests and partner settlements.
                    </p>
                    <DmcFulfilmentBoard />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Operations metrics need ops.read permission.
              </p>
            )}
            </SectionStack>
          </TabsContent>
        ) : null}

        {tabFlags.finance ? (
          <TabsContent value="finance">
            <SectionStack>
            <div>
              <h2 className="mb-1 text-sm font-semibold">Money at a glance</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Overdue first, then AR vs AP and aging — open a board to chase or settle.
              </p>
              <FinanceHomeStats />
            </div>
            </SectionStack>
          </TabsContent>
        ) : null}

        {tabFlags.insights ? (
          <TabsContent value="insights">
            <SectionStack>
            {data ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <DashboardInsightCard
                  label="Win rate"
                  value={pct(data.conversionRate)}
                  hint="Closed-won share"
                  tone="success"
                  icon={TrendingDown}
                />
                <DashboardInsightCard
                  label="Quote → win"
                  value={pct(data.quoteToWinRate)}
                  hint="Approx. from sent quotes"
                  icon={FileText}
                />
                <DashboardInsightCard
                  label="Quotes sent (30d)"
                  value={data.quotesSentLast30d ?? 0}
                  hint="Customer-ready sends"
                  icon={CheckCircle2}
                />
              </div>
            ) : null}

            {showChannelJourneys && journeyAnalytics ? (
              <div className="grid gap-[var(--gap-section)] lg:grid-cols-3">
                <DashboardBarList
                  title="By channel"
                  subtitle={`Last ${journeyAnalytics.windowDays}d · ${journeyAnalytics.total} interactions`}
                  rows={journeyAnalytics.byChannel.map((row) => ({
                    id: row.channel,
                    label: humanizeKey(row.channel),
                    value: row.count,
                    onClick: () =>
                      navigate(
                        `${AGENCY_ROUTES.inbox}?channel=${encodeURIComponent(row.channel)}`,
                      ),
                  }))}
                  emptyLabel="No channel data yet"
                />
                <DashboardBarList
                  title="By acquisition"
                  subtitle={`${journeyAnalytics.unread} unread threads`}
                  rows={journeyAnalytics.byAcquisition.map((row) => ({
                    id: row.sourceKey,
                    label: humanizeKey(row.sourceKey),
                    value: row.count,
                  }))}
                  emptyLabel="No acquisition data yet"
                />
                <DashboardBarList
                  title="By outcome"
                  subtitle="How conversations closed"
                  rows={(journeyAnalytics.byOutcome ?? []).map((row) => ({
                    id: row.outcome,
                    label: outcomeFunnelLabel(row.outcome),
                    value: row.count,
                  }))}
                  emptyLabel="No outcome data yet"
                />
              </div>
            ) : showChannelJourneys ? (
              <div className="space-y-2" role="status" aria-busy="true">
                <span className="sr-only">Loading</span>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Channel journey insights need sales report access.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(AGENCY_ROUTES.inbox)}
              >
                <Inbox className="mr-1.5 size-3.5" />
                Open inbox
              </Button>
            </div>
            </SectionStack>
          </TabsContent>
        ) : null}
      </Tabs>
    </PageStack>
  );
}
