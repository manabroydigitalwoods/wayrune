import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  Button,
  Combobox,
  DatePicker,
  EntityCombobox,
  FormGrid,
  Input,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api, type SupplierTransferFareRow } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { PlaceSinglePicker } from '../places/PlacePicker';
import { type PlaceRef } from '../../lib/placeRefs';
import { RatesCsvImportDialog } from '../rates/RatesCsvImportDialog';

type TransferFare = SupplierTransferFareRow;

function isoDate(raw?: string | Date | null): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  return raw.toISOString().slice(0, 10);
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

function seasonLabel(r: TransferFare): string {
  const from = isoDate(r.startDate);
  const to = isoDate(r.endDate);
  if (from && to) return `${formatDay(from)} → ${formatDay(to)}`;
  if (from) return `From ${formatDay(from)}`;
  if (to) return `Until ${formatDay(to)}`;
  return 'Open dates';
}

function money(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function searchVehicleTypes(q: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const res = await api<{
    items: Array<{ id: string; name: string; seats?: number | null }>;
  }>(`/vehicle-types?${params.toString()}`);
  return res.items.map((v) => ({
    value: v.id,
    label: v.name,
    description: v.seats != null ? `${v.seats} seats` : undefined,
  }));
}

function emptyForm(defaultFrom?: PlaceRef | null) {
  return {
    from: (defaultFrom || null) as PlaceRef | null,
    to: null as PlaceRef | null,
    vehicleTypeId: '',
    vehicleLabel: '',
    unitCost: '',
    childUnitCost: '',
    infantUnitCost: '',
    childAgeMin: '',
    childAgeMax: '',
    pricingMode: 'per_vehicle' as 'per_vehicle' | 'per_adult',
    startDate: '',
    endDate: '',
  };
}

export function SupplierTransferFaresPanel({
  supplierId,
  supplierName,
  defaultPlace,
}: {
  supplierId: string;
  supplierName: string;
  defaultPlace?: PlaceRef | null;
}) {
  const [fares, setFares] = useState<TransferFare[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(defaultPlace));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: TransferFare[] }>(
        `/transfer-fares?supplierId=${encodeURIComponent(supplierId)}`,
      );
      setFares(res.items);
    } catch (e) {
      reportError(e, 'Could not load transfer fares');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...fares].sort((a, b) => {
      const from = (a.fromPlace?.name || '').localeCompare(b.fromPlace?.name || '');
      if (from) return from;
      const to = (a.toPlace?.name || '').localeCompare(b.toPlace?.name || '');
      if (to) return to;
      return (a.vehicleType?.name || '').localeCompare(b.vehicleType?.name || '');
    });
  }, [fares]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm(defaultPlace));
    setFormOpen(true);
  }

  function startEdit(fare: TransferFare) {
    setEditingId(fare.id);
    setForm({
      from: fare.fromPlace
        ? {
            placeId: fare.fromPlace.id,
            name: fare.fromPlace.name,
            kind: fare.fromPlace.kind,
          }
        : null,
      to: fare.toPlace
        ? {
            placeId: fare.toPlace.id,
            name: fare.toPlace.name,
            kind: fare.toPlace.kind,
          }
        : null,
      vehicleTypeId: fare.vehicleTypeId,
      vehicleLabel: fare.vehicleType?.name || '',
      unitCost: String(money(fare.unitCost) ?? ''),
      childUnitCost:
        money(fare.childUnitCost) != null ? String(money(fare.childUnitCost)) : '',
      infantUnitCost:
        money(fare.infantUnitCost) != null ? String(money(fare.infantUnitCost)) : '',
      childAgeMin: fare.childAgeMin != null ? String(fare.childAgeMin) : '',
      childAgeMax: fare.childAgeMax != null ? String(fare.childAgeMax) : '',
      pricingMode: (fare.pricingMode as 'per_vehicle' | 'per_adult') || 'per_vehicle',
      startDate: isoDate(fare.startDate),
      endDate: isoDate(fare.endDate),
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm(defaultPlace));
  }

  const canSave = useMemo(() => {
    if (!form.from?.placeId || !form.to?.placeId) return false;
    if (form.from.placeId === form.to.placeId) return false;
    if (!form.vehicleTypeId) return false;
    const unit = Number(form.unitCost);
    if (!Number.isFinite(unit) || unit < 0) return false;
    if (form.childUnitCost.trim()) {
      const child = Number(form.childUnitCost);
      if (!Number.isFinite(child) || child < 0) return false;
    }
    if (form.infantUnitCost.trim()) {
      const infant = Number(form.infantUnitCost);
      if (!Number.isFinite(infant) || infant < 0) return false;
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) return false;
    return true;
  }, [form]);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const body = {
        supplierId,
        fromPlaceId: form.from!.placeId,
        toPlaceId: form.to!.placeId,
        vehicleTypeId: form.vehicleTypeId,
        unitCost: Number(form.unitCost),
        childUnitCost: form.childUnitCost.trim()
          ? Number(form.childUnitCost)
          : null,
        infantUnitCost: form.infantUnitCost.trim()
          ? Number(form.infantUnitCost)
          : null,
        childAgeMin: form.childAgeMin.trim() ? Number(form.childAgeMin) : null,
        childAgeMax: form.childAgeMax.trim() ? Number(form.childAgeMax) : null,
        pricingMode: form.pricingMode,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (editingId) {
        await api(`/transfer-fares/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Transfer fare updated');
      } else {
        await api('/transfer-fares', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('Transfer fare saved');
      }
      closeForm();
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save fare');
    } finally {
      setSaving(false);
    }
  }

  async function remove(fare: TransferFare) {
    if (
      !window.confirm(
        `Remove ${fare.fromPlace?.name || '—'} → ${fare.toPlace?.name || '—'}?`,
      )
    ) {
      return;
    }
    try {
      await api(`/transfer-fares/${fare.id}`, { method: 'DELETE' });
      toastSuccess('Transfer fare removed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove fare');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Transfer fare chart</h3>
          <p className="text-xs text-muted-foreground">
            Negotiated corridors for {supplierName}. Match rate prefers these over
            catalog defaults when this supplier is selected.
          </p>
        </div>
        <Can anyOf={CAP.ratesWrite}>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              Add corridor
            </Button>
          </div>
        </Can>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading fares…</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
          No supplier corridors yet. Add Siliguri → Darjeeling (or similar) so
          quotes match this fleet’s buy rate.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
          {sorted.map((fare) => {
            const unit = money(fare.unitCost);
            return (
              <li
                key={fare.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {fare.fromPlace?.name || '—'} → {fare.toPlace?.name || '—'}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {fare.vehicleType?.name || 'Vehicle'}
                    {fare.pricingMode === 'per_adult' ? ' · per adult' : ' · per vehicle'}
                    {fare.childAgeMin != null && fare.childAgeMax != null
                      ? ` · ages ${fare.childAgeMin}–${fare.childAgeMax}`
                      : ''}
                    {' · '}
                    {seasonLabel(fare)}
                  </div>
                  <div className="mt-1 text-sm">
                    {unit != null ? formatCurrency(unit, fare.currency) : '—'}
                  </div>
                </div>
                <Can anyOf={CAP.ratesWrite}>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => startEdit(fare)}
                      aria-label="Edit fare"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void remove(fare)}
                      aria-label="Remove fare"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Can>
              </li>
            );
          })}
        </ul>
      )}

      <RecordSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
        title={editingId ? 'Edit corridor' : 'Add corridor'}
        description={`Supplier chart · ${supplierName}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeForm}>
              Cancel
            </Button>
            <Button disabled={!canSave || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
      >
        <FormGrid>
          <PlaceSinglePicker
            label="From"
            value={form.from}
            onChange={(from) => setForm((f) => ({ ...f, from }))}
          />
          <PlaceSinglePicker
            label="To"
            value={form.to}
            onChange={(to) => setForm((f) => ({ ...f, to }))}
          />
          <FormField label="Vehicle type" required>
            <EntityCombobox
              value={form.vehicleTypeId}
              selectedLabel={form.vehicleLabel || undefined}
              onChange={(vehicleTypeId, option) => {
                setForm((f) => ({
                  ...f,
                  vehicleTypeId,
                  vehicleLabel: option?.label || f.vehicleLabel,
                }));
              }}
              onSearch={searchVehicleTypes}
              placeholder="Innova / Tempo / …"
            />
          </FormField>
          <FormField label="Pricing mode">
            <Combobox
              value={form.pricingMode}
              onChange={(pricingMode) =>
                setForm((f) => ({
                  ...f,
                  pricingMode: (pricingMode || 'per_vehicle') as
                    | 'per_vehicle'
                    | 'per_adult',
                }))
              }
              options={[
                { value: 'per_vehicle', label: 'Per vehicle (full cab)' },
                { value: 'per_adult', label: 'Per adult (party blend)' },
              ]}
            />
          </FormField>
          <FormField label="Adult / vehicle" required>
            <PriceField
              value={form.unitCost}
              onChange={(unitCost) => setForm((f) => ({ ...f, unitCost }))}
              placeholder="3800"
            />
          </FormField>
          <FormField label="Child (optional)">
            <PriceField
              value={form.childUnitCost}
              onChange={(childUnitCost) =>
                setForm((f) => ({ ...f, childUnitCost }))
              }
              placeholder="Optional"
            />
          </FormField>
          <FormField label="Infant (optional)">
            <PriceField
              value={form.infantUnitCost}
              onChange={(infantUnitCost) =>
                setForm((f) => ({ ...f, infantUnitCost }))
              }
              placeholder="Optional"
            />
          </FormField>
          <FormField label="Child age min">
            <Input
              type="number"
              min={0}
              max={17}
              value={form.childAgeMin}
              onChange={(e) =>
                setForm((f) => ({ ...f, childAgeMin: e.target.value }))
              }
              placeholder="0"
            />
          </FormField>
          <FormField label="Child age max">
            <Input
              type="number"
              min={0}
              max={17}
              value={form.childAgeMax}
              onChange={(e) =>
                setForm((f) => ({ ...f, childAgeMax: e.target.value }))
              }
              placeholder="17"
            />
          </FormField>
          <FormField label="Valid from">
            <DatePicker
              value={form.startDate ? parseDateInput(form.startDate) : undefined}
              onChange={(d) =>
                setForm((f) => ({ ...f, startDate: d ? formatDateInput(d) : '' }))
              }
            />
          </FormField>
          <FormField label="Valid until">
            <DatePicker
              value={form.endDate ? parseDateInput(form.endDate) : undefined}
              onChange={(d) =>
                setForm((f) => ({ ...f, endDate: d ? formatDateInput(d) : '' }))
              }
            />
          </FormField>
        </FormGrid>
      </RecordSheet>

      <RatesCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="transfer"
        lockedSupplierName={supplierName}
        onImported={() => void load()}
      />
    </div>
  );
}
