import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlarmClock,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDashed,
  CircleUserRound,
  Copy,
  FilePlus2,
  Flag,
  GitBranch,
  Import,
  LayoutGrid,
  List,
  Megaphone,
  MoreHorizontal,
  Pin,
  Plus,
  Radio,
  Search,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { PUBLIC_DOCS_BRING_YOUR_DATA_HREF } from '../lib/publicDocs';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { composeLeadTitle, displayLeadTitle } from '../lib/composeLeadTitle';
import {
  formatLeadFollowUp,
  formatLeadSourceName,
  ownerInitials,
  ownerShortName,
} from '../lib/leadTableDisplay';
import {
  followUpFromPreset,
  followUpPresetOptions,
  presetFromFollowUp,
} from '../lib/leadFollowUpPresets';
import {
  canPinLeadsView,
  facetCountLabel,
  leadsApiQueryFromState,
  leadsFacetsApiQueryFromState,
  leadsPinLabel,
  leadsQueryHasFilters,
  leadsSortPatchFromSorting,
  leadsSortingFromQuery,
  parseLeadsQueryState,
  patchLeadsQueryParams,
  type LeadFacets,
} from '../lib/queue';
import {
  ActiveFilterChips,
  AttentionPresets,
  DisplayMenu,
  FilterMenu,
  SortMenu,
  QUEUE_MENU_ITEM_CLASS,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
  QueueViewToggle,
} from '../components/queue';
import { useSalesCrmSla } from '../hooks/useSalesCrmSla';
import { CreateLeadSchema, parseWithFieldErrors } from '@wayrune/contracts';
import {
  Button,
  DataTable,
  DatePicker,
  DateRangeFilter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmailInput,
  Input,
  usePageChrome,
  PhoneInput,
  PipelineBoard,
  RecordSheet,
  Skeleton,
  SimpleFormField as FormField,
  StatusBadge,
  statusMeta,
  SuggestionChips,
  toastError,
  toastSuccess,
  StorageKeys,
  LegacyStorageKeys,
  localStorageKit,
  RecordDialog,
  NATIONAL_PHONE_LENGTH,
  splitPhone,
  cn,
  Avatar,
  AvatarFallback,
  formatDate,
  type DateRangeValue,
  type PipelineColumnData,
} from '@wayrune/ui';
import type { VisibilityState } from '@tanstack/react-table';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useCanonicalCreateVisibility } from '../hooks/useCanonicalCreateVisibility';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { LEADS_PAGE_COPY } from '../lib/agencyPageVariants';
import { pinLeadsView } from '../lib/queue/navDeepPins';

type LeadRow = {
  id: string;
  title: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  priority: string;
  followUpAt?: string | Date | null;
  createdAt?: string | Date | null;
  partyId?: string | null;
  party?: { id: string; displayName?: string } | null;
  stage?: { id: string; name: string; key: string };
  source?: { name?: string; key?: string } | null;
  owner?: { fullName?: string } | null;
};

type Board = {
  columns: PipelineColumnData[];
};

const BOARD_PAGE_SIZE = 10;

