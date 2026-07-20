import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, Copy, Download, MessageCircle, Users, Wallet, X } from 'lucide-react';
import {
  Button,
  DataTable,
  ListPageShell,
  PageHeader,
  StatusBadge,
  StorageKeys,
  cn,
  formatCurrency,
  formatDate,
  toastError,
  toastSuccess,
  toastWarning,
} from '@wayrune/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import {
  AGENCY_ROUTES,
  stripOrgPrefix,
} from '../lib/agencyRoutes';
import { reportError } from '../lib/errors';
import { downloadRowsAsCsv } from '../lib/downloadCsv';
import {
  type AgingBucketKey,
  parseAgingBucketParam,
} from '../lib/financeAgingFilters';
import {
  agingPackHref,
  createFinanceReportPack,
  deleteFinanceReportPack,
  listFinanceReportPacks,
  packDeliveryHonestyCue,
  sendFinanceReportPack,
  updateFinanceReportPack,
  type FinanceReportPack,
} from '../lib/financeReportPacks';
import {
  copyTripPaymentLink,
  markTripPaymentLinkSent,
  sendTripPaymentLinkWhatsapp,
  toastForPaymentLinkWhatsapp,
} from '../lib/paymentLinkActions';
import { WriteOffAwaitingStrip } from '../components/agency/WriteOffAwaitingStrip';

type AgingRow = {
  id: string;
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  partyName: string | null;
  direction: string;
  label: string;
  amount: number;
  amountPaid: number;
  outstanding: number;
  currency: string;
  dueAt: string | null;
  status: string;
  daysPastDue: number | null;
  bucket: AgingBucketKey;
  supplierName: string | null;
};

type AgingBoard = {
  summary: {
    currency: string;
    totalOutstanding: number;
    overdueOutstanding: number;
    otherCurrencyCount?: number;
    buckets: Record<AgingBucketKey, { count: number; amount: number }>;
  };
  rows: AgingRow[];
  generatedAt: string;
};

type AgingMode = 'receivables' | 'overdue' | 'payables';

const BUCKET_LABELS: Record<AgingBucketKey, string> = {
  current: 'Current',
  d1_30: '1–30',
  d31_60: '31–60',
  d61_90: '61–90',
  d90_plus: '90+',
  noDue: 'No due date',
};

function useAgingMode(): AgingMode {
  const { pathname } = useLocation();
  const path = stripOrgPrefix(pathname);
  if (path === AGENCY_ROUTES.financeOverdue) return 'overdue';
  if (path === AGENCY_ROUTES.financePayables) return 'payables';
  return 'receivables';
}

const MODE_COPY: Record<
  AgingMode,
  { title: string; subtitle: string; documentTitle: string }
> = {
  overdue: {
    title: 'Overdue',
    subtitle: 'Customer payments past due — copy or WhatsApp a payment link to chase.',
    documentTitle: 'Overdue receivables',
  },
  receivables: {
    title: 'Receivables',
    subtitle: 'Open customer instalments aged by due date — chase with a payment link.',
    documentTitle: 'Receivables',
  },
  payables: {
    title: 'Supplier payables',
    subtitle: 'Amounts owed to suppliers, aged by due date.',
    documentTitle: 'Supplier payables',
  },
};

