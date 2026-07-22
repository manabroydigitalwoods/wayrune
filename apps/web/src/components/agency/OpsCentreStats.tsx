import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Handshake,
  LifeBuoy,
  MessageSquare,
  ShieldAlert,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Button, Card, CardContent, Skeleton } from '@wayrune/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { DashboardInsightCard } from './DashboardInsightCard';
import { DashboardBarList } from './DashboardBarList';

type OpsCentre = {
  unconfirmedBookings: number;
  openIncidents: number;
  openServiceRequests: number;
  openChangeCases: number;
  overduePayments: number;
  upcomingArrivals: number;
  openConversations: number;
  activeHolds?: number;
  dataQualityOpen?: number;
  openRecoveryItems?: number;
  generatedAt: string;
};

type Metric = {
  id: string;
  label: string;
  value: number;
  hint: string;
  tone: 'neutral' | 'success' | 'warn' | 'danger';
  icon: typeof CalendarClock;
  href: string;
};

export function OpsCentreStats() {
  const { navigate } = useOrgNavigate();
  const [data, setData] = useState<OpsCentre | null>(null);

  useEffect(() => {
    api<OpsCentre>('/commerce/ops-centre')
      .then(setData)
      .catch((e) => reportError(e, 'Could not load ops centre'));
  }, []);

  const metrics = useMemo((): Metric[] => {
    if (!data) return [];
    return [
      {
        id: 'unconfirmed',
        label: 'Unconfirmed bookings',
        value: data.unconfirmedBookings,
        hint: 'Supplier confirm still open',
        tone: data.unconfirmedBookings > 0 ? 'warn' : 'neutral',
        icon: CalendarClock,
        href: AGENCY_ROUTES.operationsBookings,
      },
      {
        id: 'incidents',
        label: 'Open incidents',
        value: data.openIncidents,
        hint: 'Needs ops attention',
        tone: data.openIncidents > 0 ? 'danger' : 'neutral',
        icon: ShieldAlert,
        href: AGENCY_ROUTES.operationsIncidents,
      },
      {
        id: 'service_requests',
        label: 'Service requests',
        value: data.openServiceRequests,
        hint: 'Enquiry / confirm queue',
        tone: data.openServiceRequests > 0 ? 'warn' : 'neutral',
        icon: Handshake,
        href: AGENCY_ROUTES.operationsSuppliers,
      },
      {
        id: 'change_cases',
        label: 'Change cases',
        value: data.openChangeCases,
        hint: 'Amendments in flight',
        tone: data.openChangeCases > 0 ? 'warn' : 'neutral',
        icon: Wrench,
        href: AGENCY_ROUTES.operations,
      },
      {
        id: 'overdue_pay',
        label: 'Overdue payments',
        value: data.overduePayments,
        hint: 'Collections risk',
        tone: data.overduePayments > 0 ? 'danger' : 'neutral',
        icon: Wallet,
        href: AGENCY_ROUTES.financeOverdue,
      },
      {
        id: 'arrivals',
        label: 'Upcoming arrivals',
        value: data.upcomingArrivals,
        hint: 'Near-term check-ins',
        tone: 'neutral',
        icon: AlertTriangle,
        href: AGENCY_ROUTES.operationsMovement,
      },
      {
        id: 'conversations',
        label: 'Open conversations',
        value: data.openConversations,
        hint: 'Thread follow-ups',
        tone: 'neutral',
        icon: MessageSquare,
        href: AGENCY_ROUTES.inbox,
      },
      {
        id: 'holds',
        label: 'Inventory holds',
        value: data.activeHolds ?? 0,
        hint: 'Active allotment holds',
        tone: (data.activeHolds ?? 0) > 0 ? 'warn' : 'neutral',
        icon: Handshake,
        href: AGENCY_ROUTES.operationsBookings,
      },
      {
        id: 'data_quality',
        label: 'Data quality',
        value: data.dataQualityOpen ?? 0,
        hint: 'Fix before vouchers',
        tone: (data.dataQualityOpen ?? 0) > 0 ? 'danger' : 'neutral',
        icon: ShieldAlert,
        href: AGENCY_ROUTES.operations,
      },
      {
        id: 'recovery',
        label: 'Recovery items',
        value: data.openRecoveryItems ?? 0,
        hint: 'Workflow recovery',
        tone: (data.openRecoveryItems ?? 0) > 0 ? 'danger' : 'neutral',
        icon: LifeBuoy,
        href: '#workflow-recovery',
      },
    ];
  }, [data]);

  if (!data) {
    return (
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
    );
  }

  const attention = metrics.filter((m) => m.value > 0);
  const quiet = metrics.filter((m) => m.value === 0);
  const show = attention.length > 0 ? attention : metrics.slice(0, 4);

  return (
    <div className="space-y-4">
      {attention.length === 0 ? (
        <Card className="border-border/60 bg-muted/15">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Ops looks clear</p>
              <p className="text-xs text-muted-foreground">
                No open risks in the command centre right now.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(AGENCY_ROUTES.operations)}
            >
              Open operations
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {show.map((m) => (
          <DashboardInsightCard
            key={m.id}
            label={m.label}
            value={m.value}
            hint={m.hint}
            tone={m.tone}
            icon={m.icon}
            onClick={() => {
              if (m.href.startsWith('#')) {
                document.getElementById(m.href.slice(1))?.scrollIntoView({
                  behavior: 'smooth',
                });
                return;
              }
              navigate(m.href);
            }}
          />
        ))}
      </div>

      {attention.length > 0 ? (
        <DashboardBarList
          title="Risk mix"
          subtitle="Open items by type — click a bar to open the queue"
          rows={attention.map((m) => ({
            id: m.id,
            label: m.label,
            value: m.value,
            onClick: () => {
              if (m.href.startsWith('#')) {
                document.getElementById(m.href.slice(1))?.scrollIntoView({
                  behavior: 'smooth',
                });
                return;
              }
              navigate(m.href);
            },
          }))}
        />
      ) : null}

      {attention.length > 0 && quiet.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Also clear: {quiet.map((m) => m.label.toLowerCase()).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
