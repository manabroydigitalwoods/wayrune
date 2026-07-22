import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  FileText,
  IndianRupee,
  Scale,
  Wallet,
} from 'lucide-react';
import { Button, Card, CardContent, Skeleton, formatCurrency } from '@wayrune/ui';
import { api } from '../../api';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import { reportError } from '../../lib/errors';
import { agingHomeStatLabel } from '../../lib/financeHomeAgingLabel';
import { usePermissions } from '../../lib/permissions';
import { DashboardInsightCard } from './DashboardInsightCard';
import { DashboardBarList } from './DashboardBarList';

type AgingBucketKey =
  | 'current'
  | 'd1_30'
  | 'd31_60'
  | 'd61_90'
  | 'd90_plus'
  | 'noDue';

type AgingBucket = { count: number; amount: number };

type AgingSummary = {
  currency: string;
  totalOutstanding: number;
  overdueOutstanding: number;
  otherCurrencyCount?: number;
  buckets?: Record<AgingBucketKey, AgingBucket>;
};

type PortfolioSummary = {
  currency: string;
  tripCount: number;
  otherCurrencyCount?: number;
  convertedTripCount?: number;
  marginAmount: number;
  marginPercent: number | null;
  sellTotal?: number;
  costTotal?: number;
};

const AR_BUCKET_ORDER: AgingBucketKey[] = [
  'current',
  'd1_30',
  'd31_60',
  'd61_90',
  'd90_plus',
  'noDue',
];

const AR_BUCKET_LABELS: Record<AgingBucketKey, string> = {
  current: 'Current',
  d1_30: '1–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
  noDue: 'No due date',
};

function moneyHint(currency: string, otherFx?: number) {
  const fx = otherFx ?? 0;
  return fx > 0 ? `${currency} · ${fx} other FX excluded` : currency;
}

