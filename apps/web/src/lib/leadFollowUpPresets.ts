import { formatDateShort, formatTime, type DateTimePrefs } from '@wayrune/ui';

export const LEAD_FOLLOW_UP_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'later_today', label: 'Later today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'in_3_days', label: 'In 3 days' },
  { value: 'next_week', label: 'Next week' },
] as const;

export function startOfLocalDay(d = new Date()) {
  const next = new Date(d);
  next.setHours(9, 0, 0, 0);
  return next;
}

/** Same calendar day as today; prefer 17:00, else next hour (never rolls to tomorrow). */
export function laterTodayFollowUp(now = new Date()): Date {
  const atFive = startOfLocalDay(now);
  atFive.setHours(17, 0, 0, 0);
  if (atFive.getTime() > now.getTime()) return atFive;
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  if (
    nextHour.getFullYear() === now.getFullYear() &&
    nextHour.getMonth() === now.getMonth() &&
    nextHour.getDate() === now.getDate()
  ) {
    return nextHour;
  }
  const endOfDay = startOfLocalDay(now);
  endOfDay.setHours(23, 0, 0, 0);
  return endOfDay;
}

export function followUpFromPreset(preset: string, now = new Date()): Date | undefined {
  const base = startOfLocalDay(now);
  if (preset === 'today') return base;
  if (preset === 'later_today') return laterTodayFollowUp(now);
  if (preset === 'tomorrow') {
    base.setDate(base.getDate() + 1);
    return base;
  }
  if (preset === 'in_3_days') {
    base.setDate(base.getDate() + 3);
    return base;
  }
  if (preset === 'next_week') {
    base.setDate(base.getDate() + 7);
    return base;
  }
  return undefined;
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function presetFromFollowUp(date?: Date, now = new Date()): string {
  if (!date) return '';
  for (const preset of LEAD_FOLLOW_UP_PRESETS) {
    const candidate = followUpFromPreset(preset.value, now);
    if (!candidate || !sameLocalDay(candidate, date)) continue;
    if (preset.value === 'later_today') {
      if (Math.abs(candidate.getTime() - date.getTime()) < 60 * 60 * 1000) return preset.value;
      continue;
    }
    if (preset.value === 'today') {
      // Same calendar day and not the “later today” window (afternoon/evening).
      if (date.getHours() < 16) return preset.value;
      continue;
    }
    return preset.value;
  }
  return 'custom';
}

/** Apply HH:mm onto a date (local). */
export function applyTimeToDate(date: Date, hhmm: string): Date {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  const next = new Date(date);
  if (!match) return next;
  next.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return next;
}

export function timeValueFromDate(date?: Date | null): string {
  if (!date) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export const TASK_DUE_TIME_PRESETS = [
  { value: '10:00', label: 'Morning' },
  { value: '14:00', label: 'Afternoon' },
  { value: '17:00', label: '5:00 PM' },
] as const;

export function followUpPresetLabel(
  preset: { value: string; label: string },
  at: Date,
  prefsOverride?: Partial<DateTimePrefs> | null,
) {
  if (preset.value === 'later_today') {
    return `${preset.label} · ${formatTime(at, '', prefsOverride)}`;
  }
  return `${preset.label} · ${formatDateShort(at, '', prefsOverride)}`;
}

export function followUpPresetOptions(
  selected?: Date,
  now = new Date(),
  prefsOverride?: Partial<DateTimePrefs> | null,
) {
  return [
    ...LEAD_FOLLOW_UP_PRESETS.map((preset) => {
      const at = followUpFromPreset(preset.value, now);
      return {
        value: preset.value,
        label: at ? followUpPresetLabel(preset, at, prefsOverride) : preset.label,
      };
    }),
    ...(selected && presetFromFollowUp(selected, now) === 'custom'
      ? [
          {
            value: 'custom',
            label: `Custom · ${formatDateShort(selected, '', prefsOverride)}`,
          },
        ]
      : []),
  ];
}
