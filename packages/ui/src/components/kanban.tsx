import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Mail, Phone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
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
  const detailBits = [lead.email, lead.phone].filter(Boolean) as string[];

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
      {detailBits.length ? (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {lead.email ? (
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground/90">
              <Mail className="size-3 shrink-0 opacity-60" aria-hidden />
              <span className="truncate">{lead.email}</span>
            </div>
          ) : null}
          {lead.phone ? (
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground/90">
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
            <AvatarFallback className="bg-primary/12 text-[10px] font-semibold text-primary">
              {initials(lead.owner.fullName)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">Unassigned</span>
        )}
      </div>
    </div>
  );
}

function SortableLeadCard({
  lead,
  onOpen,
}: {
  lead: PipelineLead;
  onOpen?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: 'lead', lead },
  });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (isDragging) suppressClickRef.current = true;
  }, [isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Lead ${lead.title}. Drag to change stage, click to open.`}
      className={cn(
        'rounded-xl border border-border/60 p-3 text-sm glass',
        'cursor-grab touch-none select-none ring-offset-background transition-all',
        'hover:-translate-y-px hover:border-primary/25 hover:shadow-md active:cursor-grabbing',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging && 'opacity-30 shadow-none',
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
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${stageKey}`,
    data: { type: 'column', stageKey },
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
        'border border-border/60 glass-panel',
        isOver && 'border-primary/40 ring-2 ring-inset ring-primary/15',
      )}
    >
      <div className="flex shrink-0 items-center gap-2.5 px-3 pb-2 pt-3">
        <span className={cn('h-8 w-1 shrink-0 rounded-full', accentClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-semibold text-foreground" title={title}>
            {title}
          </strong>
          <span className="text-[11px] text-muted-foreground">
            {count === 0
              ? 'Empty'
              : loadedCount < count
                ? `${loadedCount} of ${count} leads`
                : count === 1
                  ? '1 lead'
                  : `${count} leads`}
          </span>
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold tabular-nums text-foreground shadow-sm ring-1 ring-border/60">
          {count}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-3 pt-1"
      >
        {children}
        {hasMore ? (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-3 text-[11px] text-muted-foreground"
          >
            {loadingMore ? 'Loading more…' : 'Scroll for more'}
          </div>
        ) : loadedCount > 0 && count > loadedCount ? null : null}
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
  const columnsRef = useRef(columns);
  const dragFromRef = useRef<string | null>(null);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const leadIdsByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      map[col.stage.key] = col.leads.map((l) => l.id);
    }
    return map;
  }, [columns]);

  function onDragStart(event: DragStartEvent) {
    const leadId = String(event.active.id);
    const lead = columns.flatMap((c) => c.leads).find((l) => l.id === leadId);
    dragFromRef.current = findContainer(columns, leadId) ?? null;
    setActiveLead(lead ?? null);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setColumns((prev) => {
      const from = findContainer(prev, activeId);
      const to = findContainer(prev, overId);
      if (!from || !to || from === to) return prev;
      const fromCol = prev.find((c) => c.stage.key === from);
      const toCol = prev.find((c) => c.stage.key === to);
      if (!fromCol || !toCol) return prev;
      const lead = fromCol.leads.find((l) => l.id === activeId);
      if (!lead) return prev;

      const overIndex = toCol.leads.findIndex((l) => l.id === overId);
      const insertAt = overIndex >= 0 ? overIndex : toCol.leads.length;

      return prev.map((col) => {
        if (col.stage.key === from) {
          return {
            ...col,
            leads: col.leads.filter((l) => l.id !== activeId),
            total: col.total != null ? Math.max(0, col.total - 1) : col.total,
          };
        }
        if (col.stage.key === to) {
          const next = col.leads.filter((l) => l.id !== activeId);
          next.splice(insertAt, 0, lead);
          return {
            ...col,
            leads: next,
            total: col.total != null ? col.total + 1 : col.total,
          };
        }
        return col;
      });
    });
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveLead(null);
    const fromStageKey = dragFromRef.current;
    dragFromRef.current = null;
    if (!over || !fromStageKey) return;

    const leadId = String(active.id);
    const overId = String(over.id);
    const latest = columnsRef.current;
    const toStageKey = findContainer(latest, overId) ?? findContainer(latest, leadId);
    if (!toStageKey || fromStageKey === toStageKey) return;

    try {
      await onMove({ leadId, fromStageKey, toStageKey });
    } catch {
      setColumns(initialColumns);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveLead(null);
        setColumns(initialColumns);
      }}
    >
      <div
        className={cn(
          'flex h-full min-h-0 gap-3.5 overflow-x-auto overflow-y-hidden',
          'scroll-smooth pb-1 [scrollbar-gutter:stable]',
          className,
        )}
      >
        {columns.map((col, index) => (
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
            >
              <SortableContext
                id={col.stage.key}
                items={leadIdsByColumn[col.stage.key] || []}
                strategy={verticalListSortingStrategy}
              >
                {col.leads.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl px-3 py-8 text-center">
                    <div className="mb-2 size-8 rounded-full border border-dashed border-border/80 bg-card/60" />
                    <p className="text-xs font-medium text-muted-foreground">Drop a lead here</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">Drag from another stage</p>
                  </div>
                ) : (
                  col.leads.map((lead) => (
                    <SortableLeadCard key={lead.id} lead={lead} onOpen={onOpen} />
                  ))
                )}
              </SortableContext>
            </ColumnDropZone>
          </div>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeLead ? (
          <div className="w-[264px] cursor-grabbing rounded-xl border border-primary/35 p-3 text-sm shadow-2xl ring-2 ring-primary/15 glass-strong">
            <LeadCardBody lead={activeLead} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Legacy presentational exports kept for compatibility */
export function KanbanBoard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex gap-3 overflow-x-auto pb-2', className)}>{children}</div>;
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
        'min-w-[220px] flex-1 rounded-xl border border-border/60 p-3 glass-panel',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="text-sm">{title}</strong>
        {count}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
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
