import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';

/** Calendar day string used across list filters (local timezone). */
export type DateRangeYmd = {
  from: string | null;
  to: string | null;
};

export type DateRangeValue = DateRangeYmd & {
  presetId?: string | null;
};

export type DateRangePack = 'history' | 'forward';

export type DateRangePresetDef = {
  id: string;
  label: string;
};

const HISTORY_PRESETS: readonly DateRangePresetDef[] = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3_months', label: 'Last 3 months' },
  { id: 'last_6_months', label: 'Last 6 months' },
  { id: 'custom', label: 'Custom' },
] as const;

const FORWARD_PRESETS: readonly DateRangePresetDef[] = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'next_7', label: 'Next 7 days' },
  { id: 'next_30', label: 'Next 30 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'next_3_months', label: 'Next 3 months' },
  { id: 'custom', label: 'Custom' },
] as const;

export function dateRangePresetsForPack(pack: DateRangePack): readonly DateRangePresetDef[] {
  return pack === 'history' ? HISTORY_PRESETS : FORWARD_PRESETS;
}

export function formatYmd(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function atLocalNoon(date: Date): Date {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

/** Monday-start weeks to match ops planning language. */
function weekOpts() {
  return { weekStartsOn: 1 as const };
}

/**
 * Resolve a named preset to inclusive calendar from/to (local days).
 * `custom` and unknown ids return nulls (caller owns custom pickers).
 */
export function resolveDateRangePreset(
  presetId: string,
  pack: DateRangePack,
  now: Date = new Date(),
): DateRangeYmd {
  const today = atLocalNoon(now);

  if (presetId === 'custom') {
    return { from: null, to: null };
  }

  if (presetId === 'today') {
    const ymd = formatYmd(today);
    return { from: ymd, to: ymd };
  }

  if (presetId === 'this_week') {
    return {
      from: formatYmd(startOfWeek(today, weekOpts())),
      to: formatYmd(endOfWeek(today, weekOpts())),
    };
  }

  if (presetId === 'this_month') {
    return {
      from: formatYmd(startOfMonth(today)),
      to: formatYmd(endOfMonth(today)),
    };
  }

  if (pack === 'history') {
    if (presetId === 'last_week') {
      const prev = subWeeks(today, 1);
      return {
        from: formatYmd(startOfWeek(prev, weekOpts())),
        to: formatYmd(endOfWeek(prev, weekOpts())),
      };
    }
    if (presetId === 'last_month') {
      const prev = subMonths(today, 1);
      return {
        from: formatYmd(startOfMonth(prev)),
        to: formatYmd(endOfMonth(prev)),
      };
    }
    if (presetId === 'last_3_months') {
      // Inclusive: first day of month 2 months ago → end of this month
      // (covers ~3 calendar months ending now).
      const start = startOfMonth(subMonths(today, 2));
      return {
        from: formatYmd(start),
        to: formatYmd(endOfMonth(today)),
      };
    }
    if (presetId === 'last_6_months') {
      const start = startOfMonth(subMonths(today, 5));
      return {
        from: formatYmd(start),
        to: formatYmd(endOfMonth(today)),
      };
    }
  }

  if (pack === 'forward') {
    if (presetId === 'next_7') {
      return {
        from: formatYmd(today),
        to: formatYmd(addDays(today, 6)),
      };
    }
    if (presetId === 'next_30') {
      return {
        from: formatYmd(today),
        to: formatYmd(addDays(today, 29)),
      };
    }
    if (presetId === 'next_3_months') {
      const end = endOfMonth(addMonths(today, 2));
      return {
        from: formatYmd(startOfMonth(today)),
        to: formatYmd(end),
      };
    }
  }

  return { from: null, to: null };
}

export function dateRangePresetLabel(
  pack: DateRangePack,
  presetId: string | null | undefined,
): string | null {
  if (!presetId) return null;
  return dateRangePresetsForPack(pack).find((p) => p.id === presetId)?.label ?? null;
}

/** Compact trigger text for the control. */
export function formatDateRangeTriggerLabel(
  value: DateRangeValue,
  pack: DateRangePack,
  emptyLabel = 'All time',
): string {
  if (value.presetId && value.presetId !== 'custom') {
    const label = dateRangePresetLabel(pack, value.presetId);
    if (label) return label;
  }
  if (value.from && value.to) {
    if (value.from === value.to) return value.from;
    return `${value.from} → ${value.to}`;
  }
  if (value.from) return `From ${value.from}`;
  if (value.to) return `Until ${value.to}`;
  return emptyLabel;
}

export function parseYmd(ymd: string | null | undefined): Date | undefined {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return atLocalNoon(new Date(y, m - 1, d));
}

export function isDateRangeEmpty(value: DateRangeValue | null | undefined): boolean {
  if (!value) return true;
  return !value.from && !value.to && (!value.presetId || value.presetId === 'custom');
}
