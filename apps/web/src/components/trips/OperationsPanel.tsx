import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CircleSlash, Network } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Combobox,
  ConfirmDialog,
  FormGrid,
  Input,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type Booking = {
  id: string;
  type: string;
  title: string;
  status: string;
  confirmationRef?: string | null;
  voucherNote?: string | null;
  costAmount?: string | number | null;
  supplierId?: string | null;
  supplier?: { id: string; name: string } | null;
};

type Readiness = {
  items: Array<{ id: string; label: string; done: boolean }>;
  allDone: boolean;
};

type Supplier = {
  id: string;
  name: string;
  linkedOrganizationId?: string | null;
  linkedOrganization?: { id: string; name: string; kind: string } | null;
};

type NetworkPartner = {
  organizationId: string;
  name: string;
  kind: string;
  status: string;
  city?: string | null;
  localSupplierId?: string | null;
};

const BOOKING_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'activity', label: 'Activity' },
  { value: 'flight_ref', label: 'Flight ref' },
  { value: 'other', label: 'Other' },
];

const BOOKING_STATUSES = [
  { value: 'required', label: 'Required' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'sent', label: 'Sent' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'held', label: 'Held' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'pending', label: 'Pending' },
  { value: 'requested', label: 'Requested' },
];

function emptyBookingForm() {
  return {
    type: 'hotel',
    title: '',
    supplierId: '',
    supplierName: '',
    confirmationRef: '',
    voucherNote: '',
    costAmount: '',
    status: 'pending',
  };
}

