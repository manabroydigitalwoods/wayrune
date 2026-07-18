import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, Contact, Copy, MoreHorizontal, Plane, Plus } from 'lucide-react';
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
  humanizeFieldKeys,
  ListPageShell,
  PageHeader,
  RecordSheet,
  StatusBadge,
  StorageKeys,
  formatCurrency,
  formatDate,
  formatDateTime,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { useAuth } from '../auth';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useCanonicalCreateVisibility } from '../hooks/useCanonicalCreateVisibility';
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

export function InquiriesPage() {
  const { navigate, toOrgPath } = useOrgNavigate();
  const [searchParams] = useSearchParams();
  const variant = useInquiriesPageVariant();
  const copy = INQUIRIES_PAGE_COPY[variant];
  useDocumentTitle(copy.documentTitle);
  const { hasAny } = usePermissions();
  const { me } = useAuth();
  const canInquiryWrite = hasAny(CAP.inquiryWrite);
  const showNewInquiry = useCanonicalCreateVisibility('inquiry');
  const canConvert = hasAny(CAP.inquiryConvertTrip);
  const leadId = searchParams.get('leadId') || undefined;
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

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: Inquiry[] }>('/inquiries?pageSize=100');
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
  }, []);

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
    const planningStatuses = new Set(['open', 'qualified']);
    const scoped =
      variant === 'planning'
        ? items.filter((item) => planningStatuses.has(item.status))
        : variant === 'requests'
          ? items.filter(
              (item) =>
                item.status !== 'lost' &&
                (!item.ownerId || item.ownerId === me?.id),
            )
          : items;
    return scoped.map((item) => ({
        ...item,
        searchText: [
          item.inquiryNumber,
          item.party?.displayName,
          item.lead?.title,
          item.travelType,
          ...(placeRefsFromJson(item.destinationsJson).map((p) => p.name)),
        ]
          .filter(Boolean)
          .join(' '),
        completeness: (item.missingFieldsJson || []).length > 0 ? 'incomplete' : 'complete',
      }));
  }, [items, me?.id, variant]);

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
      { id: 'searchText', accessorKey: 'searchText', header: 'Search', enableHiding: false, enableSorting: false },
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

  if (searchParams.get('status') === 'open' && variant === 'all') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.workPlanning)} replace />;
  }

  return (
    <ListPageShell>
      <PageHeader
        icon={Contact}
        title={copy.title}
        subtitle={copy.subtitle}
        className="mb-4 shrink-0"
        actions={
          <Can anyOf={CAP.inquiryWrite}>
            {showNewInquiry ? (
            <Button onClick={() => setOpen(true)}><Plus className="size-4" />New inquiry</Button>
            ) : null}
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={tableRows}
        loading={loading}
        error={error}
        pageSize={25}
        searchKey="searchText"
        searchPlaceholder={`Search ${copy.title.toLowerCase()}…`}
        columnVisibilityKey={StorageKeys.inquiries.columns}
        defaultColumnVisibility={{ searchText: false, travelType: false, scope: false, budget: false, lead: false, updated: false }}
        facets={[
          { id: 'status', columnId: 'status', label: 'Status', options: [...INQUIRY_STATUS_FACET_OPTIONS] },
          { id: 'missing', columnId: 'missing', label: 'Completeness', options: [{ value: 'incomplete', label: 'Incomplete' }, { value: 'complete', label: 'Complete' }] },
        ]}
        defaultFacetValues={
          variant === 'planning' ? { status: 'open' } : undefined
        }
        emptyTitle={`No ${copy.title.toLowerCase()}`}
        emptyDescription={
          variant === 'planning'
            ? 'Open requests appear here while itinerary and quotation work is in progress.'
            : 'Capture requirements from a lead or walk-in client.'
        }
        emptyIcon={Contact}
        emptyAction={
          <Can anyOf={CAP.inquiryWrite}>
            {showNewInquiry ? (
            <Button onClick={() => setOpen(true)}><Plus className="size-4" />New inquiry</Button>
            ) : null}
          </Can>
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
        {detailLoading || !detail ? <p className="text-sm text-muted-foreground">Loading inquiry…</p> : (
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
    </ListPageShell>
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
