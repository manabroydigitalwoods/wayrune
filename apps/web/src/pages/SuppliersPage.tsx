import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Building2,
  ClipboardList,
  FileUser,
  Import,
  IndianRupee,
  MoreHorizontal,
  Plus,
  UserPlus,
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
  EmailInput,
  Input,
  ListPageShell,
  PageHeader,
  PhoneInput,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  StorageKeys,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { PlaceSinglePicker } from '../components/places/PlacePicker';
import { PartnerInventoryPanel } from '../components/partner/PartnerInventoryPanel';
import { SupplierContractsPanel } from '../components/agency/SupplierContractsPanel';
import { SupplierHotelRatesPanel } from '../components/agency/SupplierHotelRatesPanel';
import { toPlaceRef, type PlaceRef } from '../lib/placeRefs';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { isDemoOperateSupplier } from '../lib/demoOperate';
import { formatSupplierImportSkipReason } from '../lib/supplierImportSkip';
import {
  SUPPLIER_TYPE_GROUPS,
  contactCompletenessLabel,
  isInventorySupplierType,
  isStaySupplierType,
  supplierContractListLabel,
  supplierHasRateCatalog,
  supplierProfileCompletenessLabel,
  supplierRateListLabel,
  supplierTypeLabel,
} from '../lib/supplierTypes';

type Supplier = {
  id: string;
  name: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  profileJson?: Record<string, unknown> | null;
  linkedOrganizationId?: string | null;
  linkedOrganization?: { id: string; name: string; kind: string } | null;
  linkedAsset?: { id: string; name: string; assetKind: string } | null;
  roomProductCount?: number;
  activeRateCount?: number | null;
  activeContractCount?: number;
};

function emptyCreateForm() {
  return {
    name: '',
    type: 'hotel',
    email: '',
    phone: '',
    placeId: null as PlaceRef | null,
  };
}

