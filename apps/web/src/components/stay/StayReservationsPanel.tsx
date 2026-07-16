import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type Reservation = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  source: string;
  confirmationRef?: string | null;
  rateAmount?: string | number | null;
  houseRulesAckAt?: string | null;
  assignmentHistoryJson?: Array<{
    from?: string | null;
    to?: string | null;
    at?: string;
    by?: string;
    note?: string | null;
  }> | null;
  roomProduct?: { id: string; name: string } | null;
  roomUnit?: { id: string; name: string; status: string } | null;
};

type RoomProduct = { id: string; name: string; isActive?: boolean };
type RoomUnit = { id: string; name: string; roomProduct: { id: string } };
type RatePlan = {
  id: string;
  name: string;
  amount: string | number;
  roomProductId: string;
};

type FolioCharge = {
  id: string;
  description: string;
  amount: string | number;
  taxAmount?: string | number | null;
  category: string;
};

type FolioResponse = {
  reservation: Reservation & { folioCharges?: FolioCharge[]; amountPaid?: string | number };
  roomCharge: number;
  extras: number;
  charges?: number;
  paid?: number;
  outstanding?: number;
  total: number;
  currency: string;
};

type Blocker = { code: string; message: string; severity: string };

type CheckoutBlockersResponse = { blockers: Blocker[]; warnings: Blocker[] };

type ModifyOp = 'extend' | 'early_departure' | 'move_unit' | 'change_room_product';

