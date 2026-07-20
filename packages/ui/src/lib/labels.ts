/** Map API / camelCase field keys to user-facing labels. */
const FIELD_LABELS: Record<string, string> = {
  destinations: 'Destinations',
  startDate: 'Start date',
  endDate: 'End date',
  adults: 'Adults',
  children: 'Children',
  infants: 'Infants',
  budgetAmount: 'Budget',
  travelType: 'Travel type',
  domesticOrIntl: 'Domestic / International',
  partyId: 'Client',
  contactName: 'Contact name',
  displayName: 'Client / company name',
  email: 'Email',
  phone: 'Phone',
  title: 'Title',
};

const ACTIVITY_LABELS: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  stage_change: 'Stage change',
  status_change: 'Status change',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  sightseeing: 'Sightseeing',
  activity: 'Sightseeing', // legacy
  transfer: 'Transfer',
  flight: 'Flight',
  meal: 'Meal',
  free_time: 'Free time',
  note: 'Note',
  other: 'Other',
};

export function humanizeFieldKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

export function humanizeFieldKeys(keys: string[]): string {
  return keys.map(humanizeFieldKey).join(', ');
}

export function humanizeActivityType(type: string): string {
  return ACTIVITY_LABELS[type] ?? humanizeFieldKey(type);
}

export function humanizeItemType(type: string): string {
  return ITEM_TYPE_LABELS[type] ?? humanizeFieldKey(type);
}

export function humanizeEntityType(type: string): string {
  const map: Record<string, string> = {
    lead: 'Lead',
    inquiry: 'Inquiry',
    trip: 'Trip',
    party: 'Client',
    supplier_hotel_rate: 'Hotel rate',
  };
  return map[type] ?? humanizeFieldKey(type);
}
