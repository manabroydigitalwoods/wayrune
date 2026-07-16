import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  FormGrid,
  Input,
  PriceField,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
  formatCurrency,
} from '@travel/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type Doc = {
  id: string;
  docType: string;
  status: string;
  label: string;
  amount?: number | string | null;
  currency: string;
  linkedEntityType?: string | null;
};

export function CommercialDocumentsPanel() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [docType, setDocType] = useState('invoice');
  const [direction, setDirection] = useState('receivable');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [tripId, setTripId] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<Doc[]>('/commerce/commercial-documents');
      setRows(data);
    } catch (e) {
      reportError(e, 'Could not load documents');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!label.trim() || !amount) return;
    try {
      const created = await api<{ id: string }>('/commerce/commercial-documents', {
        method: 'POST',
        body: JSON.stringify({
          docType,
          direction,
          label: label.trim(),
          amount: Number(amount),
          currency: 'INR',
          tripId: tripId.trim() || undefined,
          linkedEntityType: tripId.trim() ? 'trip' : undefined,
          linkedEntityId: tripId.trim() || undefined,
          lines: [
            {
              description: label.trim(),
              quantity: 1,
              unitAmount: Number(amount),
            },
          ],
        }),
      });
      await api('/commerce/payments', {
        method: 'POST',
        body: JSON.stringify({
          commercialDocumentId: created.id,
          direction: direction === 'receivable' ? 'inbound' : 'outbound',
          amount: Number(amount),
          method: 'manual',
          tripId: tripId.trim() || undefined,
        }),
      });
      toastSuccess('Invoice and payment recorded');
      setAmount('');
      setLabel('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create document');
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <h3 className="text-sm font-semibold">Invoices & payments</h3>
          <p className="text-xs text-muted-foreground">
            Reusable money documents linked to trips or other entities.
          </p>
        </div>
        <FormGrid>
          <FormField label="Type">
            <SuggestionChips
              aria-label="Document type"
              allowDeselect={false}
              options={[
                { value: 'invoice', label: 'Invoice' },
                { value: 'credit_note', label: 'Credit note' },
                { value: 'receipt', label: 'Receipt' },
              ]}
              value={docType}
              onChange={setDocType}
            />
          </FormField>
          <FormField label="Direction">
            <SuggestionChips
              aria-label="Direction"
              allowDeselect={false}
              options={[
                { value: 'receivable', label: 'Receivable' },
                { value: 'payable', label: 'Payable' },
              ]}
              value={direction}
              onChange={setDirection}
            />
          </FormField>
          <FormField label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Guest deposit…" />
          </FormField>
          <FormField label="Trip ID (optional)">
            <Input value={tripId} onChange={(e) => setTripId(e.target.value)} placeholder="cuid…" />
          </FormField>
          <FormField label="Amount">
            <PriceField value={amount} onChange={setAmount} />
          </FormField>
        </FormGrid>
        <Button type="button" size="sm" onClick={() => void create()}>
          Create & record payment
        </Button>
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm glass-row"
              >
                <span>
                  {d.label} · {d.docType}
                  {d.amount != null
                    ? ` · ${formatCurrency(d.amount, { maximumFractionDigits: 0 })}`
                    : ''}
                </span>
                <StatusBadge value={d.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No commercial documents yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
