import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import {
  AlarmClock,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckSquare,
  Flag,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  Button,
  Combobox,
  DataTable,
  DatePicker,
  DateRangeFilter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityCombobox,
  FormGrid,
  Input,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  StorageKeys,
  cn,
  formatDate,
  humanizeEntityType,
  localStorageKit,
  toastError,
  toastSuccess,
  usePageChrome,
  type ComboboxOption,
  type DateRangeValue,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { useAuth } from '../auth';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';
import { TASKS_PAGE_COPY, useTasksPageVariant } from '../lib/agencyPageVariants';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { rateTipActivationTaskHref } from '../lib/rateTipActivationTaskHref';
import {
  parseTasksQueryState,
  patchTasksQueryParams,
  tasksApiQueryFromState,
  tasksQueryHasFilters,
  type TasksDuePreset,
} from '../lib/queue';
import {
  ActiveFilterChips,
  AttentionPresets,
  DisplayMenu,
  FilterMenu,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
} from '../components/queue';

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueAt?: string | null;
  assigneeId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

const emptyForm = {
  title: '',
  priority: 'normal',
  dueAt: undefined as Date | undefined,
  entityType: '',
  entityId: '',
  entityLabel: '',
};

function isOverdue(task: Task) {
  if (!task.dueAt || task.status === 'done') return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

function isDueToday(task: Task) {
  if (!task.dueAt || task.status === 'done') return false;
  const due = new Date(task.dueAt);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

function entityPath(
  type?: string | null,
  id?: string | null,
  description?: string | null,
) {
  if (!type || !id) return null;
  if (type === 'lead') return `/leads/${id}`;
  if (type === 'inquiry') return `/inquiries`;
  if (type === 'trip') return `/trips/${id}`;
  return rateTipActivationTaskHref(type, description);
}

function readTasksColumnVisibility(): VisibilityState {
  const defaults: VisibilityState = {};
  const stored = localStorageKit.getJson<VisibilityState>(StorageKeys.tasks.columns, {
    version: 1,
  });
  if (!stored || typeof stored !== 'object') return defaults;
  return { ...defaults, ...stored };
}

export function TasksPage() {
  const variant = useTasksPageVariant();
  const copy = TASKS_PAGE_COPY[variant];
  const { toOrgPath } = useOrgNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useDocumentTitle(copy.documentTitle);
  const { me } = useAuth();
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.taskWrite);
  const query = useMemo(() => parseTasksQueryState(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    readTasksColumnVisibility(),
  );
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function applyQuery(patch: Parameters<typeof patchTasksQueryParams>[1]) {
    setSearchParams(patchTasksQueryParams(searchParams, patch), { replace: true });
  }

  // Follow-ups is an overdue-scoped smart list by default; `due=all` opts out explicitly.
  const impliedOverdue = variant === 'follow-ups' && !query.due && !query.dueFrom && !query.dueTo;
  const effectiveDue: TasksDuePreset | undefined =
    query.due === 'all' ? undefined : query.due ?? (impliedOverdue ? 'overdue' : undefined);

  const dueRange: DateRangeValue = {
    from: query.dueFrom ?? null,
    to: query.dueTo ?? null,
    presetId: query.duePeriod ?? null,
  };

  function onDueRangeChange(next: DateRangeValue) {
    applyQuery({
      due: undefined,
      dueFrom: next.from,
      dueTo: next.to,
      duePeriod: next.presetId,
    });
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

  async function load() {
    setLoading(true);
    try {
      const qs = tasksApiQueryFromState({ ...query, due: effectiveDue });
      setItems(await api<Task[]>(`/tasks${qs ? `?${qs}` : ''}`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when queue URL changes
  }, [variant, effectiveDue, query.dueFrom, query.dueTo]);

  async function searchEntities(q: string): Promise<ComboboxOption[]> {
    if (form.entityType === 'lead') {
      const res = await api<{ items: Array<{ id: string; title: string; contactName?: string }> }>(
        `/leads?pageSize=20&q=${encodeURIComponent(q)}`,
      );
      return res.items.map((l) => ({
        value: l.id,
        label: l.title,
        description: l.contactName || undefined,
      }));
    }
    if (form.entityType === 'inquiry') {
      const res = await api<{
        items: Array<{ id: string; inquiryNumber: string; party?: { displayName?: string } }>;
      }>(`/inquiries?pageSize=20&q=${encodeURIComponent(q)}`);
      return res.items.map((i) => ({
        value: i.id,
        label: i.inquiryNumber,
        description: i.party?.displayName,
      }));
    }
    if (form.entityType === 'trip') {
      const res = await api<{ items: Array<{ id: string; tripNumber: string; title: string }> }>(
        `/trips?pageSize=20&q=${encodeURIComponent(q)}`,
      );
      return res.items.map((t) => ({
        value: t.id,
        label: `${t.tripNumber} · ${t.title}`,
      }));
    }
    return [];
  }

  async function onCreate() {
    setSubmitting(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          priority: form.priority,
          dueAt: form.dueAt?.toISOString(),
          entityType: form.entityType || undefined,
          entityId: form.entityId || undefined,
        }),
      });
      toastSuccess('Task created');
      setForm(emptyForm);
      setOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create task');
    } finally {
      setSubmitting(false);
    }
  }

  async function complete(id: string) {
    try {
      await api(`/tasks/${id}/complete`, { method: 'POST' });
      toastSuccess('Task completed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not complete task');
    }
  }

  const tableRows = useMemo(() => {
    const q = query.q?.trim().toLowerCase();
    return items.filter((task) => {
      if (query.status && task.status !== query.status) return false;
      if (query.priority && task.priority !== query.priority) return false;
      if (query.mine && task.assigneeId !== me?.id) return false;
      if (!q) return true;
      return task.title.toLowerCase().includes(q);
    });
  }, [items, query.status, query.priority, query.mine, query.q, me?.id]);

  function toggleColumn(id: string, visible: boolean) {
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      localStorageKit.setJson(StorageKeys.tasks.columns, next, { version: 1 });
      return next;
    });
  }

  function clearTaskFilters() {
    applyQuery({ clearFilters: true });
  }

  function clearTaskFiltersAndSearch() {
    setSearchDraft('');
    applyQuery({ clearFilters: true, q: '' });
  }

  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Task',
        meta: { label: 'Task' },
        enableHiding: false,
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-primary">{row.original.title}</span>
            {isOverdue(row.original) ? (
              <span className="shrink-0 text-[10px] font-semibold text-destructive">Overdue</span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Status',
        meta: { label: 'Status' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        id: 'priority',
        accessorFn: (r) => r.priority,
        header: 'Priority',
        meta: { label: 'Priority' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => <StatusBadge value={row.original.priority} />,
      },
      {
        id: 'due',
        header: 'Due',
        meta: { label: 'Due' },
        size: 120,
        minSize: 100,
        accessorFn: (r) => (isOverdue(r) ? 'overdue' : r.dueAt ? 'upcoming' : 'none'),
        cell: ({ row }) =>
          row.original.dueAt ? (
            <span
              className={
                isOverdue(row.original)
                  ? 'font-medium tabular-nums text-destructive'
                  : 'tabular-nums text-muted-foreground'
              }
            >
              {formatDate(row.original.dueAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'link',
        header: 'Linked',
        meta: { label: 'Linked' },
        size: 130,
        minSize: 100,
        accessorFn: (r) => r.entityType || '',
        cell: ({ row }) => {
          const t = row.original;
          if (!t.entityType) return <span className="text-muted-foreground">—</span>;
          const href = entityPath(t.entityType, t.entityId, t.description);
          const label = humanizeEntityType(t.entityType);
          if (href && t.entityId) {
            return (
              <Link className="font-medium text-primary hover:underline" to={href}>
                {label}
              </Link>
            );
          }
          return <span className="text-muted-foreground">{label}</span>;
        },
      },
      {
        id: 'actions',
        header: '',
        size: 44,
        minSize: 44,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const task = row.original;
          const href = entityPath(task.entityType, task.entityId, task.description);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Task actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {task.title}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canWrite && task.status !== 'done' ? (
                  <DropdownMenuItem onClick={() => void complete(task.id)}>
                    <Check />
                    Complete
                  </DropdownMenuItem>
                ) : null}
                {href ? (
                  <DropdownMenuItem asChild>
                    <Link to={href}>
                      <ArrowUpRight />
                      Open linked
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {task.status === 'done' && !href ? (
                  <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [canWrite],
  );

  if (searchParams.get('due') === 'overdue' && variant === 'all') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.workFollowUps)} replace />;
  }

  const overdueCount = items.filter(isOverdue).length;
  const dueTodayCount = items.filter(isDueToday).length;
  const mineCount = items.filter((t) => t.assigneeId === me?.id && t.status !== 'done').length;

  const attentionPresets = [
    {
      id: 'overdue',
      label: 'overdue',
      count: overdueCount,
      active: effectiveDue === 'overdue',
      tone: 'danger' as const,
      onClick: () =>
        applyQuery({
          due: effectiveDue === 'overdue' ? (variant === 'follow-ups' ? 'all' : undefined) : 'overdue',
        }),
    },
    {
      id: 'today',
      label: 'due today',
      count: dueTodayCount,
      active: effectiveDue === 'today',
      tone: 'warn' as const,
      onClick: () => applyQuery({ due: effectiveDue === 'today' ? undefined : 'today' }),
    },
    {
      id: 'mine',
      label: 'mine',
      count: mineCount,
      active: Boolean(query.mine),
      tone: 'info' as const,
      onClick: () => applyQuery({ mine: query.mine ? undefined : true }),
    },
  ];

  const filterDefs = [
    {
      id: 'status',
      label: 'Status',
      value: query.status ?? null,
      options: [
        { value: 'open', label: 'Open' },
        { value: 'pending', label: 'Pending' },
        { value: 'done', label: 'Done' },
      ],
      onSelect: (value: string | null) => applyQuery({ status: value || undefined }),
    },
    {
      id: 'priority',
      label: 'Priority',
      icon: Flag,
      value: query.priority ?? null,
      options: [
        { value: 'low', label: 'Low' },
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'High' },
      ],
      onSelect: (value: string | null) => applyQuery({ priority: value || undefined }),
    },
  ];

  const displayColumns = [
    { id: 'status', label: 'Status', visible: columnVisibility.status !== false },
    { id: 'priority', label: 'Priority', visible: columnVisibility.priority !== false, icon: Flag },
    { id: 'due', label: 'Due', visible: columnVisibility.due !== false, icon: CalendarClock },
    { id: 'link', label: 'Linked', visible: columnVisibility.link !== false },
  ];

  const filterChips = [
    effectiveDue === 'overdue'
      ? { id: 'due-overdue', label: 'Overdue', onRemove: () => applyQuery({ due: variant === 'follow-ups' ? 'all' : undefined }) }
      : null,
    effectiveDue === 'today'
      ? { id: 'due-today', label: 'Due today', onRemove: () => applyQuery({ due: undefined }) }
      : null,
    query.mine
      ? { id: 'mine', label: 'Mine', onRemove: () => applyQuery({ mine: undefined }) }
      : null,
    query.status
      ? {
          id: 'status',
          label: `Status: ${filterDefs[0]!.options.find((o) => o.value === query.status)?.label ?? query.status}`,
          onRemove: () => applyQuery({ status: undefined }),
        }
      : null,
    query.priority
      ? {
          id: 'priority',
          label: `Priority: ${filterDefs[1]!.options.find((o) => o.value === query.priority)?.label ?? query.priority}`,
          onRemove: () => applyQuery({ priority: undefined }),
        }
      : null,
    query.dueFrom || query.dueTo
      ? {
          id: 'due-range',
          label: 'Due range',
          onRemove: () => applyQuery({ dueFrom: null, dueTo: null, duePeriod: null }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const pageSubtitle = query.mine
    ? effectiveDue === 'overdue'
      ? 'Your overdue tasks and follow-ups.'
      : 'Tasks assigned to you.'
    : effectiveDue === 'today'
      ? 'Tasks due today.'
      : copy.subtitle;

  usePageChrome({ title: copy.title, subtitle: pageSubtitle });

  const queueToolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search tasks…"
          className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
          aria-label="Search tasks"
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
          dimensionLabel="Due"
          value={dueRange}
          onChange={onDueRangeChange}
          emptyLabel={variant === 'follow-ups' ? 'Overdue only' : 'Any due date'}
          data-testid="tasks-due-range"
        />
        <FilterMenu filters={filterDefs} />
        <DisplayMenu columns={displayColumns} onToggleColumn={toggleColumn} />
      </div>
    </div>
  );

  return (
    <QueuePageChrome
      attention={<AttentionPresets presets={attentionPresets} />}
      primaryActions={
        <Can anyOf={CAP.taskWrite}>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-[0.875em]" />
            New task
          </Button>
        </Can>
      }
      error={error ? <p className="text-sm text-destructive">{error}</p> : null}
      toolbar={queueToolbar}
      chips={
        <ActiveFilterChips
          chips={filterChips}
          onClear={tasksQueryHasFilters(query) ? clearTaskFilters : undefined}
        />
      }
    >
      <DataTable
        key={`cols-${JSON.stringify(columnVisibility)}`}
        columns={columns}
        data={tableRows}
        loading={loading}
        pageSize={25}
        showSearch={false}
        showColumnsMenu={false}
        columnVisibilityKey={StorageKeys.tasks.columns}
        defaultColumnVisibility={columnVisibility}
        emptyTitle={tasksQueryHasFilters(query) || query.q ? 'No matching tasks' : 'No tasks'}
        emptyDescription={
          tasksQueryHasFilters(query) || query.q
            ? 'Try clearing filters or search.'
            : variant === 'follow-ups'
              ? 'You are caught up on follow-ups.'
              : 'Add a follow-up so nothing slips.'
        }
        emptyIcon={variant === 'follow-ups' ? AlarmClock : CheckSquare}
        emptyAction={
          tasksQueryHasFilters(query) || query.q ? (
            <Button type="button" size="sm" variant="outline" onClick={clearTaskFiltersAndSearch}>
              Clear filters
            </Button>
          ) : (
            <Can anyOf={CAP.taskWrite}>
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                New task
              </Button>
            </Can>
          )
        }
      />

      <Can anyOf={CAP.taskWrite}>
        <Button
          className="fixed bottom-5 right-5 z-20 shadow-lg sm:hidden"
          size="lg"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" />
          New task
        </Button>
      </Can>

      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title="New task"
        submitLabel="Add task"
        submitting={submitting}
        onSubmit={onCreate}
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onCreate();
          }}
        >
          <FormField label="Task" required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Call customer about dates"
              required
            />
          </FormField>
          <FormGrid>
            <FormField label="Priority" htmlFor="task-priority">
              <Combobox
                value={form.priority}
                onChange={(priority) => setForm({ ...form, priority })}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </FormField>
            <FormField label="Due date" htmlFor="task-due">
              <DatePicker
                value={form.dueAt}
                onChange={(dueAt) => setForm({ ...form, dueAt })}
                disablePast
              />
            </FormField>
          </FormGrid>
          <FormField label="Link to" htmlFor="task-link-type">
            <Combobox
              value={form.entityType || 'none'}
              onChange={(entityType) =>
                setForm({
                  ...form,
                  entityType: entityType === 'none' ? '' : entityType,
                  entityId: '',
                  entityLabel: '',
                })
              }
              options={[
                { value: 'none', label: 'No link' },
                { value: 'lead', label: 'Lead' },
                { value: 'inquiry', label: 'Inquiry' },
                { value: 'trip', label: 'Trip' },
              ]}
            />
          </FormField>
          {form.entityType ? (
            <FormField
              label={humanizeEntityType(form.entityType)}
              required
              htmlFor="task-entity"
            >
              <EntityCombobox
                value={form.entityId}
                selectedLabel={form.entityLabel}
                onChange={(entityId, option) =>
                  setForm({ ...form, entityId, entityLabel: option?.label || '' })
                }
                onSearch={searchEntities}
                placeholder={`Search ${humanizeEntityType(form.entityType).toLowerCase()}s…`}
              />
            </FormField>
          ) : null}
        </form>
      </RecordSheet>
    </QueuePageChrome>
  );
}
