import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { Minus, Plus } from 'lucide-react';
import { CreateTravelRequestSchema, parseWithFieldErrors } from '@wayrune/contracts';
import {
  Button,
  Combobox,
  ConfirmDialog,
  DatePicker,
  Input,
  isPhoneBlank,
  isPhoneFormatOk,
  localStorageKit,
  NATIONAL_PHONE_LENGTH,
  PhoneInput,
  RecordDialog,
  RecordSheet,
  SimpleFormField as FormField,
  splitPhone,
  StorageKeys,
  toastError,
  toastSuccess,
  cn,
} from '@wayrune/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import {
  mergeEnquiryDestinationSuggestions,
  readLeadDestinationText,
} from '../../lib/destinationEnquirySuggestions';
import { trackExperienceEvent } from '../../lib/progressiveComplexity';
import type { PlaceRef } from '../../lib/placeRefs';
import { PlaceMultiPicker } from '../places/PlacePicker';
import { RequirementSummaryCards } from './RequirementSummaryCards';
import type { InquiryCreateDefaults } from './inquiryIntakeTypes';

type CreatedTravelRequest = {
  partyId: string | null;
  leadId: string;
  inquiryId: string;
  inquiryNumber?: string;
  missingFields?: string[];
};

type CreatedInquiry = {
  id: string;
  inquiryNumber?: string;
  missingFieldsJson?: string[];
};

type PartyMatch = { id: string; displayName: string; phone?: string | null };

type CallStep = 'customer' | 'acquisition' | 'destination' | 'people' | 'when' | 'budget' | 'special';

const STEPS: CallStep[] = [
  'customer',
  'acquisition',
  'destination',
  'people',
  'when',
  'budget',
  'special',
];

const STEP_COPY: Record<CallStep, { question: string; hint: string }> = {
  customer: { question: 'Who is calling?', hint: 'Name and phone — that’s enough to start.' },
  acquisition: {
    question: 'How did they find us?',
    hint: 'Five seconds — skip if they didn’t say. Channel is phone automatically.',
  },
  destination: { question: 'Where do they want to go?', hint: 'Search places or tap a popular one.' },
  people: { question: 'How many travellers?', hint: 'Tap + / − while you ask on the call.' },
  when: { question: 'When are they travelling?', hint: 'Most callers only know the month.' },
  budget: { question: 'What’s the budget?', hint: 'Rough band is fine — skip if they didn’t say.' },
  special: { question: 'Anything special?', hint: 'Tap what they mentioned. Skip the rest.' },
};

const ACQUISITION_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'referral', label: 'Friend' },
  { value: 'existing_customer', label: 'Existing customer' },
  { value: 'unknown', label: "Don't know" },
  { value: 'skip', label: 'Skip' },
] as const;

const ACQUISITION_PILL_LIMIT = 6;

type AcquisitionOption = { value: string; label: string };
type AcquisitionUsage = Record<string, { count: number; lastUsedAt: number }>;

function readAcquisitionUsage(): AcquisitionUsage {
  const stored = localStorageKit.getJson<AcquisitionUsage>(StorageKeys.leads.acquisitionSourceUsage, {
    version: 1,
  });
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const next: AcquisitionUsage = {};
  for (const [key, raw] of Object.entries(stored)) {
    if (!raw || typeof raw !== 'object') continue;
    const count = Number((raw as { count?: unknown }).count);
    const lastUsedAt = Number((raw as { lastUsedAt?: unknown }).lastUsedAt);
    if (!Number.isFinite(count) || count <= 0) continue;
    next[key] = {
      count: Math.min(9999, Math.floor(count)),
      lastUsedAt: Number.isFinite(lastUsedAt) ? lastUsedAt : 0,
    };
  }
  return next;
}

function recordAcquisitionUsage(key: string) {
  if (!key || key === 'skip') return;
  const usage = readAcquisitionUsage();
  const prev = usage[key];
  usage[key] = {
    count: (prev?.count ?? 0) + 1,
    lastUsedAt: Date.now(),
  };
  localStorageKit.setJson(StorageKeys.leads.acquisitionSourceUsage, usage, { version: 1 });
}

