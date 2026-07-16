export type ModifierOption = { id: string; name: string; priceDelta: number };
export type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
};

export type Offering = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  kind?: string;
  unitPrice: number;
  currency: string;
  dietaryLabels?: string[] | null;
  maxQuantity?: number | null;
  prepMinutes?: number | null;
  imageUrl?: string | null;
  sortOrder?: number | null;
  modifiers?: ModifierGroup[] | null;
  ordersToday?: number;
  ratingAvg?: number | null;
  ratingCount?: number;
  featured?: boolean;
};

export type MenuCategory = { key: string; label: string; emoji?: string | null };

export type MenuSpecial = {
  type: string;
  title: string;
  offeringId: string;
  blurb?: string | null;
  until?: string | null;
  offering?: Offering | null;
};

export type MenuCombo = {
  id: string;
  name: string;
  offeringIds: string[];
  price: number;
  currency: string;
  saveAmount?: number | null;
};

export type ResolvePayload = {
  location: {
    label: string;
    locationType: string;
    assetName: string;
    assetKind?: string;
  };
  businessName: string;
  acceptingOrders: boolean;
  reason?: string | null;
  message?: string | null;
  offerings: Offering[];
  menuCategories?: MenuCategory[];
  popularToday?: Offering[];
  featuredOfferingIds?: string[];
  specials?: MenuSpecial[];
  combos?: MenuCombo[];
  upsellPairs?: Record<string, string[]>;
  suggestedSearchTokens?: string[];
  kitchen?: {
    accepting: boolean;
    busy: boolean;
    openTickets: number;
    avgPrepMinutes: number;
    estimatedWaitMinutes: number;
  } | null;
  venueRating?: { ratingAvg: number | null; ratingCount: number };
  companion?: {
    canRequestBill: boolean;
    canCallWaiter: boolean;
    canPay: boolean;
    tableSessionId: string | null;
  };
  allergenDisclaimer: string;
  stayContext?: {
    requiresPin: boolean;
    roomLabel: string;
    stayReservationId?: string;
  } | null;
  tableSession?: { id: string; status: string; guestCount?: number } | null;
  payment?: { enabled: boolean; tableSessionId?: string | null } | null;
};

export type CartLine = {
  key: string;
  offeringId: string;
  quantity: number;
  name: string;
  unitPrice: number;
  modifierDelta: number;
  modifiers: Array<{
    groupId: string;
    optionId: string;
    name: string;
    priceDelta: number;
  }>;
};

export type ExperienceProduct = {
  id: string;
  title: string;
  description?: string | null;
  price: number | null;
  currency: string;
  durationMinutes?: number | null;
  slots: Array<{
    id: string;
    startAt: string;
    endAt: string;
    seatsLeft: number;
  }>;
};

export type JourneyPhase = 'discover' | 'order' | 'service' | 'finish';

export function inr(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

export function isRoomLike(type: string) {
  return /ROOM|HOMESTAY|FARMSTAY|HOTEL/i.test(type);
}

export function isRestaurantLoc(type: string) {
  return type === 'RESTAURANT_TABLE' || type === 'DINING_ZONE';
}

export function dietShort(label: string) {
  const l = label.toLowerCase().replace(/_/g, ' ');
  if (l.includes('non') && l.includes('veg')) return 'Non-veg';
  if (l.includes('veg')) return 'Veg';
  if (l.includes('jain')) return 'Jain';
  if (l.includes('vegan')) return 'Vegan';
  if (l.includes('gluten')) return 'GF';
  if (l === 'for_kids' || l === 'kids') return 'Kids';
  if (l === 'for_couples' || l === 'couples') return 'Couples';
  if (l === 'for_family' || l === 'family') return 'Family';
  return label;
}

export function hasRequiredModifiers(o: Offering) {
  const mods = o.modifiers || [];
  return mods.some((g) => (g.minSelect || 0) > 0);
}

export function dishTone(id: string) {
  const tones = [
    ['#2a1810', '#8b4518'],
    ['#1c2e1a', '#4a6741'],
    ['#2c1810', '#a0522d'],
    ['#1a2430', '#3d5a6c'],
    ['#2e1f0f', '#6b4423'],
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % tones.length;
  return tones[h]!;
}

export function newIdempotencyKey() {
  return `gs_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function plainCartKey(offeringId: string) {
  return `${offeringId}:plain`;
}

export function cartQtyForOffering(cart: CartLine[], offeringId: string) {
  return cart
    .filter((l) => l.offeringId === offeringId)
    .reduce((s, l) => s + l.quantity, 0);
}

export function recentOrdersKey(token: string) {
  return `gs-recent:${token}`;
}

export function readRecentOrders(token: string): string[] {
  try {
    const raw = localStorage.getItem(recentOrdersKey(token));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function writeRecentOrders(token: string, offeringIds: string[]) {
  try {
    localStorage.setItem(
      recentOrdersKey(token),
      JSON.stringify([...new Set(offeringIds)].slice(0, 8)),
    );
  } catch {
    /* ignore */
  }
}
