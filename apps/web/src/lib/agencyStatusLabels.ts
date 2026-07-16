/**
 * Agency-friendly lifecycle labels for inquiries and trips.
 * Applied per render site because several status keys (open, converted,
 * quoted, in_progress) are shared with partner verticals in the global map.
 */
export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  open: 'Planning',
  draft: 'Draft',
  qualified: 'Qualified',
  converted: 'Trip started',
  lost: 'Lost',
  closed: 'Closed',
};

export const INQUIRY_STATUS_FACET_OPTIONS = [
  { value: 'open', label: 'Planning' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Trip started' },
  { value: 'lost', label: 'Lost' },
] as const;

export const TRIP_STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'quoted', label: 'Proposal' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'booking_in_progress', label: 'Booking' },
  { value: 'ready_to_travel', label: 'Ready to travel' },
  { value: 'in_progress', label: 'Travelling' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const TRIP_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  TRIP_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export function inquiryStatusLabel(status: string): string | undefined {
  return INQUIRY_STATUS_LABELS[status];
}

export function tripStatusLabel(status: string): string | undefined {
  return TRIP_STATUS_LABELS[status];
}

/** Dashboard / list copy for open planning-stage inquiries. */
export const PLANNING_INQUIRIES_LABEL = 'Planning inquiries';
