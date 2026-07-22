import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowRight, Mail, Phone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { Avatar, AvatarFallback } from './ui/avatar';

export type PipelineLead = {
  id: string;
  title: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  priority: string;
  owner?: { fullName?: string | null } | null;
};

export type PipelineColumnData = {
  stage: { id: string; name: string; key: string; isLost?: boolean; isWon?: boolean };
  leads: PipelineLead[];
  /** Total leads in this stage (may be more than loaded). */
  total?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
};

const STAGE_ACCENTS = [
  'bg-teal-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-orange-500',
  'bg-emerald-500',
  'bg-slate-500',
  'bg-cyan-600',
  'bg-lime-600',
] as const;

const PRIORITY_STYLES: Record<string, { bar: string; chip: string; label: string }> = {
  low: {
    bar: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    label: 'Low',
  },
  normal: {
    bar: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    label: 'Normal',
  },
  high: {
    bar: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    label: 'High',
  },
  urgent: {
    bar: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    label: 'Urgent',
  },
};

function initials(name?: string | null) {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function PriorityChip({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide',
        style.chip,
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.bar)} aria-hidden />
      {style.label}
    </span>
  );
}

function LeadCardBody({ lead }: { lead: PipelineLead }) {
  const priority = PRIORITY_STYLES[lead.priority] ?? PRIORITY_STYLES.normal;
  const contactLine = lead.contactName?.trim() || null;

  return (
    <div className="relative min-w-0 pl-2.5">
      <span
        className={cn('absolute inset-y-0 left-0 w-0.5 rounded-full', priority.bar)}
        aria-hidden
      />
      <div className="truncate text-sm font-semibold leading-snug text-foreground">{lead.title}</div>
      {contactLine ? (
        <div className="mt-1 truncate text-xs text-muted-foreground">{contactLine}</div>
      ) : null}
      {lead.email || lead.phone ? (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {lead.email ? (
            <div className="flex min-w-0 items-center gap-1.5 text-[length:var(--control-text-sm)] text-muted-foreground/90">
              <Mail className="size-3 shrink-0 opacity-60" aria-hidden />
              <span className="truncate">{lead.email}</span>
            </div>
          ) : null}
          {lead.phone ? (
            <div className="flex min-w-0 items-center gap-1.5 text-[length:var(--control-text-sm)] text-muted-foreground/90">
              <Phone className="size-3 shrink-0 opacity-60" aria-hidden />
              <span className="truncate">{lead.phone}</span>
            </div>
          ) : null}
        </div>
      ) : !contactLine ? (
        <div className="mt-1 text-xs text-muted-foreground/70">No contact yet</div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <PriorityChip priority={lead.priority} />
        {lead.owner?.fullName ? (
          <Avatar className="size-6 ring-2 ring-background" title={lead.owner.fullName}>
            <AvatarFallback className="bg-primary/12 text-[length:var(--control-text-sm)] font-semibold text-primary">
              {initials(lead.owner.fullName)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="text-[length:var(--control-text-sm)] text-muted-foreground/60">Unassigned</span>
        )}
      </div>
    </div>
  );
}

function ColumnDropPlaceholder({ stageName }: { stageName: string }) {
  return (
    <div
      className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/55 bg-primary/10 px-3 py-4 text-center"
      aria-hidden
    >
      <p className="text-[length:var(--control-text-sm)] font-semibold text-primary">Drop to move here</p>
      <p className="text-[length:var(--control-text-sm)] text-primary/80">{stageName}</p>
    </div>
  );
}

function DraggableLeadCard({
  lead,
  stageKey,
  stageName,
  dragging,
  onOpen,
}: {
  lead: PipelineLead;
  stageKey: string;
  stageName: string;
  dragging: boolean;
  onOpen?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { type: 'lead', lead, stageKey, stageName },
  });
  const suppressClickRef = useRef(false);
  const active = isDragging || dragging;

  useEffect(() => {
    if (isDragging) suppressClickRef.current = true;
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-label={`Lead ${lead.title}. Drag to change stage, click to open.`}
      aria-grabbed={active || undefined}
      className={cn(
        'rounded-xl border border-border/60 p-[var(--pad-card)] text-[length:var(--control-text)] glass',
        'cursor-grab touch-none select-none ring-offset-background',
        'transition-[box-shadow,border-color,opacity]',
        'hover:border-primary/25 hover:shadow-md active:cursor-grabbing',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Keep size stable — only fade. Floating clone is DragOverlay (portaled).
        active && 'cursor-grabbing border-dashed border-primary/40 bg-primary/5 opacity-40 shadow-none',
      )}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onOpen?.(lead.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.(lead.id);
        }
      }}
    >
      <LeadCardBody lead={lead} />
    </div>
  );
}

function ColumnDropZone({
  stageKey,
  title,
  count,
  loadedCount,
  accentClass,
  hasMore,
  loadingMore,
  onLoadMore,
  isOver,
  isDropTarget,
  children,
}: {
  stageKey: string;
  title: string;
  count: number;
  loadedCount: number;
  accentClass: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  isOver: boolean;
  isDropTarget: boolean;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: `column:${stageKey}`,
    data: { type: 'column', stageKey, stageName: title },
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = Boolean(loadingMore);
  }, [loadingMore]);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit && !loadingRef.current) onLoadMore();
      },
      { root, rootMargin: '80px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, stageKey]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl',
        'border border-border/60 glass-panel transition-[border-color,box-shadow,background-color]',
        isDropTarget && 'border-primary/50 bg-primary/5 ring-2 ring-inset ring-primary/20',
        isOver && !isDropTarget && 'border-primary/30',
      )}
    >
      <div className="flex shrink-0 items-center gap-[var(--field-gap)] px-[var(--control-px)] pb-[var(--field-gap)] pt-[var(--gap-section)]">
        <span className={cn('h-8 w-1 shrink-0 rounded-full', accentClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <strong
            className="block truncate text-[length:var(--control-text)] font-semibold text-foreground"
            title={title}
          >
            {title}
          </strong>
          <span className="text-[length:var(--control-text-sm)] text-muted-foreground">
            {isDropTarget
              ? 'Drop to move here'
              : count === 0
                ? 'Empty'
                : loadedCount < count
                  ? `${loadedCount} of ${count} leads`
                  : count === 1
                    ? '1 lead'
                    : `${count} leads`}
          </span>
        </div>
        <span className="flex size-[var(--control-h-sm)] shrink-0 items-center justify-center rounded-full bg-card text-[length:var(--control-text-sm)] font-semibold tabular-nums text-foreground shadow-sm ring-1 ring-border/60">
          {count}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-[var(--field-gap)] overflow-y-auto px-2.5 pb-[var(--gap-section)] pt-1 [scrollbar-gutter:stable]"
      >
        {children}
        {hasMore ? (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-[var(--gap-section)] text-[length:var(--control-text-sm)] text-muted-foreground"
          >
            {loadingMore ? 'Loading more…' : 'Scroll for more'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function findContainer(columns: PipelineColumnData[], id: string): string | undefined {
  if (id.startsWith('column:')) return id.replace('column:', '');
  for (const col of columns) {
    if (col.leads.some((l) => l.id === id)) return col.stage.key;
  }
  return undefined;
}

/** Prefer column droppables under the pointer so stage targets stay clear. */
const pipelineCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const columnHit = pointerHits.find((c) => String(c.id).startsWith('column:'));
  if (columnHit) return [columnHit];
  if (pointerHits.length) return pointerHits;
  return closestCorners(args);
};

export function PipelineBoard({
  columns: initialColumns,
  onMove,
  onOpen,
  onLoadMore,
  loadingMoreByStage,
  className,
}: {
  columns: PipelineColumnData[];
  onMove: (args: {
    leadId: string;
    fromStageKey: string;
    toStageKey: string;
  }) => void | Promise<void>;
  onOpen?: (leadId: string) => void;
  onLoadMore?: (stageKey: string) => void | Promise<void>;
  loadingMoreByStage?: Record<string, boolean>;
  className?: string;
}) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeLead, setActiveLead] = useState<PipelineLead | null>(null);
  const [fromStageKey, setFromStageKey] = useState<string | null>(null);
  const [fromStageName, setFromStageName] = useState<string | null>(null);
  const [overStageKey, setOverStageKey] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const columnsRef = useRef(columns);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Small move before drag starts so a plain click still opens the lead.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const stageNameByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const col of columns) map[col.stage.key] = col.stage.name;
    return map;
  }, [columns]);

  const overStageName = overStageKey ? stageNameByKey[overStageKey] : null;
  const willChangeStage = Boolean(
    activeLead && overStageKey && fromStageKey && overStageKey !== fromStageKey,
  );

  function resetDragUi() {
    setActiveLead(null);
    setFromStageKey(null);
    setFromStageName(null);
    setOverStageKey(null);
  }

  function onDragStart(event: DragStartEvent) {
    const leadId = String(event.active.id);
    const data = event.active.data.current as
      | { lead?: PipelineLead; stageKey?: string; stageName?: string }
      | undefined;
    const lead =
      data?.lead ?? columns.flatMap((c) => c.leads).find((l) => l.id === leadId) ?? null;
    const stageKey = data?.stageKey ?? findContainer(columns, leadId) ?? null;
    setActiveLead(lead);
    setFromStageKey(stageKey);
    setFromStageName(data?.stageName ?? (stageKey ? stageNameByKey[stageKey] ?? null : null));
    setOverStageKey(stageKey);
  }

  function onDragOver(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) {
      setOverStageKey(null);
      return;
    }
    const stageKey =
      (event.over?.data.current as { stageKey?: string } | undefined)?.stageKey ??
      findContainer(columnsRef.current, overId) ??
      null;
    setOverStageKey(stageKey);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const leadId = String(active.id);
    const origin = fromStageKey;
    const destination =
      (over?.data.current as { stageKey?: string } | undefined)?.stageKey ??
      (over ? findContainer(columnsRef.current, String(over.id)) : null);

    resetDragUi();

    if (!over || !origin || !destination || origin === destination) return;

    const snapshot = columnsRef.current;
    const fromCol = snapshot.find((c) => c.stage.key === origin);
    const lead = fromCol?.leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Optimistic: append to target stage (order within stage is not persisted).
    setColumns((prev) =>
      prev.map((col) => {
        if (col.stage.key === origin) {
          return {
            ...col,
            leads: col.leads.filter((l) => l.id !== leadId),
            total: col.total != null ? Math.max(0, col.total - 1) : col.total,
          };
        }
        if (col.stage.key === destination) {
          if (col.leads.some((l) => l.id === leadId)) return col;
          return {
            ...col,
            leads: [...col.leads, lead],
            total: col.total != null ? col.total + 1 : col.total,
          };
        }
        return col;
      }),
    );

    setMoving(true);
    try {
      await onMove({ leadId, fromStageKey: origin, toStageKey: destination });
    } catch {
      setColumns(snapshot);
    } finally {
      setMoving(false);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pipelineCollision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        resetDragUi();
        setColumns(initialColumns);
      }}
    >
      <div
        className={cn(
          'flex h-full min-h-0 gap-[var(--gap-section)] overflow-x-auto overflow-y-hidden',
          'scroll-smooth pb-1 [scrollbar-gutter:stable]',
          moving && 'pointer-events-none opacity-90',
          className,
        )}
        aria-busy={moving || undefined}
      >
        {columns.map((col, index) => {
          const isDropTarget = Boolean(
            activeLead && overStageKey === col.stage.key && fromStageKey !== col.stage.key,
          );
          return (
            <div key={col.stage.id} className="h-full shrink-0 snap-start">
              <ColumnDropZone
                stageKey={col.stage.key}
                title={col.stage.name}
                count={col.total ?? col.leads.length}
                loadedCount={col.leads.length}
                accentClass={STAGE_ACCENTS[index % STAGE_ACCENTS.length]!}
                hasMore={Boolean(col.hasMore)}
                loadingMore={Boolean(loadingMoreByStage?.[col.stage.key])}
                onLoadMore={onLoadMore ? () => onLoadMore(col.stage.key) : undefined}
                isOver={overStageKey === col.stage.key && Boolean(activeLead)}
                isDropTarget={isDropTarget}
              >
                {isDropTarget ? <ColumnDropPlaceholder stageName={col.stage.name} /> : null}
                {col.leads.length === 0 && !isDropTarget ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-[var(--control-px)] py-8 text-center">
                    <div className="mb-[var(--field-gap)] size-[var(--control-h)] rounded-full border border-dashed border-border/80 bg-card/60" />
                    <p className="text-[length:var(--control-text-sm)] font-medium text-muted-foreground">
                      Drop a lead here
                    </p>
                    <p className="mt-0.5 text-[length:var(--control-text-sm)] text-muted-foreground/70">
                      Click and drag a lead here
                    </p>
                  </div>
                ) : (
                  col.leads.map((lead) => (
                    <DraggableLeadCard
                      key={lead.id}
                      lead={lead}
                      stageKey={col.stage.key}
                      stageName={col.stage.name}
                      dragging={activeLead?.id === lead.id}
                      onOpen={onOpen}
                    />
                  ))
                )}
              </ColumnDropZone>
            </div>
          );
        })}
      </div>

      {/*
        Portal to body: app-shell-main uses transform/contain, which makes
        position:fixed relative to the shell — while dnd-kit measures in
        viewport coords. Without a portal the overlay drifts far from the cursor.
      */}
      {createPortal(
        <DragOverlay dropAnimation={null} zIndex={500}>
          {activeLead ? (
            <div className="pointer-events-none w-[256px] cursor-grabbing">
              <div className="rounded-xl border border-primary/40 bg-card p-[var(--pad-card)] text-[length:var(--control-text)] shadow-2xl ring-2 ring-primary/25">
                <LeadCardBody lead={activeLead} />
              </div>
              <div
                className={cn(
                  'mt-2 flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[length:var(--control-text-sm)] font-medium shadow-lg',
                  willChangeStage && overStageName
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border/60 bg-card text-muted-foreground',
                )}
              >
                {willChangeStage && overStageName ? (
                  <>
                    <span className="truncate opacity-90">{fromStageName}</span>
                    <ArrowRight className="size-3.5 shrink-0 opacity-80" aria-hidden />
                    <span className="truncate">{overStageName}</span>
                  </>
                ) : (
                  <span>Drop on a stage column</span>
                )}
              </div>
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/** Legacy presentational exports kept for compatibility */
export function KanbanBoard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-[var(--gap-section)] overflow-x-auto pb-2', className)}>{children}</div>
  );
}

export function KanbanColumn({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-[220px] flex-1 rounded-xl border border-border/60 p-[var(--pad-card)] glass-panel',
        className,
      )}
    >
      <div className="mb-[var(--field-gap)] flex items-center justify-between gap-[var(--field-gap)]">
        <strong className="text-[length:var(--control-text)]">{title}</strong>
        {count}
      </div>
      <div className="flex flex-col gap-[var(--field-gap)]">{children}</div>
    </div>
  );
}

export function KanbanCard({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-lg bg-accent/80 p-3 text-sm transition-colors hover:bg-accent',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
