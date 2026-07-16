import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox, MessagesSquare, MoreHorizontal, Phone, Plus, Sparkles } from 'lucide-react';
import {
  Button,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityCombobox,
  Input,
  ListPageShell,
  PageHeader,
  PhoneInput,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  cn,
  formatDateTime,
  isPhoneFormatOk,
  splitPhone,
  toastError,
  toastSuccess,
  type ComboboxOption,
} from '@travel/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTravelRequestLauncher } from '../lib/travelRequestLauncher';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { reportError } from '../lib/errors';

type InboxRow = {
  id: string;
  channel: string;
  acquisitionSourceKey?: string | null;
  outcome: string;
  unread: boolean;
  summary?: string | null;
  occurredAt: string;
  staffUserId?: string | null;
  inquiryId?: string | null;
  rawPayloadJson?: { campaignId?: string; direction?: string } | null;
  party?: { id: string; displayName: string; phone?: string | null } | null;
  lead?: {
    id: string;
    title: string;
    channel?: string | null;
    source?: { key: string; name: string } | null;
  } | null;
};

type ThreadRow = {
  key: string;
  conversationId?: string;
  partyId: string | null;
  label: string;
  channel: string;
  lastSummary: string | null;
  lastAt: string;
  unreadCount: number;
  pendingCount: number;
  messageCount: number;
  travelRequestCount?: number;
  status?: string;
  journeyPath?: string[];
};

type ConversationDetail = {
  id: string;
  status: string;
  subject?: string | null;
  assignedUserId?: string | null;
  party?: {
    id: string;
    displayName: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  inquiries: Array<{
    id: string;
    inquiryNumber: string;
    status: string;
    destinationsJson?: unknown;
    createdAt: string;
  }>;
  journeyPath: string[];
};

type ThreadMessage = InboxRow & { direction: 'inbound' | 'outbound' };

const REPLYABLE_CHANNELS = new Set(['whatsapp', 'email', 'instagram']);

function replyEndpoint(channel: string, interactionId: string) {
  if (channel === 'email') return `/leads/email/reply/${interactionId}`;
  if (channel === 'instagram') return `/leads/instagram/reply/${interactionId}`;
  return `/leads/whatsapp/reply/${interactionId}`;
}

const CHANNEL_FILTERS = [
  { value: '', label: 'All' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-ins' },
  { value: 'import', label: 'Imports' },
  { value: 'email', label: 'Email' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'api', label: 'API' },
] as const;

const QUEUE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'assigned', label: 'Assigned to me' },
  { value: 'waiting', label: 'Waiting reply' },
  { value: 'follow_up', label: 'Follow-up due' },
] as const;

const LOG_CHANNELS = [
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'email', label: 'Email' },
] as const;

const ACQUISITION_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'referral', label: 'Friend' },
  { value: 'existing_customer', label: 'Existing customer' },
  { value: 'unknown', label: "Don't know" },
] as const;

function channelLabel(channel: string) {
  const hit = CHANNEL_FILTERS.find((c) => c.value === channel);
  return hit?.label || channel.replace(/_/g, ' ');
}

function outcomeLabel(outcome: string) {
  switch (outcome) {
    case 'created_travel_request':
      return 'Travel request';
    case 'attached_existing':
      return 'Attached';
    case 'follow_up':
      return 'Follow-up';
    case 'spam':
      return 'Spam';
    case 'no_interest':
      return 'No interest';
    default:
      return 'Pending';
  }
}

type ResolveMode = 'attach' | 'follow_up' | null;

