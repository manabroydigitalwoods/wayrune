import { CheckSquare, ClipboardList, MessageCircle, Phone, Plus, Square } from 'lucide-react';
import {
  Button,
  DatePicker,
  RecordDialog,
  StatusBadge,
  SuggestionChips,
  TimePicker,
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTime,
} from '@wayrune/ui';
import { useEffect, useState } from 'react';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { inquiryStatusLabel } from '../../lib/agencyStatusLabels';
import {
  applyTimeToDate,
  followUpFromPreset,
  followUpPresetOptions,
  presetFromFollowUp,
  TASK_DUE_TIME_PRESETS,
  timeValueFromDate,
} from '../../lib/leadFollowUpPresets';
import { formatLeadFollowUp } from '../../lib/leadTableDisplay';
import { usePermissions } from '../../lib/permissions';

export type LeadTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  description?: string | null;
  dueAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type LeadInquiry = {
  id: string;
  inquiryNumber: string;
  status: string;
  travelType?: string | null;
  domesticOrIntl?: string | null;
  origin?: string | null;
  originPlaceId?: string | null;
  originJson?: unknown;
  destinationsJson?: unknown;
  startDate?: string | null;
  endDate?: string | null;
  nights?: number | null;
  adults?: number;
  children?: number;
  infants?: number;
  budgetAmount?: string | number | null;
  budgetCurrency?: string | null;
  hotelCategory?: string | null;
  createdAt: string;
  updatedAt?: string;
};

type LeadAssociationsPanelProps = {
  leadId: string;
  leadTitle?: string | null;
  contactName?: string | null;
  phone?: string | null;
  partyName?: string | null;
  tasks: LeadTask[];
  inquiries: LeadInquiry[];
  onNewTask: () => void;
  onCreateInquiry: () => void;
  onCompleteTask: (taskId: string, title?: string) => void;
  onRescheduleTask?: (taskId: string, dueAt: Date) => void | Promise<void>;
  className?: string;
  showHeader?: boolean;
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-[length:var(--control-text-sm)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-foreground">{children}</dd>
    </div>
  );
}

function digitsOnlyPhone(phone?: string | null) {
  return (phone || '').replace(/\D/g, '');
}

function isCallTask(title: string) {
  return /\bcall\b/i.test(title);
}

function displayTaskTitle(title: string) {
  return title.replace(/\bCall client\b/gi, 'Call customer');
}

