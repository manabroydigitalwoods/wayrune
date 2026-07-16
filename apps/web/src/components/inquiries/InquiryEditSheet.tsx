import { useEffect, useState } from 'react';
import { UpdateInquirySchema, parseWithFieldErrors } from '@travel/contracts';
import {
  DatePicker,
  FormGrid,
  HOTEL_CATEGORY_OPTIONS,
  Input,
  MEAL_PLAN_OPTIONS,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  SuggestionChips,
  TRANSPORT_PREF_OPTIONS,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { PlaceMultiPicker, PlaceSinglePicker } from '../places/PlacePicker';
import { placeName, placeRefsFromJson, type PlaceRef } from '../../lib/placeRefs';

export type InquiryEditSource = {
  id: string;
  inquiryNumber: string;
  status: string;
  travelType?: string | null;
  domesticOrIntl?: string | null;
  origin?: string | null;
  originPlaceId?: string | null;
  destinationsJson?: unknown;
  stopsJson?: unknown;
  startDate?: string | null;
  endDate?: string | null;
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
};

type UpdatedInquiry = InquiryEditSource & {
  missingFieldsJson?: string[] | null;
};

function originRef(inquiry: InquiryEditSource): PlaceRef | null {
  if (!inquiry.origin) return null;
  return {
    placeId: inquiry.originPlaceId ?? null,
    name: inquiry.origin,
  };
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
      startDate: inquiry.startDate ? formatDateInput(new Date(inquiry.startDate)) : '',
      endDate: inquiry.endDate ? formatDateInput(new Date(inquiry.endDate)) : '',
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
          value={form.origin}
          onChange={(origin) => setForm({ ...form, origin })}
          domesticOrIntl={form.domesticOrIntl}
          placeholder="Search origin city…"
        />
        <PlaceMultiPicker
          label="Destinations"
          required
          value={form.destinations}
          onChange={(destinations) => setForm({ ...form, destinations })}
          domesticOrIntl={form.domesticOrIntl}
          placeholder="Search destinations…"
        />
        <PlaceMultiPicker
          label="Stops (optional)"
          value={form.stops}
          onChange={(stops) => setForm({ ...form, stops })}
          domesticOrIntl={form.domesticOrIntl}
          placeholder="Search stops…"
          allowExpandRegions={false}
        />
        <FormGrid>
          <FormField label="Start date" error={errors.startDate}>
            <DatePicker
              value={parseDateInput(form.startDate)}
              onChange={(d) => setForm({ ...form, startDate: formatDateInput(d) })}
            />
          </FormField>
          <FormField label="End date" error={errors.endDate}>
            <DatePicker
              value={parseDateInput(form.endDate)}
              onChange={(d) => setForm({ ...form, endDate: formatDateInput(d) })}
            />
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="Adults" required error={errors.adults}>
            <Input
              type="number"
              min={1}
              value={form.adults}
              onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Children">
            <Input
              type="number"
              min={0}
              value={form.children}
              onChange={(e) => setForm({ ...form, children: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Budget" required error={errors.budgetAmount}>
            <PriceField
              value={form.budgetAmount}
              onChange={(raw) =>
                setForm({ ...form, budgetAmount: raw === '' ? 0 : Number(raw) })
              }
              maxFractionDigits={0}
            />
          </FormField>
        </FormGrid>
        {Number(form.adults) + Number(form.children) > 0 && Number(form.budgetAmount) > 0 ? (
          <p className="text-xs text-muted-foreground">
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
            value={form.roomRequirements}
            onChange={(e) => setForm({ ...form, roomRequirements: e.target.value })}
            placeholder="e.g. 1 double + 1 twin"
          />
        </FormField>
        <FormField label="Notes">
          <Input
            value={form.specialRequirements}
            onChange={(e) => setForm({ ...form, specialRequirements: e.target.value })}
            placeholder="Special requirements"
          />
        </FormField>
        {form.destinations.length ? (
          <p className="text-xs text-muted-foreground">
            Destinations: {form.destinations.map((d) => placeName(d)).join(', ')}
          </p>
        ) : null}
      </div>
    </RecordSheet>
  );
}
