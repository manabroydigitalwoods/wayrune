import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowUpRight,
  ClipboardList,
  MoreHorizontal,
  PackagePlus,
  Plane,
  Plus,
  Wallet,
} from 'lucide-react';
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
import { tripTravelEndOnOrAfterStart } from '@wayrune/contracts';
import { api } from '../api';
import { formatDateInput, parseDateInput } from '../lib/dateInput';
import {
  formatCreateTripFromPackageToast,
  fromPackageRequestBody,
  planCreateTripFromPackage,
  parseApplyChildAgesCsv,
  sortQuoteTemplatesForPicker,
} from '../lib/createTripFromPackage';
import {
  clearTemplateIdIfFilteredOut,
  collectUniquePickerMetaChips,
  filterTemplatesByFolderAndTag,
  formatPackagePickerDescription,
} from '../lib/quoteTemplatePickerFilter';
import {
  buildFolderNav,
  normalizeTemplateFolderLabel,
  templatesUnderFolder,
} from '../lib/quoteTemplateFolder';
import {
  agencyFitPackWalkthroughPath,
  formatAgencyFitPackToast,
  installAgencyFitPack,
  tripsEmptyShowInstallPack,
} from '../lib/agencyFitPack';
import { Can } from '../components/Can';
import { PackageFolderTree } from '../components/agency/PackageFolderTree';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';
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

type QuoteTemplateRow = {
  id: string;
  name: string;
  content?: {
    destinationHint?: string | null;
    items?: unknown[];
    tags?: string[];
    folder?: string | null;
  } | null;
};

