/** Pure date / blackout / stop-sell helpers for quote rate resolve. */

export type IsoDay = string; // YYYY-MM-DD

export type BlackoutRange = { from: IsoDay; to: IsoDay };

export type StopSaleRange = {
  from: IsoDay;
  to: IsoDay;
  roomProductId?: string | null;
};

export type DateWindow = {
  startDate: Date;
  endDate: Date;
  roomProductId?: string | null;
};

export function parseIsoDay(iso?: string | null): IsoDay | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function dateToIsoDay(d: Date): IsoDay {
  return d.toISOString().slice(0, 10);
}

/** Inclusive calendar nights starting at check-in for `nights` nights. */
export function eachStayNight(checkIn: Date | null, nights: number): Date[] {
  if (!checkIn || !Number.isFinite(checkIn.getTime())) return [];
  const n = Math.max(1, Math.floor(nights) || 1);
  const out: Date[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(checkIn.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d);
  }
  return out;
}

/** Parse contract blackoutJson into inclusive from/to day ranges. */
export function parseBlackoutRanges(raw: unknown): BlackoutRange[] {
  if (!Array.isArray(raw)) return [];
  const out: BlackoutRange[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const from = parseIsoDay(
      typeof r.from === 'string'
        ? r.from
        : typeof r.start === 'string'
          ? r.start
          : typeof r.startDate === 'string'
            ? r.startDate
            : null,
    );
    const to = parseIsoDay(
      typeof r.to === 'string'
        ? r.to
        : typeof r.end === 'string'
          ? r.end
          : typeof r.endDate === 'string'
            ? r.endDate
            : null,
    );
    if (from && to && from <= to) out.push({ from, to });
  }
  return out;
}

/** Parse contract stopSaleJson — optional roomProductId scopes to one room. */
export function parseStopSaleRanges(raw: unknown): StopSaleRange[] {
  if (!Array.isArray(raw)) return [];
  const out: StopSaleRange[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const from = parseIsoDay(
      typeof r.from === 'string'
        ? r.from
        : typeof r.start === 'string'
          ? r.start
          : null,
    );
    const to = parseIsoDay(
      typeof r.to === 'string' ? r.to : typeof r.end === 'string' ? r.end : null,
    );
    if (!from || !to || from > to) continue;
    const roomProductId =
      typeof r.roomProductId === 'string' && r.roomProductId.trim()
        ? r.roomProductId.trim()
        : null;
    out.push({ from, to, roomProductId });
  }
  return out;
}

export function dayInBlackout(day: Date, ranges: BlackoutRange[]): boolean {
  const iso = dateToIsoDay(day);
  return ranges.some((r) => iso >= r.from && iso <= r.to);
}

export function anyNightInBlackout(nights: Date[], ranges: BlackoutRange[]): boolean {
  if (!ranges.length || !nights.length) return false;
  return nights.some((d) => dayInBlackout(d, ranges));
}

export function dayInInclusiveStopSale(
  day: Date,
  ranges: StopSaleRange[],
  roomProductId?: string | null,
): boolean {
  const iso = dateToIsoDay(day);
  return ranges.some((r) => {
    if (iso < r.from || iso > r.to) return false;
    if (!r.roomProductId) return true;
    if (!roomProductId) return true;
    return r.roomProductId === roomProductId;
  });
}

export function anyNightInContractStopSale(
  nights: Date[],
  ranges: StopSaleRange[],
  roomProductId?: string | null,
): boolean {
  if (!ranges.length || !nights.length) return false;
  return nights.some((d) => dayInInclusiveStopSale(d, ranges, roomProductId));
}

/** Allotment windows use [startDate, endDate) like stay availability. */
export function dayInStopSellWindow(
  day: Date,
  windows: DateWindow[],
  roomProductId?: string | null,
): boolean {
  return windows.some((w) => {
    if (!(w.startDate <= day && w.endDate > day)) return false;
    if (!w.roomProductId) return true;
    if (!roomProductId) return true;
    return w.roomProductId === roomProductId;
  });
}

export function anyNightInStopSell(
  nights: Date[],
  windows: DateWindow[],
  roomProductId?: string | null,
): boolean {
  if (!windows.length || !nights.length) return false;
  return nights.some((d) => dayInStopSellWindow(d, windows, roomProductId));
}

/**
 * Block reason for a stay:
 * - stop_sale (hard) preferred when both apply for ops clarity on unavailability
 * - blackout (soft — contracted rate invalid)
 */
export function supplierBlockedReason(
  nights: Date[],
  blackouts: BlackoutRange[],
  stopSellWindows: DateWindow[],
  opts?: {
    roomProductId?: string | null;
    contractStopSales?: StopSaleRange[];
  },
): 'blackout' | 'stop_sell' | null {
  const roomProductId = opts?.roomProductId ?? null;
  if (
    anyNightInStopSell(nights, stopSellWindows, roomProductId) ||
    anyNightInContractStopSale(nights, opts?.contractStopSales ?? [], roomProductId)
  ) {
    return 'stop_sell';
  }
  if (anyNightInBlackout(nights, blackouts)) return 'blackout';
  return null;
}

