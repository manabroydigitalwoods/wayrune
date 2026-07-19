import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Bus, FileWarning, Map, Sparkles } from 'lucide-react';
import { StatCard } from '@wayrune/ui';
import { api } from '../../api';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { movementBoardFilterHref } from '../../lib/movementBoardFilters';
import { reportError } from '../../lib/errors';

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
    return <p className="text-sm text-muted-foreground">Loading movement…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        label="Hotel check-ins (14d)"
        value={summary.hotels}
        tone="neutral"
        icon={Building2}
        onClick={() => navigate(movementBoardFilterHref({ type: 'hotel' }))}
      />
      <StatCard
        label="Transfers (14d)"
        value={summary.transfers}
        tone="neutral"
        icon={Bus}
        onClick={() => navigate(movementBoardFilterHref({ type: 'transfer' }))}
      />
      <StatCard
        label="Activities (14d)"
        value={summary.activities}
        tone="neutral"
        icon={Sparkles}
        onClick={() => navigate(movementBoardFilterHref({ type: 'activity' }))}
      />
      <StatCard
        label="Voucher pending"
        value={summary.voucherPending}
        tone={summary.voucherPending ? 'warn' : 'success'}
        icon={FileWarning}
        onClick={() =>
          navigate(movementBoardFilterHref({ voucherPending: true }))
        }
      />
      <StatCard
        label="Flagged movements"
        value={summary.flagged}
        tone={summary.flagged ? 'warn' : 'success'}
        icon={AlertTriangle}
        onClick={() => navigate(movementBoardFilterHref({ flagged: true }))}
      />
      <StatCard
        label="Overdue-pay trips"
        value={summary.overduePayTrips}
        tone={summary.overduePayTrips ? 'danger' : 'neutral'}
        icon={Map}
        onClick={() => navigate(movementBoardFilterHref({ overduePay: true }))}
      />
    </div>
  );
}
