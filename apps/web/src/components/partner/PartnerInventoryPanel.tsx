import { useCallback, useEffect, useState } from 'react';
import { BedDouble, CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  NumberField,
  QuickPicks,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  TimePicker,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api, type AssetRoomProductRow } from '../../api';
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

type RoomProduct = AssetRoomProductRow & {
  allotments: NonNullable<AssetRoomProductRow['allotments']>;
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

type Allocation = {
  id: string;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
  notes?: string | null;
  fleetUnit?: { id: string; name: string; plateNumber?: string | null } | null;
  bookingComponent?: {
    id: string;
    title: string;
    type: string;
    status: string;
    trip?: { tripNumber: string; title: string } | null;
  } | null;
};

type ServiceOffer = {
  id: string;
  name: string;
  capacity?: number | null;
  serviceDate?: string | null;
  serviceWindow?: string | null;
  rateHint?: string | number | null;
};

const ROOM_NAME_PRESETS = [
  { value: 'Deluxe double', label: 'Deluxe double' },
  { value: 'Deluxe twin', label: 'Deluxe twin' },
  { value: 'Suite', label: 'Suite' },
  { value: 'Family suite', label: 'Family suite' },
  { value: 'Standard twin', label: 'Standard twin' },
];

const BED_PRESETS = [
  { value: '1 king', label: '1 king' },
  { value: '1 queen', label: '1 queen' },
  { value: '2 twin', label: '2 twin' },
  { value: '1 king + 1 twin', label: 'King + twin' },
];

const OCC_QUICK_PICKS = [1, 2, 3, 4, 5, 6];
const UNIT_QUICK_PICKS = [1, 2, 3, 4, 6, 8, 10];

const emptyRoomForm = () => ({
  name: '',
  customerFacingName: '',
  maxOccupancy: '2',
  baseQuantity: '1',
  bedConfig: '',
});

function roomFormFromProduct(r: RoomProduct) {
  return {
    name: r.name,
    customerFacingName: r.customerFacingName || '',
    maxOccupancy: String(r.maxOccupancy ?? 2),
    baseQuantity: String(r.baseQuantity ?? 1),
    bedConfig: r.bedConfig || '',
  };
}

function isAllotmentExpired(endDate: string): boolean {
  const today = isoDate(new Date());
  return endDate.slice(0, 10) < today;
}

function isoDate(d: Date) {
  return formatDateInput(d);
}

function formatDay(iso: string): string {
  const day = iso.slice(0, 10);
  const d = parseDateInput(day);
  if (!d) return day;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PartnerInventoryPanel({
  assetId,
  assetKind,
  orgKind,
  assetName,
}: {
  assetId: string;
  assetKind: string;
  orgKind?: string | null;
  assetName?: string | null;
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
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [roomEditOpen, setRoomEditOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [allotmentFormOpen, setAllotmentFormOpen] = useState(false);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [roomEditForm, setRoomEditForm] = useState(emptyRoomForm);
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
  const [allocForm, setAllocForm] = useState({
    startAt: '',
    endAt: '',
    fleetUnitId: '',
    status: 'hold' as 'hold' | 'confirmed',
    notes: '',
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
        setRooms(
          r.map((row) => ({
            ...row,
            allotments: row.allotments ?? [],
          })),
        );
        setAllotmentForm((f) => ({
          ...f,
          roomProductId: f.roomProductId || r[0]?.id || '',
          availableCount: f.availableCount || String(r[0]?.baseQuantity || 1),
        }));
      }
      if (fleet) {
        const u = await api<FleetUnit[]>(`/inventory/assets/${assetId}/fleet`);
        setUnits(u);
      }
      if (fleet || driver) {
        const [c, a] = await Promise.all([
          api<CalendarBlock[]>(`/inventory/assets/${assetId}/calendar`),
          api<Allocation[]>(`/inventory/assets/${assetId}/allocations`).catch(
            () => [],
          ),
        ]);
        setBlocks(c);
        setAllocations(Array.isArray(a) ? a : []);
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

  function openRoomForm() {
    setRoomForm(emptyRoomForm());
    setRoomFormOpen(true);
  }

  function openEditRoom(r: RoomProduct) {
    setEditingRoomId(r.id);
    setRoomEditForm(roomFormFromProduct(r));
    setRoomEditOpen(true);
  }

  function openAllotmentForm(roomProductId?: string) {
    const room = rooms.find((r) => r.id === (roomProductId || allotmentForm.roomProductId));
    setAllotmentForm({
      roomProductId: roomProductId || rooms[0]?.id || '',
      startDate: isoDate(new Date()),
      endDate: isoDate(new Date(Date.now() + 90 * 86400000)),
      availableCount: String(room?.baseQuantity || 1),
    });
    setAllotmentFormOpen(true);
  }

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
          customerFacingName: roomForm.customerFacingName.trim() || null,
          maxOccupancy: Number(roomForm.maxOccupancy) || 2,
          baseQuantity: Number(roomForm.baseQuantity) || 1,
          bedConfig: roomForm.bedConfig.trim() || null,
        }),
      });
      setRoomForm(emptyRoomForm());
      setRoomFormOpen(false);
      toastSuccess('Room product added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add room');
    }
  }

  async function saveRoomEdit() {
    if (!editingRoomId) return;
    if (!roomEditForm.name.trim()) {
      toastError('Room name is required');
      return;
    }
    try {
      await api(`/inventory/rooms/${editingRoomId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: roomEditForm.name.trim(),
          customerFacingName: roomEditForm.customerFacingName.trim() || null,
          maxOccupancy: Number(roomEditForm.maxOccupancy) || 2,
          baseQuantity: Number(roomEditForm.baseQuantity) || 1,
          bedConfig: roomEditForm.bedConfig.trim() || null,
        }),
      });
      setRoomEditOpen(false);
      setEditingRoomId(null);
      toastSuccess('Room product updated');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update room');
    }
  }

  async function setRoomActive(id: string, isActive: boolean) {
    try {
      await api(`/inventory/rooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      toastSuccess(isActive ? 'Room product restored' : 'Room product archived');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update room');
    }
  }

  async function addAllotment() {
    if (!allotmentForm.roomProductId) {
      toastError('Pick a room product');
      return;
    }
    if (!allotmentForm.startDate || !allotmentForm.endDate) {
      toastError('Pick from and to dates');
      return;
    }
    if (allotmentForm.startDate > allotmentForm.endDate) {
      toastError('From must be on or before To');
      return;
    }
    const room = rooms.find((r) => r.id === allotmentForm.roomProductId);
    const availableCount = Number(allotmentForm.availableCount) || 0;
    if (room && availableCount > (room.baseQuantity ?? 1)) {
      toastError(
        `Available count cannot exceed physical units (${room.baseQuantity ?? 1})`,
      );
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
      setAllotmentFormOpen(false);
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

  async function placeAllocation() {
    if (!allocForm.startAt || !allocForm.endAt) {
      toastError('Start and end are required');
      return;
    }
    try {
      await api('/inventory/allocate', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          startAt: new Date(allocForm.startAt).toISOString(),
          endAt: new Date(allocForm.endAt).toISOString(),
          fleetUnitId: allocForm.fleetUnitId || undefined,
          status: allocForm.status,
          notes: allocForm.notes.trim() || null,
        }),
      });
      toastSuccess(
        allocForm.status === 'confirmed' ? 'Unit confirmed' : 'Hold placed',
      );
      setAllocForm((f) => ({ ...f, notes: '' }));
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not allocate unit');
    }
  }

  async function patchAllocation(
    id: string,
    status: 'confirmed' | 'released',
  ) {
    try {
      await api(`/inventory/allocations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toastSuccess(status === 'released' ? 'Hold released' : 'Hold confirmed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update allocation');
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

  const roomNameChip = ROOM_NAME_PRESETS.some((o) => o.value === roomForm.name)
    ? roomForm.name
    : '';
  const bedChip = BED_PRESETS.some((o) => o.value === roomForm.bedConfig)
    ? roomForm.bedConfig
    : '';

  return (
    <div className="space-y-4">
      {stay ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Rooms & allotments</h3>
              <p className="text-xs text-muted-foreground">
                Contracted/local availability — not full PMS inventory
                {assetName?.trim() ? ` · ${assetName.trim()}` : ''}. Set room
                types, then allotment windows for stop-sell and availability.
              </p>
            </div>
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                {rooms.length ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openAllotmentForm()}
                  >
                    <CalendarPlus className="size-3.5" />
                    Add allotment
                  </Button>
                ) : null}
                <Button type="button" size="sm" onClick={openRoomForm}>
                  <Plus className="size-3.5" />
                  Add room
                </Button>
              </div>
            ) : null}
          </div>

          {rooms.length ? (
            <ul className="space-y-2">
              {rooms.map((r) => {
                const active = r.isActive !== false;
                return (
                  <li
                    key={r.id}
                    className={`rounded-xl border border-border/60 px-3 py-3 text-sm ${
                      active ? '' : 'opacity-60'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <BedDouble className="size-3.5 text-muted-foreground" />
                          <span className="font-medium">{r.name}</span>
                          {r.customerFacingName?.trim() ? (
                            <span className="text-xs text-muted-foreground">
                              Proposal: {r.customerFacingName.trim()}
                            </span>
                          ) : null}
                          {!active ? (
                            <StatusBadge value="archived" label="Archived" showIcon={false} />
                          ) : null}
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            Occ {r.maxOccupancy ?? '—'}
                          </span>
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {r.baseQuantity ?? '—'} units
                          </span>
                        </div>
                        {r.bedConfig ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{r.bedConfig}</p>
                        ) : null}
                      </div>
                      {canWrite ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => openEditRoom(r)}
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => void setRoomActive(r.id, !active)}
                          >
                            {active ? 'Archive' : 'Restore'}
                          </Button>
                          {active ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() => openAllotmentForm(r.id)}
                            >
                              <CalendarPlus className="size-3.5" />
                              Dates
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {r.allotments?.length ? (
                      <ul className="mt-3 divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50">
                        {r.allotments.map((a) => {
                          const stopSold = a.stopSell || a.availableCount === 0;
                          const expired = isAllotmentExpired(a.endDate);
                          return (
                            <li
                              key={a.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 text-xs"
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-foreground">
                                  {formatDay(a.startDate)} → {formatDay(a.endDate)}
                                </span>
                                <span className="text-muted-foreground">
                                  {a.availableCount} available
                                </span>
                                {stopSold ? (
                                  <StatusBadge value="stop_sell" label="Stop sold" showIcon={false} />
                                ) : null}
                                {expired ? (
                                  <StatusBadge value="expired" label="Expired" showIcon={false} />
                                ) : null}
                              </div>
                              {canWrite ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-7"
                                  aria-label="Remove allotment"
                                  onClick={() => void removeAllotment(a.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : active ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        No allotment windows yet
                        {canWrite ? ' — add a date window to control availability.' : '.'}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No room products yet. Add Deluxe / Suite / Family types first, then set
                allotment windows.
              </p>
              {canWrite ? (
                <Button type="button" size="sm" className="mt-3" onClick={openRoomForm}>
                  <Plus className="size-3.5" />
                  Add first room
                </Button>
              ) : null}
            </div>
          )}

          <RecordSheet
            open={roomFormOpen}
            onOpenChange={setRoomFormOpen}
            title="Add room product"
            description="Name the sellable type, how many guests it sleeps, and how many units you have."
            submitLabel="Save room"
            onSubmit={() => void addRoom()}
          >
            <div className="space-y-4">
              <FormField label="Room name" required>
                <Input
                  value={roomForm.name}
                  onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Deluxe double"
                  autoFocus
                />
                <QuickPicks label="Quick pick">
                  <SuggestionChips
                    aria-label="Room name presets"
                    allowDeselect
                    options={ROOM_NAME_PRESETS}
                    value={roomNameChip}
                    onChange={(name) => setRoomForm((f) => ({ ...f, name }))}
                  />
                </QuickPicks>
              </FormField>

              <FormField
                label="Proposal name"
                description="Optional customer-facing label on itineraries."
              >
                <Input
                  value={roomForm.customerFacingName}
                  onChange={(e) =>
                    setRoomForm((f) => ({ ...f, customerFacingName: e.target.value }))
                  }
                  placeholder="Deluxe mountain view"
                />
              </FormField>

              <FormGrid>
                <FormField
                  label="Sleeps"
                  description="Max guests in this room type."
                >
                  <NumberField
                    aria-label="Sleeps"
                    min={1}
                    value={roomForm.maxOccupancy}
                    onChange={(maxOccupancy) =>
                      setRoomForm((f) => ({ ...f, maxOccupancy }))
                    }
                    quickPicks={OCC_QUICK_PICKS}
                  />
                </FormField>
                <FormField
                  label="Units"
                  description="How many physical rooms of this type."
                >
                  <NumberField
                    aria-label="Units"
                    min={1}
                    value={roomForm.baseQuantity}
                    onChange={(baseQuantity) =>
                      setRoomForm((f) => ({ ...f, baseQuantity }))
                    }
                    quickPicks={UNIT_QUICK_PICKS}
                  />
                </FormField>
              </FormGrid>

              <FormField
                label="Beds"
                description="Optional — shown on inventory cards."
              >
                <Input
                  value={roomForm.bedConfig}
                  onChange={(e) =>
                    setRoomForm((f) => ({ ...f, bedConfig: e.target.value }))
                  }
                  placeholder="e.g. 1 king"
                />
                <QuickPicks label="Quick pick">
                  <SuggestionChips
                    aria-label="Bed config"
                    allowDeselect
                    options={BED_PRESETS}
                    value={bedChip}
                    onChange={(bedConfig) => setRoomForm((f) => ({ ...f, bedConfig }))}
                  />
                </QuickPicks>
              </FormField>

              {roomForm.name.trim() ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {roomForm.name.trim()}
                  </span>
                  {' · '}
                  sleeps {roomForm.maxOccupancy || '—'}
                  {' · '}
                  {roomForm.baseQuantity || '—'} unit
                  {Number(roomForm.baseQuantity) === 1 ? '' : 's'}
                  {roomForm.bedConfig.trim()
                    ? ` · ${roomForm.bedConfig.trim()}`
                    : ''}
                </div>
              ) : null}
            </div>
          </RecordSheet>

          <RecordSheet
            open={roomEditOpen}
            onOpenChange={(open) => {
              setRoomEditOpen(open);
              if (!open) setEditingRoomId(null);
            }}
            title="Edit room product"
            description="Internal name, proposal label, and capacity for this room type."
            submitLabel="Save changes"
            onSubmit={() => void saveRoomEdit()}
          >
            <div className="space-y-4">
              <FormField label="Room name" required>
                <Input
                  value={roomEditForm.name}
                  onChange={(e) =>
                    setRoomEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  autoFocus
                />
              </FormField>
              <FormField label="Proposal name">
                <Input
                  value={roomEditForm.customerFacingName}
                  onChange={(e) =>
                    setRoomEditForm((f) => ({ ...f, customerFacingName: e.target.value }))
                  }
                  placeholder="Deluxe mountain view"
                />
              </FormField>
              <FormGrid>
                <FormField label="Sleeps">
                  <NumberField
                    aria-label="Sleeps"
                    min={1}
                    value={roomEditForm.maxOccupancy}
                    onChange={(maxOccupancy) =>
                      setRoomEditForm((f) => ({ ...f, maxOccupancy }))
                    }
                    quickPicks={OCC_QUICK_PICKS}
                  />
                </FormField>
                <FormField label="Units">
                  <NumberField
                    aria-label="Units"
                    min={1}
                    value={roomEditForm.baseQuantity}
                    onChange={(baseQuantity) =>
                      setRoomEditForm((f) => ({ ...f, baseQuantity }))
                    }
                    quickPicks={UNIT_QUICK_PICKS}
                  />
                </FormField>
              </FormGrid>
              <FormField label="Beds">
                <Input
                  value={roomEditForm.bedConfig}
                  onChange={(e) =>
                    setRoomEditForm((f) => ({ ...f, bedConfig: e.target.value }))
                  }
                  placeholder="e.g. 1 king"
                />
              </FormField>
            </div>
          </RecordSheet>

          <RecordSheet
            open={allotmentFormOpen}
            onOpenChange={setAllotmentFormOpen}
            title="Add allotment window"
            description="Set how many of this room type are sellable between two dates."
            submitLabel="Save allotment"
            onSubmit={() => void addAllotment()}
          >
            <div className="space-y-4">
              <FormField label="Room product" required>
                <Combobox
                  options={rooms
                    .filter((r) => r.isActive !== false)
                    .map((r) => ({ value: r.id, label: r.name }))}
                  value={allotmentForm.roomProductId || undefined}
                  onChange={(roomProductId) => {
                    const room = rooms.find((r) => r.id === roomProductId);
                    setAllotmentForm((f) => ({
                      ...f,
                      roomProductId,
                      availableCount: String(room?.baseQuantity || f.availableCount),
                    }));
                  }}
                  placeholder="Select product"
                />
              </FormField>
              <FormGrid>
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
              <FormField
                label="Available count"
                description="Defaults to units for that room — lower it to hold inventory back."
              >
                <NumberField
                  aria-label="Available count"
                  min={0}
                  value={allotmentForm.availableCount}
                  onChange={(availableCount) =>
                    setAllotmentForm((f) => ({ ...f, availableCount }))
                  }
                  quickPicks={[0, 1, 2, 3, 4, 6, 8]}
                />
              </FormField>
            </div>
          </RecordSheet>
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
            <div>
              <strong className="text-sm">Holds & allocations</strong>
              <p className="text-xs text-muted-foreground">
                Place a hold or confirm a plate for a window. Agency transfer
                assigns appear here when linked. Release frees the calendar.
              </p>
            </div>
            {canWrite ? (
              <>
                <FormGrid>
                  <FormField label="Start date">
                    <DatePicker
                      value={parseDateInput(splitDateTimeLocal(allocForm.startAt).date)}
                      onChange={(d) =>
                        setAllocForm((f) => ({
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
                      value={splitDateTimeLocal(allocForm.startAt).time || undefined}
                      onChange={(time) =>
                        setAllocForm((f) => ({
                          ...f,
                          startAt: patchDateTimeLocal(f.startAt, {
                            time: time || '09:00',
                          }),
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="End date">
                    <DatePicker
                      value={parseDateInput(splitDateTimeLocal(allocForm.endAt).date)}
                      onChange={(d) =>
                        setAllocForm((f) => ({
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
                      value={splitDateTimeLocal(allocForm.endAt).time || undefined}
                      onChange={(time) =>
                        setAllocForm((f) => ({
                          ...f,
                          endAt: patchDateTimeLocal(f.endAt, {
                            time: time || '18:00',
                          }),
                        }))
                      }
                    />
                  </FormField>
                  {fleet ? (
                    <FormField label="Unit (optional)">
                      <Combobox
                        options={[
                          { value: '', label: 'First free unit' },
                          ...units.map((u) => ({
                            value: u.id,
                            label: [u.name, u.plateNumber].filter(Boolean).join(' · '),
                          })),
                        ]}
                        value={allocForm.fleetUnitId}
                        onChange={(fleetUnitId) =>
                          setAllocForm((f) => ({ ...f, fleetUnitId }))
                        }
                        placeholder="First free unit"
                      />
                    </FormField>
                  ) : null}
                  <FormField label="Status">
                    <Combobox
                      options={[
                        { value: 'hold', label: 'Hold' },
                        { value: 'confirmed', label: 'Confirmed' },
                      ]}
                      value={allocForm.status}
                      onChange={(status) =>
                        setAllocForm((f) => ({
                          ...f,
                          status: status === 'confirmed' ? 'confirmed' : 'hold',
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Notes">
                    <Input
                      value={allocForm.notes}
                      onChange={(e) =>
                        setAllocForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      placeholder="Guest / duty note"
                    />
                  </FormField>
                </FormGrid>
                <Button type="button" size="sm" onClick={() => void placeAllocation()}>
                  <CalendarPlus className="size-3.5" />
                  Place allocation
                </Button>
              </>
            ) : null}
            <ul className="space-y-1.5 text-sm">
              {allocations.length === 0 ? (
                <li className="text-xs text-muted-foreground">No allocations yet.</li>
              ) : (
                allocations.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 glass-row"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          value={a.status === 'hold' ? 'held' : a.status}
                          label={
                            a.status === 'hold'
                              ? 'Hold'
                              : a.status === 'released'
                                ? 'Released'
                                : 'Confirmed'
                          }
                          showIcon={false}
                        />
                        <span className="text-xs text-muted-foreground">
                          {a.fleetUnit
                            ? [a.fleetUnit.name, a.fleetUnit.plateNumber]
                                .filter(Boolean)
                                .join(' · ')
                            : 'Asset'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {a.startAt ? new Date(a.startAt).toLocaleString() : '—'} →{' '}
                        {a.endAt ? new Date(a.endAt).toLocaleString() : '—'}
                        {a.bookingComponent?.trip?.tripNumber
                          ? ` · ${a.bookingComponent.trip.tripNumber}`
                          : ''}
                        {a.bookingComponent?.title
                          ? ` · ${a.bookingComponent.title}`
                          : a.notes?.trim()
                            ? ` · ${a.notes.trim()}`
                            : ''}
                      </div>
                    </div>
                    {canWrite &&
                    (a.status === 'hold' || a.status === 'confirmed') ? (
                      <div className="flex flex-wrap gap-1">
                        {a.status === 'hold' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void patchAllocation(a.id, 'confirmed')}
                          >
                            Confirm
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void patchAllocation(a.id, 'released')}
                        >
                          Release
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {fleet || driver ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <strong className="text-sm">Availability calendar</strong>
            <p className="text-xs text-muted-foreground">
              Manual blocks (maintenance / notes). Prefer Holds & allocations for
              guest duties.
            </p>
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
                      onChange={(e) =>
                        setOfferForm((f) => ({ ...f, capacity: e.target.value }))
                      }
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
