import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import {
  Button,
  Combobox,
  DatePicker,
  EmailInput,
  Input,
  PhoneInput,
  cn,
  toastError,
  toastSuccess,
  formatDateTime,
} from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { formatLeadFollowUp } from '../../lib/leadTableDisplay';
import { usePermissions } from '../../lib/permissions';

type LeadAbout = {
  id: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  owner?: { fullName?: string | null } | null;
  source?: { name?: string | null; key?: string | null } | null;
  campaign?: { id?: string; name?: string | null } | null;
  party?: { id?: string; displayName?: string | null } | null;
  partyId?: string | null;
  followUpAt?: string | null;
  createdAt?: string | null;
  priority?: string;
  tagsJson?: unknown;
};

type LeadAboutPanelProps = {
  lead: LeadAbout;
  onUpdated: () => Promise<void> | void;
  /** Create customer from lead contact details (convert-to-client). */
  onCreateCustomer?: () => void;
  /** Open picker to link an existing customer. */
  onLinkExistingCustomer?: () => void;
  /** Next open task — shown as the follow-up action when present. */
  nextTask?: { title: string; dueAt?: string | null } | null;
  className?: string;
  showHeader?: boolean;
};

type EditableKey = 'contactName' | 'email' | 'phone' | 'followUpAt' | 'campaignId';

function FieldGroup({
  title,
  children,
  divided,
}: {
  title: string;
  children: React.ReactNode;
  divided?: boolean;
}) {
  return (
    <section
      className={cn(
        divided && 'border-t border-border/50 pt-2.5',
        'space-y-0 pb-2.5 last:pb-0',
      )}
    >
      <h3 className="mb-1 px-1.5 text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-0">{children}</div>
    </section>
  );
}

