/** Default locale for day–month–year English display. */
export const DATETIME_LOCALE = 'en-GB';

export type DateFormatId = 'd_mmm_yyyy' | 'dd_mm_yyyy' | 'mm_dd_yyyy' | 'yyyy_mm_dd';
export type TimeFormatId = 'h24' | 'h12';

export type DateTimePrefs = {
  dateFormat: DateFormatId;
  timeFormat: TimeFormatId;
};

export const DEFAULT_DATETIME_PREFS: DateTimePrefs = {
  dateFormat: 'd_mmm_yyyy',
  timeFormat: 'h24',
};

export const DATE_FORMAT_OPTIONS: { id: DateFormatId; label: string }[] = [
  { id: 'd_mmm_yyyy', label: '14 Jul 2026' },
  { id: 'dd_mm_yyyy', label: '14/07/2026' },
  { id: 'mm_dd_yyyy', label: '07/14/2026' },
  { id: 'yyyy_mm_dd', label: '2026-07-14' },
];

export const TIME_FORMAT_OPTIONS: { id: TimeFormatId; label: string }[] = [
  { id: 'h24', label: '14:30 (24-hour)' },
  { id: 'h12', label: '2:30 PM (12-hour)' },
];

let activePrefs: DateTimePrefs = { ...DEFAULT_DATETIME_PREFS };

export function getDateTimePrefs(): DateTimePrefs {
  return { ...activePrefs };
}

export function setDateTimePrefs(prefs: Partial<DateTimePrefs> | null | undefined) {
  activePrefs = {
    dateFormat: prefs?.dateFormat ?? DEFAULT_DATETIME_PREFS.dateFormat,
    timeFormat: prefs?.timeFormat ?? DEFAULT_DATETIME_PREFS.timeFormat,
  };
  return getDateTimePrefs();
}

export function resolveDateTimePrefs(
  overrides?: Partial<DateTimePrefs> | null,
): DateTimePrefs {
  if (!overrides) return prefs();
  return {
    dateFormat: overrides.dateFormat ?? activePrefs.dateFormat,
    timeFormat: overrides.timeFormat ?? activePrefs.timeFormat,
  };
}

function prefs(): DateTimePrefs {
  return activePrefs;
}

function dateLocale(format: DateFormatId): string {
  switch (format) {
    case 'mm_dd_yyyy':
      return 'en-US';
    case 'yyyy_mm_dd':
      return 'en-CA';
    case 'dd_mm_yyyy':
    case 'd_mmm_yyyy':
    default:
      return DATETIME_LOCALE;
  }
}

