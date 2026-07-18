import { useEffect, useState } from 'react';
import { Button, Input, toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../../../api';

type Rule = {
  id: string;
  name: string;
  trigger: string;
  channel?: string | null;
  isActive: boolean;
  actionJson: Record<string, unknown>;
};

/** Minimal omnichannel automation admin (Phase G). */
export function EngagementAutomationPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState('Auto-assign WhatsApp');
  const [assignUserId, setAssignUserId] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    api<Rule[]>('/interactions/automation-rules')
      .then(setRules)
      .catch(() => setRules([]));
  }

  useEffect(() => {
    reload();
  }, []);

  async function createRule() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api('/interactions/automation-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          trigger: 'interaction.ingested',
          channel: 'whatsapp',
          actionJson: assignUserId.trim()
            ? { assignUserId: assignUserId.trim(), setStatus: 'waiting' }
            : { setStatus: 'waiting' },
        }),
      });
      toastSuccess('Automation rule created');
      setName('');
      reload();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create rule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-4">
      <div>
        <h3 className="text-sm font-semibold">Omnichannel automation</h3>
        <p className="text-xs text-muted-foreground">
          Rules run after Interactions land on a Conversation (assign, status, tags).
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {rules.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <span>
              {r.name} · {r.trigger}
              {r.channel ? ` · ${r.channel}` : ''}
            </span>
            <span className="text-xs text-muted-foreground">{r.isActive ? 'Active' : 'Off'}</span>
          </li>
        ))}
        {!rules.length ? (
          <li className="text-xs text-muted-foreground">No rules yet.</li>
        ) : null}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-[10rem] flex-1"
          placeholder="Rule name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          className="min-w-[10rem] flex-1"
          placeholder="Assign user id (optional)"
          value={assignUserId}
          onChange={(e) => setAssignUserId(e.target.value)}
        />
        <Button type="button" disabled={saving} onClick={() => void createRule()}>
          Add WhatsApp rule
        </Button>
      </div>
    </div>
  );
}
