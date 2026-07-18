import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import {
  Button,
  Combobox,
  DatePicker,
  EmailInput,
  Input,
  PhoneInput,
  StatusBadge,
  cn,
  toastError,
  toastSuccess,
  formatDate,
  formatDateTime,
} from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';

type LeadAbout = {
  id: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  owner?: { fullName?: string | null } | null;
  source?: { name?: string | null } | null;
  campaign?: { id?: string; name?: string | null } | null;
  party?: { displayName?: string | null } | null;
  followUpAt?: string | null;
  createdAt?: string | null;
  priority?: string;
};

type LeadAboutPanelProps = {
  lead: LeadAbout;
  onUpdated: () => Promise<void> | void;
  className?: string;
  showHeader?: boolean;
};

type EditableKey = 'contactName' | 'email' | 'phone' | 'priority' | 'followUpAt' | 'campaignId';

function FieldShell({
  label,
  children,
  editing,
  onStartEdit,
  editable,
}: {
  label: string;
  children: React.ReactNode;
  editing?: boolean;
  onStartEdit?: () => void;
  editable?: boolean;
}) {
  return (
    <div className="group/field space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {editable && !editing && onStartEdit ? (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/field:opacity-100 focus-visible:opacity-100"
            onClick={onStartEdit}
            aria-label={`Edit ${label}`}
          >
            <Pencil className="size-3" />
          </button>
        ) : null}
      </div>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  );
}