function FieldRow({
  label,
  children,
  actions,
  editing,
  onStartEdit,
  editable,
}: {
  label: string;
  children: React.ReactNode;
  /** Compact actions under the value, full value-column width. */
  actions?: React.ReactNode;
  editing?: boolean;
  onStartEdit?: () => void;
  editable?: boolean;
}) {
  return (
    <div
      className={cn(
        'group/field rounded-md px-1.5 py-1 transition-colors',
        editable && !editing && 'hover:bg-accent/40',
        editing && 'bg-accent/30',
      )}
    >
      {editing ? (
        <div className="space-y-1.5">
          <div className="text-[length:var(--control-text-sm)] font-medium text-muted-foreground">
            {label}
          </div>
          {children}
        </div>
      ) : (
        <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-2">
          <div className="pt-px text-[length:var(--control-text-sm)] text-muted-foreground">
            {label}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-start gap-1">
              <div className="min-w-0 flex-1 break-words text-[length:var(--control-text-sm)] leading-snug text-foreground">
                {children}
              </div>
              {editable && onStartEdit ? (
                <button
                  type="button"
                  className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/field:opacity-100 focus-visible:opacity-100"
                  onClick={onStartEdit}
                  aria-label={`Edit ${label}`}
                >
                  <Pencil className="size-3" />
                </button>
              ) : null}
            </div>
            {actions ? (
              <div className="mt-1.5 min-w-0">{actions}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Lightweight text actions for the narrow about panel. */
function FieldAction({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[length:var(--control-text-sm)] font-medium text-foreground/90 underline-offset-2 hover:underline disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function displayActionTitle(title: string) {
  return title.replace(/\bCall client\b/gi, 'Call customer');
}

function formatPhoneDisplay(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

export function LeadAboutPanel({
  lead,
  onUpdated,
  onCreateCustomer,
  onLinkExistingCustomer,
  nextTask,
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
  const linkedClient = lead.party?.displayName || null;
  const followUp = formatLeadFollowUp(lead.followUpAt || nextTask?.dueAt);
  const interestTags = Array.isArray(lead.tagsJson)
    ? (lead.tagsJson as string[]).filter((t) => typeof t === 'string' && t.trim())
    : [];

  useEffect(() => {
    setEditing(null);
  }, [lead.id, lead.contactName, lead.email, lead.phone, lead.followUpAt, lead.campaign?.id]);

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
    } else if (key === 'campaignId') {
      setDraft(lead.campaign?.id || '');
    } else {
      setDraft((lead[key] as string) || '');
    }
  }

  function cancel() {
    setEditing(null);
  }

  async function save(key: EditableKey, valueOverride?: unknown) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (key === 'followUpAt') {
        body.followUpAt =
          valueOverride !== undefined
            ? valueOverride
            : (followUpDraft?.toISOString() ?? null);
      } else if (key === 'campaignId') {
        body.campaignId = draft.trim() || null;
      } else if (key === 'email' || key === 'phone' || key === 'contactName') {
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

  const filled = (value?: string | null) =>
    value ? <span className="font-medium">{value}</span> : null;

  const emptyHint = (label: string) => (
    <span className={cn(canWrite ? 'text-primary/80' : 'text-muted-foreground')}>
      {canWrite ? `Add ${label.toLowerCase()}` : '—'}
    </span>
  );

  return (
    <aside className={className}>
      {showHeader ? (
        <h2 className="text-[length:var(--control-text)] font-semibold tracking-tight">
          About this lead
        </h2>
      ) : null}

      <div className={cn(showHeader ? 'mt-2' : 'mt-0', 'space-y-0')}>
        <FieldGroup title="Contact">
          <FieldRow
            label="Name"
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
                  inputSize="sm"
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
              <ValueButton editable={canWrite} onClick={() => startEdit('contactName')}>
                {filled(lead.contactName) ?? emptyHint('name')}
              </ValueButton>
            )}
          </FieldRow>

          <FieldRow
            label="Phone"
            editable={canWrite}
            editing={editing === 'phone'}
            onStartEdit={() => startEdit('phone')}
          >
            {editing === 'phone' ? (
              <InlineEditor saving={saving} onCancel={cancel} onSave={() => void save('phone')}>
                <PhoneInput size="sm" value={draft} onChange={setDraft} />
              </InlineEditor>
            ) : (
              <ValueButton editable={canWrite} onClick={() => startEdit('phone')}>
                {lead.phone ? (
                  <span className="font-medium tabular-nums">
                    {formatPhoneDisplay(lead.phone)}
                  </span>
                ) : (
                  emptyHint('phone')
                )}
              </ValueButton>
            )}
          </FieldRow>

          <FieldRow
            label="Email"
            editable={canWrite}
            editing={editing === 'email'}
            onStartEdit={() => startEdit('email')}
          >
            {editing === 'email' ? (
              <InlineEditor saving={saving} onCancel={cancel} onSave={() => void save('email')}>
                <EmailInput inputSize="sm" value={draft} onChange={setDraft} placeholder="name@…" />
              </InlineEditor>
            ) : (
              <ValueButton editable={canWrite} onClick={() => startEdit('email')}>
                {lead.email ? (
                  <span className="font-medium text-primary">{lead.email}</span>
                ) : (
                  emptyHint('email')
                )}
              </ValueButton>
            )}
          </FieldRow>
          {interestTags.length > 0 ? (
            <div className="flex flex-wrap gap-1 px-1.5 pt-1">
              {interestTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[length:var(--control-text-sm)] font-medium text-foreground/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </FieldGroup>

        <FieldGroup title="Assignment" divided>
          <FieldRow label="Owner">{filled(lead.owner?.fullName) ?? <span className="text-muted-foreground">Unassigned</span>}</FieldRow>

          <FieldRow
            label="Follow-up"
            editable={canWrite}
            editing={editing === 'followUpAt'}
            onStartEdit={() => startEdit('followUpAt')}
            actions={
              canWrite && (lead.followUpAt || nextTask) && editing !== 'followUpAt' ? (
                <div className="flex items-center gap-3">
                  <FieldAction disabled={saving} onClick={() => void save('followUpAt', null)}>
                    Complete
                  </FieldAction>
                  <FieldAction onClick={() => startEdit('followUpAt')}>Reschedule</FieldAction>
                </div>
              ) : undefined
            }
          >
            {editing === 'followUpAt' ? (
              <InlineEditor saving={saving} onCancel={cancel} onSave={() => void save('followUpAt')}>
                <DatePicker
                  size="sm"
                  value={followUpDraft}
                  onChange={setFollowUpDraft}
                  disablePast
                />
              </InlineEditor>
            ) : (
              <ValueButton editable={canWrite} onClick={() => startEdit('followUpAt')}>
                {lead.followUpAt || nextTask ? (
                  <span className="block space-y-0.5">
                    {nextTask?.title ? (
                      <span className="block font-medium leading-snug">
                        {displayActionTitle(nextTask.title)}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        'block leading-snug',
                        nextTask?.title ? 'text-muted-foreground' : 'font-medium',
                        !nextTask?.title && followUp.tone === 'danger' && 'text-destructive',
                        !nextTask?.title &&
                          followUp.tone === 'warn' &&
                          'text-amber-600 dark:text-amber-400',
                        followUp.tone === 'danger' && nextTask?.title && 'text-destructive',
                        followUp.tone === 'warn' &&
                          nextTask?.title &&
                          'text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {followUp.label}
                    </span>
                  </span>
                ) : (
                  emptyHint('follow-up')
                )}
              </ValueButton>
            )}
          </FieldRow>
        </FieldGroup>

        <FieldGroup title="Attribution" divided>
          <FieldRow label="Source">
            {filled(lead.source?.name) ?? <span className="text-muted-foreground">None</span>}
          </FieldRow>
          <FieldRow
            label="Campaign"
            editable={canWrite}
            editing={editing === 'campaignId'}
            onStartEdit={() => startEdit('campaignId')}
          >
            {editing === 'campaignId' ? (
              <InlineEditor
                saving={saving}
                onCancel={cancel}
                onSave={() => void save('campaignId')}
              >
                <Combobox size="sm" value={draft} onChange={setDraft} options={campaignOptions} />
              </InlineEditor>
            ) : (
              <ValueButton editable={canWrite} onClick={() => startEdit('campaignId')}>
                {filled(lead.campaign?.name) ?? emptyHint('campaign')}
              </ValueButton>
            )}
          </FieldRow>
        </FieldGroup>

        <FieldGroup title="Record" divided>
          <FieldRow
            label="Customer"
            actions={
              !linkedClient && canWrite && (onCreateCustomer || onLinkExistingCustomer) ? (
                <div className="flex flex-col items-start gap-0.5">
                  {onCreateCustomer ? (
                    <FieldAction onClick={onCreateCustomer}>Create customer</FieldAction>
                  ) : null}
                  {onLinkExistingCustomer ? (
                    <FieldAction onClick={onLinkExistingCustomer}>Link existing</FieldAction>
                  ) : null}
                </div>
              ) : undefined
            }
          >
            {linkedClient ? (
              <span className="font-medium">{linkedClient}</span>
            ) : (
              <span className="text-muted-foreground">Not linked</span>
            )}
          </FieldRow>
          <FieldRow label="Created">
            {lead.createdAt ? (
              <span className="tabular-nums text-muted-foreground">
                {formatDateTime(lead.createdAt)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </FieldRow>
        </FieldGroup>
      </div>
    </aside>
  );
}

function ValueButton({
  children,
  editable,
  onClick,
}: {
  children: React.ReactNode;
  editable?: boolean;
  onClick: () => void;
}) {
  if (!editable) return <>{children}</>;
  return (
    <button type="button" className="w-full text-left" onClick={onClick}>
      {children}
    </button>
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
      <div className="flex items-center gap-1">
        <Button type="button" size="xs" onClick={onSave} disabled={saving}>
          <Check className="size-[0.875em]" />
          Save
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onCancel}
          aria-label="Cancel"
        >
          <X className="size-[0.875em]" />
        </Button>
      </div>
    </div>
  );
}
