import type { CartLine, JourneyPhase } from './types';

/** Local Guest Companion session — cart ≠ submitted order. Offline-safe. */
export type GuestSessionSnapshot = {
  version: 1;
  qrToken: string;
  sessionId: string | null;
  startedAt: number;
  lastSeenAt: number;
  currentStatus: JourneyPhase;
  language: string;
  cart: {
    items: CartLine[];
    notes: string;
    lastUpdated: number;
  };
  submittedOrder: {
    id: string;
    shortNo: string | null;
    status: string | null;
    items: Array<{
      offeringId?: string | null;
      name: string;
      quantity?: number;
      lineTotal?: number;
      modifiers?: Array<{ name: string; priceDelta?: number }>;
    }>;
    updatedAt: number | null;
  } | null;
  preferences: {
    filters: string[];
    lastCategory: string | null;
    lastSearch: string;
  };
  orderedOfferingIds: string[];
};

function sessionKey(token: string) {
  return `gs-session:v1:${token}`;
}

export function emptyGuestSession(token: string): GuestSessionSnapshot {
  const now = Date.now();
  return {
    version: 1,
    qrToken: token,
    sessionId: null,
    startedAt: now,
    lastSeenAt: now,
    currentStatus: 'discover',
    language: typeof navigator !== 'undefined' ? navigator.language : 'en',
    cart: { items: [], notes: '', lastUpdated: now },
    submittedOrder: null,
    preferences: { filters: [], lastCategory: null, lastSearch: '' },
    orderedOfferingIds: [],
  };
}

export function readGuestSession(token: string): GuestSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(sessionKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestSessionSnapshot;
    if (!parsed || parsed.version !== 1 || parsed.qrToken !== token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeGuestSession(snap: GuestSessionSnapshot) {
  try {
    localStorage.setItem(
      sessionKey(snap.qrToken),
      JSON.stringify({ ...snap, lastSeenAt: Date.now() }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function patchGuestSession(
  token: string,
  patch: {
    sessionId?: string | null;
    currentStatus?: JourneyPhase;
    cart?: Partial<GuestSessionSnapshot['cart']>;
    preferences?: Partial<GuestSessionSnapshot['preferences']>;
    submittedOrder?: GuestSessionSnapshot['submittedOrder'];
    orderedOfferingIds?: string[];
  },
) {
  const prev = readGuestSession(token) || emptyGuestSession(token);
  const next: GuestSessionSnapshot = {
    ...prev,
    ...patch,
    version: 1,
    qrToken: token,
    cart: patch.cart
      ? { ...prev.cart, ...patch.cart, lastUpdated: Date.now() }
      : prev.cart,
    preferences: patch.preferences
      ? { ...prev.preferences, ...patch.preferences }
      : prev.preferences,
    lastSeenAt: Date.now(),
  };
  writeGuestSession(next);
  return next;
}