export function InboxPage() {
  useDocumentTitle('Inbox');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openTravelRequest = useTravelRequestLauncher();
  const channelFromUrl = searchParams.get('channel') || '';
  const [channel, setChannel] = useState(channelFromUrl);
  const [ownership, setOwnership] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [items, setItems] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acquisitionOptions, setAcquisitionOptions] = useState(
    ACQUISITION_OPTIONS as ReadonlyArray<{ value: string; label: string }>,
  );
  const [members, setMembers] = useState<Array<{ id: string; fullName: string }>>([]);
  const [replyRow, setReplyRow] = useState<InboxRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySaving, setReplySaving] = useState(false);
  const [assignRow, setAssignRow] = useState<InboxRow | null>(null);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const [analytics, setAnalytics] = useState<{
    total: number;
    unread: number;
    byChannel: Array<{ channel: string; count: number }>;
  } | null>(null);

  const [view, setView] = useState<'inbox' | 'threads'>('threads');
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [activeThreadKey, setActiveThreadKey] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadMessagesLoading, setThreadMessagesLoading] = useState(false);
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [queue, setQueue] = useState<'all' | 'assigned' | 'waiting' | 'follow_up'>('all');
  const [channelUnread, setChannelUnread] = useState<Array<{ channel: string; unread: number }>>(
    [],
  );
  const [journeys, setJourneys] = useState<
    Array<{ path: string; count: number; converted: number }>
  >([]);
  const [connectorCaps, setConnectorCaps] = useState<
    Record<string, { reply?: boolean; templates?: boolean }>
  >({});
  const [summarizing, setSummarizing] = useState(false);
  const [threadSummary, setThreadSummary] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logSaving, setLogSaving] = useState(false);
  const [logForm, setLogForm] = useState({
    channel: 'whatsapp' as (typeof LOG_CHANNELS)[number]['value'],
    contactName: '',
    contactPhone: '',
    summary: '',
    acquisitionKey: '' as string,
    partyId: '',
    partyLabel: '',
  });
  const [partyMatch, setPartyMatch] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  const matchRequestId = useRef(0);

  const [resolveRow, setResolveRow] = useState<InboxRow | null>(null);
  const [resolveMode, setResolveMode] = useState<ResolveMode>(null);
  const [resolveSaving, setResolveSaving] = useState(false);
  const [attachInquiryId, setAttachInquiryId] = useState('');
  const [attachInquiryLabel, setAttachInquiryLabel] = useState('');
  const [followUpAt, setFollowUpAt] = useState<Date | undefined>(undefined);
  const [followNote, setFollowNote] = useState('');

  useEffect(() => {
    const next = searchParams.get('channel') || '';
    setChannel(next);
  }, [searchParams]);

  function selectChannel(value: string) {
    setChannel(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set('channel', value);
    else next.delete('channel');
    setSearchParams(next, { replace: true });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '50' });
      if (channel) params.set('channel', channel);
      if (unreadOnly) params.set('unread', '1');
      if (pendingOnly) params.set('outcome', 'pending');
      if (ownership !== 'all') params.set('ownership', ownership);
      const res = await api<{ items: InboxRow[] }>(`/interactions?${params}`);
      setItems(res.items);
    } catch (e) {
      reportError(e, 'Could not load inbox');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [channel, unreadOnly, pendingOnly, ownership]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{
      total: number;
      unread: number;
      byChannel: Array<{ channel: string; count: number }>;
    }>('/interactions/analytics/summary')
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
    api<Array<{ key: string; name: string }>>('/lead-sources')
      .then((rows) => {
        if (rows.length) {
          setAcquisitionOptions(rows.map((r) => ({ value: r.key, label: r.name })));
        }
      })
      .catch(() => undefined);
    api<Array<{ id: string; fullName: string }>>('/organizations/current/members')
      .then(setMembers)
      .catch(() => setMembers([]));
    api<{ settingsJson?: unknown }>('/organizations/current')
      .then((org) => {
        const settings =
          org.settingsJson && typeof org.settingsJson === 'object'
            ? (org.settingsJson as Record<string, unknown>)
            : {};
        const integrations =
          settings.integrations && typeof settings.integrations === 'object'
            ? (settings.integrations as Record<string, unknown>)
            : {};
        const wa =
          integrations.whatsapp && typeof integrations.whatsapp === 'object'
            ? (integrations.whatsapp as Record<string, unknown>)
            : {};
        const fb =
          integrations.facebook && typeof integrations.facebook === 'object'
            ? (integrations.facebook as Record<string, unknown>)
            : {};
        setWhatsappEnabled(wa.enabled === true);
        setInstagramEnabled(fb.enabled === true && Boolean(fb.instagramBusinessAccountId));
      })
      .catch(() => {
        setWhatsappEnabled(false);
        setInstagramEnabled(false);
      });
    api<{ channels: Array<{ channel: string; unread: number }> }>('/interactions/channel-unread')
      .then((res) => setChannelUnread(res.channels))
      .catch(() => setChannelUnread([]));
    api<Record<string, { reply?: boolean; templates?: boolean }>>(
      '/interactions/connectors/capabilities',
    )
      .then(setConnectorCaps)
      .catch(() => setConnectorCaps({}));
    api<{ journeys: Array<{ path: string; count: number; converted: number }> }>(
      '/interactions/analytics/journeys',
    )
      .then((res) => setJourneys(res.journeys.slice(0, 5)))
      .catch(() => setJourneys([]));
  }, []);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '50' });
      if (channel) params.set('channel', channel);
      if (unreadOnly) params.set('unread', '1');
      if (ownership !== 'all') params.set('ownership', ownership);
      if (queue !== 'all') params.set('queue', queue);
      const res = await api<{ items: ThreadRow[] }>(`/interactions/threads?${params}`);
      setThreads(res.items);
    } catch (e) {
      reportError(e, 'Could not load conversations');
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }, [channel, unreadOnly, ownership, queue]);

  useEffect(() => {
    if (view === 'threads') void loadThreads();
  }, [view, loadThreads]);

  async function openThread(thread: ThreadRow) {
    setActiveThreadKey(thread.key);
    setThreadMessagesLoading(true);
    setThreadSummary(null);
    setConversationDetail(null);
    try {
      const res = await api<{ items: ThreadMessage[]; conversationId?: string | null }>(
        `/interactions/threads/${encodeURIComponent(thread.key)}`,
      );
      setThreadMessages(res.items);
      const convId = thread.conversationId || res.conversationId;
      if (convId) {
        const detail = await api<ConversationDetail>(`/interactions/conversations/${convId}`);
        setConversationDetail(detail);
      }
      void loadThreads();
      api<{ channels: Array<{ channel: string; unread: number }> }>('/interactions/channel-unread')
        .then((r) => setChannelUnread(r.channels))
        .catch(() => undefined);
    } catch (e) {
      reportError(e, 'Could not load conversation');
      setThreadMessages([]);
    } finally {
      setThreadMessagesLoading(false);
    }
  }

  async function summarizeActiveConversation() {
    if (!conversationDetail?.id) return;
    setSummarizing(true);
    try {
      const res = await api<{ summary: string }>('/assist/summarize', {
        method: 'POST',
        body: JSON.stringify({ conversationId: conversationDetail.id }),
      });
      setThreadSummary(res.summary);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not summarize');
    } finally {
      setSummarizing(false);
    }
  }

  async function logPhoneCall() {
    const notes = window.prompt('Call notes');
    if (!notes?.trim()) return;
    try {
      await api('/interactions/phone', {
        method: 'POST',
        body: JSON.stringify({
          summary: notes.trim(),
          direction: 'inbound',
          conversationId: conversationDetail?.id ?? null,
          partyId: conversationDetail?.party?.id ?? null,
          phone: conversationDetail?.party?.phone ?? null,
          contactName: conversationDetail?.party?.displayName ?? null,
        }),
      });
      toastSuccess('Phone call logged');
      if (activeThreadKey) {
        const thread = threads.find((t) => t.key === activeThreadKey);
        if (thread) await openThread(thread);
      }
      await loadThreads();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not log call');
    }
  }

  useEffect(() => {
    if (!logOpen || logForm.partyId) {
      setPartyMatch(null);
      return;
    }
    const phone = logForm.contactPhone.trim();
    if (!phone || !isPhoneFormatOk(phone)) {
      setPartyMatch(null);
      return;
    }
    const { national } = splitPhone(phone);
    const q = national || phone;
    const req = ++matchRequestId.current;
    const t = setTimeout(() => {
      void api<{ items: Array<{ id: string; displayName: string }> }>(
        `/parties?pageSize=5&q=${encodeURIComponent(q)}`,
      )
        .then((res) => {
          if (req !== matchRequestId.current) return;
          setPartyMatch(res.items[0] ?? null);
        })
        .catch(() => {
          if (req === matchRequestId.current) setPartyMatch(null);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [logOpen, logForm.contactPhone, logForm.partyId]);

  const subtitle = useMemo(() => {
    if (!analytics) return 'Inbound touches across phone, WhatsApp, web, and more.';
    return `${analytics.unread} unread · ${analytics.total} in last 30 days`;
  }, [analytics]);

  function startTravelRequest(row?: InboxRow) {
    const campaignId =
      row?.rawPayloadJson && typeof row.rawPayloadJson.campaignId === 'string'
        ? row.rawPayloadJson.campaignId
        : undefined;
    openTravelRequest(
      row
        ? {
            channelKey: row.channel || 'phone',
            interactionId: row.id,
            conversationId: conversationDetail?.id,
            partyId: row.party?.id,
            partyLabel: row.party?.displayName,
            campaignId,
          }
        : {
            channelKey: 'phone',
            conversationId: conversationDetail?.id,
          },
      { onCreated: () => void load() },
    );
  }

  async function markReadQuiet(id: string) {
    try {
      await api(`/interactions/${id}/read`, { method: 'POST' });
    } catch {
      /* non-blocking */
    }
  }

  async function openRow(row: InboxRow) {
    if (row.unread) void markReadQuiet(row.id);

    if (row.outcome === 'pending') {
      startTravelRequest(row);
      return;
    }

    if (row.inquiryId) {
      navigate(`/inquiries/${row.inquiryId}`);
      return;
    }
    if (row.party?.id) {
      navigate(`/parties/${row.party.id}`);
      return;
    }
    if (row.lead?.id) {
      navigate(`/leads/${row.lead.id}`);
      return;
    }
  }

  function openLogTouch() {
    setLogForm({
      channel: 'whatsapp',
      contactName: '',
      contactPhone: '',
      summary: '',
      acquisitionKey: '',
      partyId: '',
      partyLabel: '',
    });
    setPartyMatch(null);
    setLogOpen(true);
  }

  async function saveLogTouch() {
    setLogSaving(true);
    try {
      const summaryParts = [
        logForm.contactName.trim() || logForm.partyLabel.trim(),
        logForm.summary.trim(),
      ].filter(Boolean);
      await api('/interactions', {
        method: 'POST',
        body: JSON.stringify({
          channel: logForm.channel,
          outcome: 'pending',
          unread: true,
          partyId: logForm.partyId || null,
          acquisitionSourceKey:
            logForm.acquisitionKey && logForm.acquisitionKey !== 'unknown'
              ? logForm.acquisitionKey
              : logForm.acquisitionKey === 'unknown'
                ? 'unknown'
                : null,
          summary: summaryParts.join(' · ') || `${channelLabel(logForm.channel)} touch`,
        }),
      });
      toastSuccess('Touch logged');
      setLogOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not log touch');
    } finally {
      setLogSaving(false);
    }
  }

  function openAttach(row: InboxRow) {
    setResolveRow(row);
    setResolveMode('attach');
    setAttachInquiryId('');
    setAttachInquiryLabel('');
  }

  function openFollowUp(row: InboxRow) {
    setResolveRow(row);
    setResolveMode('follow_up');
    setFollowUpAt(undefined);
    setFollowNote('');
  }

  async function searchInquiries(query: string): Promise<ComboboxOption[]> {
    const params = new URLSearchParams({ pageSize: '20' });
    if (query.trim()) params.set('q', query.trim());
    const res = await api<{
      items: Array<{
        id: string;
        inquiryNumber: string;
        party?: { displayName?: string } | null;
        destinationsJson?: unknown;
      }>;
    }>(`/inquiries?${params}`);
    return res.items.map((inq) => ({
      value: inq.id,
      label: [inq.inquiryNumber, inq.party?.displayName].filter(Boolean).join(' · '),
    }));
  }

  async function submitResolve() {
    if (!resolveRow || !resolveMode) return;
    setResolveSaving(true);
    try {
      if (resolveMode === 'attach') {
        if (!attachInquiryId) {
          toastError('Select an inquiry');
          return;
        }
        await api(`/interactions/${resolveRow.id}/resolve`, {
          method: 'POST',
          body: JSON.stringify({
            outcome: 'attached_existing',
            inquiryId: attachInquiryId,
          }),
        });
        toastSuccess('Attached to existing request');
      } else {
        await api(`/interactions/${resolveRow.id}/resolve`, {
          method: 'POST',
          body: JSON.stringify({
            outcome: 'follow_up',
            followUpAt: followUpAt?.toISOString() ?? null,
            summary: followNote.trim() || null,
          }),
        });
        toastSuccess('Follow-up scheduled');
      }
      setResolveMode(null);
      setResolveRow(null);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not resolve');
    } finally {
      setResolveSaving(false);
    }
  }

  async function dismiss(row: InboxRow, outcome: 'spam' | 'no_interest') {
    const label = outcome === 'spam' ? 'spam' : 'no interest';
    if (!window.confirm(`Mark this touch as ${label}?`)) return;
    try {
      await api(`/interactions/${row.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      });
      toastSuccess(outcome === 'spam' ? 'Marked as spam' : 'Marked no interest');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update');
    }
  }

  async function claimRow(row: InboxRow) {
    try {
      await api(`/interactions/${row.id}/claim`, { method: 'POST' });
      toastSuccess('Claimed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not claim');
    }
  }

  async function assignRowTo(staffUserId: string) {
    if (!assignRow) return;
    try {
      await api(`/interactions/${assignRow.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ staffUserId }),
      });
      toastSuccess('Assigned');
      setAssignRow(null);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not assign');
    }
  }

  async function sendReply() {
    if (!replyRow || !replyText.trim()) return;
    setReplySaving(true);
    try {
      await api(replyEndpoint(replyRow.channel, replyRow.id), {
        method: 'POST',
        body: JSON.stringify({ text: replyText.trim() }),
      });
      toastSuccess('Reply sent');
      setReplyRow(null);
      setReplyText('');
      await load();
      if (view === 'threads') await loadThreads();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send reply');
    } finally {
      setReplySaving(false);
    }
  }

  async function rewriteReply() {
    if (!replyText.trim()) return;
    setRewriting(true);
    try {
      const res = await api<{ text: string }>('/assist/rewrite', {
        method: 'POST',
        body: JSON.stringify({ text: replyText.trim() }),
      });
      setReplyText(res.text);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not rewrite message');
    } finally {
      setRewriting(false);
    }
  }

  return (
    <ListPageShell fill={false}>
      <PageHeader
        icon={Inbox}
        title="Inbox"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void logPhoneCall()}>
              <Phone className="size-4" />
              Log call
            </Button>
            <Button type="button" variant="outline" onClick={openLogTouch}>
              Log touch
            </Button>
            <Button type="button" onClick={() => startTravelRequest()}>
              <Plus className="size-4" />
              New travel request
            </Button>
          </div>
        }
      />

      {channelUnread.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {channelUnread.map((c) => (
            <button
              key={c.channel}
              type="button"
              onClick={() => {
                selectChannel(c.channel);
                setView('threads');
              }}
              className="rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-sm font-medium"
            >
              {channelLabel(c.channel)} · {c.unread} unread
            </button>
          ))}
        </div>
      ) : null}

      {journeys.length > 0 ? (
        <div className="mb-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Top journeys: </span>
          {journeys.map((j) => (
            <span key={j.path} className="mr-3">
              {j.path} ({j.count}
              {j.converted ? `, ${j.converted} won` : ''})
            </span>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            { value: 'threads', label: 'Conversations', icon: MessagesSquare },
            { value: 'inbox', label: 'All touches', icon: Inbox },
          ] as const
        ).map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setView(v.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              view === v.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 bg-muted/30 hover:border-primary/40',
            )}
          >
            <v.icon className="size-3.5" />
            {v.label}
          </button>
        ))}
      </div>

      {view === 'threads' ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {QUEUE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setQueue(f.value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                queue === f.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/70 bg-muted/30 hover:border-primary/40',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CHANNEL_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => selectChannel(f.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              channel === f.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 bg-muted/30 hover:border-primary/40',
            )}
          >
            {f.label}
          </button>
        ))}
        {view === 'inbox' ? (
          <button
            type="button"
            onClick={() => setPendingOnly((v) => !v)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              pendingOnly
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 bg-muted/30 hover:border-primary/40',
            )}
          >
            Pending only
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
            unreadOnly
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border/70 bg-muted/30 hover:border-primary/40',
          )}
        >
          Unread
        </button>
        {(
          [
            { value: 'all', label: 'All owners' },
            { value: 'unassigned', label: 'Unassigned' },
            { value: 'mine', label: 'Mine' },
          ] as const
        ).map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setOwnership(f.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              ownership === f.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 bg-muted/30 hover:border-primary/40',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {analytics?.byChannel?.length ? (
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {analytics.byChannel.map((c) => (
            <span key={c.channel} className="rounded-md bg-muted/50 px-2 py-1">
              {channelLabel(c.channel)} · {c.count}
            </span>
          ))}
        </div>
      ) : null}

      {view === 'threads' ? (
        threadsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : threads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
            <MessagesSquare className="mx-auto mb-2 size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No conversations yet</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,240px)]">
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60 max-h-[70vh] overflow-y-auto">
              {threads.map((thread) => (
                <li key={thread.key}>
                  <button
                    type="button"
                    onClick={() => void openThread(thread)}
                    className={cn(
                      'flex w-full min-w-0 items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40',
                      activeThreadKey === thread.key && 'bg-primary/5',
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {thread.unreadCount > 0 ? (
                          <span className="size-1.5 rounded-full bg-primary" aria-label="Unread" />
                        ) : null}
                        <span className="truncate text-sm font-medium">{thread.label}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {channelLabel(thread.channel)}
                        {thread.travelRequestCount
                          ? ` · ${thread.travelRequestCount} request${thread.travelRequestCount === 1 ? '' : 's'}`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {formatDateTime(thread.lastAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="rounded-xl border border-border/60 min-h-[320px] flex flex-col">
              {!activeThreadKey ? (
                <p className="m-auto text-sm text-muted-foreground">Select a conversation</p>
              ) : threadMessagesLoading ? (
                <p className="m-auto text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={summarizing || !conversationDetail?.id}
                      onClick={() => void summarizeActiveConversation()}
                    >
                      <Sparkles className="size-3.5" />
                      {summarizing ? 'Summarizing…' : 'Summarize'}
                    </Button>
                    {threadMessages.some((m) => REPLYABLE_CHANNELS.has(m.channel)) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const lastInbound = [...threadMessages]
                            .reverse()
                            .find(
                              (m) =>
                                m.direction === 'inbound' &&
                                REPLYABLE_CHANNELS.has(m.channel) &&
                                (connectorCaps[m.channel]?.reply !== false),
                            );
                          if (lastInbound) {
                            setReplyRow(lastInbound);
                            setReplyText('');
                          }
                        }}
                      >
                        Reply
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const pending = threadMessages.find((m) => m.outcome === 'pending');
                        startTravelRequest(pending ?? threadMessages[threadMessages.length - 1]);
                      }}
                    >
                      Travel request
                    </Button>
                  </div>
                  {threadSummary ? (
                    <div className="border-b border-border/60 bg-muted/20 px-3 py-2 text-xs">
                      {threadSummary}
                    </div>
                  ) : null}
                  <ul className="flex-1 space-y-2 overflow-y-auto px-3 py-3 max-h-[55vh]">
                    {threadMessages.map((msg) => (
                      <li
                        key={msg.id}
                        className={cn(
                          'rounded-lg px-3 py-2 text-sm',
                          msg.direction === 'outbound'
                            ? 'ml-8 bg-primary/10'
                            : 'mr-8 bg-muted/40',
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{channelLabel(msg.channel)}</span>
                          <span>·</span>
                          <span>{msg.direction}</span>
                          <span>·</span>
                          <span>{formatDateTime(msg.occurredAt)}</span>
                        </div>
                        <p>{msg.summary || '—'}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <aside className="rounded-xl border border-border/60 p-3 space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Customer
                </p>
                <p className="font-medium">
                  {conversationDetail?.party?.displayName ||
                    threads.find((t) => t.key === activeThreadKey)?.label ||
                    '—'}
                </p>
                {conversationDetail?.party?.phone ? (
                  <p className="text-xs text-muted-foreground">{conversationDetail.party.phone}</p>
                ) : null}
                {conversationDetail?.party?.email ? (
                  <p className="text-xs text-muted-foreground">{conversationDetail.party.email}</p>
                ) : null}
              </div>
              {conversationDetail?.journeyPath?.length ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Journey
                  </p>
                  <p className="text-xs">{conversationDetail.journeyPath.join(' → ')}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Travel requests
                </p>
                {conversationDetail?.inquiries?.length ? (
                  <ul className="mt-1 space-y-1">
                    {conversationDetail.inquiries.map((inq) => (
                      <li key={inq.id}>
                        <button
                          type="button"
                          className="text-left text-primary hover:underline"
                          onClick={() => navigate(`/inquiries/${inq.id}`)}
                        >
                          {inq.inquiryNumber} · {inq.status}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">None linked yet</p>
                )}
              </div>
              {conversationDetail?.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    void api(`/interactions/conversations/${conversationDetail.id}/claim`, {
                      method: 'POST',
                    })
                      .then(() => toastSuccess('Claimed'))
                      .catch((e) =>
                        toastError(e instanceof Error ? e.message : 'Could not claim'),
                      )
                  }
                >
                  Claim conversation
                </Button>
              ) : null}
            </aside>
          </div>
        )
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
          <Phone className="mx-auto mb-2 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">No interactions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Log a WhatsApp or walk-in touch, or start a customer call.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" onClick={openLogTouch}>
              Log touch
            </Button>
            <Button type="button" onClick={() => startTravelRequest()}>
              Start a call
            </Button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
          {items.map((row) => {
            const pending = row.outcome === 'pending';
            return (
              <li key={row.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => void openRow(row)}
                  className={cn(
                    'flex min-w-0 flex-1 items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40',
                    row.unread && 'bg-primary/5',
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.unread ? (
                        <span className="size-1.5 rounded-full bg-primary" aria-label="Unread" />
                      ) : null}
                      <span className="font-medium">
                        {row.party?.displayName || row.lead?.title || row.summary || 'Inbound'}
                      </span>
                      <StatusBadge
                        value={row.channel}
                        label={channelLabel(row.channel)}
                        showIcon={false}
                      />
                      <StatusBadge
                        value={row.outcome}
                        label={outcomeLabel(row.outcome)}
                        showIcon={false}
                      />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        row.acquisitionSourceKey
                          ? `Found via ${row.acquisitionSourceKey.replace(/_/g, ' ')}`
                          : null,
                        row.summary,
                        row.party?.phone,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Open to continue'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(row.occurredAt)}
                  </span>
                </button>
                {pending ? (
                  <div className="flex items-center pr-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          aria-label="Inbox actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                          {row.party?.displayName || row.summary || 'Touch'}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => startTravelRequest(row)}>
                          Start travel request
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAttach(row)}>
                          Attach to existing
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openFollowUp(row)}>
                          Follow up
                        </DropdownMenuItem>
                        {!row.staffUserId ? (
                          <DropdownMenuItem onClick={() => void claimRow(row)}>
                            Claim
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onClick={() => setAssignRow(row)}>
                          Assign…
                        </DropdownMenuItem>
                        {(row.channel === 'whatsapp' && whatsappEnabled) ||
                        row.channel === 'email' ||
                        (row.channel === 'instagram' && instagramEnabled) ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setReplyRow(row);
                              setReplyText('');
                            }}
                          >
                            Reply on {channelLabel(row.channel)}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => void dismiss(row, 'no_interest')}>
                          No interest
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void dismiss(row, 'spam')}>
                          Spam
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Pipeline owners still use{' '}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => navigate(AGENCY_ROUTES.leads)}
        >
          Leads
        </button>{' '}
        for assignment and stages.
      </p>

      <RecordSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        title="Log touch"
        description="Capture an inbound channel without creating a travel request yet."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={logSaving} onClick={() => void saveLogTouch()}>
              {logSaving ? 'Saving…' : 'Log touch'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Channel</p>
            <div className="flex flex-wrap gap-2">
              {LOG_CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setLogForm({ ...logForm, channel: c.value })}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium',
                    logForm.channel === c.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 bg-muted/30',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <FormField label="Name">
            <Input
              value={logForm.contactName}
              onChange={(e) => setLogForm({ ...logForm, contactName: e.target.value })}
              placeholder="Caller name"
              disabled={Boolean(logForm.partyId)}
            />
          </FormField>
          <FormField label="Phone">
            <PhoneInput
              value={logForm.contactPhone}
              onChange={(contactPhone) => setLogForm({ ...logForm, contactPhone })}
              disabled={Boolean(logForm.partyId)}
            />
          </FormField>
          {logForm.partyId ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
              <span>
                Linked to <span className="font-medium">{logForm.partyLabel}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLogForm({ ...logForm, partyId: '', partyLabel: '' })}
              >
                Change
              </Button>
            </div>
          ) : partyMatch ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              <span>
                Existing: <span className="font-medium">{partyMatch.displayName}</span>
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLogForm({
                    ...logForm,
                    partyId: partyMatch.id,
                    partyLabel: partyMatch.displayName,
                    contactName: partyMatch.displayName,
                  })
                }
              >
                Use existing
              </Button>
            </div>
          ) : null}
          <FormField label="Note">
            <Input
              value={logForm.summary}
              onChange={(e) => setLogForm({ ...logForm, summary: e.target.value })}
              placeholder="What did they ask about?"
            />
          </FormField>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">How did they find us?</p>
            <div className="flex flex-wrap gap-2">
              {acquisitionOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLogForm({ ...logForm, acquisitionKey: opt.value })}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium',
                    logForm.acquisitionKey === opt.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 bg-muted/30',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </RecordSheet>

      <RecordSheet
        open={Boolean(resolveMode && resolveRow)}
        onOpenChange={(open) => {
          if (!open) {
            setResolveMode(null);
            setResolveRow(null);
          }
        }}
        title={resolveMode === 'attach' ? 'Attach to existing' : 'Schedule follow-up'}
        description={
          resolveMode === 'attach'
            ? 'Link this touch to an open travel request / inquiry.'
            : 'Creates a task and closes the inbox item.'
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResolveMode(null);
                setResolveRow(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={resolveSaving} onClick={() => void submitResolve()}>
              {resolveSaving ? 'Saving…' : resolveMode === 'attach' ? 'Attach' : 'Schedule'}
            </Button>
          </>
        }
      >
        {resolveMode === 'attach' ? (
          <FormField label="Inquiry" required>
            <EntityCombobox
              value={attachInquiryId}
              selectedLabel={attachInquiryLabel}
              onChange={(value, option) => {
                setAttachInquiryId(value);
                setAttachInquiryLabel(option?.label || '');
              }}
              onSearch={searchInquiries}
              placeholder="Search inquiries…"
            />
          </FormField>
        ) : (
          <div className="space-y-4">
            <FormField label="Follow up on">
              <DatePicker value={followUpAt} onChange={setFollowUpAt} />
            </FormField>
            <FormField label="Note">
              <Input
                value={followNote}
                onChange={(e) => setFollowNote(e.target.value)}
                placeholder="What to ask next"
              />
            </FormField>
          </div>
        )}
      </RecordSheet>

      <RecordSheet
        open={Boolean(replyRow)}
        onOpenChange={(open) => {
          if (!open) {
            setReplyRow(null);
            setReplyText('');
          }
        }}
        title={replyRow ? `Reply on ${channelLabel(replyRow.channel)}` : 'Reply'}
        description={
          replyRow?.channel === 'email'
            ? 'Sent by email via your organization SMTP.'
            : replyRow?.party?.phone
              ? `Send to ${replyRow.party.phone}`
              : 'Uses the contact on this touch / party.'
        }
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setReplyRow(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={replySaving || !replyText.trim()}
              onClick={() => void sendReply()}
            >
              {replySaving ? 'Sending…' : 'Send'}
            </Button>
          </>
        }
      >
        <FormField label="Message">
          <Input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Thanks for reaching out…"
          />
        </FormField>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 text-muted-foreground"
          disabled={rewriting || !replyText.trim()}
          onClick={() => void rewriteReply()}
        >
          <Sparkles className="size-3.5" />
          {rewriting ? 'Rewriting…' : 'Rewrite with AI'}
        </Button>
      </RecordSheet>

      <RecordSheet
        open={Boolean(assignRow)}
        onOpenChange={(open) => {
          if (!open) setAssignRow(null);
        }}
        title="Assign touch"
        description="Choose a teammate to own this Inbox row."
        hideFooter
      >
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id}>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => void assignRowTo(m.id)}
              >
                {m.fullName}
              </Button>
            </li>
          ))}
          {!members.length ? (
            <p className="text-sm text-muted-foreground">No members found.</p>
          ) : null}
        </ul>
      </RecordSheet>
    </ListPageShell>
  );
}
