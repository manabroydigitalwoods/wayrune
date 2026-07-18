import type { LucideIcon } from 'lucide-react';
import {
  BedDouble,
  BookOpen,
  Building2,
  CalendarDays,
  Car,
  ClipboardList,
  ConciergeBell,
  Flame,
  HeartHandshake,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  Leaf,
  Network,
  QrCode,
  Settings,
  Settings2,
  Sparkles,
  Truck,
  UserRound,
  UtensilsCrossed,
  Wallet,
  Wrench,
} from 'lucide-react';
import { stripOrgPrefix } from './agencyRoutes';
import {
  isDriverOrgKind,
  isFleetOrgKind,
  isRestaurantOrgKind,
  isStayOrgKind,
  stayHousekeepingLabel,
  stayRatesLabel,
  stayRoomsLabel,
} from './orgKind';

export type PartnerOsNavItem = {
  /** Stable section id (matches historical ?tab= values). */
  id: string;
  /** Canonical path — `/` for kind default, else `/kitchen`, `/rate-plans`, … */
  path: string;
  label: string;
  icon: LucideIcon;
  section: string;
  /** Permission key required to see this section (undefined = always visible). */
  permission?: string;
};

/**
 * Section id → required permission (aligned with backend @RequirePermissions).
 * Sections not listed here (dashboard, portfolio, today) are always visible.
 * Every partner role holds `ops.read`, so ops.read sections act as a safe
 * always-visible default landing for partner staff.
 */
const SECTION_PERMISSION: Record<string, string> = {
  // Stay
  properties: 'inventory.read',
  rooms: 'inventory.read',
  front_desk: 'reservations.confirm',
  reservations: 'reservations.create',
  housekeeping: 'ops.write',
  maintenance: 'ops.write',
  rates: 'rates.manage',
  experiences: 'inventory.manage',
  qr_locations: 'ops.read',
  guest_menu: 'ops.read',
  live_tickets: 'ops.read',
  companion_settings: 'org.settings.read',
  care: 'ops.read',
  inbox: 'network.read',
  // Fleet
  book: 'reservations.create',
  fleet: 'inventory.read',
  ops: 'reservations.confirm', // "Checkout"
  bill: 'finance.payment.manage',
  // Restaurant
  inquiry: 'ops.read',
  reserve: 'reservations.create',
  kitchen: 'ops.read',
  catalog: 'inventory.read',
  // Driver
  jobs: 'ops.read',
  calendar: 'ops.read',
  pay: 'finance.payment.manage',
  // Generic / shared across partner portals
  inventory: 'inventory.read',
  inbound: 'network.read',
  network: 'network.read',
  profile: 'profile.publish',
  suppliers: 'network.read',
  settings: 'org.settings.read',
};

/** External app routes reachable from partner nav that do NOT mount PartnerHomePage. */
export function isExternalPartnerPath(path: string) {
  return path === '/network' || path === '/settings' || path === '/suppliers';
}

/** Paths reserved by agency/platform routes — partner `rates` uses `/rate-plans`. */
const PATH_OVERRIDES: Record<string, string> = {
  rates: '/rate-plans',
  front_desk: '/front-desk',
};

export function partnerOsPathForSectionId(sectionId: string, isDefault: boolean): string {
  if (isDefault) return '/';
  if (PATH_OVERRIDES[sectionId]) return PATH_OVERRIDES[sectionId]!;
  return `/${sectionId.replace(/_/g, '-')}`;
}

export function partnerOsDefaultSectionId(kind?: string | null): string {
  if (isStayOrgKind(kind)) return 'dashboard';
  if (isFleetOrgKind(kind)) return 'book';
  if (isRestaurantOrgKind(kind)) return 'inquiry';
  if (isDriverOrgKind(kind)) return 'today';
  return 'portfolio';
}

/** Legacy ?tab= aliases → canonical section id for this kind. */
export function partnerOsNormalizeTabId(
  kind: string | null | undefined,
  tab: string | null | undefined,
): string {
  const raw = (tab || '').trim();
  if (!raw) return partnerOsDefaultSectionId(kind);
  if (raw === 'inventory') {
    if (isStayOrgKind(kind)) return 'rooms';
    if (isFleetOrgKind(kind)) return 'fleet';
    if (isDriverOrgKind(kind)) return 'calendar';
    return 'inventory';
  }
  // Guest Companion used to be one sidebar item with nested tabs
  if (raw === 'guest_services' || raw === 'guest-services') return 'qr_locations';
  if (raw === 'gs_menu' || raw === 'gs-menu') return 'guest_menu';
  if (raw === 'gs_board' || raw === 'gs-board' || raw === 'gs_kitchen') {
    return 'live_tickets';
  }
  if (raw === 'gs_settings' || raw === 'gs-settings') return 'companion_settings';
  return raw;
}

