import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, Building2, Copy, MoreHorizontal, Pencil, Plus, Upload } from 'lucide-react';
import { CreatePartySchema, parseWithFieldErrors } from '@travel/contracts';
import {
  Button,
  Combobox,
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
  FormGrid,
  StatusBadge,
  StorageKeys,
  formatDate,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../api';
import { useAuth } from '../auth';
import { Can } from '../components/Can';
import { CAP, TRAVEL_REQUEST_PERMISSIONS } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { agencyClientsLabel, isDmcOrgKind } from '../lib/orgKind';
import { PARTIES_PAGE_COPY, usePartiesPageVariant } from '../lib/agencyPageVariants';
import { type Party, type PartyDetail, partyHubPath } from '../lib/partyTypes';
import { useTravelRequestLauncher } from '../lib/travelRequestLauncher';
import { useCanonicalCreateVisibility } from '../hooks/useCanonicalCreateVisibility';

const emptyForm = {
  type: 'organization',
  displayName: '',
  email: '',
  phone: '',
  businessType: 'travel_agency',
};

const B2B_TYPES = [
  { value: 'travel_agency', label: 'Travel agency' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'reseller', label: 'Reseller' },
  { value: 'dmc', label: 'DMC' },
  { value: '', label: '— none —' },
];

export function PartiesPage() {
  const { me } = useAuth();
  const { hasAny, all } = usePermissions();
  const canCreateTravelRequest = all(TRAVEL_REQUEST_PERMISSIONS);
  const openTravelRequest = useTravelRequestLauncher();
  const canWrite = hasAny(CAP.partyWrite);
  const showNewClient = useCanonicalCreateVisibility('party');
  const dmc = isDmcOrgKind(me?.organization.kind);
  const variant = usePartiesPageVariant();
  const pageCopy = PARTIES_PAGE_COPY[variant];
  const clientsLabel = agencyClientsLabel(me?.organization.kind);
  const title = variant === 'all' ? clientsLabel : pageCopy.title;
  useDocumentTitle(variant === 'all' ? clientsLabel : pageCopy.documentTitle);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('name,email,phone,type\n');
  const [importing, setImporting] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PartyDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [b2bOnly, setB2bOnly] = useState(variant === 'all' ? dmc : false);
  const [form, setForm] = useState(() =>
    dmc
      ? emptyForm
      : { type: 'individual', displayName: '', email: '', phone: '', businessType: '' },
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState({ displayName: '', email: '', phone: '' });
  const [savingDetail, setSavingDetail] = useState(false);
  const [contactForm, setContactForm] = useState({ fullName: '', email: '', phone: '' });
  const [addingContact, setAddingContact] = useState(false);

  // Legacy deep links → customer hub
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    navigate(partyHubPath(openId), { replace: true });
  }, [searchParams, navigate]);

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
      const res = await api<{ items: Party[] }>('/parties?pageSize=100');
      setItems(res.items);
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

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<PartyDetail>(`/parties/${detailId}`);
        if (!cancelled) {
          setDetail(res);
          setEditForm({
            displayName: res.displayName,
            email: res.email || '',
            phone: res.phone || '',
          });
        }
      } catch (e) {
        if (!cancelled) reportError(e, 'Could not load client');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  async function reloadDetail() {
    if (!detailId) return;
    const res = await api<PartyDetail>(`/parties/${detailId}`);
    setDetail(res);
    setEditForm({
      displayName: res.displayName,
      email: res.email || '',
      phone: res.phone || '',
    });
    await load();
  }

  async function saveDetail() {
    if (!detailId || !editForm.displayName.trim()) {
      toastError('Client name is required');
      return;
    }
    setSavingDetail(true);
    try {
      await api(`/parties/${detailId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: editForm.displayName.trim(),
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
        }),
      });
      toastSuccess('Client updated');
      await reloadDetail();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save client');
    } finally {
      setSavingDetail(false);
    }
  }

  async function addContact() {
    if (!detailId || !contactForm.fullName.trim()) {
      toastError('Contact name is required');
      return;
    }
    setAddingContact(true);
    try {
      await api(`/parties/${detailId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: contactForm.fullName.trim(),
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
        }),
      });
      toastSuccess('Contact added');
      setContactForm({ fullName: '', email: '', phone: '' });
      await reloadDetail();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add contact');
    } finally {
      setAddingContact(false);
    }
  }

  async function onCreate() {
    const parsed = parseWithFieldErrors(CreatePartySchema, form);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await api('/parties', { method: 'POST', body: JSON.stringify(parsed.data) });
      toastSuccess('Client created');
      setForm(
        dmc
          ? emptyForm
          : { type: 'individual', displayName: '', email: '', phone: '', businessType: '' },
      );
      setOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create client');
    } finally {
      setSubmitting(false);
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
    const emailIdx = headers.indexOf('email');
    const phoneIdx = headers.indexOf('phone');
    const typeIdx = headers.indexOf('type');
    if (nameIdx < 0) {
      toastError('CSV must include a name column');
      return;
    }
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      const typeRaw = typeIdx >= 0 ? cols[typeIdx] : '';
      const type =
        typeRaw === 'organization' || typeRaw === 'individual' ? typeRaw : undefined;
      return {
        name: cols[nameIdx] || '',
        email: emailIdx >= 0 ? cols[emailIdx] || undefined : undefined,
        phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
        type,
      };
    }).filter((r) => r.name);

    if (!rows.length) {
      toastError('No valid rows found');
      return;
    }

    setImporting(true);
    try {
      const res = await api<{ imported: number; skipped: number }>(
        '/parties/import/csv',
        {
          method: 'POST',
          body: JSON.stringify({ rows }),
        },
      );
      toastSuccess(`Imported ${res.imported}, skipped ${res.skipped}`);
      setImportOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const columns = useMemo<ColumnDef<Party>[]>(
    () => [
      {
        accessorKey: 'displayName',
        header: 'Name',
        meta: { label: 'Name' },
        enableHiding: false,
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => navigate(partyHubPath(row.original.id))}
          >
            {row.original.displayName}
          </button>
        ),
      },
      {
        id: 'type',
        accessorFn: (r) => r.type,
        header: 'Type',
        meta: { label: 'Type' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => <StatusBadge value={row.original.type} />,
      },
      ...(variant === 'all'
        ? [
            {
              id: 'businessType',
              accessorFn: (r: Party) => r.businessType || '',
              header: 'B2B',
              meta: { label: 'B2B' },
              size: 120,
              minSize: 100,
              cell: ({ row }: { row: { original: Party } }) =>
                row.original.businessType ? (
                  <StatusBadge value={row.original.businessType} showIcon={false} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            } as ColumnDef<Party>,
          ]
        : []),
      {
        accessorKey: 'phone',
        header: 'Phone',
        meta: { label: 'Phone' },
        size: 150,
        minSize: 120,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.phone || '—'}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        meta: { label: 'Email' },
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground">{row.original.email || '—'}</span>
        ),
      },
      {
        id: 'updatedAt',
        accessorFn: (r) => r.updatedAt,
        header: 'Updated',
        meta: { label: 'Updated' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDate(row.original.updatedAt)}</span>
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
          const party = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Customer actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {party.displayName}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(partyHubPath(party.id))}>
                  <ArrowUpRight />
                  Open hub
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDetailId(party.id)}>
                  <Pencil />
                  Quick edit
                </DropdownMenuItem>
                {party.phone ? (
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(party.phone!);
                        toastSuccess('Phone copied');
                      } catch {
                        toastError('Could not copy phone');
                      }
                    }}
                  >
                    <Copy />
                    Copy phone
                  </DropdownMenuItem>
                ) : null}
                {party.email ? (
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(party.email!);
                        toastSuccess('Email copied');
                      } catch {
                        toastError('Could not copy email');
                      }
                    }}
                  >
                    <Copy />
                    Copy email
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [navigate, variant],
  );

  const visibleItems = useMemo(
    () => (b2bOnly ? items.filter((p) => Boolean(p.businessType) || p.type === 'organization') : items),
    [items, b2bOnly],
  );

  return (
    <ListPageShell>
      <PageHeader
        icon={Building2}
        title={title}
        subtitle={
          variant === 'all' && dmc
            ? 'Agency and corporate buyers you sell packages to — B2B first.'
            : pageCopy.subtitle
        }
        className="mb-4 shrink-0"
        actions={
          <div className="flex flex-wrap gap-2">
            {variant === 'all' ? (
              <Button
                type="button"
                size="sm"
                variant={b2bOnly ? 'default' : 'outline'}
                onClick={() => setB2bOnly((v) => !v)}
              >
                {b2bOnly ? 'B2B filter on' : 'Show B2B'}
              </Button>
            ) : null}
            <Can anyOf={CAP.partyWrite}>
              <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Import CSV
              </Button>
              {showNewClient ? (
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4" />
                  {variant === 'customers' ? 'New customer' : 'New client'}
                </Button>
              ) : null}
            </Can>
          </div>
        }
      />
      <DataTable
        columns={columns}
        data={visibleItems}
        loading={loading}
        error={error}
        pageSize={25}
        searchKey="displayName"
        searchPlaceholder={variant === 'customers' ? 'Search customers…' : 'Search clients…'}
        columnVisibilityKey={StorageKeys.parties.columns}
        facets={[
          {
            id: 'type',
            columnId: 'type',
            label: 'Type',
            options: [
              { value: 'individual', label: 'Individual' },
              { value: 'organization', label: 'Organization' },
            ],
          },
        ]}
        emptyTitle={dmc ? 'No B2B clients yet' : 'No clients yet'}
        emptyDescription={
          dmc
            ? 'Add a buying agency or corporate account to start packaging.'
            : 'Add your first client or agency account.'
        }
        emptyAction={
          <Can anyOf={CAP.partyWrite}>
            {showNewClient ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              New client
            </Button>
            ) : canCreateTravelRequest ? (
              <Button onClick={() => openTravelRequest()}>
                <Plus className="size-4" />
                New customer call
              </Button>
            ) : null}
          </Can>
        }
        emptyIcon={Building2}
      />
      <RecordSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import clients (CSV)"
        description="Columns: name, email, phone, type (individual|organization). Duplicates by email are skipped."
        submitLabel="Import"
        submitting={importing}
        onSubmit={() => void importCsv()}
      >
        <FormField label="CSV">
          <textarea
            className="min-h-[12rem] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
        </FormField>
      </RecordSheet>

      <RecordSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFieldErrors({});
        }}
        title={dmc ? 'New B2B client' : 'New client'}
        description={
          dmc
            ? 'Buying agency or corporate account for ground packages.'
            : 'Create a client or organization record.'
        }
        submitLabel="Add client"
        submitting={submitting}
        onSubmit={onCreate}
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onCreate();
          }}
        >
          <FormGrid>
            <FormField label="Type" required htmlFor="party-type" error={fieldErrors.type}>
              <Combobox
                value={form.type}
                onChange={(type) => patchForm({ type })}
                options={[
                  { value: 'individual', label: 'Individual' },
                  { value: 'organization', label: 'Organization' },
                ]}
              />
            </FormField>
            <FormField label="Client / company name" required error={fieldErrors.displayName}>
              <Input
                value={form.displayName}
                onChange={(e) => patchForm({ displayName: e.target.value })}
                placeholder={dmc ? 'e.g. North India Tours' : 'e.g. Sharma Family Travels'}
                aria-invalid={Boolean(fieldErrors.displayName)}
                required
              />
            </FormField>
            <FormField label="B2B type" error={fieldErrors.businessType}>
              <Combobox
                value={form.businessType}
                onChange={(businessType) => patchForm({ businessType })}
                options={B2B_TYPES}
              />
            </FormField>
          </FormGrid>
          <FormField label="Email" error={fieldErrors.email}>
            <EmailInput
              value={form.email}
              onChange={(email) => patchForm({ email })}
              placeholder="name@…"
              aria-invalid={Boolean(fieldErrors.email)}
            />
          </FormField>
          <FormField label="Phone" error={fieldErrors.phone}>
            <PhoneInput
              value={form.phone}
              onChange={(phone) => patchForm({ phone })}
              aria-invalid={Boolean(fieldErrors.phone)}
            />
          </FormField>
        </form>
      </RecordSheet>

      <RecordSheet
        open={Boolean(detailId)}
        onOpenChange={(next) => {
          if (!next) setDetailId(null);
        }}
        title={detail?.displayName || 'Quick edit'}
        description="Update contact details — open the hub for history and trips."
        cancelLabel="Close"
      >
        {!detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={detail.type} />
              {detail.businessType ? (
                <StatusBadge value={detail.businessType} showIcon={false} />
              ) : null}
            </div>

            <section className="space-y-3">
              <FormGrid>
                <FormField label="Name" required>
                  <Input
                    value={editForm.displayName}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, displayName: e.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Phone">
                  <PhoneInput
                    value={editForm.phone}
                    disabled={!canWrite}
                    onChange={(phone) => setEditForm((f) => ({ ...f, phone }))}
                  />
                </FormField>
                <FormField label="Email">
                  <EmailInput
                    value={editForm.email}
                    disabled={!canWrite}
                    onChange={(email) => setEditForm((f) => ({ ...f, email }))}
                  />
                </FormField>
              </FormGrid>
              <div className="flex flex-wrap gap-2">
                <Can anyOf={CAP.partyWrite}>
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingDetail}
                    onClick={() => void saveDetail()}
                  >
                    {savingDetail ? 'Saving…' : 'Save'}
                  </Button>
                </Can>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const id = detail.id;
                    setDetailId(null);
                    navigate(partyHubPath(id));
                  }}
                >
                  Open customer hub
                </Button>
              </div>
            </section>

            <section className="space-y-3 border-t border-border/50 pt-4">
              <h3 className="text-sm font-semibold">Contacts</h3>
              {(detail.contacts || []).length ? (
                <ul className="space-y-2">
                  {detail.contacts!.slice(0, 3).map((c) => (
                    <li key={c.id} className="rounded-lg border border-border/50 px-3 py-2 text-sm">
                      <div className="font-medium">{c.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No extra contacts yet.</p>
              )}
              <Can anyOf={CAP.partyWrite}>
                <FormField label="Add contact">
                  <Input
                    value={contactForm.fullName}
                    onChange={(e) =>
                      setContactForm((f) => ({ ...f, fullName: e.target.value }))
                    }
                    placeholder="Contact name"
                  />
                </FormField>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={addingContact}
                  onClick={() => void addContact()}
                >
                  {addingContact ? 'Adding…' : 'Add contact'}
                </Button>
              </Can>
            </section>
          </div>
        )}
      </RecordSheet>
    </ListPageShell>
  );
}