export function LeadAboutPanel({
  lead,
  onUpdated,
  className,
  showHeader = true,
}: LeadAboutPanelProps) {
  const [editing, setEditing] = useState<EditableKey | null>(null);
  const [draft, setDraft] = useState('');
  const [followUpDraft, setFollowUpDraft] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [campaignOptions, setCampaignOptions] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.leadWrite);

  useEffect(() => {
    setEditing(null);
  }, [lead.id, lead.contactName, lead.email, lead.phone, lead.priority, lead.followUpAt, lead.campaign?.id]);

  useEffect(() => {
    api<Array<{ id: string; name: string }>>('/campaigns')
      .then((rows) =>
        setCampaignOptions([
          { value: '', label: 'None' },
          ...rows.map((c) => ({ value: c.id, label: c.name })),
        ]),
      )
      .catch(() => setCampaignOptions([{ value: '', label: 'None' }]));
  }, []);

  function startEdit(key: EditableKey) {
    if (!canWrite) return;
    setEditing(key);
    if (key === 'followUpAt') {
      setFollowUpDraft(lead.followUpAt ? new Date(lead.followUpAt) : undefined);
    } else if (key === 'priority') {
      setDraft(lead.priority || 'normal');
    } else if (key === 'campaignId') {
      setDraft(lead.campaign?.id || '');
    } else {
      setDraft((lead[key] as string) || '');
    }
  }

  function cancel() {
    setEditing(null);
  }

  async function save(key: EditableKey) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (key === 'followUpAt') {
        body.followUpAt = followUpDraft?.toISOString() ?? null;
      } else if (key === 'priority') {
        body.priority = draft || 'normal';
      } else if (key === 'campaignId') {
        body.campaignId = draft.trim() || null;
      } else if (key === 'email' || key === 'phone' || key === 'contactName') {
        // Send only this field — never include other contact fields
        const value = draft.trim();
        body[key] = value === '' ? null : value;
      }
      await api(`/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toastSuccess('Updated');
      setEditing(null);
      await onUpdated();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update');
    } finally {
      setSaving(false);
    }
  }

  const displayValue = (value?: string | null) =>
    value ? <span className="font-medium">{value}</span> : <span className="text-muted-foreground">—</span>;

  return (
    <aside className={className}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold tracking-tight">About this lead</h2>
          {canWrite ? (
            <span className="text-[11px] text-muted-foreground">Click a field to edit</span>
          ) : null}
        </div>
      ) : canWrite ? (
        <p className="mb-1 text-[11px] text-muted-foreground">Click a field to edit</p>
      ) : null}

      <div className={cn(showHeader ? 'mt-4' : 'mt-2', 'space-y-3.5')}>
        <FieldShell
          label="Contact"
          editable={canWrite}
          editing={editing === 'contactName'}
          onStartEdit={() => startEdit('contactName')}
        >
          {editing === 'contactName' ? (
            <InlineEditor
              saving={saving}
              onCancel={cancel}
              onSave={() => void save('contactName')}
            >
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save('contactName');
                  if (e.key === 'Escape') cancel();
                }}
                placeholder="Full name"
              />
            </InlineEditor>
          ) : (
            <button
              type="button"
              className="w-full rounded-md px-1 py-0.5 text-left hover:bg-accent/50"
              onClick={() => startEdit('contactName')}
            >
              {displayValue(lead.contactName)}
            </button>
          )}
        </FieldShell>

        <FieldShell
          label="Email"
          editable={canWrite}
          editing={editing === 'email'}
          onStartEdit={() => startEdit('email')}
        >
          {editing === 'email' ? (
            <InlineEditor saving={saving} onCancel={cancel} onSave={() => void save('email')}>
              <EmailInput
                value={draft}
                onChange={setDraft}
                placeholder="name@…"
              />
            </InlineEditor>
          ) : (
            <button
              type="button"
              className="w-full rounded-md px-1 py-0.5 text-left hover:bg-accent/50"
              onClick={() => startEdit('email')}
            >
              {lead.email ? (
                <span className="font-medium text-primary">{lead.email}</span>
              ) : (
                displayValue(null)
              )}
            </button>
          )}
        </FieldShell>

        <FieldShell
          label="Phone"
          editable={canWrite}
          editing={editing === 'phone'}
          onStartEdit={() => startEdit('phone')}
        >
          {editing === 'phone' ? (
            <InlineEditor saving={saving} onCancel={cancel} onSave={() => void save('phone')}>
              <PhoneInput value={draft} onChange={setDraft} />
            </InlineEditor>
          ) : (
            <button
              type="button"
              className="w-full rounded-md px-1 py-0.5 text-left hover:bg-accent/50"
              onClick={() => startEdit('phone')}
            >
              {displayValue(lead.phone)}
            </button>
          )}
        </FieldShell>

        <FieldShell label="Owner">{displayValue(lead.owner?.fullName)}</FieldShell>
        <FieldShell label="Source">{displayValue(lead.source?.name)}</FieldShell>
        <FieldShell
          label="Campaign"
          editable={canWrite}
          editing={editing === 'campaignId'}
          onStartEdit={() => startEdit('campaignId')}
        >
          {editing === 'campaignId' ? (
            <InlineEditor saving={saving} onCancel={cancel} onSave={() => void save('campaignId')}>
              <Combobox value={draft} onChange={setDraft} options={campaignOptions} />
            </InlineEditor>
          ) : (
            <button
              type="button"
              className="w-full rounded-md px-1 py-0.5 text-left hover:bg-accent/50"
              onClick={() => startEdit('campaignId')}
            >
              {displayValue(lead.campaign?.name)}
            </button>
          )}
        </FieldShell>
        <FieldShell label="Client">{displayValue(lead.party?.displayName)}</FieldShell>

        <FieldShell
          label="Priority"
          editable={canWrite}
          editing={editing === 'priority'}
          onStartEdit={() => startEdit('priority')}
        >
          {editing === 'priority' ? (
            <InlineEditor saving={saving} onCancel={cancel} onSave={() => void save('priority')}>
              <Combobox
                value={draft}
                onChange={setDraft}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </InlineEditor>
          ) : (
            <button
              type="button"
              className="rounded-md px-1 py-0.5 hover:bg-accent/50"
              onClick={() => startEdit('priority')}
            >
              <StatusBadge value={lead.priority || 'normal'} showIcon size="md" />
            </button>
          )}
        </FieldShell>

        <FieldShell
          label="Follow-up"
          editable={canWrite}
          editing={editing === 'followUpAt'}
          onStartEdit={() => startEdit('followUpAt')}
        >
          {editing === 'followUpAt' ? (
            <InlineEditor saving={saving} onCancel={cancel} onSave={() => void save('followUpAt')}>
              <DatePicker value={followUpDraft} onChange={setFollowUpDraft} />
            </InlineEditor>
          ) : (
            <button
              type="button"
              className="w-full rounded-md px-1 py-0.5 text-left hover:bg-accent/50"
              onClick={() => startEdit('followUpAt')}
            >
              {lead.followUpAt
                ? displayValue(formatDate(lead.followUpAt))
                : displayValue(null)}
            </button>
          )}
        </FieldShell>

        <FieldShell label="Created">
          {lead.createdAt ? (
            <span className="font-medium">{formatDateTime(lead.createdAt)}</span>
          ) : (
            displayValue(null)
          )}
        </FieldShell>
      </div>
    </aside>
  );
}

function InlineEditor({
  children,
  onSave,
  onCancel,
  saving,
}: {
  children: React.ReactNode;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {children}
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          className="h-7 px-2"
          onClick={onSave}
          disabled={saving}
        >
          <Check className="size-3.5" />
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onCancel}>
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
