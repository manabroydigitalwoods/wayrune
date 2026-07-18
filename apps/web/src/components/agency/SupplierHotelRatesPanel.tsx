import { useCallback, useEffect, useState } from 'react';
import { IndianRupee, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  SimpleFormField as FormField,
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
  unitCost: number | string;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  place?: { id: string; name: string; kind?: string } | null;
};

function isoDate(raw?: string | Date | null): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  return raw.toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    roomType: '',
    unitCost: '',
    place: null as PlaceRef | null,
    startDate: '',
    endDate: '',
  };
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

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(rate: HotelRate) {
    setEditingId(rate.id);
    setForm({
      roomType: rate.roomType || '',
      unitCost: String(Number(rate.unitCost)),
      place: rate.place
        ? { placeId: rate.place.id, name: rate.place.name, kind: rate.place.kind }
        : null,
      startDate: isoDate(rate.startDate),
      endDate: isoDate(rate.endDate),
    });
  }

  async function save() {
    const unitCost = Number(form.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toastError('Enter a valid cost per night');
      return;
    }
    setSaving(true);
    try {
      const body = {
        supplierId,
        placeId: form.place?.placeId || null,
        roomType: form.roomType.trim() || null,
        unitCost,
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
              Negotiated room-night costs for {supplierName}. Used when quoting this
              supplier.
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
            <FormField label="Room type" description="Leave blank for a default rate.">
              <Input
                value={form.roomType}
                onChange={(e) => setForm({ ...form, roomType: e.target.value })}
                placeholder="Deluxe / Suite / …"
              />
            </FormField>
            <FormField label="Cost per night" required>
              <PriceField
                value={form.unitCost}
                onChange={(unitCost) => setForm({ ...form, unitCost })}
                placeholder="4500"
              />
            </FormField>
            <PlaceSinglePicker
              label="Place (optional)"
              value={form.place}
              onChange={(place) => setForm({ ...form, place })}
            />
            <FormGrid>
              <FormField label="From">
                <DatePicker
                  value={parseDateInput(form.startDate)}
                  onChange={(d) =>
                    setForm({ ...form, startDate: formatDateInput(d) || '' })
                  }
                />
              </FormField>
              <FormField label="To">
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
                    : 'Add rate'}
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
          {rates.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
            >
              <div>
                <div className="font-medium">
                  {r.roomType?.trim() || 'Default'}
                  {r.place?.name ? (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {r.place.name}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(Number(r.unitCost), {
                    currency: r.currency,
                    maximumFractionDigits: 0,
                  })}
                  /night
                  {r.startDate || r.endDate
                    ? ` · ${isoDate(r.startDate) || '…'} → ${isoDate(r.endDate) || '…'}`
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
          {!rates.length ? (
            <li className="text-sm text-muted-foreground">
              No rates yet. Add a room cost or import a CSV for this supplier.
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
