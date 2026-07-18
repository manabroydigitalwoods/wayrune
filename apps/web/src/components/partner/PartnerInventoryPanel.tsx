import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  SimpleFormField as FormField,
  StatusBadge,
  TimePicker,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';
import {
  formatDateInput,
  parseDateInput,
  patchDateTimeLocal,
  splitDateTimeLocal,
} from '../../lib/dateInput';
import {
  isDriverOrgKind,
  isFleetOrgKind,
  isRestaurantOrgKind,
  isStayOrgKind,
} from '../../lib/orgKind';

type RoomProduct = {
  id: string;
  name: string;
  maxOccupancy: number;
  baseQuantity: number;
  bedConfig?: string | null;
  rateHint?: string | number | null;
  allotments: Array<{
    id: string;
    startDate: string;
    endDate: string;
    availableCount: number;
    stopSell: boolean;
  }>;
};

type FleetUnit = {
  id: string;
  name: string;
  plateNumber?: string | null;
  seats?: number | null;
};

type CalendarBlock = {
  id: string;
  startAt: string;
  endAt: string;
  kind: string;
  fleetUnit?: { id: string; name: string } | null;
  notes?: string | null;
};

type ServiceOffer = {
  id: string;
  name: string;
  capacity?: number | null;
  serviceDate?: string | null;
  serviceWindow?: string | null;
  rateHint?: string | number | null;
};

function isoDate(d: Date) {
  return formatDateInput(d);
}

