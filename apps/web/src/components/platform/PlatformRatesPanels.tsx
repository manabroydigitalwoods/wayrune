import { useCallback, useEffect, useState } from 'react';
import { IndianRupee, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  EmptyState,
  Input,
  NumberField,
  PriceField,
  SimpleFormField as FormField,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';
import { PlaceSinglePicker } from '../places/PlacePicker';
import type { PlaceRef } from '../../lib/placeRefs';

type FareRow = {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  vehicleTypeId: string;
  unitCost: number | string;
  childUnitCost?: number | string | null;
  pricingMode?: string;
  fromPlace?: { id: string; name: string };
  toPlace?: { id: string; name: string };
  vehicleType?: { id: string; name: string };
};

type HotelRow = {
  id: string;
  placeId?: string | null;
  roomType?: string | null;
  unitCost: number | string;
  place?: { id: string; name: string } | null;
};

type EdgeRow = {
  id: string;
  distanceKm?: number | null;
  durationMin?: number | null;
  roadHint?: string | null;
  mode: string;
  fromPlace?: { id: string; name: string };
  toPlace?: { id: string; name: string };
};

type VehicleOpt = { value: string; label: string };

const CLUSTERS = [
  { value: 'darjeeling-hills', label: 'Darjeeling hills' },
  { value: 'gangtok-day-trips', label: 'Gangtok day trips' },
  { value: 'guwahati-meghalaya', label: 'Guwahati–Shillong–Sohra' },
  { value: 'kaziranga-leg', label: 'Kaziranga corridor' },
];

export function PlatformTransferFaresPanel() {
  const [items, setItems] = useState<FareRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([]);
  const [q, setQ] = useState('');
  const [clusterKey, setClusterKey] = useState('darjeeling-hills');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    from: null as PlaceRef | null,
    to: null as PlaceRef | null,
    vehicleTypeId: '',
    unitCost: '',
    childUnitCost: '',
    pricingMode: 'per_vehicle',
  });

  function startEdit(f: FareRow) {
    setEditingId(f.id);
    setForm({
      from: f.fromPlace
        ? { placeId: f.fromPlaceId, name: f.fromPlace.name }
        : null,
      to: f.toPlace ? { placeId: f.toPlaceId, name: f.toPlace.name } : null,
      vehicleTypeId: f.vehicleTypeId,
      unitCost: String(Number(f.unitCost)),
      childUnitCost:
        f.childUnitCost != null ? String(Number(f.childUnitCost)) : '',
      pricingMode: f.pricingMode || 'per_vehicle',
    });
  }

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const [fares, vts] = await Promise.all([
      api<{ items: FareRow[] }>(`/platform/transfer-fares?${params}`),
      api<{ items: Array<{ id: string; name: string }> }>(
        '/platform/catalog/vehicle-types',
      ),
    ]);
    setItems(fares.items);
    setVehicles(vts.items.map((v) => ({ value: v.id, label: v.name })));
  }, [q]);

  useEffect(() => {
    void load().catch((e) => reportError(e, 'Could not load fares'));
  }, [load]);

  async function suggest() {
    if (!form.from?.placeId || !form.to?.placeId || !form.vehicleTypeId) {
      toastError('Pick from, to, and vehicle');
      return;
    }
    try {
      const res = await api<{
        suggestedUnitCost: number;
        distanceKm: number;
        source: string;
      }>('/platform/transfer-fares/suggest', {
        method: 'POST',
        body: JSON.stringify({
          fromPlaceId: form.from.placeId,
          toPlaceId: form.to.placeId,
          vehicleTypeId: form.vehicleTypeId,
        }),
      });
      setForm((f) => ({ ...f, unitCost: String(res.suggestedUnitCost) }));
      toastSuccess(
        `Suggested ${formatCurrency(res.suggestedUnitCost, { maximumFractionDigits: 0 })} (${res.distanceKm} km · ${res.source})`,
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Suggest failed');
    }
  }

  async function save() {
    if (!form.from?.placeId || !form.to?.placeId || !form.vehicleTypeId) {
      toastError('Pick from, to, and vehicle');
      return;
    }
    const unitCost = Number(form.unitCost);
    if (!Number.isFinite(unitCost)) {
      toastError('Enter cost');
      return;
    }
    try {
      const body = {
        fromPlaceId: form.from.placeId,
        toPlaceId: form.to.placeId,
        vehicleTypeId: form.vehicleTypeId,
        unitCost,
        childUnitCost: form.childUnitCost
          ? Number(form.childUnitCost)
          : null,
        pricingMode: form.pricingMode,
      };
      if (editingId) {
        await api(`/platform/transfer-fares/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('System fare updated');
      } else {
        await api('/platform/transfer-fares', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('System fare saved');
      }
      setEditingId(null);
      setForm({
        from: null,
        to: null,
        vehicleTypeId: '',
        unitCost: '',
        childUnitCost: '',
        pricingMode: 'per_vehicle',
      });
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function dryRunMatrix() {
    try {
      const res = await api<{ count: number }>(
        '/platform/transfer-fares/generate-matrix',
        {
          method: 'POST',
          body: JSON.stringify({
            clusterKey,
            vehicleTypeIds: vehicles.slice(0, 3).map((v) => v.value),
            commit: false,
          }),
        },
      );
      setPreviewCount(res.count);
      toastSuccess(`Dry-run: ${res.count} fare pairs`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Matrix preview failed');
    }
  }

  async function commitMatrix() {
    try {
      const res = await api<{ count: number }>(
        '/platform/transfer-fares/generate-matrix',
        {
          method: 'POST',
          body: JSON.stringify({
            clusterKey,
            vehicleTypeIds: vehicles.slice(0, 3).map((v) => v.value),
            commit: true,
          }),
        },
      );
      toastSuccess(`Upserted ${res.count} system fares`);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Matrix commit failed');
    }
  }

  async function remove(id: string) {
    try {
      await api(`/platform/transfer-fares/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter routes…"
              className="max-w-xs"
            />
            <span className="text-muted-foreground text-xs">{items.length} fares</span>
          </div>
          {items.length === 0 ? (
            <EmptyState
              icon={IndianRupee}
              title="No system fares"
              description="Seed corridors or generate a cluster matrix."
            />
          ) : (
            <ul className="divide-border max-h-[28rem] divide-y overflow-auto text-sm">
              {items.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => startEdit(f)}
                  >
                    <div className="font-medium text-primary hover:underline">
                      {f.fromPlace?.name} → {f.toPlace?.name}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {f.vehicleType?.name} ·{' '}
                      {formatCurrency(f.unitCost, { maximumFractionDigits: 0 })} ·{' '}
                      {f.pricingMode === 'per_adult' ? 'per adult' : 'per vehicle'}
                    </div>
                  </button>
                  <Button size="icon" variant="ghost" onClick={() => void remove(f.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {editingId ? 'Edit system fare' : 'Add system fare'}
              </h3>
              {editingId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm({
                      from: null,
                      to: null,
                      vehicleTypeId: '',
                      unitCost: '',
                      childUnitCost: '',
                      pricingMode: 'per_vehicle',
                    });
                  }}
                >
                  New
                </Button>
              ) : null}
            </div>
            <PlaceSinglePicker
              label="From"
              purpose="transfer_pickup"
              value={form.from}
              onChange={(from) => setForm({ ...form, from })}
              placeholder="Pickup…"
            />
            <PlaceSinglePicker
              label="To"
              purpose="transfer_drop"
              value={form.to}
              onChange={(to) => setForm({ ...form, to })}
              placeholder="Drop…"
            />
            <FormField label="Vehicle">
              <Combobox
                value={form.vehicleTypeId}
                onChange={(vehicleTypeId) => setForm({ ...form, vehicleTypeId })}
                options={vehicles}
                placeholder="Vehicle type"
              />
            </FormField>
            <FormField label="Adult / vehicle cost">
              <PriceField
                value={form.unitCost}
                onChange={(unitCost) => setForm({ ...form, unitCost })}
                placeholder="5500"
              />
            </FormField>
            <FormField label="Child cost (optional)">
              <PriceField
                value={form.childUnitCost}
                onChange={(childUnitCost) => setForm({ ...form, childUnitCost })}
                placeholder="Optional"
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void suggest()}>
                <Sparkles className="size-4" />
                Suggest
              </Button>
              <Button type="button" onClick={() => void save()}>
                {editingId ? (
                  'Save changes'
                ) : (
                  <>
                    <Plus className="size-4" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h3 className="text-sm font-semibold">Generate cluster matrix</h3>
            <FormField label="Cluster">
              <Combobox
                value={clusterKey}
                onChange={setClusterKey}
                options={CLUSTERS}
              />
            </FormField>
            {previewCount != null ? (
              <p className="text-muted-foreground text-xs">
                Last dry-run: {previewCount} pairs
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void dryRunMatrix()}>
                Preview
              </Button>
              <Button type="button" onClick={() => void commitMatrix()}>
                Commit matrix
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function PlatformHotelRatesPanel() {
  const [items, setItems] = useState<HotelRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceRef | null>(null);
  const [roomType, setRoomType] = useState('');
  const [unitCost, setUnitCost] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: HotelRow[] }>('/platform/hotel-rates');
    setItems(res.items);
  }, []);

  useEffect(() => {
    void load().catch((e) => reportError(e, 'Could not load hotel rates'));
  }, [load]);

  function startEdit(r: HotelRow) {
    setEditingId(r.id);
    setPlace(
      r.place
        ? { placeId: r.placeId || r.place.id, name: r.place.name }
        : null,
    );
    setRoomType(r.roomType || '');
    setUnitCost(String(Number(r.unitCost)));
  }

  async function save() {
    if (!place?.placeId) {
      toastError('Pick a place');
      return;
    }
    const cost = Number(unitCost);
    if (!Number.isFinite(cost)) {
      toastError('Enter cost');
      return;
    }
    try {
      const body = {
        placeId: place.placeId,
        roomType: roomType.trim() || null,
        unitCost: cost,
      };
      if (editingId) {
        await api(`/platform/hotel-rates/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('System hotel rate updated');
      } else {
        await api('/platform/hotel-rates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('System hotel rate saved');
      }
      setEditingId(null);
      setPlace(null);
      setRoomType('');
      setUnitCost('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function remove(id: string) {
    try {
      await api(`/platform/hotel-rates/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="pt-4">
          {items.length === 0 ? (
            <EmptyState
              icon={IndianRupee}
              title="No system hotel rates"
              description="Add place-level default room costs for NE cities."
            />
          ) : (
            <ul className="divide-border divide-y text-sm">
              {items.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => startEdit(r)}
                  >
                    <div className="font-medium text-primary hover:underline">
                      {r.place?.name || '—'}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {r.roomType || 'Default'} ·{' '}
                      {formatCurrency(r.unitCost, { maximumFractionDigits: 0 })}
                    </div>
                  </button>
                  <Button size="icon" variant="ghost" onClick={() => void remove(r.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold">
            {editingId ? 'Edit place default' : 'Add place default'}
          </h3>
          <PlaceSinglePicker label="Place" value={place} onChange={setPlace} />
          <FormField label="Room type">
            <Input
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
              placeholder="Deluxe (blank = default)"
            />
          </FormField>
          <FormField label="Cost / night">
            <PriceField
              value={unitCost}
              onChange={setUnitCost}
              placeholder="4500"
            />
          </FormField>
          <Button onClick={() => void save()}>
            {editingId ? (
              'Save changes'
            ) : (
              <>
                <Plus className="size-4" />
                Save
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function PlatformEdgesPanel() {
  const [items, setItems] = useState<EdgeRow[]>([]);
  const [from, setFrom] = useState<PlaceRef | null>(null);
  const [to, setTo] = useState<PlaceRef | null>(null);
  const [distanceKm, setDistanceKm] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [roadHint, setRoadHint] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: EdgeRow[] }>('/platform/catalog/edges');
    setItems(res.items);
  }, []);

  useEffect(() => {
    void load().catch((e) => reportError(e, 'Could not load edges'));
  }, [load]);

  async function save() {
    if (!from?.placeId || !to?.placeId) {
      toastError('Pick from and to');
      return;
    }
    try {
      await api('/platform/catalog/edges', {
        method: 'POST',
        body: JSON.stringify({
          fromPlaceId: from.placeId,
          toPlaceId: to.placeId,
          mode: 'drive',
          distanceKm: distanceKm ? Number(distanceKm) : null,
          durationMin: durationMin ? Number(durationMin) : null,
          roadHint: roadHint || null,
        }),
      });
      toastSuccess('Edge saved');
      setDistanceKm('');
      setDurationMin('');
      setRoadHint('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function remove(id: string) {
    try {
      await api(`/platform/catalog/edges/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="pt-4">
          <ul className="divide-border max-h-[32rem] divide-y overflow-auto text-sm">
            {items.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">
                    {e.fromPlace?.name} → {e.toPlace?.name}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {e.distanceKm != null ? `${e.distanceKm} km` : '—'} ·{' '}
                    {e.durationMin != null ? `${e.durationMin} min` : '—'}
                    {e.roadHint ? ` · ${e.roadHint}` : ''}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => void remove(e.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold">Upsert edge</h3>
          <PlaceSinglePicker
            label="From"
            purpose="transfer_pickup"
            value={from}
            onChange={setFrom}
            placeholder="Pickup…"
          />
          <PlaceSinglePicker
            label="To"
            purpose="transfer_drop"
            value={to}
            onChange={setTo}
            placeholder="Drop…"
          />
          <FormField label="Distance km">
            <NumberField
              integer={false}
              min={0}
              value={distanceKm}
              onChange={setDistanceKm}
            />
          </FormField>
          <FormField label="Duration min">
            <NumberField
              min={0}
              value={durationMin}
              onChange={setDurationMin}
            />
          </FormField>
          <FormField label="Road hint">
            <Input value={roadHint} onChange={(e) => setRoadHint(e.target.value)} />
          </FormField>
          <Button onClick={() => void save()}>
            <Plus className="size-4" />
            Save edge
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
