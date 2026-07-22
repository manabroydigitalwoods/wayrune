import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import { ArrowUpRight, Contact, Copy, MoreHorizontal, Plane, Plus, Search, X } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  cn,
  humanizeFieldKeys,
  localStorageKit,
  RecordSheet,
  Skeleton,
  StatusBadge,
  StorageKeys,
  formatCurrency,
  formatDate,
  formatDateTime,
  toastError,
  toastSuccess,
  usePageChrome,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useCanonicalCreateVisibility } from '../hooks/useCanonicalCreateVisibility';
import { useInquiryQueueSummary } from '../hooks/useInquiryQueueSummary';
import { InquiryCreateSheet } from '../components/inquiries/InquiryCreateSheet';
import { InquiryStatusMenu } from '../components/inquiries/InquiryStatusMenu';
import { INQUIRY_STATUS_FACET_OPTIONS, inquiryStatusLabel } from '../lib/agencyStatusLabels';
import {
  INQUIRIES_PAGE_COPY,
  useInquiriesPageVariant,
} from '../lib/agencyPageVariants';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { leadOutcomeMessage, type LeadOutcome } from '../lib/lead-outcome';
import { placeRefsFromJson } from '../lib/placeRefs';
import { buildInquiriesListQuery } from '../lib/inquiryQueue';
import {
  inquiriesQueryHasFilters,
  parseInquiriesQueryState,
  patchInquiriesQueryParams,
} from '../lib/queue';
import {
  ActiveFilterChips,
  AttentionPresets,
  DisplayMenu,
  FilterMenu,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
} from '../components/queue';

function formatDestinations(value: unknown): string {
  return placeRefsFromJson(value)
    .map((p) => p.name)
    .join(', ');
}

// Friendlier lifecycle vocabulary — see agencyStatusLabels.ts

type Inquiry = {
  id: string;
  inquiryNumber: string;
  ownerId?: string | null;
  status: string;
  travelType?: string | null;
  domesticOrIntl?: string | null;
  destinationsJson?: unknown;
  missingFieldsJson?: string[] | null;
  adults?: number | null;
  children?: number | null;
  budgetAmount?: number | string | null;
  budgetCurrency?: string | null;
  startDate?: string | null;
  party?: { id?: string; displayName?: string } | null;
  lead?: { id: string; title?: string } | null;
  updatedAt: string;
};

type InquiryDetail = Inquiry & {
  trips?: Array<{ id: string; tripNumber: string; title: string }>;
};

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  leisure: 'Leisure',
  honeymoon: 'Honeymoon',
  business: 'Business',
  family: 'Family',
};

const DOMESTIC_LABELS: Record<string, string> = {
  domestic: 'Domestic',
  international: 'International',
};

function readInquiriesColumnVisibility(): VisibilityState {
  const defaults: VisibilityState = {
    travelType: false,
    scope: false,
    budget: false,
    lead: false,
    updated: false,
  };
  const stored = localStorageKit.getJson<VisibilityState>(StorageKeys.inquiries.columns, {
    version: 1,
  });
  if (!stored || typeof stored !== 'object') return defaults;
  return { ...defaults, ...stored };
}

