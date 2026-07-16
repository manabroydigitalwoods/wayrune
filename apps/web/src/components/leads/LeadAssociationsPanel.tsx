import { useNavigate } from 'react-router-dom';
import { CheckSquare, ClipboardList, Plus } from 'lucide-react';
import {
  Button,
  RecordDialog,
  StatusBadge,
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@travel/ui';
import { useState } from 'react';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { inquiryStatusLabel } from '../../lib/agencyStatusLabels';
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
  partyName?: string | null;
  tasks: LeadTask[];
  inquiries: LeadInquiry[];
  onNewTask: () => void;
  onCreateInquiry: () => void;
  onCompleteTask: (taskId: string) => void;
  className?: string;
  showHeader?: boolean;
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-foreground">{children}</dd>
    </div>
  );
}

export function LeadAssociationsPanel({
  partyName,
  tasks,
  inquiries,
  onNewTask,
  onCreateInquiry,
  onCompleteTask,
  className,
  showHeader = true,
}: LeadAssociationsPanelProps) {
  const navigate = useNavigate();
  const { hasAny } = usePermissions();
  const canTaskWrite = hasAny(CAP.taskWrite);
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const [taskDetail, setTaskDetail] = useState<LeadTask | null>(null);

  return (
    <aside className={className}>
      {showHeader ? (
        <h2 className="font-display text-base font-semibold tracking-tight">Associations</h2>
      ) : null}

      <section className={showHeader ? 'mt-4 space-y-2' : 'space-y-2'}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tasks
          </h3>
          <Can anyOf={CAP.taskWrite}>
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onNewTask}>
              <Plus className="size-3.5" />
              New
            </Button>
          </Can>
        </div>
        {openTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open tasks</p>
        ) : (
          <ul className="space-y-2">
            {openTasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => setTaskDetail(task)}
                  className={cn(
                    'w-full rounded-xl border px-2.5 py-2 text-left transition-colors glass-row hover:border-primary/25',
                    'hover:border-primary/30 hover:bg-accent/30',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <CheckSquare className="size-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug">{task.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <StatusBadge value={task.priority} showIcon />
                        {task.dueAt ? (
                          <span className="text-[11px] text-muted-foreground">
                            Due {formatDate(task.dueAt)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Inquiries
          </h3>
          <Can anyOf={CAP.inquiryWrite}>
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onCreateInquiry}>
              <Plus className="size-3.5" />
              Create
            </Button>
          </Can>
        </div>
        {inquiries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inquiries yet</p>
        ) : (
          <ul className="space-y-2">
            {inquiries.map((inq) => (
              <li key={inq.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/inquiries/${inq.id}`)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors glass-row hover:border-primary/25',
                    'hover:border-primary/30 hover:bg-accent/30',
                  )}
                >
                  <ClipboardList className="size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{inq.inquiryNumber}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge value={inq.status} label={inquiryStatusLabel(inq.status)} showIcon />
                      {inq.travelType ? (
                        <span className="text-[11px] text-muted-foreground">{inq.travelType}</span>
                      ) : null}
                      {inq.budgetAmount != null && inq.budgetAmount !== '' ? (
                        <span className="text-[11px] tabular-nums text-muted-foreground">
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
        <section className="mt-5 space-y-1">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Client
          </h3>
          <p className="text-sm font-medium">{partyName}</p>
        </section>
      ) : null}

      <RecordDialog
        open={!!taskDetail}
        onOpenChange={(open) => {
          if (!open) setTaskDetail(null);
        }}
        title={taskDetail?.title || 'Task'}
        description="Task details"
        cancelLabel="Close"
        submitLabel={
          taskDetail && taskDetail.status !== 'done' && canTaskWrite ? 'Mark complete' : undefined
        }
        onSubmit={
          taskDetail && taskDetail.status !== 'done' && canTaskWrite
            ? () => {
                const id = taskDetail.id;
                setTaskDetail(null);
                onCompleteTask(id);
              }
            : undefined
        }
      >
        {taskDetail ? (
          <dl className="space-y-2.5">
            <DetailRow label="Status">
              <StatusBadge value={taskDetail.status} showIcon />
            </DetailRow>
            <DetailRow label="Priority">
              <StatusBadge value={taskDetail.priority} showIcon />
            </DetailRow>
            <DetailRow label="Due">
              {taskDetail.dueAt ? formatDate(taskDetail.dueAt) : '—'}
            </DetailRow>
            <DetailRow label="Description">
              {taskDetail.description?.trim() || '—'}
            </DetailRow>
            <DetailRow label="Created">
              {taskDetail.createdAt
                ? formatDateTime(taskDetail.createdAt)
                : '—'}
            </DetailRow>
          </dl>
        ) : null}
      </RecordDialog>
    </aside>
  );
}