const EMPTY_FORM = {
  title: '',
  partyId: '',
  partyLabel: '',
  startDate: '',
  endDate: '',
  templateId: '',
  adults: 2,
  children: 0,
  childAgesCsv: '',
  childrenWithoutBed: 0,
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
  const { hasAny } = usePermissions();
  const canQuoteWrite = hasAny(CAP.quoteWrite);
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [installingPack, setInstallingPack] = useState(false);
  const [templates, setTemplates] = useState<QuoteTemplateRow[]>([]);
  const [packageFolderIndex, setPackageFolderIndex] = useState<string[]>([]);
  const [packageSiblingOrder, setPackageSiblingOrder] = useState<
    Record<string, string[]>
  >({});
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [packageFolderFilter, setPackageFolderFilter] = useState('');
  const [packageTagFilter, setPackageTagFilter] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

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
      const walkthrough =
        searchParams.get('walkthrough') === '1' ? '&walkthrough=1' : '';
      return `/trips/${id}?tab=quotations${walkthrough}`;
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
    void loadTemplates();
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

  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const res = await api<{
        items: QuoteTemplateRow[];
        folderIndex?: string[];
        siblingOrder?: Record<string, string[]>;
      }>('/quote-templates');
      setTemplates(res.items || []);
      setPackageFolderIndex(res.folderIndex || []);
      setPackageSiblingOrder(res.siblingOrder || {});
    } catch {
      setTemplates([]);
      setPackageFolderIndex([]);
      setPackageSiblingOrder({});
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadTemplates();
  }, [open]);

  useEffect(() => {
    if (open) return;
    setPackageFolderFilter('');
    setPackageTagFilter('');
  }, [open]);

  const filteredTemplates = useMemo(
    () =>
      filterTemplatesByFolderAndTag(templates, {
        folder: packageFolderFilter,
        tag: packageTagFilter,
      }),
    [templates, packageFolderFilter, packageTagFilter],
  );

  const packageOptions = useMemo(() => {
    const sorted = sortQuoteTemplatesForPicker(filteredTemplates);
    return [
      { value: '', label: 'Blank trip (no package)', description: 'Create workspace only' },
      ...sorted.map((t) => ({
        value: t.id,
        label: t.name,
        description: formatPackagePickerDescription(t.content),
      })),
    ];
  }, [filteredTemplates]);

  const packageMetaChips = useMemo(
    () => collectUniquePickerMetaChips(templates),
    [templates],
  );

  const packageFolderNav = useMemo(
    () => buildFolderNav(packageFolderIndex, packageFolderFilter),
    [packageFolderIndex, packageFolderFilter],
  );

  useEffect(() => {
    setForm((prev) => {
      const nextId = clearTemplateIdIfFilteredOut(
        prev.templateId,
        filteredTemplates.map((t) => t.id),
      );
      if (nextId === prev.templateId) return prev;
      return { ...prev, templateId: nextId };
    });
  }, [filteredTemplates]);

  const selectedPackage = templates.find((t) => t.id === form.templateId);
  const packageRequiresStart = Boolean(form.templateId);

  async function installFitPack(opts?: { fromEmpty?: boolean }) {
    setInstallingPack(true);
    try {
      const res = await installAgencyFitPack();
      toastSuccess(formatAgencyFitPackToast(res));
      await loadTemplates();
      if (opts?.fromEmpty) {
        await load();
        const path = agencyFitPackWalkthroughPath(res);
        if (path) {
          navigate(path);
          return;
        }
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not install sample pack');
    } finally {
      setInstallingPack(false);
    }
  }

  async function renamePackageFolder(fromFolder: string) {
    const from = normalizeTemplateFolderLabel(fromFolder);
    if (!from) return;
    const next = window.prompt(
      `Rename or move folder “${from}”.\nEnter new path (blank clears the prefix):`,
      from,
    );
    if (next == null) return;
    await applyPackageFolderRename(from, next);
  }

  async function applyPackageFolderRename(fromFolder: string, toFolderRaw: string) {
    const from = normalizeTemplateFolderLabel(fromFolder);
    if (!from) return;
    try {
      const res = await api<{ updated: number; toFolder: string | null }>(
        '/quote-templates/rename-folder',
        {
          method: 'POST',
          body: JSON.stringify({ fromFolder: from, toFolder: toFolderRaw }),
        },
      );
      toastSuccess(
        res.updated
          ? `Updated ${res.updated} package${res.updated === 1 ? '' : 's'}`
          : 'No packages in that folder',
      );
      const to = normalizeTemplateFolderLabel(res.toFolder ?? toFolderRaw) || '';
      setPackageFolderFilter(to);
      await loadTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not rename folder');
    }
  }

  async function addPackageFolder() {
    const raw = window.prompt(
      'New empty folder path (e.g. Beach/New shelf):',
      packageFolderFilter.trim() ? `${packageFolderFilter.trim()}/` : '',
    );
    if (raw == null) return;
    const folder = normalizeTemplateFolderLabel(raw);
    if (!folder) {
      toastError('Enter a folder path');
      return;
    }
    try {
      await api('/quote-templates/folders', {
        method: 'POST',
        body: JSON.stringify({ folder }),
      });
      toastSuccess(`Folder “${folder}” added`);
      setPackageFolderFilter(folder);
      await loadTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add folder');
    }
  }

  async function removeEmptyPackageFolder(folderRaw: string) {
    const folder = normalizeTemplateFolderLabel(folderRaw);
    if (!folder) return;
    if (
      !window.confirm(
        `Remove empty folder “${folder}” from the package library nav? Packages are not deleted.`,
      )
    ) {
      return;
    }
    try {
      await api('/quote-templates/folders/remove', {
        method: 'POST',
        body: JSON.stringify({ folder }),
      });
      toastSuccess(`Removed “${folder}” from folder nav`);
      setPackageFolderFilter('');
      await loadTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove folder');
    }
  }

  async function movePackageTemplate(
    templateId: string,
    folder: string | null,
  ) {
    try {
      await api(`/quote-templates/${templateId}/move-folder`, {
        method: 'POST',
        body: JSON.stringify({ folder }),
      });
      toastSuccess(
        folder ? `Moved package into “${folder}”` : 'Moved package to library root',
      );
      await loadTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not move package');
    }
  }

  async function reorderPackageSiblings(
    folder: string | null,
    orderedIds: string[],
  ) {
    try {
      const res = await api<{ siblingOrder?: Record<string, string[]> }>(
        '/quote-templates/reorder-siblings',
        {
          method: 'POST',
          body: JSON.stringify({ folder, orderedIds }),
        },
      );
      if (res.siblingOrder) setPackageSiblingOrder(res.siblingOrder);
      else await loadTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not reorder packages');
    }
  }

  async function cascadeDeletePackageFolder(folderRaw: string) {
    const folder = normalizeTemplateFolderLabel(folderRaw);
    if (!folder) return;
    if (
      !window.confirm(
        `Delete all packages under “${folder}” (and nested folders)? Soft-deletes packages; they stay in version history.`,
      )
    ) {
      return;
    }
    try {
      const res = await api<{ deleted: number }>(
        '/quote-templates/folders/cascade-delete',
        {
          method: 'POST',
          body: JSON.stringify({ folder }),
        },
      );
      toastSuccess(
        res.deleted
          ? `Deleted ${res.deleted} package${res.deleted === 1 ? '' : 's'} under “${folder}”`
          : `Cleared folder “${folder}” from nav`,
      );
      setPackageFolderFilter('');
      await loadTemplates();
    } catch (e) {
      toastError(
        e instanceof Error ? e.message : 'Could not delete folder packages',
      );
    }
  }

  async function onCreate() {
    const plan = planCreateTripFromPackage({
      title: form.title,
      partyId: form.partyId || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      templateId: form.templateId || undefined,
      adults: form.adults,
      children: form.children,
      childAges: parseApplyChildAgesCsv(form.childAgesCsv),
      childrenWithoutBed: form.childrenWithoutBed,
    });
    if (!plan.ok) {
      toastError(plan.error);
      return;
    }
    setSubmitting(true);
    try {
      if (plan.apply) {
        const body = fromPackageRequestBody(plan);
        if (!body) {
          toastError('Could not build package request');
          return;
        }
        const created = await api<{
          id: string;
          quoteNumber?: string;
          rematchMatched?: number;
          rematchUnmatched?: number;
        }>('/trips/from-package', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess(
          formatCreateTripFromPackageToast({
            appliedPackage: true,
            quoteNumber: created.quoteNumber,
            packageName: selectedPackage?.name,
            rematchMatched: created.rematchMatched,
            rematchUnmatched: created.rematchUnmatched,
          }),
        );
        setForm(EMPTY_FORM);
        setOpen(false);
        navigate(`/trips/${created.id}?tab=quotations`);
        return;
      }

      const trip = await api<{ id: string }>('/trips', {
        method: 'POST',
        body: JSON.stringify(plan.createBody),
      });
      toastSuccess(formatCreateTripFromPackageToast({ appliedPackage: false }));
      setForm(EMPTY_FORM);
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
              : tripsEmptyShowInstallPack({
                    templateCount: templates.length,
                    templatesLoading,
                  })
                ? 'Install the sample FIT pack for Darjeeling / Goa packages and a demo trip, or create a trip from scratch.'
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
                <div className="flex flex-wrap justify-center gap-2">
                  {tripsEmptyShowInstallPack({
                    templateCount: templates.length,
                    templatesLoading,
                  }) ? (
                    <Button
                      disabled={installingPack || templatesLoading}
                      onClick={() => void installFitPack({ fromEmpty: true })}
                    >
                      <PackagePlus className="size-4" />
                      {installingPack
                        ? 'Installing…'
                        : 'Install sample FIT pack'}
                    </Button>
                  ) : null}
                  <Button
                    variant={
                      tripsEmptyShowInstallPack({
                        templateCount: templates.length,
                        templatesLoading,
                      })
                        ? 'secondary'
                        : 'default'
                    }
                    onClick={() => setOpen(true)}
                  >
                    <Plus className="size-4" />
                    New trip
                  </Button>
                </div>
              ) : null}
            </Can>
          ) : undefined
        }
      />
      <RecordSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setForm(EMPTY_FORM);
        }}
        title="New trip"
        description="Optionally start from a FIT package — travel start shifts hotel nights and rematches rates."
        submitLabel={
          form.templateId ? 'Create & apply package' : 'Create trip'
        }
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
          <FormField
            label="Package (optional)"
            description={
              templatesLoading
                ? 'Loading packages…'
                : templates.length
                  ? 'Creates a draft quote from the package on this trip'
                  : 'No packages yet — install the sample FIT pack'
            }
          >
            {templates.length || templatesLoading ? (
              <div className="space-y-2">
                <FormGrid>
                  <FormField label="Filter by folder">
                    <Input
                      className="h-9"
                      value={packageFolderFilter}
                      onChange={(e) => setPackageFolderFilter(e.target.value)}
                      placeholder="e.g. Hill stations/Darjeeling…"
                    />
                  </FormField>
                  <FormField label="Filter by tag">
                    <Input
                      className="h-9"
                      value={packageTagFilter}
                      onChange={(e) => setPackageTagFilter(e.target.value)}
                      placeholder="e.g. hill…"
                    />
                  </FormField>
                </FormGrid>
                {filteredTemplates.length === 0 &&
                (packageFolderFilter.trim() || packageTagFilter.trim()) ? (
                  <p className="text-xs text-muted-foreground">
                    No packages match this folder/tag filter.
                  </p>
                ) : null}
                <Combobox
                  value={form.templateId}
                  onChange={(templateId) =>
                    setForm({ ...form, templateId: templateId || '' })
                  }
                  placeholder="Blank trip, or pick a package…"
                  options={packageOptions}
                />
                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      {packageFolderNav.breadcrumbs.length ? (
                        <>
                          <button
                            type="button"
                            className="rounded bg-muted px-1.5 py-px font-medium text-muted-foreground hover:bg-muted/80"
                            onClick={() => setPackageFolderFilter('')}
                          >
                            All folders
                          </button>
                          {packageFolderNav.breadcrumbs.map((crumb) => {
                            const active =
                              packageFolderFilter.trim().toLowerCase() ===
                              crumb.path.toLowerCase();
                            return (
                              <span key={crumb.path} className="contents">
                                <span className="text-muted-foreground/70">/</span>
                                <button
                                  type="button"
                                  className={
                                    active
                                      ? 'rounded bg-primary/20 px-1.5 py-px font-medium text-primary'
                                      : 'rounded bg-primary/10 px-1.5 py-px font-medium text-primary hover:bg-primary/15'
                                  }
                                  onClick={() => setPackageFolderFilter(crumb.path)}
                                >
                                  {crumb.label}
                                </button>
                              </span>
                            );
                          })}
                        </>
                      ) : null}
                      <Can anyOf={CAP.quoteWrite}>
                        <button
                          type="button"
                          className="ml-1 rounded border border-border/60 px-1.5 py-px font-medium text-muted-foreground hover:bg-muted/80"
                          onClick={() => void addPackageFolder()}
                        >
                          New folder…
                        </button>
                      </Can>
                    </div>
                    <PackageFolderTree
                      folders={packageFolderIndex}
                      selectedPath={packageFolderFilter}
                      canWrite={canQuoteWrite}
                      onSelect={setPackageFolderFilter}
                      onMove={(from, to) => void applyPackageFolderRename(from, to)}
                      templates={templates.map((t) => ({
                        id: t.id,
                        name: t.name,
                        folder: t.content?.folder,
                      }))}
                      siblingOrder={packageSiblingOrder}
                      onMoveTemplate={(id, folder) =>
                        void movePackageTemplate(id, folder)
                      }
                      onReorderTemplates={(folder, orderedIds) =>
                        void reorderPackageSiblings(folder, orderedIds)
                      }
                      onRename={(path) => void renamePackageFolder(path)}
                      onRemoveEmpty={(path) => void removeEmptyPackageFolder(path)}
                      onCascadeDelete={(path) =>
                        void cascadeDeletePackageFolder(path)
                      }
                      isEmptyFolder={(path) =>
                        !templatesUnderFolder(
                          templates.map((t) => t.content?.folder),
                          path,
                        )
                      }
                    />
                    {packageMetaChips.tags.length ? (
                      <div className="flex flex-wrap gap-1">
                        {packageMetaChips.tags.map((tag) => {
                          const active =
                            packageTagFilter.trim().toLowerCase() ===
                            tag.toLowerCase();
                          return (
                            <button
                              key={`tag-${tag}`}
                              type="button"
                              className={
                                active
                                  ? 'rounded bg-muted px-1.5 py-px text-[10px] font-medium text-foreground ring-1 ring-border'
                                  : 'rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground hover:bg-muted/80'
                              }
                              onClick={() =>
                                setPackageTagFilter(active ? '' : tag)
                              }
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={installingPack}
                onClick={() => void installFitPack()}
              >
                {installingPack ? 'Installing…' : 'Install sample FIT pack'}
              </Button>
            )}
          </FormField>
          <FormGrid>
            <FormField
              label="Travel start"
              required={packageRequiresStart}
              description={
                packageRequiresStart
                  ? 'Required for package date shift + rematch'
                  : 'Optional — Use template skips asking when set'
              }
            >
              <DatePicker
                placeholder="Trip start"
                value={parseDateInput(form.startDate)}
                onChange={(date) =>
                  setForm({ ...form, startDate: formatDateInput(date) })
                }
              />
            </FormField>
            <FormField label="Travel end" description="Optional">
              <DatePicker
                placeholder="Trip end"
                value={parseDateInput(form.endDate)}
                onChange={(date) =>
                  setForm({ ...form, endDate: formatDateInput(date) })
                }
              />
            </FormField>
          </FormGrid>
          {packageRequiresStart &&
          !/^\d{4}-\d{2}-\d{2}$/.test(form.startDate.trim()) ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Set travel start so package hotel nights land on the right dates.
            </p>
          ) : null}
          {form.templateId ? (
            <div className="space-y-3">
              <FormGrid>
                <FormField label="Adults" required>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={form.adults}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        adults: Math.max(1, Math.min(99, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </FormField>
                <FormField label="Children">
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    value={form.children}
                    onChange={(e) => {
                      const children = Math.max(
                        0,
                        Math.min(99, Number(e.target.value) || 0),
                      );
                      setForm({
                        ...form,
                        children,
                        childrenWithoutBed: Math.min(form.childrenWithoutBed, children),
                      });
                    }}
                  />
                </FormField>
              </FormGrid>
              {form.children > 0 ? (
                <FormGrid>
                  <FormField
                    label="Child ages"
                    description="Comma-separated years (0–17). Missing ages default to 8 on apply."
                  >
                    <Input
                      placeholder="e.g. 8, 11"
                      value={form.childAgesCsv}
                      onChange={(e) =>
                        setForm({ ...form, childAgesCsv: e.target.value })
                      }
                    />
                  </FormField>
                  <FormField label="Children without bed">
                    <Input
                      type="number"
                      min={0}
                      max={form.children}
                      value={form.childrenWithoutBed}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          childrenWithoutBed: Math.max(
                            0,
                            Math.min(
                              form.children,
                              Number(e.target.value) || 0,
                            ),
                          ),
                        })
                      }
                    />
                  </FormField>
                </FormGrid>
              ) : null}
            </div>
          ) : null}
          {!tripTravelEndOnOrAfterStart(form.startDate, form.endDate) ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Travel end must be on or after travel start.
            </p>
          ) : null}
        </form>
      </RecordSheet>
    </ListPageShell>
  );
}