export function InquiriesPage() {
  const { navigate, toOrgPath } = useOrgNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = useInquiriesPageVariant();
  const copy = INQUIRIES_PAGE_COPY[variant];
  useDocumentTitle(copy.documentTitle);
  const { hasAny } = usePermissions();
  const canInquiryWrite = hasAny(CAP.inquiryWrite);
  const showNewInquiry = useCanonicalCreateVisibility('inquiry');
  const canConvert = hasAny(CAP.inquiryConvertTrip);
  const leadId = searchParams.get('leadId') || undefined;
  const query = useMemo(() => parseInquiriesQueryState(searchParams), [searchParams]);
  const showQueueAttention = variant === 'planning' || variant === 'requests' || variant === 'sales';
  const { data: queueSummary } = useInquiryQueueSummary(showQueueAttention);
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    readInquiriesColumnVisibility(),
  );

  function applyQuery(patch: Parameters<typeof patchInquiriesQueryParams>[1]) {
    setSearchParams(patchInquiriesQueryParams(searchParams, patch), { replace: true });
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
      const qs = buildInquiriesListQuery({
        variant,
        incomplete: query.incomplete,
        unassigned: query.unassigned,
        stale: query.stale,
      });
      const res = await api<{ items: Inquiry[] }>(`/inquiries?${qs}`);
      setItems(res.items);
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
  }, [variant, query.incomplete, query.unassigned, query.stale]);

  useEffect(() => {
    if (leadId) setOpen(true);
  }, [leadId]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const res = await api<InquiryDetail>(`/inquiries/${detailId}`);
        if (!cancelled) setDetail(res);
      } catch (e) {
        if (!cancelled) {
          reportError(e, 'Could not load inquiry');
          setDetailId(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  async function convert(id: string) {
    setConverting(true);
    try {
      const trip = await api<{ id: string; leadOutcome?: LeadOutcome }>(
        `/inquiries/${id}/convert-to-trip`,
        { method: 'POST' },
      );
      toastSuccess(leadOutcomeMessage(trip.leadOutcome, 'Trip created'));
      setConvertId(null);
      setDetailId(null);
      navigate(`/trips/${trip.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not convert inquiry');
    } finally {
      setConverting(false);
    }
  }

  async function cloneInquiry(id: string) {
    setCloning(true);
    try {
      const cloned = await api<Inquiry>(`/inquiries/${id}/clone`, { method: 'POST' });
      toastSuccess(`Cloned as ${cloned.inquiryNumber}`);
      await load();
      setDetailId(cloned.id);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not clone inquiry');
    } finally {
      setCloning(false);
    }
  }

  const tableRows = useMemo(() => {
    const q = query.q?.trim().toLowerCase();
    return items
      .filter((item) => {
        if (query.statusFilter && item.status !== query.statusFilter) return false;
        if (!q) return true;
        const haystack = [
          item.inquiryNumber,
          item.party?.displayName,
          item.lead?.title,
          item.travelType,
          ...placeRefsFromJson(item.destinationsJson).map((p) => p.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .map((item) => ({
        ...item,
        completeness: (item.missingFieldsJson || []).length > 0 ? 'incomplete' : 'complete',
      }));
  }, [items, query.statusFilter, query.q]);

  const columns = useMemo<ColumnDef<(typeof tableRows)[number]>[]>(
    () => [
      {
        accessorKey: 'inquiryNumber',
        header: 'Number',
        meta: { label: 'Number' },
        enableHiding: false,
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium tabular-nums text-primary hover:underline"
            onClick={() => navigate(`/inquiries/${row.original.id}`)}
          >
            {row.original.inquiryNumber}
          </button>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        meta: { label: 'Client' },
        size: 160,
        minSize: 120,
        accessorFn: (r) => r.party?.displayName || '',
        cell: ({ row }) => <span className="text-foreground/90">{row.original.party?.displayName || '—'}</span>,
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Status',
        meta: { label: 'Status' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.status}
            label={inquiryStatusLabel(row.original.status)}
          />
        ),
      },
      {
        id: 'destinations',
        header: 'Destinations',
        meta: { label: 'Destinations' },
        size: 180,
        minSize: 140,
        accessorFn: (r) => formatDestinations(r.destinationsJson),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDestinations(row.original.destinationsJson) || '—'}
          </span>
        ),
      },
      {
        id: 'missing',
        header: 'Missing',
        meta: { label: 'Missing' },
        size: 120,
        minSize: 100,
        accessorFn: (r) => r.completeness,
        cell: ({ row }) => {
          const missing = row.original.missingFieldsJson || [];
          return missing.length ? (
            <StatusBadge value="pending" label={`${missing.length} field${missing.length === 1 ? '' : 's'}`} tone="warn" />
          ) : (
            <StatusBadge value="done" label="Complete" tone="success" />
          );
        },
      },
      {
        id: 'travelType',
        header: 'Travel type',
        meta: { label: 'Travel type' },
        size: 120,
        minSize: 100,
        accessorFn: (r) => r.travelType || '',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.travelType ? TRAVEL_TYPE_LABELS[row.original.travelType] || row.original.travelType : '—'}
          </span>
        ),
      },
      {
        id: 'scope',
        header: 'Scope',
        meta: { label: 'Scope' },
        size: 120,
        minSize: 100,
        accessorFn: (r) => r.domesticOrIntl || '',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.domesticOrIntl ? DOMESTIC_LABELS[row.original.domesticOrIntl] || row.original.domesticOrIntl : '—'}
          </span>
        ),
      },
      {
        id: 'budget',
        header: 'Budget',
        meta: { label: 'Budget' },
        size: 120,
        minSize: 100,
        accessorFn: (r) => Number(r.budgetAmount || 0),
        cell: ({ row }) => {
          const amount = row.original.budgetAmount;
          if (amount == null || amount === '') return '—';
          return (
            <span className="tabular-nums text-muted-foreground">
              {formatCurrency(amount, {
                currency: row.original.budgetCurrency || 'INR',
                maximumFractionDigits: 0,
              })}
            </span>
          );
        },
      },
      {
        id: 'lead',
        header: 'Lead',
        meta: { label: 'Lead' },
        size: 150,
        minSize: 120,
        accessorFn: (r) => r.lead?.title || '',
        cell: ({ row }) =>
          row.original.lead?.id ? (
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate(`/leads/${row.original.lead!.id}`)}>
              {row.original.lead.title || 'Open lead'}
            </button>
          ) : <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'updated',
        header: 'Updated',
        meta: { label: 'Updated' },
        size: 110,
        minSize: 100,
        accessorFn: (r) => r.updatedAt,
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatDate(row.original.updatedAt)}</span>,
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
          const inquiry = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-foreground" aria-label="Inquiry actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">{inquiry.inquiryNumber}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`/inquiries/${inquiry.id}`)}><ArrowUpRight />Open inquiry</DropdownMenuItem>
                {inquiry.status !== 'converted' ? (
                  <Can anyOf={CAP.inquiryConvertTrip}>
                    <DropdownMenuItem onClick={() => setConvertId(inquiry.id)}><Plane />Convert to trip</DropdownMenuItem>
                  </Can>
                ) : null}
                <Can anyOf={CAP.inquiryWrite}>
                  <DropdownMenuItem onClick={() => void cloneInquiry(inquiry.id)}><Copy />Clone inquiry</DropdownMenuItem>
                </Can>
                {inquiry.lead?.id ? <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate(`/leads/${inquiry.lead!.id}`)}><ArrowUpRight />Open lead</DropdownMenuItem></> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [navigate],
  );

  function toggleColumn(id: string, visible: boolean) {
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      localStorageKit.setJson(StorageKeys.inquiries.columns, next, { version: 1 });
      return next;
    });
  }

  function clearInquiryFilters() {
    applyQuery({ clearFilters: true });
  }

  /** Empty-state reset: drop filters and search so results can show again. */
  function clearInquiryFiltersAndSearch() {
    setSearchDraft('');
    applyQuery({ clearFilters: true, q: '' });
  }

  if (searchParams.get('status') === 'open' && variant === 'all') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.workPlanning)} replace />;
  }

  const pageSubtitle =
    query.stale && query.incomplete && query.unassigned
      ? 'Showing stale, incomplete, unassigned travel requests'
      : query.stale
        ? 'Showing stale travel requests in planning'
        : query.incomplete && query.unassigned
          ? 'Showing incomplete, unassigned travel requests'
          : query.incomplete
            ? 'Showing travel requests with missing fields'
            : query.unassigned
              ? 'Showing unassigned travel requests'
              : copy.subtitle;

  usePageChrome({ title: copy.title, subtitle: pageSubtitle });

  const attentionPresets = [
    {
      id: 'stale',
      label: 'stale in planning',
      count: queueSummary?.planningStale ?? 0,
      active: Boolean(query.stale),
      tone: 'danger' as const,
      onClick: () => applyQuery({ stale: query.stale ? undefined : true }),
    },
    {
      id: 'incomplete',
      label: 'incomplete',
      count: queueSummary?.planningIncomplete ?? 0,
      active: Boolean(query.incomplete),
      tone: 'warn' as const,
      onClick: () => applyQuery({ incomplete: query.incomplete ? undefined : true }),
    },
    ...(variant === 'planning'
      ? [
          {
            id: 'unassigned',
            label: 'unassigned',
            count: queueSummary?.planningUnassigned ?? 0,
            active: Boolean(query.unassigned),
            tone: 'info' as const,
            onClick: () => applyQuery({ unassigned: query.unassigned ? undefined : true }),
          },
        ]
      : []),
  ];

  const statusFilterDefs = [
    {
      id: 'status',
      label: 'Status',
      value: query.statusFilter ?? null,
      options: [...INQUIRY_STATUS_FACET_OPTIONS],
      onSelect: (value: string | null) => applyQuery({ statusFilter: value || undefined }),
    },
  ];

  const displayColumns = [
    { id: 'client', label: 'Client', visible: columnVisibility.client !== false },
    { id: 'status', label: 'Status', visible: columnVisibility.status !== false },
    { id: 'destinations', label: 'Destinations', visible: columnVisibility.destinations !== false },
    { id: 'missing', label: 'Missing', visible: columnVisibility.missing !== false },
    { id: 'travelType', label: 'Travel type', visible: columnVisibility.travelType !== false },
    { id: 'scope', label: 'Scope', visible: columnVisibility.scope !== false },
    { id: 'budget', label: 'Budget', visible: columnVisibility.budget !== false },
    { id: 'lead', label: 'Lead', visible: columnVisibility.lead !== false },
    { id: 'updated', label: 'Updated', visible: columnVisibility.updated !== false },
  ];

  const filterChips = [
    query.stale
      ? { id: 'stale', label: 'Stale in planning', onRemove: () => applyQuery({ stale: undefined }) }
      : null,
    query.incomplete
      ? { id: 'incomplete', label: 'Incomplete', onRemove: () => applyQuery({ incomplete: undefined }) }
      : null,
    query.unassigned
      ? { id: 'unassigned', label: 'Unassigned', onRemove: () => applyQuery({ unassigned: undefined }) }
      : null,
    query.statusFilter
      ? {
          id: 'status',
          label: `Status: ${INQUIRY_STATUS_FACET_OPTIONS.find((o) => o.value === query.statusFilter)?.label ?? query.statusFilter}`,
          onRemove: () => applyQuery({ statusFilter: undefined }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const queueToolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={`Search ${copy.title.toLowerCase()}…`}
          className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
          aria-label={`Search ${copy.title.toLowerCase()}`}
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
        <FilterMenu filters={statusFilterDefs} />
        <DisplayMenu columns={displayColumns} onToggleColumn={toggleColumn} />
      </div>
    </div>
  );

  return (
    <QueuePageChrome
      attention={showQueueAttention ? <AttentionPresets presets={attentionPresets} /> : null}
      primaryActions={
        <Can anyOf={CAP.inquiryWrite}>
          {showNewInquiry ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-[0.875em]" />
              New inquiry
            </Button>
          ) : null}
        </Can>
      }
      error={error ? <p className="text-sm text-destructive">{error}</p> : null}
      toolbar={queueToolbar}
      chips={
        <ActiveFilterChips
          chips={filterChips}
          onClear={inquiriesQueryHasFilters(query) ? clearInquiryFilters : undefined}
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
        columnVisibilityKey={StorageKeys.inquiries.columns}
        defaultColumnVisibility={columnVisibility}
        emptyTitle={
          inquiriesQueryHasFilters(query) || query.q ? 'No matching inquiries' : `No ${copy.title.toLowerCase()}`
        }
        emptyDescription={
          inquiriesQueryHasFilters(query) || query.q
            ? 'Try clearing filters or search.'
            : variant === 'planning'
              ? 'Open requests appear here while itinerary and quotation work is in progress.'
              : 'Capture requirements from a lead or walk-in client.'
        }
        emptyIcon={Contact}
        emptyAction={
          inquiriesQueryHasFilters(query) || query.q ? (
            <Button type="button" size="sm" variant="outline" onClick={clearInquiryFiltersAndSearch}>
              Clear filters
            </Button>
          ) : (
            <Can anyOf={CAP.inquiryWrite}>
              {showNewInquiry ? (
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4" />
                  New inquiry
                </Button>
              ) : null}
            </Can>
          )
        }
      />

      <InquiryCreateSheet
        open={open}
        onOpenChange={setOpen}
        defaults={leadId ? { leadId } : undefined}
        onCreated={(inquiry) => navigate(`/inquiries/${inquiry.id}`)}
      />

      <RecordSheet
        open={Boolean(detailId)}
        onOpenChange={(next) => { if (!next) setDetailId(null); }}
        title={detail?.inquiryNumber || 'Inquiry'}
        description={detail?.party?.displayName ? `Requirements for ${detail.party.displayName}` : 'Requirement capture and conversion.'}
        cancelLabel="Close"
        wide
      >
        {detailLoading || !detail ? (
          <div className="space-y-2" role="status" aria-busy="true">
            <span className="sr-only">Loading</span>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={detail.status} label={inquiryStatusLabel(detail.status)} size="md" />
              {(detail.missingFieldsJson || []).length ? <StatusBadge value="pending" tone="warn" size="md" label={`${detail.missingFieldsJson!.length} missing`} /> : <StatusBadge value="done" tone="success" size="md" label="Complete" />}
              {canInquiryWrite ? (
                <InquiryStatusMenu inquiry={detail} onChanged={(updated) => { setDetail(updated); void load(); }} />
              ) : null}
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Client">{detail.party?.displayName || '—'}</Detail>
              <Detail label="Lead">{detail.lead?.id ? <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate(`/leads/${detail.lead!.id}`)}>{detail.lead.title || 'Open lead'}</button> : '—'}</Detail>
              <Detail label="Travel type">{detail.travelType ? TRAVEL_TYPE_LABELS[detail.travelType] || detail.travelType : '—'}</Detail>
              <Detail label="Scope">{detail.domesticOrIntl ? DOMESTIC_LABELS[detail.domesticOrIntl] || detail.domesticOrIntl : '—'}</Detail>
              <Detail label="Destinations" className="sm:col-span-2">
                {formatDestinations(detail.destinationsJson) || '—'}
              </Detail>
              <Detail label="Travellers">{detail.adults ?? 0} adults{detail.children ? ` · ${detail.children} children` : ''}</Detail>
              <Detail label="Budget">
                {detail.budgetAmount != null && detail.budgetAmount !== ''
                  ? formatCurrency(detail.budgetAmount, {
                      currency: detail.budgetCurrency || 'INR',
                      maximumFractionDigits: 0,
                    })
                  : '—'}
              </Detail>
              <Detail label="Start date">{detail.startDate ? formatDate(detail.startDate) : '—'}</Detail>
              <Detail label="Updated">{formatDateTime(detail.updatedAt)}</Detail>
            </dl>
            {(detail.missingFieldsJson || []).length ? <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing fields</p><p className="mt-1 text-sm text-warning">{humanizeFieldKeys(detail.missingFieldsJson || [])}</p></div> : null}
            {detail.trips?.length ? <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked trips</p><ul className="mt-1 space-y-1">{detail.trips.map((trip) => <li key={trip.id}><button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => navigate(`/trips/${trip.id}`)}>{trip.tripNumber} · {trip.title}</button></li>)}</ul></div> : null}
            <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
              {canConvert && detail.status !== 'converted' ? <Button onClick={() => setConvertId(detail.id)}><Plane className="size-4" />Convert to trip</Button> : null}
              {canInquiryWrite ? <Button variant="outline" disabled={cloning} onClick={() => void cloneInquiry(detail.id)}><Copy className="size-4" />{cloning ? 'Cloning…' : 'Clone'}</Button> : null}
              {detail.lead?.id ? <Button variant="outline" onClick={() => navigate(`/leads/${detail.lead!.id}`)}><ArrowUpRight className="size-4" />Open lead</Button> : null}
            </div>
          </div>
        )}
      </RecordSheet>

      <ConfirmDialog
        open={Boolean(convertId)}
        onOpenChange={(next) => !next && setConvertId(null)}
        title="Convert to trip?"
        description="This creates a trip workspace from the inquiry so you can build the itinerary and quotation."
        confirmLabel="Convert"
        loading={converting}
        onConfirm={() => convertId && convert(convertId)}
      />
    </QueuePageChrome>
  );
}

function Detail({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
