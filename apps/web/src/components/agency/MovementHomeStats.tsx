import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Bus, FileWarning, Map, Sparkles } from 'lucide-react';
import { Button, Card, CardContent, Skeleton } from '@wayrune/ui';
import { api } from '../../api';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { movementBoardFilterHref } from '../../lib/movementBoardFilters';
import { reportError } from '../../lib/errors';
import { DashboardInsightCard } from './DashboardInsightCard';
import { DashboardBarList } from './DashboardBarList';

type MovementSummary = {
  hotels: number;
  transfers: number;
  activities: number;
  flagged: number;
  overduePayTrips: number;
  voucherPending: number;
};

export function MovementHomeStats() {
  const { navigate } = useOrgNavigate();
  const [summary, setSummary] = useState<MovementSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ summary: MovementSummary }>('/operations/movement-board?days=14')
      .then((r) => {
        if (!cancelled) {
          setSummary(r.summary);
          setLoadError(false);
        }
      })
      .catch((e) => {
        reportError(e, 'Could not load movement board');
        if (!cancelled) {
          setSummary(null);
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <p className="text-sm text-muted-foreground">
        Movement stats unavailable — open the{' '}
        <button
          type="button"
          className="underline"
          onClick={() => navigate(movementBoardFilterHref({}))}
        >
          movement board
        </button>
        .
      </p>
    );
  }

  if (!summary) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <span className="sr-only">Loading</span>
        {Array.from({ length: 3 }, (_, i) => (
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

  const volume = [
    {
      id: 'hotels',
      label: 'Hotel check-ins',
      value: summary.hotels,
      href: movementBoardFilterHref({ type: 'hotel' }),
      icon: Building2,
    },
    {
      id: 'transfers',
      label: 'Transfers',
      value: summary.transfers,
      href: movementBoardFilterHref({ type: 'transfer' }),
      icon: Bus,
    },
    {
      id: 'activities',
      label: 'Activities',
      value: summary.activities,
      href: movementBoardFilterHref({ type: 'activity' }),
      icon: Sparkles,
    },
  ];
  const risks = [
    {
      id: 'voucher',
      label: 'Voucher pending',
      value: summary.voucherPending,
      hint: 'Issue before travel',
      tone: (summary.voucherPending > 0 ? 'warn' : 'neutral') as const,
      href: movementBoardFilterHref({ voucherPending: true }),
      icon: FileWarning,
    },
    {
      id: 'flagged',
      label: 'Flagged movements',
      value: summary.flagged,
      hint: 'Missing driver / risk chip',
      tone: (summary.flagged > 0 ? 'warn' : 'neutral') as const,
      href: movementBoardFilterHref({ flagged: true }),
      icon: AlertTriangle,
    },
    {
      id: 'overdue',
      label: 'Overdue-pay trips',
      value: summary.overduePayTrips,
      hint: 'Collect before depart',
      tone: (summary.overduePayTrips > 0 ? 'danger' : 'neutral') as const,
      href: movementBoardFilterHref({ overduePay: true }),
      icon: Map,
    },
  ];
  const riskOpen = risks.filter((r) => r.value > 0);
  const volumeTotal = volume.reduce((s, v) => s + v.value, 0);

  return (
    <div className="space-y-4">
      {volumeTotal === 0 && riskOpen.length === 0 ? (
        <Card className="border-border/60 bg-muted/15">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Quiet next 14 days</p>
              <p className="text-xs text-muted-foreground">
                No hotel, transfer, or activity movements scheduled yet.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(movementBoardFilterHref({}))}
            >
              Open movement board
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <DashboardBarList
            title="Movement volume (14d)"
            subtitle="Upcoming stay / transfer / activity counts"
            rows={volume.map((v) => ({
              id: v.id,
              label: v.label,
              value: v.value,
              onClick: () => navigate(v.href),
            }))}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(riskOpen.length > 0 ? riskOpen : risks).map((r) => (
              <DashboardInsightCard
                key={r.id}
                label={r.label}
                value={r.value}
                hint={r.hint}
                tone={r.tone}
                icon={r.icon}
                onClick={() => navigate(r.href)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
