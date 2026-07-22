import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import {
  Inbox,
  LayoutList,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Button,
  Combobox,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  EntityCombobox,
  Input,
  ListPageSkeleton,
  PageSkeleton,
  SectionStack,
  Skeleton,
  PhoneInput,
  RecordSheet,
  FormGrid,
  SimpleFormField as FormField,
  StatusBadge,
  Textarea,
  cn,
  formatDateTime,
  isPhoneFormatOk,
  splitPhone,
  toastError,
  toastSuccess,
  usePageChrome,
  type ComboboxOption,
} from '@wayrune/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTravelRequestLauncher } from '../lib/travelRequestLauncher';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { reportError } from '../lib/errors';
import { formatWhatsappSessionCue } from '../lib/whatsappSessionCue';
import { inboxAgingFilterLabel } from '../lib/inboxAgingLabel';
import { useSalesCrmSla } from '../hooks/useSalesCrmSla';
import { usePermissions } from '../lib/permissions';
import {
  ActiveFilterChips,
  AttentionPresets,
  FilterMenu,
  QUEUE_MENU_ITEM_CLASS,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
  QueueViewToggle,
} from '../components/queue';
import {
  filterThreadRowsByQuery,
  inboxListApiQuery,
  inboxQueryHasFilters,
  inboxThreadsApiQuery,
  parseInboxQueryState,
  patchInboxQueryParams,
  type InboxQueryState,
} from '../lib/queue';
import {
  inboxChannelReplyReady,
  inboxComposerBlockedMessage,
  type InboxConnectorReadiness,
} from '../lib/inboxChannelReply';

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
  rawPayloadJson?: {
    campaignId?: string;
    direction?: string;
    text?: string | null;
    message?: string | null;
    destinations?: string | null;
    widgetMode?: string | null;
    widgetId?: string | null;
    widgetName?: string | null;
    siteId?: string | null;
    siteName?: string | null;
    path?: string | null;
    pageUrl?: string | null;
    source?: string | null;
  } | null;
  party?: { id: string; displayName: string; phone?: string | null } | null;
  lead?: {
    id: string;
    title: string;
    channel?: string | null;
    source?: { key: string; name: string } | null;
  } | null;
};

function widgetAttributionLabel(
  raw?: InboxRow['rawPayloadJson'] | null,
): string | null {
  if (!raw) return null;
  const parts = [
    typeof raw.widgetName === 'string' && raw.widgetName.trim()
      ? raw.widgetName.trim()
      : null,
    typeof raw.siteName === 'string' && raw.siteName.trim() ? raw.siteName.trim() : null,
    typeof raw.path === 'string' && raw.path.trim() ? raw.path.trim() : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Prefer the visitor/agent message text over the noisy ingest summary line. */
function messageBodyText(row: {
  summary?: string | null;
  rawPayloadJson?: InboxRow['rawPayloadJson'] | null;
}): string {
  const raw = row.rawPayloadJson;
  const fromPayload =
    (typeof raw?.text === 'string' && raw.text.trim()) ||
    (typeof raw?.message === 'string' && raw.message.trim()) ||
    '';
  if (fromPayload) return fromPayload;

  const summary = (row.summary || '').replace(/^Outbound:\s*/i, '').trim();
  if (!summary) return '—';

  // "Website chat · Default — Site: Demo — Path: / — hello"
  const emDashParts = summary.split(/\s+[—–]\s+/);
  if (emDashParts.length >= 2) {
    const last = emDashParts[emDashParts.length - 1]?.trim();
    if (last && !/^(site|path|form):/i.test(last)) return last;
  }
  // "… · hello" trailing segment when no em dash
  const dotParts = summary.split(/\s+·\s+/);
  if (dotParts.length >= 2) {
    const last = dotParts[dotParts.length - 1]?.trim();
    if (last && last.length < 280 && !/^site:/i.test(last) && !/^path:/i.test(last)) {
      return last;
    }
  }
  return summary;
}

function messagePreviewText(row: {
  summary?: string | null;
  rawPayloadJson?: InboxRow['rawPayloadJson'] | null;
  direction?: string;
}): string {
  const body = messageBodyText(row);
  if (row.direction === 'outbound' || /^Outbound:/i.test(row.summary || '')) {
    return body.startsWith('You:') ? body : `You: ${body}`;
  }
  return body;
}

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

const REPLYABLE_CHANNELS = new Set(['whatsapp', 'email', 'instagram', 'google_business', 'website']);
const THREAD_MESSAGE_PAGE_SIZE = 40;
const INBOX_LIST_WIDTH_KEY = 'inbox.listWidth';
const INBOX_DETAIL_WIDTH_KEY = 'inbox.detailWidth';
const INBOX_LIST_WIDTH_DEFAULT = 320;
const INBOX_DETAIL_WIDTH_DEFAULT = 260;

function readStoredWidth(key: string, fallback: number, min: number, max: number) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  } catch {
    return fallback;
  }
}

type ThreadMessagesResponse = {
  items: ThreadMessage[];
  conversationId?: string | null;
  hasMore?: boolean;
};

function threadMessagesUrl(
  threadKey: string,
  opts?: { before?: string; beforeId?: string; limit?: number },
) {
  const params = new URLSearchParams({
    limit: String(opts?.limit ?? THREAD_MESSAGE_PAGE_SIZE),
  });
  if (opts?.before) params.set('before', opts.before);
  if (opts?.beforeId) params.set('beforeId', opts.beforeId);
  return `/interactions/threads/${encodeURIComponent(threadKey)}?${params}`;
}

function replyEndpoint(channel: string, interactionId: string) {
  if (channel === 'email') return `/leads/email/reply/${interactionId}`;
  if (channel === 'instagram') return `/leads/instagram/reply/${interactionId}`;
  if (channel === 'google_business') return `/integrations/google/interactions/${interactionId}/reply`;
  if (channel === 'website') return `/leads/website/reply/${interactionId}`;
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
  { value: 'google_business', label: 'Google Business' },
  { value: 'api', label: 'API' },
] as const;

