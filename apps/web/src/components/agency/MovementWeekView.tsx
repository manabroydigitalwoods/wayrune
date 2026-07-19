import { Link } from 'react-router-dom';
import { BedDouble, Car, GripVertical, Sparkles, UserRoundX } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { StatusBadge, formatDate } from '@wayrune/ui';

export type MovementWeekFlag = {
  code: string;
  severity: 'danger' | 'warn' | 'info';
  label: string;
};

export type MovementWeekRow = {
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
  driverName?: string | null;
  vehicleLabel?: string | null;
  driverSupplierId?: string | null;
  flags: MovementWeekFlag[];
};

type Props = {
  window: { from: string; to: string; days: number };
  rows: MovementWeekRow[];
  toOrgPath: (path: string) => string;
  loading?: boolean;
  error?: string | null;
  /** When true, driver drops + card→day reschedule (parent owns DndContext). */
  canAssign?: boolean;
  assigningBookingId?: string | null;
  /** Highlight transfers already on this driver while dragging. */
  activeDriverId?: string | null;
  /** Highlight day column while dragging a booking onto it. */
  activeTargetDay?: string | null;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function eachUtcDay(fromIso: string, days: number): string[] {
  const start = new Date(`${fromIso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return [];
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function weekdayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function dayNum(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function riskTone(
  flags: MovementWeekFlag[],
): 'danger' | 'warn' | 'info' | undefined {
  if (flags.some((f) => f.severity === 'danger')) return 'danger';
  if (flags.some((f) => f.severity === 'warn')) return 'warn';
  if (flags.some((f) => f.severity === 'info')) return 'info';
  return undefined;
}

function isTodayUtc(isoDay: string): boolean {
  return new Date().toISOString().slice(0, 10) === isoDay;
}

function DayColumn({
  day,
  items,
  today,
  toOrgPath,
  canAssign,
  assigningBookingId,
  activeDriverId,
  isDropTarget,
}: {
  day: string;
  items: MovementWeekRow[];
  today: boolean;
  toOrgPath: (path: string) => string;
  canAssign?: boolean;
  assigningBookingId?: string | null;
  activeDriverId?: string | null;
  isDropTarget?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${day}`,
    disabled: !canAssign,
    data: { kind: 'day', day },
  });
  const highlight = isOver || isDropTarget;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[18rem] flex-col border-r border-border/50 last:border-r-0 ${
        highlight
          ? 'bg-primary/10 ring-1 ring-inset ring-primary/40'
          : today
            ? 'bg-primary/5'
            : 'bg-card/30'
      }`}
    >
      <div
        className={`sticky top-0 z-10 border-b border-border/60 px-2 py-2 ${
          today || highlight ? 'bg-primary/10' : 'bg-muted/40'
        }`}
      >
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {weekdayLabel(day)}
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {dayNum(day)}
          {today ? (
            <span className="ml-1 text-[11px] font-normal text-primary">
              Today
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {items.length
            ? `${items.length} movement${items.length === 1 ? '' : 's'}`
            : '—'}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-1.5">
        {items.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground/70">
            {canAssign ? 'Drop here to reschedule' : 'Quiet'}
          </p>
        ) : (
          items.map((row) => (
            <MovementCard
              key={row.bookingId}
              row={row}
              toOrgPath={toOrgPath}
              canAssign={canAssign}
              assigning={assigningBookingId === row.bookingId}
              activeDriverId={activeDriverId}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MovementCard({
  row,
  toOrgPath,
  canAssign,
  assigning,
  activeDriverId,
}: {
  row: MovementWeekRow;
  toOrgPath: (path: string) => string;
  canAssign?: boolean;
  assigning?: boolean;
  activeDriverId?: string | null;
}) {
  const isTransfer = row.type === 'transfer';
  const acceptDriver = canAssign && isTransfer;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `transfer:${row.bookingId}`,
    disabled: !acceptDriver,
    data: { kind: 'transfer', row },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `booking:${row.bookingId}`,
    disabled: !canAssign,
    data: { kind: 'booking', row },
  });

  const setNodeRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };

  const tone = riskTone(row.flags);
  const assignedToActive =
    activeDriverId != null &&
    row.driverSupplierId != null &&
    row.driverSupplierId === activeDriverId;

  const body = (
    <>
      <div className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        {canAssign ? (
          <button
            type="button"
            className="inline-flex shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reschedule"
            title="Drag to another day"
            {...listeners}
            {...attributes}
            onClick={(e) => e.preventDefault()}
          >
            <GripVertical className="size-3" />
          </button>
        ) : null}
        {row.type === 'hotel' ? (
          <BedDouble className="size-3 shrink-0" />
        ) : row.type === 'activity' ? (
          <Sparkles className="size-3 shrink-0" />
        ) : (
          <Car className="size-3 shrink-0" />
        )}
        <span className="font-medium text-foreground">{row.tripNumber}</span>
        {assigning ? (
          <span className="ml-auto text-[10px] text-primary">Saving…</span>
        ) : null}
      </div>
      <div className="line-clamp-2 text-xs font-medium leading-snug">
        {row.title}
      </div>
      {row.supplierName ? (
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {row.supplierName}
        </div>
      ) : null}
      {isTransfer && (row.driverName || row.vehicleLabel) ? (
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {[row.driverName, row.vehicleLabel].filter(Boolean).join(' · ')}
        </div>
      ) : isTransfer && canAssign ? (
        <div className="mt-0.5 flex items-center gap-0.5 text-[11px] text-muted-foreground/80">
          <UserRoundX className="size-3 shrink-0" />
          Drop a driver
        </div>
      ) : null}
      {row.endAt && row.type === 'hotel' ? (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          → {formatDate(row.endAt)}
        </div>
      ) : null}
      {row.flags.some((f) => f.severity !== 'info') ? (
        <div className="mt-1 flex flex-wrap gap-0.5">
          {row.flags
            .filter((f) => f.severity !== 'info')
            .slice(0, 2)
            .map((f) => (
              <StatusBadge
                key={f.code}
                value={f.code}
                label={f.label}
                tone={
                  f.severity === 'danger'
                    ? 'danger'
                    : f.severity === 'warn'
                      ? 'warn'
                      : 'info'
                }
                showIcon={false}
                className="!px-1 !py-0 text-[10px]"
              />
            ))}
        </div>
      ) : null}
    </>
  );

  const className = `block rounded-md border px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-background ${
    tone === 'danger'
      ? 'border-destructive/40 bg-destructive/5'
      : tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/5'
        : 'border-border/60 bg-background/80'
  } ${isOver ? '!border-primary !bg-primary/10 ring-1 ring-primary/40' : ''} ${
    assignedToActive ? 'ring-1 ring-primary/30' : ''
  } ${assigning || isDragging ? 'opacity-60' : ''}`;

  return (
    <div ref={setNodeRef} className={className}>
      <Link
        to={toOrgPath(`/trips/${row.tripId}?tab=operations`)}
        className="block outline-none"
      >
        {body}
      </Link>
    </div>
  );
}

export function MovementDriverChip({
  id,
  name,
  listeners,
  attributes,
  setNodeRef,
  isDragging,
}: {
  id: string | null;
  name: string;
  listeners?: object;
  attributes?: object;
  setNodeRef?: (node: HTMLElement | null) => void;
  isDragging?: boolean;
}) {
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`inline-flex max-w-[12rem] items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs shadow-sm ${
        isDragging ? 'opacity-40' : 'hover:border-primary/50'
      } cursor-grab active:cursor-grabbing`}
      title={
        id
          ? `Drag onto a transfer to assign ${name}`
          : 'Drag onto a transfer to clear driver'
      }
    >
      <GripVertical className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium">{name}</span>
    </button>
  );
}

export function MovementBookingOverlay({ row }: { row: MovementWeekRow }) {
  return (
    <div className="max-w-[11rem] rounded-md border border-primary/40 bg-background px-2 py-1.5 text-xs shadow-md">
      <div className="font-medium text-foreground">{row.tripNumber}</div>
      <div className="line-clamp-2 text-muted-foreground">{row.title}</div>
    </div>
  );
}

export function MovementWeekView({
  window,
  rows,
  toOrgPath,
  loading,
  error,
  canAssign,
  assigningBookingId,
  activeDriverId,
  activeTargetDay,
}: Props) {
  const days = eachUtcDay(window.from, window.days);
  const byDay = new Map<string, MovementWeekRow[]>();
  for (const day of days) byDay.set(day, []);
  for (const row of rows) {
    const key = dayKey(row.movementAt);
    const list = byDay.get(key);
    if (list) list.push(row);
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (loading && !rows.length) {
    return (
      <div className="rounded-lg border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        Loading calendar…
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(9.5rem, 1fr))`,
        }}
      >
        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            items={byDay.get(day) ?? []}
            today={isTodayUtc(day)}
            toOrgPath={toOrgPath}
            canAssign={canAssign}
            assigningBookingId={assigningBookingId}
            activeDriverId={activeDriverId}
            isDropTarget={activeTargetDay === day}
          />
        ))}
      </div>
    </div>
  );
}
