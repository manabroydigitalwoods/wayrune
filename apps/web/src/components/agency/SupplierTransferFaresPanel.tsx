import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, History, Pencil, Plus, Trash2, Upload } from 'lucide-react';
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
import { usePermissions } from '../../lib/permissions';
import {
  buildTransferFareTipDiffRows,
  formatRateVersionHistoryLine,
  formatRateVersionTipDiffCue,
  rateTipLooksPendingActivation,
  rateVersionLabel,
  showRateVersionTipDiffExpand,
  type RateVersionListItem,
} from '../../lib/rateVersion';

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
    /** Optional party bands (partySize + cost) — up to 6. */
    partyBandRows: [
      { partySize: '2', unitCost: '' },
      { partySize: '4', unitCost: '' },
      { partySize: '6', unitCost: '' },
      { partySize: '8', unitCost: '' },
      { partySize: '10', unitCost: '' },
      { partySize: '12', unitCost: '' },
    ],
    /** Optional seat matrix (seats + cost + add-ons) — up to 8. */
    seatMatrixRows: [
      { seats: '4', unitCost: '', childAddOn: '', infantAddOn: '' },
      { seats: '6', unitCost: '', childAddOn: '', infantAddOn: '' },
      { seats: '7', unitCost: '', childAddOn: '', infantAddOn: '' },
      { seats: '12', unitCost: '', childAddOn: '', infantAddOn: '' },
    ],
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [historyAnchorId, setHistoryAnchorId] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<RateVersionListItem[]>(
    [],
  );
  const [historyDiffOpenId, setHistoryDiffOpenId] = useState<string | null>(
    null,
  );
  const [versioningId, setVersioningId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const { hasAny } = usePermissions();
  const canActivateRates = hasAny(CAP.ratesApprove);

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
    return [...fares]
      .filter(
        (f) =>
          f.isActive !== false || rateTipLooksPendingActivation(f, fares),
      )
      .sort((a, b) => {
      const from = (a.fromPlace?.name || '').localeCompare(b.fromPlace?.name || '');
      if (from) return from;
      const to = (a.toPlace?.name || '').localeCompare(b.toPlace?.name || '');
      if (to) return to;
      return (a.vehicleType?.name || '').localeCompare(b.vehicleType?.name || '');
    });
  }, [fares]);

  async function createRateVersion(fare: TransferFare) {
    setVersioningId(fare.id);
    try {
      const created = await api<
        TransferFare & {
          pendingActivation?: boolean;
          versionMeta?: {
            versionNumber?: number;
            pendingActivation?: boolean;
          };
        }
      >(`/transfer-fares/${fare.id}/new-version`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const pending =
        created.pendingActivation === true ||
        created.versionMeta?.pendingActivation === true;
      toastSuccess(
        pending
          ? `Submitted ${rateVersionLabel(created.versionMeta?.versionNumber ?? created.versionNumber)} for activation — edit buy, then a manager Activates`
          : `Created ${rateVersionLabel(created.versionMeta?.versionNumber ?? created.versionNumber)} — edit costs then Save`,
      );
      await load();
      startEdit(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create fare version');
    } finally {
      setVersioningId(null);
    }
  }

  async function activateRateVersion(fareId: string) {
    setActivatingId(fareId);
    try {
      const updated = await api<TransferFare>(
        `/transfer-fares/${fareId}/activate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      toastSuccess(
        `Activated ${rateVersionLabel(updated.versionNumber)} — Match uses this tip`,
      );
      await load();
      if (historyOpen && historyAnchorId) {
        const res = await api<{ versions: RateVersionListItem[] }>(
          `/transfer-fares/${historyAnchorId}/versions`,
        );
        setHistoryVersions(res.versions || []);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not activate fare');
    } finally {
      setActivatingId(null);
    }
  }

  async function openRateHistory(fare: TransferFare) {
    setHistoryAnchorId(fare.id);
    setHistoryOpen(true);
    setHistoryDiffOpenId(null);
    setHistoryLoading(true);
    try {
      const res = await api<{ versions: RateVersionListItem[] }>(
        `/transfer-fares/${fare.id}/versions`,
      );
      setHistoryVersions(res.versions || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load fare history');
      setHistoryVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function restoreRateVersion(sourceVersionId: string) {
    if (!historyAnchorId) return;
    setHistorySaving(true);
    try {
      const created = await api<TransferFare & { pendingActivation?: boolean }>(
        `/transfer-fares/${historyAnchorId}/restore-version`,
        {
          method: 'POST',
          body: JSON.stringify({ sourceVersionId }),
        },
      );
      toastSuccess(
        created.pendingActivation
          ? `Restored as ${rateVersionLabel(created.versionNumber)} — pending activation`
          : `Restored as ${rateVersionLabel(created.versionNumber)}`,
      );
      setHistoryOpen(false);
      await load();
      startEdit(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not restore version');
    } finally {
      setHistorySaving(false);
    }
  }

  async function restoreRateField(
    sourceVersionId: string,
    field: NonNullable<
      ReturnType<typeof buildTransferFareTipDiffRows>[number]['restoreField']
    >,
  ) {
    if (!historyAnchorId || !field) return;
    setHistorySaving(true);
    try {
      const created = await api<TransferFare & { pendingActivation?: boolean }>(
        `/transfer-fares/${historyAnchorId}/restore-field`,
        {
          method: 'POST',
          body: JSON.stringify({ sourceVersionId, field }),
        },
      );
      toastSuccess(
        created.pendingActivation
          ? `Field restored as ${rateVersionLabel(created.versionNumber)} — pending activation`
          : `Field restored as ${rateVersionLabel(created.versionNumber)}`,
      );
      setHistoryOpen(false);
      await load();
      startEdit(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not restore field');
    } finally {
      setHistorySaving(false);
    }
  }

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
      partyBandRows: (() => {
        const blanks = [
          { partySize: '2', unitCost: '' },
          { partySize: '4', unitCost: '' },
          { partySize: '6', unitCost: '' },
          { partySize: '8', unitCost: '' },
          { partySize: '10', unitCost: '' },
          { partySize: '12', unitCost: '' },
        ];
        const raw = fare.pricingJson;
        const bands =
          raw &&
          typeof raw === 'object' &&
          Array.isArray((raw as { partyBands?: unknown }).partyBands)
            ? (
                (raw as { partyBands: Array<{ partySize?: unknown; unitCost?: unknown }> })
                  .partyBands
              )
            : [];
        return blanks.map((blank) => {
          const size = Number(blank.partySize);
          const b = bands.find(
            (row) =>
              row.partySize != null &&
              Number.isFinite(Number(row.partySize)) &&
              Math.floor(Number(row.partySize)) === size,
          );
          if (!b) return blank;
          return {
            partySize: blank.partySize,
            unitCost:
              b.unitCost != null && Number(b.unitCost) >= 0
                ? String(b.unitCost)
                : '',
          };
        });
      })(),
      seatMatrixRows: (() => {
        const blanks = [
          { seats: '4', unitCost: '', childAddOn: '', infantAddOn: '' },
          { seats: '6', unitCost: '', childAddOn: '', infantAddOn: '' },
          { seats: '7', unitCost: '', childAddOn: '', infantAddOn: '' },
          { seats: '12', unitCost: '', childAddOn: '', infantAddOn: '' },
        ];
        const raw = fare.pricingJson;
        const matrix =
          raw &&
          typeof raw === 'object' &&
          Array.isArray((raw as { seatMatrix?: unknown }).seatMatrix)
            ? (
                (raw as {
                  seatMatrix: Array<{
                    seats?: unknown;
                    unitCost?: unknown;
                    childAddOn?: unknown;
                    infantAddOn?: unknown;
                  }>;
                }).seatMatrix
              )
            : [];
        if (matrix.length === 0) return blanks;
        const fromChart = matrix
          .map((row) => {
            const seats = Number(row.seats);
            const unitCost = Number(row.unitCost);
            if (
              !Number.isFinite(seats) ||
              seats < 1 ||
              !Number.isFinite(unitCost) ||
              unitCost < 0
            ) {
              return null;
            }
            return {
              seats: String(Math.floor(seats)),
              unitCost: String(unitCost),
              childAddOn:
                row.childAddOn != null && Number(row.childAddOn) >= 0
                  ? String(row.childAddOn)
                  : '',
              infantAddOn:
                row.infantAddOn != null && Number(row.infantAddOn) >= 0
                  ? String(row.infantAddOn)
                  : '',
            };
          })
          .filter((r): r is NonNullable<typeof r> => r != null)
          .slice(0, 8);
        while (fromChart.length < 4) {
          fromChart.push({
            seats: '',
            unitCost: '',
            childAddOn: '',
            infantAddOn: '',
          });
        }
        return fromChart;
      })(),
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
        pricingJson: (() => {
          const partyBands: Array<{ partySize: number; unitCost: number }> = [];
          for (const row of form.partyBandRows) {
            if (!row.unitCost.trim()) continue;
            const partySize = Number(row.partySize);
            const unitCost = Number(row.unitCost);
            if (
              !Number.isFinite(partySize) ||
              partySize < 1 ||
              partySize > 12 ||
              !Number.isFinite(unitCost) ||
              unitCost < 0
            ) {
              toastError('Party bands must be 1–12 pax with a valid cost');
              return undefined;
            }
            partyBands.push({
              partySize: Math.floor(partySize),
              unitCost,
            });
          }
          const seatMatrix: Array<{
            seats: number;
            unitCost: number;
            childAddOn?: number;
            infantAddOn?: number;
          }> = [];
          for (const row of form.seatMatrixRows) {
            if (!row.unitCost.trim() && !row.seats.trim()) continue;
            if (!row.unitCost.trim() || !row.seats.trim()) {
              toastError('Seat matrix rows need both seats and cost');
              return undefined;
            }
            const seats = Number(row.seats);
            const unitCost = Number(row.unitCost);
            if (
              !Number.isFinite(seats) ||
              seats < 1 ||
              seats > 20 ||
              !Number.isFinite(unitCost) ||
              unitCost < 0
            ) {
              toastError('Seat matrix must be 1–20 seats with a valid cost');
              return undefined;
            }
            const entry: {
              seats: number;
              unitCost: number;
              childAddOn?: number;
              infantAddOn?: number;
            } = {
              seats: Math.floor(seats),
              unitCost,
            };
            if (row.childAddOn.trim()) {
              const childAddOn = Number(row.childAddOn);
              if (!Number.isFinite(childAddOn) || childAddOn < 0) {
                toastError('Seat matrix child add-on must be a valid cost');
                return undefined;
              }
              entry.childAddOn = childAddOn;
            }
            if (row.infantAddOn.trim()) {
              const infantAddOn = Number(row.infantAddOn);
              if (!Number.isFinite(infantAddOn) || infantAddOn < 0) {
                toastError('Seat matrix infant add-on must be a valid cost');
                return undefined;
              }
              entry.infantAddOn = infantAddOn;
            }
            seatMatrix.push(entry);
          }
          if (seatMatrix.length > 8) {
            toastError('Seat matrix allows at most 8 rows');
            return undefined;
          }
          if (!partyBands.length && !seatMatrix.length) return null;
          return {
            ...(partyBands.length ? { partyBands } : {}),
            ...(seatMatrix.length ? { seatMatrix } : {}),
          };
        })(),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (body.pricingJson === undefined) return;
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
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span>
                      {fare.fromPlace?.name || '—'} → {fare.toPlace?.name || '—'}
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {rateVersionLabel(fare.versionNumber)}
                    </span>
                    {rateTipLooksPendingActivation(fare, fares) ? (
                      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
                        Pending
                      </span>
                    ) : null}
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
                <div className="flex items-center gap-0.5">
                  {rateTipLooksPendingActivation(fare, fares) &&
                  canActivateRates ? (
                    <Can anyOf={CAP.ratesApprove}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={activatingId === fare.id}
                        onClick={() => void activateRateVersion(fare.id)}
                      >
                        Activate
                      </Button>
                    </Can>
                  ) : null}
                  <Can anyOf={CAP.ratesWrite}>
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="New fare version"
                      title="New version (keeps history)"
                      disabled={
                        versioningId === fare.id ||
                        rateTipLooksPendingActivation(fare, fares)
                      }
                      onClick={() => void createRateVersion(fare)}
                    >
                      <GitBranch className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Fare version history"
                      title="Version history"
                      onClick={() => void openRateHistory(fare)}
                    >
                      <History className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => startEdit(fare)}
                      aria-label="Edit fare"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive"
                      onClick={() => void remove(fare)}
                      aria-label="Remove fare"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  </Can>
                </div>
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
          {form.pricingMode === 'per_vehicle' ? (
            <FormField
              label="Seat matrix (optional)"
              description="Up to 8 capacity tiers — Match prefers these over party bands (closest seats ≥ party)."
            >
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Seats</span>
                  <span>Unit cost</span>
                  <span>Child add-on</span>
                  <span>Infant add-on</span>
                </div>
                {form.seatMatrixRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-2">
                    <Input
                      inputMode="numeric"
                      value={row.seats}
                      onChange={(e) => {
                        const next = [...form.seatMatrixRows];
                        next[idx] = { ...row, seats: e.target.value };
                        setForm((f) => ({ ...f, seatMatrixRows: next }));
                      }}
                      placeholder="Seats"
                    />
                    <PriceField
                      value={row.unitCost}
                      onChange={(unitCost) => {
                        const next = [...form.seatMatrixRows];
                        next[idx] = { ...row, unitCost };
                        setForm((f) => ({ ...f, seatMatrixRows: next }));
                      }}
                      placeholder="Cost"
                    />
                    <PriceField
                      value={row.childAddOn}
                      onChange={(childAddOn) => {
                        const next = [...form.seatMatrixRows];
                        next[idx] = { ...row, childAddOn };
                        setForm((f) => ({ ...f, seatMatrixRows: next }));
                      }}
                      placeholder="Optional"
                    />
                    <PriceField
                      value={row.infantAddOn}
                      onChange={(infantAddOn) => {
                        const next = [...form.seatMatrixRows];
                        next[idx] = { ...row, infantAddOn };
                        setForm((f) => ({ ...f, seatMatrixRows: next }));
                      }}
                      placeholder="Optional"
                    />
                  </div>
                ))}
                {form.seatMatrixRows.length < 8 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        seatMatrixRows: [
                          ...f.seatMatrixRows,
                          {
                            seats: '',
                            unitCost: '',
                            childAddOn: '',
                            infantAddOn: '',
                          },
                        ],
                      }))
                    }
                  >
                    Add seat row
                  </Button>
                ) : null}
              </div>
            </FormField>
          ) : null}
          {form.pricingMode === 'per_vehicle' ? (
            <FormField
              label="Party bands (optional)"
              description="Up to 6 sizes — used when seat matrix is empty. Match picks the highest band ≤ party (adults+children)."
            >
              <div className="space-y-2">
                {form.partyBandRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2">
                    <Input
                      inputMode="numeric"
                      value={row.partySize}
                      onChange={(e) => {
                        const next = [...form.partyBandRows];
                        next[idx] = { ...row, partySize: e.target.value };
                        setForm((f) => ({ ...f, partyBandRows: next }));
                      }}
                      placeholder="Party size"
                    />
                    <PriceField
                      value={row.unitCost}
                      onChange={(unitCost) => {
                        const next = [...form.partyBandRows];
                        next[idx] = { ...row, unitCost };
                        setForm((f) => ({ ...f, partyBandRows: next }));
                      }}
                      placeholder="Cost"
                    />
                  </div>
                ))}
              </div>
            </FormField>
          ) : null}
          <FormField
            label="Child (optional)"
            description={
              form.pricingMode === 'per_vehicle'
                ? 'When set, Match adds child × this cost on top of the cab/band.'
                : undefined
            }
          >
            <PriceField
              value={form.childUnitCost}
              onChange={(childUnitCost) =>
                setForm((f) => ({ ...f, childUnitCost }))
              }
              placeholder="Optional"
            />
          </FormField>
          <FormField
            label="Infant (optional)"
            description={
              form.pricingMode === 'per_vehicle'
                ? 'When set, Match adds infant × this cost on top of the cab/band.'
                : undefined
            }
          >
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

      <RecordSheet
        open={historyOpen}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryOpen(false);
            setHistoryAnchorId(null);
            setHistoryVersions([]);
            setHistoryDiffOpenId(null);
          } else setHistoryOpen(true);
        }}
        title="Fare version history"
        description="Superseded tips stay on file. Restore copies content into a new tip. Tips without rates.approve stay pending until a manager Activates."
        submitting={historySaving || activatingId != null}
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setHistoryOpen(false);
              setHistoryAnchorId(null);
              setHistoryDiffOpenId(null);
            }}
          >
            Close
          </Button>
        }
      >
        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : historyVersions.length ? (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
            {(() => {
              const activeTip =
                historyVersions.find((row) => row.isActive) ?? null;
              const hasPending = historyVersions.some(
                (row) => row.pendingActivation,
              );
              const moneyFmt = (n: number) =>
                formatCurrency(n, { maximumFractionDigits: 0 });
              return [...historyVersions].reverse().map((v) => {
                const cue = formatRateVersionTipDiffCue(v.diffVsActive);
                const canDiff = showRateVersionTipDiffExpand(v);
                const diffOpen = historyDiffOpenId === v.id;
                const diffRows =
                  diffOpen && canDiff
                    ? buildTransferFareTipDiffRows(
                        v,
                        activeTip,
                        v.diffVsActive?.changes,
                        { formatAmount: moneyFmt },
                      )
                    : [];
                return (
                  <li key={v.id} className="space-y-2 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatRateVersionHistoryLine(v, {
                          kind: 'transfer',
                          formatAmount: moneyFmt,
                        })}
                        {cue ? (
                          <span className="mt-0.5 block text-[11px] text-amber-800 dark:text-amber-200">
                            Diff vs current · {cue}
                          </span>
                        ) : null}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {canDiff ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setHistoryDiffOpenId(diffOpen ? null : v.id)
                            }
                          >
                            {diffOpen ? 'Hide' : 'Diff'}
                          </Button>
                        ) : null}
                        {v.pendingActivation ? (
                          <Can anyOf={CAP.ratesApprove}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={activatingId === v.id}
                              onClick={() => void activateRateVersion(v.id)}
                            >
                              Activate
                            </Button>
                          </Can>
                        ) : null}
                        {v.pendingActivation && !canActivateRates ? (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                            Pending
                          </span>
                        ) : null}
                        <Can anyOf={CAP.ratesWrite}>
                          {!v.isActive && !v.pendingActivation ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={historySaving || hasPending}
                              title={
                                hasPending
                                  ? 'Activate the pending tip before restore'
                                  : undefined
                              }
                              onClick={() => void restoreRateVersion(v.id)}
                            >
                              Restore as new tip
                            </Button>
                          ) : v.isActive ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                              Current
                            </span>
                          ) : null}
                        </Can>
                      </div>
                    </div>
                    {diffOpen && diffRows.length ? (
                      <div className="overflow-x-auto rounded-lg border border-border/50 bg-background/60">
                        <table className="w-full min-w-[280px] text-left text-[11px]">
                          <thead>
                            <tr className="border-b border-border/40 text-muted-foreground">
                              <th className="px-2 py-1.5 font-medium">Field</th>
                              <th className="px-2 py-1.5 font-medium">This tip</th>
                              <th className="px-2 py-1.5 font-medium">Current</th>
                              <th className="px-2 py-1.5 font-medium" />
                            </tr>
                          </thead>
                          <tbody>
                            {diffRows.map((row) => (
                              <tr
                                key={row.field}
                                className="border-b border-border/30 last:border-0"
                              >
                                <td className="px-2 py-1.5 text-muted-foreground">
                                  {row.field}
                                </td>
                                <td className="px-2 py-1.5 text-foreground">
                                  {row.thisTip}
                                </td>
                                <td className="px-2 py-1.5 text-foreground">
                                  {row.current}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  {row.restoreField ? (
                                    <Can anyOf={CAP.ratesWrite}>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-[11px]"
                                        disabled={historySaving || hasPending}
                                        title={
                                          hasPending
                                            ? 'Activate the pending tip before restore'
                                            : 'Create a new tip with this field from the prior version'
                                        }
                                        onClick={() =>
                                          void restoreRateField(
                                            v.id,
                                            row.restoreField!,
                                          )
                                        }
                                      >
                                        Restore
                                      </Button>
                                    </Can>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </li>
                );
              });
            })()}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No versions yet.</p>
        )}
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