const QUEUE_FILTERS = [
  { value: 'all', label: 'All conversations' },
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

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function chatTimeLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
  const { navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const showSalesSla = hasAny(['inquiry.read', 'lead.read', 'lead.read.own']);
  const { data: salesSla } = useSalesCrmSla(showSalesSla);
  const agingFilterLabel = inboxAgingFilterLabel(salesSla?.inboxAgingHours);
  const [searchParams, setSearchParams] = useSearchParams();
  const openTravelRequest = useTravelRequestLauncher();
  const query = useMemo(() => parseInboxQueryState(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const pendingOnly = query.pendingOnly !== false;
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
  const [connectorReadiness, setConnectorReadiness] =
    useState<InboxConnectorReadiness | null>(null);
  const whatsappEnabled =
    connectorReadiness?.channels.whatsapp?.replyReady ?? false;
  const [analytics, setAnalytics] = useState<{
    total: number;
    unread: number;
    byChannel: Array<{ channel: string; count: number }>;
  } | null>(null);

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [activeThreadKey, setActiveThreadKey] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadMessagesLoading, setThreadMessagesLoading] = useState(false);
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [threadLoadingMore, setThreadLoadingMore] = useState(false);
  const [inboxListWidth, setInboxListWidth] = useState(() =>
    readStoredWidth(INBOX_LIST_WIDTH_KEY, INBOX_LIST_WIDTH_DEFAULT, 220, 480),
  );
  const [inboxDetailWidth, setInboxDetailWidth] = useState(() =>
    readStoredWidth(INBOX_DETAIL_WIDTH_KEY, INBOX_DETAIL_WIDTH_DEFAULT, 200, 420),
  );
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [channelUnread, setChannelUnread] = useState<Array<{ channel: string; unread: number }>>(
    [],
  );
  const [connectorCaps, setConnectorCaps] = useState<
    Record<string, { reply?: boolean; templates?: boolean }>
  >({});
  const [summarizing, setSummarizing] = useState(false);
  const [threadSummary, setThreadSummary] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logSaving, setLogSaving] = useState(false);
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [callLogNotes, setCallLogNotes] = useState('');
  const [callLogSaving, setCallLogSaving] = useState(false);
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
  const [composerText, setComposerText] = useState('');
  const [waSession, setWaSession] = useState<{
    open: boolean;
    remainingMs: number;
    demo?: boolean;
  } | null>(null);
  const [waTemplates, setWaTemplates] = useState<
    Array<{ id: string; name: string; metaTemplateName?: string }>
  >([]);
  const [replyTemplateId, setReplyTemplateId] = useState('');
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const activeThreadKeyRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const threadMessagesRef = useRef(threadMessages);
  const threadHasMoreRef = useRef(threadHasMore);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const inboxPollPrimedRef = useRef(false);
  threadMessagesRef.current = threadMessages;
  threadHasMoreRef.current = threadHasMore;

  function playInboxNotifySound() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.25);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.33);
      window.setTimeout(() => {
        void ctx.close();
      }, 450);
    } catch {
      /* ignore */
    }
  }
  activeThreadKeyRef.current = activeThreadKey;
  const [threadMenu, setThreadMenu] = useState<{
    x: number;
    y: number;
    thread: ThreadRow;
  } | null>(null);

  function applyQuery(patch: Parameters<typeof patchInboxQueryParams>[1]) {
    setSearchParams(patchInboxQueryParams(searchParams, patch), { replace: true });
  }

  function changeView(next: InboxQueryState['view']) {
    applyQuery({ view: next });
  }

  useEffect(() => {
    setSearchDraft(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchDraft.trim();
      if ((query.q ?? '') === next) return;
      applyQuery({ q: next || undefined });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce draft only
  }, [searchDraft]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = inboxListApiQuery(query, { pageSize: 50 });
      const res = await api<{ items: InboxRow[] }>(`/interactions?${qs}`);
      setItems(res.items);
    } catch (e) {
      reportError(e, 'Could not load inbox');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

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
    api<InboxConnectorReadiness>('/interactions/connectors/readiness')
      .then(setConnectorReadiness)
      .catch(() => setConnectorReadiness(null));
    api<{ channels: Array<{ channel: string; unread: number }> }>('/interactions/channel-unread')
      .then((res) => setChannelUnread(res.channels))
      .catch(() => setChannelUnread([]));
    api<Record<string, { reply?: boolean; templates?: boolean }>>(
      '/interactions/connectors/capabilities',
    )
      .then(setConnectorCaps)
      .catch(() => setConnectorCaps({}));
  }, []);

  const loadThreads = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setThreadsLoading(true);
    try {
      const qs = inboxThreadsApiQuery(query, { pageSize: 50 });
      const res = await api<{ items: ThreadRow[] }>(`/interactions/threads?${qs}`);
      setThreads(filterThreadRowsByQuery(res.items, query.q));
    } catch (e) {
      reportError(e, 'Could not load conversations');
      if (!opts?.quiet) setThreads([]);
    } finally {
      if (!opts?.quiet) setThreadsLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (query.view === 'threads') void loadThreads();
  }, [query.view, loadThreads]);

  /** Live inbox: auto-refresh conversations + open thread; sound on new inbound. */
  useEffect(() => {
    if (query.view !== 'threads') return;
    inboxPollPrimedRef.current = false;
    knownMessageIdsRef.current = new Set();

    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        await loadThreads({ quiet: true });
        const key = activeThreadKeyRef.current;
        if (key) {
          const prevIds = knownMessageIdsRef.current;
          const res = await api<ThreadMessagesResponse>(threadMessagesUrl(key));
          if (activeThreadKeyRef.current !== key) return;
          const nextIds = new Set(res.items.map((m) => m.id));
          const newInbound = res.items.filter(
            (m) => m.direction !== 'outbound' && !prevIds.has(m.id),
          );
          setThreadMessages((prev) => {
            const freshIds = new Set(res.items.map((m) => m.id));
            const oldestFresh = res.items[0];
            const keptOlder = prev.filter((m) => {
              if (m.id.startsWith('local-')) return false;
              if (freshIds.has(m.id)) return false;
              if (!oldestFresh) return false;
              if (m.occurredAt < oldestFresh.occurredAt) return true;
              if (m.occurredAt === oldestFresh.occurredAt && m.id < oldestFresh.id) return true;
              return false;
            });
            return [...keptOlder, ...res.items];
          });
          if (inboxPollPrimedRef.current && newInbound.length) {
            playInboxNotifySound();
          }
          knownMessageIdsRef.current = new Set([...prevIds, ...nextIds]);
          inboxPollPrimedRef.current = true;
        } else {
          inboxPollPrimedRef.current = true;
        }
      } catch {
        /* keep current UI */
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, 3000);
    void tick();
    return () => window.clearInterval(id);
  }, [query.view, loadThreads, query.channel, query.unread, query.aging, query.ownership, query.queue]);

  useEffect(() => {
    // Reset sound priming when switching conversations so we don't ding for history.
    knownMessageIdsRef.current = new Set();
    inboxPollPrimedRef.current = false;
  }, [activeThreadKey]);
  async function openThread(thread: ThreadRow) {
    setActiveThreadKey(thread.key);
    setThreadMessagesLoading(true);
    setThreadSummary(null);
    setConversationDetail(null);
    setThreadHasMore(false);
    stickToBottomRef.current = true;
    try {
      const res = await api<ThreadMessagesResponse>(threadMessagesUrl(thread.key));
      setThreadMessages(res.items);
      setThreadHasMore(Boolean(res.hasMore));
      const convId = thread.conversationId || res.conversationId;
      if (convId) {
        const detail = await api<ConversationDetail>(`/interactions/conversations/${convId}`);
        setConversationDetail(detail);
      }
      void loadThreads({ quiet: true });
      api<{ channels: Array<{ channel: string; unread: number }> }>('/interactions/channel-unread')
        .then((r) => setChannelUnread(r.channels))
        .catch(() => undefined);
    } catch (e) {
      reportError(e, 'Could not load conversation');
      setThreadMessages([]);
      setThreadHasMore(false);
    } finally {
      setThreadMessagesLoading(false);
    }
  }

  async function loadOlderThreadMessages() {
    const key = activeThreadKeyRef.current;
    const oldest = threadMessagesRef.current[0];
    if (!key || !oldest || !threadHasMoreRef.current || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setThreadLoadingMore(true);
    const el = messagesScrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;

    try {
      const res = await api<ThreadMessagesResponse>(
        threadMessagesUrl(key, {
          before: oldest.occurredAt,
          beforeId: oldest.id,
        }),
      );
      if (activeThreadKeyRef.current !== key) return;
      setThreadHasMore(Boolean(res.hasMore));
      if (!res.items.length) return;
      setThreadMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const older = res.items.filter((m) => !seen.has(m.id));
        return [...older, ...prev];
      });
      requestAnimationFrame(() => {
        const box = messagesScrollRef.current;
        if (!box) return;
        box.scrollTop = box.scrollHeight - prevHeight + prevTop;
      });
    } catch {
      /* keep current page */
    } finally {
      loadingMoreRef.current = false;
      setThreadLoadingMore(false);
    }
  }

  /** Refresh open chat without blanking the pane (no loading flash). */
  async function refreshActiveThreadQuietly(threadKey?: string) {
    const key = threadKey || activeThreadKeyRef.current;
    if (!key) return;
    try {
      const res = await api<ThreadMessagesResponse>(threadMessagesUrl(key));
      if (activeThreadKeyRef.current !== key) return;
      setThreadMessages((prev) => {
        const freshIds = new Set(res.items.map((m) => m.id));
        const oldestFresh = res.items[0];
        const keptOlder = prev.filter((m) => {
          if (m.id.startsWith('local-')) return false;
          if (freshIds.has(m.id)) return false;
          if (!oldestFresh) return false;
          if (m.occurredAt < oldestFresh.occurredAt) return true;
          if (m.occurredAt === oldestFresh.occurredAt && m.id < oldestFresh.id) return true;
          return false;
        });
        return [...keptOlder, ...res.items];
      });
      void loadThreads({ quiet: true });
    } catch {
      /* keep optimistic UI */
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

  function openLogCall() {
    setCallLogNotes('');
    setCallLogOpen(true);
  }

  async function submitLogCall() {
    const notes = callLogNotes.trim();
    if (!notes) {
      toastError('Add a short note about the call');
      return;
    }
    setCallLogSaving(true);
    try {
      await api('/interactions/phone', {
        method: 'POST',
        body: JSON.stringify({
          summary: notes,
          direction: 'inbound',
          conversationId: conversationDetail?.id ?? null,
          partyId: conversationDetail?.party?.id ?? null,
          phone: conversationDetail?.party?.phone ?? null,
          contactName: conversationDetail?.party?.displayName ?? null,
        }),
      });
      toastSuccess('Phone call logged');
      setCallLogOpen(false);
      if (activeThreadKey) await refreshActiveThreadQuietly();
      else await loadThreads();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not log call');
    } finally {
      setCallLogSaving(false);
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
    if (!analytics) return 'Customer chats and calls in one place.';
    if (analytics.unread > 0) {
      return `${analytics.unread} unread · ${analytics.total} in the last 30 days`;
    }
    return `${analytics.total} conversations in the last 30 days`;
  }, [analytics]);

  const channelFilterOptions = useMemo(
    () =>
      CHANNEL_FILTERS.filter((f) => f.value).map((f) => {
        const unread = channelUnread.find((c) => c.channel === f.value)?.unread;
        return { value: f.value, label: f.label, countLabel: unread ? String(unread) : undefined };
      }),
    [channelUnread],
  );

  const queueFilterOptions = useMemo(
    () => QUEUE_FILTERS.filter((f) => f.value !== 'all').map((f) => ({ value: f.value, label: f.label })),
    [],
  );

  const filterDefs = useMemo(
    () => [
      {
        id: 'channel',
        label: 'Channel',
        icon: MessageCircle,
        value: query.channel ?? null,
        options: channelFilterOptions,
        onSelect: (value: string | null) => applyQuery({ channel: value || undefined }),
      },
      {
        id: 'owner',
        label: 'Owner',
        icon: UserRound,
        value: query.ownership ?? null,
        options: [
          { value: 'mine', label: 'Assigned to me' },
          { value: 'unassigned', label: 'Unassigned' },
        ],
        onSelect: (value: string | null) =>
          applyQuery({ ownership: (value as InboxQueryState['ownership']) || undefined }),
      },
      ...(query.view === 'threads'
        ? [
            {
              id: 'queue',
              label: 'Queue',
              icon: LayoutList,
              value: query.queue ?? null,
              options: queueFilterOptions,
              onSelect: (value: string | null) =>
                applyQuery({ queue: (value as InboxQueryState['queue']) || undefined }),
            },
          ]
        : []),
    ],
    [query.channel, query.ownership, query.queue, query.view, channelFilterOptions, queueFilterOptions],
  );

  const filterChips = [
    query.channel
      ? {
          id: 'channel',
          label: `Channel: ${channelLabel(query.channel)}`,
          onRemove: () => applyQuery({ channel: undefined }),
        }
      : null,
    query.ownership
      ? {
          id: 'owner',
          label: query.ownership === 'mine' ? 'Owner: Me' : 'Owner: Unassigned',
          onRemove: () => applyQuery({ ownership: undefined }),
        }
      : null,
    query.view === 'threads' && query.queue
      ? {
          id: 'queue',
          label: `Queue: ${QUEUE_FILTERS.find((f) => f.value === query.queue)?.label ?? query.queue}`,
          onRemove: () => applyQuery({ queue: undefined }),
        }
      : null,
    query.view === 'inbox' && !pendingOnly
      ? {
          id: 'pending',
          label: 'All outcomes',
          onRemove: () => applyQuery({ pendingOnly: true }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const attentionPresets = [
    {
      id: 'unread',
      label: 'unread',
      count: salesSla?.inboxUnreadThreads ?? 0,
      active: Boolean(query.unread),
      tone: 'info' as const,
      onClick: () => applyQuery({ unread: !query.unread }),
    },
    {
      id: 'aging',
      label: agingFilterLabel.toLowerCase(),
      count: salesSla?.inboxAgingUnreadThreads ?? 0,
      active: Boolean(query.aging),
      tone: 'danger' as const,
      onClick: () => applyQuery({ aging: !query.aging }),
    },
  ];

  function clearFilters() {
    applyQuery({ clearFilters: true });
  }

  function startTravelRequest(row?: InboxRow) {
    const campaignId =
      row?.rawPayloadJson && typeof row.rawPayloadJson.campaignId === 'string'
        ? row.rawPayloadJson.campaignId
        : undefined;
    const destinationText =
      row?.rawPayloadJson && typeof row.rawPayloadJson.destinations === 'string'
        ? row.rawPayloadJson.destinations.trim() || undefined
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
            destinationText,
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
      const res = await api<{ demo?: boolean }>(replyEndpoint(replyRow.channel, replyRow.id), {
        method: 'POST',
        body: JSON.stringify({ text: replyText.trim() }),
      });
      toastSuccess(
        res.demo
          ? 'Reply saved in Inbox (demo mode — not sent outside the app)'
          : 'Reply sent',
      );
      setReplyRow(null);
      setReplyText('');
      setComposerText('');
      if (query.view === 'threads' && activeThreadKey) {
        await refreshActiveThreadQuietly();
      } else {
        await load();
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send reply');
    } finally {
      setReplySaving(false);
    }
  }

  const activeThread = useMemo(
    () => threads.find((t) => t.key === activeThreadKey) ?? null,
    [threads, activeThreadKey],
  );

  const replyTarget = useMemo(() => {
    const canReplyOn = (channel: string) => {
      if (!REPLYABLE_CHANNELS.has(channel)) return false;
      if (!inboxChannelReplyReady(channel, connectorReadiness)) return false;
      const cap = connectorCaps[channel];
      if (cap && cap.reply === false) return false;
      return true;
    };
    const newestFirst = [...threadMessages].reverse();
    return (
      newestFirst.find((m) => m.direction !== 'outbound' && canReplyOn(m.channel)) ??
      newestFirst.find((m) => canReplyOn(m.channel)) ??
      null
    );
  }, [threadMessages, connectorCaps, connectorReadiness]);

  const lastMessageId = threadMessages[threadMessages.length - 1]?.id;

  const threadReplyBlocked = useMemo(() => {
    const ch = activeThread?.channel;
    if (!ch || !REPLYABLE_CHANNELS.has(ch)) return null;
    if (inboxChannelReplyReady(ch, connectorReadiness)) return null;
    return inboxComposerBlockedMessage(ch, connectorReadiness);
  }, [activeThread?.channel, connectorReadiness]);

  const waSessionCue = useMemo(() => {
    if (!waSession || replyTarget?.channel !== 'whatsapp') return null;
    return formatWhatsappSessionCue(waSession);
  }, [waSession, replyTarget?.channel]);

  const waNeedsTemplate =
    replyTarget?.channel === 'whatsapp' &&
    waSession != null &&
    !waSession.demo &&
    (!waSession.open || waSession.remainingMs <= 0);

  useEffect(() => {
    if (!replyTarget || replyTarget.channel !== 'whatsapp' || !whatsappEnabled) {
      setWaSession(null);
      setReplyTemplateId('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [session, templates] = await Promise.all([
          api<{ open: boolean; remainingMs: number; demo?: boolean }>(
            `/leads/whatsapp/session/${replyTarget.id}`,
          ),
          api<Array<{ id: string; name: string; metaTemplateName?: string; isActive?: boolean }>>(
            '/lead-sources/whatsapp-templates',
          ).catch(() => []),
        ]);
        if (cancelled) return;
        setWaSession({
          open: session.open,
          remainingMs: session.remainingMs,
          demo: session.demo,
        });
        const active = templates.filter((t) => t.isActive !== false);
        setWaTemplates(active);
        setReplyTemplateId((prev) =>
          prev && active.some((t) => t.id === prev) ? prev : active[0]?.id || '',
        );
      } catch {
        if (!cancelled) setWaSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replyTarget?.id, replyTarget?.channel, whatsappEnabled, lastMessageId]);

  useEffect(() => {
    if (!waSession?.open || waSession.demo || replyTarget?.channel !== 'whatsapp') return;
    const timer = window.setInterval(() => {
      setWaSession((prev) => {
        if (!prev || prev.demo) return prev;
        const remainingMs = Math.max(0, prev.remainingMs - 30_000);
        return { ...prev, open: remainingMs > 0, remainingMs };
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [waSession?.open, waSession?.demo, replyTarget?.id, replyTarget?.channel]);

  const chatTitle =
    conversationDetail?.party?.displayName || activeThread?.label || 'Conversation';

  function scrollMessagesToBottom() {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollMessagesToBottom();
    const a = requestAnimationFrame(() => {
      scrollMessagesToBottom();
      requestAnimationFrame(scrollMessagesToBottom);
    });
    return () => cancelAnimationFrame(a);
  }, [lastMessageId, activeThreadKey, threadMessagesLoading]);

  useEffect(() => {
    setComposerText('');
  }, [activeThreadKey]);

  function onMessagesScroll() {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
    if (el.scrollTop < 80) {
      void loadOlderThreadMessages();
    }
  }

  function startInboxColumnResize(which: 'list' | 'detail', e: ReactMouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startList = inboxListWidth;
    const startDetail = inboxDetailWidth;
    let nextList = startList;
    let nextDetail = startDetail;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (which === 'list') {
        nextList = Math.min(480, Math.max(220, startList + dx));
        setInboxListWidth(nextList);
      } else {
        nextDetail = Math.min(420, Math.max(200, startDetail - dx));
        setInboxDetailWidth(nextDetail);
      }
    };
    const onUp = () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem(INBOX_LIST_WIDTH_KEY, String(nextList));
        localStorage.setItem(INBOX_DETAIL_WIDTH_KEY, String(nextDetail));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      composerRef.current?.focus({ preventScroll: true });
    });
  }

  async function sendComposerReply() {
    const text = composerText.trim();
    if (!text || !replyTarget) return;
    if (waNeedsTemplate) {
      toastError('Session closed — send a Meta template instead of free text');
      return;
    }

    const tempId = `local-${Date.now()}`;
    const optimistic: ThreadMessage = {
      id: tempId,
      channel: replyTarget.channel,
      outcome: 'pending',
      unread: false,
      summary: text,
      occurredAt: new Date().toISOString(),
      direction: 'outbound',
      party: conversationDetail?.party
        ? {
            id: conversationDetail.party.id,
            displayName: conversationDetail.party.displayName,
            phone: conversationDetail.party.phone,
          }
        : null,
    };

    setComposerText('');
    setThreadMessages((prev) => [...prev, optimistic]);
    setReplySaving(true);
    stickToBottomRef.current = true;
    focusComposer();

    try {
      const res = await api<{ demo?: boolean }>(
        replyEndpoint(replyTarget.channel, replyTarget.id),
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        },
      );
      toastSuccess(
        res.demo
          ? 'Reply saved in Inbox (demo mode — not sent outside the app)'
          : 'Reply sent',
      );
      await refreshActiveThreadQuietly();
      focusComposer();
    } catch (e) {
      setThreadMessages((prev) => prev.filter((m) => m.id !== tempId));
      setComposerText(text);
      toastError(e instanceof Error ? e.message : 'Could not send reply');
      focusComposer();
    } finally {
      setReplySaving(false);
      focusComposer();
    }
  }

  async function sendComposerTemplate() {
    if (!replyTarget || replyTarget.channel !== 'whatsapp') return;
    if (!replyTemplateId) {
      toastError('Pick a WhatsApp template');
      return;
    }
    setReplySaving(true);
    try {
      await api(`/leads/whatsapp/reply-template/${replyTarget.id}`, {
        method: 'POST',
        body: JSON.stringify({ templateId: replyTemplateId }),
      });
      toastSuccess('Template sent');
      await refreshActiveThreadQuietly();
      const session = await api<{ open: boolean; remainingMs: number; demo?: boolean }>(
        `/leads/whatsapp/session/${replyTarget.id}`,
      ).catch(() => null);
      if (session) {
        setWaSession({
          open: session.open,
          remainingMs: session.remainingMs,
          demo: session.demo,
        });
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send template');
    } finally {
      setReplySaving(false);
    }
  }

  async function markThreadRead(thread: ThreadRow) {
    const id = thread.conversationId;
    if (!id) return;
    try {
      await api(`/interactions/conversations/${id}/read`, { method: 'POST' });
      toastSuccess('Marked as read');
      await loadThreads({ quiet: true });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark as read');
    }
  }

  async function markThreadUnread(thread: ThreadRow) {
    const id = thread.conversationId;
    if (!id) return;
    try {
      await api(`/interactions/conversations/${id}/unread`, { method: 'POST' });
      toastSuccess('Marked as unread');
      await loadThreads({ quiet: true });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark as unread');
    }
  }

  async function claimThread(thread: ThreadRow) {
    const id = thread.conversationId;
    if (!id) return;
    try {
      await api(`/interactions/conversations/${id}/claim`, { method: 'POST' });
      toastSuccess('Conversation claimed');
      await loadThreads({ quiet: true });
      if (activeThreadKey === thread.key) {
        const detail = await api<ConversationDetail>(`/interactions/conversations/${id}`);
        setConversationDetail(detail);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not claim');
    }
  }

  useEffect(() => {
    if (!threadMenu) return;
    function close() {
      setThreadMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [threadMenu]);

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

  usePageChrome({ title: 'Inbox', subtitle });

  const queueToolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={query.view === 'threads' ? 'Search conversations…' : 'Search messages…'}
          className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
          aria-label="Search inbox"
        />
        {searchDraft.trim() ? (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
            onClick={() => {
              setSearchDraft('');
              applyQuery({ q: '' });
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <FilterMenu filters={filterDefs} />
        {query.view === 'inbox' ? (
          <button
            type="button"
            onClick={() => applyQuery({ pendingOnly: !pendingOnly })}
            className={cn(
              'inline-flex h-[var(--control-h)] items-center rounded-md border px-[var(--control-px-sm)] text-[length:var(--control-text-sm)] font-medium transition-colors',
              pendingOnly
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/70 bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            Needs reply
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <QueuePageChrome
      viewToggle={
        <QueueViewToggle
          value={query.view}
          onChange={(id) => changeView(id as InboxQueryState['view'])}
          options={[
            {
              id: 'threads',
              label: 'Conversations',
              icon: <MessagesSquare className="size-[0.875em]" />,
            },
            { id: 'inbox', label: 'All messages', icon: <Inbox className="size-[0.875em]" /> },
          ]}
        />
      }
      attention={showSalesSla ? <AttentionPresets presets={attentionPresets} /> : null}
      primaryActions={
        <Button type="button" size="sm" onClick={() => startTravelRequest()}>
          <Plus className="size-[0.875em]" />
          New travel request
        </Button>
      }
      moreMenu={
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
            <DropdownMenuLabel className="text-[length:var(--control-text-sm)]">More</DropdownMenuLabel>
            <DropdownMenuItem className={QUEUE_MENU_ITEM_CLASS} onClick={openLogCall}>
              <Phone />
              Log call
            </DropdownMenuItem>
            <DropdownMenuItem className={QUEUE_MENU_ITEM_CLASS} onClick={openLogTouch}>
              <MessagesSquare />
              Log message
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      error={
        connectorReadiness?.banners.length ? (
          <div className="space-y-1">
            {connectorReadiness.banners.slice(0, 3).map((banner) => (
              <p
                key={banner.channel}
                className={cn(
                  'rounded-md px-2 py-1 text-xs leading-snug',
                  banner.tone === 'warn'
                    ? 'border border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                    : 'border border-border/60 bg-muted/30 text-muted-foreground',
                )}
              >
                {banner.message}{' '}
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-2"
                  onClick={() => navigate(AGENCY_ROUTES.settingsIntegrations)}
                >
                  Open Integrations
                </button>
              </p>
            ))}
          </div>
        ) : null
      }
      toolbar={queueToolbar}
      chips={
        <ActiveFilterChips
          chips={filterChips}
          onClear={inboxQueryHasFilters(query) ? clearFilters : undefined}
        />
      }
    >
      <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
      {query.view === 'threads' ? (
        threadsLoading && threads.length === 0 ? (
          <PageSkeleton variant="split" className="min-h-0 flex-1" />
        ) : threads.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="When a customer messages you on WhatsApp, web, Google, or phone, it shows up here. Start by logging a call or a message."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={openLogCall}>
                  Log call
                </Button>
                <Button type="button" size="sm" onClick={openLogTouch}>
                  Log message
                </Button>
              </div>
            }
          />
          </div>
        ) : (
          <div
            className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-background lg:flex-row"
            style={
              {
                '--inbox-list-w': `${inboxListWidth}px`,
                '--inbox-detail-w': `${inboxDetailWidth}px`,
              } as CSSProperties
            }
          >
            <ul
              className="min-h-0 max-h-[40%] divide-y divide-border/50 overflow-y-auto border-b border-border/60 lg:h-full lg:max-h-none lg:w-[var(--inbox-list-w)] lg:shrink-0 lg:border-b-0 lg:border-r"
            >              {threads.map((thread) => {
                const selected = activeThreadKey === thread.key;
                return (
                  <li key={thread.key}>
                    <button
                      type="button"
                      onClick={() => void openThread(thread)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setThreadMenu({ x: e.clientX, y: e.clientY, thread });
                      }}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left transition-colors',
                        selected ? 'bg-primary/10' : 'hover:bg-muted/40',
                        thread.unreadCount > 0 && !selected && 'bg-primary/[0.04]',
                      )}
                    >
                      <Avatar className="size-9 shrink-0">
                        <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                          {personInitials(thread.label)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              'truncate text-sm',
                              thread.unreadCount > 0 ? 'font-semibold' : 'font-medium',
                            )}
                          >
                            {thread.label}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {chatTimeLabel(thread.lastAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="truncate text-xs text-muted-foreground">
                            {messageBodyText({ summary: thread.lastSummary }) ||
                              channelLabel(thread.channel)}
                          </p>
                          {thread.unreadCount > 0 ? (
                            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                              {thread.unreadCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize conversation list"
              title="Drag to resize"
              onMouseDown={(e) => startInboxColumnResize('list', e)}
              className="relative z-10 hidden w-1 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-primary/50 lg:block before:absolute before:inset-y-0 before:-left-1.5 before:w-4 before:content-['']"
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:h-full">
              {!activeThreadKey ? (
                <div className="flex flex-1 flex-col items-center justify-center px-4 py-4 text-center">
                  <MessagesSquare className="mb-2 size-7 text-muted-foreground/70" />
                  <p className="text-sm font-medium text-foreground">Pick a chat</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Select a customer on the left to open the conversation.
                  </p>
                </div>
              ) : threadMessagesLoading ? (
                <div className="m-auto w-full max-w-sm space-y-2 px-6" role="status" aria-busy="true">
                  <span className="sr-only">Loading</span>
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-4/5" />
                </div>
              ) : (
                <>
                  <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2.5 py-2">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                        {personInitials(chatTitle)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{chatTitle}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {channelLabel(activeThread?.channel || 'website')}
                        {conversationDetail?.party?.phone
                          ? ` · ${conversationDetail.party.phone}`
                          : ''}
                        {(() => {
                          const attrMsg = threadMessages.find((m) =>
                            widgetAttributionLabel(m.rawPayloadJson),
                          );
                          const attr = widgetAttributionLabel(attrMsg?.rawPayloadJson);
                          return attr ? ` · ${attr}` : '';
                        })()}
                      </p>
                    </div>
                    {(() => {
                      const widgetId = threadMessages.find((m) => m.rawPayloadJson?.widgetId)
                        ?.rawPayloadJson?.widgetId;
                      if (!widgetId) return null;
                      return (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="hidden shrink-0 text-xs text-muted-foreground sm:inline-flex"
                          onClick={() =>
                            navigate(`${AGENCY_ROUTES.settingsInboxChatflows}/${widgetId}`)
                          }
                        >
                          Chatflow
                        </Button>
                      );
                    })()}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="ghost" aria-label="Chat actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={summarizing || !conversationDetail?.id}
                          onClick={() => void summarizeActiveConversation()}
                        >
                          <Sparkles className="mr-2 size-3.5" />
                          {summarizing ? 'Summarizing…' : 'Summarize chat'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const pending = threadMessages.find((m) => m.outcome === 'pending');
                            startTravelRequest(
                              pending ?? threadMessages[threadMessages.length - 1],
                            );
                          }}
                        >
                          <Plus className="mr-2 size-3.5" />
                          New travel request
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                    <div className="border-b border-border/60 bg-muted/20 px-4 py-2 text-xs leading-5 text-muted-foreground">
                      <span className="font-medium text-foreground">Summary: </span>
                      {threadSummary}
                    </div>
                  ) : null}

                  <div
                    ref={messagesScrollRef}
                    onScroll={onMessagesScroll}
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted/15 px-2.5 py-3"
                  >
                    <div className="mt-auto flex flex-col gap-3">
                      {threadHasMore || threadLoadingMore ? (
                        <div className="py-2 text-center text-[11px] text-muted-foreground">
                          {threadLoadingMore ? (
                            <div className="mx-auto flex justify-center" role="status" aria-busy="true">
                              <span className="sr-only">Loading</span>
                              <Skeleton className="h-3 w-36" />
                            </div>
                          ) : (
                            'Scroll up for earlier messages'
                          )}
                        </div>
                      ) : null}
                      {threadMessages.map((msg) => {
                        const fromCustomer = msg.direction !== 'outbound';
                        const body = messageBodyText(msg);
                        return (
                          <div
                            key={msg.id}
                            className={cn(
                              'flex w-full',
                              fromCustomer ? 'justify-start' : 'justify-end',
                            )}
                          >
                            <div
                              className={cn(
                                'max-w-[min(78%,26rem)] px-3.5 py-2.5 text-[13px] leading-relaxed',
                                fromCustomer
                                  ? 'rounded-2xl rounded-bl-md bg-background text-foreground shadow-sm ring-1 ring-border/60'
                                  : 'rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-sm',
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">{body}</p>
                              <p
                                className={cn(
                                  'mt-1.5 text-[10px] tabular-nums',
                                  fromCustomer
                                    ? 'text-muted-foreground'
                                    : 'text-right text-primary-foreground/75',
                                )}
                              >
                                {chatTimeLabel(msg.occurredAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-border/60 bg-background px-2.5 py-2">
                    {replyTarget ? (
                      <div className="space-y-2">
                        {waSessionCue ? (
                          <p
                            className={cn(
                              'rounded-md px-2.5 py-1.5 text-xs',
                              waSessionCue.tone === 'closed'
                                ? 'border border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                                : 'border border-border/60 bg-muted/30 text-muted-foreground',
                            )}
                          >
                            {waSessionCue.label}
                            {waNeedsTemplate && !waTemplates.length ? (
                              <>
                                {' '}
                                ·{' '}
                                <button
                                  type="button"
                                  className="font-medium underline underline-offset-2"
                                  onClick={() => navigate(AGENCY_ROUTES.settingsIntegrations)}
                                >
                                  Add templates
                                </button>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {waNeedsTemplate ? (
                          <form
                            className="flex items-end gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void sendComposerTemplate();
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <Combobox
                                value={replyTemplateId}
                                onChange={(id) => setReplyTemplateId(id || '')}
                                placeholder="Pick Meta template…"
                                options={waTemplates.map((t) => ({
                                  value: t.id,
                                  label: t.name,
                                  description: t.metaTemplateName,
                                }))}
                              />
                            </div>
                            <Button
                              type="submit"
                              size="icon"
                              className="size-11 shrink-0 rounded-full"
                              disabled={replySaving || !replyTemplateId}
                              aria-label="Send template"
                            >
                              <Send className="size-4" />
                            </Button>
                          </form>
                        ) : (
                          <form
                            className="flex items-end gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void sendComposerReply();
                            }}
                          >
                            <Textarea
                              ref={composerRef}
                              value={composerText}
                              onChange={(e) => setComposerText(e.target.value)}
                              placeholder={`Reply on ${channelLabel(replyTarget.channel)}…`}
                              rows={1}
                              className="min-h-11 max-h-28 flex-1 resize-none rounded-2xl"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  void sendComposerReply();
                                }
                              }}
                            />
                            <Button
                              type="submit"
                              size="icon"
                              className="size-11 shrink-0 rounded-full"
                              disabled={replySaving || !composerText.trim()}
                              aria-label="Send"
                            >
                              <Send className="size-4" />
                            </Button>
                          </form>
                        )}
                      </div>
                    ) : threadReplyBlocked ? (
                      <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-sm text-muted-foreground">
                        {threadReplyBlocked}{' '}
                        <button
                          type="button"
                          className="font-medium text-foreground underline underline-offset-2"
                          onClick={() => navigate(AGENCY_ROUTES.settingsIntegrations)}
                        >
                          Open Integrations
                        </button>
                      </p>
                    ) : (
                      <p className="px-1 py-2 text-sm text-muted-foreground">
                        Replies aren&apos;t available on{' '}
                        {channelLabel(activeThread?.channel || 'website')}. Use Website chat,
                        WhatsApp, Email, Instagram, or Google Business when the customer writes
                        there.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize details panel"
              title="Drag to resize"
              onMouseDown={(e) => startInboxColumnResize('detail', e)}
              className="relative z-10 hidden w-1 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-primary/50 lg:block before:absolute before:inset-y-0 before:-left-1.5 before:w-4 before:content-['']"
            />

            <aside className="hidden min-h-0 overflow-y-auto border-border/60 p-2.5 text-sm lg:block lg:h-full lg:w-[var(--inbox-detail-w)] lg:shrink-0 lg:border-l">
              <SectionStack className="gap-2">
              <div className="flex items-center gap-2">
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
                    {personInitials(chatTitle)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">{chatTitle}</p>
                  <p className="text-xs text-muted-foreground">Customer</p>
                </div>
              </div>
              {conversationDetail?.party?.phone ? (
                <p className="text-sm text-muted-foreground">{conversationDetail.party.phone}</p>
              ) : null}
              {conversationDetail?.party?.email ? (
                <p className="text-sm text-muted-foreground">{conversationDetail.party.email}</p>
              ) : null}
              {conversationDetail?.journeyPath?.length ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">How they found you</p>
                  <p className="mt-1 text-sm leading-6">
                    {conversationDetail.journeyPath.map(channelLabel).join(' → ')}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium text-muted-foreground">Travel requests</p>
                {conversationDetail?.inquiries?.length ? (
                  <ul className="mt-2 space-y-2">
                    {conversationDetail.inquiries.map((inq) => (
                      <li key={inq.id}>
                        <button
                          type="button"
                          className="text-left font-medium text-primary hover:underline"
                          onClick={() => navigate(`/inquiries/${inq.id}`)}
                        >
                          {inq.inquiryNumber}
                        </button>
                        <span className="ml-2 text-xs text-muted-foreground">{inq.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    None yet — tap Travel request when they are ready to book.
                  </p>
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
              </SectionStack>
            </aside>
          </div>
        )
      ) : loading ? (
        <ListPageSkeleton className="min-h-0 flex-1" />
      ) : items.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={Phone}
            title="Nothing here yet"
            description="Log a WhatsApp message, website enquiry, or phone call — or clear filters if you narrowed the list too much."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {inboxQueryHasFilters(query) ? (
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={openLogTouch}>
                  Log message
                </Button>
                <Button type="button" size="sm" onClick={openLogCall}>
                  Log call
                </Button>
              </div>
            }
          />
          </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
        <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
          {items.map((row) => {
            const pending = row.outcome === 'pending';
            return (
              <li key={row.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => void openRow(row)}
                  className={cn(
                    'flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40',
                    row.unread && 'bg-primary/5',
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.unread ? (
                        <span className="size-2 rounded-full bg-primary" aria-label="Unread" />
                      ) : null}
                      <span className="font-semibold tracking-tight">
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
                      {messagePreviewText(row)}
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
                        {row.rawPayloadJson?.widgetId ? (
                          <DropdownMenuItem
                            onClick={() => {
                              navigate(
                                `${AGENCY_ROUTES.settingsInboxChatflows}/${row.rawPayloadJson!.widgetId}`,
                              );
                            }}
                          >
                            Open chatflow
                          </DropdownMenuItem>
                        ) : null}
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
                        {REPLYABLE_CHANNELS.has(row.channel) &&
                        inboxChannelReplyReady(row.channel, connectorReadiness) ? (
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
        </div>
      )}

      </div>

      {threadMenu ? (
        <div
          className="fixed z-[80] min-w-[12.5rem] overflow-hidden rounded-xl border border-border/70 bg-popover p-1 text-popover-foreground shadow-lg"
          style={{
            left: Math.min(threadMenu.x, window.innerWidth - 220),
            top: Math.min(threadMenu.y, window.innerHeight - 260),
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40"
            onClick={() => {
              const t = threadMenu.thread;
              setThreadMenu(null);
              void openThread(t);
            }}
          >
            Open chat
          </button>
          <button
            type="button"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40"
            disabled={!threadMenu.thread.conversationId || threadMenu.thread.unreadCount === 0}
            onClick={() => {
              const t = threadMenu.thread;
              setThreadMenu(null);
              void markThreadRead(t);
            }}
          >
            Mark as read
          </button>
          <button
            type="button"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40"
            disabled={!threadMenu.thread.conversationId}
            onClick={() => {
              const t = threadMenu.thread;
              setThreadMenu(null);
              void markThreadUnread(t);
            }}
          >
            Mark as unread
          </button>
          <div className="my-1 h-px bg-border/70" />
          <button
            type="button"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40"
            disabled={!threadMenu.thread.conversationId}
            onClick={() => {
              const t = threadMenu.thread;
              setThreadMenu(null);
              void claimThread(t);
            }}
          >
            Claim conversation
          </button>
          <button
            type="button"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              const t = threadMenu.thread;
              setThreadMenu(null);
              void openThread(t).then(() => {
                openTravelRequest(
                  {
                    channelKey: t.channel || 'website',
                    conversationId: t.conversationId,
                    partyId: t.partyId ?? undefined,
                    partyLabel: t.label,
                  },
                  { onCreated: () => void load() },
                );
              });
            }}
          >
            New travel request
          </button>
        </div>
      ) : null}

      <RecordSheet
        open={callLogOpen}
        onOpenChange={setCallLogOpen}
        title="Log call"
        description="Record a phone conversation — it appears in Inbox and the customer timeline."
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setCallLogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={callLogSaving || !callLogNotes.trim()}
              onClick={() => void submitLogCall()}
            >
              {callLogSaving ? 'Saving…' : 'Save call'}
            </Button>
          </>
        }
      >
        <div className="space-y-2.5">
          {conversationDetail?.party?.displayName ? (
            <div className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-sm">
              <span className="font-medium text-foreground">
                {conversationDetail.party.displayName}
              </span>
              {conversationDetail.party.phone ? (
                <span className="text-muted-foreground"> · {conversationDetail.party.phone}</span>
              ) : null}
            </div>
          ) : null}
          <FormField label="Call notes" required>
            <Textarea
              value={callLogNotes}
              onChange={(e) => setCallLogNotes(e.target.value)}
              placeholder="What did they ask about? Any follow-up needed?"
              rows={3}
              autoFocus
            />
          </FormField>
        </div>
      </RecordSheet>

      <RecordSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        title="Log message"
        description="Capture an inbound touch without opening a travel request yet."
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={logSaving} onClick={() => void saveLogTouch()}>
              {logSaving ? 'Saving…' : 'Save message'}
            </Button>
          </>
        }
      >
        <div className="space-y-2.5">
          <FormGrid className="gap-x-3 gap-y-3">
            <FormField label="Channel">
              <Combobox
                size="sm"
                value={logForm.channel}
                onChange={(channel) =>
                  setLogForm({
                    ...logForm,
                    channel: channel as (typeof LOG_CHANNELS)[number]['value'],
                  })
                }
                options={LOG_CHANNELS.map((c) => ({ value: c.value, label: c.label }))}
                searchable={false}
              />
            </FormField>
            <FormField label="How did they find us?">
              <Combobox
                size="sm"
                value={logForm.acquisitionKey || ''}
                onChange={(acquisitionKey) => setLogForm({ ...logForm, acquisitionKey })}
                placeholder="Optional"
                options={[
                  { value: '', label: 'Not sure' },
                  ...acquisitionOptions.map((o) => ({ value: o.value, label: o.label })),
                ]}
                searchable={acquisitionOptions.length > 6}
              />
            </FormField>
          </FormGrid>
          <FormGrid className="gap-x-3 gap-y-3">
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
          </FormGrid>
          {logForm.partyId ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-sm">
              <span>
                Linked to <span className="font-medium">{logForm.partyLabel}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setLogForm({ ...logForm, partyId: '', partyLabel: '' })}
              >
                Change
              </Button>
            </div>
          ) : partyMatch ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-sm">
              <span>
                Existing: <span className="font-medium">{partyMatch.displayName}</span>
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2"
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
            <Textarea
              value={logForm.summary}
              onChange={(e) => setLogForm({ ...logForm, summary: e.target.value })}
              placeholder="What did they ask about?"
              rows={2}
            />
          </FormField>
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
          <div className="stack-form">
            <FormField label="Follow up on">
              <DatePicker
                value={followUpAt}
                onChange={setFollowUpAt}
                disablePast
              />
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
    </QueuePageChrome>
  );
}
