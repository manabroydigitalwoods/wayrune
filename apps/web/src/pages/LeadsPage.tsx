import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowUpRight,
  Copy,
  FilePlus2,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { CreateLeadSchema, parseWithFieldErrors } from '@wayrune/contracts';
import {
  Button,
  DataTable,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmailInput,
  Input,
  ListPageShell,
  PageHeader,
  PhoneInput,
  PipelineBoard,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
  StorageKeys,
  LegacyStorageKeys,
  localStorageKit,
  RecordDialog,
  type PipelineColumnData,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useCanonicalCreateVisibility } from '../hooks/useCanonicalCreateVisibility';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { LEADS_PAGE_COPY } from '../lib/agencyPageVariants';

type LeadRow = {
  id: string;
  title: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  priority: string;
  partyId?: string | null;
  party?: { id: string; displayName?: string } | null;
  stage?: { id: string; name: string; key: string };
  source?: { name?: string } | null;
  owner?: { fullName?: string } | null;
};

type Board = {
  columns: PipelineColumnData[];
};

const BOARD_PAGE_SIZE = 10;

const TITLE_SUGGESTIONS = [
  { value: 'Honeymoon trip', label: 'Honeymoon' },
  { value: 'Family holiday', label: 'Family' },
  { value: 'Weekend getaway', label: 'Weekend' },
  { value: 'Goa package', label: 'Goa' },
  { value: 'Kerala package', label: 'Kerala' },
  { value: 'Corporate travel', label: 'Corporate' },
  { value: 'International tour', label: 'International' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'website', label: 'Website' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'csv', label: 'CSV Import' },
  { value: 'referral', label: 'Referral' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'existing_customer', label: 'Existing customer' },
  { value: 'unknown', label: 'Unknown' },
];

const FOLLOW_UP_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'in_3_days', label: 'In 3 days' },
  { value: 'next_week', label: 'Next week' },
];

function startOfLocalDay(d = new Date()) {
  const next = new Date(d);
  next.setHours(9, 0, 0, 0);
  return next;
}

function followUpFromPreset(preset: string): Date | undefined {
  const base = startOfLocalDay();
  if (preset === 'today') return base;
  if (preset === 'tomorrow') {
    base.setDate(base.getDate() + 1);
    return base;
  }
  if (preset === 'in_3_days') {
    base.setDate(base.getDate() + 3);
    return base;
  }
  if (preset === 'next_week') {
    base.setDate(base.getDate() + 7);
    return base;
  }
  return undefined;
}

function presetFromFollowUp(date?: Date): string {
  if (!date) return '';
  for (const preset of FOLLOW_UP_PRESETS) {
    const candidate = followUpFromPreset(preset.value);
    if (
      candidate &&
      candidate.getFullYear() === date.getFullYear() &&
      candidate.getMonth() === date.getMonth() &&
      candidate.getDate() === date.getDate()
    ) {
      return preset.value;
    }
  }
  return 'custom';
}

const emptyForm = {
  title: '',
  contactName: '',
  email: '',
  phone: '',
  priority: 'normal',
  sourceKey: 'manual',
  campaignId: '' as string,
  followUpAt: undefined as Date | undefined,
};

function readLeadsView(): 'board' | 'table' {
  localStorageKit.migrateFrom(LegacyStorageKeys.leadsView, StorageKeys.leads.view);
  const stored = localStorageKit.getItem(StorageKeys.leads.view);
  if (stored === 'board' || stored === 'table') return stored;
  return 'board';
}

function writeLeadsView(view: 'board' | 'table') {
  localStorageKit.setItem(StorageKeys.leads.view, view);
}

