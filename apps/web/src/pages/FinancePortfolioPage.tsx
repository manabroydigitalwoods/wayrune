import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, BarChart3, Download, Save, Users } from 'lucide-react';
import {
  Button,
  DataTable,
  ListPageShell,
  PageHeader,
  StatusBadge,
  StorageKeys,
  formatCurrency,
  formatDate,
  formatPercent,
  toastError,
  toastSuccess,
  usePersistentState,
} from '@wayrune/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { reportError } from '../lib/errors';
import { downloadRowsAsCsv } from '../lib/downloadCsv';
import {
  createFinanceReportPack,
  deleteFinanceReportPack,
  listFinanceReportPacks,
  packDeliveryHonestyCue,
  sendFinanceReportPack,
  updateFinanceReportPack,
  type FinanceReportPack,
} from '../lib/financeReportPacks';

type PortfolioRow = {
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  tripStatus: string;
  partyName: string | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  sellTotal: number;
  costTotal: number;
  taxTotal: number;
  marginAmount: number;
  marginPercent: number;
  acceptedAt: string | null;
  quoteNumber: string | null;
  versionNumber: number | null;
};

type PortfolioBoard = {
  summary: {
    currency: string;
    tripCount: number;
    otherCurrencyCount?: number;
    convertedTripCount?: number;
    sellTotal: number;
    costTotal: number;
    marginAmount: number;
    marginPercent: number | null;
  };
  rows: PortfolioRow[];
  window: { from: string | null; to: string | null };
  generatedAt: string;
};

type PortfolioPreset = {
  id: string;
  name: string;
  from: string;
  to: string;
};

