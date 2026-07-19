import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  NumberField,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type RoomProduct = {
  id: string;
  name: string;
  maxOccupancy: number;
  baseQuantity: number;
  bedConfig?: string | null;
  rateHint?: string | number | null;
  isActive?: boolean;
  allotments: Array<{
    id: string;
    startDate: string;
    endDate: string;
    availableCount: number;
    stopSell: boolean;
  }>;
};

type RoomUnit = {
  id: string;
  name: string;
  floor?: string | null;
  status: string;
  roomProduct: { id: string; name: string };
};

type CalendarDay = {
  date: string;
  base: number;
  used: number;
  remaining: number;
  stopSell: boolean;
  overbooked: boolean;
};

type CalendarProduct = {
  id: string;
  name: string;
  baseQuantity: number;
  units: RoomUnit[];
  days: CalendarDay[];
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthBounds(anchor: Date) {
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  return { from: isoDate(start), to: isoDate(end) };
}

function dayTone(d: CalendarDay) {
  if (d.stopSell) return 'bg-zinc-500/85 text-white';
  if (d.overbooked) return 'bg-rose-600/85 text-white';
  if (d.remaining <= 0) return 'bg-amber-600/80 text-white';
  if (d.remaining <= Math.max(1, Math.floor(d.base * 0.25))) {
    return 'bg-amber-200/90 text-amber-950';
  }
  return 'bg-primary/12 text-foreground';
}

export function StayRoomsPanel({ assetId }: { assetId: string }) {
  const [rooms, setRooms] = useState<RoomProduct[]>([]);
  const [units, setUnits] = useState<RoomUnit[]>([]);
  const [calendar, setCalendar] = useState<CalendarProduct[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [unitFilter, setUnitFilter] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [allotmentOpen, setAllotmentOpen] = useState(false);
  const [roomForm, setRoomForm] = useState({
    name: '',
    maxOccupancy: '2',
    baseQuantity: '1',
    bedConfig: '',
  });
  const [unitForm, setUnitForm] = useState({
    roomProductId: '',
    name: '',
    floor: '',
  });
  const [allotmentForm, setAllotmentForm] = useState({
    roomProductId: '',
    startDate: isoDate(new Date()),
    endDate: isoDate(new Date(Date.now() + 30 * 86400000)),
    availableCount: '1',
  });
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.partnerInventoryWrite);

  const bounds = useMemo(() => monthBounds(month), [month]);
  const activeRooms = useMemo(
    () => rooms.filter((r) => r.isActive !== false),
    [rooms],
  );
  const roomOptions = useMemo(
    () => activeRooms.map((r) => ({ value: r.id, label: r.name })),
    [activeRooms],
  );

  const filteredUnits = useMemo(
    () =>
      unitFilter
        ? units.filter((u) => u.roomProduct.id === unitFilter)
        : units,
    [units, unitFilter],
  );

  const load = useCallback(async () => {
    try {
      const [r, u, cal] = await Promise.all([
        api<RoomProduct[]>(`/inventory/assets/${assetId}/rooms`),
        api<RoomUnit[]>(`/stay/assets/${assetId}/units`),
        api<{ products: CalendarProduct[] }>(
          `/stay/availability-calendar?assetId=${encodeURIComponent(assetId)}&from=${bounds.from}&to=${bounds.to}`,
        ),
      ]);
      setRooms(r);
      setUnits(u);
      setCalendar(cal.products);
      const firstId = r[0]?.id || '';
      setUnitForm((f) => ({ ...f, roomProductId: f.roomProductId || firstId }));
      setAllotmentForm((f) => ({
        ...f,
        roomProductId: f.roomProductId || firstId,
      }));
    } catch (e) {
      reportError(e, 'Could not load rooms');
    }
  }, [assetId, bounds.from, bounds.to]);

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
      setProductOpen(false);
      toastSuccess('Room product added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add room');
    }
  }

  async function setRoomActive(id: string, isActive: boolean) {
    try {
      await api(`/inventory/rooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      toastSuccess(isActive ? 'Room product activated' : 'Room product deactivated');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update room');
    }
  }

  async function addUnit() {
    if (!unitForm.roomProductId || !unitForm.name.trim()) {
      toastError('Unit name and room product required');
      return;
    }
    try {
      await api('/stay/units', {
        method: 'POST',
        body: JSON.stringify({
          roomProductId: unitForm.roomProductId,
          name: unitForm.name.trim(),
          floor: unitForm.floor.trim() || null,
        }),
      });
      setUnitForm((f) => ({ ...f, name: '', floor: '' }));
      setUnitOpen(false);
      toastSuccess('Unit added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add unit');
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
      setAllotmentOpen(false);
      toastSuccess('Allotment saved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save allotment');
    }
  }

  async function toggleStopSell(allotmentId: string, stopSell: boolean) {
    try {
      await api(`/inventory/allotments/${allotmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stopSell: !stopSell }),
      });
      toastSuccess(stopSell ? 'Stop-sell cleared' : 'Stop-sell set');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update stop-sell');
    }
  }

  function openAllotmentFor(productId?: string) {
    const fallback = productId || allotmentForm.roomProductId || activeRooms[0]?.id || '';
    setAllotmentForm((f) => ({
      ...f,
      roomProductId: fallback,
      startDate: f.startDate || isoDate(new Date()),
      endDate: f.endDate || isoDate(new Date(Date.now() + 30 * 86400000)),
      availableCount:
        f.availableCount ||
        String(rooms.find((r) => r.id === fallback)?.baseQuantity || 1),
    }));
    setAllotmentOpen(true);
  }

  const monthLabel = month.toLocaleString('en', { month: 'long', year: 'numeric' });
  const unitCountByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of units) {
      map.set(u.roomProduct.id, (map.get(u.roomProduct.id) || 0) + 1);
    }
    return map;
  }, [units]);

  return (
    <div className="space-y-5 pb-4">
      {/* Calendar hero */}
      <Card className="overflow-hidden border-border/60">
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h2 className="text-sm font-semibold tracking-tight">Allotment calendar</h2>
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary/25" /> Available
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-amber-200" /> Low
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-amber-600/80" /> Sold out
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-rose-600/85" /> Overbooked
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-zinc-500/85" /> Stop-sell
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/60 p-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Previous month"
                onClick={() =>
                  setMonth(
                    (m) =>
                      new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)),
                  )
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[8.5rem] text-center text-sm font-medium tabular-nums">
                {monthLabel}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Next month"
                onClick={() =>
                  setMonth(
                    (m) =>
                      new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)),
                  )
                }
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-1 h-8"
                onClick={() => setMonth(new Date())}
              >
                Today
              </Button>
            </div>
          </div>

          {calendar.length ? (
            <div className="space-y-4 overflow-x-auto pb-1">
              {calendar.map((p) => (
                <div key={p.id} className="min-w-max">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 pr-1">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      base {p.baseQuantity}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {p.days.map((d) => (
                      <div
                        key={d.date}
                        className={`flex h-11 w-9 flex-col items-center justify-center rounded-md text-[10px] leading-tight transition-colors ${dayTone(d)}`}
                        title={`${d.date}: ${d.remaining} left of ${d.base}${d.stopSell ? ' · stop-sell' : ''}${d.overbooked ? ' · overbooked' : ''}`}
                      >
                        <span className="opacity-70">{Number(d.date.slice(8, 10))}</span>
                        <span className="text-xs font-semibold tabular-nums">{d.remaining}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Add a room product to see nightly availability.
              </p>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => setProductOpen(true)}
                >
                  <Plus className="size-4" />
                  Add product
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Products */}
        <Card className="border-border/60">
          <CardContent className="flex flex-col gap-3 p-5 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Room products</h2>
                <p className="text-xs text-muted-foreground">
                  Types you sell · {activeRooms.length} active
                  {rooms.length > activeRooms.length
                    ? ` · ${rooms.length - activeRooms.length} inactive`
                    : ''}
                </p>
              </div>
              {canWrite ? (
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!activeRooms.length}
                    onClick={() => openAllotmentFor()}
                  >
                    Set allotment
                  </Button>
                  <Button type="button" size="sm" onClick={() => setProductOpen(true)}>
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>
              ) : null}
            </div>

            {rooms.length ? (
              <ul className="space-y-2">
                {rooms.map((r) => {
                  const allot = r.allotments[0];
                  const unitCount = unitCountByProduct.get(r.id) || 0;
                  const active = r.isActive !== false;
                  return (
                    <li
                      key={r.id}
                      className={`rounded-xl border border-border/60 px-3.5 py-3 text-sm glass-row ${
                        active ? '' : 'opacity-70'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{r.name}</span>
                            <StatusBadge
                              value={active ? 'active' : 'inactive'}
                              showIcon={false}
                            />
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {r.baseQuantity} rooms · max {r.maxOccupancy}
                            {r.bedConfig ? ` · ${r.bedConfig}` : ''}
                            {` · ${unitCount} unit${unitCount === 1 ? '' : 's'}`}
                          </div>
                        </div>
                        {canWrite ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => void setRoomActive(r.id, !active)}
                          >
                            {active ? 'Deactivate' : 'Activate'}
                          </Button>
                        ) : null}
                      </div>
                      {active && allot ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5 text-xs">
                          <span className="text-muted-foreground tabular-nums">
                            {allot.startDate.slice(0, 10)} → {allot.endDate.slice(0, 10)}
                            {' · '}
                            {allot.availableCount}/night
                          </span>
                          {allot.stopSell ? (
                            <StatusBadge value="stop_sell" showIcon={false} />
                          ) : null}
                          {canWrite ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="ml-auto h-7 px-2.5 text-[11px]"
                              onClick={() => void toggleStopSell(allot.id, allot.stopSell)}
                            >
                              {allot.stopSell ? 'Clear stop-sell' : 'Stop-sell'}
                            </Button>
                          ) : null}
                          {canWrite ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => openAllotmentFor(r.id)}
                            >
                              Edit window
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {canWrite && active && !allot ? (
                        <div className="mt-2.5 border-t border-border/40 pt-2.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => openAllotmentFor(r.id)}
                          >
                            Add allotment window
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                No products yet. Add Deluxe, Suite, or similar.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Units */}
        <Card className="border-border/60">
          <CardContent className="flex flex-col gap-3 p-5 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Room units</h2>
                <p className="text-xs text-muted-foreground">
                  Physical / labeled rooms · {units.length} total
                </p>
              </div>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!activeRooms.length}
                  onClick={() => {
                    setUnitForm((f) => ({
                      ...f,
                      roomProductId: f.roomProductId || activeRooms[0]?.id || '',
                    }));
                    setUnitOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              ) : null}
            </div>

            {activeRooms.length > 1 ? (
              <Combobox
                options={[
                  { value: '', label: 'All products' },
                  ...roomOptions,
                ]}
                value={unitFilter}
                onChange={setUnitFilter}
                placeholder="All products"
              />
            ) : null}

            {filteredUnits.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {filteredUnits.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm glass-row"
                  >
                    <div className="min-w-0">
                      <div className="font-medium tabular-nums">
                        {u.name}
                        {u.floor ? (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · Fl {u.floor}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {u.roomProduct.name}
                      </div>
                    </div>
                    <StatusBadge value={u.status} showIcon={false} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                {activeRooms.length
                  ? 'No units for this filter. Add 101, 102…'
                  : 'Add a product before creating units.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <RecordSheet
        open={productOpen}
        onOpenChange={setProductOpen}
        title="Add room product"
        description="A sellable room type under this property."
        submitLabel="Add product"
        onSubmit={() => void addRoom()}
      >
        <FormField label="Name" required>
          <Input
            value={roomForm.name}
            onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Deluxe twin"
            required
          />
        </FormField>
        <FormGrid>
          <FormField label="Max occupancy">
            <NumberField
              aria-label="Max occupancy"
              min={1}
              value={roomForm.maxOccupancy}
              onChange={(maxOccupancy) =>
                setRoomForm((f) => ({ ...f, maxOccupancy }))
              }
              quickPicks={[1, 2, 3, 4, 5, 6]}
            />
          </FormField>
          <FormField label="Base quantity">
            <NumberField
              aria-label="Base quantity"
              min={1}
              value={roomForm.baseQuantity}
              onChange={(baseQuantity) =>
                setRoomForm((f) => ({ ...f, baseQuantity }))
              }
              quickPicks={[1, 2, 3, 4, 6, 8, 10]}
            />
          </FormField>
        </FormGrid>
        <FormField label="Bed config">
          <Input
            value={roomForm.bedConfig}
            onChange={(e) => setRoomForm((f) => ({ ...f, bedConfig: e.target.value }))}
            placeholder="1 king · 2 twin"
          />
        </FormField>
      </RecordSheet>

      <RecordSheet
        open={unitOpen}
        onOpenChange={setUnitOpen}
        title="Add room unit"
        description="A labeled room under a product (e.g. 101)."
        submitLabel="Add unit"
        onSubmit={() => void addUnit()}
      >
        <FormField label="Product" required>
          <Combobox
            options={roomOptions}
            value={unitForm.roomProductId || undefined}
            onChange={(roomProductId) => setUnitForm((f) => ({ ...f, roomProductId }))}
            placeholder="Select product"
          />
        </FormField>
        <FormGrid>
          <FormField label="Unit name" required>
            <Input
              value={unitForm.name}
              onChange={(e) => setUnitForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="101"
              required
            />
          </FormField>
          <FormField label="Floor">
            <Input
              value={unitForm.floor}
              onChange={(e) => setUnitForm((f) => ({ ...f, floor: e.target.value }))}
              placeholder="1"
            />
          </FormField>
        </FormGrid>
      </RecordSheet>

      <RecordSheet
        open={allotmentOpen}
        onOpenChange={setAllotmentOpen}
        title="Allotment window"
        description="How many of this product can be sold each night."
        submitLabel="Save allotment"
        onSubmit={() => void addAllotment()}
      >
        <FormField label="Product" required>
          <Combobox
            options={roomOptions}
            value={allotmentForm.roomProductId || undefined}
            onChange={(roomProductId) => {
              const product = rooms.find((r) => r.id === roomProductId);
              setAllotmentForm((f) => ({
                ...f,
                roomProductId,
                availableCount: product
                  ? String(product.baseQuantity)
                  : f.availableCount,
              }));
            }}
            placeholder="Select product"
          />
        </FormField>
        <FormField label="Count per night" required>
          <Input
            type="number"
            value={allotmentForm.availableCount}
            onChange={(e) =>
              setAllotmentForm((f) => ({ ...f, availableCount: e.target.value }))
            }
          />
        </FormField>
        <FormGrid>
          <FormField label="From" required>
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
          <FormField label="To" required>
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
      </RecordSheet>
    </div>
  );
}