/** Prefer frequent taps; fall back to default order, then A–Z for custom sources. */
function rankAcquisitionOptions(
  options: ReadonlyArray<AcquisitionOption>,
  usage: AcquisitionUsage,
): AcquisitionOption[] {
  const defaultOrder = new Map<string, number>(
    ACQUISITION_OPTIONS.map((opt, index) => [opt.value, index]),
  );
  const isTerminal = (value: string) => value === 'skip' || value === 'unknown';
  const primary = options.filter((opt) => !isTerminal(opt.value));
  const terminal = options.filter((opt) => isTerminal(opt.value));
  const hasUsage = primary.some((opt) => (usage[opt.value]?.count ?? 0) > 0);

  primary.sort((a, b) => {
    if (hasUsage) {
      const au = usage[a.value];
      const bu = usage[b.value];
      const ac = au?.count ?? 0;
      const bc = bu?.count ?? 0;
      if (bc !== ac) return bc - ac;
      const at = au?.lastUsedAt ?? 0;
      const bt = bu?.lastUsedAt ?? 0;
      if (bt !== at) return bt - at;
    }
    const ai = defaultOrder.get(a.value) ?? 999;
    const bi = defaultOrder.get(b.value) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label);
  });

  terminal.sort((a, b) => {
    if (a.value === 'unknown') return -1;
    if (b.value === 'unknown') return 1;
    return a.label.localeCompare(b.label);
  });

  return [...primary, ...terminal];
}

const BUDGET_OPTIONS = [
  { value: 'under25', label: 'Under ₹25K', amount: 20000 },
  { value: '25to50', label: '₹25–50K', amount: 40000 },
  { value: '50to100', label: '₹50–100K', amount: 75000 },
  { value: 'premium', label: 'Premium', amount: 150000 },
  { value: 'skip', label: 'Skip', amount: null },
] as const;

const SPECIAL_GROUPS = [
  {
    label: 'Food',
    options: [
      { value: 'vegetarian', label: 'Vegetarian' },
      { value: 'jain', label: 'Jain' },
      { value: 'vegan', label: 'Vegan' },
    ],
  },
  {
    label: 'Travellers',
    options: [
      { value: 'honeymoon', label: 'Honeymoon' },
      { value: 'anniversary', label: 'Anniversary' },
      { value: 'family', label: 'Family' },
      { value: 'kids', label: 'Kids' },
      { value: 'senior', label: 'Senior citizen' },
      { value: 'friends', label: 'Friends / group' },
      { value: 'corporate', label: 'Corporate' },
    ],
  },
  {
    label: 'Trip style',
    options: [
      { value: 'pilgrimage', label: 'Pilgrimage' },
      { value: 'adventure', label: 'Adventure' },
      { value: 'beach', label: 'Beach' },
      { value: 'hills', label: 'Hills' },
      { value: 'wildlife', label: 'Wildlife' },
    ],
  },
  {
    label: 'Travel & stay',
    options: [
      { value: 'flight', label: 'Flight' },
      { value: 'train', label: 'Train' },
      { value: 'cab', label: 'Cab' },
      { value: 'hotel', label: 'Hotel' },
      { value: 'resort', label: 'Resort' },
      { value: 'homestay', label: 'Homestay' },
      { value: 'wheelchair', label: 'Wheelchair access' },
    ],
  },
] as const;

const SPECIAL_OPTIONS = SPECIAL_GROUPS.flatMap((g) => g.options);

/** Chips that map to structured fields — not free-text “interests”. */
const SPECIAL_STRUCTURED = new Set([
  'vegetarian',
  'jain',
  'vegan',
  'flight',
  'train',
  'cab',
  'hotel',
  'resort',
  'homestay',
  'wheelchair',
]);

const emptyForm = {
  partyId: '',
  partyLabel: '',
  contactName: '',
  contactPhone: '',
  destinations: [] as PlaceRef[],
  adults: 2,
  children: 0,
  seniors: 0,
  whenMode: '' as '' | 'this_month' | 'next_month' | 'choose',
  startDate: '',
  budgetBand: '' as (typeof BUDGET_OPTIONS)[number]['value'] | '',
  specials: [] as string[],
  acquisitionKey: '' as string,
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function resolveStartDate(form: typeof emptyForm): string | null {
  if (form.whenMode === 'choose' && form.startDate) return form.startDate;
  if (form.whenMode === 'this_month') return formatDateInput(startOfMonth(new Date()));
  if (form.whenMode === 'next_month') {
    const d = new Date();
    return formatDateInput(startOfMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1)));
  }
  return null;
}

