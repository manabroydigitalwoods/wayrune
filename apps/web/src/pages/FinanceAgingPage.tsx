import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import {
  ArrowUpRight,
  Copy,
  Download,
  MessageCircle,
  MoreHorizontal,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  RecordDialog,
  StatusBadge,
  StorageKeys,
  cn,
  formatCurrency,
  formatDate,
  localStorageKit,
  toastError,
  toastSuccess,
  toastWarning,
  usePageChrome,
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
import { type AgingBucketKey } from '../lib/financeAgingFilters';
import {
  financeAgingQueryHasFilters,
  parseFinanceAgingQueryState,
  patchFinanceAgingQueryParams,
  type FinanceAgingStatusFilter,
} from '../lib/queue';
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
import {
  ActiveFilterChips,
  AttentionPresets,
  DisplayMenu,
  FilterMenu,
  QUEUE_MENU_ITEM_CLASS,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
} from '../components/queue';

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

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'partial', label: 'Partial' },
  { value: 'overdue', label: 'Overdue' },
];

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
    title: 'Invoices & payments',
    subtitle: 'Open customer receivables aged by due date — chase with a payment link.',
    documentTitle: 'Invoices & payments',
  },
  payables: {
    title: 'Supplier payables',
    subtitle: 'Amounts owed to suppliers, aged by due date.',
    documentTitle: 'Supplier payables',
  },
};

function readAgingColumnVisibility(): VisibilityState {
  const stored = localStorageKit.getJson<VisibilityState>(StorageKeys.financeAging.columns, {
    version: 1,
  });
  if (!stored || typeof stored !== 'object') return {};
  return stored;
}