/** Dashboard Finance tab — attention-first money view with aging bars. */
export function FinanceHomeStats() {
  const { navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canAging = hasAny(['finance.cost.read']);
  const canPortfolio = hasAny(['finance.margin.read', 'finance.cost.read']);
  const canDocs = hasAny(['finance.cost.read']);
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

  const arBucketRows = useMemo(() => {
    if (!ar?.buckets) return [];
    return AR_BUCKET_ORDER.map((key) => {
      const b = ar.buckets![key] ?? { count: 0, amount: 0 };
      return {
        id: key,
        label: AR_BUCKET_LABELS[key],
        value: Math.round(b.amount),
        detail:
          b.count > 0
            ? `${b.count} open · ${formatCurrency(b.amount, ar.currency)}`
            : formatCurrency(0, ar.currency),
        count: b.count,
      };
    }).filter((r) => r.value > 0 || r.count > 0);
  }, [ar]);

  if (!canAging && !canPortfolio) return null;
  if (!ar && !ap && !portfolio) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <span className="sr-only">Loading</span>
        {Array.from({ length: 4 }, (_, i) => (
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

  const overdue = ar?.overdueOutstanding ?? 0;
  const arTotal = ar?.totalOutstanding ?? 0;
  const apTotal = ap?.totalOutstanding ?? 0;
  const clear =
    overdue <= 0.001 && arTotal <= 0.001 && apTotal <= 0.001 && !portfolio?.tripCount;

  return (
    <div className="space-y-5">
      {overdue > 0.001 ? (
        <Card className="border-destructive/25 bg-danger-soft/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {formatCurrency(overdue, ar?.currency ?? 'INR')} overdue
              </p>
              <p className="text-xs text-muted-foreground">
                Customer collections past due — chase from Overdue receivables.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate(AGENCY_ROUTES.financeOverdue)}
            >
              Open overdue
            </Button>
          </CardContent>
        </Card>
      ) : clear ? (
        <Card className="border-border/60 bg-muted/15">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Books look quiet</p>
              <p className="text-xs text-muted-foreground">
                No open AR/AP outstanding right now.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(AGENCY_ROUTES.finance)}
            >
              Open receivables
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ar ? (
          <DashboardInsightCard
            label={agingHomeStatLabel('Open receivables', ar.otherCurrencyCount)}
            value={formatCurrency(ar.totalOutstanding, ar.currency)}
            hint={moneyHint(ar.currency, ar.otherCurrencyCount)}
            tone="neutral"
            icon={Wallet}
            onClick={() => navigate(AGENCY_ROUTES.finance)}
          />
        ) : null}
        {ar ? (
          <DashboardInsightCard
            label={agingHomeStatLabel('Overdue receivables', ar.otherCurrencyCount)}
            value={formatCurrency(ar.overdueOutstanding, ar.currency)}
            hint={
              overdue > 0
                ? 'Past due — chase now'
                : moneyHint(ar.currency, ar.otherCurrencyCount)
            }
            tone={overdue > 0 ? 'danger' : 'neutral'}
            icon={AlertCircle}
            onClick={() => navigate(AGENCY_ROUTES.financeOverdue)}
          />
        ) : null}
        {ap ? (
          <DashboardInsightCard
            label={agingHomeStatLabel('Supplier payables', ap.otherCurrencyCount)}
            value={formatCurrency(ap.totalOutstanding, ap.currency)}
            hint={moneyHint(ap.currency, ap.otherCurrencyCount)}
            tone={ap.totalOutstanding > 0 ? 'warn' : 'neutral'}
            icon={IndianRupee}
            onClick={() => navigate(AGENCY_ROUTES.financePayables)}
          />
        ) : null}
        {portfolio ? (
          <DashboardInsightCard
            label={agingHomeStatLabel(
              'Portfolio margin',
              portfolio.otherCurrencyCount,
              portfolio.convertedTripCount,
            )}
            value={
              portfolio.marginPercent != null
                ? `${portfolio.marginPercent.toFixed(1)}%`
                : formatCurrency(portfolio.marginAmount, portfolio.currency)
            }
            hint={
              portfolio.marginPercent != null
                ? `${formatCurrency(portfolio.marginAmount, portfolio.currency)} · ${portfolio.tripCount} trips`
                : `${portfolio.tripCount} accepted-quote trips`
            }
            tone="success"
            icon={BarChart3}
            onClick={() => navigate(AGENCY_ROUTES.financeProfitability)}
          />
        ) : null}
      </div>

      {arTotal > 0 || apTotal > 0 ? (
        <DashboardBarList
          title="AR vs AP outstanding"
          subtitle="Who owes you vs what you owe suppliers"
          rows={[
            {
              id: 'ar',
              label: 'Customer receivables',
              value: Math.round(arTotal),
              detail: ar
                ? formatCurrency(ar.totalOutstanding, ar.currency)
                : undefined,
              onClick: () => navigate(AGENCY_ROUTES.finance),
            },
            {
              id: 'ap',
              label: 'Supplier payables',
              value: Math.round(apTotal),
              detail: ap
                ? formatCurrency(ap.totalOutstanding, ap.currency)
                : undefined,
              onClick: () => navigate(AGENCY_ROUTES.financePayables),
            },
          ]}
        />
      ) : null}

      {arBucketRows.length > 0 ? (
        <DashboardBarList
          title="Receivables aging"
          subtitle="Outstanding amount by days past due"
          rows={arBucketRows.map((r) => ({
            id: r.id,
            label: r.label,
            value: r.value,
            detail: r.detail,
            onClick: () =>
              navigate(
                r.id === 'current' || r.id === 'noDue'
                  ? AGENCY_ROUTES.finance
                  : AGENCY_ROUTES.financeOverdue,
              ),
          }))}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardInsightCard
          label="Receivables board"
          value="AR"
          hint="Aging list + chase payment links"
          icon={Wallet}
          onClick={() => navigate(AGENCY_ROUTES.finance)}
        />
        <DashboardInsightCard
          label="Payables board"
          value="AP"
          hint="Supplier dues to settle"
          icon={Scale}
          onClick={() => navigate(AGENCY_ROUTES.financePayables)}
        />
        {canDocs ? (
          <DashboardInsightCard
            label="Documents & GSTR"
            value="Export"
            hint="Commercial docs · accountant CSV"
            icon={FileText}
            onClick={() => navigate(AGENCY_ROUTES.financeDocuments)}
          />
        ) : null}
      </div>
    </div>
  );
}