const INTEREST_OPTIONS = [
  { value: 'Honeymoon', label: 'Honeymoon' },
  { value: 'Family', label: 'Family' },
  { value: 'Weekend', label: 'Weekend' },
  { value: 'Goa', label: 'Goa' },
  { value: 'Kerala', label: 'Kerala' },
  { value: 'Corporate', label: 'Corporate' },
  { value: 'International', label: 'International' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** Marketing / channel sources shown in UI (system keys like manual/csv stay hidden). */
const SOURCE_PRIMARY_KEYS = ['phone', 'whatsapp', 'website', 'walk_in', 'referral', 'google'] as const;
const SOURCE_UI_HIDDEN = new Set(['manual', 'csv', 'existing_customer']);
const PAID_SOURCE_KEYS = new Set(['google', 'facebook', 'instagram']);

const SOURCE_OPTIONS = [
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'website_widget', label: 'Website Widget' },
  { value: 'unknown', label: 'Unknown' },
];

type PartyMatch = {
  id: string;
  displayName: string;
  phone?: string | null;
  email?: string | null;
  _count?: { inquiries?: number; trips?: number };
};

function partyMatchMeta(match: PartyMatch): string {
  const parts: string[] = [];
  const trips = match._count?.trips ?? 0;
  const inquiries = match._count?.inquiries ?? 0;
  if (trips > 0) parts.push(`${trips} active trip${trips === 1 ? '' : 's'}`);
  if (inquiries > 0) {
    parts.push(`${inquiries} open enquir${inquiries === 1 ? 'y' : 'ies'}`);
  }
  if (!parts.length && match.phone) return match.phone;
  return parts.join(' · ');
}

function hasUsablePhone(phone: string) {
  return splitPhone(phone).national.length === NATIONAL_PHONE_LENGTH;
}

function hasUsableEmail(email: string) {
  const trimmed = email.trim();
  return trimmed.includes('@') && trimmed.length >= 5;
}

const emptyForm = {
  title: '',
  contactName: '',
  email: '',
  phone: '',
  partyId: '' as string,
  priority: 'normal',
  sourceKey: 'manual',
  campaignId: '' as string,
  followUpAt: undefined as Date | undefined,
  interests: [] as string[],
  titleTouched: false,
};

function readLeadsView(): 'board' | 'table' {
  localStorageKit.migrateFrom(LegacyStorageKeys.leadsView, StorageKeys.leads.view);
  const stored = localStorageKit.getItem(StorageKeys.leads.view);
  if (stored === 'board' || stored === 'table') return stored;
  return 'board';
}

function writeLeadsView(view: 'board' | 'table') {
  localStorageKit.setItem(StorageKeys.leads.view, view);
}

function readLeadsColumnVisibility(): VisibilityState {
  const defaults: VisibilityState = { email: false, createdAt: false };
  const stored = localStorageKit.getJson<VisibilityState>(StorageKeys.leads.columns, {
    version: 1,
  });
  if (!stored || typeof stored !== 'object') return defaults;

  // One-time ops layout: phone/follow-up/owner/source on; email optional.
  if (!stored.layoutV2) {
    const migrated: VisibilityState = {
      email: stored.email === true,
      layoutV2: true,
    };
    localStorageKit.setJson(StorageKeys.leads.columns, migrated, { version: 1 });
    return migrated;
  }

  return { ...defaults, ...stored };
}

export function LeadsPage() {
  const copy = LEADS_PAGE_COPY;
  useDocumentTitle(copy.documentTitle);
  const { navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canLeadWrite = hasAny(CAP.leadWrite);
  const showSalesSla = hasAny(['lead.read', 'lead.read.own', 'inquiry.read']);
  const showNewLead = useCanonicalCreateVisibility('lead');
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(
    () => parseLeadsQueryState(searchParams, readLeadsView()),
    [searchParams],
  );
  const { data: slaData } = useSalesCrmSla(showSalesSla);
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    readLeadsColumnVisibility(),
  );

  function applyQuery(patch: Parameters<typeof patchLeadsQueryParams>[1]) {
    setSearchParams(patchLeadsQueryParams(searchParams, patch), { replace: true });
  }

  function changeView(next: 'board' | 'table') {
    writeLeadsView(next);
    applyQuery({ view: next });
  }

  /** Seed `?view=` when missing. */
  useEffect(() => {
    if (searchParams.get('view') === 'board' || searchParams.get('view') === 'table') return;
    applyQuery({ view: query.view });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydrate
  }, []);

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

  function onDueRangeChange(next: DateRangeValue) {
    applyQuery({
      followUp: undefined,
      followUpFrom: next.from,
      followUpTo: next.to,
      followUpPeriod: next.presetId,
    });
  }

  const [board, setBoard] = useState<Board | null>(null);
  const boardRef = useRef(board);
  const [items, setItems] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreByStage, setLoadingMoreByStage] = useState<Record<string, boolean>>({});
  const loadingMoreRef = useRef<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingMove, setPendingMove] = useState<{
    leadId: string;
    fromStageKey: string;
    toStageKey: string;
  } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState(
    'title,contactName,email,phone\nGoa enquiry,Priya,priya@example.com,9876543210',
  );
  const [importing, setImporting] = useState(false);
  const [sourceOptions, setSourceOptions] = useState(SOURCE_OPTIONS);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [ownerOptions, setOwnerOptions] = useState<
    Array<{ value: string; label: string; icon?: typeof UserRound }>
  >([
    { value: 'me', label: 'Me', icon: CircleUserRound },
    { value: 'unassigned', label: 'Unassigned', icon: CircleDashed },
  ]);
  const [facets, setFacets] = useState<LeadFacets | null>(null);
  const facetsCacheRef = useRef(new Map<string, LeadFacets>());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [moreSourcesOpen, setMoreSourcesOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [partyMatch, setPartyMatch] = useState<PartyMatch | null>(null);
  const matchRequestId = useRef(0);

  const { sourcePrimaryOptions, sourceMoreOptions } = useMemo(() => {
    const byKey = new Map(sourceOptions.map((o) => [o.value, o]));
    const primaryKeys = SOURCE_PRIMARY_KEYS as readonly string[];
    const primary = primaryKeys
      .map((key) => byKey.get(key))
      .filter((o): o is { value: string; label: string } => Boolean(o));
    const primarySet = new Set(primary.map((o) => o.value));
    const more = sourceOptions.filter(
      (o) => !primarySet.has(o.value) && !SOURCE_UI_HIDDEN.has(o.value),
    );
    return {
      sourcePrimaryOptions: primary.length
        ? primary
        : SOURCE_OPTIONS.filter((o) => primaryKeys.includes(o.value)),
      sourceMoreOptions: more.length
        ? more
        : SOURCE_OPTIONS.filter((o) => !primaryKeys.includes(o.value)),
    };
  }, [sourceOptions]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    loadingMoreRef.current = loadingMoreByStage;
  }, [loadingMoreByStage]);

  function resetLeadSheetUi() {
    setDetailsOpen(false);
    setMoreSourcesOpen(false);
    setCampaignOpen(false);
    setPartyMatch(null);
    setFieldErrors({});
  }

  function patchForm(patch: Partial<typeof emptyForm>) {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!next.titleTouched && ('contactName' in patch || 'interests' in patch)) {
        next.title = composeLeadTitle({
          contactName: next.contactName,
          interests: next.interests,
        });
      }
      if ('sourceKey' in patch && patch.sourceKey && PAID_SOURCE_KEYS.has(patch.sourceKey)) {
        setCampaignOpen(true);
        setDetailsOpen(true);
      }
      return next;
    });
    setFieldErrors((errs) => {
      const next = { ...errs };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  }

  function toggleInterest(label: string) {
    setForm((f) => {
      const interests = f.interests.includes(label)
        ? f.interests.filter((i) => i !== label)
        : [...f.interests, label];
      const title = f.titleTouched
        ? f.title
        : composeLeadTitle({ contactName: f.contactName, interests });
      return { ...f, interests, title };
    });
  }

  function useExistingParty(match: PartyMatch) {
    setForm((f) => ({
      ...f,
      partyId: match.id,
      contactName: match.displayName || f.contactName,
      email: match.email || f.email,
      phone: match.phone || f.phone,
      title: f.titleTouched
        ? f.title
        : composeLeadTitle({
            contactName: match.displayName || f.contactName,
            interests: f.interests,
          }),
    }));
    setPartyMatch(null);
  }

  useEffect(() => {
    if (!open) return;
    const phone = form.phone.trim();
    const email = form.email.trim();
    const { national } = splitPhone(phone);
    const phoneReady = national.length === NATIONAL_PHONE_LENGTH;
    const emailReady = email.includes('@') && email.length >= 5;
    if (form.partyId || (!phoneReady && !emailReady)) {
      setPartyMatch(null);
      return;
    }

    const requestId = ++matchRequestId.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const queries = [
            ...(phoneReady ? [national, phone.replace(/\D/g, '')] : []),
            ...(emailReady ? [email] : []),
          ];
          let match: PartyMatch | null = null;
          for (const q of queries) {
            const res = await api<{ items: PartyMatch[] }>(
              `/parties?pageSize=5&q=${encodeURIComponent(q)}`,
            );
            if (requestId !== matchRequestId.current) return;
            match =
              res.items.find((p) => {
                if (phoneReady && p.phone) {
                  const digits = p.phone.replace(/\D/g, '');
                  if (digits.endsWith(national) || digits.includes(national)) return true;
                }
                if (emailReady && p.email && p.email.toLowerCase() === email.toLowerCase()) {
                  return true;
                }
                return false;
              }) ?? null;
            if (match) break;
          }
          setPartyMatch(match);
        } catch {
          if (requestId === matchRequestId.current) setPartyMatch(null);
        }
      })();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [open, form.phone, form.email, form.partyId]);

  async function load() {
    setLoading(true);
    try {
      const filterQs = leadsApiQueryFromState(query, { pageSize: 100 });
      const boardQs = leadsApiQueryFromState(query, { pageSize: BOARD_PAGE_SIZE });
      const facetsQs = leadsFacetsApiQueryFromState(query);
      const cachedFacets = facetsCacheRef.current.get(facetsQs);
      if (cachedFacets) setFacets(cachedFacets);

      const metaPromise = Promise.all([
        api<Array<{ key: string; name: string; isActive: boolean }>>('/lead-sources').catch(
          () => [],
        ),
        api<Array<{ id: string; name: string }>>('/campaigns').catch(() => []),
        api<Array<{ id: string; fullName: string; isActive?: boolean }>>('/access/members').catch(
          () => [],
        ),
        cachedFacets
          ? Promise.resolve(cachedFacets)
          : api<LeadFacets>(`/leads/facets?${facetsQs}`).catch(() => null),
      ]);

      const applyMeta = (
        sourcesRes: Array<{ key: string; name: string; isActive: boolean }>,
        campaignsRes: Array<{ id: string; name: string }>,
        membersRes: Array<{ id: string; fullName: string; isActive?: boolean }>,
        facetsRes: LeadFacets | null,
      ) => {
        if (sourcesRes.length) {
          setSourceOptions(
            sourcesRes
              .filter((s) => s.isActive !== false && !SOURCE_UI_HIDDEN.has(s.key))
              .map((s) => ({ value: s.key, label: s.name })),
          );
        }
        setCampaigns(campaignsRes);
        setOwnerOptions([
          { value: 'me', label: 'Me', icon: CircleUserRound },
          { value: 'unassigned', label: 'Unassigned', icon: CircleDashed },
          ...membersRes
            .filter((m) => m.isActive !== false)
            .map((m) => ({
              value: m.id,
              label: m.fullName,
              icon: UserRound,
            })),
        ]);
        if (facetsRes) {
          facetsCacheRef.current.set(facetsQs, facetsRes);
          // Bound cache growth for long-lived tabs.
          if (facetsCacheRef.current.size > 24) {
            const first = facetsCacheRef.current.keys().next().value;
            if (first) facetsCacheRef.current.delete(first);
          }
          setFacets(facetsRes);
        }
      };

      if (query.view === 'board') {
        const [boardRes, [sourcesRes, campaignsRes, membersRes, facetsRes]] = await Promise.all([
          api<Board>(`/leads/board?${boardQs}`),
          metaPromise,
        ]);
        setBoard(boardRes);
        applyMeta(sourcesRes, campaignsRes, membersRes, facetsRes);
      } else {
        const [listRes, [sourcesRes, campaignsRes, membersRes, facetsRes]] = await Promise.all([
          api<{ items: LeadRow[] }>(`/leads?${filterQs}`),
          metaPromise,
        ]);
        setItems(listRes.items);
        // Keep board stages for filter options / moves when on table
        if (!board) {
          const boardRes = await api<Board>(
            `/leads/board?pageSize=${BOARD_PAGE_SIZE}`,
          ).catch(() => null);
          if (boardRes) setBoard(boardRes);
        }
        applyMeta(sourcesRes, campaignsRes, membersRes, facetsRes);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when queue URL changes
  }, [
    query.view,
    query.owner,
    query.followUp,
    query.followUpFrom,
    query.followUpTo,
    query.stage,
    query.priority,
    query.source,
    query.campaign,
    query.q,
  ]);

  async function convertToClient(lead: LeadRow) {
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

  async function importCsv() {
    const lines = importText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      toastError('Paste a header row plus at least one data row');
      return;
    }
    const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
    const titleIdx = headers.indexOf('title');
    const nameIdx = headers.indexOf('contactname') >= 0
      ? headers.indexOf('contactname')
      : headers.indexOf('name');
    const emailIdx = headers.indexOf('email');
    const phoneIdx = headers.indexOf('phone');
    if (titleIdx < 0 && nameIdx < 0) {
      toastError('CSV must include a title or contactName/name column');
      return;
    }
    const rows = lines
      .slice(1)
      .map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        const contactName = nameIdx >= 0 ? cols[nameIdx] || undefined : undefined;
        const title =
          (titleIdx >= 0 ? cols[titleIdx] : '') ||
          contactName ||
          '';
        return {
          title,
          contactName,
          email: emailIdx >= 0 ? cols[emailIdx] || undefined : undefined,
          phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
        };
      })
      .filter((r) => r.title);

    if (!rows.length) {
      toastError('No valid rows found');
      return;
    }

    setImporting(true);
    try {
      const res = await api<{ imported: number }>('/leads/import/csv', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      toastSuccess(`Imported ${res.imported} lead${res.imported === 1 ? '' : 's'}`);
      setImportOpen(false);
      facetsCacheRef.current.clear();
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const onLoadMore = useCallback(async (stageKey: string) => {
    const col = boardRef.current?.columns.find((c) => c.stage.key === stageKey);
    if (!col?.hasMore || loadingMoreRef.current[stageKey]) return;

    const nextPage = (col.page ?? 1) + 1;
    setLoadingMoreByStage((m) => ({ ...m, [stageKey]: true }));
    try {
      const filterQs = new URLSearchParams(
        leadsApiQueryFromState(query, { pageSize: BOARD_PAGE_SIZE }),
      );
      filterQs.set('stageKey', stageKey);
      filterQs.set('page', String(nextPage));
      const res = await api<{ items: LeadRow[]; total: number; page: number; pageSize: number }>(
        `/leads?${filterQs.toString()}`,
      );
      setBoard((current) => {
        if (!current) return current;
        return {
          ...current,
          columns: current.columns.map((column) => {
            if (column.stage.key !== stageKey) return column;
            const seen = new Set(column.leads.map((l) => l.id));
            const appended = res.items
              .filter((item) => !seen.has(item.id))
              .map((item) => ({
                id: item.id,
                title: item.title,
                contactName: item.contactName,
                email: item.email,
                phone: item.phone,
                priority: item.priority,
                owner: item.owner,
              }));
            const leads = [...column.leads, ...appended];
            return {
              ...column,
              leads,
              page: res.page,
              pageSize: res.pageSize,
              total: res.total,
              hasMore: leads.length < res.total,
            };
          }),
        };
      });
    } catch (e) {
      reportError(e, 'Could not load more leads');
    } finally {
      setLoadingMoreByStage((m) => ({ ...m, [stageKey]: false }));
    }
  }, [query]);

  async function createLead() {
    const phoneOk = hasUsablePhone(form.phone);
    const emailOk = hasUsableEmail(form.email);
    if (!phoneOk && !emailOk) {
      setFieldErrors({
        phone: 'Phone or email is required.',
        email: 'Phone or email is required.',
      });
      toastError('Phone or email is required');
      return;
    }
    const title =
      (form.titleTouched ? form.title.trim() : '') ||
      composeLeadTitle({ contactName: form.contactName, interests: form.interests });
    const parsed = parseWithFieldErrors(CreateLeadSchema, {
      title,
      contactName: form.contactName || null,
      email: form.email || null,
      phone: phoneOk ? form.phone : null,
      partyId: form.partyId || null,
      priority: form.priority || 'normal',
      sourceKey: form.sourceKey || 'manual',
      campaignId: form.campaignId || null,
      followUpAt: form.followUpAt?.toISOString() ?? null,
      tags: form.interests.length ? form.interests : undefined,
    });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await api<{
        lead?: { id: string; owner?: { fullName?: string } | null };
        duplicates?: Array<{ id: string; title: string }>;
      }>('/leads', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      const dupCount = res.duplicates?.length ?? 0;
      const ownerName = res.lead?.owner?.fullName?.trim();
      toastSuccess(
        dupCount
          ? `Lead created${ownerName ? ` · ${ownerName}` : ''} · ${dupCount} possible duplicate${dupCount === 1 ? '' : 's'} found — open the lead to merge`
          : ownerName
            ? `Lead created · assigned to ${ownerName}`
            : 'Lead created',
      );
      setForm(emptyForm);
      resetLeadSheetUi();
      setOpen(false);
      facetsCacheRef.current.clear();
      await load();
      if (res.lead?.id && dupCount) {
        // Leave user on list; they can open the new lead to merge.
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create lead');
    } finally {
      setSubmitting(false);
    }
  }

  const onMove = useCallback(
    async ({ leadId, toStageKey, fromStageKey }: { leadId: string; fromStageKey: string; toStageKey: string }, lostReasonValue?: string) => {
      const target = boardRef.current?.columns.find((c) => c.stage.key === toStageKey);
      const requiresLost = Boolean(target?.stage.isLost || toStageKey === 'lost');

      if (requiresLost && !lostReasonValue?.trim()) {
        setPendingMove({ leadId, fromStageKey, toStageKey });
        setLostReason('');
        setLostOpen(true);
        // Revert optimistic board by reloading
        const boardRes = await api<Board>(`/leads/board?pageSize=${BOARD_PAGE_SIZE}`);
        setBoard(boardRes);
        throw new Error('lost_reason_required');
      }

      try {
        await api(`/leads/${leadId}/stage`, {
          method: 'POST',
          body: JSON.stringify({
            stageKey: toStageKey,
            ...(requiresLost ? { lostReason: lostReasonValue } : {}),
          }),
        });
        toastSuccess(requiresLost ? 'Lead marked Lost' : 'Stage updated');
        facetsCacheRef.current.clear();
        const [boardRes, listRes, facetsRes] = await Promise.all([
          api<Board>(`/leads/board?pageSize=${BOARD_PAGE_SIZE}`),
          api<{ items: LeadRow[] }>('/leads?pageSize=100'),
          api<LeadFacets>(`/leads/facets?${leadsFacetsApiQueryFromState(query)}`).catch(() => null),
        ]);
        setBoard(boardRes);
        setItems(listRes.items);
        if (facetsRes) setFacets(facetsRes);
      } catch (e) {
        if (e instanceof Error && e.message === 'lost_reason_required') throw e;
        toastError(e instanceof Error ? e.message : 'Could not update stage');
        throw e;
      }
    },
    [query],
  );

  async function confirmBoardLost() {
    if (!pendingMove) return;
    if (!lostReason.trim()) {
      toastError('Enter a lost reason');
      return;
    }
    try {
      await onMove(pendingMove, lostReason.trim());
      setLostOpen(false);
      setPendingMove(null);
      setLostReason('');
    } catch {
      // toast already shown
    }
  }

  const columns = useMemo<ColumnDef<LeadRow>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Lead',
        meta: { label: 'Lead' },
        enableHiding: false,
        size: 300,
        minSize: 200,
        cell: ({ row }) => (
          <Link
            className="line-clamp-2 font-medium text-primary hover:underline"
            to={`/leads/${row.original.id}`}
            title={displayLeadTitle(row.original.title)}
          >
            {displayLeadTitle(row.original.title)}
          </Link>
        ),
      },
      {
        id: 'contact',
        header: 'Contact',
        meta: { label: 'Contact' },
        size: 180,
        minSize: 130,
        accessorFn: (r) => r.contactName || '',
        cell: ({ row }) => (
          <span className="text-foreground/90">{row.original.contactName || '—'}</span>
        ),
      },
      {
        id: 'phone',
        header: 'Phone',
        meta: { label: 'Phone' },
        size: 180,
        minSize: 140,
        accessorFn: (r) => r.phone || '',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.phone || '—'}</span>
        ),
      },
      {
        id: 'stage',
        accessorFn: (r) => r.stage?.key || '',
        header: 'Stage',
        meta: { label: 'Stage' },
        size: 180,
        minSize: 140,
        sortingFn: (a, b) => {
          const left = a.original.stage?.name || a.original.stage?.key || '';
          const right = b.original.stage?.name || b.original.stage?.key || '';
          return left.localeCompare(right);
        },
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.stage?.key || 'new'}
            label={row.original.stage?.name}
          />
        ),
      },
      {
        id: 'followUp',
        header: 'Next follow-up',
        meta: { label: 'Next follow-up' },
        size: 180,
        minSize: 140,
        accessorFn: (r) => formatLeadFollowUp(r.followUpAt).sortValue,
        cell: ({ row }) => {
          const display = formatLeadFollowUp(row.original.followUpAt);
          return (
            <span
              className={cn(
                'text-[length:var(--control-text-sm)]',
                display.tone === 'danger' && 'font-medium text-destructive',
                display.tone === 'warn' && 'font-medium text-amber-700 dark:text-amber-400',
                display.tone === 'muted' && 'text-muted-foreground',
                display.tone === 'default' && 'text-foreground/90',
              )}
            >
              {display.label}
            </span>
          );
        },
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner' },
        size: 150,
        minSize: 120,
        accessorFn: (r) => r.owner?.fullName || '',
        cell: ({ row }) => {
          const name = row.original.owner?.fullName?.trim();
          if (!name) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="inline-flex min-w-0 items-center gap-2">
              <Avatar className="size-6 shrink-0">
                <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
                  {ownerInitials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-foreground/90">{ownerShortName(name)}</span>
            </span>
          );
        },
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        meta: { label: 'Priority' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => {
          const priority = row.original.priority || 'normal';
          if (priority === 'normal' || priority === 'low') {
            return (
              <span className="text-[length:var(--control-text-sm)] text-muted-foreground">
                {priority === 'low' ? 'Low' : 'Normal'}
              </span>
            );
          }
          return <StatusBadge value={priority} />;
        },
      },
      {
        id: 'source',
        header: 'Source',
        meta: { label: 'Source' },
        size: 140,
        minSize: 110,
        accessorFn: (r) => formatLeadSourceName(r.source),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatLeadSourceName(row.original.source)}</span>
        ),
      },
      {
        id: 'email',
        header: 'Email',
        meta: { label: 'Email' },
        size: 200,
        minSize: 140,
        accessorFn: (r) => r.email || '',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email || '—'}</span>
        ),
      },
      {
        id: 'createdAt',
        header: 'Created',
        meta: { label: 'Created' },
        size: 140,
        minSize: 110,
        accessorFn: (r) => {
          if (!r.createdAt) return 0;
          const t = new Date(r.createdAt).getTime();
          return Number.isNaN(t) ? 0 : t;
        },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.createdAt ? formatDate(row.original.createdAt) : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 44,
        minSize: 44,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        cell: ({ row }) => {
          const lead = row.original;
          const title = displayLeadTitle(lead.title);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Lead actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-[length:var(--control-text-sm)] font-medium normal-case tracking-normal text-foreground">
                  {title}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={QUEUE_MENU_ITEM_CLASS}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                >
                  <ArrowUpRight />
                  Open lead
                </DropdownMenuItem>
                <Can anyOf={CAP.leadWrite}>
                  {lead.partyId || lead.party?.id ? (
                    <DropdownMenuItem
                      disabled
                      className={QUEUE_MENU_ITEM_CLASS}
                    >
                      <UserPlus />
                      Linked to {lead.party?.displayName || 'client'}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className={QUEUE_MENU_ITEM_CLASS}
                      onClick={() => void convertToClient(lead)}
                    >
                      <UserPlus />
                      Convert to client
                    </DropdownMenuItem>
                  )}
                </Can>
                <Can anyOf={CAP.inquiryWrite}>
                  <DropdownMenuItem
                    className={QUEUE_MENU_ITEM_CLASS}
                    onClick={() => navigate(`/leads/${lead.id}?createInquiry=1`)}
                  >
                    <FilePlus2 />
                    Convert to inquiry
                  </DropdownMenuItem>
                </Can>
                {lead.email ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className={QUEUE_MENU_ITEM_CLASS}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lead.email!);
                          toastSuccess('Email copied');
                        } catch {
                          toastError('Could not copy email');
                        }
                      }}
                    >
                      <Copy />
                      Copy email
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [navigate],
  );

  function clearLeadFilters() {
    applyQuery({ clearFilters: true });
  }

  /** Empty-state reset: drop filters and search so results can show again. */
  function clearLeadFiltersAndSearch() {
    setSearchDraft('');
    applyQuery({ clearFilters: true, q: '' });
  }

  const dueRange: DateRangeValue = {
    from: query.followUpFrom ?? null,
    to: query.followUpTo ?? null,
    presetId: query.followUpPeriod ?? null,
  };

  const stageOptions = (board?.columns || []).map((c) => {
    const meta = statusMeta(c.stage.key);
    return {
      value: c.stage.key,
      label: c.stage.name,
      icon: meta.Icon,
    };
  });

  const filterDefs = useMemo(
    () => [
      {
        id: 'owner',
        label: 'Owner',
        icon: UserRound,
        value: query.owner ?? null,
        options: ownerOptions.map((o) => ({
          ...o,
          countLabel: facetCountLabel(facets, 'owner', o.value),
        })),
        onSelect: (value: string | null) => applyQuery({ owner: value || undefined }),
      },
      {
        id: 'followUp',
        label: 'Follow-up',
        icon: AlarmClock,
        value: query.followUp ?? null,
        options: [
          {
            value: 'overdue',
            label: 'Overdue',
            icon: statusMeta('overdue').Icon,
            countLabel: facetCountLabel(facets, 'followUp', 'overdue'),
          },
          {
            value: 'none',
            label: 'Not scheduled',
            icon: CircleDashed,
            countLabel: facetCountLabel(facets, 'followUp', 'none'),
          },
        ],
        onSelect: (value: string | null) =>
          applyQuery(
            value === 'overdue' || value === 'none'
              ? { followUp: value }
              : { followUp: undefined },
          ),
      },
      {
        id: 'stage',
        label: 'Stage',
        icon: GitBranch,
        value: query.stage ?? null,
        options: stageOptions.map((o) => ({
          ...o,
          countLabel: facetCountLabel(facets, 'stage', o.value),
        })),
        onSelect: (value: string | null) => applyQuery({ stage: value || undefined }),
      },
      {
        id: 'priority',
        label: 'Priority',
        icon: Flag,
        value: query.priority ?? null,
        options: (['low', 'normal', 'high', 'urgent'] as const).map((value) => {
          const meta = statusMeta(value);
          return {
            value,
            label: meta.label,
            icon: meta.Icon,
            countLabel: facetCountLabel(facets, 'priority', value),
          };
        }),
        onSelect: (value: string | null) => applyQuery({ priority: value || undefined }),
      },
      {
        id: 'source',
        label: 'Source',
        icon: Radio,
        value: query.source ?? null,
        options: sourceOptions.map((o) => ({
          value: o.value,
          label: o.label,
          icon: Radio,
          countLabel: facetCountLabel(facets, 'source', o.value),
        })),
        onSelect: (value: string | null) => applyQuery({ source: value || undefined }),
      },
      ...(campaigns.length
        ? [
            {
              id: 'campaign',
              label: 'Campaign',
              icon: Megaphone,
              value: query.campaign ?? null,
              options: campaigns.map((c) => ({
                value: c.id,
                label: c.name,
                icon: Megaphone,
                countLabel: facetCountLabel(facets, 'campaign', c.id),
              })),
              onSelect: (value: string | null) => applyQuery({ campaign: value || undefined }),
            },
          ]
        : []),
    ],
    [
      campaigns,
      facets,
      ownerOptions,
      query.campaign,
      query.followUp,
      query.owner,
      query.priority,
      query.source,
      query.stage,
      sourceOptions,
      stageOptions,
    ],
  );
  const filterChips = [
    query.followUp === 'overdue'
      ? {
          id: 'followUp',
          label: 'Overdue',
          onRemove: () => applyQuery({ followUp: undefined }),
        }
      : query.followUp === 'none'
        ? {
            id: 'followUp',
            label: 'Not scheduled',
            onRemove: () => applyQuery({ followUp: undefined }),
          }
        : null,
    query.owner === 'me'
      ? {
          id: 'owner',
          label: 'Owner: Me',
          onRemove: () => applyQuery({ owner: undefined }),
        }
      : query.owner === 'unassigned'
        ? {
            id: 'owner',
            label: 'Owner: Unassigned',
            onRemove: () => applyQuery({ owner: undefined }),
          }
        : query.owner
          ? {
              id: 'owner',
              label: `Owner: ${ownerOptions.find((o) => o.value === query.owner)?.label ?? query.owner}`,
              onRemove: () => applyQuery({ owner: undefined }),
            }
          : null,
    query.stage
      ? {
          id: 'stage',
          label: `Stage: ${stageOptions.find((s) => s.value === query.stage)?.label ?? query.stage}`,
          onRemove: () => applyQuery({ stage: undefined }),
        }
      : null,
    query.priority
      ? {
          id: 'priority',
          label: `Priority: ${query.priority}`,
          onRemove: () => applyQuery({ priority: undefined }),
        }
      : null,
    query.source
      ? {
          id: 'source',
          label: `Source: ${sourceOptions.find((s) => s.value === query.source)?.label ?? query.source}`,
          onRemove: () => applyQuery({ source: undefined }),
        }
      : null,
    query.campaign
      ? {
          id: 'campaign',
          label: `Campaign: ${campaigns.find((c) => c.id === query.campaign)?.name ?? 'Selected'}`,
          onRemove: () => applyQuery({ campaign: undefined }),
        }
      : null,
    query.followUpFrom || query.followUpTo
      ? {
          id: 'due',
          label: 'Due range',
          onRemove: () =>
            applyQuery({
              followUpFrom: null,
              followUpTo: null,
              followUpPeriod: null,
            }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const attentionPresets = [
    {
      id: 'overdue',
      label: 'overdue',
      count: slaData?.followUpsOverdue ?? 0,
      active: query.followUp === 'overdue',
      tone: 'danger' as const,
      onClick: () =>
        applyQuery({
          followUp: query.followUp === 'overdue' ? undefined : 'overdue',
        }),
    },
    {
      id: 'unread',
      label: 'unread',
      count: slaData?.inboxUnreadThreads ?? 0,
      tone: 'info' as const,
      onClick: () => navigate(`${AGENCY_ROUTES.inbox}?unread=1`),
    },
  ];

  const displayColumns = [
    { id: 'title', label: 'Lead', visible: columnVisibility.title !== false },
    { id: 'contact', label: 'Contact', visible: columnVisibility.contact !== false },
    { id: 'phone', label: 'Phone', visible: columnVisibility.phone !== false },
    { id: 'stage', label: 'Stage', visible: columnVisibility.stage !== false },
    { id: 'followUp', label: 'Next follow-up', visible: columnVisibility.followUp !== false },
    { id: 'owner', label: 'Owner', visible: columnVisibility.owner !== false },
    { id: 'priority', label: 'Priority', visible: columnVisibility.priority !== false },
    { id: 'source', label: 'Source', visible: columnVisibility.source !== false },
    { id: 'email', label: 'Email', visible: columnVisibility.email !== false },
    { id: 'createdAt', label: 'Created', visible: columnVisibility.createdAt !== false },
  ];

  function toggleColumn(id: string, visible: boolean) {
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible, layoutV2: true };
      localStorageKit.setJson(StorageKeys.leads.columns, next, { version: 1 });
      return next;
    });
  }

  const pageSubtitle =
    query.followUp === 'overdue'
      ? 'Open leads with overdue follow-ups'
      : query.followUp === 'none'
        ? 'Open leads with no follow-up scheduled'
        : query.owner === 'me'
          ? 'Leads assigned to you'
          : query.owner === 'unassigned'
            ? 'Leads with no owner'
            : copy.subtitle;

  usePageChrome({ title: copy.title, subtitle: pageSubtitle });

  const queueToolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search leads…"
          className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
          aria-label="Search leads"
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
        <DateRangeFilter
          pack="forward"
          value={dueRange}
          onChange={onDueRangeChange}
          emptyLabel="Any due date"
          data-testid="leads-due-range"
        />
        <FilterMenu filters={filterDefs} />
        {query.view === 'table' ? (
          <SortMenu
            options={[
              { id: 'title', label: 'Lead' },
              { id: 'contact', label: 'Contact' },
              { id: 'phone', label: 'Phone' },
              { id: 'stage', label: 'Stage' },
              { id: 'followUp', label: 'Next follow-up' },
              { id: 'owner', label: 'Owner' },
              { id: 'priority', label: 'Priority' },
              { id: 'source', label: 'Source' },
              { id: 'email', label: 'Email' },
              { id: 'createdAt', label: 'Created' },
            ]}
            value={{ sort: query.sort, dir: query.dir }}
            onChange={(next) =>
              applyQuery({
                sort: next.sort as typeof query.sort,
                dir: next.dir,
              })
            }
          />
        ) : null}
        {query.view === 'table' ? (
          <DisplayMenu columns={displayColumns} onToggleColumn={toggleColumn} />
        ) : null}
      </div>
    </div>
  );

  return (
    <QueuePageChrome
      viewToggle={
        <QueueViewToggle
          value={query.view}
          onChange={(id) => changeView(id as 'board' | 'table')}
          options={[
            {
              id: 'board',
              label: 'Board',
              icon: <LayoutGrid className="size-[0.875em]" />,
            },
            {
              id: 'table',
              label: 'Table',
              icon: <List className="size-[0.875em]" />,
            },
          ]}
        />
      }
      attention={
        showSalesSla ? <AttentionPresets presets={attentionPresets} /> : null
      }
      primaryActions={
        <Can anyOf={CAP.leadWrite}>
          {showNewLead ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-[0.875em]" />
              New lead
            </Button>
          ) : null}
        </Can>
      }
      moreMenu={
        <Can anyOf={CAP.leadWrite}>
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
              {canPinLeadsView(query) ? (
                <DropdownMenuItem
                  className={QUEUE_MENU_ITEM_CLASS}
                  onClick={() => {
                    pinLeadsView(
                      query,
                      `${window.location.pathname}${window.location.search}`,
                    );
                    toastSuccess('Pinned to sidebar');
                  }}
                >
                  <Pin />
                  Pin this view
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className={QUEUE_MENU_ITEM_CLASS}
                onClick={() => setImportOpen(true)}
              >
                <Import />
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                className={QUEUE_MENU_ITEM_CLASS}
                onClick={() => navigate(AGENCY_ROUTES.settingsLeadSources)}
              >
                Lead sources
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className={QUEUE_MENU_ITEM_CLASS}>
                <a
                  href={PUBLIC_DOCS_BRING_YOUR_DATA_HREF}
                  target="_blank"
                  rel="noreferrer"
                >
                  Import guide
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Can>
      }
      error={error ? <p className="text-sm text-destructive">{error}</p> : null}
      toolbar={queueToolbar}
      chips={
        <ActiveFilterChips
          chips={filterChips}
          onClear={leadsQueryHasFilters(query) ? clearLeadFilters : undefined}
        />
      }
    >
      {query.view === 'table' ? (
        <DataTable
          key={`cols-${JSON.stringify(columnVisibility)}`}
          columns={columns}
          data={items}
          loading={loading}
          pageSize={25}
          showSearch={false}
          showColumnsMenu={false}
          defaultColumnVisibility={columnVisibility}
          columnVisibilityKey={StorageKeys.leads.columns}
          sorting={leadsSortingFromQuery(query)}
          onSortingChange={(next) => applyQuery(leadsSortPatchFromSorting(next))}
          emptyTitle={leadsQueryHasFilters(query) || query.q ? 'No matching leads' : 'No leads yet'}
          emptyDescription={
            leadsQueryHasFilters(query) || query.q
              ? 'Try clearing filters or search.'
              : 'Create a lead to start your pipeline.'
          }
          emptyIcon={Users}
          emptyAction={
            leadsQueryHasFilters(query) || query.q ? (
              <Button type="button" size="sm" variant="outline" onClick={clearLeadFiltersAndSearch}>
                Clear filters
              </Button>
            ) : (
              <Can anyOf={CAP.leadWrite}>
                {showNewLead ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="size-4" />
                    New lead
                  </Button>
                ) : null}
              </Can>
            )
          }
        />
      ) : loading || !board ? (
        <div className="space-y-2" role="status" aria-busy="true">
          <span className="sr-only">Loading</span>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <div className="min-h-0 min-w-0 flex-1">
          <PipelineBoard
            className="h-full"
            columns={board.columns}
            onMove={
              canLeadWrite
                ? onMove
                : async () => {
                    const boardQs = leadsApiQueryFromState(query, {
                      pageSize: BOARD_PAGE_SIZE,
                    });
                    const boardRes = await api<Board>(`/leads/board?${boardQs}`);
                    setBoard(boardRes);
                  }
            }
            onLoadMore={onLoadMore}
            loadingMoreByStage={loadingMoreByStage}
            onOpen={(id) => navigate(`/leads/${id}`)}
          />
        </div>
      )}

      <Can anyOf={CAP.leadWrite}>
        {showNewLead ? (
        <Button
          className="fixed bottom-5 right-5 z-20 shadow-lg sm:hidden"
          size="lg"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" />
          New lead
        </Button>
        ) : null}
      </Can>

      <RecordSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            resetLeadSheetUi();
            setForm(emptyForm);
          }
        }}
        title="New lead"
        description="Add the basics now. You can complete the details later."
        submitLabel="Create lead"
        submitting={submitting}
        onSubmit={createLead}
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createLead();
          }}
          className="space-y-3"
        >
          <FormField
            label="Phone"
            htmlFor="lead-phone"
            required
            description="Phone or email is required."
            error={fieldErrors.phone}
          >
            <PhoneInput
              id="lead-phone"
              autoFocus
              value={form.phone}
              onChange={(phone) => {
                patchForm({ phone, partyId: '' });
              }}
              aria-invalid={Boolean(fieldErrors.phone)}
            />
          </FormField>

          {partyMatch && !form.partyId ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
              <p className="text-[length:var(--control-text-sm)] font-semibold text-foreground">
                Existing customer found
              </p>
              <p className="mt-1 text-[length:var(--control-text-sm)] font-medium text-foreground">
                {partyMatch.displayName}
              </p>
              {partyMatchMeta(partyMatch) ? (
                <p className="mt-0.5 text-[length:var(--control-text-sm)] text-muted-foreground">
                  {partyMatchMeta(partyMatch)}
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={() => useExistingParty(partyMatch)}
              >
                Use customer
              </Button>
            </div>
          ) : null}

          {form.partyId ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[length:var(--control-text-sm)]">
              <span className="min-w-0 truncate text-muted-foreground">
                Linked to <span className="font-medium text-foreground">{form.contactName || 'customer'}</span>
              </span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => patchForm({ partyId: '' })}
              >
                Unlink
              </button>
            </div>
          ) : null}

          <FormField label="Contact person" htmlFor="lead-contact" error={fieldErrors.contactName}>
            <Input
              id="lead-contact"
              value={form.contactName}
              onChange={(e) => patchForm({ contactName: e.target.value })}
              placeholder="Traveller or decision-maker name"
              aria-invalid={Boolean(fieldErrors.contactName)}
            />
          </FormField>

          <FormField label="Email" htmlFor="lead-email" error={fieldErrors.email}>
            <EmailInput
              id="lead-email"
              value={form.email}
              onChange={(email) => {
                patchForm({ email, ...(form.partyId ? { partyId: '' } : {}) });
              }}
              placeholder="name@…"
              maxVisibleDomains={3}
              aria-invalid={Boolean(fieldErrors.email)}
            />
          </FormField>

          <FormField
            label="Trip request"
            htmlFor="lead-title"
            error={fieldErrors.title}
            description="Select what they’re interested in, then add any details."
          >
            <div
              role="group"
              aria-label="Trip interests"
              className="mb-2 flex flex-wrap gap-2"
            >
              {INTEREST_OPTIONS.map((opt) => {
                const selected = form.interests.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleInterest(opt.value)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[length:var(--control-text-sm)] font-semibold transition-colors',
                      selected
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-white/50 bg-white/35 text-foreground backdrop-blur-md hover:border-primary/40 hover:bg-white/55 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
                    )}
                  >
                    {selected ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <Input
              id="lead-title"
              value={form.title}
              onChange={(e) => patchForm({ title: e.target.value, titleTouched: true })}
              placeholder="e.g. Goa honeymoon for the Sharma family"
              aria-invalid={Boolean(fieldErrors.title)}
            />
          </FormField>

          <FormField
            label="Follow-up"
            description="Optional — keeps this lead from being forgotten."
            error={fieldErrors.followUpAt}
          >
            <SuggestionChips
              aria-label="Follow-up date"
              options={followUpPresetOptions(form.followUpAt)}
              value={presetFromFollowUp(form.followUpAt)}
              onChange={(preset) => {
                if (preset === 'custom') return;
                patchForm({
                  followUpAt: preset ? followUpFromPreset(preset) : undefined,
                });
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DatePicker
                value={form.followUpAt}
                onChange={(followUpAt) => patchForm({ followUpAt })}
                disablePast
              />
              {form.followUpAt ? (
                <button
                  type="button"
                  className="text-[length:var(--control-text-sm)] text-muted-foreground hover:text-foreground"
                  onClick={() => patchForm({ followUpAt: undefined })}
                >
                  No follow-up
                </button>
              ) : null}
            </div>
          </FormField>

          {!detailsOpen ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[length:var(--control-text-sm)] font-medium text-primary hover:underline"
              onClick={() => setDetailsOpen(true)}
            >
              <Plus className="size-3.5" />
              Add optional details
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-border/50 p-3">
              <FormField
                label="Source"
                description="Where did this lead come from?"
                error={fieldErrors.sourceKey}
              >
                <SuggestionChips
                  aria-label="Source"
                  options={sourcePrimaryOptions}
                  value={
                    sourcePrimaryOptions.some((o) => o.value === form.sourceKey)
                      ? form.sourceKey
                      : ''
                  }
                  onChange={(sourceKey) =>
                    patchForm({ sourceKey: sourceKey || 'manual' })
                  }
                />
                {!moreSourcesOpen && sourceMoreOptions.length ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 text-[length:var(--control-text-sm)] text-muted-foreground hover:text-foreground"
                    onClick={() => setMoreSourcesOpen(true)}
                  >
                    <ChevronDown className="size-3.5" />
                    More sources
                  </button>
                ) : null}
                {moreSourcesOpen && sourceMoreOptions.length ? (
                  <SuggestionChips
                    aria-label="More sources"
                    className="mt-2"
                    options={sourceMoreOptions}
                    value={
                      sourceMoreOptions.some((o) => o.value === form.sourceKey)
                        ? form.sourceKey
                        : ''
                    }
                    onChange={(sourceKey) => {
                      if (sourceKey) setMoreSourcesOpen(true);
                      patchForm({ sourceKey: sourceKey || 'manual' });
                    }}
                  />
                ) : null}
              </FormField>

              <FormField label="Priority" error={fieldErrors.priority}>
                <SuggestionChips
                  aria-label="Priority"
                  allowDeselect={false}
                  options={PRIORITY_OPTIONS}
                  value={form.priority}
                  onChange={(priority) => patchForm({ priority: priority || 'normal' })}
                />
              </FormField>

              {campaigns.length ? (
                !campaignOpen && !form.campaignId ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[length:var(--control-text-sm)] font-medium text-primary hover:underline"
                    onClick={() => setCampaignOpen(true)}
                  >
                    <Plus className="size-3.5" />
                    Add campaign
                  </button>
                ) : (
                  <FormField label="Campaign" description="Optional paid campaign attribution.">
                    <SuggestionChips
                      aria-label="Campaign"
                      options={[
                        { value: '', label: 'None' },
                        ...campaigns.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                      value={form.campaignId}
                      onChange={(campaignId) => patchForm({ campaignId: campaignId || '' })}
                    />
                  </FormField>
                )
              ) : null}
            </div>
          )}
        </form>
      </RecordSheet>

      <RecordDialog
        open={importOpen}
        onOpenChange={(next) => {
          setImportOpen(next);
        }}
        title="Import leads (CSV)"
        description="Header row required. Columns: title (or contactName/name), email, phone."
        submitLabel={importing ? 'Importing…' : 'Import CSV'}
        onSubmit={() => void importCsv()}
        submitting={importing}
      >
        <p className="text-xs text-muted-foreground">
          Part of{' '}
          <Link
            to={PUBLIC_DOCS_BRING_YOUR_DATA_HREF}
            className="text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Bring your data
          </Link>
          — sheet import, not a full migration.
        </p>
        <FormField label="CSV">
          <textarea
            className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            spellCheck={false}
          />
        </FormField>
      </RecordDialog>

      <RecordDialog
        open={lostOpen}
        onOpenChange={(next) => {
          setLostOpen(next);
          if (!next) {
            setPendingMove(null);
            setLostReason('');
          }
        }}
        title="Mark lead as Lost"
        description="Tell the team why this opportunity closed without a sale."
        submitLabel="Mark Lost"
        onSubmit={() => void confirmBoardLost()}
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
    </QueuePageChrome>
  );
}
