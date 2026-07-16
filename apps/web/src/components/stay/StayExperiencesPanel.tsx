import { useCallback, useEffect, useState } from 'react';
import { Leaf, Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  SimpleFormField as FormField,
  StatusBadge,
  TimePicker,
  toastError,
  toastSuccess,
  formatCurrency,
} from '@travel/ui';
import { api } from '../../api';
import {
  formatDateInput,
  parseDateInput,
  patchDateTimeLocal,
  splitDateTimeLocal,
} from '../../lib/dateInput';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type Slot = {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  reserved: number;
  held: number;
};

type Experience = {
  id: string;
  title: string;
  category?: string | null;
  durationMinutes?: number | null;
  capacity?: number | null;
  price?: number | string | null;
  currency: string;
  instructorRequired?: boolean;
  slots?: Slot[];
};

type Participant = {
  id: string;
  fullName: string;
  age?: number | null;
  attended: boolean;
  waiverAckAt?: string | null;
};

type Reservation = {
  id: string;
  bookerName: string;
  guestCount: number;
  status: string;
  waiverAckAt?: string | null;
  experienceProduct?: { id: string; title: string };
  experienceSlot?: Slot;
  participants: Participant[];
};

const DEFAULT_WAIVER =
  'I understand the risks of this farm experience, confirm I meet age/safety requirements, and accept house rules.';