export function PartnerInventoryPanel({
  assetId,
  assetKind,
  orgKind,
}: {
  assetId: string;
  assetKind: string;
  orgKind?: string | null;
}) {
  const stay = isStayOrgKind(orgKind) || isStayOrgKind(assetKind);
  const fleet = isFleetOrgKind(orgKind) || assetKind === 'vehicle';
  const driver = isDriverOrgKind(orgKind) || assetKind === 'driver';
  const restaurant = isRestaurantOrgKind(orgKind) || assetKind === 'restaurant';
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.partnerInventoryWrite);

  const [rooms, setRooms] = useState<RoomProduct[]>([]);
  const [units, setUnits] = useState<FleetUnit[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [roomForm, setRoomForm] = useState({
    name: '',
    maxOccupancy: '2',
    baseQuantity: '1',
    bedConfig: '',
  });
  const [allotmentForm, setAllotmentForm] = useState({
    roomProductId: '',
    startDate: isoDate(new Date()),
    endDate: isoDate(new Date(Date.now() + 30 * 86400000)),
    availableCount: '1',
  });
  const [unitForm, setUnitForm] = useState({ name: '', plateNumber: '', seats: '7' });
  const [blockForm, setBlockForm] = useState({
    startAt: '',
    endAt: '',
    kind: 'blocked',
    fleetUnitId: '',
  });
  const [offerForm, setOfferForm] = useState({
    name: '',
    capacity: '20',
    serviceWindow: 'dinner',
    serviceDate: '',
  });

  const load = useCallback(async () => {
    try {
      if (stay) {
        const r = await api<RoomProduct[]>(`/inventory/assets/${assetId}/rooms`);
        setRooms(r);
        setAllotmentForm((f) => ({
          ...f,
          roomProductId: f.roomProductId || r[0]?.id || '',
        }));
      }
      if (fleet) {
        const u = await api<FleetUnit[]>(`/inventory/assets/${assetId}/fleet`);
        setUnits(u);
      }
      if (fleet || driver) {
        const c = await api<CalendarBlock[]>(`/inventory/assets/${assetId}/calendar`);
        setBlocks(c);
      }
      if (restaurant) {
        const o = await api<ServiceOffer[]>(`/inventory/assets/${assetId}/offers`);
        setOffers(o);
      }
    } catch (e) {
      reportError(e, 'Could not load inventory');
    }
  }, [assetId, stay, fleet, driver, restaurant]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRoom() {
    if (!roomForm.name.trim()) {
      toastError('Room name is required');
      return;
    }
    try {
      await api('/inventory/rooms', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          name: roomForm.name.trim(),
          maxOccupancy: Number(roomForm.maxOccupancy) || 2,
          baseQuantity: Number(roomForm.baseQuantity) || 1,
          bedConfig: roomForm.bedConfig.trim() || null,
        }),
      });
      setRoomForm({ name: '', maxOccupancy: '2', baseQuantity: '1', bedConfig: '' });
      toastSuccess('Room product added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add room');
    }
  }

  async function addAllotment() {
    if (!allotmentForm.roomProductId) {
      toastError('Pick a room product');
      return;
    }
    try {
      await api('/inventory/allotments', {
        method: 'POST',
        body: JSON.stringify({
          roomProductId: allotmentForm.roomProductId,
          startDate: allotmentForm.startDate,
          endDate: allotmentForm.endDate,
          availableCount: Number(allotmentForm.availableCount) || 0,
        }),
      });
      toastSuccess('Allotment saved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save allotment');
    }
  }

  async function removeAllotment(id: string) {
    try {
      await api(`/inventory/allotments/${id}`, { method: 'DELETE' });
      toastSuccess('Allotment removed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove allotment');
    }
  }

  async function addUnit() {
    if (!unitForm.name.trim()) {
      toastError('Vehicle name is required');
      return;
    }
    try {
      await api('/inventory/fleet', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          name: unitForm.name.trim(),
          plateNumber: unitForm.plateNumber.trim() || null,
          seats: Number(unitForm.seats) || null,
        }),
      });
      setUnitForm({ name: '', plateNumber: '', seats: '7' });
      toastSuccess('Fleet unit added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add unit');
    }
  }

  async function addBlock() {
    if (!blockForm.startAt || !blockForm.endAt) {
      toastError('Start and end are required');
      return;
    }
    try {
      await api('/inventory/calendar', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          startAt: new Date(blockForm.startAt).toISOString(),
          endAt: new Date(blockForm.endAt).toISOString(),
          kind: blockForm.kind,
          fleetUnitId: blockForm.fleetUnitId || null,
        }),
      });
      toastSuccess('Calendar block added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add block');
    }
  }

  async function removeBlock(id: string) {
    try {
      await api(`/inventory/calendar/${id}`, { method: 'DELETE' });
      toastSuccess('Block removed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove block');
    }
  }

  async function addOffer() {
    if (!offerForm.name.trim()) {
      toastError('Offer name is required');
      return;
    }
    try {
      await api('/inventory/offers', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          name: offerForm.name.trim(),
          capacity: Number(offerForm.capacity) || null,
          serviceWindow: offerForm.serviceWindow || null,
          serviceDate: offerForm.serviceDate || null,
        }),
      });
      setOfferForm({ name: '', capacity: '20', serviceWindow: 'dinner', serviceDate: '' });
      toastSuccess('Offer added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add offer');
    }
  }

  async function removeOffer(id: string) {
    try {
      await api(`/inventory/offers/${id}`, { method: 'DELETE' });
      toastSuccess('Offer removed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove offer');
    }
  }

  return (
    <div className="space-y-4">
      {stay ? (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <strong className="text-sm">Room products</strong>
              {canWrite ? (
                <>
                  <FormGrid>
                    <FormField label="Name">
                      <Input
                        value={roomForm.name}
                        onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Deluxe double"
                      />
                    </FormField>
                    <FormField label="Max occupancy">
                      <Input
                        type="number"
                        value={roomForm.maxOccupancy}
                        onChange={(e) =>
                          setRoomForm((f) => ({ ...f, maxOccupancy: e.target.value }))
                        }
                      />
                    </FormField>
                    <FormField label="Base quantity">
                      <Input
                        type="number"
                        value={roomForm.baseQuantity}
                        onChange={(e) =>
                          setRoomForm((f) => ({ ...f, baseQuantity: e.target.value }))
                        }
                      />
                    </FormField>
                    <FormField label="Bed config">
                      <Input
                        value={roomForm.bedConfig}
                        onChange={(e) => setRoomForm((f) => ({ ...f, bedConfig: e.target.value }))}
                        placeholder="1 queen"
                      />
                    </FormField>
                  </FormGrid>
                  <Button type="button" size="sm" onClick={() => void addRoom()}>
                    <Plus className="size-3.5" />
                    Add room
                  </Button>
                </>
              ) : null}
              <ul className="space-y-2">
                {rooms.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-border/60 px-3 py-2 text-sm glass-row"
                  >
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Occ {r.maxOccupancy} · qty {r.baseQuantity}
                      {r.bedConfig ? ` · ${r.bedConfig}` : ''}
                    </div>
                    {r.allotments?.length ? (
                      <ul className="mt-2 space-y-1">
                        {r.allotments.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span>
                              {a.startDate.slice(0, 10)} → {a.endDate.slice(0, 10)} ·{' '}
                              {a.availableCount} available
                              {a.stopSell ? ' · stop-sell' : ''}
                            </span>
                            {canWrite ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => void removeAllotment(a.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {canWrite ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              <strong className="text-sm">Allotment window</strong>
              <FormGrid>
                <FormField label="Room product">
                  <Combobox
                    options={rooms.map((r) => ({ value: r.id, label: r.name }))}
                    value={allotmentForm.roomProductId || undefined}
                    onChange={(roomProductId) =>
                      setAllotmentForm((f) => ({ ...f, roomProductId }))
                    }
                    placeholder="Select product"
                  />
                </FormField>
                <FormField label="Available count">
                  <Input
                    type="number"
                    value={allotmentForm.availableCount}
                    onChange={(e) =>
                      setAllotmentForm((f) => ({ ...f, availableCount: e.target.value }))
                    }
                  />
                </FormField>
                <FormField label="From">
                  <DatePicker
                    value={parseDateInput(allotmentForm.startDate)}
                    onChange={(d) =>
                      setAllotmentForm((f) => ({
                        ...f,
                        startDate: formatDateInput(d),
                      }))
                    }
                  />
                </FormField>
                <FormField label="To">
                  <DatePicker
                    value={parseDateInput(allotmentForm.endDate)}
                    onChange={(d) =>
                      setAllotmentForm((f) => ({
                        ...f,
                        endDate: formatDateInput(d),
                      }))
                    }
                  />
                </FormField>
              </FormGrid>
              <Button type="button" size="sm" onClick={() => void addAllotment()}>
                Save allotment
              </Button>
            </CardContent>
          </Card>
          ) : null}
        </>
      ) : null}

      {fleet ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <strong className="text-sm">Fleet units</strong>
            {canWrite ? (
              <>
                <FormGrid>
                  <FormField label="Name">
                    <Input
                      value={unitForm.name}
                      onChange={(e) => setUnitForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Innova — white"
                    />
                  </FormField>
                  <FormField label="Plate">
                    <Input
                      value={unitForm.plateNumber}
                      onChange={(e) =>
                        setUnitForm((f) => ({ ...f, plateNumber: e.target.value }))
                      }
                    />
                  </FormField>
                  <FormField label="Seats">
                    <Input
                      type="number"
                      value={unitForm.seats}
                      onChange={(e) => setUnitForm((f) => ({ ...f, seats: e.target.value }))}
                    />
                  </FormField>
                </FormGrid>
                <Button type="button" size="sm" onClick={() => void addUnit()}>
                  <Plus className="size-3.5" />
                  Add unit
                </Button>
              </>
            ) : null}
            <ul className="space-y-1.5 text-sm">
              {units.map((u) => (
                <li key={u.id} className="rounded-lg border px-3 py-2 glass-row">
                  {u.name}
                  {u.plateNumber ? ` · ${u.plateNumber}` : ''}
                  {u.seats != null ? ` · ${u.seats} seats` : ''}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {fleet || driver ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <strong className="text-sm">Availability calendar</strong>
            {canWrite ? (
            <>
            <FormGrid>
              <FormField label="Start date">
                <DatePicker
                  value={parseDateInput(splitDateTimeLocal(blockForm.startAt).date)}
                  onChange={(d) =>
                    setBlockForm((f) => ({
                      ...f,
                      startAt: patchDateTimeLocal(f.startAt, {
                        date: formatDateInput(d),
                      }),
                    }))
                  }
                />
              </FormField>
              <FormField label="Start time">
                <TimePicker
                  value={splitDateTimeLocal(blockForm.startAt).time || undefined}
                  onChange={(time) =>
                    setBlockForm((f) => ({
                      ...f,
                      startAt: patchDateTimeLocal(f.startAt, { time: time || '00:00' }),
                    }))
                  }
                />
              </FormField>
              <FormField label="End date">
                <DatePicker
                  value={parseDateInput(splitDateTimeLocal(blockForm.endAt).date)}
                  onChange={(d) =>
                    setBlockForm((f) => ({
                      ...f,
                      endAt: patchDateTimeLocal(f.endAt, {
                        date: formatDateInput(d),
                      }),
                    }))
                  }
                />
              </FormField>
              <FormField label="End time">
                <TimePicker
                  value={splitDateTimeLocal(blockForm.endAt).time || undefined}
                  onChange={(time) =>
                    setBlockForm((f) => ({
                      ...f,
                      endAt: patchDateTimeLocal(f.endAt, { time: time || '00:00' }),
                    }))
                  }
                />
              </FormField>
              {fleet ? (
                <FormField label="Unit (optional)">
                  <Combobox
                    options={[
                      { value: '', label: 'Whole asset' },
                      ...units.map((u) => ({ value: u.id, label: u.name })),
                    ]}
                    value={blockForm.fleetUnitId}
                    onChange={(fleetUnitId) =>
                      setBlockForm((f) => ({ ...f, fleetUnitId }))
                    }
                    placeholder="Whole asset"
                  />
                </FormField>
              ) : null}
              <FormField label="Kind">
                <Combobox
                  options={[
                    { value: 'blocked', label: 'Blocked' },
                    { value: 'available', label: 'Available' },
                    { value: 'booked', label: 'Booked' },
                  ]}
                  value={blockForm.kind}
                  onChange={(kind) => setBlockForm((f) => ({ ...f, kind }))}
                />
              </FormField>
            </FormGrid>
            <Button type="button" size="sm" onClick={() => void addBlock()}>
              Add block
            </Button>
            </>
            ) : null}
            <ul className="space-y-1.5 text-sm">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 glass-row"
                >
                  <div>
                    <StatusBadge value={b.kind} showIcon={false} />
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(b.startAt).toLocaleString()} →{' '}
                      {new Date(b.endAt).toLocaleString()}
                      {b.fleetUnit ? ` · ${b.fleetUnit.name}` : ''}
                    </span>
                  </div>
                  {canWrite ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeBlock(b.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {restaurant ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <strong className="text-sm">Meal packages</strong>
            {canWrite ? (
            <>
            <FormGrid>
              <FormField label="Name">
                <Input
                  value={offerForm.name}
                  onChange={(e) => setOfferForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Set dinner"
                />
              </FormField>
              <FormField label="Capacity">
                <Input
                  type="number"
                  value={offerForm.capacity}
                  onChange={(e) => setOfferForm((f) => ({ ...f, capacity: e.target.value }))}
                />
              </FormField>
              <FormField label="Window">
                <Input
                  value={offerForm.serviceWindow}
                  onChange={(e) =>
                    setOfferForm((f) => ({ ...f, serviceWindow: e.target.value }))
                  }
                  placeholder="dinner"
                />
              </FormField>
              <FormField label="Date (optional)">
                <DatePicker
                  value={parseDateInput(offerForm.serviceDate)}
                  onChange={(d) =>
                    setOfferForm((f) => ({
                      ...f,
                      serviceDate: formatDateInput(d),
                    }))
                  }
                  placeholder="Any day"
                />
              </FormField>
            </FormGrid>
            <Button type="button" size="sm" onClick={() => void addOffer()}>
              <Plus className="size-3.5" />
              Add offer
            </Button>
            </>
            ) : null}
            <ul className="space-y-1.5 text-sm">
              {offers.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 glass-row"
                >
                  <span>
                    {o.name}
                    {o.capacity != null ? ` · cap ${o.capacity}` : ''}
                    {o.serviceWindow ? ` · ${o.serviceWindow}` : ''}
                    {o.serviceDate ? ` · ${String(o.serviceDate).slice(0, 10)}` : ''}
                  </span>
                  {canWrite ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeOffer(o.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!stay && !fleet && !driver && !restaurant ? (
        <p className="text-sm text-muted-foreground">
          No inventory engine for this asset kind yet. Stay, fleet, driver, and restaurant
          kinds are supported.
        </p>
      ) : null}
    </div>
  );
}
