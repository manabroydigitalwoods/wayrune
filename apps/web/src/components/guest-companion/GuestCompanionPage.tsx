import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  Clock,
  Flame,
  Leaf,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Utensils,
  WifiOff,
  X,
} from 'lucide-react';
import { toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../../api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  type CartLine,
  type ExperienceProduct,
  type JourneyPhase,
  type MenuCategory,
  type MenuCombo,
  type MenuSpecial,
  type ModifierGroup,
  type Offering,
  type ResolvePayload,
  cartQtyForOffering,
  dietShort,
  dishTone,
  hasRequiredModifiers,
  inr,
  isRestaurantLoc,
  isRoomLike,
  newIdempotencyKey,
  plainCartKey,
  readRecentOrders,
  writeRecentOrders,
} from './types';
import {
  patchGuestSession,
  readGuestSession,
} from './guestSession';

/** Guest-facing journey steps (maps kitchen statuses → hospitality labels). */
const TRACK_STEPS = [
  { key: 'received', label: 'Received', match: ['placed', 'accepted'] },
  { key: 'preparing', label: 'Preparing', match: ['preparing'] },
  { key: 'ready', label: 'Ready', match: ['ready', 'out_for_delivery'] },
  { key: 'delivered', label: 'Delivered', match: ['served', 'completed'] },
] as const;

function trackStepIndex(status: string | null): number {
  if (!status) return 0;
  const i = TRACK_STEPS.findIndex((s) =>
    (s.match as readonly string[]).includes(status),
  );
  return i >= 0 ? i : 0;
}

function kitchenQueueLabel(kitchen: ResolvePayload['kitchen']): string {
  if (!kitchen) return 'Quiet';
  if (kitchen.openTickets >= 8 || kitchen.busy) return 'Busy';
  if (kitchen.openTickets >= 3) return 'Moderate';
  return 'Light';
}

