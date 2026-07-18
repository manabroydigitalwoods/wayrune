import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { Minus, Plus } from 'lucide-react';
import { CreateTravelRequestSchema, parseWithFieldErrors } from '@wayrune/contracts';
import {
  Button,
  ConfirmDialog,
  DatePicker,
  Input,
  isPhoneFormatOk,
  NATIONAL_PHONE_LENGTH,
  PhoneInput,
  RecordDialog,
  RecordSheet,
  SimpleFormField as FormField,
  splitPhone,
  toastError,
  toastSuccess,
  cn,
} from '@wayrune/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
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

const POPULAR_DESTINATIONS = ['Sikkim', 'Darjeeling', 'Gangtok', 'Bhutan', 'Andaman', 'Goa', 'Manali', 'Kerala'];

const BUDGET_OPTIONS = [
  { value: 'under25', label: 'Under ₹25K', amount: 20000 },
  { value: '25to50', label: '₹25–50K', amount: 40000 },
  { value: '50to100', label: '₹50–100K', amount: 75000 },
  { value: 'premium', label: 'Premium', amount: 150000 },
  { value: 'skip', label: 'Skip', amount: null },
] as const;

const SPECIAL_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'honeymoon', label: 'Honeymoon' },
  { value: 'family', label: 'Family' },
  { value: 'senior', label: 'Senior citizen' },
  { value: 'kids', label: 'Kids' },
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'cab', label: 'Cab' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'adventure', label: 'Adventure' },
] as const;

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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-6 text-center text-lg font-semibold tabular-nums">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9"
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
        'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors',
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
  const [saved, setSaved] = useState<CreatedTravelRequest | null>(null);
  const [partyMatch, setPartyMatch] = useState<PartyMatch | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [acquisitionOptions, setAcquisitionOptions] = useState(
    ACQUISITION_OPTIONS as ReadonlyArray<{ value: string; label: string }>,
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

  useEffect(() => {
    if (!open) return;
    setPhase('capture');
    setStep('customer');
    setSaved(null);
    setErrors({});
    setPartyMatch(null);
    setDiscardOpen(false);
    setForm({
      ...emptyForm,
      partyId: defaults?.partyId || '',
      partyLabel: defaults?.partyLabel || '',
      contactName: defaults?.partyLabel || '',
    });
    trackExperienceEvent('travel_request_started', {
      source: defaults?.partyId ? 'party' : defaults?.interactionId ? 'inbox' : 'header',
      channel: defaults?.channelKey || 'phone',
    });
  }, [open, defaults?.partyId, defaults?.partyLabel, defaults?.channelKey, defaults?.interactionId]);

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
    if (!phone || !isPhoneFormatOk(phone)) {
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

  function addPopularDestination(name: string) {
    setForm((f) => {
      const exists = f.destinations.some((d) => d.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        return {
          ...f,
          destinations: f.destinations.filter((d) => d.name.toLowerCase() !== name.toLowerCase()),
        };
      }
      return {
        ...f,
        destinations: [...f.destinations, { placeId: null, name }],
      };
    });
  }

  function validateStep(current: CallStep): boolean {
    const local: Record<string, string> = {};
    if (current === 'customer') {
      if (!form.partyId && !form.contactName.trim()) local['contact.name'] = 'Enter the customer name';
      if (!form.partyId) {
        if (!form.contactPhone.trim()) local['contact.phone'] = 'Enter a phone number';
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
      (o) =>
        specials.has(o.value) &&
        !['vegetarian', 'flight', 'cab', 'hotel', 'train'].includes(o.value),
    ).map((o) => o.label);
    const specialBits: string[] = [];
    if (form.seniors > 0) specialBits.push(`${form.seniors} senior traveller(s)`);
    if (specials.has('train')) specialBits.push('Prefers train');
    if (specials.has('hotel')) specialBits.push('Needs hotel');

    const parsed = parseWithFieldErrors(CreateTravelRequestSchema, {
      partyId: form.partyId || null,
      contact: usingExisting
        ? undefined
        : {
            name: form.contactName.trim(),
            phone: form.contactPhone || null,
          },
      travelType: specials.has('honeymoon')
        ? 'honeymoon'
        : specials.has('family') || specials.has('kids')
          ? 'family'
          : 'leisure',
      destinations: form.destinations,
      adults: Math.max(1, form.adults),
      children: form.children,
      infants: 0,
      budgetAmount,
      budgetCurrency: 'INR',
      startDate,
      meals: specials.has('vegetarian') ? 'Vegetarian' : null,
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
        <div className="space-y-4">
          <div className="flex gap-1.5" aria-hidden>
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

          <h3 className="font-display text-xl font-semibold tracking-tight">{copy.question}</h3>

          {step === 'customer' ? (
            <div className="space-y-4">
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
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
                  <span>
                    Linked to <span className="font-medium">{form.partyLabel}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={clearLinkedParty}>
                    Change
                  </Button>
                </div>
              ) : partyMatch ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
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
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {acquisitionOptions.map((opt) => (
                  <ChoiceChip
                    key={opt.value}
                    selected={form.acquisitionKey === opt.value}
                    onClick={() => {
                      setForm({ ...form, acquisitionKey: opt.value });
                      const i = STEPS.indexOf('acquisition');
                      if (i < STEPS.length - 1) setStep(STEPS[i + 1]!);
                    }}
                  >
                    {opt.label}
                  </ChoiceChip>
                ))}
              </div>
            </div>
          ) : null}

          {step === 'destination' ? (
            <div className="space-y-4">
              <PlaceMultiPicker
                label="Destination"
                value={form.destinations}
                onChange={(destinations) => setForm({ ...form, destinations })}
                placeholder="Search destinations…"
              />
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Popular</p>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_DESTINATIONS.map((name) => {
                    const on = form.destinations.some(
                      (d) => d.name.toLowerCase() === name.toLowerCase(),
                    );
                    return (
                      <ChoiceChip key={name} selected={on} onClick={() => addPopularDestination(name)}>
                        {name}
                      </ChoiceChip>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 'people' ? (
            <div className="space-y-3">
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
            <div className="space-y-3">
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
            <div className="flex flex-wrap gap-2">
              {SPECIAL_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  selected={form.specials.includes(opt.value)}
                  onClick={() => toggleSpecial(opt.value)}
                >
                  {opt.label}
                </ChoiceChip>
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
