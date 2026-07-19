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

type TriggerKind =
  | 'interaction.ingested'
  | 'conversation.waiting'
  | 'conversation.unread_sla';

/** Minimal omnichannel automation admin (Phase G). */
export function EngagementAutomationPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState('Aging unread → waiting');
  const [trigger, setTrigger] = useState<TriggerKind>('conversation.unread_sla');
  const [assignUserId, setAssignUserId] = useState('');
  const [tag, setTag] = useState('SLA');
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
      const actionJson: Record<string, unknown> = {};
      if (assignUserId.trim()) actionJson.assignUserId = assignUserId.trim();
      if (tag.trim()) actionJson.tag = tag.trim();
      if (trigger === 'conversation.unread_sla') {
        actionJson.setStatus = 'waiting';
      } else if (trigger === 'interaction.ingested') {
        actionJson.setStatus = 'waiting';
      }
      await api('/interactions/automation-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          trigger,
          channel: trigger === 'interaction.ingested' ? 'whatsapp' : null,
          actionJson,
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
          Rules run on ingest, when a thread is set to waiting, or when unread
          ages past the org inbox aging hours (dashboard / aging inbox / worker).
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {rules.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <span>
              {r.name} · {r.trigger}
              {r.channel ? ` · ${r.channel}` : ''}
            </span>
            <span className="text-xs text-muted-foreground">
              {r.isActive ? 'Active' : 'Off'}
            </span>
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
        <select
          className="h-9 min-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as TriggerKind)}
          aria-label="Trigger"
        >
          <option value="conversation.unread_sla">Unread aging (SLA)</option>
          <option value="interaction.ingested">Interaction ingested</option>
          <option value="conversation.waiting">Set to waiting</option>
        </select>
        <Input
          className="min-w-[8rem] flex-1"
          placeholder="Tag (optional)"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <Input
          className="min-w-[10rem] flex-1"
          placeholder="Assign user id (optional)"
          value={assignUserId}
          onChange={(e) => setAssignUserId(e.target.value)}
        />
        <Button type="button" disabled={saving} onClick={() => void createRule()}>
          Add rule
        </Button>
      </div>
    </div>
  );
}