function dateOpts(
  format: DateFormatId,
  parts: 'full' | 'short' | 'monthYear',
): Intl.DateTimeFormatOptions {
  if (parts === 'monthYear') {
    return { month: 'long', year: 'numeric' };
  }
  if (format === 'd_mmm_yyyy') {
    return parts === 'short'
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
  }
  if (format === 'yyyy_mm_dd') {
    return parts === 'short'
      ? { month: '2-digit', day: '2-digit' }
      : { year: 'numeric', month: '2-digit', day: '2-digit' };
  }
  return parts === 'short'
    ? { day: '2-digit', month: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
}

function timeOpts(format: TimeFormatId): Intl.DateTimeFormatOptions {
  return {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: format === 'h12' ? 'h12' : 'h23',
  };
}

/**
 * Parse API / form date values safely.
 * Date-only `YYYY-MM-DD` is treated as a calendar date (noon local) to avoid
 * timezone day-shift when formatting.
 */
export function parseAppDate(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emptyFallback(fallback: string) {
  return fallback;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Format a clock from hours/minutes using active time preference. */
function formatClockHm(h: number, m: number, timeFormat: TimeFormatId): string {
  if (timeFormat === 'h24') {
    return `${pad2(h)}:${pad2(m)}`;
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad2(m)} ${ampm}`;
}

function formatDateWith(
  d: Date,
  dateFormat: DateFormatId,
  parts: 'full' | 'short' | 'monthYear' = 'full',
  withWeekday = false,
): string {
  return new Intl.DateTimeFormat(dateLocale(dateFormat), {
    ...(withWeekday ? { weekday: 'short' as const } : {}),
    ...dateOpts(dateFormat, parts),
  }).format(d);
}

/** Date using org display prefs (default `14 Jul 2026`). */
export function formatDate(
  value: string | number | Date | null | undefined,
  fallback = '—',
  prefsOverride?: Partial<DateTimePrefs> | null,
): string {
  const d = parseAppDate(value);
  if (!d) return emptyFallback(fallback);
  return formatDateWith(d, resolveDateTimePrefs(prefsOverride).dateFormat, 'full');
}

/** Compact date without year (default `14 Jul`). */
export function formatDateShort(
  value: string | number | Date | null | undefined,
  fallback = '—',
  prefsOverride?: Partial<DateTimePrefs> | null,
): string {
  const d = parseAppDate(value);
  if (!d) return emptyFallback(fallback);
  return formatDateWith(d, resolveDateTimePrefs(prefsOverride).dateFormat, 'short');
}

/** Weekday + date (default `Wed, 14 Jul 2026`). */
export function formatDateWithWeekday(
  value: string | number | Date | null | undefined,
  fallback = '—',
  prefsOverride?: Partial<DateTimePrefs> | null,
): string {
  const d = parseAppDate(value);
  if (!d) return emptyFallback(fallback);
  return formatDateWith(d, resolveDateTimePrefs(prefsOverride).dateFormat, 'full', true);
}

/** Itinerary day chip (default `Wed 14 Jul`). */
export function formatDayLabel(
  value: string | number | Date | null | undefined,
  prefsOverride?: Partial<DateTimePrefs> | null,
): string | null {
  const d = parseAppDate(value);
  if (!d) return null;
  return formatDateWith(d, resolveDateTimePrefs(prefsOverride).dateFormat, 'short', true);
}

/** Month bucket: `July 2026` */
export function formatMonthYear(
  value: string | number | Date | null | undefined,
  fallback = '—',
  prefsOverride?: Partial<DateTimePrefs> | null,
): string {
  const d = parseAppDate(value);
  if (!d) return emptyFallback(fallback);
  return formatDateWith(d, resolveDateTimePrefs(prefsOverride).dateFormat, 'monthYear');
}

/**
 * Time using org display prefs (default 24h `14:30`).
 * Also accepts already-normalized `HH:mm` / `HH:mm:ss` strings.
 */
export function formatTime(
  value: string | number | Date | null | undefined,
  fallback = '—',
  prefsOverride?: Partial<DateTimePrefs> | null,
): string {
  if (value == null || value === '') return emptyFallback(fallback);
  const { timeFormat } = resolveDateTimePrefs(prefsOverride);
  if (typeof value === 'string') {
    const hm = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hm) {
      const h = Number(hm[1]);
      const m = Number(hm[2]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return formatClockHm(h, m, timeFormat);
      }
    }
  }
  const d = parseAppDate(value);
  if (!d) return emptyFallback(fallback);
  return new Intl.DateTimeFormat(DATETIME_LOCALE, timeOpts(timeFormat)).format(d);
}

/** Date + time using org display prefs. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  fallback = '—',
  prefsOverride?: Partial<DateTimePrefs> | null,
): string {
  const d = parseAppDate(value);
  if (!d) return emptyFallback(fallback);
  const { dateFormat, timeFormat } = resolveDateTimePrefs(prefsOverride);
  return new Intl.DateTimeFormat(dateLocale(dateFormat), {
    ...dateOpts(dateFormat, 'full'),
    ...timeOpts(timeFormat),
  }).format(d);
}

/** Inclusive range (same-day collapses). */
export function formatDateRange(
  start: string | number | Date | null | undefined,
  end?: string | number | Date | null | undefined,
  fallback = '—',
  prefsOverride?: Partial<DateTimePrefs> | null,
): string {
  const a = formatDate(start, '', prefsOverride);
  const b = formatDate(end, '', prefsOverride);
  if (!a && !b) return emptyFallback(fallback);
  if (a && b && a === b) return a;
  if (a && b) return `${a} – ${b}`;
  return a || b || emptyFallback(fallback);
}

/** Clock range for itinerary items. */
export function formatTimeRange(
  start?: string | null,
  end?: string | null,
  prefsOverride?: Partial<DateTimePrefs> | null,
): string | null {
  const a = start ? formatTime(start, '', prefsOverride) : '';
  const b = end ? formatTime(end, '', prefsOverride) : '';
  if (!a && !b) return null;
  if (a && b && a !== b) return `${a} – ${b}`;
  return a || b || null;
}
