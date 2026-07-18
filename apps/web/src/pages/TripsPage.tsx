import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowUpRight,
  ClipboardList,
  MoreHorizontal,
  Plane,
  Plus,
  Wallet,
} from 'lucide-react';
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityCombobox,
  Input,
  ListPageShell,
  PageHeader,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  StorageKeys,
  toastError,
  toastSuccess,
  formatDate,
  formatDateRange,
  type ComboboxOption,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { TRIP_STATUS_OPTIONS, tripStatusLabel } from '../lib/agencyStatusLabels';
import {
  TRIPS_PAGE_COPY,
  useTripsPageVariant,
} from '../lib/agencyPageVariants';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCanonicalCreateVisibility } from '../hooks/useCanonicalCreateVisibility';

type Trip = {
  id: string;
  tripNumber: string;
  title: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  destinationsJson?: string[] | null;
  updatedAt: string;
  party?: { id?: string; displayName?: string; email?: string | null } | null;
  inquiry?: {
    id: string;
    inquiryNumber: string;
    travelType?: string | null;
    domesticOrIntl?: string | null;
    leadId?: string | null;
  } | null;
  opsSummary?: {
    totalBookings: number;
    openBookings: number;
    readinessDone: number;
    readinessTotal: number;
  };
};

const STATUS_OPTIONS = [...TRIP_STATUS_OPTIONS];

function formatDestinations(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'name' in item) {
          const name = (item as { name?: unknown }).name;
          return typeof name === 'string' ? name : '';
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'string') return value;
  return '';
}