export function SuppliersPage() {
  useDocumentTitle('Suppliers');
  const { navigate } = useOrgNavigate();
  const { has, hasAny } = usePermissions();
  const canContracts = has('ops.read');
  const canNetworkWrite = hasAny(CAP.networkWrite);
  const canOpenInventory = hasAny(CAP.supplierInventory);
  const canRates = hasAny(CAP.ratesWrite) || has('quote.read');
  const canProfile =
    hasAny(CAP.supplierWrite) || has('trip.read') || has('network.read');
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryTarget, setInventoryTarget] = useState<{
    assetId: string;
    assetKind: string;
    name: string;
  } | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [contractTarget, setContractTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [ratesTarget, setRatesTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [form, setForm] = useState(emptyCreateForm);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState(
    'name,type,email,phone\n',
  );
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api<Supplier[]>('/suppliers');
      setItems(res);
      setError('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load suppliers';
      setError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function goToDetail(id: string) {
    navigate(`${AGENCY_ROUTES.suppliers}/${id}`);
  }

  async function create() {
    if (!form.name.trim()) {
      toastError('Name is required');
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      toastError('Add a phone or email');
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
      };
      const placeRef = toPlaceRef(form.placeId);
      if (placeRef?.placeId) payload.placeId = placeRef.placeId;
      const created = await api<Supplier>('/suppliers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toastSuccess('Supplier created — complete the profile next');
      setOpen(false);
      setForm(emptyCreateForm());
      navigate(`${AGENCY_ROUTES.suppliers}/${created.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create supplier');
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
    const nameIdx = headers.indexOf('name');
    const typeIdx = headers.indexOf('type');
    const emailIdx = headers.indexOf('email');
    const phoneIdx = headers.indexOf('phone');
    if (nameIdx < 0) {
      toastError('CSV must include a name column');
      return;
    }
    const rows = lines
      .slice(1)
      .map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        return {
          name: cols[nameIdx] || '',
          type: typeIdx >= 0 ? cols[typeIdx] || undefined : undefined,
          email: emailIdx >= 0 ? cols[emailIdx] || undefined : undefined,
          phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
        };
      })
      .filter((r) => r.name);

    if (!rows.length) {
      toastError('No valid rows found');
      return;
    }

    setImporting(true);
    try {
      const res = await api<{
        imported: number;
        skipped: number;
        results?: Array<{ status: 'created' | 'skipped'; reason?: string }>;
      }>('/suppliers/import/csv', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      const firstSkip = res.results?.find((r) => r.status === 'skipped')?.reason;
      const skipHint = firstSkip
        ? ` — ${formatSupplierImportSkipReason(firstSkip)}`
        : '';
      toastSuccess(`Imported ${res.imported}, skipped ${res.skipped}${skipHint}`);
      setImportOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const columns = useMemo<ColumnDef<Supplier>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        meta: { label: 'Name' },
        enableHiding: false,
        size: 200,
        minSize: 140,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {canProfile ? (
                <button
                  type="button"
                  className="truncate font-medium text-primary hover:underline"
                  onClick={() => goToDetail(s.id)}
                >
                  {s.name}
                </button>
              ) : (
                <span className="truncate font-medium text-primary">{s.name}</span>
              )}
              {s.linkedOrganization ? (
                <StatusBadge value="network" label="Network" showIcon={false} />
              ) : null}
              {isDemoOperateSupplier(s) ? (
                <StatusBadge
                  value="draft"
                  label="Demo — not for live booking"
                  showIcon={false}
                />
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'type',
        accessorFn: (r) => r.type,
        header: 'Type',
        meta: { label: 'Type' },
        size: 150,
        minSize: 120,
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.type}
            label={supplierTypeLabel(row.original.type)}
            showIcon={false}
          />
        ),
      },
      {
        id: 'contact',
        header: 'Contact',
        meta: { label: 'Contact' },
        size: 110,
        minSize: 96,
        accessorFn: (r) =>
          contactCompletenessLabel({
            name: r.name,
            email: r.email,
            phone: r.phone,
          }),
        cell: ({ row }) => {
          const label = contactCompletenessLabel({
            name: row.original.name,
            email: row.original.email,
            phone: row.original.phone,
          });
          return (
            <span
              className={
                label === 'Complete'
                  ? 'text-muted-foreground'
                  : 'text-amber-800 dark:text-amber-200'
              }
            >
              {label}
            </span>
          );
        },
      },
      {
        id: 'profile',
        header: 'Profile',
        meta: { label: 'Profile' },
        size: 120,
        minSize: 100,
        accessorFn: (r) =>
          supplierProfileCompletenessLabel(
            r.type,
            r.profileJson,
            isStaySupplierType(r.type)
              ? { roomProductCount: r.roomProductCount ?? 0 }
              : undefined,
          ),
        cell: ({ row }) => {
          const label = supplierProfileCompletenessLabel(
            row.original.type,
            row.original.profileJson,
            isStaySupplierType(row.original.type)
              ? { roomProductCount: row.original.roomProductCount ?? 0 }
              : undefined,
          );
          const complete = label === 'Complete' || label === 'Optional';
          return (
            <span
              className={
                complete
                  ? 'text-muted-foreground'
                  : 'text-amber-800 dark:text-amber-200'
              }
            >
              {label}
            </span>
          );
        },
      },
      ...(canRates
        ? [
            {
              id: 'rates',
              header: 'Rates',
              meta: { label: 'Rates' },
              size: 110,
              minSize: 96,
              accessorFn: (r: Supplier) =>
                supplierHasRateCatalog(r.type)
                  ? supplierRateListLabel(r.activeRateCount) ?? ''
                  : '',
              cell: ({ row }: { row: { original: Supplier } }) => {
                if (!supplierHasRateCatalog(row.original.type)) {
                  return <span className="text-muted-foreground">—</span>;
                }
                const label = supplierRateListLabel(row.original.activeRateCount);
                if (!label) {
                  return <span className="text-muted-foreground">—</span>;
                }
                const ok = label !== 'No rates';
                return (
                  <span
                    className={
                      ok
                        ? 'text-muted-foreground'
                        : 'text-amber-800 dark:text-amber-200'
                    }
                  >
                    {label}
                  </span>
                );
              },
            } satisfies ColumnDef<Supplier>,
          ]
        : []),
      ...(canContracts
        ? [
            {
              id: 'contracts',
              header: 'Contracts',
              meta: { label: 'Contracts' },
              size: 120,
              minSize: 100,
              accessorFn: (r: Supplier) =>
                supplierContractListLabel(r.activeContractCount) ?? '',
              cell: ({ row }: { row: { original: Supplier } }) => {
                const label = supplierContractListLabel(
                  row.original.activeContractCount,
                );
                const ok = label !== 'None active';
                return (
                  <span
                    className={
                      ok
                        ? 'text-muted-foreground'
                        : 'text-amber-800 dark:text-amber-200'
                    }
                  >
                    {label}
                  </span>
                );
              },
            } satisfies ColumnDef<Supplier>,
          ]
        : []),
      {
        id: 'asset',
        header: 'Linked asset',
        meta: { label: 'Linked asset' },
        size: 180,
        minSize: 140,
        accessorFn: (r) => r.linkedAsset?.name || '',
        cell: ({ row }) =>
          row.original.linkedAsset ? (
            <span className="text-muted-foreground">
              {row.original.linkedAsset.name}
              <span className="text-xs opacity-70">
                {' '}
                · {row.original.linkedAsset.assetKind.replace(/_/g, ' ')}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'network',
        header: 'Linked partner',
        meta: { label: 'Linked partner' },
        size: 140,
        minSize: 110,
        accessorFn: (r) => r.linkedOrganization?.kind || '',
        cell: ({ row }) =>
          row.original.linkedOrganization ? (
            <span className="text-muted-foreground">
              {row.original.linkedOrganization.kind.replace(/_/g, ' ')}
            </span>
          ) : (
            <span className="text-muted-foreground">Local only</span>
          ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        meta: { label: 'Email' },
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground">
            {row.original.email || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        meta: { label: 'Phone' },
        size: 140,
        minSize: 120,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.phone || '—'}
          </span>
        ),
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
          const s = row.original;
          const stay = isStaySupplierType(s.type);
          const inventory = isInventorySupplierType(s.type);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Supplier actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {s.name}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canProfile ? (
                  <DropdownMenuItem onClick={() => goToDetail(s.id)}>
                    <FileUser />
                    Open
                  </DropdownMenuItem>
                ) : null}
                {stay && canRates ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setRatesTarget({ id: s.id, name: s.name });
                      setRatesOpen(true);
                    }}
                  >
                    <IndianRupee />
                    Rate chart
                  </DropdownMenuItem>
                ) : null}
                {canContracts ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setContractTarget({ id: s.id, name: s.name });
                      setContractOpen(true);
                    }}
                  >
                    <ClipboardList />
                    Contracts
                  </DropdownMenuItem>
                ) : null}
                {inventory && canOpenInventory ? (
                  <DropdownMenuItem onClick={() => void openInventory(s)}>
                    <ClipboardList />
                    Inventory
                  </DropdownMenuItem>
                ) : null}
                {s.linkedOrganization ? (
                  <DropdownMenuItem disabled>
                    <UserPlus />
                    Claimed
                  </DropdownMenuItem>
                ) : canNetworkWrite ? (
                  <DropdownMenuItem onClick={() => void inviteSupplier(s)}>
                    <UserPlus />
                    Invite to claim
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function openInventory(supplier: Supplier) {
    try {
      if (supplier.linkedOrganization && supplier.linkedAsset) {
        toastSuccess(
          `${supplier.linkedOrganization.name} manages this inventory — switch to their ${supplier.linkedOrganization.kind.replace(/_/g, ' ')} workspace to edit.`,
        );
        return;
      }
      let assetId = supplier.linkedAsset?.id;
      let assetKind = supplier.linkedAsset?.assetKind || supplier.type;
      if (!assetId) {
        const asset = await api<{ id: string; assetKind: string }>(
          '/inventory/shadow-asset',
          {
            method: 'POST',
            body: JSON.stringify({ supplierId: supplier.id }),
          },
        );
        assetId = asset.id;
        assetKind = asset.assetKind;
        await load();
      }
      setInventoryTarget({
        assetId,
        assetKind,
        name: supplier.name,
      });
      setInventoryOpen(true);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not open inventory');
    }
  }

  async function inviteSupplier(supplier: Supplier) {
    try {
      const res = await api<{ claimPath: string; claimToken: string }>(
        `/network/suppliers/${supplier.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ email: supplier.email || undefined }),
        },
      );
      const url = `${window.location.origin}${res.claimPath}`;
      await navigator.clipboard.writeText(url);
      toastSuccess('Invite link copied — send it to the supplier to claim');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create invite');
    }
  }

  return (
    <ListPageShell>
      <PageHeader
        icon={Building2}
        title="Suppliers"
        subtitle="Quick-create vendors, then open a supplier to complete the profile, rates, and contracts."
        className="mb-4 shrink-0"
        actions={
          <Can anyOf={CAP.supplierWrite}>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Import className="size-4" />
                Import CSV
              </Button>
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                New supplier
              </Button>
            </div>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        error={error}
        pageSize={25}
        searchKey="name"
        searchPlaceholder="Search suppliers…"
        columnVisibilityKey={StorageKeys.suppliers.columns}
        emptyTitle="No suppliers yet"
        emptyDescription="Create a supplier with name, type, and contact — then open it to complete the profile."
        emptyIcon={Building2}
        emptyAction={
          <Can anyOf={CAP.supplierWrite}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              New supplier
            </Button>
          </Can>
        }
      />
      <RecordSheet
        open={importOpen}
        onOpenChange={(next) => {
          setImportOpen(next);
          if (!next) setImportText('name,type,email,phone\n');
        }}
        title="Import suppliers"
        description="CSV columns: name, type, email, phone. Type examples: hotel, car_rental, activity. Email or phone required for Operate-ready."
        submitLabel="Import"
        submitting={importing}
        onSubmit={() => void importCsv()}
      >
        <FormField label="CSV">
          <textarea
            className="min-h-[12rem] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            spellCheck={false}
          />
        </FormField>
      </RecordSheet>
      <RecordSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setForm(emptyCreateForm());
        }}
        title="New supplier"
        description="Name, type, and contact only. Property photos, fleet notes, and credentials go on the supplier detail page."
        submitLabel="Create"
        onSubmit={create}
      >
        <FormField label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Supplier name"
            required
          />
        </FormField>
        <FormField label="Type" required>
          <div className="space-y-3">
            {SUPPLIER_TYPE_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <SuggestionChips
                  aria-label={`${group.label} supplier type`}
                  allowDeselect={false}
                  options={group.options}
                  value={
                    group.options.some((o) => o.value === form.type)
                      ? form.type
                      : ''
                  }
                  onChange={(type) => {
                    if (type) setForm({ ...form, type });
                  }}
                />
              </div>
            ))}
          </div>
        </FormField>
        <FormField label="Email">
          <EmailInput
            value={form.email}
            onChange={(email) => setForm({ ...form, email })}
            placeholder="ops@…"
          />
        </FormField>
        <FormField label="Phone">
          <PhoneInput
            value={form.phone}
            onChange={(phone) => setForm({ ...form, phone })}
          />
        </FormField>
        <p className="text-xs text-muted-foreground">Phone or email required.</p>
        <PlaceSinglePicker
          label="Near place (optional)"
          value={form.placeId}
          onChange={(placeId) => setForm({ ...form, placeId })}
          placeholder="City or area for discovery"
        />
      </RecordSheet>
      <RecordSheet
        open={inventoryOpen}
        onOpenChange={(next) => {
          setInventoryOpen(next);
          if (!next) setInventoryTarget(null);
        }}
        title={
          inventoryTarget ? `Inventory · ${inventoryTarget.name}` : 'Inventory'
        }
        description="Local shadow asset under your agency. Claimed partners edit inventory in their own workspace."
        submitLabel="Done"
        onSubmit={() => setInventoryOpen(false)}
      >
        {inventoryTarget ? (
          <PartnerInventoryPanel
            assetId={inventoryTarget.assetId}
            assetKind={inventoryTarget.assetKind}
          />
        ) : null}
      </RecordSheet>
      <RecordSheet
        open={ratesOpen}
        onOpenChange={(next) => {
          setRatesOpen(next);
          if (!next) setRatesTarget(null);
        }}
        title={ratesTarget ? `Rate chart · ${ratesTarget.name}` : 'Rate chart'}
        description="Negotiated room-night costs used when quoting this supplier."
        submitLabel="Done"
        onSubmit={() => setRatesOpen(false)}
      >
        {ratesTarget ? (
          <SupplierHotelRatesPanel
            supplierId={ratesTarget.id}
            supplierName={ratesTarget.name}
          />
        ) : null}
      </RecordSheet>
      <RecordSheet
        open={contractOpen}
        onOpenChange={(next) => {
          setContractOpen(next);
          if (!next) setContractTarget(null);
        }}
        title={
          contractTarget ? `Contracts · ${contractTarget.name}` : 'Contracts'
        }
        description="Payment terms, preferred flag, and contract status for this supplier."
        submitLabel="Done"
        onSubmit={() => setContractOpen(false)}
      >
        {contractTarget ? (
          <SupplierContractsPanel
            supplierId={contractTarget.id}
            supplierName={contractTarget.name}
          />
        ) : null}
      </RecordSheet>
    </ListPageShell>
  );
}