const MODIFY_OPS: Array<{ value: ModifyOp; label: string }> = [
  { value: 'extend', label: 'Extend stay' },
  { value: 'early_departure', label: 'Early departure' },
  { value: 'move_unit', label: 'Move unit' },
  { value: 'change_room_product', label: 'Change room product' },
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function StayReservationsPanel({ assetId }: { assetId: string }) {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<RoomProduct[]>([]);
  const [units, setUnits] = useState<RoomUnit[]>([]);
  const [rates, setRates] = useState<RatePlan[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [folioId, setFolioId] = useState<string | null>(null);
  const [folio, setFolio] = useState<FolioResponse | null>(null);
  const [folioLoading, setFolioLoading] = useState(false);
  const [chargeForm, setChargeForm] = useState({ description: '', amount: '' });
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash' });
  const [addingCharge, setAddingCharge] = useState(false);
  const [paying, setPaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modifyTarget, setModifyTarget] = useState<Reservation | null>(null);
  const [modifyOp, setModifyOp] = useState<ModifyOp>('extend');
  const [modifyForm, setModifyForm] = useState({
    newCheckOut: '',
    roomUnitId: '',
    roomProductId: '',
    note: '',
  });
  const [modifySubmitting, setModifySubmitting] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<Reservation | null>(null);
  const [checkoutBlockers, setCheckoutBlockers] = useState<CheckoutBlockersResponse | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [form, setForm] = useState({
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    checkIn: isoDate(new Date()),
    checkOut: isoDate(new Date(Date.now() + 86400000)),
    roomProductId: '',
    roomUnitId: '',
    source: 'manual',
    rateAmount: '',
    notes: '',
  });
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.partnerInventoryWrite);
  const canFinance = hasAny(CAP.partnerFinanceWrite);
  const canNoShow = hasAny(CAP.reservationCancel);

  const load = useCallback(async () => {
    try {
      const q = statusFilter
        ? `?status=${encodeURIComponent(statusFilter)}`
        : '';
      const [r, products, u, ratePlans] = await Promise.all([
        api<Reservation[]>(`/stay/assets/${assetId}/reservations${q}`),
        api<RoomProduct[]>(`/inventory/assets/${assetId}/rooms`),
        api<RoomUnit[]>(`/stay/assets/${assetId}/units`),
        api<RatePlan[]>(`/stay/assets/${assetId}/rates`),
      ]);
      setRows(r);
      setRooms(products.filter((p) => p.isActive !== false));
      setUnits(u);
      setRates(ratePlans);
      setForm((f) => ({
        ...f,
        roomProductId: f.roomProductId || products[0]?.id || '',
      }));
    } catch (e) {
      reportError(e, 'Could not load reservations');
    }
  }, [assetId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!folioId) {
      setFolio(null);
      return;
    }
    let cancelled = false;
    setFolioLoading(true);
    void (async () => {
      try {
        const res = await api<FolioResponse>(`/stay/reservations/${folioId}/folio`);
        if (!cancelled) setFolio(res);
      } catch (e) {
        if (!cancelled) reportError(e, 'Could not load folio');
      } finally {
        if (!cancelled) setFolioLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folioId]);

  function openFolio(row: Reservation) {
    setSelectedId(row.id);
    setFolioId(row.id);
    setChargeForm({ description: '', amount: '' });
    setPayForm({ amount: '', method: 'cash' });
  }

  async function reloadFolio(id: string) {
    const res = await api<FolioResponse>(`/stay/reservations/${id}/folio`);
    setFolio(res);
  }

  async function addFolioCharge() {
    if (!folioId || !chargeForm.description.trim()) {
      toastError('Enter a charge description');
      return;
    }
    const amount = Number(chargeForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toastError('Enter a valid amount');
      return;
    }
    setAddingCharge(true);
    try {
      await api('/commerce/folio-charges', {
        method: 'POST',
        body: JSON.stringify({
          stayReservationId: folioId,
          description: chargeForm.description.trim(),
          amount,
          category: 'other',
        }),
      });
      toastSuccess('Charge added');
      setChargeForm({ description: '', amount: '' });
      await reloadFolio(folioId);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add charge');
    } finally {
      setAddingCharge(false);
    }
  }

  async function recordPayment() {
    if (!folioId) return;
    const amount = Number(payForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toastError('Enter a valid payment amount');
      return;
    }
    setPaying(true);
    try {
      await api(`/stay/reservations/${folioId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount, method: payForm.method || undefined }),
      });
      toastSuccess('Payment recorded');
      setPayForm({ amount: '', method: 'cash' });
      await reloadFolio(folioId);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  async function issueInvoice() {
    if (!folioId) return;
    try {
      await api(`/stay/reservations/${folioId}/invoice`, { method: 'POST' });
      toastSuccess('Invoice issued');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not issue invoice');
    }
  }

  async function markNoShow(id: string) {
    if (!window.confirm('Mark this reservation as no-show?')) return;
    try {
      await api(`/commerce/stay-reservations/${id}/no-show`, { method: 'POST' });
      toastSuccess('Marked no-show');
      if (folioId === id) setFolioId(null);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark no-show');
    }
  }

  function openCreate() {
    setForm({
      guestName: '',
      guestPhone: '',
      guestEmail: '',
      checkIn: isoDate(new Date()),
      checkOut: isoDate(new Date(Date.now() + 86400000)),
      roomProductId: rooms[0]?.id || '',
      roomUnitId: '',
      source: 'manual',
      rateAmount: '',
      notes: '',
    });
    setOpen(true);
  }

  function onProductChange(roomProductId: string) {
    const plan = rates.find((r) => r.roomProductId === roomProductId);
    setForm((f) => ({
      ...f,
      roomProductId,
      roomUnitId: '',
      rateAmount: plan ? String(plan.amount) : f.rateAmount,
    }));
  }

  async function createReservation() {
    if (!form.guestName.trim()) {
      toastError('Guest name is required');
      return;
    }
    try {
      await api('/stay/reservations', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          guestName: form.guestName.trim(),
          guestPhone: form.guestPhone.trim() || null,
          guestEmail: form.guestEmail.trim() || null,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          roomProductId: form.roomProductId || null,
          roomUnitId: form.roomUnitId || null,
          source: form.source,
          rateAmount: form.rateAmount ? Number(form.rateAmount) : null,
          notes: form.notes.trim() || null,
          allocate: true,
        }),
      });
      toastSuccess('Reservation created');
      setOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create reservation');
    }
  }

  async function checkIn(row: Reservation, opts?: { houseRulesAck?: boolean }) {
    let roomUnitId = row.roomUnit?.id;
    if (!roomUnitId) {
      const pick = window.prompt(
        'Room unit id (or leave blank to pick from list)',
        units[0]?.id || '',
      );
      if (pick === null) return;
      roomUnitId = pick.trim() || undefined;
    }
    if (!roomUnitId) {
      toastError('Assign a unit to check in');
      return;
    }
    try {
      await api(`/stay/reservations/${row.id}/check-in`, {
        method: 'POST',
        body: JSON.stringify({
          roomUnitId,
          houseRulesAck: opts?.houseRulesAck || undefined,
        }),
      });
      toastSuccess('Checked in');
      await load();
    } catch (e) {
      const body = (e as Error & { body?: { message?: unknown } }).body?.message;
      const detail =
        body && typeof body === 'object'
          ? (body as { code?: string; message?: string; houseRules?: string | null })
          : null;
      if (detail?.code === 'HOUSE_RULES_ACK_REQUIRED') {
        const rules = detail.houseRules || 'House rules apply for this property.';
        const ok = window.confirm(
          `${detail.message || 'Acknowledge house rules to check in.'}\n\n${rules}\n\nAcknowledge and check in?`,
        );
        if (ok) {
          await checkIn(row, { houseRulesAck: true });
        }
        return;
      }
      toastError(e instanceof Error ? e.message : 'Check-in failed');
    }
  }

  async function openCheckout(row: Reservation) {
    setCheckoutTarget(row);
    setCheckoutBlockers(null);
    setCheckoutLoading(true);
    try {
      const res = await api<CheckoutBlockersResponse>(
        `/stay/reservations/${row.id}/checkout-blockers`,
      );
      setCheckoutBlockers(res);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load checkout blockers');
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function confirmCheckout(force: boolean) {
    if (!checkoutTarget) return;
    try {
      await api(`/stay/reservations/${checkoutTarget.id}/check-out`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      toastSuccess('Checked out');
      setCheckoutTarget(null);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Check-out failed');
    }
  }

  function openModify(row: Reservation) {
    setModifyTarget(row);
    setModifyOp('extend');
    setModifyForm({
      newCheckOut: formatDateInput(new Date(row.checkOut)),
      roomUnitId: '',
      roomProductId: row.roomProduct?.id || '',
      note: '',
    });
  }

  async function submitModify() {
    if (!modifyTarget) return;
    const note = modifyForm.note.trim() || undefined;
    if ((modifyOp === 'extend' || modifyOp === 'early_departure') && !modifyForm.newCheckOut) {
      toastError('Pick a new check-out date');
      return;
    }
    if (modifyOp === 'move_unit' && !modifyForm.roomUnitId) {
      toastError('Pick a target unit');
      return;
    }
    if (modifyOp === 'change_room_product' && !modifyForm.roomProductId) {
      toastError('Pick a target room product');
      return;
    }
    setModifySubmitting(true);
    try {
      if (modifyOp === 'extend') {
        await api(`/stay/reservations/${modifyTarget.id}/extend`, {
          method: 'POST',
          body: JSON.stringify({ newCheckOut: modifyForm.newCheckOut, note }),
        });
        toastSuccess('Stay extended');
      } else if (modifyOp === 'early_departure') {
        await api(`/stay/reservations/${modifyTarget.id}/early-departure`, {
          method: 'POST',
          body: JSON.stringify({ newCheckOut: modifyForm.newCheckOut, note }),
        });
        toastSuccess('Early departure recorded');
      } else if (modifyOp === 'move_unit') {
        await api(`/stay/reservations/${modifyTarget.id}/move-unit`, {
          method: 'POST',
          body: JSON.stringify({ roomUnitId: modifyForm.roomUnitId, note }),
        });
        toastSuccess('Moved to new unit');
      } else if (modifyOp === 'change_room_product') {
        await api(`/stay/reservations/${modifyTarget.id}/change-room-product`, {
          method: 'POST',
          body: JSON.stringify({ roomProductId: modifyForm.roomProductId, note }),
        });
        toastSuccess('Room product changed');
      }
      setModifyTarget(null);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not apply change');
    } finally {
      setModifySubmitting(false);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm('Cancel this reservation and restore allotment?')) return;
    try {
      await api(`/stay/reservations/${id}/cancel`, { method: 'POST' });
      toastSuccess('Cancelled');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  const productUnits = units.filter(
    (u) => !form.roomProductId || u.roomProduct.id === form.roomProductId,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-[10rem] flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Status</span>
          <Combobox
            className="min-w-[10rem]"
            options={[
              { value: '', label: 'All' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'checked_in', label: 'Checked in' },
              { value: 'checked_out', label: 'Checked out' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'inquiry', label: 'Inquiry' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="All"
          />
        </div>
        {canWrite ? (
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            New reservation
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="space-y-2 p-5">
          {rows.length ? (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm glass-row"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left hover:opacity-90"
                    onClick={() => {
                      setSelectedId(r.id);
                      openFolio(r);
                    }}
                  >
                    <div className="font-medium">{r.guestName}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {r.checkIn.slice(0, 10)} → {r.checkOut.slice(0, 10)}
                      {r.roomProduct ? ` · ${r.roomProduct.name}` : ''}
                      {r.roomUnit ? ` · Unit ${r.roomUnit.name}` : ''}
                      {r.confirmationRef ? ` · ${r.confirmationRef}` : ''}
                      {r.rateAmount != null && r.rateAmount !== ''
                        ? ` · ${formatCurrency(r.rateAmount, { maximumFractionDigits: 0 })}`
                        : ''}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <StatusBadge value={r.status} />
                      <StatusBadge value={r.source} showIcon={false} />
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => openFolio(r)}>
                      Folio
                    </Button>
                    {canNoShow &&
                    (r.status === 'confirmed' ||
                      r.status === 'inquiry' ||
                      r.status === 'held') ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void markNoShow(r.id)}
                      >
                        No-show
                      </Button>
                    ) : null}
                    {canWrite && (r.status === 'confirmed' || r.status === 'inquiry') ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void checkIn(r)}
                      >
                        Check in
                      </Button>
                    ) : null}
                    {canWrite && r.status === 'checked_in' ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void openCheckout(r)}
                      >
                        Check out
                      </Button>
                    ) : null}
                    {canWrite && (r.status === 'confirmed' || r.status === 'checked_in') ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openModify(r)}
                      >
                        Modify
                      </Button>
                    ) : null}
                    {canWrite && r.status !== 'cancelled' && r.status !== 'checked_out' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void cancel(r.id)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No reservations yet. Confirm inbound or create a manual stay.
            </p>
          )}
        </CardContent>
      </Card>

      {(() => {
        const selected = rows.find((r) => r.id === selectedId);
        const history = selected?.assignmentHistoryJson;
        if (!selected || !Array.isArray(history) || !history.length) return null;
        return (
          <Card>
            <CardContent className="space-y-2 p-4">
              <h3 className="text-sm font-medium">
                Assignment history — {selected.guestName}
              </h3>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {history.map((h, i) => (
                  <li key={`${h.at || i}-${i}`}>
                    {(h.at || '').slice(0, 19).replace('T', ' ')}
                    {h.from ? ` · ${h.from}` : ' · —'} → {h.to || '—'}
                    {h.note ? ` (${h.note})` : ''}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })()}

      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title="New reservation"
        description="Manual or walk-in stay. Confirmed stays allocate allotment."
        submitLabel="Create"
        onSubmit={() => void createReservation()}
      >
        <FormField label="Guest name" required>
          <Input
            value={form.guestName}
            onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
            required
          />
        </FormField>
        <FormGrid>
          <FormField label="Phone">
            <Input
              value={form.guestPhone}
              onChange={(e) => setForm((f) => ({ ...f, guestPhone: e.target.value }))}
            />
          </FormField>
          <FormField label="Email">
            <Input
              value={form.guestEmail}
              onChange={(e) => setForm((f) => ({ ...f, guestEmail: e.target.value }))}
            />
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="Check-in" required>
            <DatePicker
              value={parseDateInput(form.checkIn)}
              onChange={(d) =>
                setForm((f) => ({ ...f, checkIn: formatDateInput(d) }))
              }
            />
          </FormField>
          <FormField label="Check-out" required>
            <DatePicker
              value={parseDateInput(form.checkOut)}
              onChange={(d) =>
                setForm((f) => ({ ...f, checkOut: formatDateInput(d) }))
              }
            />
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="Room product">
            <Combobox
              options={[
                { value: '', label: 'Any available' },
                ...rooms.map((r) => ({ value: r.id, label: r.name })),
              ]}
              value={form.roomProductId}
              onChange={onProductChange}
              placeholder="Any available"
            />
          </FormField>
          <FormField label="Unit (optional)">
            <Combobox
              options={[
                { value: '', label: 'Assign later' },
                ...productUnits.map((u) => ({ value: u.id, label: u.name })),
              ]}
              value={form.roomUnitId}
              onChange={(roomUnitId) => setForm((f) => ({ ...f, roomUnitId }))}
              placeholder="Assign later"
            />
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="Source">
            <Combobox
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'walk_in', label: 'Walk-in' },
              ]}
              value={form.source}
              onChange={(source) => setForm((f) => ({ ...f, source }))}
            />
          </FormField>
          <FormField label="Rate amount">
            <PriceField
              value={form.rateAmount}
              onChange={(rateAmount) => setForm((f) => ({ ...f, rateAmount }))}
              placeholder="0"
            />
          </FormField>
        </FormGrid>
        <FormField label="Notes">
          <Input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </FormField>
      </RecordSheet>

      <RecordSheet
        open={Boolean(folioId)}
        onOpenChange={(next) => {
          if (!next) setFolioId(null);
        }}
        title={folio?.reservation.guestName || 'Guest folio'}
        description={
          folio
            ? `${folio.reservation.checkIn.slice(0, 10)} → ${folio.reservation.checkOut.slice(0, 10)}`
            : 'Charges and extras for this stay'
        }
        cancelLabel="Close"
        wide
      >
        {folioLoading ? (
          <p className="text-sm text-muted-foreground">Loading folio…</p>
        ) : folio ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border px-3 py-2 text-sm glass-row">
                <div className="text-xs text-muted-foreground">Room (quoted)</div>
                <div className="font-medium tabular-nums">
                  {formatCurrency(folio.roomCharge, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="rounded-xl border px-3 py-2 text-sm glass-row">
                <div className="text-xs text-muted-foreground">Folio charges</div>
                <div className="font-medium tabular-nums">
                  {formatCurrency(folio.charges ?? folio.extras, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="rounded-xl border px-3 py-2 text-sm glass-row">
                <div className="text-xs text-muted-foreground">Outstanding</div>
                <div className="font-semibold tabular-nums">
                  {formatCurrency(folio.outstanding ?? 0, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-muted-foreground">
                  Paid {formatCurrency(folio.paid ?? 0, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Charges</h3>
              <ul className="space-y-2">
                {folio.reservation.folioCharges?.length ? (
                  folio.reservation.folioCharges.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm glass-row"
                    >
                      <span>{c.description}</span>
                      <span className="tabular-nums">
                        {formatCurrency(c.amount, { maximumFractionDigits: 0 })}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">No folio charges yet.</li>
                )}
              </ul>
            </section>
            {canFinance ? (
              <>
                <section className="space-y-3 border-t pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Payments</h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void issueInvoice()}
                    >
                      Issue invoice
                    </Button>
                  </div>
                  <FormGrid>
                    <FormField label="Amount">
                      <PriceField
                        value={payForm.amount}
                        onChange={(amount) => setPayForm((f) => ({ ...f, amount }))}
                        placeholder={String(folio.outstanding ?? 0)}
                      />
                    </FormField>
                    <FormField label="Method">
                      <Input
                        value={payForm.method}
                        onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                        placeholder="cash / upi / card"
                      />
                    </FormField>
                  </FormGrid>
                  <Button
                    type="button"
                    size="sm"
                    disabled={paying}
                    onClick={() => void recordPayment()}
                  >
                    {paying ? 'Recording…' : 'Record payment'}
                  </Button>
                </section>
                <section className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold">Add charge</h3>
                  <FormGrid>
                    <FormField label="Description">
                      <Input
                        value={chargeForm.description}
                        onChange={(e) =>
                          setChargeForm((f) => ({ ...f, description: e.target.value }))
                        }
                        placeholder="Minibar, laundry…"
                      />
                    </FormField>
                    <FormField label="Amount">
                      <PriceField
                        value={chargeForm.amount}
                        onChange={(amount) => setChargeForm((f) => ({ ...f, amount }))}
                        placeholder="0"
                      />
                    </FormField>
                  </FormGrid>
                  <Button
                    type="button"
                    size="sm"
                    disabled={addingCharge}
                    onClick={() => void addFolioCharge()}
                  >
                    {addingCharge ? 'Adding…' : 'Add charge'}
                  </Button>
                </section>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Could not load folio.</p>
        )}
      </RecordSheet>

      <RecordSheet
        open={Boolean(modifyTarget)}
        onOpenChange={(next) => {
          if (!next) setModifyTarget(null);
        }}
        title={modifyTarget ? `Modify — ${modifyTarget.guestName}` : 'Modify reservation'}
        description="Extend, cut short, move unit, or switch room product."
        submitLabel="Apply"
        submitting={modifySubmitting}
        onSubmit={() => void submitModify()}
      >
        <FormField label="Operation">
          <Combobox
            options={MODIFY_OPS}
            value={modifyOp}
            onChange={(v) => setModifyOp(v as ModifyOp)}
          />
        </FormField>
        {modifyOp === 'extend' || modifyOp === 'early_departure' ? (
          <FormField label="New check-out" required>
            <DatePicker
              value={parseDateInput(modifyForm.newCheckOut)}
              onChange={(d) =>
                setModifyForm((f) => ({ ...f, newCheckOut: formatDateInput(d) }))
              }
            />
          </FormField>
        ) : null}
        {modifyOp === 'move_unit' ? (
          <FormField label="Target unit" required>
            <Combobox
              options={units
                .filter(
                  (u) =>
                    u.id !== modifyTarget?.roomUnit?.id &&
                    (!modifyTarget?.roomProduct ||
                      u.roomProduct.id === modifyTarget.roomProduct.id),
                )
                .map((u) => ({ value: u.id, label: u.name }))}
              value={modifyForm.roomUnitId || undefined}
              onChange={(roomUnitId) => setModifyForm((f) => ({ ...f, roomUnitId }))}
              placeholder="Select unit"
            />
          </FormField>
        ) : null}
        {modifyOp === 'change_room_product' ? (
          <FormField label="Target room product" required>
            <Combobox
              options={rooms
                .filter((r) => r.id !== modifyTarget?.roomProduct?.id)
                .map((r) => ({ value: r.id, label: r.name }))}
              value={modifyForm.roomProductId || undefined}
              onChange={(roomProductId) => setModifyForm((f) => ({ ...f, roomProductId }))}
              placeholder="Select product"
            />
          </FormField>
        ) : null}
        <FormField label="Note">
          <Input
            value={modifyForm.note}
            onChange={(e) => setModifyForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Optional context for this change"
          />
        </FormField>
      </RecordSheet>

      <RecordSheet
        open={Boolean(checkoutTarget)}
        onOpenChange={(next) => {
          if (!next) setCheckoutTarget(null);
        }}
        title={checkoutTarget ? `Check out — ${checkoutTarget.guestName}` : 'Check out'}
        description="Resolve blockers before checkout, or force checkout if appropriate."
        cancelLabel="Cancel"
        submitLabel={
          checkoutBlockers && checkoutBlockers.blockers.length ? 'Force checkout' : 'Check out'
        }
        onSubmit={
          checkoutLoading
            ? undefined
            : () => void confirmCheckout(Boolean(checkoutBlockers?.blockers.length))
        }
      >
        {checkoutLoading ? (
          <p className="text-sm text-muted-foreground">Checking for blockers…</p>
        ) : (
          <div className="space-y-3">
            {checkoutBlockers?.blockers.length ? (
              <div className="space-y-1.5">
                <strong className="text-sm text-destructive">Blockers</strong>
                <ul className="space-y-1.5">
                  {checkoutBlockers.blockers.map((b) => (
                    <li
                      key={b.code}
                      className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs"
                    >
                      {b.message}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Forcing checkout will proceed despite the blockers above.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No blockers — clear to check out.</p>
            )}
            {checkoutBlockers?.warnings.length ? (
              <div className="space-y-1.5">
                <strong className="text-sm">Warnings</strong>
                <ul className="space-y-1.5">
                  {checkoutBlockers.warnings.map((w) => (
                    <li
                      key={w.code}
                      className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground"
                    >
                      {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </RecordSheet>
    </div>
  );
}
