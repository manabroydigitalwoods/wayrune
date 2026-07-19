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
import { ArrowUpRight, CalendarDays, List, Map, X } from 'lucide-react';
import {
  Button,
  DataTable,
  ListPageShell,
  PageHeader,
  StatusBadge,
  StorageKeys,
  formatDate,
  toastError,
  toastSuccess,
  toastWarning,
  usePersistentState,
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
import {
  applyMovementBoardFilters,
  movementBoardHasActiveFilters,
  parseMovementBoardFilters,
} from '../lib/movementBoardFilters';
import { rescheduleBookingDates } from '../lib/movementReschedule';

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

type BoardView = 'table' | 'week';

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

export function MovementBoardPage() {
  useDocumentTitle('Movement board');
  const { toOrgPath } = useOrgNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasAny } = usePermissions();
  const canAssign = hasAny(CAP.tripWrite);
  const [data, setData] = useState<MovementBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo(
    () => parseMovementBoardFilters(searchParams),
    [searchParams],
  );
  const daysFromUrl = Number(searchParams.get('days') || 0);
  const [days, setDays] = useState(() =>
    daysFromUrl === 7 || daysFromUrl === 14 || daysFromUrl === 30
      ? daysFromUrl
      : 14,
  );
  const [view, setView] = usePersistentState<BoardView>(
    StorageKeys.movementBoard.view,
    'table',
  );
  const [drivers, setDrivers] = useState<SupplierRow[]>([]);
  const [assigningBookingId, setAssigningBookingId] = useState<string | null>(
    null,
  );
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [activeTargetDay, setActiveTargetDay] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    if (daysFromUrl === 7 || daysFromUrl === 14 || daysFromUrl === 30) {
      setDays(daysFromUrl);
    }
  }, [daysFromUrl]);

  function patchBoardParams(patch: {
    type?: 'hotel' | 'transfer' | 'activity' | null;
    flagged?: boolean | null;
    overduePay?: boolean | null;
    voucherPending?: boolean | null;
    days?: number;
    clear?: boolean;
  }) {
    const next = new URLSearchParams(searchParams);
    if (patch.clear) {
      next.delete('type');
      next.delete('flagged');
      next.delete('overduePay');
      next.delete('voucherPending');
    }
    if (patch.type === null) next.delete('type');
    else if (patch.type) next.set('type', patch.type);
    if (patch.flagged === false || patch.flagged === null) next.delete('flagged');
    else if (patch.flagged) next.set('flagged', '1');
    if (patch.overduePay === false || patch.overduePay === null) {
      next.delete('overduePay');
    } else if (patch.overduePay) next.set('overduePay', '1');
    if (patch.voucherPending === false || patch.voucherPending === null) {
      next.delete('voucherPending');
    } else if (patch.voucherPending) next.set('voucherPending', '1');
    if (patch.days === 7 || patch.days === 14 || patch.days === 30) {
      if (patch.days === 14) next.delete('days');
      else next.set('days', String(patch.days));
    }
    setSearchParams(next, { replace: true });
  }

  const reloadBoard = useCallback(async () => {
    const board = await api<MovementBoard>(
      `/operations/movement-board?days=${days}`,
    );
    setData(board);
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<MovementBoard>(`/operations/movement-board?days=${days}`)
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
  }, [days]);

  useEffect(() => {
    if (view !== 'week' || !canAssign) return;
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
  }, [view, canAssign]);

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
  const filteredRows = useMemo(
    () => applyMovementBoardFilters(data?.rows ?? [], filters),
    [data?.rows, filters],
  );
  const filtersActive = movementBoardHasActiveFilters(filters);
  const subtitle = data
    ? `${formatDate(data.window.from)} → ${formatDate(data.window.to)} · ${data.window.days} days${
        filtersActive
          ? ` · showing ${filteredRows.length} of ${data.rows.length}`
          : ''
      }`
    : 'Upcoming hotel check-ins, transfers, and activities across trips';

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
  ) : (
    <div className="rounded-lg border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
      {loading ? 'Loading calendar…' : error || 'No movements in this window'}
    </div>
  );

  return (
    <ListPageShell>
      <PageHeader
        icon={Map}
        title="Movement board"
        subtitle={subtitle}
        className="mb-4 shrink-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border/60 p-0.5">
              <Button
                size="sm"
                variant={view === 'table' ? 'secondary' : 'ghost'}
                className="h-8 gap-1.5 px-2.5"
                onClick={() => setView('table')}
              >
                <List className="size-3.5" />
                Table
              </Button>
              <Button
                size="sm"
                variant={view === 'week' ? 'secondary' : 'ghost'}
                className="h-8 gap-1.5 px-2.5"
                onClick={() => setView('week')}
              >
                <CalendarDays className="size-3.5" />
                Calendar
              </Button>
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={days}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDays(next);
                patchBoardParams({ days: next });
              }}
              aria-label="Lookahead days"
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
            {filtersActive ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2"
                onClick={() => patchBoardParams({ clear: true })}
              >
                <X className="size-3.5" />
                Clear filters
              </Button>
            ) : null}
          </div>
        }
      />

      {summary ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              filters.type === 'hotel'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/60 hover:bg-muted/40'
            }`}
            onClick={() =>
              patchBoardParams({
                type: filters.type === 'hotel' ? null : 'hotel',
                flagged: false,
                overduePay: false,
                voucherPending: false,
              })
            }
          >
            <div className="text-xs text-muted-foreground">Hotels</div>
            <div className="text-lg font-semibold tabular-nums">{summary.hotels}</div>
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              filters.type === 'transfer'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/60 hover:bg-muted/40'
            }`}
            onClick={() =>
              patchBoardParams({
                type: filters.type === 'transfer' ? null : 'transfer',
                flagged: false,
                overduePay: false,
                voucherPending: false,
              })
            }
          >
            <div className="text-xs text-muted-foreground">Transfers</div>
            <div className="text-lg font-semibold tabular-nums">
              {summary.transfers}
            </div>
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              filters.type === 'activity'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/60 hover:bg-muted/40'
            }`}
            onClick={() =>
              patchBoardParams({
                type: filters.type === 'activity' ? null : 'activity',
                flagged: false,
                overduePay: false,
                voucherPending: false,
              })
            }
          >
            <div className="text-xs text-muted-foreground">Activities</div>
            <div className="text-lg font-semibold tabular-nums">
              {summary.activities}
            </div>
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              filters.voucherPending
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/60 hover:bg-muted/40'
            }`}
            onClick={() =>
              patchBoardParams({
                voucherPending: !filters.voucherPending,
                type: null,
                flagged: false,
                overduePay: false,
              })
            }
          >
            <div className="text-xs text-muted-foreground">Voucher pending</div>
            <div className="text-lg font-semibold tabular-nums">
              {summary.voucherPending}
            </div>
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              filters.flagged
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/60 hover:bg-muted/40'
            }`}
            onClick={() =>
              patchBoardParams({
                flagged: !filters.flagged,
                type: null,
                overduePay: false,
                voucherPending: false,
              })
            }
          >
            <div className="text-xs text-muted-foreground">Flagged</div>
            <div className="text-lg font-semibold tabular-nums">
              {summary.flagged}
            </div>
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              filters.overduePay
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/60 hover:bg-muted/40'
            }`}
            onClick={() =>
              patchBoardParams({
                overduePay: !filters.overduePay,
                type: null,
                flagged: false,
                voucherPending: false,
              })
            }
          >
            <div className="text-xs text-muted-foreground">Overdue pay trips</div>
            <div className="text-lg font-semibold tabular-nums">
              {summary.overduePayTrips}
            </div>
          </button>
        </div>
      ) : null}

      {view === 'week' ? (
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
          searchKey="title"
          searchPlaceholder="Search service or trip…"
          columnVisibilityKey={StorageKeys.movementBoard.columns}
          facets={[
            {
              id: 'type',
              columnId: 'type',
              label: 'Type',
              options: [
                { value: 'hotel', label: 'Hotel' },
                { value: 'transfer', label: 'Transfer' },
                { value: 'activity', label: 'Activity' },
              ],
            },
            {
              id: 'status',
              columnId: 'status',
              label: 'Status',
              options: [
                { value: 'requested', label: 'Requested' },
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'held', label: 'Held' },
                { value: 'pending', label: 'Pending' },
              ],
            },
          ]}
          emptyTitle={
            filtersActive ? 'No movements match this filter' : 'No movements in this window'
          }
          emptyDescription={
            filtersActive
              ? 'Clear filters or widen the lookahead window.'
              : 'Hotel check-ins, transfers, and activities with dates in range will appear here.'
          }
          emptyIcon={Map}
          emptyAction={
            filtersActive ? (
              <Button size="sm" variant="outline" onClick={() => patchBoardParams({ clear: true })}>
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
    </ListPageShell>
  );
}
