import { useCallback, useEffect, useState } from 'react';
import { Plus, ScrollText } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  Textarea,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';

type Policy = {
  id: string;
  name: string;
  policyType: string;
  textBody?: string | null;
  isDefault?: boolean;
};

const POLICY_TYPES = [
  { value: 'cancellation', label: 'Cancellation' },
  { value: 'check_in_out', label: 'Check-in / out' },
  { value: 'meal', label: 'Meal' },
];

export function PoliciesPanel() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [name, setName] = useState('');
  const [policyType, setPolicyType] = useState('cancellation');
  const [textBody, setTextBody] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await api<Policy[]>('/commerce/policies');
      setPolicies(rows);
    } catch (e) {
      reportError(e, 'Could not load policies');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!name.trim()) {
      toastError('Enter a policy name');
      return;
    }
    try {
      await api('/commerce/policies', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          policyType,
          textBody: textBody.trim() || null,
        }),
      });
      toastSuccess('Policy saved');
      setName('');
      setTextBody('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save policy');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="size-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Policies</h2>
          <p className="text-xs text-muted-foreground">
            Cancellation, check-in/out, and meal policies visible to guests.
          </p>
        </div>
      </div>
      <Can anyOf={CAP.policyManage}>
        <Card>
          <CardContent className="space-y-3 pt-4">
            <FormField label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Standard cancellation policy"
              />
            </FormField>
            <FormField label="Type">
              <SuggestionChips
                aria-label="Policy type"
                allowDeselect={false}
                options={POLICY_TYPES}
                value={policyType}
                onChange={setPolicyType}
              />
            </FormField>
            <FormField label="Policy text">
              <Textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                placeholder="Describe the policy in plain language for guests"
                rows={3}
              />
            </FormField>
            <Button type="button" size="sm" onClick={() => void save()}>
              <Plus className="size-4" />
              Add policy
            </Button>
          </CardContent>
        </Card>
      </Can>
      <ul className="space-y-2">
        {policies.map((p) => (
          <li key={p.id} className="rounded-xl border px-3 py-2.5 text-sm glass-row">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{p.name}</span>
              <StatusBadge
                value={p.policyType}
                label={POLICY_TYPES.find((t) => t.value === p.policyType)?.label || p.policyType}
                showIcon={false}
              />
            </div>
            {p.textBody ? (
              <p className="mt-1 text-xs text-muted-foreground">{p.textBody}</p>
            ) : null}
          </li>
        ))}
        {!policies.length ? (
          <li className="text-sm text-muted-foreground">No policies yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