export function FinancePortfolioPage() {
  useDocumentTitle('Portfolio profitability');
  const { toOrgPath } = useOrgNavigate();
  const [data, setData] = useState<PortfolioBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [presets, setPresets] = usePersistentState<PortfolioPreset[]>(
    StorageKeys.financePortfolio.presets,
    [],
  );
  const [presetName, setPresetName] = useState('');
  const [orgPacks, setOrgPacks] = useState<FinanceReportPack[]>([]);
  const [savingOrgPack, setSavingOrgPack] = useState(false);
  const [scheduleEmails, setScheduleEmails] = useState('');
  const [sendingPackId, setSendingPackId] = useState<string | null>(null);

  async function refreshOrgPacks() {
    try {
      const res = await listFinanceReportPacks();
      setOrgPacks(res.items.filter((p) => p.portfolio));
    } catch (e) {
      reportError(e, 'Could not load org report packs');
    }
  }

  useEffect(() => {
    void refreshOrgPacks();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    api<PortfolioBoard>(
      `/operations/finance/portfolio${qs ? `?${qs}` : ''}`,
    )
      .then((board) => {
        if (!cancelled) setData(board);
      })
      .catch((e) => {
        if (cancelled) return;
        reportError(e, 'Could not load portfolio profitability');
        setError(
          e instanceof Error ? e.message : 'Could not load portfolio profitability',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const columns = useMemo<ColumnDef<PortfolioRow>[]>(
    () => [
      {
        id: 'trip',
        accessorFn: (r) => `${r.tripNumber} ${r.tripTitle}`,
        header: 'Trip',
        cell: ({ row }) => (
          <Link
            to={toOrgPath(`/trips/${row.original.tripId}?tab=finance`)}
            className="group inline-flex max-w-[16rem] items-start gap-1 text-sm hover:underline"
          >
            <span>
              <span className="font-medium">{row.original.tripNumber}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {row.original.tripTitle}
              </span>
              {row.original.partyName ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {row.original.partyName}
                </span>
              ) : null}
            </span>
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-40 group-hover:opacity-100" />
          </Link>
        ),
      },
      {
        id: 'startDate',
        accessorKey: 'startDate',
        header: 'Travel',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {row.original.startDate ? formatDate(row.original.startDate) : '—'}
          </span>
        ),
      },
      {
        id: 'quote',
        accessorFn: (r) => r.quoteNumber || '',
        header: 'Quote',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.quoteNumber
              ? `${row.original.quoteNumber}${
                  row.original.versionNumber
                    ? ` · v${row.original.versionNumber}`
                    : ''
                }`
              : '—'}
          </span>
        ),
      },
      {
        id: 'sellTotal',
        accessorKey: 'sellTotal',
        header: 'Sell',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatCurrency(row.original.sellTotal, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'costTotal',
        accessorKey: 'costTotal',
        header: 'Cost',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatCurrency(row.original.costTotal, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'marginAmount',
        accessorKey: 'marginAmount',
        header: 'Margin',
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="font-medium tabular-nums">
              {formatCurrency(row.original.marginAmount, row.original.currency)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatPercent(row.original.marginPercent)}
            </div>
          </div>
        ),
      },
      {
        id: 'tripStatus',
        accessorKey: 'tripStatus',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge value={row.original.tripStatus} showIcon={false} />
        ),
      },
    ],
    [toOrgPath],
  );

  const summary = data?.summary;

  function downloadCsv() {
    const rows = data?.rows ?? [];
    if (!rows.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const windowPart = [from || 'all', to || 'all'].join('_');
    downloadRowsAsCsv(
      `portfolio-${windowPart}-${stamp}.csv`,
      [
        'Trip number',
        'Trip title',
        'Party',
        'Start',
        'End',
        'Quote',
        'Version',
        'Sell',
        'Cost',
        'Tax',
        'Margin',
        'Margin %',
        'Status',
        'Currency',
      ],
      rows.map((r) => [
        r.tripNumber,
        r.tripTitle,
        r.partyName || '',
        r.startDate || '',
        r.endDate || '',
        r.quoteNumber || '',
        r.versionNumber ?? '',
        r.sellTotal,
        r.costTotal,
        r.taxTotal,
        r.marginAmount,
        r.marginPercent,
        r.tripStatus,
        r.currency,
      ]),
    );
    toastSuccess('CSV downloaded');
  }

  function savePreset() {
    const name = presetName.trim() || [from || '…', to || '…'].join(' → ');
    const next: PortfolioPreset = {
      id: `${Date.now()}`,
      name,
      from,
      to,
    };
    setPresets([next, ...presets.filter((p) => p.name !== name)].slice(0, 8));
    setPresetName('');
    toastSuccess('Personal preset saved');
  }

  async function saveOrgPack() {
    const name = presetName.trim() || [from || '…', to || '…'].join(' → ');
    const emails = scheduleEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    setSavingOrgPack(true);
    try {
      await createFinanceReportPack({
        name,
        portfolio: { from, to },
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
      setPresetName('');
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

  function applyPreset(p: PortfolioPreset) {
    setFrom(p.from);
    setTo(p.to);
  }

  function applyOrgPack(p: FinanceReportPack) {
    if (!p.portfolio) return;
    setFrom(p.portfolio.from);
    setTo(p.portfolio.to);
  }

  function removePreset(id: string) {
    setPresets(presets.filter((p) => p.id !== id));
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
        icon={BarChart3}
        title="Portfolio profitability"
        subtitle="Accepted quotes rolled up by trip — sell, cost, and margin."
        className="mb-4 shrink-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              From
              <input
                type="date"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              To
              <input
                type="date"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              variant="secondary"
              disabled={loading || !(data?.rows.length)}
              onClick={downloadCsv}
            >
              <Download className="size-4" />
              Download CSV
            </Button>
          </div>
        }
      />

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-[10rem] flex-1 rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
            placeholder="Preset name (optional)"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <input
            className="h-9 min-w-[12rem] flex-1 rounded-md border border-input bg-background px-3 text-sm sm:max-w-sm"
            placeholder="Weekly email to (optional, comma-separated)"
            value={scheduleEmails}
            onChange={(e) => setScheduleEmails(e.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={savePreset}>
            <Save className="size-4" />
            Save for me
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={savingOrgPack}
            onClick={() => void saveOrgPack()}
          >
            <Users className="size-4" />
            {savingOrgPack ? 'Sharing…' : 'Share with agency'}
          </Button>
        </div>
        {presets.length ? (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-xs"
              >
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => applyPreset(p)}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => removePreset(p.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
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
            Personal or agency shared travel-date windows · optional weekly CSV email
          </span>
        )}
      </div>

      {summary ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Trips</div>
            <div className="text-lg font-semibold tabular-nums">{summary.tripCount}</div>
            {(summary.otherCurrencyCount ?? 0) > 0 ||
            (summary.convertedTripCount ?? 0) > 0 ? (
              <div className="text-[11px] text-muted-foreground">
                {(summary.convertedTripCount ?? 0) > 0
                  ? `${summary.convertedTripCount} converted at org FX`
                  : null}
                {(summary.convertedTripCount ?? 0) > 0 &&
                (summary.otherCurrencyCount ?? 0) > 0
                  ? ' · '
                  : null}
                {(summary.otherCurrencyCount ?? 0) > 0
                  ? `${summary.otherCurrencyCount} other-currency trip${
                      summary.otherCurrencyCount === 1 ? '' : 's'
                    } excluded (no FX rate)`
                  : null}
              </div>
            ) : null}
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Sell</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(summary.sellTotal, summary.currency)}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Cost</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(summary.costTotal, summary.currency)}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Margin</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(summary.marginAmount, summary.currency)}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Margin %</div>
            <div className="text-lg font-semibold tabular-nums">
              {summary.marginPercent != null
                ? formatPercent(summary.marginPercent)
                : '—'}
            </div>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        loading={loading}
        error={error ?? undefined}
        pageSize={25}
        searchKey="trip"
        searchPlaceholder="Search trip…"
        columnVisibilityKey={StorageKeys.financePortfolio.columns}
        facets={[
          {
            id: 'tripStatus',
            columnId: 'tripStatus',
            label: 'Status',
            options: [
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'booking_in_progress', label: 'Booking' },
              { value: 'ready_to_travel', label: 'Ready' },
              { value: 'completed', label: 'Completed' },
            ],
          },
        ]}
        emptyTitle="No accepted quotes in this window"
        emptyDescription="Trips with an accepted quotation will appear here with sell, cost, and margin."
        emptyIcon={BarChart3}
      />
    </ListPageShell>
  );
}