export function OperationsPanel({
  tripId,
  status,
  onChanged,
}: {
  tripId: string;
  status: string;
  onChanged: () => Promise<void> | void;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [networkPartners, setNetworkPartners] = useState<NetworkPartner[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyBookingForm);
  const [submitting, setSubmitting] = useState(false);
  const [networkPick, setNetworkPick] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkingSrId, setLinkingSrId] = useState<string | null>(null);
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.tripWrite);

  async function load() {
    try {
      const [b, r, s] = await Promise.all([
        api<Booking[]>(`/trips/${tripId}/bookings`),
        api<Readiness>(`/trips/${tripId}/readiness`),
        api<Supplier[]>('/suppliers'),
      ]);
      setBookings(b);
      setReadiness(r);
      setSuppliers(Array.isArray(s) ? s : []);
      try {
        const partners = await api<NetworkPartner[]>('/network/followed-partners');
        setNetworkPartners(Array.isArray(partners) ? partners : []);
      } catch {
        setNetworkPartners([]);
      }
    } catch (e) {
      reportError(e, 'Could not load operations');
    }
  }

  useEffect(() => {
    void load();
  }, [tripId]);

  const openBookings = useMemo(
    () => bookings.filter((b) => b.status !== 'confirmed' && b.status !== 'cancelled').length,
    [bookings],
  );
  const readinessDone = readiness?.items.filter((i) => i.done).length || 0;
  const readinessTotal = readiness?.items.length || 0;

  async function resolveSupplierId(): Promise<string | null> {
    if (networkPick) {
      const partner = networkPartners.find((p) => p.organizationId === networkPick);
      if (partner?.localSupplierId) return partner.localSupplierId;
      const created = await api<{ id: string }>('/network/suppliers', {
        method: 'POST',
        body: JSON.stringify({ partnerOrganizationId: networkPick }),
      });
      return created.id;
    }
    if (form.supplierId) return form.supplierId;
    if (!form.supplierName.trim()) return null;
    const existing = suppliers.find(
      (s) => s.name.toLowerCase() === form.supplierName.trim().toLowerCase(),
    );
    if (existing) return existing.id;
    const created = await api<{ id: string }>('/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: form.supplierName.trim(), type: form.type }),
    });
    return created.id;
  }

  async function saveNewBooking() {
    if (!form.title.trim()) {
      toastError('Enter a booking title');
      return;
    }
    setSubmitting(true);
    try {
      const supplierId = await resolveSupplierId();
      await api(`/trips/${tripId}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          title: form.title.trim(),
          supplierId,
          costAmount: form.costAmount ? Number(form.costAmount) : null,
        }),
      });
      toastSuccess('Booking added');
      setAddOpen(false);
      setForm(emptyBookingForm());
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add booking');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(booking: Booking) {
    setEditingId(booking.id);
    setForm({
      type: booking.type,
      title: booking.title,
      supplierId: booking.supplierId || booking.supplier?.id || '',
      supplierName: '',
      confirmationRef: booking.confirmationRef || '',
      voucherNote: booking.voucherNote || '',
      costAmount: booking.costAmount != null ? String(Number(booking.costAmount)) : '',
      status: booking.status,
    });
    setEditOpen(true);
  }

  async function saveEditBooking() {
    if (!editingId || !form.title.trim()) {
      toastError('Enter a booking title');
      return;
    }
    setSubmitting(true);
    try {
      let supplierId = form.supplierId || null;
      if (!supplierId && form.supplierName.trim()) {
        supplierId = await resolveSupplierId();
      }
      await api(`/trips/${tripId}/bookings/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: form.title.trim(),
          type: form.type,
          status: form.status,
          confirmationRef: form.confirmationRef.trim() || null,
          voucherNote: form.voucherNote.trim() || null,
          supplierId,
          costAmount: form.costAmount ? Number(form.costAmount) : null,
        }),
      });
      toastSuccess('Booking updated');
      setEditOpen(false);
      setEditingId(null);
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update booking');
    } finally {
      setSubmitting(false);
    }
  }

  async function quickConfirm(booking: Booking) {
    setEditingId(booking.id);
    setForm({
      type: booking.type,
      title: booking.title,
      supplierId: booking.supplierId || booking.supplier?.id || '',
      supplierName: '',
      confirmationRef: booking.confirmationRef || '',
      voucherNote: booking.voucherNote || '',
      costAmount: booking.costAmount != null ? String(Number(booking.costAmount)) : '',
      status: 'confirmed',
    });
    setEditOpen(true);
  }

  async function confirmCancelBooking() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await api<{
        cascaded?: { cancelledPayments: number; cancelledInvoices: number };
      }>(`/trips/${tripId}/bookings/${cancelTarget.id}/cancel`, { method: 'POST' });
      const payments = res.cascaded?.cancelledPayments ?? 0;
      const invoices = res.cascaded?.cancelledInvoices ?? 0;
      const extra =
        payments || invoices
          ? ` · cleared ${payments} unpaid payment${payments === 1 ? '' : 's'}, ${invoices} open invoice${invoices === 1 ? '' : 's'}`
          : '';
      toastSuccess(`Booking cancelled${extra}`);
      setCancelTarget(null);
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not cancel booking');
    } finally {
      setCancelling(false);
    }
  }

  async function confirmDeleteBooking() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/trips/${tripId}/bookings/${deleteTarget.id}`, { method: 'DELETE' });
      toastSuccess('Booking deleted');
      setDeleteTarget(null);
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete booking');
    } finally {
      setDeleting(false);
    }
  }

  async function linkCommerceRequest(booking: Booking) {
    setLinkingSrId(booking.id);
    try {
      await api(`/commerce/bookings/${booking.id}/ensure-service-request`, {
        method: 'POST',
      });
      toastSuccess('Commerce service request linked');
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not link commerce request');
    } finally {
      setLinkingSrId(null);
    }
  }

  async function negotiateExtraSupplier(booking: Booking) {
    setLinkingSrId(booking.id);
    try {
      await api(`/commerce/bookings/${booking.id}/ensure-service-request`, {
        method: 'POST',
      });
      await api(`/commerce/bookings/${booking.id}/negotiate`, {
        method: 'POST',
        body: JSON.stringify({
          supplierId: booking.supplierId || undefined,
          notes: 'Additional RFQ',
        }),
      });
      toastSuccess('Extra supplier RFQ created');
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create RFQ');
    } finally {
      setLinkingSrId(null);
    }
  }

  async function toggleItem(itemId: string, done: boolean) {
    try {
      await api(`/trips/${tripId}/readiness/${itemId}`, {
        method: 'POST',
        body: JSON.stringify({ done }),
      });
      await load();
      await onChanged();
      if (done) toastSuccess('Checklist updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update checklist');
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Bookings open</div>
            <div className="text-lg font-semibold tabular-nums">
              {openBookings}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {bookings.length}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Readiness</div>
            <div className="text-lg font-semibold tabular-nums">
              {readinessDone}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {readinessTotal || '—'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Trip status</div>
            <div className="mt-1">
              <StatusBadge value={status} showIcon size="md" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong className="text-sm">Booking components</strong>
                <p className="text-xs text-muted-foreground">
                  Confirm hotel/transfer bookings to allocate inventory when a linked asset, dates,
                  and stock exist (soft-skip otherwise).
                </p>
              </div>
              <Can anyOf={CAP.tripWrite}>
                <Button size="sm" onClick={() => {
                  setForm(emptyBookingForm());
                  setNetworkPick('');
                  setAddOpen(true);
                }}>
                  Add booking
                </Button>
              </Can>
            </div>
            <ul className="space-y-2">
              {bookings.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{b.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusBadge
                        value={b.type}
                        label={BOOKING_TYPES.find((t) => t.value === b.type)?.label || b.type}
                        showIcon={false}
                      />
                      {b.supplier ? <span>· {b.supplier.name}</span> : null}
                      {b.confirmationRef ? <span>· {b.confirmationRef}</span> : null}
                      {b.costAmount != null && b.costAmount !== '' ? (
                        <span>
                          ·{' '}
                          {formatCurrency(b.costAmount, {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <StatusBadge value={b.status} />
                    {canWrite ? (
                    <>
                    {b.status !== 'cancelled' ? (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                        Edit
                      </Button>
                    ) : null}
                    {b.status !== 'confirmed' && b.status !== 'cancelled' ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => void quickConfirm(b)}>
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={linkingSrId === b.id}
                          onClick={() => void linkCommerceRequest(b)}
                        >
                          {linkingSrId === b.id ? 'Linking…' : 'Link commerce request'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={linkingSrId === b.id}
                          onClick={() => void negotiateExtraSupplier(b)}
                        >
                          Add RFQ
                        </Button>
                      </>
                    ) : null}
                    {b.status !== 'cancelled' ? (
                      <Button size="sm" variant="outline" onClick={() => setCancelTarget(b)}>
                        Cancel
                      </Button>
                    ) : null}
                    {b.status === 'pending' || b.status === 'requested' ? (
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(b)}>
                        Delete
                      </Button>
                    ) : null}
                    </>
                    ) : null}
                  </div>
                </li>
              ))}
              {!bookings.length ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-center glass-well">
                  <p className="text-sm font-medium">No bookings yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add each hotel, transfer, or activity you need to confirm with a supplier.
                  </p>
                  <Can anyOf={CAP.tripWrite}>
                    <Button
                      className="mt-3"
                      size="sm"
                      onClick={() => {
                        setForm(emptyBookingForm());
                        setAddOpen(true);
                      }}
                    >
                      Add first booking
                    </Button>
                  </Can>
                </div>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <strong className="text-sm">Readiness checklist</strong>
                <p className="text-xs text-muted-foreground">
                  Completing all items moves the trip to Ready to travel.
                </p>
              </div>
              {readiness?.allDone ? (
                <StatusBadge value="ready_to_travel" label="Complete" tone="success" />
              ) : (
                <StatusBadge
                  value="pending"
                  label={`${readinessDone}/${readinessTotal || 0}`}
                  tone="warn"
                />
              )}
            </div>
            <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border glass-row">
              {(readiness?.items || []).map((item) => {
                const isBalance = /customer balance/i.test(item.label);
                const isBookings = /bookings confirmed/i.test(item.label);
                return (
                  <li key={item.id} className="px-3 py-2.5">
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={item.done}
                        disabled={!canWrite}
                        onCheckedChange={(checked) =>
                          void toggleItem(item.id, checked === true)
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                          {item.label}
                        </span>
                        {isBalance && !item.done ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Check collections on{' '}
                            <Link
                              className="text-primary hover:underline"
                              to={`/trips/${tripId}?tab=finance`}
                            >
                              Finance
                            </Link>
                            .
                          </span>
                        ) : null}
                        {isBookings && !item.done && openBookings > 0 ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {openBookings} booking{openBookings === 1 ? '' : 's'} still open.
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <RecordSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add booking"
        description="Track a supplier booking component for this trip."
        submitLabel="Add booking"
        submitting={submitting}
        onSubmit={saveNewBooking}
      >
        <FormField label="Type">
          <SuggestionChips
            aria-label="Booking type"
            allowDeselect={false}
            options={BOOKING_TYPES}
            value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))}
          />
        </FormField>
        <FormField label="Title" required>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Hotel Taj check-in"
          />
        </FormField>
        <FormField label="From network (followed)">
          <Combobox
            options={[
              { value: '', label: 'None', icon: CircleSlash },
              ...networkPartners.map((p) => ({
                value: p.organizationId,
                label: `${p.name}${p.city ? ` · ${p.city}` : ''}`,
                description: p.kind.replace(/_/g, ' '),
                icon: Network,
              })),
            ]}
            value={networkPick}
            onChange={(value) => {
              setNetworkPick(value);
              if (value) {
                setForm((f) => ({ ...f, supplierId: '', supplierName: '' }));
              }
            }}
            placeholder="None"
            searchable
            searchPlaceholder="Search network partner…"
          />
        </FormField>
        <FormField label="Existing supplier">
          <Combobox
            options={[
              { value: '', label: 'None / create new below', icon: CircleSlash },
              ...suppliers.map((s) => ({
                value: s.id,
                label: s.name,
                description: s.linkedOrganization ? 'Network linked' : undefined,
                icon: Building2,
              })),
            ]}
            value={form.supplierId}
            disabled={Boolean(networkPick)}
            onChange={(supplierId) => {
              setNetworkPick('');
              setForm((f) => ({ ...f, supplierId, supplierName: '' }));
            }}
            placeholder="None / create new below"
            searchable
            searchPlaceholder="Search supplier…"
          />
        </FormField>
        {!form.supplierId && !networkPick ? (
          <FormField label="Or new supplier name">
            <Input
              value={form.supplierName}
              onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))}
              placeholder="Creates supplier if new"
            />
          </FormField>
        ) : null}
        <FormField label="Est. cost (optional)">
          <PriceField
            value={form.costAmount}
            onChange={(costAmount) => setForm((f) => ({ ...f, costAmount }))}
            placeholder="0"
          />
        </FormField>
      </RecordSheet>

      <RecordSheet
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditingId(null);
        }}
        title="Edit booking"
        description="Update confirmation details, status (pending → requested → confirmed / cancelled), and internal notes."
        submitLabel="Save booking"
        submitting={submitting}
        onSubmit={saveEditBooking}
      >
        <FormField label="Type">
          <SuggestionChips
            aria-label="Booking type"
            allowDeselect={false}
            options={BOOKING_TYPES}
            value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))}
          />
        </FormField>
        <FormField label="Title" required>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </FormField>
        <FormField label="Status">
          <SuggestionChips
            aria-label="Booking status"
            allowDeselect={false}
            options={BOOKING_STATUSES}
            value={form.status}
            onChange={(status) => setForm((f) => ({ ...f, status }))}
          />
        </FormField>
        <FormGrid>
          <FormField label="Confirmation ref">
            <Input
              value={form.confirmationRef}
              onChange={(e) => setForm((f) => ({ ...f, confirmationRef: e.target.value }))}
              placeholder="PNR / hotel conf #"
            />
          </FormField>
          <FormField label="Est. cost">
            <PriceField
              value={form.costAmount}
              onChange={(costAmount) => setForm((f) => ({ ...f, costAmount }))}
              placeholder="0"
            />
          </FormField>
        </FormGrid>
        <FormField label="Supplier">
          <Combobox
            options={[
              { value: '', label: 'None', icon: CircleSlash },
              ...suppliers.map((s) => ({
                value: s.id,
                label: s.name,
                icon: Building2,
              })),
            ]}
            value={form.supplierId}
            onChange={(supplierId) => setForm((f) => ({ ...f, supplierId }))}
            placeholder="None"
            searchable
            searchPlaceholder="Search supplier…"
          />
        </FormField>
        <FormField
          label="Internal voucher note"
          description="Internal only — not a customer voucher PDF."
        >
          <Input
            value={form.voucherNote}
            onChange={(e) => setForm((f) => ({ ...f, voucherNote: e.target.value }))}
            placeholder="Issued / pending details"
          />
        </FormField>
      </RecordSheet>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title={cancelTarget ? `Cancel “${cancelTarget.title}”?` : 'Cancel booking?'}
        description="Marks the booking cancelled. Unpaid payment schedules and open supplier invoices linked to this booking are cancelled too. Paid amounts stay for manual handling."
        confirmLabel="Cancel booking"
        destructive
        loading={cancelling}
        onConfirm={() => void confirmCancelBooking()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Delete “${deleteTarget.title}”?` : 'Delete booking?'}
        description="This permanently removes the booking. Confirmed or finance-linked bookings must be cancelled instead."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void confirmDeleteBooking()}
      />
    </div>
  );
}