/** UTC calendar weekend (Sat/Sun) — hotel nights are stored as date-only UTC. */
export function isWeekendUtc(day: Date): boolean {
  const dow = day.getUTCDay();
  return dow === 0 || dow === 6;
}

export type HotelCostRow = {
  unitCost: number | { toString(): string };
  weekendUnitCost?: number | { toString(): string } | null;
};

export function hotelNightUnitCost(rate: HotelCostRow, night: Date): number {
  const weekday = Number(rate.unitCost);
  if (!Number.isFinite(weekday)) return 0;
  if (rate.weekendUnitCost == null) return weekday;
  const weekend = Number(rate.weekendUnitCost);
  if (!Number.isFinite(weekend)) return weekday;
  return isWeekendUtc(night) ? weekend : weekday;
}

/** Average per-night cost across stay nights (weekend nights use weekendUnitCost when set). */
export function averageHotelUnitCost(
  rate: HotelCostRow,
  nights: Date[],
): number {
  if (!nights.length) return Number(rate.unitCost) || 0;
  const total = nights.reduce((sum, n) => sum + hotelNightUnitCost(rate, n), 0);
  return total / nights.length;
}

export function hotelStayCalculation(
  rate: HotelCostRow,
  nights: Date[],
  rooms = 1,
): {
  weekdayNights: number;
  weekendNights: number;
  weekdayUnit: number;
  weekendUnit: number | null;
  rooms: number;
  totalBuy: number;
} {
  const roomCount = Math.max(1, Math.floor(rooms) || 1);
  const weekdayUnit = Number(rate.unitCost) || 0;
  const weekendUnit =
    rate.weekendUnitCost != null && Number.isFinite(Number(rate.weekendUnitCost))
      ? Number(rate.weekendUnitCost)
      : null;
  let weekdayNights = 0;
  let weekendNights = 0;
  let total = 0;
  for (const n of nights) {
    const cost = hotelNightUnitCost(rate, n);
    total += cost * roomCount;
    if (weekendUnit != null && isWeekendUtc(n)) weekendNights += 1;
    else weekdayNights += 1;
  }
  return {
    weekdayNights,
    weekendNights,
    weekdayUnit,
    weekendUnit,
    rooms: roomCount,
    totalBuy: total,
  };
}

function normDim(raw?: string | null): string {
  return (raw || '').trim().toLowerCase();
}

/**
 * Prefer roomProductId exact, then room+meal string dims, then blank defaults.
 */
export function filterHotelByRoomAndMeal<
  T extends {
    roomType: string | null;
    mealPlan: string | null;
    roomProductId?: string | null;
  },
>(
  pool: T[],
  roomWanted: string,
  mealWanted: string,
  roomProductIdWanted?: string | null,
): T[] {
  const productId = (roomProductIdWanted || '').trim();
  const room = normDim(roomWanted);
  const meal = normDim(mealWanted);

  let candidates = pool.filter((r) => {
    if (productId && r.roomProductId) {
      if (r.roomProductId !== productId) return false;
    } else {
      const haveRoom = normDim(r.roomType);
      if (room && haveRoom && haveRoom !== room) return false;
    }
    const haveMeal = normDim(r.mealPlan);
    if (meal && haveMeal && haveMeal !== meal) return false;
    return true;
  });
  if (!candidates.length) return [];

  if (productId) {
    const exact = candidates.filter((r) => r.roomProductId === productId);
    if (exact.length) candidates = exact;
  } else if (room) {
    const exact = candidates.filter((r) => normDim(r.roomType) === room);
    if (exact.length) candidates = exact;
    else {
      const defaults = candidates.filter((r) => !normDim(r.roomType) && !r.roomProductId);
      if (defaults.length) candidates = defaults;
    }
  }
  if (meal) {
    const exact = candidates.filter((r) => normDim(r.mealPlan) === meal);
    if (exact.length) candidates = exact;
    else {
      const defaults = candidates.filter((r) => !normDim(r.mealPlan));
      if (defaults.length) candidates = defaults;
    }
  }
  return candidates;
}

export type MatchReject = { rateId?: string; label: string; reason: string };

/** Classify why a hotel rate was not selected from the full pool. */
export function explainHotelRejects<
  T extends {
    id: string;
    roomType: string | null;
    mealPlan: string | null;
    roomProductId?: string | null;
    startDate: Date | null;
    endDate: Date | null;
    contractId?: string | null;
    contractStatus?: string | null;
  },
