import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
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
import { StatCard } from '@wayrune/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';

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

export function OpsCentreStats() {
  const { navigate } = useOrgNavigate();
  const [data, setData] = useState<OpsCentre | null>(null);

  useEffect(() => {
    api<OpsCentre>('/commerce/ops-centre')
      .then(setData)
      .catch((e) => reportError(e, 'Could not load ops centre'));
  }, []);

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading ops centre…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Unconfirmed bookings"
        value={data.unconfirmedBookings}
        tone="warn"
        icon={CalendarClock}
        onClick={() => navigate(AGENCY_ROUTES.operations)}
      />
      <StatCard
        label="Open incidents"
        value={data.openIncidents}
        tone="danger"
        icon={ShieldAlert}
        onClick={() => navigate(AGENCY_ROUTES.operationsIncidents)}
      />
      <StatCard
        label="Open service requests"
        value={data.openServiceRequests}
        tone="neutral"
        icon={Handshake}
        onClick={() => navigate(AGENCY_ROUTES.operationsSuppliers)}
      />
      <StatCard
        label="Open change cases"
        value={data.openChangeCases}
        tone="warn"
        icon={Wrench}
        onClick={() => navigate(AGENCY_ROUTES.operations)}
      />
      <StatCard
        label="Overdue payments"
        value={data.overduePayments}
        tone="danger"
        icon={Wallet}
        onClick={() => navigate(AGENCY_ROUTES.financeOverdue)}
      />
      <StatCard
        label="Upcoming arrivals"
        value={data.upcomingArrivals}
        tone="success"
        icon={AlertTriangle}
        onClick={() => navigate(AGENCY_ROUTES.operationsMovement)}
      />
      <StatCard
        label="Open conversations"
        value={data.openConversations}
        tone="neutral"
        icon={MessageSquare}
        onClick={() => navigate(AGENCY_ROUTES.tasks)}
      />
      <StatCard
        label="Active inventory holds"
        value={data.activeHolds ?? 0}
        tone="warn"
        icon={Handshake}
        onClick={() => navigate(AGENCY_ROUTES.operationsBookings)}
      />
      <StatCard
        label="Data quality issues"
        value={data.dataQualityOpen ?? 0}
        tone="danger"
        icon={ShieldAlert}
        onClick={() => navigate(AGENCY_ROUTES.operations)}
      />
      <StatCard
        label="Open recovery items"
        value={data.openRecoveryItems ?? 0}
        tone={data.openRecoveryItems ? 'danger' : 'neutral'}
        icon={LifeBuoy}
        onClick={() =>
          document.getElementById('workflow-recovery')?.scrollIntoView({ behavior: 'smooth' })
        }
      />
    </div>
  );
}