export function LeadsPage() {
  const copy = LEADS_PAGE_COPY;
  useDocumentTitle(copy.documentTitle);
  const { navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canLeadWrite = hasAny(CAP.leadWrite);
  const showNewLead = useCanonicalCreateVisibility('lead');
  const [searchParams] = useSearchParams();
  const stageFromUrl = searchParams.get('stage') || undefined;
  const [view, setView] = useState<'board' | 'table'>(() =>
    stageFromUrl ? 'table' : readLeadsView(),
  );
  const [board, setBoard] = useState<Board | null>(null);
  const boardRef = useRef(board);
  const [items, setItems] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreByStage, setLoadingMoreByStage] = useState<Record<string, boolean>>({});
  const loadingMoreRef = useRef<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingMove, setPendingMove] = useState<{
    leadId: string;
    fromStageKey: string;
    toStageKey: string;
  } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState(
    'title,contactName,email,phone\nGoa enquiry,Priya,priya@example.com,9876543210',
  );
  const [importing, setImporting] = useState(false);
  const [sourceOptions, setSourceOptions] = useState(SOURCE_OPTIONS);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    loadingMoreRef.current = loadingMoreByStage;
  }, [loadingMoreByStage]);

  function changeView(next: 'board' | 'table') {
    setView(next);
    writeLeadsView(next);
  }

  function patchForm(patch: Partial<typeof emptyForm>) {
    setForm((f) => ({ ...f, ...patch }));
    setFieldErrors((errs) => {
      const next = { ...errs };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  }

  async function load() {
    setLoading(true);
    try {
      const [boardRes, listRes, sourcesRes, campaignsRes] = await Promise.all([
        api<Board>(`/leads/board?pageSize=${BOARD_PAGE_SIZE}`),
        api<{ items: LeadRow[] }>('/leads?pageSize=100'),
        api<Array<{ key: string; name: string; isActive: boolean }>>('/lead-sources').catch(
          () => [],
        ),
        api<Array<{ id: string; name: string }>>('/campaigns').catch(() => []),
      ]);
      setBoard(boardRes);
      setItems(listRes.items);
      if (sourcesRes.length) {
        setSourceOptions(sourcesRes.map((s) => ({ value: s.key, label: s.name })));
      }
      setCampaigns(campaignsRes);
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

  async function convertToClient(lead: LeadRow) {
    if (lead.partyId || lead.party?.id) {
      toastSuccess(`Already linked to ${lead.party?.displayName || 'client'}`);
      return;
    }
    if (!lead.email && !lead.phone) {
      toastError('Add an email or phone on the lead first');
      return;
    }
    try {
      const res = await api<{
        party: { id: string; displayName: string };
        created: boolean;
        alreadyLinked: boolean;
      }>(`/leads/${lead.id}/convert-to-client`, { method: 'POST' });
      if (res.alreadyLinked) {
        toastSuccess(`Already linked to ${res.party.displayName}`);
      } else if (res.created) {
        toastSuccess(`Created client ${res.party.displayName}`);
      } else {
        toastSuccess(`Linked to ${res.party.displayName}`);
      }
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not convert to client');
    }
  }

  async function importCsv() {
    const lines = importText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      toastError('Paste a header row plus at least one data row');
      return;
    }
    const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
    const titleIdx = headers.indexOf('title');
    const nameIdx = headers.indexOf('contactname') >= 0
      ? headers.indexOf('contactname')
      : headers.indexOf('name');
    const emailIdx = headers.indexOf('email');
    const phoneIdx = headers.indexOf('phone');
    if (titleIdx < 0 && nameIdx < 0) {
      toastError('CSV must include a title or contactName/name column');
      return;
    }
    const rows = lines
      .slice(1)
      .map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        const contactName = nameIdx >= 0 ? cols[nameIdx] || undefined : undefined;
        const title =
          (titleIdx >= 0 ? cols[titleIdx] : '') ||
          contactName ||
          '';
        return {
          title,
          contactName,
          email: emailIdx >= 0 ? cols[emailIdx] || undefined : undefined,
          phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
        };
      })
      .filter((r) => r.title);

    if (!rows.length) {
      toastError('No valid rows found');
      return;
    }

    setImporting(true);
    try {
      const res = await api<{ imported: number }>('/leads/import/csv', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      toastSuccess(`Imported ${res.imported} lead${res.imported === 1 ? '' : 's'}`);
      setImportOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const onLoadMore = useCallback(async (stageKey: string) => {
    const col = boardRef.current?.columns.find((c) => c.stage.key === stageKey);
    if (!col?.hasMore || loadingMoreRef.current[stageKey]) return;

    const nextPage = (col.page ?? 1) + 1;
    setLoadingMoreByStage((m) => ({ ...m, [stageKey]: true }));
    try {
      const res = await api<{ items: LeadRow[]; total: number; page: number; pageSize: number }>(
        `/leads?stageKey=${encodeURIComponent(stageKey)}&page=${nextPage}&pageSize=${BOARD_PAGE_SIZE}`,
      );
      setBoard((current) => {
        if (!current) return current;
        return {
          ...current,
          columns: current.columns.map((column) => {
            if (column.stage.key !== stageKey) return column;
            const seen = new Set(column.leads.map((l) => l.id));
            const appended = res.items
              .filter((item) => !seen.has(item.id))
              .map((item) => ({
                id: item.id,
                title: item.title,
                contactName: item.contactName,
                email: item.email,
                phone: item.phone,
                priority: item.priority,
                owner: item.owner,
              }));
            const leads = [...column.leads, ...appended];
            return {
              ...column,
              leads,
              page: res.page,
              pageSize: res.pageSize,
              total: res.total,
              hasMore: leads.length < res.total,
            };
          }),
        };
      });
    } catch (e) {
      reportError(e, 'Could not load more leads');
    } finally {
      setLoadingMoreByStage((m) => ({ ...m, [stageKey]: false }));
    }
  }, []);

  async function createLead() {
    const parsed = parseWithFieldErrors(CreateLeadSchema, {
      title: form.title,
      contactName: form.contactName || null,
      email: form.email || null,
      phone: form.phone || null,
      priority: form.priority,
      sourceKey: form.sourceKey,
      campaignId: form.campaignId || null,
      followUpAt: form.followUpAt?.toISOString() ?? null,
    });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await api<{
        lead?: { id: string };
        duplicates?: Array<{ id: string; title: string }>;
      }>('/leads', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      const dupCount = res.duplicates?.length ?? 0;
      toastSuccess(
        dupCount
          ? `Lead created · ${dupCount} possible duplicate${dupCount === 1 ? '' : 's'} found — open the lead to merge`
          : 'Lead created',
      );
      setForm(emptyForm);
      setOpen(false);
      await load();
      if (res.lead?.id && dupCount) {
        // Leave user on list; they can open the new lead to merge.
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create lead');
    } finally {
      setSubmitting(false);
    }
  }

  const onMove = useCallback(
    async ({ leadId, toStageKey, fromStageKey }: { leadId: string; fromStageKey: string; toStageKey: string }, lostReasonValue?: string) => {
      const target = boardRef.current?.columns.find((c) => c.stage.key === toStageKey);
      const requiresLost = Boolean(target?.stage.isLost || toStageKey === 'lost');

      if (requiresLost && !lostReasonValue?.trim()) {
        setPendingMove({ leadId, fromStageKey, toStageKey });
        setLostReason('');
        setLostOpen(true);
        // Revert optimistic board by reloading
        const boardRes = await api<Board>(`/leads/board?pageSize=${BOARD_PAGE_SIZE}`);
        setBoard(boardRes);
        throw new Error('lost_reason_required');
      }

      try {
        await api(`/leads/${leadId}/stage`, {
          method: 'POST',
          body: JSON.stringify({
            stageKey: toStageKey,
            ...(requiresLost ? { lostReason: lostReasonValue } : {}),
          }),
        });
        toastSuccess(requiresLost ? 'Lead marked Lost' : 'Stage updated');
        const boardRes = await api<Board>(`/leads/board?pageSize=${BOARD_PAGE_SIZE}`);
        setBoard(boardRes);
        const listRes = await api<{ items: LeadRow[] }>('/leads?pageSize=100');
        setItems(listRes.items);
      } catch (e) {
        if (e instanceof Error && e.message === 'lost_reason_required') throw e;
        toastError(e instanceof Error ? e.message : 'Could not update stage');
        throw e;
      }
    },
    [],
  );

  async function confirmBoardLost() {
    if (!pendingMove) return;
    if (!lostReason.trim()) {
      toastError('Enter a lost reason');
      return;
    }
    try {
      await onMove(pendingMove, lostReason.trim());
      setLostOpen(false);
      setPendingMove(null);
      setLostReason('');
    } catch {
      // toast already shown
    }
  }

  const columns = useMemo<ColumnDef<LeadRow>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Lead',
        meta: { label: 'Lead' },
        enableHiding: false,
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <Link
            className="font-medium text-primary hover:underline"
            to={`/leads/${row.original.id}`}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'contact',
        header: 'Contact',
        meta: { label: 'Contact' },
        size: 150,
        minSize: 110,
        accessorFn: (r) => r.contactName || '',
        cell: ({ row }) => (
          <span className="text-foreground/90">{row.original.contactName || '—'}</span>
        ),
      },
      {
        id: 'email',
        header: 'Email',
        meta: { label: 'Email' },
        size: 200,
        minSize: 140,
        accessorFn: (r) => r.email || '',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email || '—'}</span>
        ),
      },
      {
        id: 'phone',
        header: 'Phone',
        meta: { label: 'Phone' },
        size: 140,
        minSize: 120,
        accessorFn: (r) => r.phone || '',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.phone || '—'}</span>
        ),
      },
      {
        id: 'stage',
        accessorFn: (r) => r.stage?.key || '',
        header: 'Stage',
        meta: { label: 'Stage' },
        size: 160,
        minSize: 140,
        sortingFn: (a, b) => {
          const left = a.original.stage?.name || a.original.stage?.key || '';
          const right = b.original.stage?.name || b.original.stage?.key || '';
          return left.localeCompare(right);
        },
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.stage?.key || 'new'}
            label={row.original.stage?.name}
          />
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        meta: { label: 'Priority' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => <StatusBadge value={row.original.priority} />,
      },
      {
        id: 'source',
        header: 'Source',
        meta: { label: 'Source' },
        size: 130,
        minSize: 100,
        accessorFn: (r) => r.source?.name || '',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.source?.name || '—'}</span>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner' },
        size: 140,
        minSize: 110,
        accessorFn: (r) => r.owner?.fullName || '',
        cell: ({ row }) => row.original.owner?.fullName || '—',
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
          const lead = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Lead actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {lead.title}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`/leads/${lead.id}`)}>
                  <ArrowUpRight />
                  Open lead
                </DropdownMenuItem>
                <Can anyOf={CAP.leadWrite}>
                  {lead.partyId || lead.party?.id ? (
                    <DropdownMenuItem disabled>
                      <UserPlus />
                      Linked to {lead.party?.displayName || 'client'}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => void convertToClient(lead)}>
                      <UserPlus />
                      Convert to client
                    </DropdownMenuItem>
                  )}
                </Can>
                <Can anyOf={CAP.inquiryWrite}>
                  <DropdownMenuItem
                    onClick={() => navigate(`/leads/${lead.id}?createInquiry=1`)}
                  >
                    <FilePlus2 />
                    Convert to inquiry
                  </DropdownMenuItem>
                </Can>
                {lead.email ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lead.email!);
                          toastSuccess('Email copied');
                        } catch {
                          toastError('Could not copy email');
                        }
                      }}
                    >
                      <Copy />
                      Copy email
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [navigate],
  );

  return (
    <ListPageShell>
      <PageHeader
        icon={Users}
        title={copy.title}
        subtitle={copy.subtitle}
        className="mb-4 shrink-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border p-1 glass-strong">
              <Button
                size="sm"
                variant={view === 'board' ? 'secondary' : 'ghost'}
                onClick={() => changeView('board')}
              >
                <LayoutGrid className="size-4" />
                Board
              </Button>
              <Button
                size="sm"
                variant={view === 'table' ? 'secondary' : 'ghost'}
                onClick={() => changeView('table')}
              >
                <List className="size-4" />
                Table
              </Button>
            </div>
            <Can anyOf={CAP.leadWrite}>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Import CSV
              </Button>
              {showNewLead ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                New lead
              </Button>
              ) : null}
            </Can>
          </div>
        }
      />
      {error ? <p className="mb-4 shrink-0 text-sm text-destructive">{error}</p> : null}

      {view === 'table' ? (
        <DataTable
          key={stageFromUrl ? `stage-${stageFromUrl}` : 'stage-all'}
          columns={columns}
          data={items}
          loading={loading}
          pageSize={25}
          searchKey="title"
          searchPlaceholder="Search leads…"
          defaultFacetValues={stageFromUrl ? { stage: stageFromUrl } : undefined}
          defaultColumnVisibility={{ email: false, phone: false, source: false }}
          columnVisibilityKey={StorageKeys.leads.columns}
          facets={[
            {
              id: 'priority',
              columnId: 'priority',
              label: 'Priority',
              options: [
                { value: 'low', label: 'Low' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ],
            },
            {
              id: 'stage',
              columnId: 'stage',
              label: 'Stage',
              options: (board?.columns || []).map((c) => ({
                value: c.stage.key,
                label: c.stage.name,
              })),
            },
          ]}
          emptyTitle="No leads yet"
          emptyDescription="Create a lead to start your pipeline."
          emptyIcon={Users}
          emptyAction={
            <Can anyOf={CAP.leadWrite}>
              {showNewLead ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                New lead
              </Button>
              ) : null}
            </Can>
          }
        />
      ) : loading || !board ? (
        <p className="text-sm text-muted-foreground">Loading pipeline…</p>
      ) : (
        <div className="min-h-0 min-w-0 flex-1">
          <PipelineBoard
            className="h-full"
            columns={board.columns}
            onMove={
              canLeadWrite
                ? onMove
                : async () => {
                    const boardRes = await api<Board>(`/leads/board?pageSize=${BOARD_PAGE_SIZE}`);
                    setBoard(boardRes);
                  }
            }
            onLoadMore={onLoadMore}
            loadingMoreByStage={loadingMoreByStage}
            onOpen={(id) => navigate(`/leads/${id}`)}
          />
        </div>
      )}

      <Can anyOf={CAP.leadWrite}>
        {showNewLead ? (
        <Button
          className="fixed bottom-5 right-5 z-20 shadow-lg sm:hidden"
          size="lg"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" />
          New lead
        </Button>
        ) : null}
      </Can>

      <RecordSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFieldErrors({});
        }}
        title="New lead"
        description="Tap suggestions where you can — details can wait."
        submitLabel="Create lead"
        submitting={submitting}
        onSubmit={createLead}
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createLead();
          }}
          className="space-y-1"
        >
          <FormField
            label="Title"
            required
            htmlFor="lead-title"
            error={fieldErrors.title}
            description="Short label for this opportunity — tap a suggestion or type your own."
          >
            <SuggestionChips
              aria-label="Title suggestions"
              allowDeselect={false}
              options={TITLE_SUGGESTIONS}
              value={TITLE_SUGGESTIONS.some((s) => s.value === form.title) ? form.title : ''}
              onChange={(title) => patchForm({ title })}
              className="mb-2"
            />
            <Input
              id="lead-title"
              autoFocus
              value={form.title}
              onChange={(e) => patchForm({ title: e.target.value })}
              placeholder="e.g. Sharma family — Goa honeymoon"
              aria-invalid={Boolean(fieldErrors.title)}
            />
          </FormField>
          <FormField label="Contact person" htmlFor="lead-contact" error={fieldErrors.contactName}>
            <Input
              id="lead-contact"
              value={form.contactName}
              onChange={(e) => patchForm({ contactName: e.target.value })}
              placeholder="Traveller or decision-maker name"
              aria-invalid={Boolean(fieldErrors.contactName)}
            />
          </FormField>
          <FormField label="Email" htmlFor="lead-email" error={fieldErrors.email}>
            <EmailInput
              id="lead-email"
              value={form.email}
              onChange={(email) => patchForm({ email })}
              placeholder="name@…"
              aria-invalid={Boolean(fieldErrors.email)}
            />
          </FormField>
          <FormField label="Phone" htmlFor="lead-phone" error={fieldErrors.phone}>
            <PhoneInput
              id="lead-phone"
              value={form.phone}
              onChange={(phone) => patchForm({ phone })}
              aria-invalid={Boolean(fieldErrors.phone)}
            />
          </FormField>
          <FormField label="Priority" description="How urgent is this lead?" error={fieldErrors.priority}>
            <SuggestionChips
              aria-label="Priority"
              allowDeselect={false}
              options={PRIORITY_OPTIONS}
              value={form.priority}
              onChange={(priority) => patchForm({ priority: priority || 'normal' })}
            />
          </FormField>
          <FormField label="Source" description="Where did this lead come from?" error={fieldErrors.sourceKey}>
            <SuggestionChips
              aria-label="Source"
              allowDeselect={false}
              options={sourceOptions}
              value={form.sourceKey}
              onChange={(sourceKey) => patchForm({ sourceKey: sourceKey || 'manual' })}
            />
          </FormField>
          {campaigns.length ? (
            <FormField label="Campaign" description="Optional paid campaign attribution.">
              <SuggestionChips
                aria-label="Campaign"
                options={[
                  { value: '', label: 'None' },
                  ...campaigns.map((c) => ({ value: c.id, label: c.name })),
                ]}
                value={form.campaignId}
                onChange={(campaignId) => patchForm({ campaignId: campaignId || '' })}
              />
            </FormField>
          ) : null}
          <FormField
            label="Follow-up"
            description="Optional — pick a quick date or choose your own."
            error={fieldErrors.followUpAt}
          >
            <SuggestionChips
              aria-label="Follow-up date"
              options={FOLLOW_UP_PRESETS}
              value={presetFromFollowUp(form.followUpAt)}
              onChange={(preset) =>
                patchForm({
                  followUpAt: preset ? followUpFromPreset(preset) : undefined,
                })
              }
            />
            <div className="mt-2">
              <DatePicker
                value={form.followUpAt}
                onChange={(followUpAt) => patchForm({ followUpAt })}
              />
            </div>
          </FormField>
        </form>
      </RecordSheet>

      <RecordDialog
        open={importOpen}
        onOpenChange={(next) => {
          setImportOpen(next);
        }}
        title="Import leads (CSV)"
        description="Header row required. Columns: title (or contactName/name), email, phone."
        submitLabel={importing ? 'Importing…' : 'Import CSV'}
        onSubmit={() => void importCsv()}
        submitting={importing}
      >
        <FormField label="CSV">
          <textarea
            className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            spellCheck={false}
          />
        </FormField>
      </RecordDialog>

      <RecordDialog
        open={lostOpen}
        onOpenChange={(next) => {
          setLostOpen(next);
          if (!next) {
            setPendingMove(null);
            setLostReason('');
          }
        }}
        title="Mark lead as Lost"
        description="Tell the team why this opportunity closed without a sale."
        submitLabel="Mark Lost"
        onSubmit={() => void confirmBoardLost()}
      >
        <FormField label="Lost reason" required>
          <Input
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="e.g. Budget too low, chose competitor…"
            autoFocus
          />
        </FormField>
      </RecordDialog>
    </ListPageShell>
  );
}