function resolveBudget(form: typeof emptyForm): number | null {
  const opt = BUDGET_OPTIONS.find((o) => o.value === form.budgetBand);
  return opt?.amount ?? null;
}

function buildCapturedLabels(form: typeof emptyForm): string[] {
  const out: string[] = [];
  const customer = form.partyLabel || form.contactName.trim();
  if (customer) out.push(customer);
  if (form.destinations.length) out.push(form.destinations.map((d) => d.name).join(', '));
  const parts: string[] = [];
  if (form.adults) parts.push(`${form.adults} adult${form.adults === 1 ? '' : 's'}`);
  if (form.children) parts.push(`${form.children} child${form.children === 1 ? '' : 'ren'}`);
  if (form.seniors) parts.push(`${form.seniors} senior${form.seniors === 1 ? '' : 's'}`);
  if (parts.length) out.push(parts.join(', '));
  if (form.whenMode === 'this_month') out.push('This month');
  else if (form.whenMode === 'next_month') out.push('Next month');
  else if (form.startDate) out.push(form.startDate);
  const budget = resolveBudget(form);
  if (budget) out.push(`₹${budget.toLocaleString('en-IN')}`);
  for (const s of form.specials) {
    const label = SPECIAL_OPTIONS.find((o) => o.value === s)?.label;
    if (label) out.push(label);
  }
  return out;
}

function Stepper({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-[var(--gap-section)] rounded-xl border border-border/60 px-[var(--control-px)] py-[var(--field-gap)]">
      <span className="text-[length:var(--control-text)] font-medium">{label}</span>
      <div className="flex items-center gap-[var(--field-gap)]">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-6 text-center text-[length:var(--control-text)] font-semibold tabular-nums">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => onChange(value + 1)}
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border/70 bg-muted/30 text-foreground hover:border-primary/40 hover:bg-primary/5',
      )}
    >
      {children}
    </button>
  );
}