export function FinanceAgingPage() {
  const mode = useAgingMode();
  const copy = MODE_COPY[mode];
  useDocumentTitle(copy.documentTitle);
  const { navigate, toOrgPath } = useOrgNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseFinanceAgingQueryState(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    readAgingColumnVisibility(),
  );
  const [data, setData] = useState<AgingBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgPacks, setOrgPacks] = useState<FinanceReportPack[]>([]);
  const [packName, setPackName] = useState('');
  const [scheduleEmails, setScheduleEmails] = useState('');
  const [savingOrgPack, setSavingOrgPack] = useState(false);
  const [sendingPackId, setSendingPackId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
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

  function applyQuery(patch: Parameters<typeof patchFinanceAgingQueryParams>[1]) {
    setSearchParams(patchFinanceAgingQueryParams(searchParams, patch), { replace: true });
  }

  useEffect(() => {
    setSearchDraft(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchDraft.trim();
      if ((query.q ?? '') === next) return;
      applyQuery({ q: next || undefined });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce draft only
  }, [searchDraft]);

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
        enableHiding: false,
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
              enableHiding: false,
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
              enableHiding: false,
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
    query.bucket && bucketOrder.includes(query.bucket) ? query.bucket : null;

  useEffect(() => {
    if (!query.bucket) return;
    if (bucketOrder.includes(query.bucket)) return;
    applyQuery({ bucket: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear stale bucket for this mode only
  }, [query.bucket, bucketOrder]);

  function bucketTone(key: AgingBucketKey): 'danger' | 'warn' | 'info' | 'default' {
    if (key === 'current' || key === 'noDue') return 'info';
    if (key === 'd1_30') return 'warn';
    return 'danger';
  }

  function toggleColumn(id: string, visible: boolean) {
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      localStorageKit.setJson(StorageKeys.financeAging.columns, next, { version: 1 });
      return next;
    });
  }

  function clearAgingFilters() {
    applyQuery({ clearFilters: true });
  }

  function clearAgingFiltersAndSearch() {
    setSearchDraft('');
    applyQuery({ clearFilters: true, q: '' });
  }

  const filteredRows = useMemo(() => {
    let rows = data?.rows ?? [];
    if (activeBucket) rows = rows.filter((r) => r.bucket === activeBucket);
    if (query.status) rows = rows.filter((r) => r.status === query.status);
    const q = query.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.label, r.tripNumber, r.tripTitle, r.partyName, r.supplierName]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [data?.rows, activeBucket, query.status, query.q]);

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
          : 'Invoices & payments');
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

  const attentionPresets = bucketOrder.map((key) => ({
    id: key,
    label: BUCKET_LABELS[key].toLowerCase(),
    count: summary?.buckets[key]?.count ?? 0,
    active: activeBucket === key,
    tone: bucketTone(key),
    onClick: () => applyQuery({ bucket: activeBucket === key ? undefined : key }),
  }));

  const filterDefs = [
    {
      id: 'bucket',
      label: 'Age',
      value: query.bucket ?? null,
      options: bucketOrder.map((value) => ({ value, label: BUCKET_LABELS[value] })),
      onSelect: (value: string | null) =>
        applyQuery({ bucket: (value as AgingBucketKey | null) || undefined }),
    },
    {
      id: 'status',
      label: 'Status',
      value: query.status ?? null,
      options: STATUS_OPTIONS,
      onSelect: (value: string | null) =>
        applyQuery({ status: (value as FinanceAgingStatusFilter | null) || undefined }),
    },
  ];

  const displayColumns = [
    { id: 'dueAt', label: 'Due', visible: columnVisibility.dueAt !== false },
    { id: 'trip', label: 'Trip', visible: columnVisibility.trip !== false },
    { id: 'outstanding', label: 'Outstanding', visible: columnVisibility.outstanding !== false },
    { id: 'bucket', label: 'Age', visible: columnVisibility.bucket !== false },
    { id: 'status', label: 'Status', visible: columnVisibility.status !== false },
  ];

  const filterChips = [
    activeBucket
      ? {
          id: 'bucket',
          label: `Age: ${BUCKET_LABELS[activeBucket]}`,
          onRemove: () => applyQuery({ bucket: undefined }),
        }
      : null,
    query.status
      ? {
          id: 'status',
          label: `Status: ${STATUS_OPTIONS.find((o) => o.value === query.status)?.label ?? query.status}`,
          onRemove: () => applyQuery({ status: undefined }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const pageSubtitle = activeBucket
    ? `${copy.subtitle} · Age: ${BUCKET_LABELS[activeBucket]}`
    : copy.subtitle;

  usePageChrome({ title: copy.title, subtitle: pageSubtitle });

  const queueToolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search instalment or trip…"
          className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
          aria-label="Search finance aging"
        />
        {searchDraft.trim() ? (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
            onClick={() => {
              setSearchDraft('');
              applyQuery({ q: '' });
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <FilterMenu filters={filterDefs} />
        <DisplayMenu columns={displayColumns} onToggleColumn={toggleColumn} />
      </div>
    </div>
  );

  return (
    <QueuePageChrome
      attention={<AttentionPresets presets={attentionPresets} />}
      primaryActions={
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !(data?.rows.length)}
          onClick={downloadCsv}
        >
          <Download className="size-[0.875em]" />
          Download CSV
        </Button>
      }
      moreMenu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-[var(--control-h-sm)]"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-[0.875em]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 p-1">
            <DropdownMenuLabel className="text-[length:var(--control-text-sm)]">More</DropdownMenuLabel>
            <DropdownMenuItem
              className={QUEUE_MENU_ITEM_CLASS}
              onClick={() => setShareOpen(true)}
            >
              <Users />
              Share &amp; schedule
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      error={error ? <p className="text-sm text-destructive">{error}</p> : null}
      toolbar={queueToolbar}
      chips={
        <ActiveFilterChips
          chips={filterChips}
          onClear={financeAgingQueryHasFilters(query) ? clearAgingFilters : undefined}
        />
      }
    >
      {mode !== 'payables' ? <WriteOffAwaitingStrip /> : null}

      {summary ? (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Outstanding{' '}
            <strong className="font-semibold text-foreground tabular-nums">
              {formatCurrency(summary.totalOutstanding, summary.currency)}
            </strong>
          </span>
          {mode !== 'payables' ? (
            <span className="text-muted-foreground">
              Overdue{' '}
              <strong className="font-semibold text-destructive tabular-nums">
                {formatCurrency(summary.overdueOutstanding, summary.currency)}
              </strong>
            </span>
          ) : null}
          {(summary.otherCurrencyCount ?? 0) > 0 ? (
            <span className="text-xs text-muted-foreground">
              {summary.otherCurrencyCount} other-currency row
              {summary.otherCurrencyCount === 1 ? '' : 's'} excluded from totals
            </span>
          ) : null}
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
        key={`cols-${JSON.stringify(columnVisibility)}-bucket-${activeBucket ?? 'all'}-status-${query.status ?? 'all'}`}
        columns={columns}
        data={filteredRows}
        loading={loading}
        error={error ?? undefined}
        pageSize={25}
        showSearch={false}
        showColumnsMenu={false}
        defaultColumnVisibility={columnVisibility}
        columnVisibilityKey={StorageKeys.financeAging.columns}
        emptyTitle={
          financeAgingQueryHasFilters(query) || query.q
            ? 'No matching rows'
            : mode === 'overdue'
              ? 'No overdue receivables'
              : mode === 'payables'
                ? 'No open supplier payables'
                : 'No open receivables'
        }
        emptyDescription={
          financeAgingQueryHasFilters(query) || query.q
            ? 'Try clearing filters or search.'
            : 'Trip instalments with outstanding balances will appear here.'
        }
        emptyIcon={Wallet}
        emptyAction={
          financeAgingQueryHasFilters(query) || query.q ? (
            <Button type="button" size="sm" variant="outline" onClick={clearAgingFiltersAndSearch}>
              Clear filters
            </Button>
          ) : undefined
        }
      />

      <RecordDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Share & schedule"
        description="Share receivables / overdue / payables views · optional weekly CSV email"
        cancelLabel="Close"
        size="lg"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[10rem] flex-1 sm:max-w-xs"
            placeholder="Pack name (optional)"
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
          />
          <Input
            className="min-w-[12rem] flex-1 sm:max-w-sm"
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
          <p className="text-xs text-muted-foreground">
            No shared views yet — share this view to give your team a one-click deep-link.
          </p>
        )}
      </RecordDialog>
    </QueuePageChrome>
  );
}