export function StayExperiencesPanel({ assetId }: { assetId: string }) {
  const [items, setItems] = useState<Experience[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedResId, setSelectedResId] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('farm_tour');
  const [price, setPrice] = useState('500');
  const [capacity, setCapacity] = useState('20');
  const [duration, setDuration] = useState('90');

  const [productId, setProductId] = useState('');
  const [slotStart, setSlotStart] = useState('');
  const [slotEnd, setSlotEnd] = useState('');
  const [slotCap, setSlotCap] = useState('12');

  const [bookerName, setBookerName] = useState('');
  const [guestCount, setGuestCount] = useState('2');
  const [slotId, setSlotId] = useState('');
  const [participantName, setParticipantName] = useState('');
  const { hasAny } = usePermissions();
  const canCatalog = hasAny(CAP.inventoryManage);
  const canBook = hasAny(CAP.reservationCreate);
  const canOps = hasAny(CAP.opsWrite);

  const load = useCallback(async () => {
    try {
      const [catalog, res] = await Promise.all([
        api<Experience[]>(`/experience/assets/${assetId}/catalog`),
        api<Reservation[]>(`/experience/assets/${assetId}/reservations`),
      ]);
      setItems(catalog);
      setReservations(res);
      setProductId((prev) => prev || catalog[0]?.id || '');
      setSelectedResId((prev) => prev || res[0]?.id || '');
    } catch (e) {
      reportError(e, 'Could not load experiences');
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRes = reservations.find((r) => r.id === selectedResId) || null;
  const allSlots = items.flatMap((p) =>
    (p.slots || []).map((s) => ({
      ...s,
      productId: p.id,
      productTitle: p.title,
      left: s.capacity - s.reserved - (s.held || 0),
    })),
  );

  async function saveProduct() {
    try {
      await api('/commerce/experiences', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          title,
          category,
          price: Number(price),
          capacity: Number(capacity),
          durationMinutes: Number(duration),
          weatherDependent: true,
          instructorRequired: false,
          safetyJson: {
            ageMin: 6,
            guardianRequirement: true,
            allergyWarning: true,
          },
        }),
      });
      toastSuccess('Experience created');
      setTitle('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function addSlot() {
    if (!productId || !slotStart || !slotEnd) {
      toastError('Product and slot times required');
      return;
    }
    try {
      await api('/commerce/experience-slots', {
        method: 'POST',
        body: JSON.stringify({
          experienceProductId: productId,
          startAt: new Date(slotStart).toISOString(),
          endAt: new Date(slotEnd).toISOString(),
          capacity: Number(slotCap),
        }),
      });
      toastSuccess('Slot added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Slot failed');
    }
  }

  async function book() {
    try {
      await api('/experience/reservations', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          experienceSlotId: slotId,
          bookerName,
          guestCount: Number(guestCount),
          confirmImmediately: true,
          participants: participantName
            ? [{ fullName: participantName }]
            : undefined,
        }),
      });
      toastSuccess('Experience booked');
      setBookerName('');
      setParticipantName('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Book failed');
    }
  }

  async function postAction(id: string, action: string, body?: unknown) {
    try {
      await api(`/experience/reservations/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      });
      toastSuccess(action);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  async function addParticipant() {
    if (!selectedResId || !participantName.trim()) return;
    try {
      await api(`/experience/reservations/${selectedResId}/participants`, {
        method: 'POST',
        body: JSON.stringify({ fullName: participantName.trim() }),
      });
      setParticipantName('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Add failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Leaf className="h-4 w-4" />
        <h2 className="text-sm font-medium">Experiences — catalog, book, attend, waiver</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">New experience product</h3>
            {canCatalog ? (
              <>
                <FormGrid>
                  <FormField label="Title">
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                  </FormField>
                  <FormField label="Category">
                    <Input value={category} onChange={(e) => setCategory(e.target.value)} />
                  </FormField>
                  <FormField label="Price">
                    <PriceField value={price} onChange={setPrice} />
                  </FormField>
                  <FormField label="Default capacity">
                    <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                  </FormField>
                  <FormField label="Duration (min)">
                    <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
                  </FormField>
                </FormGrid>
                <Button type="button" onClick={() => void saveProduct()}>
                  <Plus className="mr-1 h-4 w-4" /> Save product
                </Button>
              </>
            ) : null}
            <ul className="space-y-1 text-sm">
              {items.map((p) => (
                <li key={p.id}>
                  <button type="button" className="underline" onClick={() => setProductId(p.id)}>
                    {p.title}
                  </button>{' '}
                  — {formatCurrency(Number(p.price || 0), p.currency)} ·{' '}
                  {(p.slots || []).length} slots
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Add time slot</h3>
            {canCatalog ? (
              <>
                <FormGrid>
                  <FormField label="Product">
                    <Combobox
                      options={items.map((p) => ({ value: p.id, label: p.title }))}
                      value={productId}
                      onChange={setProductId}
                      placeholder="Select product"
                    />
                  </FormField>
                  <FormField label="Start date">
                    <DatePicker
                      value={parseDateInput(splitDateTimeLocal(slotStart).date)}
                      onChange={(d) =>
                        setSlotStart((v) =>
                          patchDateTimeLocal(v, { date: formatDateInput(d) }),
                        )
                      }
                    />
                  </FormField>
                  <FormField label="Start time">
                    <TimePicker
                      value={splitDateTimeLocal(slotStart).time || undefined}
                      onChange={(time) =>
                        setSlotStart((v) =>
                          patchDateTimeLocal(v, { time: time || '00:00' }),
                        )
                      }
                    />
                  </FormField>
                  <FormField label="End date">
                    <DatePicker
                      value={parseDateInput(splitDateTimeLocal(slotEnd).date)}
                      onChange={(d) =>
                        setSlotEnd((v) =>
                          patchDateTimeLocal(v, { date: formatDateInput(d) }),
                        )
                      }
                    />
                  </FormField>
                  <FormField label="End time">
                    <TimePicker
                      value={splitDateTimeLocal(slotEnd).time || undefined}
                      onChange={(time) =>
                        setSlotEnd((v) =>
                          patchDateTimeLocal(v, { time: time || '00:00' }),
                        )
                      }
                    />
                  </FormField>
                  <FormField label="Capacity">
                    <Input value={slotCap} onChange={(e) => setSlotCap(e.target.value)} />
                  </FormField>
                </FormGrid>
                <Button type="button" onClick={() => void addSlot()}>
                  Add slot
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Book experience</h3>
            {canBook ? (
              <>
                <FormGrid>
                  <FormField label="Booker">
                    <Input value={bookerName} onChange={(e) => setBookerName(e.target.value)} />
                  </FormField>
                  <FormField label="Guest count">
                    <Input value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
                  </FormField>
                  <FormField label="Slot">
                    <Combobox
                      options={[
                        { value: '', label: '—' },
                        ...allSlots.map((s) => ({
                          value: s.id,
                          label: `${s.productTitle} · ${new Date(s.startAt).toLocaleString()} (${s.left <= 0 ? 'full' : `${s.left} left`})`,
                        })),
                      ]}
                      value={slotId}
                      onChange={setSlotId}
                      placeholder="Select slot"
                    />
                  </FormField>
                  <FormField label="First participant (optional)">
                    <Input
                      value={participantName}
                      onChange={(e) => setParticipantName(e.target.value)}
                    />
                  </FormField>
                </FormGrid>
                <Button type="button" onClick={() => void book()}>
                  Confirm booking
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Reservations</h3>
            {reservations.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 text-sm"
              >
                <button type="button" className="text-left" onClick={() => setSelectedResId(r.id)}>
                  <div className="font-medium">
                    {r.bookerName} · {r.experienceProduct?.title}
                  </div>
                  <div className="text-muted-foreground">
                    {r.experienceSlot
                      ? new Date(r.experienceSlot.startAt).toLocaleString()
                      : '—'}
                  </div>
                </button>
                <div className="flex flex-wrap gap-1">
                  <StatusBadge value={r.status} />
                  {canOps && r.status === 'held' ? (
                    <Button size="sm" onClick={() => void postAction(r.id, 'confirm')}>
                      Confirm
                    </Button>
                  ) : null}
                  {canOps && r.status === 'confirmed' ? (
                    <Button size="sm" onClick={() => void postAction(r.id, 'check-in')}>
                      Check in
                    </Button>
                  ) : null}
                  {canOps && r.status === 'checked_in' ? (
                    <Button size="sm" onClick={() => void postAction(r.id, 'complete')}>
                      Complete
                    </Button>
                  ) : null}
                  {canOps && r.status !== 'cancelled' && r.status !== 'completed' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void postAction(r.id, 'cancel')}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!reservations.length ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {selectedRes ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                Ops — {selectedRes.bookerName}{' '}
                <StatusBadge value={selectedRes.status} />
              </h3>
              {canOps ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(selectedRes.waiverAckAt)}
                  onClick={() =>
                    void postAction(selectedRes.id, 'waiver', {
                      waiverText: DEFAULT_WAIVER,
                    })
                  }
                >
                  {selectedRes.waiverAckAt ? 'Waiver on file' : 'Ack waiver'}
                </Button>
              ) : null}
            </div>
            {canOps ? (
              <div className="flex gap-2">
                <Input
                  placeholder="Add participant"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                />
                <Button type="button" onClick={() => void addParticipant()}>
                  Add
                </Button>
              </div>
            ) : null}
            <ul className="space-y-2 text-sm">
              {selectedRes.participants.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1"
                >
                  <span>
                    {p.fullName}
                    {p.age != null ? ` (${p.age})` : ''}
                    {p.waiverAckAt ? ' · waiver ✓' : ''}
                  </span>
                  {canOps ? (
                    <Button
                      size="sm"
                      variant={p.attended ? 'default' : 'outline'}
                      onClick={() =>
                        void api(
                          `/experience/reservations/${selectedRes.id}/participants/${p.id}/attendance`,
                          {
                            method: 'POST',
                            body: JSON.stringify({ attended: !p.attended }),
                          },
                        ).then(load)
                      }
                    >
                      {p.attended ? 'Attended' : 'Mark attended'}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Resource scheduling (guides/equipment): N/A in Experience OS 1.0 — use product
              instructorRequired as a sell flag only.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