/** Shared Guest Companion ops items (staff portal — public guest page stays separate). */
export const GUEST_COMPANION_NAV: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'qr_locations', label: 'QR Locations', icon: QrCode },
  { id: 'guest_menu', label: 'Menu', icon: BookOpen },
  { id: 'live_tickets', label: 'Live tickets', icon: Flame },
  { id: 'companion_settings', label: 'Companion', icon: Settings2 },
];

/** Tag every item with its required permission (undefined = always visible). */
export function partnerOsNavForKind(kind?: string | null): PartnerOsNavItem[] {
  return buildPartnerOsNavForKind(kind).map((item) => ({
    ...item,
    permission: item.permission ?? SECTION_PERMISSION[item.id],
  }));
}

function buildPartnerOsNavForKind(kind?: string | null): PartnerOsNavItem[] {
  const def = partnerOsDefaultSectionId(kind);

  if (isStayOrgKind(kind)) {
    const ops: Array<{ id: string; label: string; icon: LucideIcon }> = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'properties', label: 'Properties', icon: Building2 },
      { id: 'rooms', label: stayRoomsLabel(kind), icon: BedDouble },
      { id: 'front_desk', label: 'Front desk', icon: ConciergeBell },
      { id: 'reservations', label: 'Reservations', icon: CalendarDays },
      { id: 'housekeeping', label: stayHousekeepingLabel(kind), icon: Sparkles },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench },
      { id: 'rates', label: stayRatesLabel(kind), icon: Wallet },
    ];
    if (kind === 'farmstay') {
      ops.push({ id: 'experiences', label: 'Experiences', icon: Leaf });
    }
    ops.push(
      ...GUEST_COMPANION_NAV,
      { id: 'care', label: 'Care', icon: HeartHandshake },
      { id: 'inbox', label: 'Inbox', icon: ClipboardList },
    );
    const items: PartnerOsNavItem[] = ops.map((o) => ({
      ...o,
      path: partnerOsPathForSectionId(o.id, o.id === def),
      section: 'Operations',
    }));
    items.push(
      {
        id: 'network',
        path: '/network',
        label: 'Network',
        icon: Network,
        section: 'Partners',
      },
      {
        id: 'profile',
        path: partnerOsPathForSectionId('profile', false),
        label: 'Profile',
        icon: UserRound,
        section: 'Partners',
      },
      {
        id: 'suppliers',
        path: '/suppliers',
        label: 'My suppliers',
        icon: Truck,
        section: 'Partners',
      },
      {
        id: 'settings',
        path: '/settings',
        label: 'Settings',
        icon: Settings,
        section: 'System',
      },
    );
    return items;
  }

  if (isFleetOrgKind(kind)) {
    const ops = [
      { id: 'book', label: 'Book', icon: ClipboardList },
      { id: 'fleet', label: 'Fleet', icon: Car },
      { id: 'rates', label: 'Rates', icon: IndianRupee },
      { id: 'ops', label: 'Checkout', icon: KeyRound },
      { id: 'bill', label: 'Bill', icon: Wallet },
      { id: 'care', label: 'Care', icon: HeartHandshake },
    ];
    return [
      ...ops.map((o) => ({
        ...o,
        path: partnerOsPathForSectionId(o.id, o.id === def),
        section: 'Operations' as const,
      })),
      {
        id: 'inbound',
        path: partnerOsPathForSectionId('inbound', false),
        label: 'Inbound',
        icon: ClipboardList,
        section: 'Partners',
      },
      {
        id: 'profile',
        path: partnerOsPathForSectionId('profile', false),
        label: 'Profile',
        icon: UserRound,
        section: 'Partners',
      },
      {
        id: 'network',
        path: '/network',
        label: 'Network',
        icon: Network,
        section: 'Partners',
      },
      {
        id: 'settings',
        path: '/settings',
        label: 'Settings',
        icon: Settings,
        section: 'System',
      },
    ];
  }

  if (isRestaurantOrgKind(kind)) {
    const ops = [
      { id: 'inquiry', label: 'Inquiry', icon: ClipboardList },
      { id: 'reserve', label: 'Reserve', icon: UtensilsCrossed },
      { id: 'kitchen', label: 'Kitchen', icon: LayoutDashboard },
      ...GUEST_COMPANION_NAV,
      { id: 'bill', label: 'Bill', icon: Wallet },
      { id: 'care', label: 'Care', icon: HeartHandshake },
      { id: 'catalog', label: 'Catalog', icon: CalendarDays },
    ];
    return [
      ...ops.map((o) => ({
        ...o,
        path: partnerOsPathForSectionId(o.id, o.id === def),
        section: 'Operations' as const,
      })),
      {
        id: 'inbound',
        path: partnerOsPathForSectionId('inbound', false),
        label: 'Inbound',
        icon: ClipboardList,
        section: 'Partners',
      },
      {
        id: 'profile',
        path: partnerOsPathForSectionId('profile', false),
        label: 'Profile',
        icon: UserRound,
        section: 'Partners',
      },
      {
        id: 'network',
        path: '/network',
        label: 'Network',
        icon: Network,
        section: 'Partners',
      },
      {
        id: 'settings',
        path: '/settings',
        label: 'Settings',
        icon: Settings,
        section: 'System',
      },
    ];
  }

  if (isDriverOrgKind(kind)) {
    const ops = [
      { id: 'today', label: 'Today', icon: LayoutDashboard },
      { id: 'jobs', label: 'Jobs', icon: ClipboardList },
      { id: 'calendar', label: 'Calendar', icon: CalendarDays },
      { id: 'pay', label: 'Pay', icon: Wallet },
      { id: 'care', label: 'Care', icon: HeartHandshake },
    ];
    return [
      ...ops.map((o) => ({
        ...o,
        path: partnerOsPathForSectionId(o.id, o.id === def),
        section: 'Operations' as const,
      })),
      {
        id: 'inbound',
        path: partnerOsPathForSectionId('inbound', false),
        label: 'Inbound',
        icon: ClipboardList,
        section: 'Partners',
      },
      {
        id: 'profile',
        path: partnerOsPathForSectionId('profile', false),
        label: 'Profile',
        icon: UserRound,
        section: 'Partners',
      },
      {
        id: 'network',
        path: '/network',
        label: 'Network',
        icon: Network,
        section: 'Partners',
      },
      {
        id: 'settings',
        path: '/settings',
        label: 'Settings',
        icon: Settings,
        section: 'System',
      },
    ];
  }

  // Generic partner (`other`)
  return [
    {
      id: 'portfolio',
      path: '/',
      label: 'Home',
      icon: Building2,
      section: 'Workspace',
    },
    {
      id: 'inventory',
      path: partnerOsPathForSectionId('inventory', false),
      label: 'Inventory',
      icon: CalendarDays,
      section: 'Workspace',
    },
    {
      id: 'profile',
      path: partnerOsPathForSectionId('profile', false),
      label: 'Profile',
      icon: UserRound,
      section: 'Workspace',
    },
    {
      id: 'inbound',
      path: partnerOsPathForSectionId('inbound', false),
      label: 'Inbound',
      icon: ClipboardList,
      section: 'Workspace',
    },
    {
      id: 'network',
      path: '/network',
      label: 'Network',
      icon: Network,
      section: 'Workspace',
    },
    {
      id: 'suppliers',
      path: '/suppliers',
      label: 'My suppliers',
      icon: Truck,
      section: 'Workspace',
    },
    {
      id: 'settings',
      path: '/settings',
      label: 'Settings',
      icon: Settings,
      section: 'System',
    },
  ];
}

