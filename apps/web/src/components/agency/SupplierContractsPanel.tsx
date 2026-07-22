import { useCallback, useEffect, useState } from 'react';
import { Copy, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  NumberField,
  QuickPicks,
  RecordSheet,
  SimpleFormField as FormField,
  Skeleton,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import {
  api,
  cloneSupplierContractVersion,
  type AssetRoomProductRow,
  type ContractStopSaleRange,
  type SupplierContractRow,
} from '../../api';
import { reportError } from '../../lib/errors';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';

type BlackoutRange = { from: string; to: string };

type CancelTierRow = {
  beforeDays: string;
  chargePercent: string;
};

type SupplierContract = SupplierContractRow;

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
];

const TITLE_PRESETS = [
  { value: 'Annual rate agreement', label: 'Annual rate' },
  { value: 'Seasonal buy agreement', label: 'Seasonal' },
  { value: 'Preferred partner terms', label: 'Preferred partner' },
];

const PAYMENT_PRESETS = [
  { value: 'Net 15', label: 'Net 15' },
  { value: 'Net 30', label: 'Net 30' },
  { value: 'Net 45', label: 'Net 45' },
  { value: 'Pay on confirm', label: 'On confirm' },
];

const DEFAULT_CANCEL_TIERS: CancelTierRow[] = [
  { beforeDays: '7', chargePercent: '0' },
  { beforeDays: '3', chargePercent: '50' },
  { beforeDays: '1', chargePercent: '100' },
];

function emptyForm() {
  return {
    title: '',
    paymentTerms: 'Net 30',
    preferred: false,
    status: 'draft',
    blackouts: [] as BlackoutRange[],
    stopSales: [] as ContractStopSaleRange[],
    cancelText: '',
    cancelTiers: DEFAULT_CANCEL_TIERS.map((r) => ({ ...r })),
    noShowPercent: '100',
  };
}

function cancelTiersFromContract(c: SupplierContract): {
  cancelText: string;
  cancelTiers: CancelTierRow[];
  noShowPercent: string;
} {
  const p = c.cancellationPolicyJson;
  if (!p || typeof p !== 'object') {
    return {
      cancelText: c.cancellationTerms?.trim() || '',
      cancelTiers: DEFAULT_CANCEL_TIERS.map((r) => ({ ...r })),
      noShowPercent: '100',
    };
  }
  const rules = Array.isArray(p.rules) ? p.rules : [];
  const tiers: CancelTierRow[] = rules.slice(0, 3).map((r) => ({
    beforeDays: String(
      r.beforeHours >= 24 ? Math.round(r.beforeHours / 24) : r.beforeHours,
    ),
    chargePercent: String(r.chargeValue),
  }));
  while (tiers.length < 3) {
    tiers.push({ beforeDays: '', chargePercent: '' });
  }
  return {
    cancelText:
      (typeof p.text === 'string' && p.text.trim()) ||
      c.cancellationTerms?.trim() ||
      '',
    cancelTiers: tiers,
    noShowPercent:
      p.noShowChargePercentage != null
        ? String(p.noShowChargePercentage)
        : '100',
  };
}

function cancelHint(c: SupplierContract): string | null {
  const p = c.cancellationPolicyJson;
  if (!p || typeof p !== 'object') {
    return c.cancellationTerms?.trim()
      ? 'Cancel terms (text)'
      : null;
  }
  const rules = Array.isArray(p.rules) ? p.rules.length : 0;
  if (rules > 0) return `${rules} cancel tier${rules === 1 ? '' : 's'}`;
  if (typeof p.text === 'string' && p.text.trim()) return 'Cancel terms';
  return null;
}

function parseIsoDay(iso?: string | null): string | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function toDate(iso?: string | null): Date | undefined {
  const day = parseIsoDay(iso);
  if (!day) return undefined;
  return parseDateInput(day) ?? undefined;
}

function fromDate(d?: Date): string {
  if (!d) return '';
  return formatDateInput(d);
}

