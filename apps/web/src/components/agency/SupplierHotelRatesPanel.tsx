import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, IndianRupee, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  SimpleFormField as FormField,
  SuggestionChips,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { PlaceSinglePicker } from '../places/PlacePicker';
import { RatesCsvImportDialog } from '../rates/RatesCsvImportDialog';
import { type PlaceRef } from '../../lib/placeRefs';

type HotelRate = {
  id: string;
  supplierId?: string | null;
  placeId?: string | null;
  isSystem?: boolean;
  roomType?: string | null;
  mealPlan?: string | null;
  unitCost: number | string;
  weekendUnitCost?: number | string | null;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  place?: { id: string; name: string; kind?: string } | null;
};

const MEAL_OPTIONS = [
  { value: 'EP', label: 'EP' },
  { value: 'CP', label: 'CP' },
  { value: 'MAP', label: 'MAP' },
  { value: 'AP', label: 'AP' },
];

function isoDate(raw?: string | Date | null): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  return raw.toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    roomType: '',
    mealPlan: '',
    unitCost: '',
    weekendUnitCost: '',
    place: null as PlaceRef | null,
    startDate: '',
    endDate: '',
  };
}

function seasonLabel(r: HotelRate): string {
  const from = isoDate(r.startDate);
  const to = isoDate(r.endDate);
  if (from && to) return `${from} → ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return 'Open dates';
}

export function SupplierHotelRatesPanel({
  supplierId,
  supplierName,
}: {
  supplierId: string;
  supplierName: string;
}) {
  const [rates, setRates] = useState<HotelRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: HotelRate[] }>(
        `/hotel-rates?supplierId=${encodeURIComponent(supplierId)}`,
      );
      setRates(res.items.filter((r) => !r.isSystem));
    } catch (e) {
      reportError(e, 'Could not load rate chart');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...rates].sort((a, b) => {
      const room = (a.roomType || '').localeCompare(b.roomType || '');
      if (room) return room;
      const meal = (a.mealPlan || '').localeCompare(b.mealPlan || '');
      if (meal) return meal;
      return isoDate(a.startDate).localeCompare(isoDate(b.startDate));
    });
  }, [rates]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(rate: HotelRate) {
    setEditingId(rate.id);
    setForm({
      roomType: rate.roomType || '',
      mealPlan: rate.mealPlan || '',
      unitCost: String(Number(rate.unitCost)),
      weekendUnitCost:
        rate.weekendUnitCost != null ? String(Number(rate.weekendUnitCost)) : '',
      place: rate.place
        ? { placeId: rate.place.id, name: rate.place.name, kind: rate.place.kind }
        : null,
      startDate: isoDate(rate.startDate),
      endDate: isoDate(rate.endDate),
    });
  }

  function duplicateAsSeason(rate: HotelRate) {
    setEditingId(null);
    setForm({
      roomType: rate.roomType || '',
      mealPlan: rate.mealPlan || '',
      unitCost: String(Number(rate.unitCost)),
      weekendUnitCost:
        rate.weekendUnitCost != null ? String(Number(rate.weekendUnitCost)) : '',
      place: rate.place
        ? { placeId: rate.place.id, name: rate.place.name, kind: rate.place.kind }
        : null,
      startDate: '',
      endDate: '',
    });
  }

  async function save() {
    const unitCost = Number(form.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toastError('Enter a valid cost per night');
      return;
    }
    const weekendRaw = form.weekendUnitCost.trim();
    let weekendUnitCost: number | null = null;
    if (weekendRaw) {
      weekendUnitCost = Number(weekendRaw);
      if (!Number.isFinite(weekendUnitCost) || weekendUnitCost < 0) {
        toastError('Weekend cost must be a valid number');
        return;
      }
    }
    setSaving(true);
    try {
      const body = {
        supplierId,
        placeId: form.place?.placeId || null,
        roomType: form.roomType.trim() || null,
        mealPlan: form.mealPlan.trim() || null,
        unitCost,
        weekendUnitCost,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (editingId) {
        await api(`/hotel-rates/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Rate updated');
      } else {
        await api('/hotel-rates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('Rate added');
      }
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save rate');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/hotel-rates/${id}`, { method: 'DELETE' });
      toastSuccess('Rate removed');
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete rate');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <IndianRupee className="size-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Rate chart</h2>
            <p className="text-xs text-muted-foreground">
              Seasonal room + meal rows for {supplierName}. Quote resolve picks the
              best window; weekend nights use weekend cost when set.
            </p>
          </div>
        </div>
        <Can anyOf={CAP.ratesWrite}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="size-4" />
            Import CSV
          </Button>
        </Can>
      </div>

      <Can anyOf={CAP.ratesWrite}>
        <Card>
          <CardContent className="space-y-3 pt-4">
            <FormGrid>
              <FormField label="Room type" description="Blank = default for all rooms.">
                <Input
                  value={form.roomType}
                  onChange={(e) => setForm({ ...form, roomType: e.target.value })}
                  placeholder="Deluxe / Suite / …"
                />
              </FormField>
              <FormField label="Meal plan">
                <SuggestionChips
                  aria-label="Meal plan"
                  allowDeselect
                  options={MEAL_OPTIONS}
                  value={form.mealPlan}
                  onChange={(mealPlan) => setForm({ ...form, mealPlan })}
                />
              </FormField>
            </FormGrid>
            <FormGrid>
              <FormField label="Weekday cost / night" required>
                <PriceField
                  value={form.unitCost}
                  onChange={(unitCost) => setForm({ ...form, unitCost })}
                  placeholder="4500"
                />
              </FormField>
              <FormField
                label="Weekend cost / night"
                description="Optional Sat/Sun. Blank = same as weekday."
              >
                <PriceField
                  value={form.weekendUnitCost}
                  onChange={(weekendUnitCost) =>
                    setForm({ ...form, weekendUnitCost })
                  }
                  placeholder="5200"
                />
              </FormField>
            </FormGrid>
            <PlaceSinglePicker
              label="Place (optional)"
              value={form.place}
              onChange={(place) => setForm({ ...form, place })}
            />
            <FormGrid>
              <FormField label="Season from">
                <DatePicker
                  value={parseDateInput(form.startDate)}
                  onChange={(d) =>
                    setForm({ ...form, startDate: formatDateInput(d) || '' })
                  }
                />
              </FormField>
              <FormField label="Season to">
                <DatePicker
                  value={parseDateInput(form.endDate)}
                  onChange={(d) =>
                    setForm({ ...form, endDate: formatDateInput(d) || '' })
                  }
                />
              </FormField>
            </FormGrid>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
                <Plus className="size-4" />
                {saving
                  ? 'Saving…'
                  : editingId
                    ? 'Save changes'
                    : 'Add season row'}
              </Button>
              {editingId ? (
                <Button type="button" size="sm" variant="ghost" onClick={startCreate}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </Can>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
            >
              <div>
                <div className="font-medium">
                  {r.roomType?.trim() || 'Default room'}
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {r.mealPlan?.trim() || 'Any meal'}
                  </span>
                  {r.place?.name ? (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {r.place.name}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {seasonLabel(r)} ·{' '}
                  {formatCurrency(Number(r.unitCost), {
                    currency: r.currency,
                    maximumFractionDigits: 0,
                  })}
                  /night
                  {r.weekendUnitCost != null
                    ? ` · weekend ${formatCurrency(Number(r.weekendUnitCost), {
                        currency: r.currency,
                        maximumFractionDigits: 0,
                      })}`
                    : ''}
                </div>
              </div>
              <Can anyOf={CAP.ratesWrite}>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Duplicate as new season"
                    title="Duplicate as new season"
                    onClick={() => duplicateAsSeason(r)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Edit rate"
                    onClick={() => startEdit(r)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                    aria-label="Delete rate"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Can>
            </li>
          ))}
          {!sorted.length ? (
            <li className="text-sm text-muted-foreground">
              No rates yet. Add seasonal rows (room + meal + date window) or import
              CSV.
            </li>
          ) : null}
        </ul>
      )}

      <RatesCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="hotel"
        lockedSupplierName={supplierName}
        onImported={() => void load()}
      />
    </div>
  );
}