export function TripsPage() {
  const { navigate, toOrgPath } = useOrgNavigate();
  const variant = useTripsPageVariant();
  const copy = TRIPS_PAGE_COPY[variant];
  const opsMode = variant.startsWith('operations');
  const financeMode = variant.startsWith('finance');
  const statusFromUrl =
    variant === 'quotations' ? 'quoted' : variant === 'drafts' ? 'draft' : undefined;
  const showNewTrip = useCanonicalCreateVisibility('trip');
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', partyId: '', partyLabel: '' });

  useDocumentTitle(copy.documentTitle);

  const filteredItems = useMemo(() => {
    let list = items;
    if (statusFromUrl) list = list.filter((t) => t.status === statusFromUrl);
    if (opsMode) {
      // Ops queue: confirmed through ready — still actionable for bookings/readiness.
      // Exclude in_progress (already travelling) so the queue stays focused.
      list = list.filter((t) =>
        ['confirmed', 'booking_in_progress', 'ready_to_travel'].includes(t.status),
      );
    }
    if (financeMode) {
      list = list.filter((t) =>
        ['confirmed', 'booking_in_progress', 'ready_to_travel', 'in_progress', 'completed'].includes(
          t.status,
        ),
      );
    }
    return list;
  }, [items, statusFromUrl, opsMode, financeMode]);

  const tableRows = useMemo(
    () =>
      filteredItems.map((item) => ({
        ...item,
        searchText: [
          item.tripNumber,
          item.title,
          item.party?.displayName,
          item.inquiry?.inquiryNumber,
          formatDestinations(item.destinationsJson),
          item.status,
        ]
          .filter(Boolean)
          .join(' '),
      })),
    [filteredItems],
  );

  function tripPath(id: string, tab?: string) {
    if (tab) return `/trips/${id}?tab=${tab}`;
    if (opsMode) return `/trips/${id}?tab=operations`;
    if (financeMode) return `/trips/${id}?tab=finance`;
    if (variant === 'quotations' || variant === 'drafts') {
      return `/trips/${id}?tab=quotations`;
    }
    return `/trips/${id}`;
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: Trip[] }>('/trips?pageSize=100');
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

  async function searchParties(q: string): Promise<ComboboxOption[]> {
    const res = await api<{ items: Array<{ id: string; displayName: string; email?: string }> }>(
      `/parties?pageSize=20&q=${encodeURIComponent(q)}`,
    );
    return res.items.map((p) => ({
      value: p.id,
      label: p.displayName,
      description: p.email || undefined,
    }));
  }

  async function onCreate() {
    if (!form.title.trim()) {
      toastError('Enter a trip title');
      return;
    }
    setSubmitting(true);
    try {
      const trip = await api<{ id: string }>('/trips', {
        method: 'POST',
        body: JSON.stringify({ title: form.title.trim(), partyId: form.partyId || undefined }),
      });
      toastSuccess('Trip created');
      setForm({ title: '', partyId: '', partyLabel: '' });
      setOpen(false);
      navigate(`/trips/${trip.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create trip');
    } finally {
      setSubmitting(false);
    }
  }

  const columns = useMemo<ColumnDef<(typeof tableRows)[number]>[]>(
    () => [
      {
        accessorKey: 'tripNumber',
        header: 'Number',
        meta: { label: 'Number' },
        enableHiding: false,
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium tabular-nums text-primary hover:underline"
            onClick={() => navigate(tripPath(row.original.id))}
          >
            {row.original.tripNumber}
          </button>
        ),
      },
      {
        accessorKey: 'title',
        header: 'Title',
        meta: { label: 'Title' },
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <span className="truncate text-foreground/90">{row.original.title}</span>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        meta: { label: 'Client' },
        size: 160,
        minSize: 120,
        accessorFn: (r) => r.party?.displayName || '',
        cell: ({ row }) => (
          <span className="truncate text-foreground/90">
            {row.original.party?.displayName || '—'}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Status',
        meta: { label: 'Status' },
        size: 150,
        minSize: 130,
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.status}
            label={tripStatusLabel(row.original.status)}
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
          <span className="truncate text-muted-foreground">
            {formatDestinations(row.original.destinationsJson) || '—'}
          </span>
        ),
      },
      {
        id: 'dates',
        header: 'Dates',
        meta: { label: 'Dates' },
        size: 170,
        minSize: 140,
        accessorFn: (r) => r.startDate || '',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDateRange(row.original.startDate, row.original.endDate)}
          </span>
        ),
      },
      ...(opsMode
        ? ([
            {
              id: 'bookings',
              header: 'Bookings',
              meta: { label: 'Bookings' },
              size: 120,
              minSize: 100,
              accessorFn: (r) => r.opsSummary?.openBookings ?? 0,
              cell: ({ row }) => {
                const s = row.original.opsSummary;
                if (!s || s.totalBookings === 0) {
                  return <span className="text-muted-foreground">None yet</span>;
                }
                return s.openBookings > 0 ? (
                  <StatusBadge
                    value="pending"
                    label={`${s.openBookings} open`}
                    tone="warn"
                    showIcon={false}
                  />
                ) : (
                  <StatusBadge value="confirmed" label="All set" tone="success" showIcon={false} />
                );
              },
            },
            {
              id: 'readiness',
              header: 'Readiness',
              meta: { label: 'Readiness' },
              size: 110,
              minSize: 90,
              accessorFn: (r) => r.opsSummary?.readinessDone ?? 0,
              cell: ({ row }) => {
                const s = row.original.opsSummary;
                if (!s || s.readinessTotal === 0) {
                  return <span className="text-muted-foreground">—</span>;
                }
                return (
                  <span className="tabular-nums text-muted-foreground">
                    {s.readinessDone}/{s.readinessTotal}
                  </span>
                );
              },
            },
          ] as ColumnDef<(typeof tableRows)[number]>[])
        : []),
      {
        id: 'inquiry',
        header: 'Inquiry',
        meta: { label: 'Inquiry' },
        size: 120,
        minSize: 100,
        accessorFn: (r) => r.inquiry?.inquiryNumber || '',
        cell: ({ row }) =>
          row.original.inquiry?.id ? (
            <button
              type="button"
              className="font-medium tabular-nums text-primary hover:underline"
              onClick={() => navigate(`/inquiries/${row.original.inquiry!.id}`)}
            >
              {row.original.inquiry.inquiryNumber}
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'updated',
        header: 'Updated',
        meta: { label: 'Updated' },
        size: 110,
        minSize: 100,
        accessorFn: (r) => r.updatedAt,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDate(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'searchText',
        accessorKey: 'searchText',
        header: 'Search',
        enableHiding: false,
        enableSorting: false,
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
          const trip = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Trip actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {trip.tripNumber}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(tripPath(trip.id))}>
                  <ArrowUpRight />
                  Open workspace
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(tripPath(trip.id, 'quotations'))}>
                  <ArrowUpRight />
                  Quotations
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(tripPath(trip.id, 'operations'))}>
                  <ClipboardList />
                  Operations
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(tripPath(trip.id, 'finance'))}>
                  <Wallet />
                  Finance
                </DropdownMenuItem>
                {trip.inquiry?.id ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate(`/inquiries/${trip.inquiry!.id}`)}>
                      <ArrowUpRight />
                      Open inquiry
                    </DropdownMenuItem>
                  </>
                ) : null}
                {trip.party?.id ? (
                  <DropdownMenuItem onClick={() => navigate(`/parties/${trip.party!.id}`)}>
                    <ArrowUpRight />
                    View client
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [navigate, opsMode, financeMode, variant],
  );

  if (searchParams.get('ops') === '1') return <Navigate to={toOrgPath(AGENCY_ROUTES.operations)} replace />;
  if (searchParams.get('finance') === '1') return <Navigate to={toOrgPath(AGENCY_ROUTES.finance)} replace />;
  if (searchParams.get('status') === 'quoted') return <Navigate to={toOrgPath(AGENCY_ROUTES.workQuotations)} replace />;
  if (searchParams.get('status') === 'draft') return <Navigate to={toOrgPath(AGENCY_ROUTES.workQuotationDrafts)} replace />;

  return (
    <ListPageShell>
      <PageHeader
        icon={opsMode ? ClipboardList : financeMode ? Wallet : Plane}
        title={copy.title}
        subtitle={copy.subtitle}
        className="mb-4 shrink-0"
        actions={
          opsMode ? (
            <Button variant="secondary" onClick={() => navigate(AGENCY_ROUTES.trips)}>
              All trips
            </Button>
          ) : (
            <Can anyOf={CAP.tripWrite}>
              {showNewTrip ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                New trip
              </Button>
              ) : null}
            </Can>
          )
        }
      />
      <DataTable
        key={
          statusFromUrl
            ? `status-${statusFromUrl}`
            : opsMode
              ? 'ops'
              : financeMode
                ? 'finance'
                : 'all'
        }
        columns={columns}
        data={tableRows}
        loading={loading}
        error={error}
        pageSize={25}
        searchKey="searchText"
        searchPlaceholder="Search trips, clients, destinations…"
        columnVisibilityKey={
          opsMode
            ? `${StorageKeys.trips.columns}-ops`
            : financeMode
              ? `${StorageKeys.trips.columns}-finance`
              : StorageKeys.trips.columns
        }
        defaultColumnVisibility={{
          searchText: false,
          inquiry: false,
          updated: false,
          ...(opsMode ? { destinations: false } : {}),
        }}
        defaultFacetValues={statusFromUrl ? { status: statusFromUrl } : undefined}
        facets={[
          {
            id: 'status',
            columnId: 'status',
            label: 'Status',
            options: opsMode
              ? STATUS_OPTIONS.filter((o) =>
                  ['confirmed', 'booking_in_progress', 'ready_to_travel'].includes(o.value),
                )
              : financeMode
                ? STATUS_OPTIONS.filter((o) =>
                    [
                      'confirmed',
                      'booking_in_progress',
                      'ready_to_travel',
                      'in_progress',
                      'completed',
                    ].includes(o.value),
                  )
                : STATUS_OPTIONS,
          },
        ]}
        emptyTitle={opsMode || financeMode ? 'No matching trips' : 'No trips yet'}
        emptyDescription={
          opsMode
            ? 'Trips appear here after a quote is confirmed. Accept a quotation, then open the trip Operations tab to add bookings.'
            : financeMode
              ? 'Confirmed trips will appear here for payments.'
              : 'Create a trip or convert an inquiry.'
        }
        emptyIcon={opsMode ? ClipboardList : Plane}
        emptyAction={
          opsMode ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => navigate('/trips?status=awaiting_approval')}>
                Awaiting approval
              </Button>
              <Button onClick={() => navigate('/trips')}>View all trips</Button>
            </div>
          ) : !financeMode ? (
            <Can anyOf={CAP.tripWrite}>
              {showNewTrip ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                New trip
              </Button>
              ) : null}
            </Can>
          ) : undefined
        }
      />
      <RecordSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setForm({ title: '', partyId: '', partyLabel: '' });
        }}
        title="New trip"
        description="Start a blank trip workspace — or convert from an inquiry for fuller context."
        submitLabel="Create trip"
        submitting={submitting}
        onSubmit={onCreate}
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void onCreate();
          }}
        >
          <FormField label="Trip title" required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Maldives family trip"
              required
            />
          </FormField>
          <FormField label="Client" htmlFor="trip-client">
            <EntityCombobox
              value={form.partyId}
              selectedLabel={form.partyLabel}
              onChange={(partyId, option) =>
                setForm({ ...form, partyId, partyLabel: option?.label || '' })
              }
              onSearch={searchParties}
              placeholder="Search clients…"
              clearable
            />
          </FormField>
        </form>
      </RecordSheet>
    </ListPageShell>
  );
}
