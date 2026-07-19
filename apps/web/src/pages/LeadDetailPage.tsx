import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { ChevronDown, MoreHorizontal, UserPlus, Users } from 'lucide-react';
import {
  Breadcrumbs,
  Button,
  Combobox,
  ConfirmDialog,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmailInput,
  Input,
  PageHeader,
  PhoneInput,
  RecordDialog,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { LeadAboutPanel } from '../components/leads/LeadAboutPanel';
import { LeadAssociationsPanel } from '../components/leads/LeadAssociationsPanel';
import { LeadActivityTimeline } from '../components/leads/LeadActivityTimeline';
import { LogActivityComposer } from '../components/leads/LogActivityComposer';
import { InquiryCreateSheet } from '../components/inquiries/InquiryCreateSheet';

type PipelineStage = { key: string; name: string; isLost?: boolean; isWon?: boolean };

export function LeadDetailPage() {
  const { id } = useParams();
  const { navigate } = useOrgNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lead, setLead] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingStageKey, setPendingStageKey] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [members, setMembers] = useState<Array<{ id: string; fullName: string; email: string }>>([]);
  const [assignOwnerId, setAssignOwnerId] = useState('');
  const [mergeSecondaryId, setMergeSecondaryId] = useState('');
  const [mergeCandidates, setMergeCandidates] = useState<
    Array<{ id: string; title: string; email?: string | null; phone?: string | null }>
  >([]);
  const [logType, setLogType] = useState<'note' | 'email' | 'call'>('note');
  const [saving, setSaving] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(true);
  const [assocOpen, setAssocOpen] = useState(true);
  const [editForm, setEditForm] = useState({
    title: '',
    contactName: '',
    email: '',
    phone: '',
    priority: 'normal',
    followUpAt: undefined as Date | undefined,
  });
  const [taskForm, setTaskForm] = useState({
    title: '',
    priority: 'normal',
    dueAt: undefined as Date | undefined,
  });

  useDocumentTitle(lead?.title ? `Lead · ${lead.title}` : 'Lead');

  const { has, hasAny } = usePermissions();
  const canTasks = has('task.read');
  const canLeadWrite = hasAny(CAP.leadWrite);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [leadRes, boardRes] = await Promise.all([
        api<any>(`/leads/${id}`),
        api<{ pipeline?: { stages?: PipelineStage[] } }>(`/leads/board?pageSize=1`),
      ]);
      setLead(leadRes);
      setStages(boardRes.pipeline?.stages ?? []);
      if (canTasks) {
        const taskRes = await api<any[]>(
          `/tasks?entityType=lead&entityId=${encodeURIComponent(id)}`,
        ).catch(() => [] as any[]);
        setTasks(taskRes);
      } else {
        setTasks([]);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }, [id, canTasks]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lead) return;
    setEditForm({
      title: lead.title || '',
      contactName: lead.contactName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      priority: lead.priority || 'normal',
      followUpAt: lead.followUpAt ? new Date(lead.followUpAt) : undefined,
    });
  }, [lead]);

  useEffect(() => {
    if (!lead) return;
    if (searchParams.get('createInquiry') !== '1') return;
    setInquiryOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('createInquiry');
    setSearchParams(next, { replace: true });
  }, [lead, searchParams, setSearchParams]);

  async function move(stageKey: string, lostReasonValue?: string) {
    const stageMeta = stages.find((s) => s.key === stageKey);
    const requiresLost = Boolean(stageMeta?.isLost || stageKey === 'lost');

    if (requiresLost && !lostReasonValue?.trim()) {
      setPendingStageKey(stageKey);
      setLostReason('');
      setLostOpen(true);
      return;
    }

    try {
      await api(`/leads/${id}/stage`, {
        method: 'POST',
        body: JSON.stringify({
          stageKey,
          ...(requiresLost ? { lostReason: lostReasonValue } : {}),
        }),
      });
      toastSuccess(requiresLost ? 'Lead marked Lost' : 'Stage updated');
      setLostOpen(false);
      setPendingStageKey(null);
      setLostReason('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update stage');
    }
  }

  async function confirmLost() {
    if (!pendingStageKey) return;
    if (!lostReason.trim()) {
      toastError('Enter a lost reason');
      return;
    }
    await move(pendingStageKey, lostReason.trim());
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api(`/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title,
          contactName: editForm.contactName || null,
          email: editForm.email || null,
          phone: editForm.phone || null,
          priority: editForm.priority,
          followUpAt: editForm.followUpAt?.toISOString() ?? null,
        }),
      });
      toastSuccess('Lead updated');
      setEditOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update lead');
    } finally {
      setSaving(false);
    }
  }

  async function createTask() {
    setSaving(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskForm.title,
          priority: taskForm.priority,
          dueAt: taskForm.dueAt?.toISOString(),
          entityType: 'lead',
          entityId: id,
        }),
      });
      toastSuccess('Task created');
      setTaskForm({ title: '', priority: 'normal', dueAt: undefined });
      setTaskOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create task');
    } finally {
      setSaving(false);
    }
  }

  async function completeTask(taskId: string) {
    try {
      await api(`/tasks/${taskId}/complete`, { method: 'POST' });
      toastSuccess('Task completed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not complete task');
    }
  }

  function openLog(type: 'note' | 'email' | 'call') {
    setLogType(type);
    setLogOpen(true);
  }

  async function convertToClient() {
    if (!lead) return;
    if (lead.partyId || lead.party?.id) {
      toastSuccess(`Already linked to ${lead.party?.displayName || 'client'}`);
      return;
    }
    if (!lead.email && !lead.phone) {
      toastError('Add an email or phone on the lead first');
      return;
    }
    try {
      const res = await api<{
        party: { id: string; displayName: string };
        created: boolean;
        alreadyLinked: boolean;
      }>(`/leads/${lead.id}/convert-to-client`, { method: 'POST' });
      if (res.alreadyLinked) {
        toastSuccess(`Already linked to ${res.party.displayName}`);
      } else if (res.created) {
        toastSuccess(`Created client ${res.party.displayName}`);
      } else {
        toastSuccess(`Linked to ${res.party.displayName}`);
      }
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not convert to client');
    }
  }

  async function openAssign() {
    try {
      const list = await api<Array<{ id: string; fullName: string; email: string }>>(
        '/organizations/current/members',
      );
      setMembers(list);
      setAssignOwnerId(lead?.ownerId || lead?.owner?.id || list[0]?.id || '');
      setAssignOpen(true);
    } catch (e) {
      reportError(e, 'Could not load team members');
    }
  }

  async function assignLead() {
    if (!lead || !assignOwnerId) return;
    setSaving(true);
    try {
      await api(`/leads/${lead.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ ownerId: assignOwnerId }),
      });
      toastSuccess('Lead assigned');
      setAssignOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not assign lead');
    } finally {
      setSaving(false);
    }
  }

  async function openMerge() {
    try {
      const res = await api<{
        items: Array<{ id: string; title: string; email?: string | null; phone?: string | null }>;
      }>('/leads?pageSize=50');
      setMergeCandidates(res.items.filter((l) => l.id !== lead?.id));
      setMergeSecondaryId('');
      setMergeOpen(true);
    } catch (e) {
      reportError(e, 'Could not load leads');
    }
  }

  async function mergeLead() {
    if (!lead || !mergeSecondaryId) {
      toastError('Pick a duplicate lead to merge');
      return;
    }
    setSaving(true);
    try {
      await api(`/leads/${lead.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ secondaryId: mergeSecondaryId }),
      });
      toastSuccess('Duplicate merged into this lead');
      setMergeOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not merge leads');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!lead) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const stageOptions =
    stages.length > 0
      ? stages.map((s) => ({ value: s.key, label: s.name }))
      : [
          { value: 'new', label: 'New' },
          { value: 'attempted_contact', label: 'Attempted Contact' },
          { value: 'contacted', label: 'Contacted' },
          { value: 'requirements_pending', label: 'Requirements Pending' },
          { value: 'qualified', label: 'Qualified' },
          { value: 'proposal_sent', label: 'Proposal Sent' },
          { value: 'negotiation', label: 'Negotiation' },
          { value: 'won', label: 'Won' },
          { value: 'lost', label: 'Lost' },
        ];

  const panelShell = 'rounded-xl border p-4 glass';

  return (
    <div className="relative flex h-[calc(100dvh-5.5rem)] min-h-0 flex-col md:h-[calc(100dvh-3.5rem)]">
      <Breadcrumbs
        items={[
          { label: 'Leads', onClick: () => navigate('/leads') },
          { label: lead.title },
        ]}
      />
      <PageHeader
        icon={Users}
        title={lead.title}
        subtitle={`${lead.contactName || 'No contact'} · ${lead.email || lead.phone || '—'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={lead.priority} showIcon size="md" />
            <StatusBadge
              value={lead.stage?.key || 'new'}
              label={lead.stage?.name}
              showIcon
              size="md"
            />
            <Can anyOf={CAP.leadWrite}>
              <Combobox
                className="w-52"
                contentClassName="min-w-[16rem]"
                value={lead.stage?.key || ''}
                onChange={(stageKey) => void move(stageKey)}
                options={stageOptions}
                placeholder="Change stage"
              />
            </Can>
            {canLeadWrite && !lead.partyId && !lead.party?.id ? (
              <Button variant="secondary" onClick={() => void convertToClient()}>
                <UserPlus className="size-4" />
                Convert to client
              </Button>
            ) : null}
            <Can anyOf={['lead.write', 'inquiry.write', 'lead.assign', 'task.write']}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="outline" aria-label="More actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <Can anyOf={CAP.leadWrite}>
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit lead</DropdownMenuItem>
                    {lead.partyId || lead.party?.id ? (
                      <DropdownMenuItem disabled>
                        Linked to {lead.party?.displayName || 'client'}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => void convertToClient()}>
                        Convert to client
                      </DropdownMenuItem>
                    )}
                  </Can>
                  <Can anyOf={CAP.inquiryWrite}>
                    <DropdownMenuItem onClick={() => setInquiryOpen(true)}>
                      Create inquiry
                    </DropdownMenuItem>
                  </Can>
                  <Can anyOf={CAP.leadAssign}>
                    <DropdownMenuItem onClick={() => void openAssign()}>Assign owner</DropdownMenuItem>
                  </Can>
                  <Can anyOf={CAP.leadWrite}>
                    <DropdownMenuItem onClick={() => void openMerge()}>Merge duplicate</DropdownMenuItem>
                  </Can>
                  <Can anyOf={CAP.taskWrite}>
                    <DropdownMenuItem onClick={() => setTaskOpen(true)}>New task</DropdownMenuItem>
                  </Can>
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
          </div>
        }
      />

      <div className="mt-1 hidden min-h-0 flex-1 gap-3 lg:grid lg:grid-cols-[272px_minmax(0,1fr)_288px]">
        <LeadAboutPanel
          className={`${panelShell} max-h-full self-start overflow-y-auto`}
          lead={lead}
          onUpdated={load}
        />
        <LeadActivityTimeline
          className={`${panelShell} min-h-0`}
          leadId={lead.id}
          activities={lead.activities || []}
          onLogNote={() => openLog('note')}
          onLogEmail={() => openLog('email')}
          onLogCall={() => openLog('call')}
          onActivityUpdated={load}
        />
        <LeadAssociationsPanel
          className={`${panelShell} max-h-full self-start overflow-y-auto`}
          leadId={lead.id}
          partyName={lead.party?.displayName}
          tasks={tasks}
          inquiries={lead.inquiries || []}
          onNewTask={() => setTaskOpen(true)}
          onCreateInquiry={() => setInquiryOpen(true)}
          onCompleteTask={(taskId) => void completeTask(taskId)}
        />
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:hidden">
        <div className={panelShell}>
          <button
            type="button"
            className="flex w-full items-center justify-between font-display text-base font-semibold"
            onClick={() => setAboutOpen((v) => !v)}
            aria-expanded={aboutOpen}
          >
            About this lead
            <ChevronDown
              className={`size-4 transition-transform ${aboutOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {aboutOpen ? (
            <div className="pt-3">
              <LeadAboutPanel lead={lead} onUpdated={load} showHeader={false} />
            </div>
          ) : null}
        </div>

        <LeadActivityTimeline
          className={`${panelShell} min-h-[50vh]`}
          leadId={lead.id}
          activities={lead.activities || []}
          onLogNote={() => openLog('note')}
          onLogEmail={() => openLog('email')}
          onLogCall={() => openLog('call')}
          onActivityUpdated={load}
        />

        <div className={panelShell}>
          <button
            type="button"
            className="flex w-full items-center justify-between font-display text-base font-semibold"
            onClick={() => setAssocOpen((v) => !v)}
            aria-expanded={assocOpen}
          >
            Associations
            <ChevronDown
              className={`size-4 transition-transform ${assocOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {assocOpen ? (
            <div className="pt-3">
              <LeadAssociationsPanel
                leadId={lead.id}
                partyName={lead.party?.displayName}
                tasks={tasks}
                inquiries={lead.inquiries || []}
                onNewTask={() => setTaskOpen(true)}
                onCreateInquiry={() => setInquiryOpen(true)}
                onCompleteTask={(taskId) => void completeTask(taskId)}
                showHeader={false}
              />
            </div>
          ) : null}
        </div>
      </div>

      <LogActivityComposer
        open={logOpen}
        onOpenChange={setLogOpen}
        leadId={lead.id}
        defaultType={logType}
        onLogged={async () => {
          toastSuccess('Activity logged');
          await load();
        }}
      />

      <InquiryCreateSheet
        open={inquiryOpen}
        onOpenChange={setInquiryOpen}
        defaults={{
          leadId: lead.id,
          partyId: lead.party?.id || lead.partyId || undefined,
          partyLabel: lead.party?.displayName || undefined,
        }}
        onCreated={(inquiry) => navigate(`/inquiries/${inquiry.id}`)}
      />

      <RecordDialog
        open={lostOpen}
        onOpenChange={(next) => {
          setLostOpen(next);
          if (!next) {
            setPendingStageKey(null);
            setLostReason('');
          }
        }}
        title="Mark lead as Lost"
        description="Tell the team why this opportunity closed without a sale."
        submitLabel="Mark Lost"
        onSubmit={() => void confirmLost()}
      >
        <FormField label="Lost reason" required>
          <Input
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="e.g. Budget too low, chose competitor…"
            autoFocus
          />
        </FormField>
      </RecordDialog>

      <RecordDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Assign lead"
        description={`Currently owned by ${lead.owner?.fullName || 'Unassigned'}.`}
        submitLabel="Assign"
        submitting={saving}
        onSubmit={() => void assignLead()}
      >
        <FormField label="Owner" required>
          <Combobox
            value={assignOwnerId}
            onChange={setAssignOwnerId}
            options={members.map((m) => ({
              value: m.id,
              label: m.fullName,
              description: m.email,
            }))}
            placeholder="Select teammate"
          />
        </FormField>
      </RecordDialog>

      <RecordDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        title="Merge duplicate"
        description="Activities and inquiries from the duplicate move into this lead. The duplicate is soft-deleted."
        submitLabel="Merge"
        submitting={saving}
        onSubmit={() => void mergeLead()}
      >
        <FormField label="Duplicate lead" required>
          <Combobox
            value={mergeSecondaryId}
            onChange={setMergeSecondaryId}
            options={mergeCandidates.map((l) => ({
              value: l.id,
              label: l.title,
              description: [l.email, l.phone].filter(Boolean).join(' · ') || undefined,
            }))}
            placeholder="Select lead to merge in"
          />
        </FormField>
      </RecordDialog>

      <RecordSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit lead"
        submitLabel="Save changes"
        submitting={saving}
        onSubmit={saveEdit}
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <FormField label="Title" required>
            <Input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Contact name">
            <Input
              value={editForm.contactName}
              onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
              placeholder="Full name"
            />
          </FormField>
          <FormField label="Email">
            <EmailInput
              value={editForm.email}
              onChange={(email) => setEditForm({ ...editForm, email })}
              placeholder="name@…"
            />
          </FormField>
          <FormField label="Phone">
            <PhoneInput
              value={editForm.phone}
              onChange={(phone) => setEditForm({ ...editForm, phone })}
            />
          </FormField>
          <FormField label="Priority" htmlFor="edit-priority">
            <Combobox
              value={editForm.priority}
              onChange={(priority) => setEditForm({ ...editForm, priority })}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
              ]}
            />
          </FormField>
          <FormField label="Follow-up date" htmlFor="edit-followup">
            <DatePicker
              value={editForm.followUpAt}
              onChange={(followUpAt) => setEditForm({ ...editForm, followUpAt })}
              disablePast
            />
          </FormField>
        </form>
      </RecordSheet>

      <RecordSheet
        open={taskOpen}
        onOpenChange={setTaskOpen}
        title="New task"
        description={`Linked to lead: ${lead.title}`}
        submitLabel="Add task"
        submitting={saving}
        onSubmit={createTask}
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void createTask();
          }}
        >
          <FormField label="Task" required>
            <Input
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder="e.g. Call client about dates"
              required
            />
          </FormField>
          <FormField label="Priority" htmlFor="lead-task-priority">
            <Combobox
              value={taskForm.priority}
              onChange={(priority) => setTaskForm({ ...taskForm, priority })}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
              ]}
            />
          </FormField>
          <FormField label="Due date" htmlFor="lead-task-due">
            <DatePicker
              value={taskForm.dueAt}
              onChange={(dueAt) => setTaskForm({ ...taskForm, dueAt })}
              disablePast
            />
          </FormField>
        </form>
      </RecordSheet>
    </div>
  );
}
