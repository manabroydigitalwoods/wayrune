import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  FormGrid,
  Input,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type SupplierContract = {
  id: string;
  title: string;
  status: string;
  paymentTerms?: string | null;
  preferred?: boolean;
  supplier?: { id: string; name: string } | null;
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
];

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

  const load = useCallback(async () => {
    try {
      const rows = await api<SupplierContract[]>(
        `/commerce/supplier-contracts?supplierId=${supplierId}`,
      );
      setContracts(rows);
    } catch (e) {
      reportError(e, 'Could not load contracts');
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!title.trim()) {
      toastError('Enter a contract title');
      return;
    }
    try {
      await api('/commerce/supplier-contracts', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          title: title.trim(),
          status,
          paymentTerms: paymentTerms.trim() || null,
          preferred,
        }),
      });
      toastSuccess('Contract saved');
      setTitle('');
      setPaymentTerms('');
      setPreferred(false);
      setStatus('draft');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save contract');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Supplier contracts</h2>
          <p className="text-xs text-muted-foreground">
            {supplierName ? `Agreements with ${supplierName}.` : 'Agreements and payment terms.'}
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
          <Button type="button" size="sm" onClick={() => void save()}>
            <Plus className="size-4" />
            Add contract
          </Button>
        </CardContent>
      </Card>
      <ul className="space-y-2">
        {contracts.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
          >
            <div>
              <div className="font-medium">{c.title}</div>
              <div className="text-xs text-muted-foreground">
                {c.paymentTerms || 'No payment terms set'}
                {c.preferred ? ' · preferred' : ''}
              </div>
            </div>
            <StatusBadge value={c.status} showIcon={false} />
          </li>
        ))}
        {!contracts.length ? (
          <li className="text-sm text-muted-foreground">No contracts yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
