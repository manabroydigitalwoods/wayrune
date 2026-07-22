import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { ClipboardList, GitMerge, Link2, ListTodo, MoreHorizontal, Pencil, UserPlus, UserRoundCog, Users } from 'lucide-react';
import {
  Button,
  Combobox,
  ConfirmDialog,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmailInput,
  EntityCombobox,
  Input,
  PageSkeleton,
  PhoneInput,
  RecordDialog,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  TimePicker,
  toastError,
  toastSuccess,
  usePageChrome,
  statusMeta,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { QUEUE_MENU_ITEM_CLASS } from '../components/queue';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import {
  applyTimeToDate,
  followUpFromPreset,
  followUpPresetOptions,
  presetFromFollowUp,
  TASK_DUE_TIME_PRESETS,
  timeValueFromDate,
} from '../lib/leadFollowUpPresets';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { LeadAboutPanel } from '../components/leads/LeadAboutPanel';
import { LeadAssociationsPanel } from '../components/leads/LeadAssociationsPanel';
import { LeadActivityTimeline } from '../components/leads/LeadActivityTimeline';
import { LogActivityComposer } from '../components/leads/LogActivityComposer';
import { InquiryCreateSheet } from '../components/inquiries/InquiryCreateSheet';
import {
  DETAIL_CRM_GRID,
  DETAIL_CRM_STACK,
  DETAIL_PANEL_SHELL,
  DetailActionStrip,
  DetailMobileSection,
  DetailPageShell,
} from '../components/detail';

type PipelineStage = { key: string; name: string; isLost?: boolean; isWon?: boolean };

/** Lead-page task presets (agency sales follow-ups). */
const TASK_TITLE_PRESETS = [
  'Call customer',
  'Send quotation',
  'Collect requirements',
  'Schedule follow-up',
  'Follow up payment',
  'Call supplier',
] as const;

const emptyTaskForm = () => ({
  title: '',
  priority: 'normal',
  dueAt: undefined as Date | undefined,
  duePreset: '' as string,
  description: '',
  detailsOpen: false,
});

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
  const [linkPartyOpen, setLinkPartyOpen] = useState(false);
  const [linkPartyId, setLinkPartyId] = useState('');
  const [linkPartyLabel, setLinkPartyLabel] = useState('');
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
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [taskNextOpen, setTaskNextOpen] = useState(false);
  const [completedTaskTitle, setCompletedTaskTitle] = useState('');

  useDocumentTitle(lead?.title ? `Lead · ${lead.title}` : 'Lead');

  usePageChrome({
    title: lead?.title ?? 'Lead',
    titleMeta: lead?.phone || lead?.email || undefined,
    icon: Users,
    breadcrumbs: lead
      ? [
          { label: 'Leads', onClick: () => navigate('/leads') },
          { label: lead.title },
        ]
      : [{ label: 'Leads', onClick: () => navigate('/leads') }],
  });

  const { has } = usePermissions();
  const canTasks = has('task.read');

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
    if (!taskForm.title.trim()) {
      toastError('Enter what needs to be done');
      return;
    }
    setSaving(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskForm.title.trim(),
          priority: taskForm.priority,
          dueAt: taskForm.dueAt?.toISOString(),
          description: taskForm.description.trim() || null,
          entityType: 'lead',
          entityId: id,
        }),
      });
      toastSuccess('Task created');
      setTaskForm(emptyTaskForm());
      setTaskOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create task');
    } finally {
      setSaving(false);
    }
  }

  async function rescheduleTask(taskId: string, dueAt: Date) {
    try {
      await api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ dueAt: dueAt.toISOString() }),
      });
      toastSuccess('Task rescheduled');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not reschedule task');
      throw e;
    }
  }

  function openNewTask() {
    const dueAt = lead?.followUpAt
      ? new Date(lead.followUpAt)
      : followUpFromPreset('tomorrow');
    setTaskForm({
      ...emptyTaskForm(),
      dueAt,
      duePreset: dueAt ? presetFromFollowUp(dueAt) : 'tomorrow',
    });
    setTaskOpen(true);
  }

  async function completeTask(taskId: string, title?: string) {
    try {
      await api(`/tasks/${taskId}/complete`, { method: 'POST' });
      setCompletedTaskTitle(title || 'Task');
      setTaskNextOpen(true);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not complete task');
    }
  }

  async function setNextFollowUp(preset: string | null, nextTitle?: string) {
    if (!id) return;
    try {
      if (preset) {
        const dueAt = followUpFromPreset(preset);
        await api(`/leads/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ followUpAt: dueAt?.toISOString() ?? null }),
        });
        if (nextTitle) {
          await api('/tasks', {
            method: 'POST',
            body: JSON.stringify({
              title: nextTitle,
              priority: 'normal',
              dueAt: dueAt?.toISOString(),
              entityType: 'lead',
              entityId: id,
            }),
          });
        }
        toastSuccess(nextTitle ? 'Next task scheduled' : 'Follow-up updated');
      } else {
        toastSuccess('Task completed');
      }
      setTaskNextOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not set next step');
    }
  }

  function patchTaskDue(next: Date | undefined, preset: string) {
    setTaskForm((f) => ({ ...f, dueAt: next, duePreset: preset }));
  }

  function patchTaskTime(hhmm: string) {
    setTaskForm((f) => {
      if (!f.dueAt) return f;
      const dueAt = applyTimeToDate(f.dueAt, hhmm);
      // Time tweak keeps named presets when still matching; else Custom.
      const duePreset =
        f.duePreset && f.duePreset !== 'custom' && presetFromFollowUp(dueAt) === f.duePreset
          ? f.duePreset
          : presetFromFollowUp(dueAt);
      return { ...f, dueAt, duePreset };
    });
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
        toastSuccess(`Created customer ${res.party.displayName}`);
      } else {
        toastSuccess(`Linked to ${res.party.displayName}`);
      }
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create customer');
    }
  }

  async function linkExistingCustomer() {
    if (!lead || !linkPartyId) {
      toastError('Select a customer');
      return;
    }
    setSaving(true);
    try {
      await api(`/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ partyId: linkPartyId }),
      });
      toastSuccess(`Linked to ${linkPartyLabel || 'customer'}`);
      setLinkPartyOpen(false);
      setLinkPartyId('');
      setLinkPartyLabel('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not link customer');
    } finally {
      setSaving(false);
    }
  }

  async function searchCustomers(q: string) {
    const res = await api<{ items: Array<{ id: string; displayName: string; email?: string | null; phone?: string | null }> }>(
      `/parties?pageSize=8&q=${encodeURIComponent(q.trim() || '')}`,
    );
    return res.items.map((p) => ({
      value: p.id,
      label: p.displayName,
      description: [p.phone, p.email].filter(Boolean).join(' · ') || undefined,
    }));
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
  if (!lead) return <PageSkeleton variant="detail" />;

  const stageOptions =
    (stages.length > 0
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
        ]
    ).map((s) => ({
      ...s,
      icon: statusMeta(s.value).Icon,
    }));

  const panelShell = DETAIL_PANEL_SHELL;
  const inquiries = Array.isArray(lead.inquiries) ? lead.inquiries : [];
  const primaryInquiry = inquiries[0] as { id: string; inquiryNumber?: string } | undefined;
  const nextOpenTask = [...tasks]
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    })[0] as { title: string; dueAt?: string | null } | undefined;

  return (
    <DetailPageShell>
      <DetailActionStrip>
          <StatusBadge value={lead.priority} showIcon />
          <Can
            anyOf={CAP.leadWrite}
            fallback={
              <StatusBadge
                value={lead.stage?.key || 'new'}
                label={lead.stage?.name}
                showIcon
              />
            }
          >
            <Combobox
              size="sm"
              className="w-48"
              contentClassName="min-w-[16rem]"
              value={lead.stage?.key || ''}
              onChange={(stageKey) => void move(stageKey)}
              options={stageOptions}
              placeholder="Stage"
            />
          </Can>
          <Can anyOf={CAP.inquiryWrite}>
            {primaryInquiry ? (
              <Button size="sm" onClick={() => navigate(`/inquiries/${primaryInquiry.id}`)}>
                <ClipboardList className="size-[0.875em]" />
                Open inquiry
              </Button>
            ) : (
              <Button size="sm" onClick={() => setInquiryOpen(true)}>
                <ClipboardList className="size-[0.875em]" />
                Create inquiry
              </Button>
            )}
          </Can>
          <Can anyOf={['lead.write', 'inquiry.write', 'lead.assign', 'task.write']}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-[var(--control-h-sm)]"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-[0.875em]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1">
                <Can anyOf={CAP.leadWrite}>
                  <DropdownMenuItem
                    className={QUEUE_MENU_ITEM_CLASS}
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil />
                    Edit lead
                  </DropdownMenuItem>
                  {lead.partyId || lead.party?.id ? (
                    <DropdownMenuItem disabled className={QUEUE_MENU_ITEM_CLASS}>
                      <Link2 />
                      Linked to {lead.party?.displayName || 'customer'}
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem
                        className={QUEUE_MENU_ITEM_CLASS}
                        onClick={() => void convertToClient()}
                      >
                        <UserPlus />
                        Create customer
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={QUEUE_MENU_ITEM_CLASS}
                        onClick={() => {
                          setLinkPartyId('');
                          setLinkPartyLabel('');
                          setLinkPartyOpen(true);
                        }}
                      >
                        <Link2 />
                        Link existing customer
                      </DropdownMenuItem>
                    </>
                  )}
                </Can>
                <Can anyOf={CAP.inquiryWrite}>
                  {primaryInquiry ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className={QUEUE_MENU_ITEM_CLASS}
                        onClick={() => setInquiryOpen(true)}
                      >
                        <ClipboardList />
                        New inquiry
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </Can>
                <Can anyOf={CAP.leadAssign}>
                  <DropdownMenuItem
                    className={QUEUE_MENU_ITEM_CLASS}
                    onClick={() => void openAssign()}
                  >
                    <UserRoundCog />
                    Assign owner
                  </DropdownMenuItem>
                </Can>
                <Can anyOf={CAP.leadWrite}>
                  <DropdownMenuItem
                    className={QUEUE_MENU_ITEM_CLASS}
                    onClick={() => void openMerge()}
                  >
                    <GitMerge />
                    Merge duplicate
                  </DropdownMenuItem>
                </Can>
                <Can anyOf={CAP.taskWrite}>
                  <DropdownMenuItem className={QUEUE_MENU_ITEM_CLASS} onClick={openNewTask}>
                    <ListTodo />
                    New task
                  </DropdownMenuItem>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
      </DetailActionStrip>

      <div className={DETAIL_CRM_GRID}>
        <LeadAboutPanel
          className={`${panelShell} max-h-full self-start overflow-y-auto`}
          lead={lead}
          onUpdated={load}
          nextTask={nextOpenTask ?? null}
          onCreateCustomer={() => void convertToClient()}
          onLinkExistingCustomer={() => {
            setLinkPartyId('');
            setLinkPartyLabel('');
            setLinkPartyOpen(true);
          }}
        />
        <LeadActivityTimeline
          className={`${panelShell} min-h-0`}
          leadId={lead.id}
          activities={lead.activities || []}
          activityContext={{
            sourceName: lead.source?.name,
            followUpAt: lead.followUpAt,
            channel: lead.channel,
          }}
          onLogNote={() => openLog('note')}
          onLogEmail={() => openLog('email')}
          onLogCall={() => openLog('call')}
          onCreateTask={openNewTask}
          onActivityUpdated={load}
        />
        <LeadAssociationsPanel
          className={`${panelShell} max-h-full self-start overflow-y-auto`}
          leadId={lead.id}
          leadTitle={lead.title}
          contactName={lead.contactName}
          phone={lead.phone}
          partyName={lead.party?.displayName}
          tasks={tasks}
          inquiries={lead.inquiries || []}
          onNewTask={openNewTask}
          onCreateInquiry={() => setInquiryOpen(true)}
          onCompleteTask={(taskId, title) => void completeTask(taskId, title)}
          onRescheduleTask={rescheduleTask}
        />
      </div>

      <div className={DETAIL_CRM_STACK}>
        <DetailMobileSection
          title="About this lead"
          open={aboutOpen}
          onOpenChange={setAboutOpen}
        >
          <LeadAboutPanel
            lead={lead}
            onUpdated={load}
            nextTask={nextOpenTask ?? null}
            onCreateCustomer={() => void convertToClient()}
            onLinkExistingCustomer={() => {
              setLinkPartyId('');
              setLinkPartyLabel('');
              setLinkPartyOpen(true);
            }}
            showHeader={false}
          />
        </DetailMobileSection>

        <LeadActivityTimeline
          className={`${panelShell} min-h-[50vh]`}
          leadId={lead.id}
          activities={lead.activities || []}
          activityContext={{
            sourceName: lead.source?.name,
            followUpAt: lead.followUpAt,
            channel: lead.channel,
          }}
          onLogNote={() => openLog('note')}
          onLogEmail={() => openLog('email')}
          onLogCall={() => openLog('call')}
          onCreateTask={openNewTask}
          onActivityUpdated={load}
        />

        <DetailMobileSection title="Related" open={assocOpen} onOpenChange={setAssocOpen}>
          <LeadAssociationsPanel
            leadId={lead.id}
            leadTitle={lead.title}
            contactName={lead.contactName}
            phone={lead.phone}
            partyName={lead.party?.displayName}
            tasks={tasks}
            inquiries={lead.inquiries || []}
            onNewTask={openNewTask}
            onCreateInquiry={() => setInquiryOpen(true)}
            onCompleteTask={(taskId, title) => void completeTask(taskId, title)}
            onRescheduleTask={rescheduleTask}
            showHeader={false}
          />
        </DetailMobileSection>
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

      <RecordDialog
        open={linkPartyOpen}
        onOpenChange={(open) => {
          setLinkPartyOpen(open);
          if (!open) {
            setLinkPartyId('');
            setLinkPartyLabel('');
          }
        }}
        title="Link existing customer"
        description="Connect this lead to a customer already in your directory."
        submitLabel="Link customer"
        submitting={saving}
        submitDisabled={!linkPartyId}
        onSubmit={() => void linkExistingCustomer()}
      >
        <FormField label="Customer" required>
          <EntityCombobox
            size="sm"
            value={linkPartyId}
            selectedLabel={linkPartyLabel}
            onChange={(id, option) => {
              setLinkPartyId(id);
              setLinkPartyLabel(option?.label || '');
            }}
            onSearch={searchCustomers}
            placeholder="Search customers…"
            emptyText="No customers match"
            clearable
          />
        </FormField>
      </RecordDialog>

      <InquiryCreateSheet
        open={inquiryOpen}
        onOpenChange={setInquiryOpen}
        defaults={{
          leadId: lead.id,
          leadTitle: lead.title,
          partyId: lead.party?.id || lead.partyId || undefined,
          partyLabel: lead.party?.displayName || undefined,
          contactName: lead.contactName || undefined,
          phone: lead.phone || undefined,
          email: lead.email || undefined,
          tags: Array.isArray(lead.tagsJson) ? (lead.tagsJson as string[]) : undefined,
          destinationText:
            typeof lead.customFieldsJson?.destinationText === 'string'
              ? lead.customFieldsJson.destinationText
              : undefined,
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
            inputSize="sm"
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
            size="sm"
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
            size="sm"
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
              inputSize="sm"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Contact name">
            <Input
              inputSize="sm"
              value={editForm.contactName}
              onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
              placeholder="Full name"
            />
          </FormField>
          <FormField label="Email">
            <EmailInput
              inputSize="sm"
              value={editForm.email}
              onChange={(email) => setEditForm({ ...editForm, email })}
              placeholder="name@…"
            />
          </FormField>
          <FormField label="Phone">
            <PhoneInput
              size="sm"
              value={editForm.phone}
              onChange={(phone) => setEditForm({ ...editForm, phone })}
            />
          </FormField>
          <FormField label="Priority" htmlFor="edit-priority">
            <Combobox
              size="sm"
              value={editForm.priority}
              onChange={(priority) => setEditForm({ ...editForm, priority })}
              options={[
                { value: 'low', label: 'Low', icon: statusMeta('low').Icon },
                { value: 'normal', label: 'Normal', icon: statusMeta('normal').Icon },
                { value: 'high', label: 'High', icon: statusMeta('high').Icon },
              ]}
            />
          </FormField>
          <FormField label="Follow-up date" htmlFor="edit-followup">
            <DatePicker
              size="sm"
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
        description={`Linked to ${lead.title}`}
        submitLabel="Add task"
        submitting={saving}
        onSubmit={createTask}
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void createTask();
          }}
          className="space-y-4"
        >
          <FormField label="What needs to be done?" required>
            <Input
              inputSize="sm"
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder="e.g. Call customer"
              required
            />
            <div className="mt-2">
              <SuggestionChips
                aria-label="Task presets"
                options={TASK_TITLE_PRESETS.map((t) => ({ value: t, label: t }))}
                value={
                  TASK_TITLE_PRESETS.includes(taskForm.title as (typeof TASK_TITLE_PRESETS)[number])
                    ? taskForm.title
                    : ''
                }
                onChange={(title) => setTaskForm({ ...taskForm, title })}
              />
            </div>
          </FormField>
          <FormField label="When?">
            <SuggestionChips
              aria-label="Due date"
              options={followUpPresetOptions(
                taskForm.duePreset === 'custom' ? taskForm.dueAt : undefined,
              )}
              value={taskForm.duePreset}
              onChange={(preset) => {
                if (preset === 'custom') return;
                patchTaskDue(preset ? followUpFromPreset(preset) : undefined, preset || '');
              }}
            />
            <div className="mt-2 space-y-2">
              <DatePicker
                size="sm"
                value={taskForm.dueAt}
                onChange={(dueAt) => {
                  if (!dueAt) {
                    patchTaskDue(undefined, '');
                    return;
                  }
                  // Keep existing time when picking a custom calendar day.
                  const withTime = taskForm.dueAt
                    ? applyTimeToDate(dueAt, timeValueFromDate(taskForm.dueAt))
                    : dueAt;
                  patchTaskDue(withTime, 'custom');
                }}
                disablePast
              />
              {taskForm.dueAt ? (
                <div className="space-y-1.5">
                  <SuggestionChips
                    aria-label="Due time"
                    options={TASK_DUE_TIME_PRESETS.map((t) => ({
                      value: t.value,
                      label: t.label,
                    }))}
                    value={timeValueFromDate(taskForm.dueAt)}
                    onChange={(hhmm) => {
                      if (hhmm) patchTaskTime(hhmm);
                    }}
                  />
                  <TimePicker
                    size="sm"
                    value={timeValueFromDate(taskForm.dueAt)}
                    onChange={patchTaskTime}
                    minuteStep={15}
                  />
                </div>
              ) : null}
            </div>
          </FormField>
          <FormField label="Priority" htmlFor="lead-task-priority">
            <Combobox
              size="sm"
              value={taskForm.priority}
              onChange={(priority) => setTaskForm({ ...taskForm, priority })}
              options={[
                { value: 'low', label: 'Low', icon: statusMeta('low').Icon },
                { value: 'normal', label: 'Normal', icon: statusMeta('normal').Icon },
                { value: 'high', label: 'High', icon: statusMeta('high').Icon },
              ]}
            />
          </FormField>
          {taskForm.detailsOpen ? (
            <FormField label="Notes">
              <Input
                inputSize="sm"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Optional details for the team"
              />
            </FormField>
          ) : (
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => setTaskForm({ ...taskForm, detailsOpen: true })}
            >
              + Add notes
            </button>
          )}
        </form>
      </RecordSheet>

      <RecordDialog
        open={taskNextOpen}
        onOpenChange={setTaskNextOpen}
        title="Task completed"
        description={
          completedTaskTitle
            ? `${completedTaskTitle} is done. What happens next?`
            : 'What happens next?'
        }
        hideFooter
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void setNextFollowUp('tomorrow', 'Call customer')}
            >
              Follow up tomorrow
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void setNextFollowUp('in_3_days', 'Send quotation')}
            >
              Send quotation
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void setNextFollowUp(null)}
            >
              No follow-up
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Next follow-up on this lead was cleared. Choose a next step or leave it clear.
        </p>
      </RecordDialog>
    </DetailPageShell>
  );
}
