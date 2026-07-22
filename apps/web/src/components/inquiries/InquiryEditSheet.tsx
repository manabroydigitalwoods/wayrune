import { useEffect, useState } from 'react';
import { UpdateInquirySchema, parseWithFieldErrors } from '@wayrune/contracts';
import {
  DatePicker,
  FormGrid,
  HOTEL_CATEGORY_OPTIONS,
  Input,
  MEAL_PLAN_OPTIONS,
  NumberField,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  SuggestionChips,
  TRANSPORT_PREF_OPTIONS,
  formatCurrency,
  humanizeFieldKeys,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import {
  nightsFromStartAndEnd,
  patchTravelDates,
} from '../../lib/inquiryTravelDates';
import { PlaceMultiPicker, PlaceSinglePicker } from '../places/PlacePicker';
import { placeName, placeRefsFromJson, originRefFromInquiry, type PlaceRef } from '../../lib/placeRefs';

const NIGHTS_QUICK = [2, 3, 5, 7];

export type InquiryEditSource = {
  id: string;
  inquiryNumber: string;
  status: string;
  travelType?: string | null;
  domesticOrIntl?: string | null;
  /** @deprecated Prefer originJson */
  origin?: string | null;
  /** @deprecated Prefer originJson */
  originPlaceId?: string | null;
  originJson?: unknown;
  destinationsJson?: unknown;
  stopsJson?: unknown;
  startDate?: string | null;
  endDate?: string | null;
  nights?: number | null;
  adults?: number;
  children?: number;
  infants?: number;
  budgetAmount?: number | string | null;
  budgetCurrency?: string | null;
  hotelCategory?: string | null;
  meals?: string | null;
  transportPref?: string | null;
  flightsRequired?: boolean;
  visaAssistance?: boolean;
  insurance?: boolean;
  roomRequirements?: string | null;
  specialRequirements?: string | null;
  internalNotes?: string | null;
  missingFieldsJson?: string[] | null;
};

type UpdatedInquiry = InquiryEditSource & {
  missingFieldsJson?: string[] | null;
};

function originRef(inquiry: InquiryEditSource): PlaceRef | null {
  return originRefFromInquiry(inquiry);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function InquiryEditSheet({
  open,
  onOpenChange,
  inquiry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiry: InquiryEditSource | null;
  onSaved?: (inquiry: UpdatedInquiry) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    travelType: 'leisure',
    domesticOrIntl: 'domestic',
    origin: null as PlaceRef | null,
    destinations: [] as PlaceRef[],
    stops: [] as PlaceRef[],
    adults: 2,
    children: 0,
    infants: 0,
    budgetAmount: 0,
    startDate: '',
    endDate: '',
    nights: null as number | null,
    hotelCategory: '',
    meals: '',
    transportPref: '',
    flightsRequired: false,
    visaAssistance: false,
    insurance: false,
    roomRequirements: '',
    specialRequirements: '',
    internalNotes: '',
  });

  useEffect(() => {
    if (!open || !inquiry) return;
    setErrors({});
    const destinations = placeRefsFromJson(inquiry.destinationsJson);
    const stops = placeRefsFromJson(inquiry.stopsJson);
    const startDate = inquiry.startDate ? formatDateInput(new Date(inquiry.startDate)) : '';
    const endDate = inquiry.endDate ? formatDateInput(new Date(inquiry.endDate)) : '';
    const nights =
      inquiry.nights != null && Number(inquiry.nights) >= 1
        ? Number(inquiry.nights)
        : nightsFromStartAndEnd(startDate, endDate);
    setForm({
      travelType: inquiry.travelType || 'leisure',
      domesticOrIntl: inquiry.domesticOrIntl || 'domestic',
      origin: originRef(inquiry),
      destinations,
      stops,
      adults: inquiry.adults ?? 2,
      children: inquiry.children ?? 0,
      infants: inquiry.infants ?? 0,
      budgetAmount: inquiry.budgetAmount != null ? Number(inquiry.budgetAmount) : 0,
      startDate,
      endDate,
      nights,
      hotelCategory: inquiry.hotelCategory || '',
      meals: inquiry.meals || '',
      transportPref: inquiry.transportPref || '',
      flightsRequired: inquiry.flightsRequired ?? false,
      visaAssistance: inquiry.visaAssistance ?? false,
      insurance: inquiry.insurance ?? false,
      roomRequirements: inquiry.roomRequirements || '',
      specialRequirements: inquiry.specialRequirements || '',
      internalNotes: inquiry.internalNotes || '',
    });
  }, [open, inquiry]);

  function applyTravelDatePatch(
    change: 'start' | 'nights' | 'end',
    next: { start?: string; nights?: number | null; end?: string },
  ) {
    setForm((prev) => {
      const patched = patchTravelDates({
        startDate: prev.startDate,
        nights: prev.nights,
        endDate: prev.endDate,
        change,
        nextStart: next.start,
        nextNights: next.nights,
        nextEnd: next.end,
      });
      return { ...prev, ...patched };
    });
  }

  async function save() {
    if (!inquiry) return;
    const parsed = parseWithFieldErrors(UpdateInquirySchema, {
      travelType: form.travelType,
      domesticOrIntl: form.domesticOrIntl as 'domestic' | 'international',
      origin: form.origin,
      destinations: form.destinations,
      stops: form.stops,
      adults: Number(form.adults),
      children: Number(form.children),
      infants: Number(form.infants),
      budgetAmount: Number(form.budgetAmount),
      budgetCurrency: inquiry.budgetCurrency || 'INR',
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      nights: form.nights,
      hotelCategory: form.hotelCategory || null,
      meals: form.meals || null,
      transportPref: form.transportPref || null,
      flightsRequired: form.flightsRequired,
      visaAssistance: form.visaAssistance,
      insurance: form.insurance,
      roomRequirements: form.roomRequirements || null,
      specialRequirements: form.specialRequirements || null,
      internalNotes: form.internalNotes || null,
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const updated = await api<UpdatedInquiry>(`/inquiries/${inquiry.id}`, {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      toastSuccess('Inquiry updated');
      onOpenChange(false);
      onSaved?.(updated);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update inquiry');
    } finally {
      setSubmitting(false);
    }
  }

  const missingCue = (inquiry?.missingFieldsJson || []).filter(Boolean);
  const optionalCue = [
    !form.origin ? 'Origin' : null,
    !form.endDate ? 'End date' : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <RecordSheet
      open={open}
      onOpenChange={onOpenChange}
      title={inquiry ? `Edit ${inquiry.inquiryNumber}` : 'Edit inquiry'}
      description="Update trip requirements — missing fields are recalculated when you save."
      wide
      submitLabel="Save changes"
      submitting={submitting}
      onSubmit={() => void save()}
    >
      <div className="space-y-5">
        {missingCue.length || optionalCue.length ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[length:var(--control-text-sm)] text-amber-950 dark:text-amber-100">
            {missingCue.length ? (
              <p>
                <span className="font-medium">Missing: </span>
                {missingCue.map((k) => humanizeFieldKeys([k])).join(' · ')}
              </p>
            ) : null}
            {optionalCue.length ? (
              <p className={missingCue.length ? 'mt-1' : undefined}>
                <span className="font-medium">Optional: </span>
                {optionalCue.join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}

        <Section title="Trip">
          <FormField label="Travel type">
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
          <FormField label="Scope">
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
            purpose="origin"
            value={form.origin}
            onChange={(origin) => setForm({ ...form, origin })}
            domesticOrIntl={form.domesticOrIntl}
            placeholder="Search city, airport or station…"
          />
          <PlaceMultiPicker
            label="Destinations"
            required
            purpose="destination"
            value={form.destinations}
            onChange={(destinations) => setForm({ ...form, destinations })}
            domesticOrIntl={form.domesticOrIntl}
            placeholder="Search city, region, state or country…"
            showSuggestions
          />
          <PlaceMultiPicker
            label="Stops (optional)"
            purpose="intermediate_stop"
            value={form.stops}
            onChange={(stops) => setForm({ ...form, stops })}
            domesticOrIntl={form.domesticOrIntl}
            placeholder="Search cities or regions…"
            allowExpandRegions={false}
          />
        </Section>

        <Section title="Dates">
          <FormGrid>
            <FormField label="Start date" error={errors.startDate}>
              <DatePicker
                size="sm"
                value={parseDateInput(form.startDate)}
                onChange={(d) =>
                  applyTravelDatePatch('start', { start: formatDateInput(d) })
                }
                disablePast
              />
            </FormField>
            <FormField label="Duration">
              <div className="flex flex-wrap items-center gap-1.5">
                {NIGHTS_QUICK.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`h-[var(--control-h-sm)] rounded-md border px-2.5 text-[length:var(--control-text-sm)] ${
                      form.nights === n
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'border-border/60 text-muted-foreground hover:border-primary/30'
                    }`}
                    onClick={() => applyTravelDatePatch('nights', { nights: n })}
                  >
                    {n} nights
                  </button>
                ))}
                <NumberField
                  inputSize="sm"
                  className="w-24"
                  min={1}
                  max={60}
                  value={form.nights ?? ''}
                  onChange={(raw) =>
                    applyTravelDatePatch('nights', {
                      nights: raw === '' ? null : Number(raw),
                    })
                  }
                  placeholder="Nights"
                />
              </div>
            </FormField>
            <FormField
              label="End date"
              description={
                form.startDate && form.nights
                  ? 'Updates when duration changes'
                  : undefined
              }
              error={errors.endDate}
            >
              <DatePicker
                size="sm"
                value={parseDateInput(form.endDate)}
                onChange={(d) => applyTravelDatePatch('end', { end: formatDateInput(d) })}
                disablePast
                minDate={parseDateInput(form.startDate) ?? undefined}
              />
            </FormField>
          </FormGrid>
        </Section>

        <Section title="Travellers & budget">
          <FormGrid>
            <FormField label="Adults" required error={errors.adults}>
              <NumberField
                inputSize="sm"
                min={1}
                value={form.adults}
                onChange={(raw) =>
                  setForm({ ...form, adults: raw === '' ? 0 : Number(raw) })
                }
                quickPicks={[1, 2, 3, 4]}
              />
            </FormField>
            <FormField label="Children">
              <NumberField
                inputSize="sm"
                min={0}
                value={form.children}
                onChange={(raw) =>
                  setForm({ ...form, children: raw === '' ? 0 : Number(raw) })
                }
                quickPicks={[0, 1, 2]}
              />
            </FormField>
            <FormField label="Budget" required error={errors.budgetAmount}>
              <PriceField
                size="sm"
                value={form.budgetAmount}
                onChange={(raw) =>
                  setForm({ ...form, budgetAmount: raw === '' ? 0 : Number(raw) })
                }
                maxFractionDigits={0}
              />
            </FormField>
          </FormGrid>
          {Number(form.adults) + Number(form.children) > 0 && Number(form.budgetAmount) > 0 ? (
            <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
              ≈{' '}
              {formatCurrency(
                Math.round(
                  Number(form.budgetAmount) / (Number(form.adults) + Number(form.children)),
                ),
                { maximumFractionDigits: 0 },
              )}{' '}
              / person
            </p>
          ) : null}
        </Section>

        <Section title="Preferences">
          <FormField label="Hotel">
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
              placeholder="e.g. 1 double + 1 twin"
            />
          </FormField>
          <FormField label="Notes">
            <Input
              inputSize="sm"
              value={form.specialRequirements}
              onChange={(e) => setForm({ ...form, specialRequirements: e.target.value })}
              placeholder="Special requirements"
            />
          </FormField>
        </Section>

        {form.destinations.length ? (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
            Destinations: {form.destinations.map((d) => placeName(d)).join(', ')}
          </p>
        ) : null}
      </div>
    </RecordSheet>
  );
}
