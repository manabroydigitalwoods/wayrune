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
  toastError,
} from '@wayrune/ui';
import { api, apiUpload } from '../../api';
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
  note: 'Create Note',
  email: 'Create Email',
  call: 'Create Call',
};

const DESCRIPTIONS: Record<ActivityKind, string | undefined> = {
  note: undefined,
  email: 'Records an email you already sent or received — does not send mail.',
  call: 'Records a call you already made — does not dial.',
};

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
  const [attachments, setAttachments] = useState<File[]>([]);
  const [inlineDocIds, setInlineDocIds] = useState<string[]>([]);
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDue, setFollowUpDue] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setBody('');
    setAttachments([]);
    setInlineDocIds([]);
    setCreateFollowUp(false);
    setFollowUpTitle('');
    setFollowUpDue(undefined);
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
    if (isEmptyRichHtml(body)) {
      toastError('Add some content before saving');
      return;
    }
    setSaving(true);
    try {
      const activity = await api<{ id: string }>(`/leads/${leadId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type, body }),
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
        <FormField label="Details" required>
          <RichTextEditor
            key={draftId}
            value={body}
            onChange={setBody}
            placeholder={
              type === 'email'
                ? 'Paste or summarize the email…'
                : type === 'call'
                  ? 'What was discussed?'
                  : 'What happened? Next steps?'
            }
            onUploadImage={uploadImage}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onInlineDocumentIdsChange={setInlineDocIds}
            disabled={saving}
          />
        </FormField>
        <div className="flex items-center gap-2">
          <Checkbox
            id="follow-up-task"
            checked={createFollowUp}
            onCheckedChange={(v) => setCreateFollowUp(v === true)}
            className="mt-0"
          />
          <Label htmlFor="follow-up-task" className="cursor-pointer leading-none">
            Create follow-up task
          </Label>
        </div>
        {createFollowUp ? (
          <div className="space-y-2 pl-6">
            <Input
              value={followUpTitle}
              onChange={(e) => setFollowUpTitle(e.target.value)}
              placeholder="Task title"
            />
            <DatePicker value={followUpDue} onChange={setFollowUpDue} placeholder="Due date" />
          </div>
        ) : null}
      </form>
    </FloatingComposer>
  );
}
