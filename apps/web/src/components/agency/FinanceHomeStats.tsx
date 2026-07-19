import { useEffect, useState } from 'react';
import { AlertCircle, BarChart3, IndianRupee, Wallet } from 'lucide-react';
import { StatCard, formatCurrency } from '@wayrune/ui';
import { api } from '../../api';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import { reportError } from '../../lib/errors';
import { agingHomeStatLabel } from '../../lib/financeHomeAgingLabel';
import { usePermissions } from '../../lib/permissions';

type AgingSummary = {
  currency: string;
  totalOutstanding: number;
  overdueOutstanding: number;
  otherCurrencyCount?: number;
};

type PortfolioSummary = {
  currency: string;
  tripCount: number;
  otherCurrencyCount?: number;
  marginAmount: number;
  marginPercent: number | null;
};

export function FinanceHomeStats() {
  const { navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canAging = hasAny(['finance.cost.read']);
  const canPortfolio = hasAny(['finance.margin.read', 'finance.cost.read']);
  const [ar, setAr] = useState<AgingSummary | null>(null);
  const [ap, setAp] = useState<AgingSummary | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);

  useEffect(() => {
    if (!canAging) return;
    api<{ summary: AgingSummary }>('/operations/finance/aging?direction=customer')
      .then((r) => setAr(r.summary))
      .catch((e) => reportError(e, 'Could not load receivables'));
    api<{ summary: AgingSummary }>('/operations/finance/aging?direction=supplier')
      .then((r) => setAp(r.summary))
      .catch((e) => reportError(e, 'Could not load payables'));
  }, [canAging]);

  useEffect(() => {
    if (!canPortfolio) return;
    api<{ summary: PortfolioSummary }>('/operations/finance/portfolio')
      .then((r) => setPortfolio(r.summary))
      .catch((e) => reportError(e, 'Could not load portfolio'));
  }, [canPortfolio]);

  if (!canAging && !canPortfolio) return null;
  if (!ar && !ap && !portfolio) {
    return <p className="text-sm text-muted-foreground">Loading finance…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {ar ? (
        <StatCard
          label={agingHomeStatLabel('Open receivables', ar.otherCurrencyCount)}
          value={formatCurrency(ar.totalOutstanding, ar.currency)}
          tone="neutral"
          icon={Wallet}
          onClick={() => navigate(AGENCY_ROUTES.finance)}
        />
      ) : null}
      {ar ? (
        <StatCard
          label={agingHomeStatLabel('Overdue receivables', ar.otherCurrencyCount)}
          value={formatCurrency(ar.overdueOutstanding, ar.currency)}
          tone="danger"
          icon={AlertCircle}
          onClick={() => navigate(AGENCY_ROUTES.financeOverdue)}
        />
      ) : null}
      {ap ? (
        <StatCard
          label={agingHomeStatLabel('Supplier payables', ap.otherCurrencyCount)}
          value={formatCurrency(ap.totalOutstanding, ap.currency)}
          tone="warn"
          icon={IndianRupee}
          onClick={() => navigate(AGENCY_ROUTES.financePayables)}
        />
      ) : null}
      {portfolio ? (
        <StatCard
          label={
            (portfolio.otherCurrencyCount ?? 0) > 0
              ? `Portfolio margin · ${portfolio.otherCurrencyCount} FX excl.`
              : 'Portfolio margin'
          }
          value={
            portfolio.marginPercent != null
              ? `${formatCurrency(portfolio.marginAmount, portfolio.currency)} · ${portfolio.marginPercent.toFixed(1)}%`
              : formatCurrency(portfolio.marginAmount, portfolio.currency)
          }
          tone="success"
          icon={BarChart3}
          onClick={() => navigate(AGENCY_ROUTES.financeProfitability)}
        />
      ) : null}
    </div>
  );
}
