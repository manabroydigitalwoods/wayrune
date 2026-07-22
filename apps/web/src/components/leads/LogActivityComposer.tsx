import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Input,
  isEmptyRichHtml,
  Label,
  RichTextEditor,
  SimpleFormField as FormField,
  SuggestionChips,
  toastError,
} from '@wayrune/ui';
import { api, apiUpload } from '../../api';
import {
  followUpFromPreset,
  followUpPresetOptions,
  presetFromFollowUp,
} from '../../lib/leadFollowUpPresets';
import { FloatingComposer } from './FloatingComposer';

type ActivityKind = 'note' | 'email' | 'call';

type LogActivityComposerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  defaultType?: ActivityKind;
  onLogged: () => Promise<void> | void;
};

const LABELS: Record<ActivityKind, string> = {
  note: 'Add note',
  email: 'Log email',
  call: 'Log call',
};

const DESCRIPTIONS: Record<ActivityKind, string | undefined> = {
  note: undefined,
  email: 'Record an email sent or received outside Wayrune.',
  call: 'Record a call already made or received.',
};

const NOTE_PROMPTS = [
  { value: 'customer_requirements', label: 'Customer requirements' },
  { value: 'call_summary', label: 'Call summary' },
  { value: 'budget_discussion', label: 'Budget discussion' },
  { value: 'quote_feedback', label: 'Quote feedback' },
  { value: 'internal_note', label: 'Internal note' },
] as const;

const EMAIL_DIRECTIONS = [
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
] as const;

const CALL_DIRECTIONS = [
  { value: 'outgoing', label: 'Outgoing' },
  { value: 'incoming', label: 'Incoming' },
] as const;

const CALL_OUTCOMES = [
  { value: 'connected', label: 'Connected' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'call_back', label: 'Call back' },
  { value: 'wrong_number', label: 'Wrong number' },
] as const;

const FOLLOW_UP_ACTIONS = [
  { value: 'Call customer', label: 'Call customer' },
  { value: 'Send quotation', label: 'Send quotation' },
  { value: 'Collect documents', label: 'Collect documents' },
  { value: 'Revise quotation', label: 'Revise quotation' },
  { value: 'Follow up', label: 'Follow up' },
] as const;