function OrderTimeline({
  statusIdx,
  variant = 'light',
  compact,
}: {
  statusIdx: number;
  variant?: 'light' | 'dark';
  compact?: boolean;
}) {
  const doneCls = variant === 'dark' ? 'text-[#faf6ef]' : 'text-[#2f6b3a]';
  const curCls = variant === 'dark' ? 'text-[#faf6ef] font-bold' : 'text-[#3d2a1f] font-bold';
  const idleCls = variant === 'dark' ? 'text-white/45' : 'text-[#8a7a6a]';
  return (
    <ol className={compact ? 'mt-2 space-y-1' : 'mt-3 space-y-1.5'}>
      {TRACK_STEPS.map((s, i) => {
        const done = i < statusIdx;
        const current = i === statusIdx;
        return (
          <li
            key={s.key}
            className={`flex items-center gap-2.5 text-sm ${
              done ? doneCls : current ? curCls : idleCls
            }`}
          >
            <span className="w-4 shrink-0 text-center text-base leading-none">
              {done ? '✓' : current ? '●' : '○'}
            </span>
            <span className={current ? 'underline decoration-[#c4a574] underline-offset-4' : ''}>
              {s.label}
            </span>
            {current && !compact ? (
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider opacity-70">
                Now
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function lovedByLine(o: Offering): string | null {
  if (o.ratingCount && o.ratingCount >= 3) {
    return `Loved by ${o.ratingCount >= 1000 ? `${(o.ratingCount / 1000).toFixed(1)}k` : o.ratingCount} guests`;
  }
  if ((o.ordersToday || 0) >= 2) {
    return `Ordered ${o.ordersToday}× today · guests keep coming back`;
  }
  return null;
}

const FILTERS = [
  { id: 'veg', label: 'Veg' },
  { id: 'nonveg', label: 'Non-veg' },
  { id: 'popular', label: 'Popular' },
  { id: 'fast', label: 'Under 15 min' },
] as const;

const FEEDBACK_TAGS = ['Great food', 'Fast service', 'Friendly staff', 'Good value', 'Ambience'];

type BillPayload = {
  outstanding: number;
  charges: number;
  currency: string;
  sessionId: string;
  itemsSubtotal?: number;
  taxTotal?: number;
  tipTotal?: number;
  discountTotal?: number;
  paid?: number;
  guestCount?: number;
  locationLabel?: string;
  lines?: Array<{
    id: string;
    description: string;
    category: string;
    amount: number;
    taxAmount: number;
  }>;
};

function Stars({ avg, count }: { avg?: number | null; count?: number }) {
  if (!avg || !count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8a6a3a]">
      <Star className="h-3 w-3 fill-[#c4a574] text-[#c4a574]" />
      {avg.toFixed(1)}
      <span className="font-normal text-[#8a7a6a]">
        {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count} reviews
      </span>
    </span>
  );
}

function isSpicy(o: Offering) {
  const hay = `${o.name} ${o.description || ''} ${(o.dietaryLabels || []).join(' ')}`.toLowerCase();
  return /spice|spicy|chilli|chili|laal|hot|mirchi/.test(hay);
}

function isVeg(o: Offering) {
  return (o.dietaryLabels || []).some((d) => /veg/i.test(d) && !/non/i.test(d));
}

function BadgePills({ o }: { o: Offering }) {
  const pills: Array<{ key: string; label: string; className: string }> = [];
  if (isVeg(o)) {
    pills.push({
      key: 'veg',
      label: 'Veg',
      className: 'border-emerald-700/30 bg-emerald-50 text-emerald-800',
    });
  } else if ((o.dietaryLabels || []).some((d) => /non/i.test(d))) {
    pills.push({
      key: 'nv',
      label: 'Non-veg',
      className: 'border-rose-700/30 bg-rose-50 text-rose-800',
    });
  }
  if (o.prepMinutes) {
    pills.push({
      key: 'eta',
      label: `${o.prepMinutes} min`,
      className: 'border-[#3d2a1f]/15 bg-[#faf6ef] text-[#5c4a3a]',
    });
  }
  if ((o.ordersToday || 0) > 0 || o.featured) {
    pills.push({
      key: 'pop',
      label: o.featured ? 'Bestseller' : 'Popular',
      className: 'border-amber-700/30 bg-amber-50 text-amber-900',
    });
  }
  if (isSpicy(o)) {
    pills.push({
      key: 'spice',
      label: 'Spicy',
      className: 'border-orange-700/30 bg-orange-50 text-orange-900',
    });
  }
  if (o.maxQuantity != null && o.maxQuantity <= 5) {
    pills.push({
      key: 'left',
      label: `Only ${o.maxQuantity} left`,
      className: 'border-red-700/30 bg-red-50 text-red-800',
    });
  }
  for (const d of o.dietaryLabels || []) {
    if (/for_kids|for_couples|for_family/i.test(d)) {
      pills.push({
        key: d,
        label: dietShort(d),
        className: 'border-sky-700/30 bg-sky-50 text-sky-900',
      });
    }
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {pills.map((p) => (
        <span
          key={p.key}
          className={`inline-flex items-center gap-0.5 border px-1.5 py-0.5 text-[10px] font-bold ${p.className}`}
        >
          {p.key === 'veg' ? <Leaf className="h-2.5 w-2.5" /> : null}
          {p.key === 'eta' ? <Clock className="h-2.5 w-2.5" /> : null}
          {p.key === 'pop' ? <Flame className="h-2.5 w-2.5" /> : null}
          {p.label}
        </span>
      ))}
    </div>
  );
}

export function GuestCompanionPage() {
  const { token } = useParams();
  const [data, setData] = useState<ResolvePayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [orderedItems, setOrderedItems] = useState<
    Array<{
      offeringId?: string | null;
      name: string;
      quantity?: number;
      lineTotal?: number;
      modifiers?: Array<{ name: string; priceDelta?: number }>;
    }>
  >([]);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [orderCurrency, setOrderCurrency] = useState('INR');
  const [placing, setPlacing] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartPulse, setCartPulse] = useState(false);
  const [addFlash, setAddFlash] = useState<string | null>(null);
  /** Enter animation only when the bar first appears — never on later adds. */
  const [cartEnterAnim, setCartEnterAnim] = useState(false);
  const cartWasVisible = useRef(false);
  const cartPulseTimers = useRef<number[]>([]);
  const [stayMode, setStayMode] = useState<'hub' | 'dining' | 'experiences'>('hub');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [detail, setDetail] = useState<Offering | null>(null);
  const [modifierPicks, setModifierPicks] = useState<Record<string, string[]>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [upsellFor, setUpsellFor] = useState<Offering | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [billStep, setBillStep] = useState<'review' | 'pay'>('review');
  const [bill, setBill] = useState<BillPayload | null>(null);
  const [tipPct, setTipPct] = useState<number | 'custom'>(0);
  const [tipCustom, setTipCustom] = useState('');
  const [paying, setPaying] = useState(false);
  const [thankYouOpen, setThankYouOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [nps, setNps] = useState(9);
  const [feedbackTags, setFeedbackTags] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [ratingStars, setRatingStars] = useState<Record<string, number>>({});
  const [experiences, setExperiences] = useState<ExperienceProduct[]>([]);
  const [bookSlot, setBookSlot] = useState<{
    product: ExperienceProduct;
    slotId: string;
  } | null>(null);
  const [bookName, setBookName] = useState('');
  const [bookPhone, setBookPhone] = useState('');
  const [bookPax, setBookPax] = useState(2);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestTitle, setRequestTitle] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [orderedOfferingIds, setOrderedOfferingIds] = useState<string[]>([]);
  const [pendingUndo, setPendingUndo] = useState<CartLine | null>(null);
  const [orderShortNo, setOrderShortNo] = useState<string | null>(null);
  const [orderUpdatedAt, setOrderUpdatedAt] = useState<number | null>(null);
  const [postOrderOpen, setPostOrderOpen] = useState(false);
  const [helpNudge, setHelpNudge] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  useDocumentTitle(
    data ? `${data.businessName} · ${data.location.label}` : 'Order',
  );

  useEffect(() => {
    if (token) setRecentIds(readRecentOrders(token));
  }, [token]);

  /** Restore Guest Session (cart / submitted order) from local storage. */
  useEffect(() => {
    if (!token) return;
    const snap = readGuestSession(token);
    if (snap) {
      if (snap.cart.items.length) setCart(snap.cart.items);
      if (snap.cart.notes) setNote(snap.cart.notes);
      if (snap.preferences.filters.length) setFilters(snap.preferences.filters);
      if (snap.preferences.lastCategory) setActiveCat(snap.preferences.lastCategory);
      if (snap.preferences.lastSearch) setSearch(snap.preferences.lastSearch);
      if (snap.orderedOfferingIds.length) setOrderedOfferingIds(snap.orderedOfferingIds);
      if (snap.submittedOrder?.id) {
        setOrderId(snap.submittedOrder.id);
        setOrderStatus(snap.submittedOrder.status);
        setOrderShortNo(snap.submittedOrder.shortNo);
        setOrderUpdatedAt(snap.submittedOrder.updatedAt);
        setOrderedItems(snap.submittedOrder.items || []);
      }
    }
    setSessionHydrated(true);
  }, [token]);

  /** Soft Help nudge after a few quiet minutes. */
  useEffect(() => {
    if (orderId || cartOpen || checkoutOpen) return;
    const t = window.setTimeout(() => setHelpNudge(true), 150_000);
    return () => window.clearTimeout(t);
  }, [orderId, cartOpen, checkoutOpen]);

  useEffect(() => {
    if (helpOpen) setHelpNudge(false);
  }, [helpOpen]);

  /** Cart owns the screen — close Help when cart expands. */
  useEffect(() => {
    if (cartOpen) setHelpOpen(false);
  }, [cartOpen]);

  /** Checkout / thank-you hide Help entirely. */
  useEffect(() => {
    if (checkoutOpen || thankYouOpen || postOrderOpen) setHelpOpen(false);
  }, [checkoutOpen, thankYouOpen, postOrderOpen]);

  useEffect(() => {
    if (!pendingUndo) return;
    const t = window.setTimeout(() => setPendingUndo(null), 4500);
    return () => window.clearTimeout(t);
  }, [pendingUndo]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await api<ResolvePayload>(
        `/public/guest/${encodeURIComponent(token)}`,
        { skipAuthRefresh: true },
      );
      setData(res);
      if (isRestaurantLoc(res.location.locationType)) setStayMode('dining');
      else if (isRoomLike(res.location.locationType)) setStayMode('hub');
      const snap = readGuestSession(token);
      const firstCat =
        snap?.preferences.lastCategory || res.menuCategories?.[0]?.key;
      if (firstCat) setActiveCat(firstCat);
      if (res.tableSession?.id) {
        patchGuestSession(token, { sessionId: res.tableSession.id });
      }
    } catch (e) {
      /* Offline / flake: keep prior catalogue + local Guest Session cart */
      setData((prev) => {
        if (prev) {
          toastError('Connection lost — your cart is saved on this device');
          return prev;
        }
        setError(e instanceof Error ? e.message : 'Link unavailable');
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const on = () => {
      setOffline(false);
      void load();
    };
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [load]);

  /** Persist Guest Session continuously. */
  useEffect(() => {
    if (!token || !sessionHydrated) return;
    patchGuestSession(token, {
      currentStatus: orderId
        ? 'service'
        : cart.length
          ? 'order'
          : 'discover',
      cart: { items: cart, notes: note },
      preferences: {
        filters,
        lastCategory: activeCat,
        lastSearch: search,
      },
      orderedOfferingIds,
      submittedOrder: orderId
        ? {
            id: orderId,
            shortNo: orderShortNo,
            status: orderStatus,
            items: orderedItems,
            updatedAt: orderUpdatedAt,
          }
        : null,
    });
  }, [
    token,
    sessionHydrated,
    cart,
    note,
    filters,
    activeCat,
    search,
    orderedOfferingIds,
    orderId,
    orderShortNo,
    orderStatus,
    orderedItems,
    orderUpdatedAt,
  ]);

  useEffect(() => {
    if (!token || !orderId) return;
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const s = await api<{
            status: string;
            total?: number;
            currency?: string;
            items: Array<{
              name: string;
              offeringId?: string | null;
              quantity?: number;
              lineTotal?: number;
              modifiers?: Array<{ name: string; priceDelta?: number }>;
            }>;
          }>(`/public/guest/${encodeURIComponent(token)}/orders/${orderId}`, {
            skipAuthRefresh: true,
          });
          setOrderStatus(s.status);
          setOrderedItems(s.items || []);
          if (typeof s.total === 'number') setOrderTotal(s.total);
          if (s.currency) setOrderCurrency(s.currency);
          setOrderUpdatedAt(Date.now());
          const ids = (s.items || [])
            .map((x) => x.offeringId)
            .filter(Boolean) as string[];
          if (ids.length) {
            setOrderedOfferingIds((prev) => [...new Set([...prev, ...ids])]);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 8000);
    return () => window.clearInterval(t);
  }, [token, orderId]);

  const phase: JourneyPhase = useMemo(() => {
    const sess = data?.tableSession?.status;
    if (sess === 'bill_requested' || sess === 'billed' || sess === 'paid' || thankYouOpen) {
      return 'finish';
    }
    if (orderId && orderStatus && !['completed', 'cancelled', 'rejected'].includes(orderStatus)) {
      return 'service';
    }
    if (cart.length > 0) return 'order';
    return 'discover';
  }, [data?.tableSession?.status, orderId, orderStatus, cart.length, thankYouOpen]);

  const sectionLabel = useCallback(
    (key: string) => {
      const c = (data?.menuCategories || []).find((x) => x.key === key);
      if (!c) return key.replace(/_/g, ' ');
      return c.emoji ? `${c.emoji} ${c.label}` : c.label;
    },
    [data?.menuCategories],
  );

  const searchSuggestions = useMemo(() => {
    return (data?.suggestedSearchTokens || ['Paneer', 'Tea', 'Sweet', 'Spicy', 'Veg']).slice(0, 8);
  }, [data?.suggestedSearchTokens]);

  const typeahead = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [] as Offering[];
    return (data?.offerings || [])
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.description || '').toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [search, data?.offerings]);

  const filteredOfferings = useMemo(() => {
    let list = data?.offerings || [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.description || '').toLowerCase().includes(q) ||
          o.category.toLowerCase().includes(q),
      );
    }
    for (const f of filters) {
      if (f === 'veg') list = list.filter(isVeg);
      if (f === 'nonveg') {
        list = list.filter((o) =>
          (o.dietaryLabels || []).some((d) => /non/i.test(d)),
        );
      }
      if (f === 'popular') {
        list = list.filter((o) => (o.ordersToday || 0) > 0 || o.featured);
      }
      if (f === 'fast') list = list.filter((o) => (o.prepMinutes || 99) <= 15);
    }
    return list;
  }, [data?.offerings, search, filters]);

  const grouped = useMemo(() => {
    const map = new Map<string, Offering[]>();
    for (const o of filteredOfferings) {
      const list = map.get(o.category) || [];
      list.push(o);
      map.set(o.category, list);
    }
    const ordered: Array<[string, Offering[]]> = [];
    const seen = new Set<string>();
    for (const c of data?.menuCategories || []) {
      const items = map.get(c.key);
      if (!items?.length) continue;
      ordered.push([c.key, items]);
      seen.add(c.key);
    }
    for (const [key, items] of map) {
      if (!seen.has(key)) ordered.push([key, items]);
    }
    return ordered;
  }, [filteredOfferings, data?.menuCategories]);

  const chefPicks = useMemo(() => {
    const ids = new Set(data?.featuredOfferingIds || []);
    const fromFeatured = (data?.offerings || []).filter(
      (o) => ids.has(o.id) || o.featured,
    );
    if (fromFeatured.length) return fromFeatured.slice(0, 4);
    return (data?.popularToday || []).slice(0, 3);
  }, [data]);

  const todaysPick = useMemo(() => {
    const fromSpecial = (data?.specials || []).find((s) => s.offering)?.offering;
    return fromSpecial || chefPicks[0] || data?.popularToday?.[0] || null;
  }, [data, chefPicks]);

  const recommendedFor = useMemo(() => {
    return (data?.offerings || []).filter((o) =>
      (o.dietaryLabels || []).some((d) => /for_kids|for_couples|for_family/i.test(d)),
    ).slice(0, 6);
  }, [data?.offerings]);

  const recentOfferings = useMemo(() => {
    return recentIds
      .map((id) => data?.offerings.find((o) => o.id === id))
      .filter(Boolean) as Offering[];
  }, [recentIds, data?.offerings]);

  const total = cart.reduce(
    (s, l) => s + (l.unitPrice + l.modifierDelta) * l.quantity,
    0,
  );
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartVisible = itemCount > 0 || cartOpen;

  useEffect(() => {
    if (cartVisible && !cartWasVisible.current) {
      setCartEnterAnim(true);
      const t = window.setTimeout(() => setCartEnterAnim(false), 300);
      cartWasVisible.current = true;
      return () => window.clearTimeout(t);
    }
    if (!cartVisible) {
      cartWasVisible.current = false;
      setCartEnterAnim(false);
    }
  }, [cartVisible]);

  const cartEta = useMemo(() => {
    if (!cart.length) return data?.kitchen?.estimatedWaitMinutes ?? 18;
    const maxPrep = Math.max(
      ...cart.map((l) => {
        const o = data?.offerings.find((x) => x.id === l.offeringId);
        return o?.prepMinutes || data?.kitchen?.avgPrepMinutes || 15;
      }),
      0,
    );
    return data?.kitchen?.busy
      ? Math.round(maxPrep * 1.4)
      : maxPrep || data?.kitchen?.estimatedWaitMinutes || 18;
  }, [cart, data]);

  const alreadyOrderedSet = useMemo(() => {
    const fromPoll = orderedItems
      .map((x) => x.offeringId)
      .filter(Boolean) as string[];
    return new Set([...orderedOfferingIds, ...fromPoll]);
  }, [orderedOfferingIds, orderedItems]);

  const activeCombo = useMemo(() => {
    const combos = data?.combos || [];
    const inCart = new Set(cart.map((c) => c.offeringId));
    for (const combo of combos) {
      const have = combo.offeringIds.filter((id) => inCart.has(id)).length;
      if (have >= 2 && have < combo.offeringIds.length) return combo;
      if (have === combo.offeringIds.length) return null;
    }
    // suggest if any 2+ of a combo in cart incompletely
    for (const combo of combos) {
      const have = combo.offeringIds.filter((id) => inCart.has(id)).length;
      if (have >= 1 && have < combo.offeringIds.length) return combo;
    }
    return null as MenuCombo | null;
  }, [data?.combos, cart]);

  function pulseCart(name: string) {
    for (const t of cartPulseTimers.current) window.clearTimeout(t);
    cartPulseTimers.current = [];
    setAddFlash(name);
    setCartPulse(true);
    cartPulseTimers.current.push(
      window.setTimeout(() => setCartPulse(false), 450),
      window.setTimeout(() => setAddFlash(null), 1600),
    );
  }

  function defaultRequiredPicks(o: Offering): Record<string, string[]> {
    const picks: Record<string, string[]> = {};
    for (const g of o.modifiers || []) {
      const need = g.minSelect || 0;
      if (need <= 0) continue;
      picks[g.id] = g.options.slice(0, need).map((opt) => opt.id);
    }
    return picks;
  }

  function missingRequiredGroup(
    o: Offering,
    mods: CartLine['modifiers'],
  ): ModifierGroup | null {
    for (const g of o.modifiers || []) {
      const need = g.minSelect || 0;
      if (need <= 0) continue;
      const n = mods.filter((m) => m.groupId === g.id).length;
      if (n < need) return g;
    }
    return null;
  }

  function openCustomize(o: Offering) {
    setDetail(o);
    setModifierPicks(defaultRequiredPicks(o));
  }

  function addToCart(
    o: Offering,
    picks?: Record<string, string[]>,
    opts?: { skipUpsell?: boolean; quantity?: number },
  ) {
    /** One-tap paths (upsell / order-again) get sensible defaults for required Size etc. */
    const merged: Record<string, string[]> = {
      ...defaultRequiredPicks(o),
      ...(picks || {}),
    };
    const mods: CartLine['modifiers'] = [];
    let delta = 0;
    for (const g of o.modifiers || []) {
      for (const optId of merged[g.id] || []) {
        const opt = g.options.find((x) => x.id === optId);
        if (!opt) continue;
        mods.push({
          groupId: g.id,
          optionId: opt.id,
          name: opt.name,
          priceDelta: opt.priceDelta,
        });
        delta += opt.priceDelta;
      }
    }
    const missing = missingRequiredGroup(o, mods);
    if (missing) {
      openCustomize(o);
      toastError(`Choose ${missing.name} for ${o.name}`);
      return;
    }
    const qty = Math.max(1, opts?.quantity || 1);
    const key =
      mods.length > 0
        ? `${o.id}:${mods.map((m) => m.optionId).sort().join(',')}`
        : plainCartKey(o.id);
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + qty } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          offeringId: o.id,
          quantity: qty,
          name: o.name,
          unitPrice: o.unitPrice,
          modifierDelta: delta,
          modifiers: mods,
        },
      ];
    });
    pulseCart(o.name);
    toastSuccess(`✓ ${o.name} added`);
    setDetail(null);
    setUpsellFor(null);
    if (!opts?.skipUpsell) {
      setUpsellFor(o);
    }
  }

  function restoreUndo() {
    if (!pendingUndo) return;
    setCart((prev) => {
      if (prev.some((l) => l.key === pendingUndo.key)) {
        return prev.map((l) =>
          l.key === pendingUndo.key ? pendingUndo : l,
        );
      }
      return [...prev, pendingUndo];
    });
    setPendingUndo(null);
  }

  function setQty(offeringId: string, next: number) {
    const key = plainCartKey(offeringId);
    const anyLine = cart.find((l) => l.offeringId === offeringId);
    if (!anyLine && next > 0) {
      const o = data?.offerings.find((x) => x.id === offeringId);
      if (!o) return;
      /** Never create a bare line that would fail Size / Heat later. */
      addToCart(o, undefined, { skipUpsell: true, quantity: next });
      return;
    }
    setCart((prev) => {
      const line = prev.find((l) => l.key === key) || prev.find((l) => l.offeringId === offeringId);
      if (!line) return prev;
      if (next <= 0) {
        setPendingUndo(line);
        return prev.filter((l) => l.key !== line.key);
      }
      setPendingUndo(null);
      return prev.map((l) => (l.key === line.key ? { ...l, quantity: next } : l));
    });
  }

  function adjustCartLine(key: string, delta: number) {
    setCart((prev) => {
      const line = prev.find((l) => l.key === key);
      if (!line) return prev;
      const next = line.quantity + delta;
      if (next <= 0) {
        setPendingUndo(line);
        return prev.filter((l) => l.key !== key);
      }
      setPendingUndo(null);
      return prev.map((l) => (l.key === key ? { ...l, quantity: next } : l));
    });
  }

  function quickAdd(o: Offering) {
    if (hasRequiredModifiers(o)) openCustomize(o);
    else addToCart(o);
  }

  function upsellSuggestions(o: Offering): Offering[] {
    const pairs = data?.upsellPairs?.[o.id] || [];
    const byPair = pairs
      .map((id) => data?.offerings.find((x) => x.id === id))
      .filter(Boolean) as Offering[];
    if (byPair.length) return byPair.slice(0, 3);
    const kindPref =
      o.kind === 'food' || o.category === 'mains' || o.category === 'starters'
        ? (x: Offering) => x.kind === 'beverage' || /dessert|beverage/i.test(x.category)
        : (x: Offering) => x.id !== o.id;
    return (data?.offerings || [])
      .filter((x) => x.id !== o.id && kindPref(x))
      .slice(0, 3);
  }

  /** Repair cart lines missing required Size/Heat (from older upsell / sessions). */
  function repairCartModifiers() {
    setCart((prev) =>
      prev.map((line) => {
        const o = data?.offerings.find((x) => x.id === line.offeringId);
        if (!o || !missingRequiredGroup(o, line.modifiers)) return line;
        const picks = defaultRequiredPicks(o);
        const mods: CartLine['modifiers'] = [];
        let delta = 0;
        for (const g of o.modifiers || []) {
          for (const optId of picks[g.id] || []) {
            const opt = g.options.find((x) => x.id === optId);
            if (!opt) continue;
            mods.push({
              groupId: g.id,
              optionId: opt.id,
              name: opt.name,
              priceDelta: opt.priceDelta,
            });
            delta += opt.priceDelta;
          }
        }
        if (missingRequiredGroup(o, mods)) return line;
        return {
          ...line,
          key: `${o.id}:${mods.map((m) => m.optionId).sort().join(',')}`,
          modifiers: mods,
          modifierDelta: delta,
        };
      }),
    );
  }

  async function placeOrder() {
    if (!token || !cart.length) return;
    if (data?.stayContext?.requiresPin && pin.length < 4) {
      toastError('Enter your room PIN');
      return;
    }
    /** Repair lines missing Size/Heat (e.g. older upsell taps) before POST. */
    const linesForApi = cart.map((l) => {
      const o = data?.offerings.find((x) => x.id === l.offeringId);
      if (!o || !missingRequiredGroup(o, l.modifiers)) {
        return {
          offeringId: l.offeringId,
          quantity: l.quantity,
          modifiers: l.modifiers,
        };
      }
      const picks = defaultRequiredPicks(o);
      const mods: CartLine['modifiers'] = [];
      for (const g of o.modifiers || []) {
        for (const optId of picks[g.id] || []) {
          const opt = g.options.find((x) => x.id === optId);
          if (!opt) continue;
          mods.push({
            groupId: g.id,
            optionId: opt.id,
            name: opt.name,
            priceDelta: opt.priceDelta,
          });
        }
      }
      return {
        offeringId: l.offeringId,
        quantity: l.quantity,
        modifiers: mods,
      };
    });
    for (const line of linesForApi) {
      const o = data?.offerings.find((x) => x.id === line.offeringId);
      if (!o) continue;
      const group = missingRequiredGroup(o, line.modifiers);
      if (group) {
        setCartOpen(false);
        openCustomize(o);
        toastError(`Choose ${group.name} for ${o.name}`);
        return;
      }
    }
    repairCartModifiers();
    setPlacing(true);
    try {
      const res = await api<{
        id: string;
        status: string;
        total?: number | string;
        currency?: string;
      }>(
        `/public/guest/${encodeURIComponent(token)}/orders`,
        {
          method: 'POST',
          skipAuthRefresh: true,
          body: JSON.stringify({
            items: linesForApi,
            customerNote: note.trim() || null,
            idempotencyKey: newIdempotencyKey(),
            roomPin: pin || null,
          }),
        },
      );
      const ids = cart.map((c) => c.offeringId);
      writeRecentOrders(token, [...ids, ...recentIds]);
      setRecentIds(readRecentOrders(token));
      setOrderedOfferingIds((prev) => [...new Set([...ids, ...prev])]);
      const placedTotal =
        typeof res.total === 'number'
          ? res.total
          : Number(res.total) ||
            cart.reduce((s, c) => s + (c.unitPrice + c.modifierDelta) * c.quantity, 0);
      setOrderedItems(
        cart.map((c) => ({
          offeringId: c.offeringId,
          name: c.name,
          quantity: c.quantity,
          lineTotal: (c.unitPrice + c.modifierDelta) * c.quantity,
          modifiers: c.modifiers.map((m) => ({
            name: m.name,
            priceDelta: m.priceDelta,
          })),
        })),
      );
      setOrderTotal(placedTotal);
      if (res.currency) setOrderCurrency(res.currency);
      setOrderId(res.id);
      setOrderStatus(res.status);
      setOrderShortNo(res.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase());
      setOrderUpdatedAt(Date.now());
      setCart([]);
      setCartOpen(false);
      setNote('');
      setUpsellFor(null);
      setPendingUndo(null);
      setPostOrderOpen(true);
      window.setTimeout(() => {
        document.getElementById('gs-track')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not place order');
    } finally {
      setPlacing(false);
    }
  }

  async function sendHelpRequest(title: string) {
    if (!token) return;
    try {
      await api(`/public/guest/${encodeURIComponent(token)}/requests`, {
        method: 'POST',
        skipAuthRefresh: true,
        body: JSON.stringify({
          category: 'front_desk',
          title,
          roomPin: pin || null,
        }),
      });
      toastSuccess('Staff notified');
      setHelpOpen(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not reach staff');
    }
  }

  async function requestBill() {
    if (!token) return;
    setHelpOpen(false);
    try {
      await api(`/public/guest/${encodeURIComponent(token)}/request-bill`, {
        method: 'POST',
        skipAuthRefresh: true,
      });
      toastSuccess('Bill requested');
      const b = await api<BillPayload>(
        `/public/guest/${encodeURIComponent(token)}/bill`,
        { skipAuthRefresh: true },
      );
      setBill(b);
      setBillStep('review');
      setCheckoutOpen(true);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not request bill');
    }
  }

  const tipAmount = useMemo(() => {
    if (!bill) return 0;
    if (tipPct === 'custom') return Math.max(0, Number(tipCustom) || 0);
    return Math.round((bill.outstanding * tipPct) / 100);
  }, [bill, tipPct, tipCustom]);

  async function payNow() {
    if (!token || !bill) return;
    setPaying(true);
    try {
      const intent = await api<{ mode: string; sessionId: string }>(
        `/public/guest/${encodeURIComponent(token)}/pay-intent`,
        {
          method: 'POST',
          skipAuthRefresh: true,
          body: JSON.stringify({ tipAmount }),
        },
      );
      await api(`/public/guest/sessions/${intent.sessionId}/pay-confirm`, {
        method: 'POST',
        skipAuthRefresh: true,
        body: JSON.stringify({ mock: intent.mode === 'mock', tipAmount }),
      });
      setCheckoutOpen(false);
      setThankYouOpen(true);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  async function submitFeedback() {
    if (!token) return;
    try {
      await api(`/public/guest/${encodeURIComponent(token)}/feedback`, {
        method: 'POST',
        skipAuthRefresh: true,
        body: JSON.stringify({
          nps,
          stars: Math.max(1, Math.min(5, Math.round(nps / 2) || 1)),
          tags: feedbackTags,
          comment: feedbackComment || null,
        }),
      });
      for (const [offeringId, stars] of Object.entries(ratingStars)) {
        if (!orderId || !stars) continue;
        try {
          await api(`/public/guest/${encodeURIComponent(token)}/ratings`, {
            method: 'POST',
            skipAuthRefresh: true,
            body: JSON.stringify({ offeringId, serviceOrderId: orderId, stars }),
          });
        } catch {
          /* already rated */
        }
      }
      toastSuccess('Thanks for the feedback');
      setFeedbackOpen(false);
      setThankYouOpen(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send feedback');
    }
  }

  async function loadExperiences() {
    if (!token) return;
    try {
      const list = await api<ExperienceProduct[]>(
        `/public/guest/${encodeURIComponent(token)}/experiences`,
        { skipAuthRefresh: true },
      );
      setExperiences(list);
      setStayMode('experiences');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Activities unavailable');
    }
  }

  async function bookExperience() {
    if (!token || !bookSlot || !bookName.trim()) {
      toastError('Name required');
      return;
    }
    try {
      await api(`/public/guest/${encodeURIComponent(token)}/experiences/book`, {
        method: 'POST',
        skipAuthRefresh: true,
        body: JSON.stringify({
          experienceSlotId: bookSlot.slotId,
          bookerName: bookName.trim(),
          bookerPhone: bookPhone || null,
          guestCount: bookPax,
          waiverAck: true,
        }),
      });
      toastSuccess('Activity booked');
      setBookSlot(null);
      await loadExperiences();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Booking failed');
    }
  }

  async function submitHostRequest(category: string, title: string) {
    if (!token) return;
    try {
      await api(`/public/guest/${encodeURIComponent(token)}/requests`, {
        method: 'POST',
        skipAuthRefresh: true,
        body: JSON.stringify({
          category,
          title,
          notes: requestNotes || null,
          roomPin: pin || null,
        }),
      });
      toastSuccess('Request sent');
      setRequestOpen(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Request failed');
    }
  }

  function applyCombo(combo: MenuCombo) {
    for (const id of combo.offeringIds) {
      const o = data?.offerings.find((x) => x.id === id);
      if (!o) continue;
      if (cartQtyForOffering(cart, id) === 0) {
        if (hasRequiredModifiers(o)) openCustomize(o);
        else addToCart(o, undefined, { skipUpsell: true });
      }
    }
    toastSuccess(`Combo: ${combo.name}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f0e6] px-4 py-16 text-center text-sm text-[#5c4a3a]">
        Opening your guest companion…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f6f0e6] px-4 py-16 text-center">
        <p className="text-lg font-semibold text-[#3d2a1f]">Link unavailable</p>
        <p className="mt-2 text-sm text-[#5c4a3a]">{error}</p>
      </div>
    );
  }

  const restaurant = isRestaurantLoc(data.location.locationType);
  const stay = isRoomLike(data.location.locationType);
  const farmstay = data.location.locationType === 'FARMSTAY_UNIT';
  const showDining = restaurant || stayMode === 'dining';
  const statusIdx = trackStepIndex(orderStatus);
  const serviceEta =
    data.kitchen?.estimatedWaitMinutes ||
    Math.max(
      ...(orderedItems || []).map((it) => {
        const o = data.offerings.find((x) => x.id === it.offeringId);
        return o?.prepMinutes || data.kitchen?.avgPrepMinutes || 15;
      }),
      data.kitchen?.avgPrepMinutes || 15,
    );
  const fabBottom = cartVisible ? 'bottom-[4.75rem]' : 'bottom-5';
  const pagePad = cartVisible ? 'pb-32' : 'pb-24';
  const hideHelpFab =
    checkoutOpen || thankYouOpen || postOrderOpen || cartOpen || feedbackOpen;

  const helpItems =
    phase === 'service' || phase === 'finish'
      ? [
          {
            label: 'Track order',
            action: () => {
              setHelpOpen(false);
              document.getElementById('gs-track')?.scrollIntoView({ behavior: 'smooth' });
            },
          },
          { label: '💧 Water', action: () => void sendHelpRequest('Water') },
          { label: '🧻 Napkins', action: () => void sendHelpRequest('Napkins') },
          { label: '🍴 Extra Cutlery', action: () => void sendHelpRequest('Extra Cutlery') },
          { label: '🛎️ Call waiter', action: () => void sendHelpRequest('Call waiter') },
          {
            label: 'Order more',
            action: () => {
              setHelpOpen(false);
              setPostOrderOpen(false);
              setStayMode('dining');
              window.scrollTo({ top: 280, behavior: 'smooth' });
            },
          },
          { label: 'Request bill', action: () => void requestBill() },
        ]
      : [
          { label: '🛎️ Call waiter', action: () => void sendHelpRequest('Call waiter') },
          { label: '💧 Water', action: () => void sendHelpRequest('Water') },
          { label: '🧻 Napkins', action: () => void sendHelpRequest('Napkins') },
          { label: '🍴 Extra Cutlery', action: () => void sendHelpRequest('Extra Cutlery') },
          {
            label: 'Birthday surprise',
            action: () => void sendHelpRequest('Birthday surprise'),
          },
          { label: 'Talk to Staff', action: () => void sendHelpRequest('Talk to Staff') },
          ...(data.companion?.canRequestBill
            ? [{ label: 'Request bill', action: () => void requestBill() }]
            : []),
        ];

  return (
    <div className={`min-h-screen bg-[#f6f0e6] text-[#1c1410] ${pagePad}`}>
      <style>{`
        .gs-display { font-family: "Fraunces", "Iowan Old Style", Georgia, serif; }
        .gs-hide-scroll::-webkit-scrollbar { display: none; }
        @keyframes gs-cart-in {
          from { transform: translate3d(0, 100%, 0); }
          to { transform: translate3d(0, 0, 0); }
        }
        .gs-cart-enter { animation: gs-cart-in 0.28s ease-out both; }
        @keyframes gs-pop {
          0% { transform: scale(1); }
          40% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        .gs-pulse { animation: gs-pop 0.45s ease; transform-origin: center bottom; }
        @keyframes gs-help-soft {
          0%, 100% { transform: scale(1); box-shadow: 0 8px 24px rgba(28,20,16,0.28); }
          50% { transform: scale(1.05); box-shadow: 0 10px 28px rgba(28,20,16,0.4); }
        }
        .gs-help-nudge { animation: gs-help-soft 2.4s ease-in-out infinite; }
      `}</style>

      {offline ? (
        <div className="sticky top-0 z-50 flex items-center gap-2 bg-[#3d2a1f] px-4 py-2 text-xs text-[#faf6ef]">
          <WifiOff className="h-3.5 w-3.5" />
          Trying to reconnect… Don’t close this page.
        </div>
      ) : null}

      <header className="px-4 pb-2 pt-5">
        <p className="gs-display text-[1.65rem] font-semibold leading-tight text-[#3d2a1f]">
          {data.businessName}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-[#5c4a3a]">
          <span className="font-semibold text-[#3d2a1f]">{data.location.label}</span>
          {!stay && data.tableSession?.guestCount ? (
            <span>· {data.tableSession.guestCount} guests</span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stars avg={data.venueRating?.ratingAvg} count={data.venueRating?.ratingCount} />
        </div>
        {data.kitchen ? (
          <div className="mt-2 border border-[#3d2a1f]/10 bg-[#faf6ef] px-3 py-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-[#2f6b3a]">
                {data.acceptingOrders ? 'Kitchen open' : 'Kitchen paused'}
              </span>
              <span className="font-semibold text-[#5c4a3a]">
                Queue: {kitchenQueueLabel(data.kitchen)}
              </span>
            </div>
            <p className="mt-0.5 text-[#5c4a3a]">
              Average:{' '}
              <span className="font-semibold text-[#3d2a1f]">
                {Math.max(10, (data.kitchen.avgPrepMinutes || 15) - 2)}–
                {(data.kitchen.estimatedWaitMinutes || data.kitchen.avgPrepMinutes || 18) + 2}{' '}
                min
              </span>
            </p>
          </div>
        ) : null}
        {phase !== 'discover' ? (
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7a6a]">
            {phase === 'order'
              ? 'Building your order'
              : phase === 'service'
                ? 'During your meal'
                : 'Wrapping up'}
          </p>
        ) : null}
      </header>

      {/* During meal + Current Order — always visible after place */}
      {orderId ? (
        <section
          id="gs-track"
          className={`mx-4 mb-3 border px-3 py-3.5 ${
            phase === 'service' || phase === 'finish'
              ? 'border-[#3d2a1f] bg-[#3d2a1f] text-[#faf6ef]'
              : 'border-[#3d2a1f]/10 bg-[#faf6ef]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg leading-none">🍽</p>
              <p className="mt-1 text-sm font-bold">
                Order{orderShortNo ? ` #${orderShortNo}` : ''}
              </p>
              <p className="mt-0.5 text-[11px] opacity-80">
                Estimated ~{serviceEta} min
                {orderUpdatedAt
                  ? ` · Updated ${
                      Date.now() - orderUpdatedAt < 15000
                        ? 'just now'
                        : `${Math.max(1, Math.round((Date.now() - orderUpdatedAt) / 60000))}m ago`
                    }`
                  : ' · Just now'}
              </p>
            </div>
            <button
              type="button"
              className={`shrink-0 text-xs font-bold underline ${
                phase === 'service' || phase === 'finish' ? 'text-[#faf6ef]' : ''
              }`}
              onClick={() => {
                setPostOrderOpen(false);
                window.scrollTo({ top: 320, behavior: 'smooth' });
              }}
            >
              Order more
            </button>
          </div>

          {/* My Current Order — no sheet required */}
          <div
            className={`mt-3 border px-2.5 py-2 text-xs ${
              phase === 'service' || phase === 'finish'
                ? 'border-white/20 bg-white/10'
                : 'border-[#3d2a1f]/10 bg-white/60'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
              Current order
            </p>
            <ul className="mt-1 space-y-0.5">
              {orderedItems.map((it, idx) => {
                const qty = Math.max(1, it.quantity || 1);
                const mods = it.modifiers || [];
                return (
                  <li
                    key={`${it.offeringId || it.name}-${idx}`}
                    className="font-semibold"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="truncate">
                        {qty}× {it.name}
                      </span>
                      {it.lineTotal != null ? (
                        <span className="shrink-0 tabular-nums opacity-90">
                          {inr(it.lineTotal)}
                        </span>
                      ) : null}
                    </div>
                    {mods.length ? (
                      <p className="truncate text-[11px] font-normal opacity-70">
                        {mods.map((m) => m.name).join(', ')}
                      </p>
                    ) : null}
                  </li>
                );
              })}
              {!orderedItems.length ? (
                <li className="opacity-70">We’ll list items as the kitchen confirms…</li>
              ) : null}
            </ul>
            <div className="mt-1.5 flex items-center justify-between font-bold">
              <span>{TRACK_STEPS[statusIdx]?.label || 'Preparing'}</span>
              <span>
                {inr(
                  orderTotal != null
                    ? orderTotal
                    : orderedItems.reduce((s, it) => {
                        if (it.lineTotal != null) return s + it.lineTotal;
                        const o = data.offerings.find((x) => x.id === it.offeringId);
                        const qty = Math.max(1, it.quantity || 1);
                        const modSum = (it.modifiers || []).reduce(
                          (m, x) => m + (x.priceDelta || 0),
                          0,
                        );
                        return s + ((o?.unitPrice || 0) + modSum) * qty;
                      }, 0),
                )}
              </span>
            </div>
          </div>

          <OrderTimeline
            statusIdx={statusIdx}
            variant={phase === 'service' || phase === 'finish' ? 'dark' : 'light'}
          />

          {(phase === 'service' || phase === 'finish') && (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {[
                { label: '💧 Water', title: 'Water' },
                { label: '🍴 Cutlery', title: 'Extra Cutlery' },
                { label: '🛎️ Waiter', title: 'Call waiter' },
              ].map((a) => (
                <button
                  key={a.title}
                  type="button"
                  onClick={() => void sendHelpRequest(a.title)}
                  className="min-h-11 border border-white/25 bg-white/10 text-[11px] font-bold"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {data.stayContext?.requiresPin ? (
        <div className="mx-4 mb-3 border border-[#3d2a1f]/10 bg-[#faf6ef] px-3 py-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8a7a6a]">
            Room PIN
          </label>
          <input
            className="mt-1 w-full border border-[#3d2a1f]/20 bg-white px-3 py-2 text-lg tracking-widest"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
      ) : null}

      {stay && stayMode === 'hub' ? (
        <section className="px-4 py-4">
          <h2 className="gs-display text-xl font-semibold">
            {farmstay ? "What's on today?" : 'What do you need?'}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: 'Food', action: () => setStayMode('dining') },
              ...(farmstay
                ? [{ label: 'Activities', action: () => void loadExperiences() }]
                : []),
              ...(data.location.locationType === 'HOTEL_ROOM'
                ? [
                    {
                      label: 'Housekeeping',
                      action: () => {
                        setRequestTitle('Housekeeping');
                        setRequestOpen(true);
                      },
                    },
                    {
                      label: 'Reception',
                      action: () => {
                        setRequestTitle('Front desk');
                        setRequestOpen(true);
                      },
                    },
                  ]
                : [
                    {
                      label: 'Talk to host',
                      action: () => {
                        setRequestTitle('Talk to host');
                        setRequestOpen(true);
                      },
                    },
                  ]),
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.action}
                className="border border-[#3d2a1f]/15 bg-[#faf6ef] px-3 py-5 text-left text-sm font-semibold"
              >
                {a.label}
                <ChevronRight className="mt-2 h-4 w-4 text-[#8a7a6a]" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {stayMode === 'experiences' ? (
        <section className="px-4 py-4">
          <button type="button" className="text-sm font-semibold underline" onClick={() => setStayMode('hub')}>
            ← Back
          </button>
          <h2 className="gs-display mt-3 text-xl font-semibold">Today&apos;s activities</h2>
          <ul className="mt-4 space-y-3">
            {experiences.map((p) => (
              <li key={p.id} className="border border-[#3d2a1f]/10 bg-[#faf6ef] p-3">
                <p className="font-semibold">{p.title}</p>
                {p.slots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="mt-2 flex w-full justify-between border border-[#3d2a1f]/15 px-2 py-2 text-xs"
                    onClick={() => setBookSlot({ product: p, slotId: s.id })}
                  >
                    <span>{new Date(s.startAt).toLocaleString()}</span>
                    <span className="font-semibold">Book</span>
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showDining ? (
        <>
          {stay && stayMode === 'dining' ? (
            <button
              type="button"
              className="mx-4 mb-2 text-sm font-semibold underline"
              onClick={() => setStayMode('hub')}
            >
              ← Services
            </button>
          ) : null}

          {/* Unified sticky: search + filters + categories */}
          <div className="sticky top-0 z-30 border-b border-[#3d2a1f]/10 bg-[#f6f0e6]/95 backdrop-blur-md">
            <div className="px-4 pb-2 pt-2">
              <div className="flex items-center gap-2 border border-[#3d2a1f]/15 bg-[#faf6ef] px-3 py-2.5">
                <Search className="h-4 w-4 shrink-0 text-[#8a7a6a]" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#8a7a6a]"
                  placeholder="Search dishes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search ? (
                  <button type="button" onClick={() => setSearch('')}>
                    <X className="h-4 w-4 text-[#8a7a6a]" />
                  </button>
                ) : null}
              </div>
              <div className="gs-hide-scroll mt-2 flex gap-2 overflow-x-auto">
                {FILTERS.map((f) => {
                  const on = filters.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        setFilters((prev) =>
                          prev.includes(f.id)
                            ? prev.filter((x) => x !== f.id)
                            : [...prev, f.id],
                        )
                      }
                      className={`shrink-0 border px-2.5 py-1 text-xs font-semibold ${
                        on
                          ? 'border-[#3d2a1f] bg-[#3d2a1f] text-[#faf6ef]'
                          : 'border-[#3d2a1f]/20 text-[#5c4a3a]'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {(data.menuCategories || []).length && !search ? (
              <div className="gs-hide-scroll flex gap-4 overflow-x-auto px-4">
                {(data.menuCategories as MenuCategory[]).map((c) => {
                  const on = activeCat === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => {
                        setActiveCat(c.key);
                        document
                          .getElementById(`cat-${c.key}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`shrink-0 border-b-2 py-2.5 text-sm font-semibold ${
                        on
                          ? 'border-[#3d2a1f] text-[#3d2a1f]'
                          : 'border-transparent text-[#8a7a6a]'
                      }`}
                    >
                      {c.emoji ? `${c.emoji} ` : ''}
                      {c.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {search && typeahead.length ? (
              <ul className="border-t border-[#3d2a1f]/10 bg-[#faf6ef] px-2 py-1">
                {typeahead.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-2 py-2.5 text-left text-sm"
                      onClick={() => {
                        setSearch('');
                        document
                          .getElementById(`dish-${o.id}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      <span className="font-semibold">{o.name}</span>
                      <span className="text-[#8a7a6a]">{inr(o.unitPrice)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {search && !filteredOfferings.length ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-[#3d2a1f]">
                Couldn&apos;t find “{search}”
              </p>
              <p className="mt-1 text-xs text-[#8a7a6a]">Try</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {searchSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSearch(s)}
                    className="border border-[#3d2a1f]/20 px-3 py-1.5 text-xs font-semibold"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {recentOfferings.length && !search ? (
                <section className="px-4 pt-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#8a7a6a]">
                    <RotateCcw className="h-3.5 w-3.5" /> You ordered earlier
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {recentOfferings.slice(0, 3).map((o) => (
                      <li
                        key={`recent-${o.id}`}
                        className="flex items-center justify-between gap-3 border border-[#3d2a1f]/10 bg-[#faf6ef] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{o.name}</p>
                          <p className="text-xs text-[#8a7a6a]">{inr(o.unitPrice)}</p>
                        </div>
                        <button
                          type="button"
                          disabled={!data.acceptingOrders}
                          onClick={() => quickAdd(o)}
                          className="min-h-11 shrink-0 bg-[#3d2a1f] px-3 text-xs font-bold text-[#faf6ef] disabled:opacity-40"
                        >
                          Order again
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {todaysPick && !search ? (
                <section className="px-4 pt-4">
                  <div className="border border-[#3d2a1f]/10 bg-[#faf6ef] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a6a3a]">
                      <Sparkles className="mr-1 inline h-3 w-3" />
                      Chef&apos;s today&apos;s pick
                    </p>
                    <p className="gs-display mt-1 text-xl font-semibold">{todaysPick.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Stars avg={todaysPick.ratingAvg} count={todaysPick.ratingCount} />
                      {todaysPick.prepMinutes ? (
                        <span className="text-xs text-[#5c4a3a]">
                          {todaysPick.prepMinutes} min
                        </span>
                      ) : null}
                    </div>
                    {todaysPick.description ? (
                      <p className="mt-2 text-sm leading-relaxed text-[#5c4a3a]">
                        <span className="font-semibold text-[#3d2a1f]">Why you&apos;ll love it — </span>
                        {todaysPick.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-lg font-bold">{inr(todaysPick.unitPrice)}</span>
                      <button
                        type="button"
                        disabled={!data.acceptingOrders}
                        onClick={() => quickAdd(todaysPick)}
                        className="min-h-12 flex-1 bg-[#3d2a1f] text-sm font-bold text-[#faf6ef] disabled:opacity-40"
                      >
                        + Add
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomize(todaysPick)}
                        className="min-h-12 border border-[#3d2a1f]/20 px-4 text-sm font-semibold"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              {(data.specials || []).length && !search ? (
                <section className="gs-hide-scroll flex gap-2 overflow-x-auto px-4 pt-3">
                  {(data.specials as MenuSpecial[]).map((s) => (
                    <button
                      key={`${s.type}-${s.offeringId}`}
                      type="button"
                      onClick={() => s.offering && quickAdd(s.offering)}
                      className="w-[200px] shrink-0 border border-[#3d2a1f]/15 bg-[#faf6ef] p-2.5 text-left"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#a0522d]">
                        {s.title}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">{s.offering?.name}</p>
                      {s.blurb ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-[#5c4a3a]">{s.blurb}</p>
                      ) : null}
                    </button>
                  ))}
                </section>
              ) : null}

              {(data.popularToday?.length || 0) > 0 && !search ? (
                <section className="pt-5">
                  <h3 className="flex items-center gap-1.5 px-4 text-xs font-bold uppercase tracking-[0.14em] text-[#8a7a6a]">
                    <Flame className="h-3.5 w-3.5 text-[#a0522d]" /> Popular today
                  </h3>
                  <div className="gs-hide-scroll mt-2 flex gap-2.5 overflow-x-auto px-4">
                    {data.popularToday!.slice(0, 8).map((o) => (
                      <PopularCard
                        key={o.id}
                        o={o}
                        qty={cartQtyForOffering(cart, o.id)}
                        alreadyOrdered={alreadyOrderedSet.has(o.id)}
                        disabled={!data.acceptingOrders}
                        onAdd={() => quickAdd(o)}
                        onDec={() => setQty(o.id, cartQtyForOffering(cart, o.id) - 1)}
                        onInc={() => setQty(o.id, cartQtyForOffering(cart, o.id) + 1)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {recommendedFor.length && !search ? (
                <section className="px-4 pt-5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#8a7a6a]">
                    Recommended for you
                  </h3>
                  <ul className="mt-1">
                    {recommendedFor.map((o) => (
                      <DishRow
                        key={`rec-${o.id}`}
                        o={o}
                        qty={cartQtyForOffering(cart, o.id)}
                        alreadyOrdered={alreadyOrderedSet.has(o.id)}
                        disabled={!data.acceptingOrders}
                        onAdd={() => quickAdd(o)}
                        onDec={() => setQty(o.id, cartQtyForOffering(cart, o.id) - 1)}
                        onInc={() => setQty(o.id, cartQtyForOffering(cart, o.id) + 1)}
                        onCustomize={() => openCustomize(o)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {activeCombo && itemCount > 0 ? (
                <div className="mx-4 mt-4 border border-amber-700/40 bg-amber-50 px-3 py-2.5 text-sm">
                  <p className="font-semibold text-amber-950">
                    Upgrade to {activeCombo.name}
                    {activeCombo.saveAmount
                      ? ` · save ${inr(activeCombo.saveAmount)}`
                      : ''}
                  </p>
                  <button
                    type="button"
                    className="mt-1 text-xs font-bold underline"
                    onClick={() => applyCombo(activeCombo)}
                  >
                    Add missing items · {inr(activeCombo.price)}
                  </button>
                </div>
              ) : null}

              <section className="px-4 pt-2">
                {grouped.map(([cat, items]) => (
                  <div key={cat} id={`cat-${cat}`} className="mb-8 scroll-mt-40">
                    <h2 className="gs-display pt-4 text-[1.3rem] font-semibold text-[#3d2a1f]">
                      {sectionLabel(cat)}
                    </h2>
                    <div className="mt-1 mb-2 h-px w-full bg-[#3d2a1f]/12" />
                    <ul>
                      {items.map((o) => (
                        <DishRow
                          key={o.id}
                          o={o}
                          qty={cartQtyForOffering(cart, o.id)}
                          alreadyOrdered={alreadyOrderedSet.has(o.id)}
                          disabled={!data.acceptingOrders}
                          onAdd={() => quickAdd(o)}
                          onDec={() => setQty(o.id, cartQtyForOffering(cart, o.id) - 1)}
                          onInc={() => setQty(o.id, cartQtyForOffering(cart, o.id) + 1)}
                          onCustomize={() => openCustomize(o)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="border border-[#3d2a1f]/10 bg-[#faf6ef] px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-[#3d2a1f]">
                    Can&apos;t find what you&apos;re looking for?
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      className="min-h-11 bg-[#3d2a1f] px-4 text-sm font-bold text-[#faf6ef]"
                      onClick={() => void sendHelpRequest('Talk to Staff')}
                    >
                      Talk to Staff
                    </button>
                    <button
                      type="button"
                      className="min-h-11 border border-[#3d2a1f]/20 px-4 text-sm font-semibold"
                      onClick={() => void sendHelpRequest('Need recommendations')}
                    >
                      Need recommendations?
                    </button>
                  </div>
                </div>
                <p className="pb-4 pt-4 text-[11px] text-[#8a7a6a]">
                  {data.allergenDisclaimer}
                </p>
              </section>
            </>
          )}
        </>
      ) : null}

      {addFlash ? (
        <div className="pointer-events-none fixed left-1/2 z-[55] -translate-x-1/2 border border-[#3d2a1f]/20 bg-[#1c1410] px-4 py-2 text-sm font-semibold text-[#faf6ef] shadow-lg"
          style={{ bottom: cartVisible ? '5.5rem' : '1.5rem' }}
        >
          ✓ {addFlash} · Cart · {itemCount} item{itemCount === 1 ? '' : 's'}
        </div>
      ) : null}

      {/* Undo remove */}
      {pendingUndo ? (
        <div
          className="fixed left-3 right-3 z-[56] flex items-center justify-between gap-3 border border-[#3d2a1f]/20 bg-[#1c1410] px-3 py-2.5 text-sm text-[#faf6ef] shadow-lg"
          style={{ bottom: cartVisible ? '5.25rem' : '1.25rem' }}
        >
          <span className="truncate">Removed {pendingUndo.name}</span>
          <button
            type="button"
            className="shrink-0 font-bold underline"
            onClick={restoreUndo}
          >
            Undo
          </button>
        </div>
      ) : null}

      {/* Help FAB — above cart; hidden when cart/checkout owns the screen */}
      {(restaurant || showDining) && !hideHelpFab ? (
        <div className={`fixed right-3 z-40 ${fabBottom}`}>
          {helpOpen ? (
            <div className="mb-2 w-52 border border-[#3d2a1f]/15 bg-[#faf6ef] p-2 shadow-xl">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8a7a6a]">
                {phase === 'service' || phase === 'finish' ? 'During your meal' : 'Help'}
              </p>
              {helpItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className="flex w-full items-center gap-2 px-2 py-2.5 text-left text-sm font-semibold"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setHelpOpen((v) => !v);
              setHelpNudge(false);
            }}
            className={`ml-auto flex items-center justify-center gap-1 rounded-full bg-[#3d2a1f] px-4 text-sm font-bold text-[#faf6ef] shadow-lg ${
              phase === 'order' ? 'h-12 min-w-[3rem]' : 'h-14 min-w-[3.5rem]'
            } ${helpNudge && !helpOpen ? 'gs-help-nudge' : ''}`}
            aria-label={helpNudge ? 'Need anything?' : 'Help'}
          >
            {helpOpen ? (
              <X className="h-5 w-5" />
            ) : helpNudge ? (
              <span className="px-0.5 text-xs leading-tight">Need anything?</span>
            ) : (
              <>
                <Utensils className="h-4 w-4" /> Help
              </>
            )}
          </button>
        </div>
      ) : null}

      {/* Unmistakable cart — wins over Help when open */}
      {cartVisible ? (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 border-t-2 border-[#c4a574] bg-[#1c1410] text-[#faf6ef] shadow-[0_-8px_30px_rgba(0,0,0,0.35)] pb-[env(safe-area-inset-bottom)] ${
            cartEnterAnim ? 'gs-cart-enter' : ''
          }`}
        >
          <div className={cartPulse ? 'gs-pulse' : undefined}>
          {!cartOpen ? (
            <button
              type="button"
              className="flex min-h-14 w-full items-center justify-between px-4 py-3 text-sm font-bold"
              onClick={() => setCartOpen(true)}
            >
              <span className="inline-flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center bg-[#faf6ef] text-[#1c1410]">
                  <ShoppingBag className="h-4 w-4" />
                </span>
                {itemCount} item{itemCount === 1 ? '' : 's'}
                <span className="font-normal text-[#c4b8a8]">· ~{cartEta} min</span>
              </span>
              <span>
                {inr(total)} · Your order →
              </span>
            </button>
          ) : (
            <div className="max-h-[78vh] overflow-y-auto px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="gs-display text-lg font-semibold">Your order</h3>
                <button type="button" onClick={() => setCartOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ul className="space-y-2 text-sm">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{l.name}</p>
                      {l.modifiers.length ? (
                        <p className="text-[11px] text-[#c4b8a8]">
                          {l.modifiers.map((m) => m.name).join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center border border-white/30"
                        onClick={() => adjustCartLine(l.key, -1)}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-[1.5rem] text-center tabular-nums">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center border border-white/30"
                        onClick={() => adjustCartLine(l.key, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-3 border border-white/15 px-3 py-2.5 text-xs">
                <p className="font-semibold">Estimated · ~{cartEta} min</p>
                {data.kitchen ? (
                  <p className="mt-0.5 text-[#c4b8a8]">
                    Kitchen {data.acceptingOrders ? 'open' : 'paused'} · Queue{' '}
                    {kitchenQueueLabel(data.kitchen)}
                  </p>
                ) : null}
              </div>

              <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-[#c4b8a8]">
                Note for kitchen
              </label>
              <textarea
                className="mt-1 w-full border border-white/20 bg-transparent px-2 py-2 text-xs"
                rows={2}
                placeholder="Less spicy, no onion, extra butter…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="mt-1 text-[10px] text-[#c4b8a8]">
                Example: Less spicy, No onion, Extra butter
              </p>

              <p className="mt-3 text-sm text-[#c4b8a8]">Need anything else?</p>
              <button
                type="button"
                className="mt-1 w-full min-h-11 border border-white/25 text-sm font-semibold"
                onClick={() => setCartOpen(false)}
              >
                Continue browsing
              </button>
              <button
                type="button"
                disabled={placing || !data.acceptingOrders}
                onClick={() => void placeOrder()}
                className="mt-2 min-h-12 w-full bg-[#faf6ef] text-sm font-bold text-[#1c1410] disabled:opacity-50"
              >
                {placing ? 'Sending…' : `Send order · ${inr(total)}`}
              </button>
            </div>
          )}
          </div>
        </div>
      ) : null}

      {/* Post-send: During Meal landing */}
      {postOrderOpen && orderId ? (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/45 sm:items-center">
          <div className="w-full max-w-md bg-[#faf6ef] p-5 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center bg-[#2f6b3a] text-[#faf6ef]">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="gs-display mt-3 text-2xl font-semibold text-[#3d2a1f]">
              Order sent
            </h3>
            <p className="mt-1 text-sm text-[#5c4a3a]">
              {orderShortNo ? `Order #${orderShortNo} · ` : ''}
              Preparing now · about {serviceEta} minutes
            </p>
            <OrderTimeline statusIdx={statusIdx} variant="light" compact />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#8a7a6a]">
              During your meal
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { label: '💧 Water', title: 'Water' },
                { label: '🍴 Cutlery', title: 'Extra Cutlery' },
                { label: '🛎️ Waiter', title: 'Call waiter' },
              ].map((a) => (
                <button
                  key={a.title}
                  type="button"
                  onClick={() => void sendHelpRequest(a.title)}
                  className="min-h-12 border border-[#3d2a1f]/15 bg-white text-xs font-bold"
                >
                  {a.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 min-h-12 w-full bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
              onClick={() => {
                setPostOrderOpen(false);
                window.scrollTo({ top: 320, behavior: 'smooth' });
              }}
            >
              Continue browsing
            </button>
          </div>
        </div>
      ) : null}

      {/* Upsell sheet */}
      {upsellFor ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40">
          <div className="w-full max-w-md bg-[#faf6ef] p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                ✓ {upsellFor.name} added
              </p>
              <button type="button" onClick={() => setUpsellFor(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-[#8a7a6a]">
              People usually add
            </p>
            <ul className="mt-2 space-y-2">
              {upsellSuggestions(upsellFor).map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-2 border border-[#3d2a1f]/10 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold">{o.name}</p>
                    <p className="text-xs text-[#8a7a6a]">{inr(o.unitPrice)}</p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 bg-[#3d2a1f] px-3 text-xs font-bold text-[#faf6ef]"
                    onClick={() => addToCart(o, undefined, { skipUpsell: true })}
                  >
                    + Add
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-3 w-full py-2 text-sm font-semibold underline"
              onClick={() => setUpsellFor(null)}
            >
              No thanks
            </button>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto bg-[#faf6ef] p-4">
            <div className="flex justify-between">
              <h3 className="gs-display text-xl font-semibold">{detail.name}</h3>
              <button type="button" onClick={() => setDetail(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Stars avg={detail.ratingAvg} count={detail.ratingCount} />
              {lovedByLine(detail) ? (
                <p className="text-xs font-semibold text-[#8a6a3a]">{lovedByLine(detail)}</p>
              ) : null}
            </div>
            <BadgePills o={detail} />
            {detail.description ? (
              <p className="mt-2 text-sm leading-relaxed text-[#5c4a3a]">
                <span className="font-semibold text-[#3d2a1f]">Why you&apos;ll love it — </span>
                {detail.description}
              </p>
            ) : null}
            {upsellSuggestions(detail).length ? (
              <div className="mt-3 border border-[#3d2a1f]/10 bg-white/50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a7a6a]">
                  Pairs well with
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {upsellSuggestions(detail).slice(0, 2).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{o.name}</span>
                      <button
                        type="button"
                        className="min-h-9 bg-[#3d2a1f] px-2.5 text-[11px] font-bold text-[#faf6ef]"
                        onClick={() => addToCart(o, undefined, { skipUpsell: true })}
                      >
                        + {inr(o.unitPrice)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(detail.modifiers || []).map((g: ModifierGroup) => (
              <div key={g.id} className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#8a7a6a]">
                  {g.name}
                </p>
                <div className="mt-2 space-y-1">
                  {g.options.map((opt) => {
                    const selected = (modifierPicks[g.id] || []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setModifierPicks((prev) => {
                            if (g.maxSelect <= 1) return { ...prev, [g.id]: [opt.id] };
                            const cur = prev[g.id] || [];
                            if (selected) {
                              return { ...prev, [g.id]: cur.filter((x) => x !== opt.id) };
                            }
                            if (cur.length >= g.maxSelect) return prev;
                            return { ...prev, [g.id]: [...cur, opt.id] };
                          });
                        }}
                        className={`flex w-full justify-between border px-3 py-2.5 text-sm ${
                          selected
                            ? 'border-[#3d2a1f] bg-[#3d2a1f]/5 font-semibold'
                            : 'border-[#3d2a1f]/15'
                        }`}
                      >
                        <span>{opt.name}</span>
                        <span>
                          {opt.priceDelta > 0 ? `+${inr(opt.priceDelta)}` : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="mt-4 min-h-12 w-full bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
              onClick={() => addToCart(detail, modifierPicks)}
            >
              Add · {inr(detail.unitPrice)}
            </button>
          </div>
        </div>
      ) : null}

      {/* Bill / finish */}
      {checkoutOpen && bill ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto bg-[#faf6ef] p-5">
            <h3 className="gs-display text-xl font-semibold">Your order</h3>
            <p className="mt-1 text-xs text-[#5c4a3a]">
              {bill.locationLabel || data.location.label}
            </p>
            <ul className="mt-4 max-h-40 space-y-2 overflow-y-auto border-y border-[#3d2a1f]/10 py-3 text-sm">
              {(bill.lines || []).map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span>{l.description}</span>
                  <span className="font-semibold tabular-nums">
                    {inr(l.amount + l.taxAmount)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#8a7a6a]">Subtotal</dt>
                <dd className="font-semibold">{inr(bill.itemsSubtotal ?? bill.charges)}</dd>
              </div>
              {(bill.taxTotal || 0) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-[#8a7a6a]">GST / tax</dt>
                  <dd>{inr(bill.taxTotal || 0)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-[#3d2a1f]/15 pt-2 text-base">
                <dt className="font-semibold">Total due</dt>
                <dd className="font-bold">{inr(bill.outstanding)}</dd>
              </div>
            </dl>

            {billStep === 'review' ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-[#5c4a3a]">Need anything else before paying?</p>
                <button
                  type="button"
                  className="min-h-12 w-full border border-[#3d2a1f]/20 text-sm font-semibold"
                  onClick={() => {
                    setCheckoutOpen(false);
                    setStayMode('dining');
                  }}
                >
                  Order more
                </button>
                <button
                  type="button"
                  className="min-h-12 w-full bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
                  onClick={() => setBillStep('pay')}
                >
                  Continue to tip & pay
                </button>
              </div>
            ) : (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#8a7a6a]">
                  Tip
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0, 5, 10, 15].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTipPct(p)}
                      className={`min-h-11 border px-3 text-sm font-semibold ${
                        tipPct === p
                          ? 'border-[#3d2a1f] bg-[#3d2a1f] text-[#faf6ef]'
                          : 'border-[#3d2a1f]/20'
                      }`}
                    >
                      {p === 0 ? 'None' : `${p}%`}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm">
                  Pay now: <strong>{inr(bill.outstanding + tipAmount)}</strong>
                </p>
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => void payNow()}
                  className="mt-3 min-h-12 w-full bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
                >
                  {paying ? 'Paying…' : 'Pay now'}
                </button>
                <button
                  type="button"
                  className="mt-2 w-full text-sm underline"
                  onClick={() => setBillStep('review')}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {thankYouOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md bg-[#faf6ef] p-6 text-center">
            <Check className="mx-auto h-10 w-10 text-[#2f6b3a]" />
            <h3 className="gs-display mt-3 text-2xl font-semibold">Thank you</h3>
            <p className="mt-2 text-sm text-[#5c4a3a]">
              We hope you enjoyed your meal at {data.businessName}.
            </p>
            <button
              type="button"
              className="mt-5 min-h-12 w-full bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
              onClick={() => {
                setThankYouOpen(false);
                setFeedbackOpen(true);
              }}
            >
              Leave feedback
            </button>
            <button
              type="button"
              className="mt-2 text-sm underline"
              onClick={() => setThankYouOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {feedbackOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto bg-[#faf6ef] p-5">
            <h3 className="gs-display text-xl font-semibold">How was it?</h3>
            <div className="gs-hide-scroll mt-3 flex gap-1 overflow-x-auto">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setNps(i)}
                  className={`h-10 w-10 shrink-0 border text-sm font-semibold ${
                    nps === i
                      ? 'border-[#3d2a1f] bg-[#3d2a1f] text-[#faf6ef]'
                      : 'border-[#3d2a1f]/20'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {FEEDBACK_TAGS.map((t) => {
                const on = feedbackTags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setFeedbackTags((prev) =>
                        on ? prev.filter((x) => x !== t) : [...prev, t],
                      )
                    }
                    className={`border px-2 py-1 text-xs font-semibold ${
                      on
                        ? 'border-[#3d2a1f] bg-[#3d2a1f] text-[#faf6ef]'
                        : 'border-[#3d2a1f]/20'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            {orderedItems.map((it, idx) => {
              const oid =
                it.offeringId ||
                data.offerings.find((o) => o.name === it.name)?.id;
              if (!oid) return null;
              return (
                <div key={`${oid}-${idx}`} className="mt-3 flex items-center justify-between">
                  <span className="text-sm">{it.name}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setRatingStars((prev) => ({ ...prev, [oid]: s }))
                        }
                      >
                        <Star
                          className={`h-4 w-4 ${
                            (ratingStars[oid] || 0) >= s
                              ? 'fill-[#c4a574] text-[#c4a574]'
                              : 'text-[#c4b8a8]'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <textarea
              className="mt-3 w-full border border-[#3d2a1f]/20 px-3 py-2 text-sm"
              rows={2}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Anything else?"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="min-h-12 flex-1 bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
                onClick={() => void submitFeedback()}
              >
                Send
              </button>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => setFeedbackOpen(false)}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {requestOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md bg-[#faf6ef] p-5">
            <h3 className="gs-display text-lg font-semibold">{requestTitle}</h3>
            <textarea
              className="mt-3 w-full border border-[#3d2a1f]/20 px-3 py-2 text-sm"
              rows={3}
              value={requestNotes}
              onChange={(e) => setRequestNotes(e.target.value)}
            />
            <button
              type="button"
              className="mt-3 min-h-12 w-full bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
              onClick={() =>
                void submitHostRequest(
                  requestTitle.toLowerCase().includes('house')
                    ? 'housekeeping'
                    : 'front_desk',
                  requestTitle,
                )
              }
            >
              Send
            </button>
            <button
              type="button"
              className="mt-2 w-full text-sm underline"
              onClick={() => setRequestOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {bookSlot ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md bg-[#faf6ef] p-5">
            <h3 className="gs-display text-lg font-semibold">{bookSlot.product.title}</h3>
            <input
              className="mt-3 w-full border border-[#3d2a1f]/20 px-3 py-2 text-sm"
              placeholder="Name"
              value={bookName}
              onChange={(e) => setBookName(e.target.value)}
            />
            <input
              className="mt-2 w-full border border-[#3d2a1f]/20 px-3 py-2 text-sm"
              placeholder="Phone"
              value={bookPhone}
              onChange={(e) => setBookPhone(e.target.value)}
            />
            <button
              type="button"
              className="mt-3 min-h-12 w-full bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
              onClick={() => void bookExperience()}
            >
              Confirm
            </button>
            <button
              type="button"
              className="mt-2 w-full text-sm underline"
              onClick={() => setBookSlot(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PopularCard({
  o,
  qty,
  alreadyOrdered,
  onAdd,
  onDec,
  onInc,
  disabled,
}: {
  o: Offering;
  qty: number;
  alreadyOrdered?: boolean;
  onAdd: () => void;
  onDec: () => void;
  onInc: () => void;
  disabled: boolean;
}) {
  const [c0, c1] = dishTone(o.id);
  return (
    <div className="w-[172px] shrink-0 overflow-hidden border border-[#3d2a1f]/10 bg-[#faf6ef]">
      <div
        className="aspect-[4/3] w-full"
        style={
          o.imageUrl
            ? {
                backgroundImage: `url(${o.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: `linear-gradient(145deg, ${c0}, ${c1})` }
        }
      />
      <div className="flex flex-col p-2.5">
        <p className="gs-display line-clamp-2 text-[0.95rem] font-semibold leading-snug">
          {o.name}
        </p>
        {o.prepMinutes ? (
          <p className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#5c4a3a]">
            <Clock className="h-3 w-3" />
            Ready in {o.prepMinutes} min
          </p>
        ) : null}
        <div className="mt-0.5">
          <Stars avg={o.ratingAvg} count={o.ratingCount} />
        </div>
        {(o.ordersToday || 0) > 0 ? (
          <p className="mt-0.5 text-[10px] font-bold text-[#a0522d]">
            🔥 Ordered {o.ordersToday} today
          </p>
        ) : null}
        {alreadyOrdered ? (
          <p className="mt-0.5 text-[10px] font-semibold text-[#2f6b3a]">Already ordered</p>
        ) : null}
        <p className="mt-2 text-xl font-bold tabular-nums tracking-tight text-[#3d2a1f]">
          {inr(o.unitPrice)}
        </p>
        <div className="mt-2">
          {qty > 0 ? (
            <div className="flex items-center justify-end">
              <button
                type="button"
                disabled={disabled}
                onClick={onDec}
                className="flex h-11 w-11 items-center justify-center bg-[#3d2a1f] text-[#faf6ef]"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[1.5rem] text-center text-sm font-bold">{qty}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={onInc}
                className="flex h-11 w-11 items-center justify-center bg-[#3d2a1f] text-[#faf6ef]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={onAdd}
              className="min-h-11 w-full bg-[#3d2a1f] text-sm font-bold text-[#faf6ef]"
            >
              {alreadyOrdered ? 'Add more' : '+ Add'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DishRow({
  o,
  qty,
  alreadyOrdered,
  onAdd,
  onDec,
  onInc,
  onCustomize,
  disabled,
}: {
  o: Offering;
  qty: number;
  alreadyOrdered?: boolean;
  onAdd: () => void;
  onDec: () => void;
  onInc: () => void;
  onCustomize: () => void;
  disabled: boolean;
}) {
  const [c0, c1] = dishTone(o.id);
  const needsCustom = hasRequiredModifiers(o);
  return (
    <li
      id={`dish-${o.id}`}
      className="flex gap-3 border-b border-[#3d2a1f]/08 py-3.5"
    >
      <div
        className="h-[72px] w-[72px] shrink-0 overflow-hidden"
        style={
          o.imageUrl
            ? {
                backgroundImage: `url(${o.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: `linear-gradient(145deg, ${c0}, ${c1})` }
        }
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{o.name}</p>
        {o.description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-[#5c4a3a]">{o.description}</p>
        ) : null}
        <BadgePills o={o} />
        {alreadyOrdered ? (
          <p className="mt-1 text-[11px] font-semibold text-[#2f6b3a]">Already ordered</p>
        ) : (o.ordersToday || 0) > 0 ? (
          <p className="mt-1 text-[11px] font-semibold text-[#a0522d]">
            Ordered {o.ordersToday}× today
          </p>
        ) : (
          <div className="mt-1">
            <Stars avg={o.ratingAvg} count={o.ratingCount} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-base font-bold tabular-nums">{inr(o.unitPrice)}</span>
          <div className="flex items-center gap-2">
            {(needsCustom || (o.modifiers || []).length > 0) && (
              <button
                type="button"
                disabled={disabled}
                onClick={onCustomize}
                className="text-xs font-bold text-[#3d2a1f] underline"
              >
                Options →
              </button>
            )}
            {qty > 0 && !needsCustom ? (
              <div className="flex items-center">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onDec}
                  className="flex h-12 w-12 items-center justify-center bg-[#3d2a1f] text-[#faf6ef]"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[1.75rem] text-center text-sm font-bold">{qty}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onInc}
                  className="flex h-12 w-12 items-center justify-center bg-[#3d2a1f] text-[#faf6ef]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={onAdd}
                className="min-h-12 min-w-[5.5rem] bg-[#3d2a1f] px-4 text-sm font-bold text-[#faf6ef] disabled:opacity-40"
              >
                {alreadyOrdered ? 'Add more' : '+ Add'}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
