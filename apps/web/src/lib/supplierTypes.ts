/** Canonical supplier type labels, groups, and predicates for agency UI. */

export type SupplierTypeValue =
  | 'hotel'
  | 'homestay'
  | 'farmstay'
  | 'restaurant'
  | 'car_rental'
  | 'driver'
  | 'activity'
  | 'guide'
  | 'dmc'
  | 'other'
  | string;

export const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  homestay: 'Homestay',
  farmstay: 'Farmstay',
  restaurant: 'Restaurant',
  car_rental: 'Car rental',
  driver: 'Driver',
  activity: 'Activity provider',
  guide: 'Guide',
  dmc: 'DMC',
  other: 'Other',
  transfer: 'Transfer',
  transport: 'Transport',
  flight_ref: 'Flight',
};

export type SupplierTypeGroup = {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

/** Grouped chips for New Supplier / filters. */
export const SUPPLIER_TYPE_GROUPS: SupplierTypeGroup[] = [
  {
    id: 'accommodation',
    label: 'Accommodation',
    options: [
      { value: 'hotel', label: 'Hotel' },
      { value: 'homestay', label: 'Homestay' },
      { value: 'farmstay', label: 'Farmstay' },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    options: [{ value: 'restaurant', label: 'Restaurant' }],
  },
  {
    id: 'transport',
    label: 'Transport',
    options: [
      { value: 'car_rental', label: 'Car rental' },
      { value: 'driver', label: 'Driver' },
    ],
  },
  {
    id: 'experience',
    label: 'Experience',
    options: [
      { value: 'activity', label: 'Activity provider' },
      { value: 'guide', label: 'Guide' },
    ],
  },
  {
    id: 'multi',
    label: 'Multi-service',
    options: [{ value: 'dmc', label: 'DMC' }],
  },
  {
    id: 'generic',
    label: 'Generic',
    options: [{ value: 'other', label: 'Other' }],
  },
];

/** Flat list for SuggestionChips (order follows groups). */
export const SUPPLIER_TYPE_OPTIONS = SUPPLIER_TYPE_GROUPS.flatMap((g) => g.options);

export function supplierTypeLabel(type?: string | null): string {
  if (!type) return 'Other';
  return SUPPLIER_TYPE_LABELS[type] || type.replace(/_/g, ' ');
}

export function isStaySupplierType(type?: string | null): boolean {
  return type === 'hotel' || type === 'homestay' || type === 'farmstay';
}

export function isInventorySupplierType(type?: string | null): boolean {
  return (
    isStaySupplierType(type) ||
    type === 'car_rental' ||
    type === 'driver' ||
    type === 'restaurant'
  );
}

export function isTransportSupplierType(type?: string | null): boolean {
  return (
    type === 'car_rental' ||
    type === 'driver' ||
    type === 'transfer' ||
    type === 'transport'
  );
}

export function isExperienceSupplierType(type?: string | null): boolean {
  return type === 'activity' || type === 'guide';
}

/** Query param for GET /suppliers?type=… when picking stay suppliers. */
export const STAY_SUPPLIER_TYPE_QUERY = 'hotel,homestay,farmstay';

/** Query param for activity/guide pickers. */
export const EXPERIENCE_SUPPLIER_TYPE_QUERY = 'activity,guide';

/** Section title on supplier detail (not the supplier name). */
export function supplierProfileSectionTitle(type?: string | null): string {
  if (isStaySupplierType(type)) return 'Property profile';
  switch (type) {
    case 'restaurant':
      return 'Restaurant profile';
    case 'car_rental':
      return 'Fleet profile';
    case 'driver':
      return 'Driver profile';
    case 'activity':
      return 'Activity catalogue';
    case 'guide':
      return 'Guide profile';
    case 'dmc':
      return 'Destinations and services';
    default:
      return 'Service profile';
  }
}

function amenitiesFilled(v: unknown): boolean {
  if (!Array.isArray(v)) return false;
  return v.filter((x) => typeof x === 'string' && x.trim()).length >= 3;
}

function profileKeyFilled(key: string, profile: Record<string, unknown>): boolean {
  if (key === 'amenities') return amenitiesFilled(profile[key]);
  return profileValueFilled(profile[key]);
}

/** Keys used to score profile completeness for a supplier type. */
export function supplierProfileCompletenessKeys(type?: string | null): string[] {
  if (isStaySupplierType(type)) {
    return ['imageUrl', 'description', 'amenities', 'checkIn', 'checkOut'];
  }
  switch (type) {
    case 'restaurant':
      return [
        'cuisine',
        'mealPeriods',
        'menuType',
        'seatingCapacity',
        'openingHours',
        'vegNonVeg',
        'photos',
      ];
    case 'car_rental':
      return [
        'fleetHint',
        'vehicleTypes',
        'routesServed',
        'permitNotes',
        'parkingTollPolicy',
      ];
    case 'driver':
      return [
        'licenceNumber',
        'licenceExpiry',
        'languages',
        'serviceAreas',
        'emergencyContact',
        'verificationStatus',
      ];
    case 'activity':
      return [
        'activitiesOffered',
        'durationHint',
        'privateOrSic',
        'capacity',
        'inclusions',
        'safetyNotes',
      ];
    case 'guide':
      return ['languages', 'destinations', 'specialties', 'verificationStatus'];
    case 'dmc':
      return [
        'destinationsServed',
        'serviceCategories',
        'markets',
        'emergencyContact',
        'bookingSlaHint',
      ];
    default:
      return ['serviceCategory', 'description', 'serviceArea'];
  }
}

function profileValueFilled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return Boolean(v.trim());
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Stay property is proposal-ready when marketing basics + at least one room product exist. */
export function supplierStayPropertyComplete(
  profile: Record<string, unknown> | null | undefined,
  roomProductCount: number,
): boolean {
  const p = profile && typeof profile === 'object' ? profile : {};
  return (
    profileValueFilled(p.imageUrl) &&
    profileValueFilled(p.description) &&
    roomProductCount >= 1 &&
    profileValueFilled(p.checkIn) &&
    profileValueFilled(p.checkOut) &&
    amenitiesFilled(p.amenities)
  );
}

export function supplierProfileCompletenessLabel(
  type: string | null | undefined,
  profile: Record<string, unknown> | null | undefined,
  opts?: { roomProductCount?: number },
): string {
  const keys = supplierProfileCompletenessKeys(type);
  if (!keys.length) return 'Optional';
  const p = profile && typeof profile === 'object' ? profile : {};
  const filled = keys.filter((k) => profileKeyFilled(k, p)).length;
  if (isStaySupplierType(type)) {
    const roomFilled = (opts?.roomProductCount ?? 0) >= 1 ? 1 : 0;
    const total = keys.length + 1;
    const done = filled + roomFilled;
    if (done === 0) return 'Incomplete';
    if (supplierStayPropertyComplete(profile, opts?.roomProductCount ?? 0)) {
      return 'Complete';
    }
    return `${Math.round((done / total) * 100)}% complete`;
  }
  if (filled === 0) return 'Incomplete';
  if (filled >= keys.length) return 'Complete';
  const pct = Math.round((filled / keys.length) * 100);
  return `${pct}% complete`;
}

export function contactCompletenessLabel(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  if (!input.name?.trim()) return 'Incomplete';
  if (!input.email?.trim() && !input.phone?.trim()) return 'Incomplete';
  return 'Complete';
}