const FOLLOW_UP_WHEN = [
  { value: 'later_today', label: 'Later today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'in_3_days', label: 'In 3 days' },
  { value: 'custom', label: 'Pick date' },
] as const;

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notePromptHtml(label: string) {
  return `<p><strong>${escapeHtml(label)}</strong></p><p></p>`;
}

function suggestFollowUp(input: {
  type: ActivityKind;
  notePrompt: string;
  emailDirection: string;
  callOutcome: string;
}): { title: string; duePreset: string } | null {
  if (input.type === 'call') {
    if (input.callOutcome === 'no_answer' || input.callOutcome === 'busy') {
      return { title: 'Call customer', duePreset: 'tomorrow' };
    }
    if (input.callOutcome === 'call_back') {
      return { title: 'Call customer', duePreset: 'later_today' };
    }
    if (input.callOutcome === 'connected') {
      return { title: 'Send quotation', duePreset: 'in_3_days' };
    }
  }
  if (input.type === 'email' && input.emailDirection === 'sent') {
    return { title: 'Follow up', duePreset: 'in_3_days' };
  }
  if (input.type === 'email' && input.emailDirection === 'received') {
    return { title: 'Call customer', duePreset: 'tomorrow' };
  }
  if (input.type === 'note') {
    if (input.notePrompt === 'quote_feedback') {
      return { title: 'Revise quotation', duePreset: 'tomorrow' };
    }
    if (input.notePrompt === 'customer_requirements') {
      return { title: 'Collect documents', duePreset: 'in_3_days' };
    }
    if (input.notePrompt === 'budget_discussion') {
      return { title: 'Send quotation', duePreset: 'tomorrow' };
    }
  }
  return null;
}

function composeActivityBody(input: {
  type: ActivityKind;
  body: string;
  emailDirection: string;
  emailSubject: string;
  callDirection: string;
  callOutcome: string;
  callDuration: string;
}) {
  const metaBits: string[] = [];
  if (input.type === 'email') {
    const dir = EMAIL_DIRECTIONS.find((d) => d.value === input.emailDirection)?.label;
    if (dir) metaBits.push(dir);
    if (input.emailSubject.trim()) metaBits.push(`Subject: ${input.emailSubject.trim()}`);
  }
  if (input.type === 'call') {
    const dir = CALL_DIRECTIONS.find((d) => d.value === input.callDirection)?.label;
    const outcome = CALL_OUTCOMES.find((o) => o.value === input.callOutcome)?.label;
    if (dir) metaBits.push(dir);
    if (outcome) metaBits.push(outcome);
    if (input.callDuration.trim()) metaBits.push(input.callDuration.trim());
  }

  const chunks: string[] = [];
  if (metaBits.length) {
    chunks.push(`<p><strong>${escapeHtml(metaBits.join(' · '))}</strong></p>`);
  }
  if (!isEmptyRichHtml(input.body)) {
    chunks.push(input.body);
  } else if (input.type === 'call' && input.callOutcome) {
    const outcome = CALL_OUTCOMES.find((o) => o.value === input.callOutcome)?.label;
    if (outcome) chunks.push(`<p>${escapeHtml(outcome)}</p>`);
  }
  return chunks.join('');
}

export function LogActivityComposer({
  open,
  onOpenChange,
  leadId,
  defaultType = 'note',
  onLogged,
}: LogActivityComposerProps) {
  const [sessionKey, setSessionKey] = useState(0);
  const draftId = useMemo(() => `draft-${sessionKey}-${leadId}`, [sessionKey, leadId]);
  const type = defaultType;
  const [body, setBody] = useState('');
  const [notePrompt, setNotePrompt] = useState('');
  const [emailDirection, setEmailDirection] = useState('sent');
  const [emailSubject, setEmailSubject] = useState('');
  const [callDirection, setCallDirection] = useState('outgoing');
  const [callOutcome, setCallOutcome] = useState('');
  const [callDuration, setCallDuration] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [inlineDocIds, setInlineDocIds] = useState<string[]>([]);
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDue, setFollowUpDue] = useState<Date | undefined>();
  const [followUpDuePreset, setFollowUpDuePreset] = useState('');
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setBody('');
    setNotePrompt('');
    setEmailDirection('sent');
    setEmailSubject('');
    setCallDirection('outgoing');
    setCallOutcome('');
    setCallDuration('');
    setAttachments([]);
    setInlineDocIds([]);
    setCreateFollowUp(false);
    setFollowUpTitle('');
    setFollowUpDue(undefined);
    setFollowUpDuePreset('');
  }

  function applyFollowUpSuggestion(force = false) {
    const suggestion = suggestFollowUp({
      type,
      notePrompt,
      emailDirection,
      callOutcome,
    });
    if (!suggestion) return;
    if (force || !followUpTitle.trim()) setFollowUpTitle(suggestion.title);
    if (force || !followUpDue) {
      setFollowUpDue(followUpFromPreset(suggestion.duePreset));
      setFollowUpDuePreset(suggestion.duePreset);
    }
  }

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    setSessionKey((k) => k + 1);
    resetForm();
  }, [open, defaultType]);

  async function uploadImage(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      return await apiUpload<{ id: string; contentUrl: string }>(
        `/files/upload?entityType=activity_draft&entityId=${encodeURIComponent(draftId)}`,
        fd,
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Image upload failed');
      throw e;
    }
  }

  async function submit() {
    if (type === 'email' && !emailDirection) {
      toastError('Choose Sent or Received');
      return;
    }
    if (type === 'call' && !callOutcome) {
      toastError('Choose a call outcome');
      return;
    }

    const composed = composeActivityBody({
      type,
      body,
      emailDirection,
      emailSubject,
      callDirection,
      callOutcome,
      callDuration,
    });
    if (isEmptyRichHtml(composed)) {
      toastError('Add some content before saving');
      return;
    }
    if (createFollowUp && !followUpTitle.trim()) {
      toastError('Choose a follow-up action');
      return;
    }

    setSaving(true);
    try {
      const activity = await api<{ id: string }>(`/leads/${leadId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type, body: composed }),
      });

      if (inlineDocIds.length) {
        await api('/files/reassociate', {
          method: 'POST',
          body: JSON.stringify({
            documentIds: inlineDocIds,
            fromEntityType: 'activity_draft',
            fromEntityId: draftId,
            toEntityType: 'activity',
            toEntityId: activity.id,
          }),
        });
      }

      for (const file of attachments) {
        const fd = new FormData();
        fd.append('file', file);
        await apiUpload(
          `/files/upload?entityType=activity&entityId=${encodeURIComponent(activity.id)}`,
          fd,
        );
      }

      if (createFollowUp && followUpTitle.trim()) {
        await api('/tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: followUpTitle.trim(),
            priority: 'normal',
            dueAt: followUpDue?.toISOString(),
            entityType: 'lead',
            entityId: leadId,
          }),
        });
      }

      onOpenChange(false);
      resetForm();
      await onLogged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const actionLabel = LABELS[type];
  const detailsLabel = type === 'call' ? 'Notes' : 'Details';
  const allowAttachments = type === 'note';
  const editorToolbar = 'basic';

  const followUpWhenOptions = useMemo(
    () =>
      FOLLOW_UP_WHEN.map((o) => {
        if (o.value === 'custom') return { value: o.value, label: o.label };
        const labeled = followUpPresetOptions(undefined).find((p) => p.value === o.value);
        return { value: o.value, label: labeled?.label || o.label };
      }),
    [],
  );

  return (
    <FloatingComposer
      open={open}
      onOpenChange={onOpenChange}
      title={actionLabel}
      description={DESCRIPTIONS[type]}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : actionLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3"
      >
        {type === 'note' ? (
          <SuggestionChips
            aria-label="Note prompts"
            options={[...NOTE_PROMPTS]}
            value={notePrompt}
            onChange={(value) => {
              setNotePrompt(value);
              const prompt = NOTE_PROMPTS.find((p) => p.value === value);
              if (prompt && isEmptyRichHtml(body)) {
                setBody(notePromptHtml(prompt.label));
              }
              if (createFollowUp) {
                const suggestion = suggestFollowUp({
                  type,
                  notePrompt: value,
                  emailDirection,
                  callOutcome,
                });
                if (suggestion) {
                  setFollowUpTitle(suggestion.title);
                  setFollowUpDue(followUpFromPreset(suggestion.duePreset));
                  setFollowUpDuePreset(suggestion.duePreset);
                }
              }
            }}
          />
        ) : null}

        {type === 'email' ? (
          <>
            <FormField label="Direction" required>
              <SuggestionChips
                aria-label="Email direction"
                allowDeselect={false}
                options={[...EMAIL_DIRECTIONS]}
                value={emailDirection}
                onChange={(value) => {
                  setEmailDirection(value);
                  if (createFollowUp) {
                    const suggestion = suggestFollowUp({
                      type,
                      notePrompt,
                      emailDirection: value,
                      callOutcome,
                    });
                    if (suggestion) {
                      setFollowUpTitle(suggestion.title);
                      setFollowUpDue(followUpFromPreset(suggestion.duePreset));
                      setFollowUpDuePreset(suggestion.duePreset);
                    }
                  }
                }}
              />
            </FormField>
            <FormField label="Subject">
              <Input
                inputSize="sm"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Optional email subject"
                disabled={saving}
              />
            </FormField>
          </>
        ) : null}

        {type === 'call' ? (
          <>
            <FormField label="Direction" required>
              <SuggestionChips
                aria-label="Call direction"
                allowDeselect={false}
                options={[...CALL_DIRECTIONS]}
                value={callDirection}
                onChange={setCallDirection}
              />
            </FormField>
            <FormField label="Outcome" required>
              <SuggestionChips
                aria-label="Call outcome"
                allowDeselect={false}
                options={[...CALL_OUTCOMES]}
                value={callOutcome}
                onChange={(value) => {
                  setCallOutcome(value);
                  if (createFollowUp) {
                    const suggestion = suggestFollowUp({
                      type,
                      notePrompt,
                      emailDirection,
                      callOutcome: value,
                    });
                    if (suggestion) {
                      setFollowUpTitle(suggestion.title);
                      setFollowUpDue(followUpFromPreset(suggestion.duePreset));
                      setFollowUpDuePreset(suggestion.duePreset);
                    }
                  }
                }}
              />
            </FormField>
            <FormField label="Duration">
              <Input
                inputSize="sm"
                value={callDuration}
                onChange={(e) => setCallDuration(e.target.value)}
                placeholder="e.g. 5 minutes"
                disabled={saving}
              />
            </FormField>
          </>
        ) : null}

        <FormField label={detailsLabel} required={type !== 'call' || callOutcome === 'connected'}>
          <RichTextEditor
            key={draftId}
            value={body}
            onChange={setBody}
            size="composer"
            toolbar={editorToolbar}
            placeholder={
              type === 'email'
                ? 'Paste or summarize the email…'
                : type === 'call'
                  ? 'What was discussed?'
                  : 'What happened? Next steps?'
            }
            onUploadImage={allowAttachments ? uploadImage : undefined}
            attachments={allowAttachments ? attachments : undefined}
            onAttachmentsChange={allowAttachments ? setAttachments : undefined}
            onInlineDocumentIdsChange={allowAttachments ? setInlineDocIds : undefined}
            disabled={saving}
          />
        </FormField>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="follow-up-task"
              checked={createFollowUp}
              onCheckedChange={(v) => {
                const on = v === true;
                setCreateFollowUp(on);
                if (on) applyFollowUpSuggestion(true);
              }}
              className="mt-0"
            />
            <Label htmlFor="follow-up-task" className="cursor-pointer leading-none">
              Schedule a follow-up
            </Label>
          </div>
          {createFollowUp ? (
            <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <FormField label="Next action" required>
                <SuggestionChips
                  aria-label="Follow-up action"
                  options={[...FOLLOW_UP_ACTIONS]}
                  value={
                    FOLLOW_UP_ACTIONS.some((a) => a.value === followUpTitle) ? followUpTitle : ''
                  }
                  onChange={(title) => {
                    if (title) setFollowUpTitle(title);
                  }}
                />
                <Input
                  className="mt-2"
                  inputSize="sm"
                  value={followUpTitle}
                  onChange={(e) => setFollowUpTitle(e.target.value)}
                  placeholder="Or type a custom action"
                />
              </FormField>
              <FormField label="When">
                <SuggestionChips
                  aria-label="Follow-up when"
                  options={followUpWhenOptions}
                  value={
                    followUpDuePreset ||
                    (followUpDue ? presetFromFollowUp(followUpDue) : '') ||
                    ''
                  }
                  onChange={(preset) => {
                    if (!preset) {
                      setFollowUpDue(undefined);
                      setFollowUpDuePreset('');
                      return;
                    }
                    setFollowUpDuePreset(preset);
                    if (preset === 'custom') return;
                    setFollowUpDue(followUpFromPreset(preset));
                  }}
                />
                {followUpDuePreset === 'custom' ||
                (followUpDue && presetFromFollowUp(followUpDue) === 'custom') ? (
                  <div className="mt-2">
                    <DatePicker
                      size="sm"
                      value={followUpDue}
                      onChange={(due) => {
                        setFollowUpDue(due);
                        setFollowUpDuePreset(due ? 'custom' : '');
                      }}
                      placeholder="Due date"
                      disablePast
                    />
                  </div>
                ) : null}
              </FormField>
            </div>
          ) : null}
        </div>
      </form>
    </FloatingComposer>
  );
}
