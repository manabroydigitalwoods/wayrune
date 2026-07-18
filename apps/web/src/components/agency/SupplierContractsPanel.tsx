import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  DatePicker,
  FormGrid,
  Input,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type BlackoutRange = { from: string; to: string };

type SupplierContract = {
  id: string;
  title: string;
  status: string;
  paymentTerms?: string | null;
  preferred?: boolean;
  blackoutJson?: BlackoutRange[] | null;
  supplier?: { id: string; name: string } | null;
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
];

function parseIsoDay(iso?: string | null): string | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function toDate(iso?: string | null): Date | undefined {
  const day = parseIsoDay(iso);
  if (!day) return undefined;
  return new Date(`${day}T12:00:00`);
}

function fromDate(d?: Date): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
        <p className="text-xs font-medium text-muted-foreground">
          Rate blackouts (inclusive dates — blocks quote rate match)
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => onChange([...value, { from: '', to: '' }])}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
      {!value.length ? (
        <p className="text-xs text-muted-foreground">No blackout windows.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((row, i) => (
            <li key={`${row.from}-${row.to}-${i}`} className="flex flex-wrap items-end gap-2">
              <FormField label="From" className="min-w-[9rem] flex-1">
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
              <FormField label="To" className="min-w-[9rem] flex-1">
                <DatePicker
                  value={toDate(row.to)}
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

export function SupplierContractsPanel({
  supplierId,
  supplierName,
}: {
  supplierId: string;
  supplierName?: string;
}) {
  const [contracts, setContracts] = useState<SupplierContract[]>([]);
  const [title, setTitle] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [preferred, setPreferred] = useState(false);
  const [status, setStatus] = useState('draft');
  const [blackouts, setBlackouts] = useState<BlackoutRange[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBlackouts, setEditBlackouts] = useState<BlackoutRange[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await api<SupplierContract[]>(
        `/commerce/supplier-contracts?supplierId=${supplierId}`,
      );
      setContracts(
        rows.map((c) => ({
          ...c,
          blackoutJson: normalizeBlackouts(c.blackoutJson),
        })),
      );
    } catch (e) {
      reportError(e, 'Could not load contracts');
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function save() {
    if (!title.trim()) {
      toastError('Enter a contract title');
      return;
    }
    const ranges = validBlackouts(blackouts);
    if (!ranges) return;
    try {
      await api('/commerce/supplier-contracts', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          title: title.trim(),
          status,
          paymentTerms: paymentTerms.trim() || null,
          preferred,
          blackoutJson: ranges,
        }),
      });
      toastSuccess('Contract saved');
      setTitle('');
      setPaymentTerms('');
      setPreferred(false);
      setStatus('draft');
      setBlackouts([]);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save contract');
    }
  }

  function startEdit(c: SupplierContract) {
    setEditingId(c.id);
    setEditBlackouts(normalizeBlackouts(c.blackoutJson));
  }

  async function saveEdit(contractId: string) {
    const ranges = validBlackouts(editBlackouts);
    if (!ranges) return;
    setSavingEdit(true);
    try {
      await api(`/commerce/supplier-contracts/${contractId}`, {
        method: 'PATCH',
        body: JSON.stringify({ blackoutJson: ranges }),
      });
      toastSuccess('Blackouts updated');
      setEditingId(null);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update blackouts');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Supplier contracts</h2>
          <p className="text-xs text-muted-foreground">
            {supplierName
              ? `Agreements with ${supplierName}. Active blackouts block quote rate matching.`
              : 'Agreements, payment terms, and rate blackouts.'}
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <FormField label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Annual rate agreement"
            />
          </FormField>
          <FormGrid>
            <FormField label="Payment terms">
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Net 30"
              />
            </FormField>
            <FormField label="Status">
              <SuggestionChips
                aria-label="Contract status"
                allowDeselect={false}
                options={STATUS_OPTIONS}
                value={status}
                onChange={setStatus}
              />
            </FormField>
          </FormGrid>
          <div className="flex items-center gap-2">
            <Checkbox
              id="supplier-preferred"
              checked={preferred}
              onCheckedChange={(checked) => setPreferred(checked === true)}
            />
            <label htmlFor="supplier-preferred" className="cursor-pointer text-sm">
              Preferred supplier
            </label>
          </div>
          <BlackoutEditor value={blackouts} onChange={setBlackouts} />
          <Button type="button" size="sm" onClick={() => void save()}>
            <Plus className="size-4" />
            Add contract
          </Button>
        </CardContent>
      </Card>
      <ul className="space-y-2">
        {contracts.map((c) => {
          const ranges = normalizeBlackouts(c.blackoutJson);
          const isEditing = editingId === c.id;
          return (
            <li
              key={c.id}
              className="space-y-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.paymentTerms || 'No payment terms set'}
                    {c.preferred ? ' · preferred' : ''}
                    {ranges.length
                      ? ` · ${ranges.length} blackout${ranges.length === 1 ? '' : 's'}`
                      : ' · no blackouts'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={c.status} showIcon={false} />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => (isEditing ? setEditingId(null) : startEdit(c))}
                  >
                    {isEditing ? 'Cancel' : 'Blackouts'}
                  </Button>
                </div>
              </div>
              {!isEditing && ranges.length ? (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {ranges.map((r) => (
                    <li key={`${c.id}-${r.from}-${r.to}`}>
                      {r.from} → {r.to}
                    </li>
                  ))}
                </ul>
              ) : null}
              {isEditing ? (
                <div className="space-y-2 border-t border-border/50 pt-2">
                  <BlackoutEditor value={editBlackouts} onChange={setEditBlackouts} />
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingEdit}
                    onClick={() => void saveEdit(c.id)}
                  >
                    {savingEdit ? 'Saving…' : 'Save blackouts'}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
        {!contracts.length ? (
          <li className="text-sm text-muted-foreground">No contracts yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
