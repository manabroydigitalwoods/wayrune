import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowUpRight, CalendarDays, List, Search, X } from 'lucide-react';
import {
  Button,
  DataTable,
  DateRangeFilter,
  Input,
  Skeleton,
  StatusBadge,
  StorageKeys,
  cn,
  formatDate,
  localStorageKit,
  resolveDateRangePreset,
  toastError,
  toastSuccess,
  toastWarning,
  usePageChrome,
  type DateRangeValue,
} from '@wayrune/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import {
  MovementBookingOverlay,
  MovementDriverChip,
  MovementWeekView,
} from '../components/agency/MovementWeekView';
import { applyMovementBoardFilters } from '../lib/movementBoardFilters';
import { rescheduleBookingDates } from '../lib/movementReschedule';
import {
  MOVEMENT_STATUS_OPTIONS,
  movementQueryHasFilters,
  parseMovementQueryState,
  patchMovementQueryParams,
  type MovementBoardStatus,
  type MovementBoardView,
  type MovementQueryState,
} from '../lib/queue';
import {
  ActiveFilterChips,
  AttentionPresets,
  FilterMenu,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
  QueueViewToggle,
} from '../components/queue';

type MovementFlag = {
  code: string;
  severity: 'danger' | 'warn' | 'info';
  label: string;
};

type MovementRow = {
  bookingId: string;
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  type: string;
  title: string;
  status: string;
  movementAt: string;
  endAt: string | null;
  supplierName: string | null;
  confirmationRef: string | null;
  driverName: string | null;
  vehicleLabel: string | null;
  driverSupplierId?: string | null;
  flags: MovementFlag[];
};

type MovementBoard = {
  window: { from: string; to: string; days: number };
  rows: MovementRow[];
  summary: {
    hotels: number;
    transfers: number;
    activities: number;
    flagged: number;
    overduePayTrips: number;
    voucherPending: number;
  };
};

type SupplierRow = {
  id: string;
  name: string;
  type?: string | null;
};

type DriverDragData = {
  kind: 'driver';
  driverSupplierId: string | null;
  name: string;
};

type BookingDragData = {
  kind: 'booking';
  row: MovementRow;
};

type ActiveDrag = DriverDragData | BookingDragData;

function severityTone(
  severity: MovementFlag['severity'],
): 'danger' | 'warn' | 'info' {
  if (severity === 'danger') return 'danger';
  if (severity === 'warn') return 'warn';
  return 'info';
}

function readMovementView(): MovementBoardView {
  const stored = localStorageKit.getJson<MovementBoardView>(StorageKeys.movementBoard.view, {
    version: 1,
  });
  return stored === 'week' ? 'week' : 'table';
}

function writeMovementView(view: MovementBoardView) {
  localStorageKit.setJson(StorageKeys.movementBoard.view, view, { version: 1 });
}

function DraggableDriverChip({
  id,
  name,
}: {
  id: string | null;
  name: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: id ? `driver:${id}` : 'driver:unassigned',
    data: {
      kind: 'driver',
      driverSupplierId: id,
      name,
    } satisfies DriverDragData,
  });
  return (
    <MovementDriverChip
      id={id}
      name={name}
      setNodeRef={setNodeRef}
      attributes={attributes}
      listeners={listeners}
      isDragging={isDragging}
    />
  );
}

/** Resolve the board's working window (forward-pack preset, explicit range, or legacy `?days=`). */
function rangeFromQuery(query: MovementQueryState): DateRangeValue {
  if (query.from && query.to) {
    return { from: query.from, to: query.to, presetId: query.period || 'custom' };
  }
  if (query.days === 7) {
    return { ...resolveDateRangePreset('next_7', 'forward'), presetId: 'next_7' };
  }
  // Legacy default was 14 days — map to next_30 for the forward pack.
  return { ...resolveDateRangePreset('next_30', 'forward'), presetId: 'next_30' };
}

