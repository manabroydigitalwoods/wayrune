import { useEffect, useMemo, useState } from 'react';
import {
  CreateInquirySchema,
  CreatePartySchema,
  CreatePlaceSchema,
  CreateTravelRequestSchema,
  parseWithFieldErrors,
} from '@travel/contracts';
import {
  DatePicker,
  EmailInput,
  FormGrid,
  HOTEL_CATEGORY_OPTIONS,
  humanizeFieldKeys,
  Input,
  MEAL_PLAN_OPTIONS,
  PhoneInput,
  PriceField,
  RecordDialog,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
  TRANSPORT_PREF_OPTIONS,
  Wizard,
  formatCurrency,
  type ComboboxOption,
  EntityCombobox,
} from '@travel/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { PlaceMultiPicker, PlaceSinglePicker } from '../places/PlacePicker';
import { placeName, type PlaceRef } from '../../lib/placeRefs';
import type { InquiryCreateDefaults } from './inquiryIntakeTypes';

export type { InquiryCreateDefaults } from './inquiryIntakeTypes';

const WIZARD_STEPS = [
  { id: 'client', title: 'Client', description: 'Who is this trip for?' },
  { id: 'basics', title: 'Trip basics', description: 'Where and when.' },
  { id: 'pax', title: 'Travellers & budget', description: 'Party size and spend.' },
  { id: 'prefs', title: 'Preferences', description: 'Optional details — skip if unsure.' },
  { id: 'review', title: 'Review', description: 'Check missing information before saving.' },
];

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  leisure: 'Leisure',
  honeymoon: 'Honeymoon',
  business: 'Business',
  family: 'Family',
};

const DOMESTIC_LABELS: Record<string, string> = {
  domestic: 'Domestic',
  international: 'International',
};

const HOTEL_LABELS = Object.fromEntries(HOTEL_CATEGORY_OPTIONS.map((o) => [o.value, o.label]));
const MEAL_LABELS = Object.fromEntries(MEAL_PLAN_OPTIONS.map((o) => [o.value, o.label]));
const TRANSPORT_LABELS = Object.fromEntries(TRANSPORT_PREF_OPTIONS.map((o) => [o.value, o.label]));

type CreatedInquiry = {
  id: string;
  inquiryNumber?: string;
  missingFieldsJson?: string[];
};

type CreatedTravelRequest = {
  partyId: string | null;
  leadId: string;
  inquiryId: string;
  inquiryNumber?: string;
  missingFields?: string[];
};

const emptyForm = {
  partyId: '',
  partyLabel: '',
  // Intake mode only: capture a brand-new contact inline (no Party is created
  // until the atomic /travel-requests call).
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  leadId: '',
  travelType: 'leisure',
  domesticOrIntl: 'domestic',
  origin: null as PlaceRef | null,
  destinations: [] as PlaceRef[],
  stops: [] as PlaceRef[],
  adults: 2,
  children: 0,
  budgetAmount: 50000,
  startDate: '',
  hotelCategory: '',
  meals: '',
  transportPref: '',
  roomRequirements: '',
  flightsRequired: false,
  visaAssistance: false,
  insurance: false,
};

