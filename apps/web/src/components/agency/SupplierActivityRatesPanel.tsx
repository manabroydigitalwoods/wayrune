import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, History, Import, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api, type SupplierActivityRateRow } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { PlaceSinglePicker } from '../places/PlacePicker';
import { RatesCsvImportDialog } from '../rates/RatesCsvImportDialog';
import { type PlaceRef } from '../../lib/placeRefs';
import {
  formatRateVersionHistoryLine,
  formatRateVersionTipDiffCue,
  rateVersionLabel,
  type RateVersionListItem,
} from '../../lib/rateVersion';

type ActivityRate = SupplierActivityRateRow;

const PRIVATE_SIC_OPTIONS = [
  { value: '', label: 'Either (open)' },
  { value: 'private', label: 'Private' },
  { value: 'sic', label: 'SIC' },
];

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

function seasonLabel(r: ActivityRate): string {
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

function emptyForm() {
  return {
    activityName: '',
    privateOrSic: '' as '' | 'private' | 'sic',
    adultUnitCost: '',
    childUnitCost: '',
    childAgeMin: '0',
    childAgeMax: '11',
    place: null as PlaceRef | null,
    startDate: '',
    endDate: '',
  };
}

export function SupplierActivityRatesPanel({
  supplierId,
  supplierName,
  defaultPlace,
}: {
  supplierId: string;
  supplierName: string;
  defaultPlace?: PlaceRef | null;
}) {
  const [rates, setRates] = useState<ActivityRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [historyAnchorId, setHistoryAnchorId] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<RateVersionListItem[]>(
    [],
  );
  const [versioningId, setVersioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: ActivityRate[] }>(
        `/activity-rates?supplierId=${encodeURIComponent(supplierId)}`,
      );
      setRates(res.items);
    } catch (e) {
      reportError(e, 'Could not load activity rates');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...rates]
      .filter((r) => r.isActive !== false)
      .sort((a, b) => {
      const name = a.activityName.localeCompare(b.activityName);
      if (name) return name;
      const mode = (a.privateOrSic || '').localeCompare(b.privateOrSic || '');
      if (mode) return mode;
      return isoDate(a.startDate).localeCompare(isoDate(b.startDate));
    });
  }, [rates]);

  async function createRateVersion(rate: ActivityRate) {
    setVersioningId(rate.id);
    try {
      const created = await api<
        ActivityRate & { versionMeta?: { versionNumber?: number } }
      >(`/activity-rates/${rate.id}/new-version`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toastSuccess(
        `Created ${rateVersionLabel(created.versionMeta?.versionNumber ?? created.versionNumber)} — edit costs then Save`,
      );
      await load();
      startEdit(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create rate version');
    } finally {
      setVersioningId(null);
    }
  }

  async function openRateHistory(rate: ActivityRate) {
    setHistoryAnchorId(rate.id);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await api<{ versions: RateVersionListItem[] }>(
        `/activity-rates/${rate.id}/versions`,
      );
      setHistoryVersions(res.versions || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load rate history');
      setHistoryVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function restoreRateVersion(sourceVersionId: string) {
    if (!historyAnchorId) return;
    setHistorySaving(true);
    try {
      const created = await api<ActivityRate>(
        `/activity-rates/${historyAnchorId}/restore-version`,
        {
          method: 'POST',
          body: JSON.stringify({ sourceVersionId }),
        },
      );
      toastSuccess(`Restored as ${rateVersionLabel(created.versionNumber)}`);
      setHistoryOpen(false);
      await load();
      startEdit(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not restore version');
    } finally {
      setHistorySaving(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      place: defaultPlace || null,
    });
    setFormOpen(true);
  }

  function startEdit(rate: ActivityRate) {
    setEditingId(rate.id);
    setForm({
      activityName: rate.activityName,
      privateOrSic: (rate.privateOrSic as 'private' | 'sic' | null) || '',
      adultUnitCost: String(money(rate.adultUnitCost) ?? ''),
      childUnitCost:
        money(rate.childUnitCost) != null ? String(money(rate.childUnitCost)) : '',
      childAgeMin: rate.childAgeMin != null ? String(rate.childAgeMin) : '0',
      childAgeMax: rate.childAgeMax != null ? String(rate.childAgeMax) : '11',
      place: rate.place
        ? { placeId: rate.place.id, name: rate.place.name, kind: rate.place.kind }
        : null,
      startDate: isoDate(rate.startDate),
      endDate: isoDate(rate.endDate),
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  const canSave = useMemo(() => {
    if (!form.activityName.trim()) return false;
    const adult = Number(form.adultUnitCost);
    if (!Number.isFinite(adult) || adult < 0) return false;
    if (form.startDate && form.endDate && form.startDate > form.endDate) return false;
    if (form.childUnitCost.trim()) {
      const child = Number(form.childUnitCost);
      if (!Number.isFinite(child) || child < 0) return false;
    }
    const ageMin = Number(form.childAgeMin);
    const ageMax = Number(form.childAgeMax);
    if (
      form.childAgeMin.trim() &&
      (!Number.isFinite(ageMin) || ageMin < 0 || ageMin > 17)
    ) {
      return false;
    }
    if (
      form.childAgeMax.trim() &&
      (!Number.isFinite(ageMax) || ageMax < 0 || ageMax > 17)
    ) {
      return false;
    }
    if (
      form.childAgeMin.trim() &&
      form.childAgeMax.trim() &&
      Number.isFinite(ageMin) &&
      Number.isFinite(ageMax) &&
      ageMin > ageMax
    ) {
      return false;
    }
    return true;
  }, [form]);

  async function save() {
    if (!canSave) return;
    const adultUnitCost = Number(form.adultUnitCost);
    const childRaw = form.childUnitCost.trim();
    const childUnitCost = childRaw === '' ? null : Number(childRaw);
    const childAgeMin = form.childAgeMin.trim() ? Number(form.childAgeMin) : null;
    const childAgeMax = form.childAgeMax.trim() ? Number(form.childAgeMax) : null;
    setSaving(true);
    try {
      const body = {
        supplierId,
        placeId: form.place?.placeId || null,
        activityName: form.activityName.trim(),
        privateOrSic: form.privateOrSic || null,
        adultUnitCost,
        childUnitCost,
        childAgeMin,
        childAgeMax,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (editingId) {
        await api(`/activity-rates/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Activity rate updated');
      } else {
        await api('/activity-rates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('Activity rate added');
      }
      closeForm();
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save activity rate');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/activity-rates/${id}`, { method: 'DELETE' });
      toastSuccess('Activity rate removed');
      if (editingId === id) closeForm();
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete activity rate');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Activity rate chart</h2>
          <p className="text-xs text-muted-foreground">
            Per-person buy rates for {supplierName}. Quote Match rate uses these cards.
            Contract blackouts on this supplier soft-block matched rates.
          </p>
        </div>
        <Can anyOf={CAP.ratesWrite}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="cursor-pointer gap-1.5"
              onClick={() => setImportOpen(true)}
            >
              <Import className="size-3.5" />
              Import
            </Button>
            <Button type="button" size="sm" className="cursor-pointer gap-1.5" onClick={openCreate}>
              <Plus className="size-3.5" />
              Add rate
            </Button>
          </div>
        </Can>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading rates…</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          No activity rates yet. Add a named card (e.g. Tiger Hill sunrise) with adult and optional
          child buy rates, or import a CSV/XLSX sheet.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          {sorted.map((rate) => {
            const adult = money(rate.adultUnitCost);
            const child = money(rate.childUnitCost);
            const ageHint =
              rate.childAgeMin != null || rate.childAgeMax != null
                ? ` ages ${rate.childAgeMin ?? 0}–${rate.childAgeMax ?? 17}`
                : '';
            return (
              <li
                key={rate.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
                    <span className="truncate">{rate.activityName}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {rateVersionLabel(rate.versionNumber)}
                    </span>
                    {rate.privateOrSic ? (
                      <span className="text-xs font-normal uppercase text-muted-foreground">
                        {rate.privateOrSic}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {adult != null ? formatCurrency(adult) : '—'} / adult
                    {child != null
                      ? ` · ${formatCurrency(child)} / child${ageHint}`
                      : ''}
                    {' · '}
                    {seasonLabel(rate)}
                    {rate.place?.name ? ` · ${rate.place.name}` : ''}
                  </p>
                </div>
                <Can anyOf={CAP.ratesWrite}>
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 cursor-pointer"
                      aria-label="New rate version"
                      title="New version (keeps history)"
                      disabled={versioningId === rate.id}
                      onClick={() => void createRateVersion(rate)}
                    >
                      <GitBranch className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 cursor-pointer"
                      aria-label="Rate version history"
                      title="Version history"
                      onClick={() => void openRateHistory(rate)}
                    >
                      <History className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 cursor-pointer"
                      aria-label="Edit rate"
                      onClick={() => startEdit(rate)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 cursor-pointer text-destructive"
                      aria-label="Delete rate"
                      onClick={() => void remove(rate.id)}
                    >
                      <Trash2 className="size-3.5" />
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
        title={editingId ? 'Edit activity rate' : 'Add activity rate'}
        description="Adult buy is required. Child buy uses ages between min and max (inclusive)."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="cursor-pointer" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={!canSave || saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add rate'}
            </Button>
          </div>
        }
      >
        <FormGrid>
          <FormField label="Activity name" className="sm:col-span-2">
            <Input
              value={form.activityName}
              placeholder="e.g. Tiger Hill sunrise"
              onChange={(e) => setForm((f) => ({ ...f, activityName: e.target.value }))}
            />
          </FormField>
          <FormField label="Private / SIC">
            <Combobox
              value={form.privateOrSic}
              options={PRIVATE_SIC_OPTIONS}
              onChange={(value) =>
                setForm((f) => ({
                  ...f,
                  privateOrSic: (value as '' | 'private' | 'sic') || '',
                }))
              }
            />
          </FormField>
          <FormField label="Adult buy / person">
            <PriceField
              currency="INR"
              value={form.adultUnitCost}
              onChange={(adultUnitCost) => setForm((f) => ({ ...f, adultUnitCost }))}
            />
          </FormField>
          <FormField label="Child buy / person" description="Optional">
            <PriceField
              currency="INR"
              value={form.childUnitCost}
              onChange={(childUnitCost) => setForm((f) => ({ ...f, childUnitCost }))}
            />
          </FormField>
          <FormField label="Child age min">
            <Input
              type="number"
              min={0}
              max={17}
              value={form.childAgeMin}
              onChange={(e) => setForm((f) => ({ ...f, childAgeMin: e.target.value }))}
            />
          </FormField>
          <FormField label="Child age max">
            <Input
              type="number"
              min={0}
              max={17}
              value={form.childAgeMax}
              onChange={(e) => setForm((f) => ({ ...f, childAgeMax: e.target.value }))}
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
          <FormField label="Valid to">
            <DatePicker
              value={form.endDate ? parseDateInput(form.endDate) : undefined}
              onChange={(d) =>
                setForm((f) => ({ ...f, endDate: d ? formatDateInput(d) : '' }))
              }
            />
          </FormField>
        </FormGrid>
        <PlaceSinglePicker
          label="Near place (optional)"
          value={form.place}
          onChange={(place) => setForm((f) => ({ ...f, place }))}
        />
      </RecordSheet>

      <RecordSheet
        open={historyOpen}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryOpen(false);
            setHistoryAnchorId(null);
            setHistoryVersions([]);
          } else setHistoryOpen(true);
        }}
        title="Activity rate version history"
        description="Superseded tips stay on file. Restore copies content into a new active tip."
        submitting={historySaving}
        footer={
          <Button
            type="button"
            variant="secondary"
            className="cursor-pointer"
            onClick={() => {
              setHistoryOpen(false);
              setHistoryAnchorId(null);
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
            {[...historyVersions].reverse().map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span className="text-xs text-muted-foreground">
                  {formatRateVersionHistoryLine(v, {
                    kind: 'activity',
                    formatAmount: (n) =>
                      formatCurrency(n, { maximumFractionDigits: 0 }),
                  })}
                  {formatRateVersionTipDiffCue(v.diffVsActive) ? (
                    <span className="mt-0.5 block text-[11px] text-amber-800 dark:text-amber-200">
                      Diff vs current ·{' '}
                      {formatRateVersionTipDiffCue(v.diffVsActive)}
                    </span>
                  ) : null}
                </span>
                <Can anyOf={CAP.ratesWrite}>
                  {!v.isActive ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="cursor-pointer"
                      disabled={historySaving}
                      onClick={() => void restoreRateVersion(v.id)}
                    >
                      Restore as new tip
                    </Button>
                  ) : (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      Current
                    </span>
                  )}
                </Can>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No versions yet.</p>
        )}
      </RecordSheet>

      <RatesCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="activity"
        lockedSupplierName={supplierName}
        onImported={() => void load()}
      />
    </div>
  );
}
