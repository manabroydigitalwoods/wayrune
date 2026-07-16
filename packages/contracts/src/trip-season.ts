/** Trip travel-window helpers for proposal story weather copy. */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type TripClimateSeason =
  | 'winter'
  | 'summer'
  | 'monsoon'
  | 'autumn'
  | 'spring';

export function parseIsoDateParts(
  iso?: string | null,
): { year: number; month: number; day: number } | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Hill-circuit seasons used by PlaceKnowledge.season. */
export function climateSeasonFromMonth(month: number): TripClimateSeason {
  if (month === 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'summer';
  if (month >= 6 && month <= 9) return 'monsoon';
  return 'autumn';
}

/** Short human label for the travel window — e.g. "July", "October–November". */
export function tripWindowLabel(
  startDate?: string | null,
  endDate?: string | null,
): string | null {
  const start = parseIsoDateParts(startDate);
  if (!start) return null;
  const end = parseIsoDateParts(endDate) || start;
  const startName = MONTH_NAMES[start.month - 1];
  const endName = MONTH_NAMES[end.month - 1];
  if (start.year === end.year && start.month === end.month) return startName;
  if (start.year === end.year) return `${startName}–${endName}`;
  return `${startName} ${start.year}`;
}

/**
 * Customer-facing title for the travel window (not ideal visit season).
 * e.g. "July in Darjeeling", "During your October trip".
 */
export function tripWindowHeadline(
  startDate?: string | null,
  endDate?: string | null,
  placeName?: string | null,
): string {
  const window = tripWindowLabel(startDate, endDate);
  const place = placeName?.trim() || null;
  if (window && place) return `${window} in ${place}`;
  if (window) return `During your ${window} trip`;
  if (place) return `During your stay in ${place}`;
  return 'During your trip';
}

/** True when text looks like a generic ideal season range (confusing on a booked trip). */
export function looksLikeIdealSeasonRange(text?: string | null): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (/^year-?round\b/i.test(t)) return true;
  const months =
    'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  return new RegExp(
    `\\b(?:${months})\\b[^\\n]{0,24}[–—\\-][^\\n]{0,24}\\b(?:${months})\\b`,
    'i',
  ).test(t);
}

/**
 * Prefer a travel-window headline over a saved ideal-season string.
 */
export function resolveTripWindowDisplay(
  savedBestTime: string | null | undefined,
  startDate?: string | null,
  endDate?: string | null,
  placeName?: string | null,
): string | null {
  const computed = startDate
    ? tripWindowHeadline(startDate, endDate, placeName)
    : null;
  const saved = savedBestTime?.trim() || null;
  if (saved && looksLikeIdealSeasonRange(saved) && computed) return computed;
  if (saved) return saved;
  return computed;
}

export type SeasonalKnowledgeItem = {
  season?: string | null;
  kind: string;
  title?: string | null;
  body: string;
};

/** Pick knowledge for the trip month — exact season, then `all`, then any. */
export function pickSeasonalKnowledgeBody(
  items: SeasonalKnowledgeItem[],
  kind: string,
  season: TripClimateSeason | null,
): string | undefined {
  const matched = items.filter((k) => k.kind === kind && k.body?.trim());
  if (!matched.length) return undefined;
  if (season) {
    const exact = matched.find(
      (k) => (k.season || '').toLowerCase() === season,
    );
    if (exact?.body.trim()) return exact.body.trim();
  }
  const all = matched.find((k) => {
    const s = (k.season || 'all').toLowerCase();
    return s === 'all' || s === '' || s === 'year-round';
  });
  if (all?.body.trim()) return all.body.trim();
  return matched[0]?.body.trim() || undefined;
}

export function tripClimateSeason(
  startDate?: string | null,
  endDate?: string | null,
): TripClimateSeason | null {
  const start = parseIsoDateParts(startDate);
  if (!start) return null;
  const end = parseIsoDateParts(endDate) || start;
  if (start.year === end.year && start.month !== end.month) {
    const mid = Math.round((start.month + end.month) / 2);
    return climateSeasonFromMonth(mid);
  }
  return climateSeasonFromMonth(start.month);
}