>(
  pool: T[],
  chosenId: string | undefined,
  opts: {
    roomWanted: string;
    mealWanted: string;
    roomProductIdWanted?: string | null;
    asOf: Date | null;
    max?: number;
  },
): MatchReject[] {
  const rejects: MatchReject[] = [];
  const productId = (opts.roomProductIdWanted || '').trim();
  const room = normDim(opts.roomWanted);
  const meal = normDim(opts.mealWanted);
  const asOfIso = opts.asOf ? dateToIsoDay(opts.asOf) : null;

  for (const r of pool) {
    if (r.id === chosenId) continue;
    const label = [r.roomType || 'Default room', r.mealPlan || 'Any meal']
      .filter(Boolean)
      .join(' · ');
    if (r.contractStatus && r.contractStatus !== 'active' && r.contractId) {
      rejects.push({
        rateId: r.id,
        label,
        reason:
          r.contractStatus === 'superseded'
            ? 'superseded contract'
            : `contract status: ${r.contractStatus}`,
      });
      continue;
    }
    if (productId && r.roomProductId && r.roomProductId !== productId) {
      rejects.push({ rateId: r.id, label, reason: 'room product does not match' });
      continue;
    }
    if (
      !productId &&
      room &&
      normDim(r.roomType) &&
      normDim(r.roomType) !== room
    ) {
      rejects.push({ rateId: r.id, label, reason: 'room type does not match' });
      continue;
    }
    if (meal && normDim(r.mealPlan) && normDim(r.mealPlan) !== meal) {
      rejects.push({ rateId: r.id, label, reason: 'meal plan does not match' });
      continue;
    }
    if (asOfIso && r.startDate && dateToIsoDay(r.startDate) > asOfIso) {
      rejects.push({ rateId: r.id, label, reason: 'season starts after stay' });
      continue;
    }
    if (asOfIso && r.endDate && dateToIsoDay(r.endDate) < asOfIso) {
      rejects.push({ rateId: r.id, label, reason: 'season ended before stay' });
      continue;
    }
    rejects.push({ rateId: r.id, label, reason: 'lower score than selected match' });
  }
  const max = opts.max ?? 8;
  return rejects.slice(0, max);
}

/** Why transfer fares in the pool were not selected (or none matched). */
export function explainTransferRejects<
  T extends {
    id: string;
    fromPlaceId: string;
    toPlaceId: string;
    vehicleTypeId: string;
    isSystem: boolean;
    organizationId: string | null;
    startDate: Date | null;
    endDate: Date | null;
  },
>(
  pool: T[],
  chosenId: string | undefined,
  opts: {
    fromPlaceId: string;
    toPlaceId: string;
    vehicleTypeId: string;
    asOf: Date | null;
    max?: number;
  },
): MatchReject[] {
  const rejects: MatchReject[] = [];
  const asOfIso = opts.asOf ? dateToIsoDay(opts.asOf) : null;
  const reverseExists = pool.some(
    (f) =>
      f.fromPlaceId === opts.toPlaceId &&
      f.toPlaceId === opts.fromPlaceId &&
      f.vehicleTypeId === opts.vehicleTypeId,
  );

  for (const f of pool) {
    if (f.id === chosenId) continue;
    const label = f.isSystem ? 'System corridor' : 'Agency override';
    if (f.fromPlaceId !== opts.fromPlaceId || f.toPlaceId !== opts.toPlaceId) {
      if (
        f.fromPlaceId === opts.toPlaceId &&
        f.toPlaceId === opts.fromPlaceId &&
        f.vehicleTypeId === opts.vehicleTypeId
      ) {
        rejects.push({
          rateId: f.id,
          label,
          reason: 'opposite direction — pick reverse route or swap From/To',
        });
      }
      continue;
    }
    if (f.vehicleTypeId !== opts.vehicleTypeId) {
      rejects.push({ rateId: f.id, label, reason: 'vehicle type does not match' });
      continue;
    }
    if (asOfIso && f.startDate && dateToIsoDay(f.startDate) > asOfIso) {
      rejects.push({ rateId: f.id, label, reason: 'season / closing window starts later' });
      continue;
    }
    if (asOfIso && f.endDate && dateToIsoDay(f.endDate) < asOfIso) {
      rejects.push({ rateId: f.id, label, reason: 'season / closing window ended' });
      continue;
    }
    rejects.push({ rateId: f.id, label, reason: 'lower score than selected match' });
  }

  if (!chosenId && reverseExists && !rejects.some((r) => r.reason.includes('opposite'))) {
    rejects.unshift({
      label: 'Point-to-point',
      reason: 'no fare this direction; reverse corridor exists — swap From/To',
    });
  }

  const max = opts.max ?? 8;
  return rejects.slice(0, max);
}

/** Accepted explain lines for a matched transfer fare. */
export function transferMatchAccepted(opts: {
  isSystem: boolean;
  supplierId?: string | null;
  pricingMode: string;
  startDate: Date | null;
  endDate: Date | null;
  vehicleSeats?: number | null;
}): string[] {
  const accepted: string[] = [];
  if (opts.supplierId) accepted.push('Supplier corridor fare');
  else accepted.push(opts.isSystem ? 'System corridor fare' : 'Agency transfer override');
  if (opts.startDate || opts.endDate) {
    accepted.push('Season / closing window matched');
  } else {
    accepted.push('Open dates (no season close)');
  }
  if (opts.pricingMode === 'per_adult') accepted.push('Per-adult pricing');
  else accepted.push('Per-vehicle pricing');
  if (opts.vehicleSeats != null && opts.vehicleSeats > 0) {
    accepted.push(`Capacity ${opts.vehicleSeats} seats`);
  }
  return accepted;
}

