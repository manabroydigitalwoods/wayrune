import { useEffect, useMemo, useState } from 'react';
import {
  CreateInquirySchema,
  CreatePartySchema,
  CreatePlaceSchema,
  CreateTravelRequestSchema,
  parseWithFieldErrors,
} from '@wayrune/contracts';
import {
  Button,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmailInput,
  FormGrid,
  HOTEL_CATEGORY_OPTIONS,
  humanizeFieldKeys,
  Input,
  MEAL_PLAN_OPTIONS,
  NumberField,
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
  formatDate,
  type ComboboxOption,
  EntityCombobox,
} from '@wayrune/ui';
import { ChevronDown } from 'lucide-react';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { patchTravelDates } from '../../lib/inquiryTravelDates';
import { leadTagsToInquiryPrefill } from '../../lib/leadTagsToInquiryPrefill';
import {
  mergeEnquiryDestinationSuggestions,
  readLeadDestinationText,
} from '../../lib/destinationEnquirySuggestions';
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

const NIGHTS_QUICK = [2, 3, 5, 7];

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

type ClientChoice = 'lead' | 'search' | 'walkin';

const emptyForm = {
  partyId: '',
  partyLabel: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  leadId: '',
  leadTitle: '',
  travelType: 'leisure',
  domesticOrIntl: 'domestic',
  origin: null as PlaceRef | null,
  destinations: [] as PlaceRef[],
  stops: [] as PlaceRef[],
  adults: 2,
  children: 0,
  budgetAmount: 50000,
  startDate: '',
  endDate: '',
  nights: 3 as number | null,
  interests: [] as string[],
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
  const [variant, setVariant] = useState<'quick' | 'full'>('full');
  const [clientChoice, setClientChoice] = useState<ClientChoice>('search');
  const [submitting, setSubmitting] = useState(false);
  const [inquiryErrors, setInquiryErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm);
  const [destinationText, setDestinationText] = useState<string | undefined>();
  const [leadTags, setLeadTags] = useState<string[] | undefined>();

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

  const hasLeadContact = Boolean(
    form.contactName?.trim() || form.contactPhone?.trim() || form.contactEmail?.trim(),
  );

  useEffect(() => {
    if (!open) return;
    setInquiryErrors({});
    const tagPrefill = leadTagsToInquiryPrefill(defaults?.tags);
    // Do not invent a travel start — near-term vs far-out plans vary widely.
    // Keep nights as a soft duration hint; end date fills once start is set.

    const partyId = defaults?.partyId || '';
    const contactName = defaults?.contactName || '';
    const contactPhone = defaults?.phone || '';
    const contactEmail = defaults?.email || '';
    const fromLead = Boolean(defaults?.leadId);
    const useQuick = !isIntake && fromLead;
    const structuredDestinations = defaults?.destinations?.length
      ? defaults.destinations
      : [];

    setVariant(useQuick ? 'quick' : 'full');
    if (partyId) {
      setClientChoice('lead');
      setStep(useQuick ? 0 : 1);
    } else if (fromLead && (contactName || contactPhone || contactEmail)) {
      setClientChoice('lead');
      setStep(useQuick ? 0 : 1);
    } else {
      setClientChoice('search');
      setStep(0);
    }

    // Precedence: interaction defaults.destinationText > lead (fetched later) > tags.
    setDestinationText(defaults?.destinationText?.trim() || undefined);
    setLeadTags(defaults?.tags);

    setForm({
      ...emptyForm,
      leadId: defaults?.leadId || '',
      leadTitle: defaults?.leadTitle || '',
      partyId,
      partyLabel: defaults?.partyLabel || '',
      contactName,
      contactPhone,
      contactEmail,
      travelType: tagPrefill.travelType,
      domesticOrIntl: tagPrefill.domesticOrIntl,
      interests: tagPrefill.interests,
      destinations: structuredDestinations,
      startDate: '',
      nights: 3,
      endDate: '',
    });
    // Intentionally no auto-resolve of destination PlaceRefs from free-text —
    // employee confirms via suggestion Add.
  }, [
    open,
    isIntake,
    defaults?.leadId,
    defaults?.partyId,
    defaults?.partyLabel,
    defaults?.leadTitle,
    defaults?.contactName,
    defaults?.phone,
    defaults?.email,
    defaults?.destinationText,
    defaults?.destinations?.map((d) => d.placeId || d.name).join('\u0001'),
    // Stabilize array identity from parent re-renders
    defaults?.tags?.join('\u0001'),
  ]);

  // Enrich when only leadId is provided (e.g. Inquiries page).
  useEffect(() => {
    if (!open || !defaults?.leadId) return;
    if (
      defaults.partyId &&
      defaults.contactName !== undefined &&
      defaults.tags !== undefined &&
      defaults.destinationText !== undefined
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const lead = await api<{
          id: string;
          title?: string;
          contactName?: string | null;
          email?: string | null;
          phone?: string | null;
          tagsJson?: unknown;
          customFieldsJson?: unknown;
          partyId?: string | null;
          party?: { id?: string; displayName?: string } | null;
        }>(`/leads/${defaults.leadId}`);
        if (cancelled) return;
        const partyId = lead.party?.id || lead.partyId || '';
        const partyLabel = lead.party?.displayName || '';
        const tags = Array.isArray(lead.tagsJson) ? (lead.tagsJson as string[]) : [];
        const tagPrefill = leadTagsToInquiryPrefill(tags);
        const leadDestinationText = readLeadDestinationText(lead.customFieldsJson);

        setLeadTags((prev) => prev ?? tags);
        // Precedence: explicit defaults.destinationText wins over Lead field.
        setDestinationText((prev) => prev ?? leadDestinationText);

        setForm((f) => ({
          ...f,
          leadId: defaults.leadId || f.leadId,
          leadTitle: lead.title || f.leadTitle,
          partyId: partyId || f.partyId,
          partyLabel: partyLabel || f.partyLabel,
          contactName: lead.contactName || f.contactName,
          contactEmail: lead.email || f.contactEmail,
          contactPhone: lead.phone || f.contactPhone,
          travelType: f.travelType === 'leisure' ? tagPrefill.travelType : f.travelType,
          domesticOrIntl:
            f.domesticOrIntl === 'domestic' ? tagPrefill.domesticOrIntl : f.domesticOrIntl,
          interests: f.interests.length ? f.interests : tagPrefill.interests,
        }));

        if (partyId || lead.contactName || lead.phone || lead.email) {
          setClientChoice('lead');
          if (!isIntake) setStep((s) => (s === 0 ? 1 : s));
        }
      } catch {
        // Non-blocking — user can still pick a client manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    defaults?.leadId,
    defaults?.partyId,
    defaults?.contactName,
    defaults?.tags,
    defaults?.destinationText,
    isIntake,
  ]);

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

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!form.destinations.length) m.push('Destinations');
    if (form.domesticOrIntl === 'international' && !form.startDate) m.push('Start date');
    if (!form.adults) m.push('Adults');
    if (!form.budgetAmount) m.push('Budget');
    if (!form.travelType) m.push('Travel type');
    if (!form.nights && !form.endDate) m.push('Duration');
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

  function applyTravelDatePatch(
    change: 'start' | 'nights' | 'end',
    next: { start?: string; nights?: number | null; end?: string },
  ) {
    setForm((f) => {
      const patched = patchTravelDates({
        startDate: f.startDate,
        nights: f.nights,
        endDate: f.endDate,
        change,
        nextStart: next.start,
        nextNights: next.nights,
        nextEnd: next.end,
      });
      return { ...f, ...patched };
    });
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
      setClientChoice('search');
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

  /** Ensure party is linked when saving from a lead with contact (unless walk-in). */
  async function ensurePartyId(): Promise<string | null> {
    if (clientChoice === 'walkin') return null;
    if (form.partyId) return form.partyId;
    if (!form.leadId || clientChoice !== 'lead') return form.partyId || null;
    if (!form.contactPhone?.trim() && !form.contactEmail?.trim()) {
      toastError('Add a phone or email on the lead before linking a client');
      return null;
    }
    try {
      const res = await api<{
        party: { id: string; displayName: string };
      }>(`/leads/${form.leadId}/convert-to-client`, { method: 'POST' });
      setForm((f) => ({
        ...f,
        partyId: res.party.id,
        partyLabel: res.party.displayName,
      }));
      return res.party.id;
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not link client from lead');
      throw e;
    }
  }

  function buildInquiryPayload(partyId: string | null) {
    return {
      partyId: partyId || null,
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
      endDate: form.endDate || null,
      nights: form.nights && form.nights >= 1 ? form.nights : null,
      interests: form.interests.length ? form.interests : undefined,
      hotelCategory: form.hotelCategory || null,
      meals: form.meals || null,
      transportPref: form.transportPref || null,
      roomRequirements: form.roomRequirements || null,
      flightsRequired: form.flightsRequired,
      visaAssistance: form.visaAssistance,
      insurance: form.insurance,
    };
  }

  async function saveInquiry() {
    let partyId: string | null = form.partyId || null;
    try {
      partyId = await ensurePartyId();
    } catch {
      return;
    }

    const parsed = parseWithFieldErrors(CreateInquirySchema, buildInquiryPayload(partyId));
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
      endDate: form.endDate || null,
      nights: form.nights && form.nights >= 1 ? form.nights : null,
      interests: form.interests.length ? form.interests : undefined,
      hotelCategory: form.hotelCategory || null,
      meals: form.meals || null,
      transportPref: form.transportPref || null,
      roomRequirements: form.roomRequirements || null,
      flightsRequired: form.flightsRequired,
      visaAssistance: form.visaAssistance,
      insurance: form.insurance,
      interactionId: defaults?.interactionId || null,
      conversationId: defaults?.conversationId || null,
      campaignId: defaults?.campaignId || null,
      channelKey: defaults?.channelKey || null,
      destinationText: destinationText || null,
    });
    if (!parsed.ok) {
      setInquiryErrors(parsed.errors);
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

  function canQuickSave() {
    return form.destinations.length > 0 && Number(form.adults) > 0;
  }

  function goToFullDetails() {
    setVariant('full');
    if (form.destinations.length && Number(form.adults) > 0) {
      setStep(3);
    } else if (form.destinations.length) {
      setStep(2);
    } else {
      setStep(1);
    }
  }

  function clientSummaryLabel() {
    if (form.partyLabel) return form.partyLabel;
    if (clientChoice === 'lead' && hasLeadContact) {
      return [form.contactName, form.contactPhone || form.contactEmail].filter(Boolean).join(' · ');
    }
    if (clientChoice === 'walkin') return 'Walk-in / not linked';
    return 'No customer selected';
  }

  const nightsLabel =
    form.nights && form.nights >= 1
      ? `${form.nights} night${form.nights === 1 ? '' : 's'} · ${form.nights + 1} day${form.nights + 1 === 1 ? '' : 's'}`
      : null;

  const travelDatesFields = (
    <div className="space-y-3">
      <FormField label="Travel start" description="Used for itinerary and pricing.">
        <DatePicker
          size="sm"
          value={parseDateInput(form.startDate)}
          onChange={(d) => applyTravelDatePatch('start', { start: formatDateInput(d) })}
          disablePast
        />
      </FormField>
      <FormField
        label="Duration"
        description={nightsLabel ? nightsLabel : 'Number of nights — sets the return date.'}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {NIGHTS_QUICK.map((n) => (
            <Button
              key={n}
              type="button"
              size="xs"
              variant={form.nights === n ? 'default' : 'outline'}
              className="min-w-9"
              aria-pressed={form.nights === n}
              onClick={() => applyTravelDatePatch('nights', { nights: n })}
            >
              {n}
            </Button>
          ))}
          <span className="ml-1 text-sm text-muted-foreground">nights</span>
        </div>
      </FormField>
      <FormField
        label="Return date"
        description={
          form.endDate && form.nights
            ? `${formatDate(form.endDate)} · Calculated from ${form.nights} night${form.nights === 1 ? '' : 's'}`
            : form.endDate
              ? formatDate(form.endDate)
              : 'Calculated from duration — edit to adjust nights.'
        }
      >
        <DatePicker
          size="sm"
          value={parseDateInput(form.endDate)}
          onChange={(d) => applyTravelDatePatch('end', { end: formatDateInput(d) })}
          disablePast
          minDate={parseDateInput(form.startDate) ?? undefined}
        />
      </FormField>
    </div>
  );

  const quickTravelDates = (
    <div className="space-y-2.5">
      <FormField label="Travel start">
        <DatePicker
          size="sm"
          value={parseDateInput(form.startDate)}
          onChange={(d) => applyTravelDatePatch('start', { start: formatDateInput(d) })}
          disablePast
        />
      </FormField>
      <FormField label="Duration">
        <div className="flex flex-wrap items-center gap-1.5">
          {NIGHTS_QUICK.map((n) => (
            <Button
              key={n}
              type="button"
              size="xs"
              variant={form.nights === n ? 'default' : 'outline'}
              className="min-w-9"
              aria-pressed={form.nights === n}
              onClick={() => applyTravelDatePatch('nights', { nights: n })}
            >
              {n}
            </Button>
          ))}
          <span className="text-sm text-muted-foreground">nights</span>
        </div>
        {nightsLabel ? (
          <p className="mt-1 text-xs text-muted-foreground">{nightsLabel}</p>
        ) : null}
      </FormField>
      <FormField label="Return date">
        <DatePicker
          size="sm"
          value={parseDateInput(form.endDate)}
          onChange={(d) => applyTravelDatePatch('end', { end: formatDateInput(d) })}
          disablePast
          minDate={parseDateInput(form.startDate) ?? undefined}
        />
        {form.endDate && form.nights ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Calculated from {form.nights} night{form.nights === 1 ? '' : 's'} — edit to adjust duration
          </p>
        ) : null}
      </FormField>
    </div>
  );

  const tripBasicsFields = (
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
      <PlaceMultiPicker
        label="Destinations"
        required
        size="sm"
        purpose="destination"
        value={form.destinations}
        onChange={(destinations) => setForm({ ...form, destinations })}
        domesticOrIntl={form.domesticOrIntl}
        placeholder="Search city, region, state or country…"
        onCreateNew={(q) => openCreatePlace('destinations', q)}
        showSuggestions
        enquirySuggestions={enquirySuggestions}
        enquiryDestinationText={destinationText}
      />
      {travelDatesFields}
    </div>
  );

  const paxBudgetFields = (
    <FormGrid>
      <FormField label="Adults" required error={inquiryErrors.adults}>
        <NumberField
          inputSize="sm"
          min={1}
          value={form.adults}
          onChange={(raw) => {
            setForm({
              ...form,
              adults: raw === '' ? 0 : Number(raw),
            });
            setInquiryErrors((errs) => {
              const n = { ...errs };
              delete n.adults;
              return n;
            });
          }}
          placeholder="2"
          aria-invalid={Boolean(inquiryErrors.adults)}
          quickPicks={[1, 2, 3, 4]}
        />
      </FormField>
      <FormField label="Children">
        <NumberField
          inputSize="sm"
          min={0}
          value={form.children}
          onChange={(raw) =>
            setForm({
              ...form,
              children: raw === '' ? 0 : Number(raw),
            })
          }
          placeholder="0"
          quickPicks={[0, 1, 2]}
        />
      </FormField>
      <FormField
        label="Total budget"
        required
        error={inquiryErrors.budgetAmount}
        description={
          Number(form.adults) + Number(form.children) > 0 && Number(form.budgetAmount) > 0
            ? `Approx. ${formatCurrency(
                Math.round(
                  Number(form.budgetAmount) / (Number(form.adults) + Number(form.children)),
                ),
                { maximumFractionDigits: 0 },
              )} per person`
            : 'Total trip budget for the whole party.'
        }
      >
        <PriceField
          size="sm"
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
  );

  function setWalkIn() {
    setClientChoice('walkin');
    setForm((f) => ({ ...f, partyId: '', partyLabel: '' }));
  }

  const compactLeadCustomer =
    form.leadId && clientChoice === 'lead' ? (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 px-2.5 py-1.5 glass-row">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">Linked customer</p>
          <p className="truncate text-sm font-medium text-foreground">
            {[form.partyLabel || form.contactName || 'Lead contact', form.contactPhone || form.contactEmail]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 gap-0.5 px-2">
              Change
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setClientChoice('search')}>
              Choose another customer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={setWalkIn}>Walk-in / not linked</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ) : null;

  /** Fuller banner for the full wizard client step (same Change menu). */
  const leadClientBanner = compactLeadCustomer;

  const showQuick = !isIntake && variant === 'quick';

  const quickFooter = showQuick ? (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <div className="flex flex-col gap-1.5 sm:items-end">
        {!canQuickSave() ? (
          <p className="text-xs text-muted-foreground">
            {!form.destinations.length
              ? 'Select at least one destination to save.'
              : 'Add at least one adult to save.'}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={goToFullDetails}>
            Add more details
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canQuickSave() || submitting}
            data-testid="inquiry-save"
            onClick={() => void saveInquiry()}
          >
            {submitting ? 'Saving…' : 'Save inquiry'}
          </Button>
        </div>
      </div>
    </div>
  ) : undefined;

  return (
    <>
      <RecordSheet
        open={open}
        onOpenChange={onOpenChange}
        title={isIntake ? 'New travel request' : showQuick ? 'Quick inquiry' : 'New inquiry'}
        description={
          isIntake
            ? "Capture the customer and trip basics — we'll create the client, lead, and inquiry in one step."
            : showQuick
              ? 'Save the essentials now. Add preferences later.'
              : 'A short wizard — skip optional steps if you do not know yet.'
        }
        wide
        footer={quickFooter}
      >
        {showQuick ? (
          <div className="space-y-3.5">
            {compactLeadCustomer}
            {clientChoice === 'search' ? (
              <FormField label="Customer" htmlFor="inquiry-client-quick">
                <EntityCombobox
                  size="sm"
                  value={form.partyId}
                  selectedLabel={form.partyLabel}
                  onChange={(partyId, option) =>
                    setForm({
                      ...form,
                      partyId,
                      partyLabel: option?.label || '',
                    })
                  }
                  onSearch={searchParties}
                  placeholder="Search customers…"
                  emptyText="No customers match that search."
                  createNewLabel="Add new client"
                  onCreateNew={openCreateClient}
                  clearable
                />
                {hasLeadContact || form.leadId ? (
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                    onClick={() => setClientChoice('lead')}
                  >
                    Use lead contact instead
                  </button>
                ) : null}
              </FormField>
            ) : null}
            {clientChoice === 'walkin' ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-2.5 py-1.5 text-sm text-muted-foreground">
                <span>Walk-in / not linked</span>
                <button
                  type="button"
                  className="shrink-0 font-medium text-primary hover:underline"
                  onClick={() => setClientChoice(hasLeadContact || form.partyId ? 'lead' : 'search')}
                >
                  Undo
                </button>
              </div>
            ) : null}

            <div className="space-y-2.5">
              <FormField label="Travel">
                <div className="space-y-2">
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
                </div>
              </FormField>
              <PlaceMultiPicker
                label="Destination"
                required
                size="sm"
                purpose="destination"
                value={form.destinations}
                onChange={(destinations) => setForm({ ...form, destinations })}
                domesticOrIntl={form.domesticOrIntl}
                placeholder="Search city, region, state or country…"
                onCreateNew={(q) => openCreatePlace('destinations', q)}
                showSuggestions
                enquirySuggestions={enquirySuggestions}
                enquiryDestinationText={destinationText}
              />
              {quickTravelDates}
            </div>

            <div className="space-y-2.5">
              <FormGrid>
                <FormField label="Adults" required error={inquiryErrors.adults}>
                  <NumberField
                    inputSize="sm"
                    min={1}
                    value={form.adults}
                    onChange={(raw) => {
                      setForm({
                        ...form,
                        adults: raw === '' ? 0 : Number(raw),
                      });
                      setInquiryErrors((errs) => {
                        const n = { ...errs };
                        delete n.adults;
                        return n;
                      });
                    }}
                    placeholder="2"
                    aria-invalid={Boolean(inquiryErrors.adults)}
                    quickPicks={[1, 2, 3, 4]}
                  />
                </FormField>
                <FormField label="Children">
                  <NumberField
                    inputSize="sm"
                    min={0}
                    value={form.children}
                    onChange={(raw) =>
                      setForm({
                        ...form,
                        children: raw === '' ? 0 : Number(raw),
                      })
                    }
                    placeholder="0"
                    quickPicks={[0, 1, 2]}
                  />
                </FormField>
              </FormGrid>
              <FormField
                label="Total budget"
                required
                error={inquiryErrors.budgetAmount}
                description={
                  Number(form.adults) + Number(form.children) > 0 && Number(form.budgetAmount) > 0
                    ? `Approx. ${formatCurrency(
                        Math.round(
                          Number(form.budgetAmount) /
                            (Number(form.adults) + Number(form.children)),
                        ),
                        { maximumFractionDigits: 0 },
                      )} per person`
                    : undefined
                }
              >
                <PriceField
                  size="sm"
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
            </div>
          </div>
        ) : (
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
            finishTestId="inquiry-save"
          >
            {step === 0 && (
              <div className="stack-form">
                {!isIntake && form.leadId && (hasLeadContact || form.partyId) && clientChoice === 'lead'
                  ? leadClientBanner
                  : null}
                {(isIntake || clientChoice === 'search' || (!form.leadId && !hasLeadContact)) && (
                  <FormField label={isIntake ? 'Existing customer' : 'Client'} htmlFor="inquiry-client">
                    <EntityCombobox
                      size="sm"
                      value={form.partyId}
                      selectedLabel={form.partyLabel}
                      onChange={(partyId, option) =>
                        setForm({
                          ...form,
                          partyId,
                          partyLabel: option?.label || '',
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
                )}
                {form.partyId && form.partyLabel && clientChoice !== 'lead' ? (
                  <div className="rounded-xl border border-primary/25 px-3.5 py-3 glass-well">
                    <p className="text-sm font-medium text-foreground">{form.partyLabel}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {form.leadId ? 'Prefill from lead · linked for this inquiry' : 'Selected for this request'}
                    </p>
                  </div>
                ) : null}
                {!isIntake && clientChoice === 'walkin' ? (
                  <div className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">
                    Walk-in / not linked — inquiry will save without a customer.
                    <button
                      type="button"
                      className="ml-2 font-medium text-primary hover:underline"
                      onClick={() => setClientChoice(hasLeadContact ? 'lead' : 'search')}
                    >
                      Undo
                    </button>
                  </div>
                ) : null}
                {!isIntake && form.leadId && clientChoice === 'search' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => setClientChoice('lead')}
                  >
                    Use lead contact instead
                  </Button>
                ) : null}
                {isIntake ? (
                  form.partyId && form.partyLabel ? null : (
                    <div className="stack-form">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          or add a new contact
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <FormField label="Contact name" required error={inquiryErrors['contact.name']}>
                        <Input
                          inputSize="sm"
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
                            inputSize="sm"
                            value={form.contactEmail}
                            onChange={(contactEmail) => setForm({ ...form, contactEmail })}
                            placeholder="name@…"
                          />
                        </FormField>
                        <FormField label="Phone" error={inquiryErrors['contact.phone']}>
                          <PhoneInput
                            size="sm"
                            value={form.contactPhone}
                            onChange={(contactPhone) => setForm({ ...form, contactPhone })}
                          />
                        </FormField>
                      </FormGrid>
                      <p className="text-xs text-muted-foreground">
                        We'll match an existing customer by email or phone, or create a new one.
                      </p>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Optional — leave blank for a walk-in, or link a customer now.
                  </p>
                )}
              </div>
            )}
            {step === 1 && (
              <div className="space-y-5">
                {tripBasicsFields}
                <PlaceSinglePicker
                  label="Origin / from"
                  size="sm"
                  purpose="origin"
                  value={form.origin}
                  onChange={(origin) => setForm({ ...form, origin })}
                  domesticOrIntl={form.domesticOrIntl}
                  placeholder="Search city, airport or station…"
                  onCreateNew={(q) => openCreatePlace('origin', q)}
                />
                <PlaceMultiPicker
                  label="Stops (optional)"
                  size="sm"
                  purpose="intermediate_stop"
                  value={form.stops}
                  onChange={(stops) => setForm({ ...form, stops })}
                  domesticOrIntl={form.domesticOrIntl}
                  placeholder="Search cities or regions…"
                  onCreateNew={(q) => openCreatePlace('stops', q)}
                  allowExpandRegions={false}
                />
              </div>
            )}
            {step === 2 && paxBudgetFields}
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
                    inputSize="sm"
                    value={form.roomRequirements}
                    onChange={(e) => setForm({ ...form, roomRequirements: e.target.value })}
                    placeholder="e.g. 1 double + extra bed"
                  />
                </FormField>
                <FormField label="Add-ons">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: 'flightsRequired' as const, label: 'Flights' },
                        { key: 'visaAssistance' as const, label: 'Visa help' },
                        { key: 'insurance' as const, label: 'Insurance' },
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
              <div className="stack-form rounded-xl border border-primary/20 pad-panel glass-well">
                <p className="text-sm">
                  <strong>Customer:</strong> {clientSummaryLabel()}
                </p>
                <p className="text-sm">
                  <strong>Trip:</strong>{' '}
                  {TRAVEL_TYPE_LABELS[form.travelType] || form.travelType} ·{' '}
                  {DOMESTIC_LABELS[form.domesticOrIntl] || form.domesticOrIntl}
                  {form.origin ? ` · from ${placeName(form.origin)}` : ''} ·{' '}
                  {form.destinations.map((d) => d.name).join(', ') || '—'}
                  {form.stops.length
                    ? ` · via ${form.stops.map((s) => placeName(s)).join(', ')}`
                    : ''}
                  {form.nights ? ` · ${form.nights}N` : ''}
                  {form.startDate ? ` · ${form.startDate}` : ''}
                  {form.endDate ? ` → ${form.endDate}` : ''}
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
                  <StatusBadge value="done" tone="success" showIcon size="md" label="Ready to save" />
                )}
              </div>
            )}
          </Wizard>
        )}
        {!isIntake && !showQuick ? (
          <div className="mt-3 flex justify-start">
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setVariant('quick')}>
              Switch to quick inquiry
            </Button>
          </div>
        ) : null}
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
              inputSize="sm"
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
              inputSize="sm"
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
              size="sm"
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
              inputSize="sm"
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
              inputSize="sm"
              value={placeForm.country}
              onChange={(e) => setPlaceForm({ ...placeForm, country: e.target.value })}
              placeholder="India"
            />
          </FormField>
          <FormField label="Region">
            <Input
              inputSize="sm"
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
