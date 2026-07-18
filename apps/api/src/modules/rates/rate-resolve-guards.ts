/** Pure date / blackout / stop-sell helpers for quote rate resolve. */

export type IsoDay = string; // YYYY-MM-DD

export type BlackoutRange = { from: IsoDay; to: IsoDay };

export type DateWindow = { startDate: Date; endDate: Date };

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

export function dayInBlackout(day: Date, ranges: BlackoutRange[]): boolean {
  const iso = dateToIsoDay(day);
  return ranges.some((r) => iso >= r.from && iso <= r.to);
}

export function anyNightInBlackout(nights: Date[], ranges: BlackoutRange[]): boolean {
  if (!ranges.length || !nights.length) return false;
  return nights.some((d) => dayInBlackout(d, ranges));
}

/** Allotment windows use [startDate, endDate) like stay availability. */
export function dayInStopSellWindow(day: Date, windows: DateWindow[]): boolean {
  return windows.some((w) => w.startDate <= day && w.endDate > day);
}

export function anyNightInStopSell(nights: Date[], windows: DateWindow[]): boolean {
  if (!windows.length || !nights.length) return false;
  return nights.some((d) => dayInStopSellWindow(d, windows));
}

export function supplierBlockedReason(
  nights: Date[],
  blackouts: BlackoutRange[],
  stopSellWindows: DateWindow[],
): 'blackout' | 'stop_sell' | null {
  if (anyNightInBlackout(nights, blackouts)) return 'blackout';
  if (anyNightInStopSell(nights, stopSellWindows)) return 'stop_sell';
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

function normDim(raw?: string | null): string {
  return (raw || '').trim().toLowerCase();
}

/**
 * Prefer exact room+meal, then blank defaults, excluding conflicting non-empty dims.
 */
export function filterHotelByRoomAndMeal<
  T extends { roomType: string | null; mealPlan: string | null },
>(pool: T[], roomWanted: string, mealWanted: string): T[] {
  const room = normDim(roomWanted);
  const meal = normDim(mealWanted);

  let candidates = pool.filter((r) => {
    const haveRoom = normDim(r.roomType);
    const haveMeal = normDim(r.mealPlan);
    if (room && haveRoom && haveRoom !== room) return false;
    if (meal && haveMeal && haveMeal !== meal) return false;
    return true;
  });
  if (!candidates.length) return [];

  if (room) {
    const exact = candidates.filter((r) => normDim(r.roomType) === room);
    if (exact.length) candidates = exact;
    else {
      const defaults = candidates.filter((r) => !normDim(r.roomType));
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