function formatDay(iso: string): string {
  const d = parseDateInput(iso.slice(0, 10));
  if (!d) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function normalizeBlackouts(raw: unknown): BlackoutRange[] {
  if (!Array.isArray(raw)) return [];
  const out: BlackoutRange[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const from = parseIsoDay(
      typeof r.from === 'string'
        ? r.from
        : typeof r.start === 'string'
          ? r.start
          : null,
    );
    const to = parseIsoDay(
      typeof r.to === 'string' ? r.to : typeof r.end === 'string' ? r.end : null,
    );
    if (from && to && from <= to) out.push({ from, to });
  }
  return out;
}

function normalizeStopSales(raw: unknown): ContractStopSaleRange[] {
  if (!Array.isArray(raw)) return [];
  const out: ContractStopSaleRange[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const from = parseIsoDay(
      typeof r.from === 'string'
        ? r.from
        : typeof r.start === 'string'
          ? r.start
          : null,
    );
    const to = parseIsoDay(
      typeof r.to === 'string' ? r.to : typeof r.end === 'string' ? r.end : null,
    );
    const roomProductId =
      typeof r.roomProductId === 'string' && r.roomProductId.trim()
        ? r.roomProductId.trim()
        : null;
    if (from && to && from <= to) out.push({ from, to, roomProductId });
  }
  return out;
}

function BlackoutEditor({
  value,
  onChange,
}: {
  value: BlackoutRange[];
  onChange: (next: BlackoutRange[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">Rate blackouts</p>
          <p className="text-[11px] text-muted-foreground">
            Contracted rates do not apply during these dates. Manual or on-request
            pricing remains allowed.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => onChange([...value, { from: '', to: '' }])}
        >
          <Plus className="size-3.5" />
          Add window
        </Button>
      </div>
      {!value.length ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
          No blackout windows. Add one when contracted rates should not apply for a period.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((row, i) => (
            <li
              key={`bo-${i}`}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-border/50 px-2.5 py-2"
            >
              <FormField label="From" className="mb-0 min-w-[9rem] flex-1">
                <DatePicker
                  value={toDate(row.from)}
                  onChange={(d) => {
                    const next = [...value];
                    next[i] = { ...next[i], from: fromDate(d) };
                    onChange(next);
                  }}
                  placeholder="Start"
                />
              </FormField>
              <FormField label="To" className="mb-0 min-w-[9rem] flex-1">
                <DatePicker
                  value={toDate(row.to)}
                  minDate={toDate(row.from)}
                  onChange={(d) => {
                    const next = [...value];
                    next[i] = { ...next[i], to: fromDate(d) };
                    onChange(next);
                  }}
                  placeholder="End"
                />
              </FormField>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="mb-0.5 size-8 text-muted-foreground"
                aria-label="Remove blackout"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StopSaleEditor({
  value,
  onChange,
  roomProducts,
}: {
  value: ContractStopSaleRange[];
  onChange: (next: ContractStopSaleRange[]) => void;
  roomProducts: AssetRoomProductRow[];
}) {
  const scopeOptions = [
    { value: '', label: 'Property-wide' },
    ...roomProducts.map((r) => ({ value: r.id, label: r.name })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">Stop-sale windows</p>
          <p className="text-[11px] text-muted-foreground">
            The selected room or property is unavailable. Quoting and booking are
            blocked. Scope to a room product or leave property-wide.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => onChange([...value, { from: '', to: '', roomProductId: null }])}
        >
          <Plus className="size-3.5" />
          Add window
        </Button>
      </div>
      {!value.length ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
          No stop-sale windows. Add one when inventory is closed for booking.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((row, i) => (
            <li
              key={`ss-${i}`}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-border/50 px-2.5 py-2"
            >
              <FormField label="From" className="mb-0 min-w-[9rem] flex-1">
                <DatePicker
                  value={toDate(row.from)}
                  onChange={(d) => {
                    const next = [...value];
                    next[i] = { ...next[i], from: fromDate(d) };
                    onChange(next);
                  }}
                  placeholder="Start"
                />
              </FormField>
              <FormField label="To" className="mb-0 min-w-[9rem] flex-1">
                <DatePicker
                  value={toDate(row.to)}
                  minDate={toDate(row.from)}
                  onChange={(d) => {
                    const next = [...value];
                    next[i] = { ...next[i], to: fromDate(d) };
                    onChange(next);
                  }}
                  placeholder="End"
                />
              </FormField>
              {roomProducts.length ? (
                <FormField label="Scope" className="mb-0 min-w-[10rem] flex-1">
                  <Combobox
                    value={row.roomProductId || ''}
                    onChange={(roomProductId) => {
                      const next = [...value];
                      next[i] = {
                        ...next[i],
                        roomProductId: roomProductId || null,
                      };
                      onChange(next);
                    }}
                    options={scopeOptions}
                    placeholder="Property-wide"
                  />
                </FormField>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="mb-0.5 size-8 text-muted-foreground"
                aria-label="Remove stop-sale"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SupplierContractsPanel({
  supplierId,
  supplierName,
  linkedAssetId,
}: {
  supplierId: string;
  supplierName?: string;
  linkedAssetId?: string | null;
}) {
  const [contracts, setContracts] = useState<SupplierContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [roomProducts, setRoomProducts] = useState<AssetRoomProductRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api<SupplierContract[]>(
        `/commerce/supplier-contracts?supplierId=${supplierId}`,
      );
      setContracts(
        rows.map((c) => ({
          ...c,
          blackoutJson: normalizeBlackouts(c.blackoutJson),
          stopSaleJson: normalizeStopSales(c.stopSaleJson),
        })),
      );
    } catch (e) {
      reportError(e, 'Could not load contracts');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (!linkedAssetId) {
      setRoomProducts([]);
      return;
    }
    let cancelled = false;
    void api<AssetRoomProductRow[]>(`/inventory/assets/${linkedAssetId}/rooms`)
      .then((rows) => {
        if (!cancelled) setRoomProducts(rows);
      })
      .catch(() => {
        if (!cancelled) setRoomProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedAssetId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(c: SupplierContract) {
    setEditingId(c.id);
    setForm({
      title: c.title || '',
      paymentTerms: c.paymentTerms || '',
      preferred: Boolean(c.preferred),
      status: c.status === 'active' ? 'active' : 'draft',
      blackouts: normalizeBlackouts(c.blackoutJson),
      stopSales: normalizeStopSales(c.stopSaleJson),
      ...cancelTiersFromContract(c),
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function onSheetOpenChange(open: boolean) {
    if (!open) closeForm();
    else setFormOpen(true);
  }

  function validBlackouts(rows: BlackoutRange[]): BlackoutRange[] | null {
    const cleaned: BlackoutRange[] = [];
    for (const row of rows) {
      const from = parseIsoDay(row.from);
      const to = parseIsoDay(row.to);
      if (!from && !to) continue;
      if (!from || !to) {
        toastError('Each blackout needs both From and To dates');
        return null;
      }
      if (from > to) {
        toastError('Blackout From must be on or before To');
        return null;
      }
      cleaned.push({ from, to });
    }
    return cleaned;
  }

  function validStopSales(rows: ContractStopSaleRange[]): ContractStopSaleRange[] | null {
    const cleaned: ContractStopSaleRange[] = [];
    for (const row of rows) {
      const from = parseIsoDay(row.from);
      const to = parseIsoDay(row.to);
      if (!from && !to) continue;
      if (!from || !to) {
        toastError('Each stop-sale needs both From and To dates');
        return null;
      }
      if (from > to) {
        toastError('Stop-sale From must be on or before To');
        return null;
      }
      cleaned.push({
        from,
        to,
        roomProductId: row.roomProductId?.trim() || null,
      });
    }
    return cleaned;
  }

  async function newVersion(c: SupplierContract) {
    setCloningId(c.id);
    try {
      const cloned = await cloneSupplierContractVersion(c.id, { copyRates: true });
      toastSuccess(`Draft v${cloned.versionNumber ?? ''} created`);
      await load();
      openEdit({
        ...cloned,
        blackoutJson: normalizeBlackouts(cloned.blackoutJson),
        stopSaleJson: normalizeStopSales(cloned.stopSaleJson),
      });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create new version');
    } finally {
      setCloningId(null);
    }
  }

  async function save() {
    if (!form.title.trim()) {
      toastError('Enter a contract title');
      return;
    }
    const ranges = validBlackouts(form.blackouts);
    if (!ranges) return;
    const stopSales = validStopSales(form.stopSales);
    if (!stopSales) return;

    const rules: Array<{
      beforeHours: number;
      chargeType: 'PERCENTAGE';
      chargeValue: number;
    }> = [];
    for (const tier of form.cancelTiers) {
      const daysRaw = tier.beforeDays.trim();
      const pctRaw = tier.chargePercent.trim();
      if (!daysRaw && !pctRaw) continue;
      const days = Number(daysRaw);
      const pct = Number(pctRaw);
      if (!Number.isFinite(days) || days <= 0 || days > 365) {
        toastError('Cancel tiers need days between 1 and 365');
        return;
      }
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toastError('Cancel charge % must be between 0 and 100');
        return;
      }
      rules.push({
        beforeHours: Math.round(days * 24),
        chargeType: 'PERCENTAGE',
        chargeValue: pct,
      });
    }
    const noShowRaw = form.noShowPercent.trim();
    let noShowChargePercentage: number | undefined;
    if (noShowRaw) {
      const n = Number(noShowRaw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toastError('No-show % must be between 0 and 100');
        return;
      }
      noShowChargePercentage = n;
    }
    const cancelText = form.cancelText.trim();
    const cancellationPolicyJson =
      rules.length || noShowChargePercentage != null || cancelText
        ? {
            ...(rules.length ? { rules } : {}),
            ...(noShowChargePercentage != null
              ? { noShowChargePercentage }
              : {}),
            ...(cancelText ? { text: cancelText.slice(0, 500) } : {}),
          }
        : null;

    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        status: form.status,
        paymentTerms: form.paymentTerms.trim() || null,
        preferred: form.preferred,
        blackoutJson: ranges,
        stopSaleJson: stopSales,
        cancellationTerms: cancelText || null,
        cancellationPolicyJson,
      };
      if (editingId) {
        await api(`/commerce/supplier-contracts/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Contract updated');
      } else {
        await api('/commerce/supplier-contracts', {
          method: 'POST',
          body: JSON.stringify({
            supplierId,
            ...body,
          }),
        });
        toastSuccess('Contract added');
      }
      closeForm();
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save contract');
    } finally {
      setSaving(false);
    }
  }

  const titleChip = TITLE_PRESETS.some((o) => o.value === form.title)
    ? form.title
    : '';
  const paymentChip = PAYMENT_PRESETS.some((o) => o.value === form.paymentTerms)
    ? form.paymentTerms
    : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Supplier contracts</h2>
            <p className="text-xs text-muted-foreground">
              {supplierName
                ? `Agreements with ${supplierName}. Blackouts allow manual rates; stop-sale blocks quoting.`
                : 'Agreements, payment terms, blackouts, and stop-sales.'}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          Add contract
        </Button>
      </div>

      {loading ? (
        <div role="status" aria-busy="true" className="space-y-2 py-1">
          <span className="sr-only">Loading</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-5/6" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : contracts.length ? (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
          {contracts.map((c) => {
            const ranges = normalizeBlackouts(c.blackoutJson);
            const stops = normalizeStopSales(c.stopSaleJson);
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{c.title}</span>
                    {c.versionNumber ? (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                        v{c.versionNumber}
                      </span>
                    ) : null}
                    <StatusBadge value={c.status} showIcon={false} />
                    {c.preferred ? (
                      <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Preferred
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.paymentTerms?.trim() || 'No payment terms'}
                    {ranges.length
                      ? ` · ${ranges.length} blackout${ranges.length === 1 ? '' : 's'}`
                      : ' · no blackouts'}
                    {stops.length
                      ? ` · ${stops.length} stop-sale${stops.length === 1 ? '' : 's'}`
                      : ''}
                    {cancelHint(c) ? ` · ${cancelHint(c)}` : ''}
                  </p>
                  {ranges.length ? (
                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                      {ranges.map((r) => (
                        <li key={`${c.id}-bo-${r.from}-${r.to}`}>
                          Blackout: {formatDay(r.from)} → {formatDay(r.to)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {stops.length ? (
                    <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      {stops.map((r) => {
                        const room = r.roomProductId
                          ? roomProducts.find((p) => p.id === r.roomProductId)?.name
                          : null;
                        return (
                          <li key={`${c.id}-ss-${r.from}-${r.to}-${r.roomProductId || 'all'}`}>
                            Stop-sale: {formatDay(r.from)} → {formatDay(r.to)}
                            {room ? ` · ${room}` : r.roomProductId ? '' : ' · property-wide'}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {c.status === 'active' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={cloningId === c.id}
                      onClick={() => void newVersion(c)}
                    >
                      <Copy className="size-3.5" />
                      {cloningId === c.id ? 'Cloning…' : 'New version'}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={c.status === 'superseded'}
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No contracts yet. Add an agreement to track payment terms and rate
            blackouts for quotes.
          </p>
          <Button type="button" size="sm" className="mt-3" onClick={openCreate}>
            <Plus className="size-4" />
            Add first contract
          </Button>
        </div>
      )}

      <RecordSheet
        open={formOpen}
        onOpenChange={onSheetOpenChange}
        title={editingId ? 'Edit contract' : 'Add contract'}
        description="Commercial terms for this supplier. Rate blackouts block contracted matching only; stop-sale blocks quoting and booking."
        submitLabel={editingId ? 'Save changes' : 'Save contract'}
        submitting={saving}
        onSubmit={() => void save()}
        size="wide"
      >
        <div className="space-y-4">
          <FormField label="Title" required>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Annual rate agreement"
              autoFocus={!editingId}
            />
            <QuickPicks>
              <SuggestionChips
                aria-label="Title presets"
                allowDeselect
                options={TITLE_PRESETS}
                value={titleChip}
                onChange={(title) => setForm((f) => ({ ...f, title }))}
              />
            </QuickPicks>
          </FormField>

          <FormGrid>
            <FormField label="Payment terms">
              <Input
                value={form.paymentTerms}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentTerms: e.target.value }))
                }
                placeholder="Net 30"
              />
              <QuickPicks>
                <SuggestionChips
                  aria-label="Payment terms"
                  allowDeselect
                  options={PAYMENT_PRESETS}
                  value={paymentChip}
                  onChange={(paymentTerms) =>
                    setForm((f) => ({ ...f, paymentTerms }))
                  }
                />
              </QuickPicks>
            </FormField>
            <FormField
              label="Status"
              description="Only Active contracts apply preferred/blackout rules in quoting."
            >
              <SuggestionChips
                aria-label="Contract status"
                allowDeselect={false}
                options={STATUS_OPTIONS}
                value={form.status}
                onChange={(status) => setForm((f) => ({ ...f, status }))}
              />
            </FormField>
          </FormGrid>

          <FormField
            label="Cancellation (optional)"
            description="Tiers shown on Match rate. Days before check-in → charge %. Guest-facing text is stamped on the quote line."
          >
            <div className="space-y-2">
              {form.cancelTiers.map((tier, idx) => (
                <FormGrid key={idx}>
                  <FormField label={idx === 0 ? 'Within (days)' : ' '}>
                    <NumberField
                      min={1}
                      max={365}
                      value={tier.beforeDays}
                      onChange={(beforeDays) => {
                        const next = [...form.cancelTiers];
                        next[idx] = { ...tier, beforeDays };
                        setForm((f) => ({ ...f, cancelTiers: next }));
                      }}
                      placeholder={idx === 0 ? '7' : idx === 1 ? '3' : '1'}
                    />
                  </FormField>
                  <FormField label={idx === 0 ? 'Charge %' : ' '}>
                    <NumberField
                      integer={false}
                      min={0}
                      max={100}
                      value={tier.chargePercent}
                      onChange={(chargePercent) => {
                        const next = [...form.cancelTiers];
                        next[idx] = { ...tier, chargePercent };
                        setForm((f) => ({ ...f, cancelTiers: next }));
                      }}
                      placeholder={idx === 0 ? '0' : idx === 1 ? '50' : '100'}
                    />
                  </FormField>
                </FormGrid>
              ))}
              <FormGrid>
                <FormField label="No-show %">
                  <NumberField
                    integer={false}
                    min={0}
                    max={100}
                    value={form.noShowPercent}
                    onChange={(noShowPercent) =>
                      setForm((f) => ({ ...f, noShowPercent }))
                    }
                    placeholder="100"
                  />
                </FormField>
              </FormGrid>
              <FormField label="Guest-facing text">
                <Input
                  value={form.cancelText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cancelText: e.target.value }))
                  }
                  placeholder="Free cancel up to 7 days before check-in…"
                />
              </FormField>
            </div>
          </FormField>

          <div className="flex items-center gap-2">
            <Checkbox
              id="supplier-preferred"
              checked={form.preferred}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, preferred: checked === true }))
              }
            />
            <label htmlFor="supplier-preferred" className="cursor-pointer text-sm">
              Preferred on this contract
            </label>
            <p className="w-full text-[11px] text-muted-foreground">
              Supplier header shows Preferred when any active contract has this set.
            </p>
          </div>

          <BlackoutEditor
            value={form.blackouts}
            onChange={(blackouts) => setForm((f) => ({ ...f, blackouts }))}
          />

          <StopSaleEditor
            value={form.stopSales}
            onChange={(stopSales) => setForm((f) => ({ ...f, stopSales }))}
            roomProducts={roomProducts}
          />

          {form.title.trim() ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{form.title.trim()}</span>
              {' · '}
              {form.status}
              {form.paymentTerms.trim() ? ` · ${form.paymentTerms.trim()}` : ''}
              {form.preferred ? ' · preferred' : ''}
              {form.blackouts.length
                ? ` · ${form.blackouts.length} blackout${form.blackouts.length === 1 ? '' : 's'}`
                : ''}
              {form.stopSales.length
                ? ` · ${form.stopSales.length} stop-sale${form.stopSales.length === 1 ? '' : 's'}`
                : ''}
            </div>
          ) : null}
        </div>
      </RecordSheet>
    </div>
  );
}