export function MovementBoardPage() {
  useDocumentTitle('Movement board');
  const { toOrgPath } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canAssign = hasAny(CAP.tripWrite);
  const [data, setData] = useState<MovementBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(
    () => parseMovementQueryState(searchParams, readMovementView()),
    [searchParams],
  );
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');

  function applyQuery(patch: Parameters<typeof patchMovementQueryParams>[1]) {
    setSearchParams(patchMovementQueryParams(searchParams, patch), { replace: true });
  }

  function changeView(next: MovementBoardView) {
    writeMovementView(next);
    applyQuery({ view: next });
  }

  /** Seed `?view=` when missing so deep-links stay stable. */
  useEffect(() => {
    if (searchParams.get('view') === 'table' || searchParams.get('view') === 'week') return;
    applyQuery({ view: query.view });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydrate
  }, []);

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

  const range = rangeFromQuery(query);
  const [drivers, setDrivers] = useState<SupplierRow[]>([]);
  const [assigningBookingId, setAssigningBookingId] = useState<string | null>(
    null,
  );
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [activeTargetDay, setActiveTargetDay] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function boardQuery(r: DateRangeValue): string {
    const params = new URLSearchParams();
    if (r.from && r.to) {
      params.set('from', r.from);
      params.set('to', r.to);
    } else {
      params.set('days', '30');
    }
    return params.toString();
  }

  function onRangeChange(next: DateRangeValue) {
    applyQuery({
      from: next.from,
      to: next.to,
      period: next.presetId,
    });
  }

  const reloadBoard = useCallback(async () => {
    const board = await api<MovementBoard>(
      `/operations/movement-board?${boardQuery(range)}`,
    );
    setData(board);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boardQuery is a pure helper
  }, [range.from, range.to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<MovementBoard>(`/operations/movement-board?${boardQuery(range)}`)
      .then((board) => {
        if (!cancelled) setData(board);
      })
      .catch((e) => {
        if (cancelled) return;
        reportError(e, 'Could not load movement board');
        setError(e instanceof Error ? e.message : 'Could not load movement board');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boardQuery is a pure helper
  }, [range.from, range.to]);

  useEffect(() => {
    if (query.view !== 'week' || !canAssign) return;
    let cancelled = false;
    api<SupplierRow[]>('/suppliers')
      .then((list) => {
        if (cancelled) return;
        setDrivers(
          list.filter((s) => {
            const t = (s.type || '').toLowerCase();
            return t === 'driver' || t === 'car_rental' || t === 'fleet';
          }),
        );
      })
      .catch((e) => {
        if (!cancelled) reportError(e, 'Could not load drivers');
      });
    return () => {
      cancelled = true;
    };
  }, [query.view, canAssign]);

  async function assignDriver(
    row: MovementRow,
    driverSupplierId: string | null,
    driverName: string,
  ) {
    const current = row.driverSupplierId ?? null;
    if (current === driverSupplierId) return;
    setAssigningBookingId(row.bookingId);
    try {
      const res = await api<{
        driverJobSync?: {
          ok: boolean;
          skipped?: string;
          failed?: string;
          softConflict?: boolean;
          allocationId?: string;
        };
      }>(`/trips/${row.tripId}/bookings/${row.bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ driverSupplierId }),
      });
      const sync = res.driverJobSync;
      if (sync && !sync.ok) {
        toastWarning(
          driverSupplierId
            ? `Assigned ${driverName} · partner job not synced (${sync.failed || sync.skipped || 'skipped'})`
            : `Cleared driver · partner job not synced (${sync.failed || sync.skipped || 'skipped'})`,
        );
      } else if (sync?.softConflict) {
        toastWarning(
          `Assigned ${driverName} · partner fleet soft conflict in this window`,
        );
      } else {
        toastSuccess(
          driverSupplierId
            ? `Assigned ${driverName} to ${row.title}`
            : `Cleared driver on ${row.title}`,
        );
      }
      await reloadBoard();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not assign driver');
    } finally {
      setAssigningBookingId(null);
    }
  }

  async function rescheduleBooking(row: MovementRow, targetDay: string) {
    const next = rescheduleBookingDates({
      movementAt: row.movementAt,
      endAt: row.endAt,
      targetDay,
    });
    if (!next) return;
    setAssigningBookingId(row.bookingId);
    try {
      const res = await api<{
        driverJobSync?: { ok: boolean; skipped?: string; failed?: string };
      }>(`/trips/${row.tripId}/bookings/${row.bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          startAt: next.startAt,
          ...(next.endAt !== undefined ? { endAt: next.endAt } : {}),
        }),
      });
      const moved =
        row.type === 'hotel'
          ? `Moved check-in to ${next.startAt}`
          : `Moved transfer to ${next.startAt}`;
      const sync = res.driverJobSync;
      if (sync && !sync.ok) {
        toastWarning(
          `${moved} · partner job not synced (${sync.failed || sync.skipped || 'skipped'})`,
        );
      } else {
        toastSuccess(moved);
      }
      await reloadBoard();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not reschedule');
    } finally {
      setAssigningBookingId(null);
    }
  }

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as ActiveDrag | undefined;
    if (data?.kind === 'driver' || data?.kind === 'booking') {
      setActiveDrag(data);
    }
  }

  function onDragOver(event: DragOverEvent) {
    const drag = event.active.data.current as ActiveDrag | undefined;
    const over = event.over?.data.current as
      | { kind?: string; day?: string }
      | undefined;
    if (drag?.kind === 'booking' && over?.kind === 'day' && over.day) {
      setActiveTargetDay(over.day);
    } else {
      setActiveTargetDay(null);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const drag = event.active.data.current as ActiveDrag | undefined;
    const over = event.over;
    setActiveDrag(null);
    setActiveTargetDay(null);
    if (!drag || !over) return;

    if (drag.kind === 'driver') {
      const overData = over.data.current as
        | { kind?: string; row?: MovementRow }
        | undefined;
      if (overData?.kind !== 'transfer' || !overData.row) return;
      void assignDriver(
        overData.row,
        drag.driverSupplierId,
        drag.name,
      );
      return;
    }

    if (drag.kind === 'booking') {
      const overData = over.data.current as
        | { kind?: string; day?: string }
        | undefined;
      if (overData?.kind !== 'day' || !overData.day) return;
      void rescheduleBooking(drag.row, overData.day);
    }
  }

  const columns = useMemo<ColumnDef<MovementRow>[]>(
    () => [
      {
        id: 'movementAt',
        accessorKey: 'movementAt',
        header: 'Date',
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="font-medium">{formatDate(row.original.movementAt)}</div>
            {row.original.endAt ? (
              <div className="text-xs text-muted-foreground">
                to {formatDate(row.original.endAt)}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'type',
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.type}
            label={
              row.original.type === 'hotel'
                ? 'Hotel'
                : row.original.type === 'activity'
                  ? 'Activity'
                  : 'Transfer'
            }
            showIcon={false}
          />
        ),
      },
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Service',
        cell: ({ row }) => (
          <div className="min-w-[10rem]">
            <div className="font-medium">{row.original.title}</div>
            {row.original.supplierName ? (
              <div className="text-xs text-muted-foreground">
                {row.original.supplierName}
              </div>
            ) : null}
            {row.original.type === 'transfer' &&
            (row.original.driverName || row.original.vehicleLabel) ? (
              <div className="text-xs text-muted-foreground">
                {[row.original.driverName, row.original.vehicleLabel]
                  .filter(Boolean)
                  .join(' · ')}
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
            to={toOrgPath(`/trips/${row.original.tripId}?tab=operations`)}
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
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge value={row.original.status} showIcon={false} />
        ),
      },
      {
        id: 'flags',
        accessorFn: (r) => r.flags.map((f) => f.code).join(' '),
        header: 'Risks',
        cell: ({ row }) => {
          const flags = row.original.flags.filter((f) => f.severity !== 'info');
          const show = flags.length ? flags : row.original.flags.slice(0, 1);
          if (!show.length) {
            return (
              <span className="text-xs text-muted-foreground">Clear</span>
            );
          }
          return (
            <div className="flex max-w-[18rem] flex-wrap gap-1">
              {show.map((f) => (
                <StatusBadge
                  key={f.code}
                  value={f.code}
                  label={f.label}
                  tone={severityTone(f.severity)}
                  showIcon
                />
              ))}
            </div>
          );
        },
      },
    ],
    [toOrgPath],
  );

  const summary = data?.summary;
  const filtersActive = movementQueryHasFilters(query);
  const filteredRows = useMemo(() => {
    let rows = applyMovementBoardFilters(data?.rows ?? [], query);
    if (query.status) {
      rows = rows.filter((r) => r.status === query.status);
    }
    const q = query.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.title, r.tripNumber, r.tripTitle, r.supplierName]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [data?.rows, query]);
  const subtitle = data
    ? `${formatDate(data.window.from)} → ${formatDate(data.window.to)} · ${data.window.days} days${
        filtersActive || query.q
          ? ` · showing ${filteredRows.length} of ${data.rows.length}`
          : ''
      }`
    : 'Upcoming hotel check-ins, transfers, and activities across trips';

  usePageChrome({ title: 'Movement board', subtitle });

  function clearMovementFilters() {
    applyQuery({ clearFilters: true });
  }

  function clearMovementFiltersAndSearch() {
    setSearchDraft('');
    applyQuery({ clearFilters: true, q: '' });
  }

  const filterDefs = [
    {
      id: 'type',
      label: 'Type',
      value: query.type ?? null,
      options: [
        { value: 'hotel', label: 'Hotel', countLabel: summary ? String(summary.hotels) : undefined },
        {
          value: 'transfer',
          label: 'Transfer',
          countLabel: summary ? String(summary.transfers) : undefined,
        },
        {
          value: 'activity',
          label: 'Activity',
          countLabel: summary ? String(summary.activities) : undefined,
        },
      ],
      onSelect: (value: string | null) =>
        applyQuery({ type: (value as 'hotel' | 'transfer' | 'activity' | null) || null }),
    },
    {
      id: 'status',
      label: 'Status',
      value: query.status ?? null,
      options: MOVEMENT_STATUS_OPTIONS.map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      })),
      onSelect: (value: string | null) =>
        applyQuery({ status: (value as MovementBoardStatus | null) || undefined }),
    },
  ];

  const attentionPresets = [
    {
      id: 'flagged',
      label: 'flagged',
      count: summary?.flagged ?? 0,
      active: query.flagged,
      tone: 'danger' as const,
      onClick: () => applyQuery({ flagged: !query.flagged }),
    },
    {
      id: 'overduePay',
      label: 'overdue pay',
      count: summary?.overduePayTrips ?? 0,
      active: query.overduePay,
      tone: 'danger' as const,
      onClick: () => applyQuery({ overduePay: !query.overduePay }),
    },
    {
      id: 'voucherPending',
      label: 'voucher pending',
      count: summary?.voucherPending ?? 0,
      active: query.voucherPending,
      tone: 'warn' as const,
      onClick: () => applyQuery({ voucherPending: !query.voucherPending }),
    },
  ];

  const filterChips = [
    query.type
      ? {
          id: 'type',
          label: `Type: ${query.type === 'hotel' ? 'Hotel' : query.type === 'transfer' ? 'Transfer' : 'Activity'}`,
          onRemove: () => applyQuery({ type: null }),
        }
      : null,
    query.status
      ? {
          id: 'status',
          label: `Status: ${query.status.charAt(0).toUpperCase()}${query.status.slice(1)}`,
          onRemove: () => applyQuery({ status: undefined }),
        }
      : null,
    query.flagged
      ? { id: 'flagged', label: 'Flagged', onRemove: () => applyQuery({ flagged: false }) }
      : null,
    query.overduePay
      ? {
          id: 'overduePay',
          label: 'Overdue pay',
          onRemove: () => applyQuery({ overduePay: false }),
        }
      : null,
    query.voucherPending
      ? {
          id: 'voucherPending',
          label: 'Voucher pending',
          onRemove: () => applyQuery({ voucherPending: false }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const calendar = data?.window ? (
    <MovementWeekView
      window={data.window}
      rows={filteredRows}
      toOrgPath={toOrgPath}
      loading={loading}
      error={error}
      canAssign={canAssign}
      assigningBookingId={assigningBookingId}
      activeDriverId={
        activeDrag?.kind === 'driver' ? activeDrag.driverSupplierId : null
      }
      activeTargetDay={activeTargetDay}
    />
  ) : loading ? (
    <div
      className="space-y-3 rounded-lg border border-border/60 px-4 py-6"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  ) : (
    <div className="rounded-lg border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
      {error || 'No movements in this window'}
    </div>
  );

  const queueToolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search service or trip…"
          className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
          aria-label="Search movements"
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
        <DateRangeFilter
          pack="forward"
          dimensionLabel="Movement"
          value={range}
          onChange={onRangeChange}
          allowClear={false}
          emptyLabel="Next 30 days"
          data-testid="movement-date-range"
        />
        <FilterMenu filters={filterDefs} />
      </div>
    </div>
  );

  return (
    <QueuePageChrome
      viewToggle={
        <QueueViewToggle
          value={query.view}
          onChange={(id) => changeView(id as MovementBoardView)}
          options={[
            {
              id: 'table',
              label: 'Table',
              icon: <List className="size-[0.875em]" />,
            },
            {
              id: 'week',
              label: 'Calendar',
              icon: <CalendarDays className="size-[0.875em]" />,
            },
          ]}
        />
      }
      attention={<AttentionPresets presets={attentionPresets} />}
      toolbar={queueToolbar}
      chips={
        <ActiveFilterChips
          chips={filterChips}
          onClear={filtersActive ? clearMovementFilters : undefined}
        />
      }
    >
      {query.view === 'week' ? (
        canAssign ? (
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActiveDrag(null);
              setActiveTargetDay(null);
            }}
          >
            <div className="mb-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2">
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                Drag a driver onto a transfer to assign (creates a partner Driver
                Job when the supplier has a linked asset). Drag a card grip to
                another day to reschedule.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <DraggableDriverChip id={null} name="Unassigned" />
                {drivers.map((d) => (
                  <DraggableDriverChip key={d.id} id={d.id} name={d.name} />
                ))}
                {!drivers.length ? (
                  <span className="text-xs text-muted-foreground">
                    No driver / fleet suppliers yet — add them under Suppliers.
                  </span>
                ) : null}
              </div>
            </div>
            {calendar}
            <DragOverlay dropAnimation={null}>
              {activeDrag?.kind === 'driver' ? (
                <MovementDriverChip
                  id={activeDrag.driverSupplierId}
                  name={activeDrag.name}
                />
              ) : activeDrag?.kind === 'booking' ? (
                <MovementBookingOverlay row={activeDrag.row} />
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          calendar
        )
      ) : (
        <DataTable
          columns={columns}
          data={filteredRows}
          loading={loading}
          error={error ?? undefined}
          pageSize={25}
          showSearch={false}
          showColumnsMenu={false}
          columnVisibilityKey={StorageKeys.movementBoard.columns}
          emptyTitle={
            filtersActive || query.q ? 'No movements match this filter' : 'No movements in this window'
          }
          emptyDescription={
            filtersActive || query.q
              ? 'Clear filters or widen the lookahead window.'
              : 'Hotel check-ins, transfers, and activities with dates in range will appear here.'
          }
          emptyIcon={CalendarDays}
          emptyAction={
            filtersActive || query.q ? (
              <Button size="sm" variant="outline" onClick={clearMovementFiltersAndSearch}>
                Clear filters
              </Button>
            ) : (
              <Link
                to={toOrgPath(AGENCY_ROUTES.operations)}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Open readiness
              </Link>
            )
          }
        />
      )}
    </QueuePageChrome>
  );
}
