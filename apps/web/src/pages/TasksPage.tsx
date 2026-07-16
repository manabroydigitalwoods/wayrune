import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, Check, CheckSquare, MoreHorizontal, Plus } from 'lucide-react';
import {
  Button,
  Combobox,
  DataTable,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityCombobox,
  FormGrid,
  humanizeEntityType,
  Input,
  ListPageShell,
  PageHeader,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  StorageKeys,
  formatDate,
  toastError,
  toastSuccess,
  type ComboboxOption,
} from '@travel/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';
import { TASKS_PAGE_COPY, useTasksPageVariant } from '../lib/agencyPageVariants';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: string | null;
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

function entityPath(type?: string | null, id?: string | null) {
  if (!type || !id) return null;
  if (type === 'lead') return `/leads/${id}`;
  if (type === 'inquiry') return `/inquiries`;
  if (type === 'trip') return `/trips/${id}`;
  return null;
}

export function TasksPage() {
  const variant = useTasksPageVariant();
  const copy = TASKS_PAGE_COPY[variant];
  const [searchParams] = useSearchParams();
  useDocumentTitle(copy.documentTitle);
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.taskWrite);
  const dueFilter = variant === 'follow-ups' ? 'overdue' : null;
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try {
      setItems(await api<Task[]>('/tasks'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
          const href = entityPath(t.entityType, t.entityId);
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
          const href = entityPath(task.entityType, task.entityId);
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
    return <Navigate to={AGENCY_ROUTES.workFollowUps} replace />;
  }

  return (
    <ListPageShell>
      <PageHeader
        icon={CheckSquare}
        title={copy.title}
        subtitle={copy.subtitle}
        className="mb-4 shrink-0"
        actions={
          <Can anyOf={CAP.taskWrite}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              New task
            </Button>
          </Can>
        }
      />
      <DataTable
        key={dueFilter === 'overdue' ? 'due-overdue' : 'due-all'}
        columns={columns}
        data={items}
        loading={loading}
        error={error}
        pageSize={25}
        searchKey="title"
        searchPlaceholder="Search tasks…"
        columnVisibilityKey={StorageKeys.tasks.columns}
        defaultFacetValues={dueFilter === 'overdue' ? { due: 'overdue' } : undefined}
        facets={[
          {
            id: 'status',
            columnId: 'status',
            label: 'Status',
            options: [
              { value: 'open', label: 'Open' },
              { value: 'done', label: 'Done' },
              { value: 'pending', label: 'Pending' },
            ],
          },
          {
            id: 'priority',
            columnId: 'priority',
            label: 'Priority',
            options: [
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
            ],
          },
          {
            id: 'due',
            columnId: 'due',
            label: 'Due',
            options: [
              { value: 'overdue', label: 'Overdue' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'none', label: 'No due date' },
            ],
          },
        ]}
        emptyTitle={dueFilter === 'overdue' ? 'No overdue tasks' : 'No tasks'}
        emptyDescription={
          dueFilter === 'overdue'
            ? 'You are caught up on follow-ups.'
            : 'Add a follow-up so nothing slips.'
        }
        emptyIcon={CheckSquare}
        emptyAction={
          <Can anyOf={CAP.taskWrite}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              New task
            </Button>
          </Can>
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
              placeholder="e.g. Call client about dates"
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
              <DatePicker value={form.dueAt} onChange={(dueAt) => setForm({ ...form, dueAt })} />
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
    </ListPageShell>
  );
}