export function LeadAssociationsPanel({
  leadId,
  leadTitle,
  contactName,
  phone,
  partyName,
  tasks,
  inquiries,
  onNewTask,
  onCreateInquiry,
  onCompleteTask,
  onRescheduleTask,
  className,
  showHeader = true,
}: LeadAssociationsPanelProps) {
  const { navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canTaskWrite = hasAny(CAP.taskWrite);
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const [taskDetail, setTaskDetail] = useState<LeadTask | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDue, setRescheduleDue] = useState<Date | undefined>();
  const [reschedulePreset, setReschedulePreset] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const phoneDigits = digitsOnlyPhone(phone);

  useEffect(() => {
    if (!taskDetail) {
      setRescheduleOpen(false);
      return;
    }
    const due = taskDetail.dueAt ? new Date(taskDetail.dueAt) : undefined;
    setRescheduleDue(due);
    setReschedulePreset(due ? presetFromFollowUp(due) : '');
  }, [taskDetail]);

  async function saveReschedule() {
    if (!taskDetail || !rescheduleDue || !onRescheduleTask) return;
    setRescheduleSaving(true);
    try {
      await onRescheduleTask(taskDetail.id, rescheduleDue);
      setRescheduleOpen(false);
      setTaskDetail(null);
    } catch {
      // Parent already toasted; keep dialog open to retry.
    } finally {
      setRescheduleSaving(false);
    }
  }

  return (
    <aside className={className}>
      {showHeader ? (
        <h2 className="text-[length:var(--control-text)] font-semibold tracking-tight">Related</h2>
      ) : null}

      <section className={showHeader ? 'mt-3 space-y-1.5' : 'space-y-1.5'}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[length:var(--control-text-sm)] font-medium uppercase tracking-wide text-muted-foreground">
            Tasks
          </h3>
          <Can anyOf={CAP.taskWrite}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="px-[var(--control-px-sm)]"
              onClick={onNewTask}
            >
              <Plus className="size-[0.875em]" />
              New
            </Button>
          </Can>
        </div>
        {openTasks.length === 0 ? (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">No open tasks</p>
        ) : (
          <ul className="space-y-1.5">
            {openTasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => setTaskDetail(task)}
                  className={cn(
                    'w-full rounded-lg border px-2 py-1.5 text-left transition-colors glass-row hover:border-primary/25',
                    'hover:border-primary/30 hover:bg-accent/30',
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    {task.status === 'done' ? (
                      <CheckSquare className="mt-0.5 size-[0.875em] shrink-0 text-primary" />
                    ) : (
                      <Square className="mt-0.5 size-[0.875em] shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[length:var(--control-text-sm)] font-medium leading-snug">
                        {displayTaskTitle(task.title)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge value={task.priority} showIcon />
                        {task.dueAt
                          ? (() => {
                              const due = formatLeadFollowUp(task.dueAt);
                              return (
                                <span
                                  className={cn(
                                    'text-[length:var(--control-text-sm)]',
                                    due.tone === 'danger' && 'font-medium text-destructive',
                                    due.tone === 'warn' &&
                                      'font-medium text-amber-600 dark:text-amber-400',
                                    (due.tone === 'muted' || due.tone === 'default') &&
                                      'text-muted-foreground',
                                  )}
                                >
                                  {due.label}
                                </span>
                              );
                            })()
                          : null}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[length:var(--control-text-sm)] font-medium uppercase tracking-wide text-muted-foreground">
            Inquiries
          </h3>
          <Can anyOf={CAP.inquiryWrite}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="px-[var(--control-px-sm)]"
              onClick={onCreateInquiry}
            >
              <Plus className="size-[0.875em]" />
              New
            </Button>
          </Can>
        </div>
        {inquiries.length === 0 ? (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
            No inquiries yet
          </p>
        ) : (
          <ul className="space-y-1.5">
            {inquiries.map((inq) => (
              <li key={inq.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/inquiries/${inq.id}`)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors glass-row hover:border-primary/25',
                    'hover:border-primary/30 hover:bg-accent/30',
                  )}
                >
                  <ClipboardList className="size-[0.875em] shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="text-[length:var(--control-text-sm)] font-medium">
                      {inq.inquiryNumber}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge value={inq.status} label={inquiryStatusLabel(inq.status)} showIcon />
                      {inq.travelType ? (
                        <span className="text-[length:var(--control-text-sm)] text-muted-foreground">
                          {inq.travelType}
                        </span>
                      ) : null}
                      {inq.budgetAmount != null && inq.budgetAmount !== '' ? (
                        <span className="tabular-nums text-[length:var(--control-text-sm)] text-muted-foreground">
                          {formatCurrency(inq.budgetAmount, {
                            currency: inq.budgetCurrency,
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {partyName ? (
        <section className="mt-4 space-y-1">
          <h3 className="text-[length:var(--control-text-sm)] font-medium uppercase tracking-wide text-muted-foreground">
            Customer
          </h3>
          <p className="text-[length:var(--control-text-sm)] font-medium">{partyName}</p>
        </section>
      ) : null}

      <RecordDialog
        open={!!taskDetail && !rescheduleOpen}
        onOpenChange={(open) => {
          if (!open) setTaskDetail(null);
        }}
        title={taskDetail ? displayTaskTitle(taskDetail.title) : 'Task'}
        description={leadTitle ? `Linked to ${leadTitle}` : 'What needs to be done next'}
        footer={
          taskDetail && taskDetail.status !== 'done' && canTaskWrite ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setTaskDetail(null)}
              >
                Close
              </Button>
              {onRescheduleTask ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setRescheduleOpen(true)}
                >
                  Reschedule
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const id = taskDetail.id;
                  const title = taskDetail.title;
                  setTaskDetail(null);
                  onCompleteTask(id, title);
                }}
              >
                Mark complete
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setTaskDetail(null)}>
              Close
            </Button>
          )
        }
      >
        {taskDetail ? (
          <div className="space-y-3">
            <dl className="space-y-2.5">
              <DetailRow label="Status">
                <StatusBadge value={taskDetail.status} showIcon />
              </DetailRow>
              <DetailRow label="Priority">
                <StatusBadge value={taskDetail.priority} showIcon />
              </DetailRow>
              <DetailRow label="Due">
                {taskDetail.dueAt
                  ? `${formatDate(taskDetail.dueAt)}${
                      formatTime(taskDetail.dueAt) ? ` · ${formatTime(taskDetail.dueAt)}` : ''
                    }`
                  : '—'}
              </DetailRow>
              {taskDetail.description?.trim() ? (
                <DetailRow label="Notes">{taskDetail.description.trim()}</DetailRow>
              ) : null}
            </dl>
            <div className="rounded-lg border px-2.5 py-2 glass-row">
              <p className="text-[length:var(--control-text-sm)] font-medium uppercase tracking-wide text-muted-foreground">
                Customer
              </p>
              <p className="mt-0.5 text-[length:var(--control-text-sm)] font-medium">
                {contactName || partyName || 'No contact name'}
              </p>
              {phone ? (
                <p className="text-[length:var(--control-text-sm)] text-muted-foreground">{phone}</p>
              ) : null}
              {isCallTask(taskDetail.title) && phoneDigits ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="secondary" asChild>
                    <a href={`tel:${phoneDigits}`}>
                      <Phone className="size-[0.875em]" />
                      Call now
                    </a>
                  </Button>
                  <Button type="button" size="sm" variant="secondary" asChild>
                    <a
                      href={`https://wa.me/${phoneDigits}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-[0.875em]" />
                      WhatsApp
                    </a>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </RecordDialog>

      <RecordDialog
        open={!!taskDetail && rescheduleOpen}
        onOpenChange={(open) => {
          if (!open) setRescheduleOpen(false);
        }}
        title="Reschedule task"
        description={taskDetail ? displayTaskTitle(taskDetail.title) : undefined}
        submitLabel="Save date"
        submitting={rescheduleSaving}
        cancelLabel="Back"
        onSubmit={() => void saveReschedule()}
        submitDisabled={!rescheduleDue}
      >
        <div className="space-y-3">
          <SuggestionChips
            aria-label="New due date"
            options={followUpPresetOptions(
              reschedulePreset === 'custom' ? rescheduleDue : undefined,
            )}
            value={reschedulePreset}
            onChange={(preset) => {
              if (preset === 'custom') return;
              setReschedulePreset(preset || '');
              setRescheduleDue(preset ? followUpFromPreset(preset) : undefined);
            }}
          />
          <DatePicker
            size="sm"
            value={rescheduleDue}
            onChange={(due) => {
              if (!due) {
                setRescheduleDue(undefined);
                setReschedulePreset('');
                return;
              }
              const withTime = rescheduleDue
                ? applyTimeToDate(due, timeValueFromDate(rescheduleDue))
                : due;
              setRescheduleDue(withTime);
              setReschedulePreset('custom');
            }}
            disablePast
          />
          {rescheduleDue ? (
            <div className="space-y-1.5">
              <SuggestionChips
                aria-label="Due time"
                options={TASK_DUE_TIME_PRESETS.map((t) => ({
                  value: t.value,
                  label: t.label,
                }))}
                value={timeValueFromDate(rescheduleDue)}
                onChange={(hhmm) => {
                  if (hhmm) setRescheduleDue(applyTimeToDate(rescheduleDue, hhmm));
                }}
              />
              <TimePicker
                size="sm"
                value={timeValueFromDate(rescheduleDue)}
                onChange={(hhmm) => setRescheduleDue(applyTimeToDate(rescheduleDue, hhmm))}
                minuteStep={15}
              />
            </div>
          ) : null}
        </div>
      </RecordDialog>
    </aside>
  );
}