export function FinanceAgingPage() {
  const mode = useAgingMode();
  const copy = MODE_COPY[mode];
  useDocumentTitle(copy.documentTitle);
  const { navigate, toOrgPath } = useOrgNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const bucketFromUrl = useMemo(
    () => parseAgingBucketParam(searchParams),
    [searchParams],
  );
  const [data, setData] = useState<AgingBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgPacks, setOrgPacks] = useState<FinanceReportPack[]>([]);
  const [packName, setPackName] = useState('');
  const [scheduleEmails, setScheduleEmails] = useState('');
  const [savingOrgPack, setSavingOrgPack] = useState(false);
  const [sendingPackId, setSendingPackId] = useState<string | null>(null);
  const [chaseBusyId, setChaseBusyId] = useState<string | null>(null);
  const [markSentPaymentId, setMarkSentPaymentId] = useState<string | null>(null);
  const [markingSentId, setMarkingSentId] = useState<string | null>(null);
  const [settleBusyId, setSettleBusyId] = useState<string | null>(null);
  /** Last payable marked paid from this page — keep Unmark until dismiss / unmark. */
  const [lastSettled, setLastSettled] = useState<{
    id: string;
    tripId: string;
    label: string;
    tripNumber: string;
  } | null>(null);


  async function refreshOrgPacks() {
    try {
      const res = await listFinanceReportPacks();
      setOrgPacks(res.items.filter((p) => p.aging));
    } catch (e) {
      reportError(e, 'Could not load org report packs');
    }
  }

  useEffect(() => {
    void refreshOrgPacks();
  }, []);

  useEffect(() => {
    if (mode !== 'payables') setLastSettled(null);
  }, [mode]);

  async function loadAging() {
    setLoading(true);
    setError(null);
    const direction = mode === 'payables' ? 'supplier' : 'customer';
    const overdueOnly = mode === 'overdue' ? '1' : '0';
    try {
      const board = await api<AgingBoard>(
        `/operations/finance/aging?direction=${direction}&overdueOnly=${overdueOnly}`,
      );
      setData(board);
    } catch (e) {
      reportError(e, 'Could not load finance aging');
      setError(e instanceof Error ? e.message : 'Could not load finance aging');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAging();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when aging mode changes
  }, [mode]);

  async function copyLink(row: AgingRow) {
    setChaseBusyId(row.id);
    try {
      const res = await copyTripPaymentLink(row.tripId, row.id);
      toastSuccess(
        res.reused ? 'Payment link copied (existing link)' : 'Payment link copied',
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create payment link');
    } finally {
      setChaseBusyId(null);
    }
  }

  async function sendWhatsapp(row: AgingRow) {
    setChaseBusyId(row.id);
    try {
      const res = await sendTripPaymentLinkWhatsapp(row.tripId, row.id);
      const outcome = toastForPaymentLinkWhatsapp(res);
      if (!outcome.ok) {
        toastError(outcome.message);
        return;
      }
      if (outcome.openUrl) {
        window.open(outcome.openUrl, '_blank', 'noopener,noreferrer');
      }
      if (outcome.needsMarkSent) {
        setMarkSentPaymentId(row.id);
        toastWarning(outcome.message);
      } else {
        setMarkSentPaymentId(null);
        toastSuccess(outcome.message);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send payment link');
    } finally {
      setChaseBusyId(null);
    }
  }

  async function markLinkSent(row: AgingRow) {
    setMarkingSentId(row.id);
    try {
      await markTripPaymentLinkSent(row.tripId, row.id);
      toastSuccess('Payment link marked as sent');
      setMarkSentPaymentId(null);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark payment link sent');
    } finally {
      setMarkingSentId(null);
    }
  }

  async function markPayablePaid(row: AgingRow) {
    setSettleBusyId(row.id);
    try {
      await api(`/trips/${row.tripId}/payments/${row.id}/paid`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const settled = {
        id: row.id,
        tripId: row.tripId,
        label: row.label,
        tripNumber: row.tripNumber,
      };
      setLastSettled(settled);
      toastSuccess('Marked paid', {
        action: {
          label: 'Unmark',
          onClick: () => {
            void unmarkPayablePaid(settled);
          },
        },
      });
      await loadAging();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark paid');
    } finally {
      setSettleBusyId(null);
    }
  }

  async function unmarkPayablePaid(row: {
    id: string;
    tripId: string;
    label?: string;
  }) {
    setSettleBusyId(row.id);
    try {
      await api(`/trips/${row.tripId}/payments/${row.id}/unmark-paid`, {
        method: 'POST',
      });
      setLastSettled((prev) => (prev?.id === row.id ? null : prev));
      toastSuccess('Payment unmarked');
      await loadAging();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not unmark payment');
    } finally {
      setSettleBusyId(null);
    }
  }

  const showChase = mode === 'receivables' || mode === 'overdue';
  const showMarkPaid = mode === 'payables';

  const columns = useMemo<ColumnDef<AgingRow>[]>(
    () => [
      {
        id: 'dueAt',
        accessorKey: 'dueAt',
        header: 'Due',
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="font-medium">
              {row.original.dueAt ? formatDate(row.original.dueAt) : '—'}
            </div>
            {row.original.daysPastDue != null && row.original.daysPastDue > 0 ? (
              <div className="text-xs text-destructive">
                {row.original.daysPastDue}d overdue
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'label',
        accessorKey: 'label',
        header: 'Instalment',
        cell: ({ row }) => (
          <div className="min-w-[10rem]">
            <div className="font-medium">{row.original.label}</div>
            {row.original.supplierName || row.original.partyName ? (
              <div className="text-xs text-muted-foreground">
                {row.original.supplierName || row.original.partyName}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'trip',
        accessorFn: (r) => `${r.tripNumber} ${r.tripTitle}`,
        header: 'Trip',
        cell: ({ row }) => (
          <Link
            to={toOrgPath(`/trips/${row.original.tripId}?tab=finance`)}
            className="group inline-flex max-w-[14rem] items-start gap-1 text-sm hover:underline"
          >
            <span>
              <span className="font-medium">{row.original.tripNumber}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {row.original.tripTitle}
              </span>
            </span>
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-40 group-hover:opacity-100" />
          </Link>
        ),
      },
      {
        id: 'outstanding',
        accessorKey: 'outstanding',
        header: 'Outstanding',
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatCurrency(row.original.outstanding, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'bucket',
        accessorKey: 'bucket',
        header: 'Age',
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.bucket}
            label={BUCKET_LABELS[row.original.bucket]}
            tone={
              row.original.bucket === 'current' || row.original.bucket === 'noDue'
                ? 'info'
                : row.original.bucket === 'd1_30'
                  ? 'warn'
                  : 'danger'
            }
            showIcon={false}
          />
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge value={row.original.status} showIcon={false} />
        ),
      },
      ...(showChase
        ? ([
            {
              id: 'chase',
              header: 'Chase',
              cell: ({ row }) => {
                const busy = chaseBusyId === row.original.id;
                const needsMark = markSentPaymentId === row.original.id;
                return (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void copyLink(row.original)}
                    >
                      <Copy className="size-3.5" />
                      Link
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void sendWhatsapp(row.original)}
                    >
                      <MessageCircle className="size-3.5" />
                      WhatsApp
                    </Button>
                    {needsMark ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={markingSentId === row.original.id}
                        onClick={() => void markLinkSent(row.original)}
                      >
                        {markingSentId === row.original.id
                          ? 'Marking…'
                          : 'Mark sent'}
                      </Button>
                    ) : null}
                  </div>
                );
              },
            },
          ] as ColumnDef<AgingRow>[])
        : []),
      ...(showMarkPaid
        ? ([
            {
              id: 'settle',
              header: 'Settle',
              cell: ({ row }) => {
                const busy = settleBusyId === row.original.id;
                const canUnmark =
                  row.original.status === 'partial' ||
                  Number(row.original.amountPaid) > 0;
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {canUnmark ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void unmarkPayablePaid(row.original)}
                      >
                        Unmark
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void markPayablePaid(row.original)}
                    >
                      Mark paid
                    </Button>
                  </div>
                );
              },
            },
          ] as ColumnDef<AgingRow>[])
        : []),
    ],
    [toOrgPath, showChase, showMarkPaid, chaseBusyId, settleBusyId, markSentPaymentId, markingSentId],
  );

  const summary = data?.summary;
  const bucketOrder = useMemo<AgingBucketKey[]>(
    () =>
      mode === 'overdue'
        ? ['d1_30', 'd31_60', 'd61_90', 'd90_plus']
        : ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'noDue'],
    [mode],
  );

  const activeBucket =
    bucketFromUrl && bucketOrder.includes(bucketFromUrl) ? bucketFromUrl : null;

  useEffect(() => {
    if (!bucketFromUrl) return;
    if (bucketOrder.includes(bucketFromUrl)) return;
    const next = new URLSearchParams(searchParams);
    next.delete('bucket');
    setSearchParams(next, { replace: true });
  }, [bucketFromUrl, bucketOrder, searchParams, setSearchParams]);

  function patchBucket(next: AgingBucketKey | null) {
    const params = new URLSearchParams(searchParams);
    if (!next) params.delete('bucket');
    else params.set('bucket', next);
    setSearchParams(params, { replace: true });
  }

  function downloadCsv() {
    const rows = data?.rows ?? [];
    if (!rows.length) return;
    downloadRowsAsCsv(
      `finance-${mode}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Trip number',
        'Trip title',
        'Party / supplier',
        'Label',
        'Direction',
        'Outstanding',
        'Currency',
        'Due',
        'Days past due',
        'Age',
        'Status',
      ],
      rows.map((r) => [
        r.tripNumber,
        r.tripTitle,
        r.supplierName || r.partyName || '',
        r.label,
        r.direction,
        r.outstanding,
        r.currency,
        r.dueAt ? r.dueAt.slice(0, 10) : '',
        r.daysPastDue ?? '',
        BUCKET_LABELS[r.bucket],
        r.status,
      ]),
    );
    toastSuccess('CSV downloaded');
  }

  async function saveOrgPack() {
    const direction = mode === 'payables' ? 'supplier' : 'customer';
    const overdueOnly = mode === 'overdue';
    const name =
      packName.trim() ||
      (mode === 'payables'
        ? 'Supplier payables'
        : mode === 'overdue'
          ? 'Overdue receivables'
          : 'Receivables');
    const emails = scheduleEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    setSavingOrgPack(true);
    try {
      await createFinanceReportPack({
        name,
        aging: { direction, overdueOnly },
        ...(emails.length
          ? {
              delivery: {
                enabled: true,
                cadence: 'weekly' as const,
                toEmails: emails.slice(0, 5),
              },
            }
          : {}),
      });
      setPackName('');
      setScheduleEmails('');
      toastSuccess(
        emails.length
          ? 'Shared with agency · weekly email scheduled'
          : 'Shared with your agency',
      );
      await refreshOrgPacks();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save org pack');
    } finally {
      setSavingOrgPack(false);
    }
  }

  async function emailPackNow(pack: FinanceReportPack) {
    setSendingPackId(pack.id);
    try {
      const res = await sendFinanceReportPack(pack.id);
      const when = new Date().toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      toastSuccess(
        `Queued ${when} → ${res.toEmails.join(', ')} · ${res.attachmentCount} CSV`,
      );
      await refreshOrgPacks();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not email pack');
    } finally {
      setSendingPackId(null);
    }
  }

  async function togglePackSchedule(pack: FinanceReportPack) {
    const emails = pack.delivery?.toEmails?.length
      ? pack.delivery.toEmails
      : scheduleEmails
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter(Boolean)
          .slice(0, 5);
    if (!pack.delivery?.enabled && !emails.length) {
      toastError('Add schedule emails before enabling weekly delivery');
      return;
    }
    try {
      if (pack.delivery?.enabled) {
        await updateFinanceReportPack(pack.id, { delivery: null });
        toastSuccess('Weekly email disabled');
      } else {
        await updateFinanceReportPack(pack.id, {
          delivery: {
            enabled: true,
            cadence: 'weekly',
            toEmails: emails,
          },
        });
        toastSuccess('Weekly email enabled');
      }
      await refreshOrgPacks();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update schedule');
    }
  }

  function applyOrgPack(p: FinanceReportPack) {
    if (!p.aging) return;
    navigate(agingPackHref(p.aging));
  }

  async function removeOrgPack(id: string) {
    try {
      await deleteFinanceReportPack(id);
      toastSuccess('Org pack removed');
      await refreshOrgPacks();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove org pack');
    }
  }

  return (
    <ListPageShell>
      <PageHeader
        icon={Wallet}
        title={copy.title}
        subtitle={copy.subtitle}
        className="mb-4 shrink-0"
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || !(data?.rows.length)}
            onClick={downloadCsv}
          >
            <Download className="size-4" />
            Download CSV
          </Button>
        }
      />

      {mode !== 'payables' ? <WriteOffAwaitingStrip /> : null}

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-[10rem] flex-1 rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
            placeholder="Pack name (optional)"
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
          />
          <input
            className="h-9 min-w-[12rem] flex-1 rounded-md border border-input bg-background px-3 text-sm sm:max-w-sm"
            placeholder="Weekly email to (optional, comma-separated)"
            value={scheduleEmails}
            onChange={(e) => setScheduleEmails(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={savingOrgPack}
            onClick={() => void saveOrgPack()}
          >
            <Users className="size-4" />
            {savingOrgPack ? 'Sharing…' : 'Share this view'}
          </Button>
        </div>
        {orgPacks.length ? (
          <div className="flex flex-wrap gap-1.5">
            {orgPacks.map((p) => {
              const deliveryCue = packDeliveryHonestyCue(p);
              return (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-xs"
                title={deliveryCue || undefined}
              >
                <Users className="size-3 text-primary" aria-hidden />
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => applyOrgPack(p)}
                >
                  {p.name}
                  {deliveryCue ? ` · ${deliveryCue}` : ''}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  disabled={sendingPackId === p.id}
                  onClick={() => void emailPackNow(p)}
                >
                  {sendingPackId === p.id ? '…' : 'Email now'}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => void togglePackSchedule(p)}
                >
                  {p.delivery?.enabled ? 'Unschedule' : 'Schedule'}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove org pack ${p.name}`}
                  onClick={() => void removeOrgPack(p.id)}
                >
                  ×
                </button>
              </span>
              );
            })}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            Share receivables / overdue / payables views · optional weekly CSV email
          </span>
        )}
      </div>

      {summary ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Outstanding</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(summary.totalOutstanding, summary.currency)}
            </div>
            {(summary.otherCurrencyCount ?? 0) > 0 ? (
              <div className="text-[11px] text-muted-foreground">
                {summary.otherCurrencyCount} other-currency row
                {summary.otherCurrencyCount === 1 ? '' : 's'} excluded from totals
              </div>
            ) : null}
          </div>
          {mode !== 'payables' ? (
            <div className="rounded-lg border border-border/60 px-3 py-2">
              <div className="text-xs text-muted-foreground">Overdue</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatCurrency(summary.overdueOutstanding, summary.currency)}
              </div>
            </div>
          ) : null}
          {bucketOrder.map((key) => {
            const selected = activeBucket === key;
            return (
              <button
                key={key}
                type="button"
                className={cn(
                  'rounded-lg border px-3 py-2 text-left transition-colors',
                  selected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/60 hover:bg-muted/40',
                )}
                onClick={() => patchBucket(selected ? null : key)}
                aria-pressed={selected}
              >
                <div className="text-xs text-muted-foreground">{BUCKET_LABELS[key]}</div>
                <div className="text-sm font-semibold tabular-nums">
                  {formatCurrency(summary.buckets[key]?.amount ?? 0, summary.currency)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {summary.buckets[key]?.count ?? 0} open
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {activeBucket ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Showing Age · {BUCKET_LABELS[activeBucket]}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2"
            onClick={() => patchBucket(null)}
          >
            <X className="size-3.5" />
            Clear age filter
          </Button>
        </div>
      ) : null}

      {mode === 'payables' && lastSettled ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          <p className="text-muted-foreground">
            Just marked paid ·{' '}
            <span className="font-medium text-foreground">{lastSettled.label}</span>
            <span className="text-muted-foreground">
              {' '}
              ({lastSettled.tripNumber})
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={settleBusyId === lastSettled.id}
              onClick={() => void unmarkPayablePaid(lastSettled)}
            >
              {settleBusyId === lastSettled.id ? '…' : 'Unmark'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setLastSettled(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        key={`aging-bucket-${activeBucket ?? 'all'}`}
        columns={columns}
        data={data?.rows ?? []}
        loading={loading}
        error={error ?? undefined}
        pageSize={25}
        searchKey="label"
        searchPlaceholder="Search instalment or trip…"
        columnVisibilityKey={StorageKeys.financeAging.columns}
        defaultFacetValues={
          activeBucket ? { bucket: activeBucket } : undefined
        }
        facets={[
          {
            id: 'bucket',
            columnId: 'bucket',
            label: 'Age',
            options: bucketOrder.map((value) => ({
              value,
              label: BUCKET_LABELS[value],
            })),
          },
          {
            id: 'status',
            columnId: 'status',
            label: 'Status',
            options: [
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'partial', label: 'Partial' },
              { value: 'overdue', label: 'Overdue' },
            ],
          },
        ]}
        emptyTitle={
          activeBucket
            ? `No ${BUCKET_LABELS[activeBucket].toLowerCase()} rows`
            : mode === 'overdue'
              ? 'No overdue receivables'
              : mode === 'payables'
                ? 'No open supplier payables'
                : 'No open receivables'
        }
        emptyDescription={
          activeBucket
            ? 'Clear the age filter or pick another bucket.'
            : 'Trip instalments with outstanding balances will appear here.'
        }
        emptyIcon={Wallet}
      />
    </ListPageShell>
  );
}
