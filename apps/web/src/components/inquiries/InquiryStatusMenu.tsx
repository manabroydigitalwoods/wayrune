import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  RecordDialog,
  SimpleFormField as FormField,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { inquiryStatusLabel } from '../../lib/agencyStatusLabels';

/** Mirrors `InquiriesService.STATUS_TRANSITIONS` on the backend — kept in
 * sync manually since this is UI-only guidance; the API is the source of
 * truth and re-validates every transition. */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['qualified', 'lost'],
  qualified: ['open', 'lost'],
  lost: ['open'],
};

type StatusInquiry = { id: string; status: string };

export function InquiryStatusMenu<T extends StatusInquiry>({
  inquiry,
  onChanged,
  size = 'sm',
}: {
  inquiry: T;
  onChanged: (updated: T) => void;
  size?: 'sm' | 'default';
}) {
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [saving, setSaving] = useState(false);

  const next = STATUS_TRANSITIONS[inquiry.status] || [];
  if (!next.length) return null;

  async function apply(status: string, reason?: string) {
    setSaving(true);
    try {
      const updated = await api<T>(`/inquiries/${inquiry.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
      });
      toastSuccess(`Marked ${inquiryStatusLabel(status) || status}`);
      onChanged(updated);
      setLostOpen(false);
      setLostReason('');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setSaving(false);
    }
  }

  function select(status: string) {
    if (status === 'lost') {
      setLostReason('');
      setLostOpen(true);
      return;
    }
    void apply(status);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant="outline" disabled={saving}>
            Change status
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {next.map((status) => (
            <DropdownMenuItem key={status} onClick={() => select(status)}>
              Mark {inquiryStatusLabel(status) || status}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <RecordDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        title="Mark inquiry as lost"
        description="Tell the team why this opportunity didn't move forward."
        submitLabel="Mark lost"
        submitting={saving}
        onSubmit={() => void apply('lost', lostReason.trim())}
      >
        <FormField label="Reason" required>
          <Input
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="e.g. Budget too low, chose competitor…"
            autoFocus
          />
        </FormField>
      </RecordDialog>
    </>
  );
}