export function InquiryCreateSheet({
  open,
  onOpenChange,
  defaults,
  onCreated,
  mode = 'inquiry',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: InquiryCreateDefaults;
  onCreated?: (inquiry: CreatedInquiry) => void;
  /**
   * `intake` = unified "Travel Request" entry: capture a new contact inline and
   * create Party + Lead + Inquiry atomically via POST /travel-requests. Defaults
   * to `inquiry`, which keeps the original behaviour untouched for existing pages.
   */
  mode?: 'inquiry' | 'intake';
}) {
  const isIntake = mode === 'intake';
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [inquiryErrors, setInquiryErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm);

  const [clientOpen, setClientOpen] = useState(false);
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [clientForm, setClientForm] = useState({
    type: 'individual',
    displayName: '',
    email: '',
    phone: '',
  });

  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeSubmitting, setPlaceSubmitting] = useState(false);
  const [placeErrors, setPlaceErrors] = useState<Record<string, string>>({});
  const [placeCreateTarget, setPlaceCreateTarget] = useState<'origin' | 'destinations' | 'stops'>(
    'destinations',
  );
  const [placeForm, setPlaceForm] = useState({
    name: '',
    kind: 'city',
    country: 'India',
    region: '',
    domesticOrIntl: 'domestic',
  });

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setInquiryErrors({});
    setForm({
      ...emptyForm,
      leadId: defaults?.leadId || '',
      partyId: defaults?.partyId || '',
      partyLabel: defaults?.partyLabel || '',
    });
  }, [open, defaults?.leadId, defaults?.partyId, defaults?.partyLabel]);

  // If opened with leadId but no party, load lead to prefill client.
  useEffect(() => {
    if (!open || !defaults?.leadId || defaults.partyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const lead = await api<{
          id: string;
          partyId?: string | null;
          party?: { id?: string; displayName?: string } | null;
        }>(`/leads/${defaults.leadId}`);
        if (cancelled) return;
        const partyId = lead.party?.id || lead.partyId || '';
        const partyLabel = lead.party?.displayName || '';
        if (partyId) {
          setForm((f) => ({
            ...f,
            leadId: defaults.leadId || f.leadId,
            partyId,
            partyLabel: partyLabel || f.partyLabel,
          }));
        } else {
          setForm((f) => ({ ...f, leadId: defaults.leadId || f.leadId }));
        }
      } catch {
        // Non-blocking — user can still pick a client manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaults?.leadId, defaults?.partyId]);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!form.destinations.length) m.push('Destinations');
    if (form.domesticOrIntl === 'international' && !form.startDate) m.push('Start date');
    if (!form.adults) m.push('Adults');
    if (!form.budgetAmount) m.push('Budget');
    if (!form.travelType) m.push('Travel type');
    return m;
  }, [form]);

  async function searchParties(q: string): Promise<ComboboxOption[]> {
    const res = await api<{ items: Array<{ id: string; displayName: string; email?: string }> }>(
      `/parties?pageSize=20&q=${encodeURIComponent(q)}`,
    );
    return res.items.map((p) => ({
      value: p.id,
      label: p.displayName,
      description: p.email || undefined,
    }));
  }

  function openCreateClient(prefillName = '') {
    setClientForm({
      type: 'individual',
      displayName: prefillName,
      email: '',
      phone: '',
    });
    setClientOpen(true);
  }

  function openCreatePlace(target: 'origin' | 'destinations' | 'stops', prefillName = '') {
    setPlaceCreateTarget(target);
    setPlaceForm({
      name: prefillName,
      kind: 'city',
      country: form.domesticOrIntl === 'international' ? '' : 'India',
      region: '',
      domesticOrIntl: form.domesticOrIntl || 'domestic',
    });
    setPlaceOpen(true);
  }

  async function createClient() {
    const parsed = parseWithFieldErrors(CreatePartySchema, clientForm);
    if (!parsed.ok) {
      setClientErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setClientErrors({});
    setClientSubmitting(true);
    try {
      const party = await api<{ id: string; displayName: string }>('/parties', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setForm((f) => ({
        ...f,
        partyId: party.id,
        partyLabel: party.displayName,
      }));
      setClientOpen(false);
      toastSuccess('Client created and selected');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create client');
    } finally {
      setClientSubmitting(false);
    }
  }

  async function createPlace() {
    const parsed = parseWithFieldErrors(CreatePlaceSchema, placeForm);
    if (!parsed.ok) {
      setPlaceErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setPlaceErrors({});
    setPlaceSubmitting(true);
    try {
      const place = await api<{ id: string; name: string; kind: string }>('/places', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      const ref: PlaceRef = { placeId: place.id, name: place.name, kind: place.kind };
      setForm((f) => {
        if (placeCreateTarget === 'origin') {
          return { ...f, origin: ref };
        }
        const key = placeCreateTarget;
        const list = f[key];
        const exists = list.some(
          (p) => (p.placeId && p.placeId === ref.placeId) || p.name === ref.name,
        );
        return {
          ...f,
          [key]: exists ? list : [...list, ref],
        };
      });
      setPlaceOpen(false);
      toastSuccess('Place added');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create place');
    } finally {
      setPlaceSubmitting(false);
    }
  }

  async function saveInquiry() {
    const parsed = parseWithFieldErrors(CreateInquirySchema, {
      partyId: form.partyId || null,
      leadId: form.leadId || null,
      travelType: form.travelType,
      domesticOrIntl: form.domesticOrIntl as 'domestic' | 'international',
      destinations: form.destinations,
      stops: form.stops,
      origin: form.origin || null,
      adults: Number(form.adults),
      children: Number(form.children),
      budgetAmount: Number(form.budgetAmount),
      budgetCurrency: 'INR',
      startDate: form.startDate || null,
      hotelCategory: form.hotelCategory || null,
      meals: form.meals || null,
      transportPref: form.transportPref || null,
      roomRequirements: form.roomRequirements || null,
      flightsRequired: form.flightsRequired,
      visaAssistance: form.visaAssistance,
      insurance: form.insurance,
    });
    if (!parsed.ok) {
      setInquiryErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setInquiryErrors({});
    setSubmitting(true);
    try {
      const inquiry = await api<CreatedInquiry>('/inquiries', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      toastSuccess(
        inquiry.missingFieldsJson?.length
          ? `Inquiry saved — still missing: ${humanizeFieldKeys(inquiry.missingFieldsJson)}`
          : 'Inquiry saved',
      );
      onOpenChange(false);
      setStep(0);
      onCreated?.(inquiry);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save inquiry');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTravelRequest() {
    const usingExisting = Boolean(form.partyId);
    const contactName = form.contactName.trim();
    const parsed = parseWithFieldErrors(CreateTravelRequestSchema, {
      partyId: form.partyId || null,
      contact: usingExisting
        ? undefined
        : {
            name: contactName,
            email: form.contactEmail || null,
            phone: form.contactPhone || null,
          },
      travelType: form.travelType,
      domesticOrIntl: form.domesticOrIntl as 'domestic' | 'international',
      destinations: form.destinations,
      stops: form.stops,
      origin: form.origin || null,
      adults: Number(form.adults),
      children: Number(form.children),
      budgetAmount: Number(form.budgetAmount),
      budgetCurrency: 'INR',
      startDate: form.startDate || null,
      hotelCategory: form.hotelCategory || null,
      meals: form.meals || null,
      transportPref: form.transportPref || null,
      roomRequirements: form.roomRequirements || null,
      flightsRequired: form.flightsRequired,
      visaAssistance: form.visaAssistance,
      insurance: form.insurance,
    });
    if (!parsed.ok) {
      setInquiryErrors(parsed.errors);
      // Surface person-block errors even though they live on the first step.
      const first =
        parsed.errors['contact.name'] || parsed.errors.contact || Object.values(parsed.errors)[0];
      toastError(first || 'Fix the highlighted fields');
      if (parsed.errors['contact.name'] || parsed.errors.contact) setStep(0);
      return;
    }
    setInquiryErrors({});
    setSubmitting(true);
    try {
      const res = await api<CreatedTravelRequest>('/travel-requests', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      toastSuccess(
        res.missingFields?.length
          ? `Travel request saved — still missing: ${humanizeFieldKeys(res.missingFields)}`
          : 'Travel request saved',
      );
      onOpenChange(false);
      setStep(0);
      onCreated?.({
        id: res.inquiryId,
        inquiryNumber: res.inquiryNumber,
        missingFieldsJson: res.missingFields,
      });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save travel request');
    } finally {
      setSubmitting(false);
    }
  }

  function canNext() {
    if (isIntake && step === 0) {
      return Boolean(form.partyId) || Boolean(form.contactName.trim());
    }
    if (step === 1) return form.destinations.length > 0;
    if (step === 2) return Number(form.adults) > 0;
    return true;
  }

  return (
    <>
      <RecordSheet
        open={open}
        onOpenChange={onOpenChange}
        title={isIntake ? 'New travel request' : 'New inquiry'}
        description={
          isIntake
            ? "Capture the customer and trip basics — we'll create the client, lead, and inquiry in one step."
            : 'A short wizard — skip optional steps if you do not know yet.'
        }
        wide
      >
        <Wizard
          steps={WIZARD_STEPS}
          stepIndex={step}
          onStepChange={setStep}
          onBack={() => setStep((s) => Math.max(0, s - 1))}
          onNext={() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
          onFinish={isIntake ? saveTravelRequest : saveInquiry}
          canNext={canNext()}
          finishing={submitting}
          finishLabel={isIntake ? 'Create travel request' : 'Save inquiry'}
        >
          {step === 0 && (
            <div className="space-y-4">
              <FormField label={isIntake ? 'Existing customer' : 'Client'} htmlFor="inquiry-client">
                <EntityCombobox
                  value={form.partyId}
                  selectedLabel={form.partyLabel}
                  onChange={(partyId, option) =>
                    setForm({
                      ...form,
                      partyId,
                      partyLabel: option?.label || '',
                      // Selecting an existing customer clears any inline contact.
                      ...(isIntake && partyId
                        ? { contactName: '', contactEmail: '', contactPhone: '' }
                        : {}),
                    })
                  }
                  onSearch={searchParties}
                  placeholder="Search customers…"
                  emptyText="No customers match that search."
                  createNewLabel={isIntake ? 'Enter as a new contact' : 'Add new client'}
                  onCreateNew={
                    isIntake
                      ? (q) =>
                          setForm((f) => ({
                            ...f,
                            partyId: '',
                            partyLabel: '',
                            contactName: q || f.contactName,
                          }))
                      : openCreateClient
                  }
                  clearable
                />
              </FormField>
              {form.partyId && form.partyLabel ? (
                <div className="rounded-xl border border-primary/25 px-3.5 py-3 glass-well">
                  <p className="text-sm font-medium text-foreground">{form.partyLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {form.leadId ? 'Prefill from lead · linked for this inquiry' : 'Selected for this request'}
                  </p>
                </div>
              ) : isIntake ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      or add a new contact
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <FormField label="Contact name" required error={inquiryErrors['contact.name']}>
                    <Input
                      value={form.contactName}
                      onChange={(e) => {
                        setForm({ ...form, contactName: e.target.value });
                        setInquiryErrors((errs) => {
                          const n = { ...errs };
                          delete n['contact.name'];
                          return n;
                        });
                      }}
                      placeholder="e.g. Sharma Family"
                      aria-invalid={Boolean(inquiryErrors['contact.name'])}
                    />
                  </FormField>
                  <FormGrid>
                    <FormField label="Email" error={inquiryErrors['contact.email']}>
                      <EmailInput
                        value={form.contactEmail}
                        onChange={(contactEmail) => setForm({ ...form, contactEmail })}
                        placeholder="name@…"
                      />
                    </FormField>
                    <FormField label="Phone" error={inquiryErrors['contact.phone']}>
                      <PhoneInput
                        value={form.contactPhone}
                        onChange={(contactPhone) => setForm({ ...form, contactPhone })}
                      />
                    </FormField>
                  </FormGrid>
                  <p className="text-xs text-muted-foreground">
                    We'll match an existing customer by email or phone, or create a new one.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Optional — leave blank for a walk-in, or add a client from the search menu.
                </p>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-5">
              <FormField label="Travel type" description="What kind of trip is this?">
                <SuggestionChips
                  aria-label="Travel type"
                  allowDeselect={false}
                  options={[
                    { value: 'leisure', label: 'Leisure' },
                    { value: 'honeymoon', label: 'Honeymoon' },
                    { value: 'business', label: 'Business' },
                    { value: 'family', label: 'Family' },
                  ]}
                  value={form.travelType}
                  onChange={(travelType) => setForm({ ...form, travelType })}
                />
              </FormField>
              <FormField label="Scope" description="Domestic India or international.">
                <SuggestionChips
                  aria-label="Domestic or international"
                  allowDeselect={false}
                  options={[
                    { value: 'domestic', label: 'Domestic' },
                    { value: 'international', label: 'International' },
                  ]}
                  value={form.domesticOrIntl}
                  onChange={(domesticOrIntl) => setForm({ ...form, domesticOrIntl })}
                />
              </FormField>
              <PlaceSinglePicker
                label="Origin / from"
                value={form.origin}
                onChange={(origin) => setForm({ ...form, origin })}
                domesticOrIntl={form.domesticOrIntl}
                placeholder="Search origin city…"
                onCreateNew={(q) => openCreatePlace('origin', q)}
              />
              <PlaceMultiPicker
                label="Destinations"
                required
                value={form.destinations}
                onChange={(destinations) => setForm({ ...form, destinations })}
                domesticOrIntl={form.domesticOrIntl}
                placeholder="Search destinations or regions…"
                onCreateNew={(q) => openCreatePlace('destinations', q)}
              />
              <PlaceMultiPicker
                label="Stops (optional)"
                value={form.stops}
                onChange={(stops) => setForm({ ...form, stops })}
                domesticOrIntl={form.domesticOrIntl}
                placeholder="Search intermediate stops…"
                onCreateNew={(q) => openCreatePlace('stops', q)}
                allowExpandRegions={false}
              />
              {form.domesticOrIntl === 'international' ? (
                <FormField label="Start date" required>
                  <DatePicker
                    value={parseDateInput(form.startDate)}
                    onChange={(d) =>
                      setForm({ ...form, startDate: formatDateInput(d) })
                    }
                  />
                </FormField>
              ) : null}
            </div>
          )}
          {step === 2 && (
            <FormGrid>
              <FormField label="Adults" required error={inquiryErrors.adults}>
                <Input
                  type="number"
                  min={1}
                  value={form.adults}
                  onChange={(e) => {
                    setForm({ ...form, adults: Number(e.target.value) });
                    setInquiryErrors((errs) => {
                      const n = { ...errs };
                      delete n.adults;
                      return n;
                    });
                  }}
                  placeholder="2"
                  aria-invalid={Boolean(inquiryErrors.adults)}
                />
              </FormField>
              <FormField label="Children">
                <Input
                  type="number"
                  min={0}
                  value={form.children}
                  onChange={(e) => setForm({ ...form, children: Number(e.target.value) })}
                  placeholder="0"
                />
              </FormField>
              <FormField
                label="Budget"
                required
                error={inquiryErrors.budgetAmount}
                description={
                  Number(form.adults) + Number(form.children) > 0 && Number(form.budgetAmount) > 0
                    ? `≈ ${formatCurrency(
                        Math.round(
                          Number(form.budgetAmount) /
                            (Number(form.adults) + Number(form.children)),
                        ),
                        { maximumFractionDigits: 0 },
                      )} / person (derived — quote calc is later)`
                    : 'Total trip budget the client has in mind.'
                }
              >
                <PriceField
                  value={form.budgetAmount}
                  onChange={(raw) => {
                    setForm({
                      ...form,
                      budgetAmount: raw === '' ? 0 : Number(raw),
                    });
                    setInquiryErrors((errs) => {
                      const n = { ...errs };
                      delete n.budgetAmount;
                      return n;
                    });
                  }}
                  maxFractionDigits={0}
                  placeholder="e.g. 50000"
                  aria-invalid={Boolean(inquiryErrors.budgetAmount)}
                />
              </FormField>
            </FormGrid>
          )}
          {step === 3 && (
            <div className="space-y-5">
              <FormField label="Hotel" description="Tap a suggestion — optional.">
                <SuggestionChips
                  aria-label="Hotel category"
                  options={[...HOTEL_CATEGORY_OPTIONS]}
                  value={form.hotelCategory}
                  onChange={(hotelCategory) => setForm({ ...form, hotelCategory })}
                />
              </FormField>
              <FormField label="Meal plan">
                <SuggestionChips
                  aria-label="Meal plan"
                  options={[...MEAL_PLAN_OPTIONS]}
                  value={form.meals}
                  onChange={(meals) => setForm({ ...form, meals })}
                />
              </FormField>
              <FormField label="Transport">
                <SuggestionChips
                  aria-label="Transport preference"
                  options={[...TRANSPORT_PREF_OPTIONS]}
                  value={form.transportPref}
                  onChange={(transportPref) => setForm({ ...form, transportPref })}
                />
              </FormField>
              <FormField label="Room requirements">
                <Input
                  value={form.roomRequirements}
                  onChange={(e) => setForm({ ...form, roomRequirements: e.target.value })}
                  placeholder="e.g. 1 double + 1 twin"
                />
              </FormField>
              <FormField label="Add-ons" description="Toggle what the client needs.">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Add-ons">
                  {(
                    [
                      { key: 'flightsRequired', label: 'Flights needed' },
                      { key: 'visaAssistance', label: 'Visa help' },
                      { key: 'insurance', label: 'Insurance' },
                    ] as const
                  ).map((item) => {
                    const selected = form[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setForm({ ...form, [item.key]: !selected })}
                        className={
                          selected
                            ? 'rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground'
                            : 'rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-primary-50'
                        }
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </FormField>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3 rounded-xl border border-primary/20 p-4 glass-well">
              <p className="text-sm">
                <strong>Customer:</strong>{' '}
                {form.partyLabel ||
                  (isIntake
                    ? form.contactName
                      ? `${form.contactName} (new contact)`
                      : 'No customer selected'
                    : 'Walk-in / not linked')}
              </p>
              <p className="text-sm">
                <strong>Trip:</strong>{' '}
                {TRAVEL_TYPE_LABELS[form.travelType] || form.travelType} ·{' '}
                {DOMESTIC_LABELS[form.domesticOrIntl] || form.domesticOrIntl}
                {form.origin ? ` · from ${placeName(form.origin)}` : ''} ·{' '}
                {form.destinations.map((d) => d.name).join(', ') || '—'}
                {form.stops.length ? ` · via ${form.stops.join(', ')}` : ''}
              </p>
              <p className="text-sm">
                <strong>Pax / budget:</strong> {form.adults} adults
                {form.children ? ` · ${form.children} children` : ''} ·{' '}
                {formatCurrency(form.budgetAmount, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-sm">
                <strong>Preferences:</strong>{' '}
                {[
                  form.hotelCategory ? HOTEL_LABELS[form.hotelCategory] || form.hotelCategory : null,
                  form.meals ? MEAL_LABELS[form.meals] || form.meals : null,
                  form.transportPref
                    ? TRANSPORT_LABELS[form.transportPref] || form.transportPref
                    : null,
                  form.flightsRequired ? 'Flights' : null,
                  form.visaAssistance ? 'Visa help' : null,
                  form.insurance ? 'Insurance' : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'None selected'}
              </p>
              {missing.length ? (
                <StatusBadge
                  value="pending"
                  tone="warn"
                  showIcon
                  size="md"
                  label={`Still missing: ${missing.join(', ')}`}
                />
              ) : (
                <StatusBadge
                  value="done"
                  tone="success"
                  showIcon
                  size="md"
                  label="Ready to save"
                />
              )}
            </div>
          )}
        </Wizard>
      </RecordSheet>

      <RecordDialog
        open={clientOpen}
        onOpenChange={(next) => {
          setClientOpen(next);
          if (!next) setClientErrors({});
        }}
        title="New client"
        description="Create a client and link them to this inquiry."
        submitLabel="Add client"
        submitting={clientSubmitting}
        onSubmit={createClient}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createClient();
          }}
          noValidate
        >
          <FormField label="Type" htmlFor="quick-client-type" error={clientErrors.type}>
            <SuggestionChips
              aria-label="Client type"
              allowDeselect={false}
              options={[
                { value: 'individual', label: 'Individual' },
                { value: 'organization', label: 'Organization' },
              ]}
              value={clientForm.type}
              onChange={(type) => {
                setClientForm({ ...clientForm, type });
                setClientErrors((e) => {
                  const n = { ...e };
                  delete n.type;
                  return n;
                });
              }}
            />
          </FormField>
          <FormField label="Client / company name" required error={clientErrors.displayName}>
            <Input
              value={clientForm.displayName}
              onChange={(e) => {
                setClientForm({ ...clientForm, displayName: e.target.value });
                setClientErrors((errs) => {
                  const n = { ...errs };
                  delete n.displayName;
                  return n;
                });
              }}
              placeholder="e.g. Sharma Family"
              aria-invalid={Boolean(clientErrors.displayName)}
            />
          </FormField>
          <FormField label="Email" error={clientErrors.email}>
            <EmailInput
              value={clientForm.email}
              onChange={(email) => {
                setClientForm({ ...clientForm, email });
                setClientErrors((errs) => {
                  const n = { ...errs };
                  delete n.email;
                  return n;
                });
              }}
              placeholder="name@…"
              aria-invalid={Boolean(clientErrors.email)}
            />
          </FormField>
          <FormField label="Phone" error={clientErrors.phone}>
            <PhoneInput
              value={clientForm.phone}
              onChange={(phone) => {
                setClientForm({ ...clientForm, phone });
                setClientErrors((errs) => {
                  const n = { ...errs };
                  delete n.phone;
                  return n;
                });
              }}
              aria-invalid={Boolean(clientErrors.phone)}
            />
          </FormField>
        </form>
      </RecordDialog>

      <RecordDialog
        open={placeOpen}
        onOpenChange={(next) => {
          setPlaceOpen(next);
          if (!next) setPlaceErrors({});
        }}
        title="Add place"
        description="One catalog for origin, destinations, and stops — saved for your agency."
        submitLabel="Add place"
        submitting={placeSubmitting}
        onSubmit={createPlace}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createPlace();
          }}
          noValidate
        >
          <FormField label="Place name" required error={placeErrors.name}>
            <Input
              value={placeForm.name}
              onChange={(e) => {
                setPlaceForm({ ...placeForm, name: e.target.value });
                setPlaceErrors((errs) => {
                  const n = { ...errs };
                  delete n.name;
                  return n;
                });
              }}
              placeholder="e.g. Coorg"
              aria-invalid={Boolean(placeErrors.name)}
            />
          </FormField>
          <FormField label="Domestic / International" htmlFor="place-scope">
            <SuggestionChips
              aria-label="Place scope"
              allowDeselect={false}
              options={[
                { value: 'domestic', label: 'Domestic' },
                { value: 'international', label: 'International' },
              ]}
              value={placeForm.domesticOrIntl}
              onChange={(domesticOrIntl) => setPlaceForm({ ...placeForm, domesticOrIntl })}
            />
          </FormField>
          <FormField label="Kind">
            <SuggestionChips
              aria-label="Place kind"
              allowDeselect={false}
              options={[
                { value: 'city', label: 'City' },
                { value: 'region', label: 'Region' },
                { value: 'area', label: 'Area' },
              ]}
              value={placeForm.kind || 'city'}
              onChange={(kind) => setPlaceForm({ ...placeForm, kind })}
            />
          </FormField>
          <FormField label="Country">
            <Input
              value={placeForm.country}
              onChange={(e) => setPlaceForm({ ...placeForm, country: e.target.value })}
              placeholder="India"
            />
          </FormField>
          <FormField label="Region">
            <Input
              value={placeForm.region}
              onChange={(e) => setPlaceForm({ ...placeForm, region: e.target.value })}
              placeholder="e.g. South"
            />
          </FormField>
        </form>
      </RecordDialog>
    </>
  );
}