/** Resolve section id from URL path for the current kind. */
export function partnerOsSectionFromPath(
  pathname: string,
  kind?: string | null,
): string {
  // Support HubSpot-style `/:orgRef/companion-settings` as well as flat paths.
  const relative = stripOrgPrefix(pathname);
  const nav = partnerOsNavForKind(kind);
  const hit = nav.find((n) => n.path === relative && !isExternalPartnerPath(n.path));
  if (hit) return hit.id;
  if (relative === '/') return partnerOsDefaultSectionId(kind);

  const seg = relative.replace(/^\//, '').replace(/-/g, '_');
  if (seg === 'rate_plans') return 'rates';
  if (seg === 'front_desk') return 'front_desk';
  if (!seg) return partnerOsDefaultSectionId(kind);
  return partnerOsNormalizeTabId(kind, seg);
}

export function partnerOsPathForSection(
  kind: string | null | undefined,
  sectionId: string,
): string {
  const normalized = partnerOsNormalizeTabId(kind, sectionId);
  const def = partnerOsDefaultSectionId(kind);
  const nav = partnerOsNavForKind(kind);
  const hit = nav.find((n) => n.id === normalized);
  if (hit) return hit.path;
  return partnerOsPathForSectionId(normalized, normalized === def);
}

/** Unique React Router paths that should mount PartnerHomePage (excluding `/`). */
export function allPartnerOsMountPaths(): string[] {
  const kinds = [
    'hotel',
    'homestay',
    'farmstay',
    'restaurant',
    'car_rental',
    'driver',
    'other',
  ];
  const set = new Set<string>();
  for (const kind of kinds) {
    for (const item of partnerOsNavForKind(kind)) {
      if (item.path !== '/' && !isExternalPartnerPath(item.path)) {
        set.add(item.path);
      }
    }
  }
  return [...set].sort();
}

/** Map legacy `/?tab=` to a path for redirect. */
export function partnerOsRedirectFromTabQuery(
  kind: string | null | undefined,
  tab: string | null,
): string | null {
  if (!tab) return null;
  const id = partnerOsNormalizeTabId(kind, tab);
  const path = partnerOsPathForSection(kind, id);
  return path === '/' ? null : path;
}
