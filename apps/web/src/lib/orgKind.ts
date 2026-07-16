/** Human labels for Organization.kind in switcher and partner chrome. */
const KIND_LABELS: Record<string, string> = {
  travel_agency: 'Agency',
  platform: 'Platform',
  hotel: 'Hotel',
  homestay: 'Homestay',
  farmstay: 'Farmstay',
  car_rental: 'Cars',
  driver: 'Driver',
  restaurant: 'Restaurant',
  dmc: 'DMC',
  other: 'Partner',
};

export function orgKindLabel(kind?: string | null): string {
  if (!kind) return 'Partner';
  return KIND_LABELS[kind] || kind.replace(/_/g, ' ');
}

/** Agency spine workspaces: travel agency + DMC (Agency OS variant). */
export function isAgencyKind(kind?: string | null) {
  return !kind || kind === 'travel_agency' || kind === 'dmc';
}

export function isDmcOrgKind(kind?: string | null) {
  return kind === 'dmc';
}

export function isPlatformKind(kind?: string | null) {
  return kind === 'platform';
}

export function isStayOrgKind(kind?: string | null) {
  return kind === 'hotel' || kind === 'homestay' || kind === 'farmstay';
}

export function isHomestayOrgKind(kind?: string | null) {
  return kind === 'homestay';
}

export function isFarmstayOrgKind(kind?: string | null) {
  return kind === 'farmstay';
}

/** Sidebar / page title for stay tabs — homestay uses warmer labels. */
export function stayTabLabel(kind: string | null | undefined, tabId: string): string | null {
  if (isHomestayOrgKind(kind)) {
    if (tabId === 'rooms') return 'Rooms & spaces';
    if (tabId === 'rates') return 'Price options';
    if (tabId === 'housekeeping') return 'House ready';
  }
  return null;
}

export function stayRoomsLabel(kind?: string | null): string {
  if (isHomestayOrgKind(kind)) return 'Rooms & spaces';
  return 'Rooms';
}

export function stayRatesLabel(kind?: string | null): string {
  if (isHomestayOrgKind(kind)) return 'Price options';
  return 'Rates';
}

export function stayHousekeepingLabel(kind?: string | null): string {
  if (isHomestayOrgKind(kind)) return 'House ready';
  return 'Housekeeping';
}

/** Stay tabs hidden for non-farmstay orgs (e.g. experiences). */
export function stayVisibleTabIds(kind?: string | null): string[] | undefined {
  if (isFarmstayOrgKind(kind)) return undefined;
  return [
    'dashboard',
    'properties',
    'rooms',
    'front_desk',
    'reservations',
    'housekeeping',
    'maintenance',
    'rates',
    'qr_locations',
    'guest_menu',
    'live_tickets',
    'companion_settings',
    'care',
    'inbox',
    'profile',
  ];
}

export function isFleetOrgKind(kind?: string | null) {
  return kind === 'car_rental';
}

export function isDriverOrgKind(kind?: string | null) {
  return kind === 'driver';
}

export function isRestaurantOrgKind(kind?: string | null) {
  return kind === 'restaurant';
}

export function isPartnerOrgKind(kind?: string | null) {
  return Boolean(kind) && !isAgencyKind(kind) && !isPlatformKind(kind);
}

export function stayFamilyAssetKinds() {
  return ['hotel', 'homestay', 'farmstay'] as const;
}

export function partnerHomeSubtitle(kind?: string | null): string {
  if (isStayOrgKind(kind)) {
    return 'Dashboard, rooms, reservations, housekeeping, and inbound agency bookings.';
  }
  if (isFleetOrgKind(kind)) {
    return 'Fleet units, rates, rentals (hold → checkout → return), deposits, and inbound bookings.';
  }
  if (isDriverOrgKind(kind)) {
    return 'Today’s jobs, calendar, assign → complete → pay, and inbound bookings.';
  }
  if (isRestaurantOrgKind(kind)) {
    return 'Profile, meal packages, capacity, and inbound bookings.';
  }
  return 'Profile, portfolio assets, inventory, and inbound bookings.';
}

/** Dashboard / nav chrome copy for agency vs DMC. */
export function agencyWorkspaceSubtitle(kind?: string | null): string {
  if (isDmcOrgKind(kind)) {
    return 'B2B clients, net+sell packages, local supplier fulfilment, and settlements.';
  }
  return 'Pipeline health, conversion, bookings, and AR aging.';
}

export function agencyClientsLabel(kind?: string | null): string {
  return isDmcOrgKind(kind) ? 'B2B clients' : 'Clients';
}