export function TravelRequestWorkspace({
  open,
  onOpenChange,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: InquiryCreateDefaults;
  onCreated?: (inquiry: CreatedInquiry) => void;
}) {
  const { navigate } = useOrgNavigate();
  const [phase, setPhase] = useState<'capture' | 'summary'>('capture');
  const [step, setStep] = useState<CallStep>('customer');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm);
  const [destinationText, setDestinationText] = useState<string | undefined>();
  const [leadTags, setLeadTags] = useState<string[] | undefined>();
  const [saved, setSaved] = useState<CreatedTravelRequest | null>(null);
  const [partyMatch, setPartyMatch] = useState<PartyMatch | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [acquisitionOptions, setAcquisitionOptions] = useState(
    ACQUISITION_OPTIONS as ReadonlyArray<AcquisitionOption>,
  );
  const [acquisitionUsage, setAcquisitionUsage] = useState<AcquisitionUsage>(() =>
    readAcquisitionUsage(),
  );
  const matchRequestId = useRef(0);
  const startedAt = useMemo(() => Date.now(), [open]);
  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    api<Array<{ key: string; name: string }>>('/lead-sources')
      .then((rows) => {
        if (!rows.length) return;
        setAcquisitionOptions([
          ...rows.map((r) => ({ value: r.key, label: r.name })),
          { value: 'skip', label: 'Skip' },
        ]);
      })
      .catch(() => undefined);
  }, []);

  const rankedAcquisitionOptions = useMemo(
    () => rankAcquisitionOptions(acquisitionOptions, acquisitionUsage),
    [acquisitionOptions, acquisitionUsage],
  );
  const acquisitionPillOptions = useMemo(() => {
    const primary = rankedAcquisitionOptions.filter(
      (opt) => opt.value !== 'skip' && opt.value !== 'unknown',
    );
    const terminal = rankedAcquisitionOptions.filter(
      (opt) => opt.value === 'skip' || opt.value === 'unknown',
    );
    const hasUsage = primary.some((opt) => (acquisitionUsage[opt.value]?.count ?? 0) > 0);
    const pillPrimary =
      primary.length > ACQUISITION_PILL_LIMIT
        ? primary.slice(0, ACQUISITION_PILL_LIMIT)
        : primary;
    const pillKeys = new Set(pillPrimary.map((opt) => opt.value));
    const moreOptions = primary.filter((opt) => !pillKeys.has(opt.value));
    return {
      pills: [...pillPrimary, ...terminal],
      moreOptions,
      pillLabel: hasUsage ? 'Frequent' : 'Suggested',
    };
  }, [rankedAcquisitionOptions, acquisitionUsage]);

  function pickAcquisition(acquisitionKey: string) {
    if (acquisitionKey && acquisitionKey !== 'skip') {
      recordAcquisitionUsage(acquisitionKey);
      setAcquisitionUsage(readAcquisitionUsage());
    }
    setForm({ ...form, acquisitionKey });
    const i = STEPS.indexOf('acquisition');
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]!);
  }

  useEffect(() => {
    if (!open) return;
    setPhase('capture');
    setStep('customer');
    setSaved(null);
    setErrors({});
    setPartyMatch(null);
    setDiscardOpen(false);
    setDestinationText(defaults?.destinationText?.trim() || undefined);
    setLeadTags(defaults?.tags);
    setForm({
      ...emptyForm,
      partyId: defaults?.partyId || '',
      partyLabel: defaults?.partyLabel || '',
      contactName: defaults?.partyLabel || defaults?.contactName || '',
      contactPhone: defaults?.phone || '',
      destinations: defaults?.destinations?.length ? defaults.destinations : [],
    });
    trackExperienceEvent('travel_request_started', {
      source: defaults?.partyId ? 'party' : defaults?.interactionId ? 'inbox' : 'header',
      channel: defaults?.channelKey || 'phone',
    });
  }, [
    open,
    defaults?.partyId,
    defaults?.partyLabel,
    defaults?.contactName,
    defaults?.phone,
    defaults?.channelKey,
    defaults?.interactionId,
    defaults?.destinationText,
    defaults?.destinations?.map((d) => d.placeId || d.name).join('\u0001'),
    defaults?.tags?.join('\u0001'),
  ]);

  // When opened from a lead without destinationText, load Lead.customFieldsJson.
  useEffect(() => {
    if (!open || !defaults?.leadId) return;
    if (defaults.destinationText !== undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        const lead = await api<{
          tagsJson?: unknown;
          customFieldsJson?: unknown;
        }>(`/leads/${defaults.leadId}`);
        if (cancelled) return;
        const tags = Array.isArray(lead.tagsJson) ? (lead.tagsJson as string[]) : [];
        setLeadTags((prev) => prev ?? tags);
        setDestinationText((prev) => prev ?? readLeadDestinationText(lead.customFieldsJson));
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaults?.leadId, defaults?.destinationText]);

  const enquirySuggestions = useMemo(
    () =>
      mergeEnquiryDestinationSuggestions({
        destinationText,
        tags: leadTags ?? defaults?.tags,
        selectedDestinations: form.destinations,
      }),
    [
      destinationText,
      leadTags?.join('\u0001'),
      defaults?.tags?.join('\u0001'),
      form.destinations.map((d) => `${d.placeId || ''}:${d.name}`).join('\u0001'),
    ],
  );

  const isDirty = useMemo(() => {
    return Boolean(
      form.contactName.trim() ||
        form.contactPhone.trim() ||
        form.partyId ||
        form.acquisitionKey ||
        form.destinations.length ||
        form.whenMode ||
        form.budgetBand ||
        form.specials.length ||
        form.children > 0 ||
        form.seniors > 0 ||
        form.adults !== 2 ||
        step !== 'customer',
    );
  }, [form, step]);

  useEffect(() => {
    if (!open || phase !== 'capture' || form.partyId) {
      setPartyMatch(null);
      return;
    }
    const phone = form.contactPhone.trim();
    if (isPhoneBlank(phone) || !isPhoneFormatOk(phone)) {
      setPartyMatch(null);
      return;
    }
    const { national } = splitPhone(phone);
    if (national.length !== NATIONAL_PHONE_LENGTH) {
      setPartyMatch(null);
      return;
    }

    const requestId = ++matchRequestId.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const queries = [national, phone.replace(/\D/g, '')];
          let match: PartyMatch | null = null;
          for (const q of queries) {
            const res = await api<{ items: PartyMatch[] }>(
              `/parties?pageSize=5&q=${encodeURIComponent(q)}`,
            );
            if (requestId !== matchRequestId.current) return;
            match =
              res.items.find((p) => {
                if (!p.phone) return false;
                const digits = p.phone.replace(/\D/g, '');
                return digits.endsWith(national) || digits.includes(national);
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
  }, [open, phase, form.contactPhone, form.partyId]);

  function useExistingParty(match: PartyMatch) {
    setForm((f) => ({
      ...f,
      partyId: match.id,
      partyLabel: match.displayName,
      contactName: match.displayName,
    }));
    setPartyMatch(null);
  }

  function clearLinkedParty() {
    setForm((f) => ({ ...f, partyId: '', partyLabel: '' }));
  }

  function toggleSpecial(value: string) {
    setForm((f) => ({
      ...f,
      specials: f.specials.includes(value)
        ? f.specials.filter((s) => s !== value)
        : [...f.specials, value],
    }));
  }

  function validateStep(current: CallStep): boolean {
    const local: Record<string, string> = {};
    if (current === 'customer') {
      if (!form.partyId && !form.contactName.trim()) local['contact.name'] = 'Enter the customer name';
      if (!form.partyId) {
        if (isPhoneBlank(form.contactPhone)) local['contact.phone'] = 'Enter a phone number';
        else if (!isPhoneFormatOk(form.contactPhone)) local['contact.phone'] = 'Enter a valid phone number';
      }
    }
    setErrors(local);
    if (Object.keys(local).length) {
      toastError(Object.values(local)[0]);
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]!);
  }

  function goBack() {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]!);
  }

  async function saveTravelRequest(): Promise<CreatedTravelRequest | null> {
    if (!validateStep('customer')) {
      setStep('customer');
      return null;
    }

    const usingExisting = Boolean(form.partyId);
    const budgetAmount = resolveBudget(form);
    const startDate = resolveStartDate(form);
    const specials = new Set(form.specials);
    const interests = SPECIAL_OPTIONS.filter(
      (o) => specials.has(o.value) && !SPECIAL_STRUCTURED.has(o.value),
    ).map((o) => o.label);
    const specialBits: string[] = [];
    if (form.seniors > 0) specialBits.push(`${form.seniors} senior traveller(s)`);
    if (specials.has('train')) specialBits.push('Prefers train');
    if (specials.has('hotel')) specialBits.push('Needs hotel');
    if (specials.has('resort')) specialBits.push('Prefers resort');
    if (specials.has('homestay')) specialBits.push('Prefers homestay');
    if (specials.has('wheelchair')) specialBits.push('Wheelchair / accessible rooms');
    if (specials.has('anniversary')) specialBits.push('Anniversary trip');

    const meals = specials.has('jain')
      ? 'Jain'
      : specials.has('vegan')
        ? 'Vegan'
        : specials.has('vegetarian')
          ? 'Vegetarian'
          : null;

    const parsed = parseWithFieldErrors(CreateTravelRequestSchema, {
      partyId: form.partyId || null,
      contact: usingExisting
        ? undefined
        : {
            name: form.contactName.trim(),
            phone: form.contactPhone || null,
          },
      travelType: specials.has('honeymoon') || specials.has('anniversary')
        ? 'honeymoon'
        : specials.has('corporate')
          ? 'business'
          : specials.has('family') || specials.has('kids')
            ? 'family'
            : specials.has('friends')
              ? 'group'
              : 'leisure',
      destinations: form.destinations,
      adults: Math.max(1, form.adults),
      children: form.children,
      infants: 0,
      budgetAmount,
      budgetCurrency: 'INR',
      startDate,
      meals,
      transportPref: specials.has('cab') ? 'Private cab' : null,
      flightsRequired: specials.has('flight'),
      interests: interests.length ? interests : undefined,
      specialRequirements: specialBits.length ? specialBits.join('; ') : null,
      internalNotes: buildCapturedLabels(form).join(' · ') || null,
      sourceKey:
        form.acquisitionKey && form.acquisitionKey !== 'skip' ? form.acquisitionKey : null,
      channelKey: defaults?.channelKey?.trim() || 'phone',
      interactionId: defaults?.interactionId || null,
      conversationId: defaults?.conversationId || null,
      campaignId: defaults?.campaignId || null,
      destinationText: destinationText || null,
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      trackExperienceEvent('travel_request_abandoned', { reason: 'validation' });
      return null;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await api<CreatedTravelRequest>('/travel-requests', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setSaved(res);
      setPhase('summary');
      trackExperienceEvent('travel_request_completed', {
        time_to_capture: Date.now() - startedAt,
        missing_count: res.missingFields?.length ?? 0,
      });
      toastSuccess('Request saved');
      return res;
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save travel request');
      trackExperienceEvent('travel_request_abandoned', { reason: 'api_error' });
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function createFollowUpTask(inquiryId: string) {
    const due = new Date();
    due.setDate(due.getDate() + 1);
    due.setHours(10, 0, 0, 0);
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: `Follow up — ${form.partyLabel || form.contactName || 'customer call'}`,
        description: buildCapturedLabels(form).join('\n') || null,
        priority: 'normal',
        dueAt: due.toISOString(),
        entityType: 'inquiry',
        entityId: inquiryId,
      }),
    });
    trackExperienceEvent('follow_up_created', { inquiryId });
    toastSuccess('Follow-up task created for tomorrow');
  }

  function finish(result: CreatedTravelRequest, navigateToPlanning: boolean) {
    onCreated?.({
      id: result.inquiryId,
      inquiryNumber: result.inquiryNumber,
      missingFieldsJson: result.missingFields,
    });
    onOpenChange(false);
    if (navigateToPlanning) {
      trackExperienceEvent('continue_planning_selected');
      navigate(`/inquiries/${result.inquiryId}`);
    } else {
      navigate('/tasks');
    }
  }

  function requestClose() {
    if (phase === 'capture' && isDirty) {
      setDiscardOpen(true);
      return;
    }
    if (phase === 'capture') {
      trackExperienceEvent('travel_request_abandoned', { reason: 'closed' });
    }
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      requestClose();
      return;
    }
    onOpenChange(next);
  }

  function confirmDiscard() {
    setDiscardOpen(false);
    trackExperienceEvent('travel_request_abandoned', { reason: 'closed' });
    onOpenChange(false);
  }

  async function handleFollowUpFromSummary() {
    if (!saved) return;
    try {
      await createFollowUpTask(saved.inquiryId);
    } catch {
      toastError('Could not create follow-up task');
      return;
    }
    finish(saved, false);
  }

  const captureOpen = open && phase === 'capture';
  const summaryOpen = open && phase === 'summary' && Boolean(saved);
  const copy = STEP_COPY[step];
  const isLast = step === 'special';

  return (
    <>
      <RecordDialog
        open={captureOpen}
        onOpenChange={handleOpenChange}
        title="New customer call"
        description={`Question ${stepIndex + 1} of ${STEPS.length} — ${copy.hint}`}
        size="lg"
        onInteractOutside={(e) => {
          if (isDirty) {
            e.preventDefault();
            setDiscardOpen(true);
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isDirty) {
            e.preventDefault();
            setDiscardOpen(true);
          }
        }}
        footer={
          <>
            {stepIndex > 0 ? (
              <Button type="button" variant="outline" onClick={goBack} disabled={submitting}>
                Back
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={requestClose} disabled={submitting}>
                Cancel
              </Button>
            )}
            {isLast ? (
              <Button type="button" disabled={submitting} onClick={() => void saveTravelRequest()}>
                {submitting ? 'Saving…' : 'Save request'}
              </Button>
            ) : (
              <Button type="button" onClick={goNext}>
                Next
              </Button>
            )}
          </>
        }
      >
        <div className="stack-form">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  i <= stepIndex ? 'bg-primary' : 'bg-muted',
                )}
              />
            ))}
          </div>

          <h3 className="font-display text-base font-semibold tracking-tight">{copy.question}</h3>

          {step === 'customer' ? (
            <div className="stack-form">
              <FormField label="Customer name" required error={errors['contact.name']}>
                <Input
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  placeholder="Customer name"
                  autoFocus
                  disabled={Boolean(form.partyId)}
                />
              </FormField>
              <FormField label="Phone" required error={errors['contact.phone']}>
                <PhoneInput
                  value={form.contactPhone}
                  onChange={(contactPhone) => setForm({ ...form, contactPhone })}
                  disabled={Boolean(form.partyId)}
                />
              </FormField>
              {form.partyId ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success-soft/60 px-2.5 py-1.5 text-sm">
                  <span>
                    Linked to <span className="font-medium">{form.partyLabel}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={clearLinkedParty}>
                    Change
                  </Button>
                </div>
              ) : partyMatch ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-sm">
                  <span>
                    Existing customer found:{' '}
                    <span className="font-medium">{partyMatch.displayName}</span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => useExistingParty(partyMatch)}
                  >
                    Use existing
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'acquisition' ? (
            <div className="stack-form">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {acquisitionPillOptions.pillLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {acquisitionPillOptions.pills.map((opt) => (
                    <ChoiceChip
                      key={opt.value}
                      selected={form.acquisitionKey === opt.value}
                      onClick={() => pickAcquisition(opt.value)}
                    >
                      {opt.label}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
              {acquisitionPillOptions.moreOptions.length > 0 ? (
                <FormField label="Other source">
                  <Combobox
                    value={
                      acquisitionPillOptions.moreOptions.some(
                        (opt) => opt.value === form.acquisitionKey,
                      )
                        ? form.acquisitionKey
                        : ''
                    }
                    onChange={pickAcquisition}
                    placeholder="More sources…"
                    options={acquisitionPillOptions.moreOptions.map((opt) => ({
                      value: opt.value,
                      label: opt.label,
                    }))}
                    searchable={acquisitionPillOptions.moreOptions.length > 6}
                  />
                </FormField>
              ) : null}
            </div>
          ) : null}

          {step === 'destination' ? (
            <div className="stack-form">
              <PlaceMultiPicker
                label="Destination"
                purpose="destination"
                value={form.destinations}
                onChange={(destinations) => setForm({ ...form, destinations })}
                placeholder="Search city, region, state or country…"
                showSuggestions
                enquirySuggestions={enquirySuggestions}
                enquiryDestinationText={destinationText}
              />
            </div>
          ) : null}

          {step === 'people' ? (
            <div className="stack-form">
              <Stepper
                label="Adults"
                value={form.adults}
                min={1}
                onChange={(adults) => setForm({ ...form, adults })}
              />
              <Stepper
                label="Children"
                value={form.children}
                min={0}
                onChange={(children) => setForm({ ...form, children })}
              />
              <Stepper
                label="Senior"
                value={form.seniors}
                min={0}
                onChange={(seniors) => setForm({ ...form, seniors })}
              />
            </div>
          ) : null}

          {step === 'when' ? (
            <div className="stack-form">
              <div className="grid gap-2">
                {(
                  [
                    { value: 'this_month', label: 'This month' },
                    { value: 'next_month', label: 'Next month' },
                    { value: 'choose', label: 'Choose date' },
                  ] as const
                ).map((opt) => (
                  <ChoiceChip
                    key={opt.value}
                    selected={form.whenMode === opt.value}
                    onClick={() => setForm({ ...form, whenMode: opt.value })}
                  >
                    {opt.label}
                  </ChoiceChip>
                ))}
              </div>
              {form.whenMode === 'choose' ? (
                <FormField label="Travel date">
                  <DatePicker
                    value={parseDateInput(form.startDate)}
                    onChange={(d) => setForm({ ...form, startDate: formatDateInput(d) })}
                    disablePast
                  />
                </FormField>
              ) : null}
            </div>
          ) : null}

          {step === 'budget' ? (
            <div className="grid gap-2">
              {BUDGET_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  selected={form.budgetBand === opt.value}
                  onClick={() => setForm({ ...form, budgetBand: opt.value })}
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </div>
          ) : null}

          {step === 'special' ? (
            <div className="grid gap-4">
              {SPECIAL_GROUPS.map((group) => (
                <div key={group.label} className="grid gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((opt) => (
                      <ChoiceChip
                        key={opt.value}
                        selected={form.specials.includes(opt.value)}
                        onClick={() => toggleSpecial(opt.value)}
                      >
                        {opt.label}
                      </ChoiceChip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </RecordDialog>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard this call?"
        description="You’ve already entered some details. Closing now will lose them."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={confirmDiscard}
      />

      <RecordSheet
        open={summaryOpen}
        onOpenChange={handleOpenChange}
        title="Request saved"
        description={
          saved?.inquiryNumber
            ? `${saved.inquiryNumber} — review what was captured and choose next steps.`
            : 'Review what was captured and choose next steps.'
        }
        size="xl"
        footer={
          saved ? (
            <>
              <Button type="button" variant="outline" onClick={() => finish(saved, true)}>
                Edit details
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleFollowUpFromSummary()}
              >
                Follow up later
              </Button>
              <Button type="button" onClick={() => finish(saved, true)}>
                Plan now
              </Button>
            </>
          ) : null
        }
      >
        {saved ? (
          <RequirementSummaryCards
            captured={buildCapturedLabels(form)}
            missing={saved.missingFields ?? []}
          />
        ) : null}
      </RecordSheet>
    </>
  );
}
