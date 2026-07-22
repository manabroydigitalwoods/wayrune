import { formatDateShort, formatTime, parseAppDate } from '@wayrune/ui';

export type LeadFollowUpTone = 'danger' | 'warn' | 'muted' | 'default';

export type LeadFollowUpDisplay = {
  label: string;
  tone: LeadFollowUpTone;
  sortValue: number;
};

function startOfLocalDay(d: Date) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function calendarDaysBetween(from: Date, to: Date) {
  const a = startOfLocalDay(from).getTime();
  const b = startOfLocalDay(to).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** Human follow-up label for the Leads table. */
export function formatLeadFollowUp(
  followUpAt?: string | Date | null,
  now = new Date(),
): LeadFollowUpDisplay {
  if (followUpAt == null || followUpAt === '') {
    return { label: 'Not scheduled', tone: 'muted', sortValue: Number.POSITIVE_INFINITY };
  }
  const due = parseAppDate(followUpAt);
  if (!due) {
    return { label: 'Not scheduled', tone: 'muted', sortValue: Number.POSITIVE_INFINITY };
  }

  const dayDelta = calendarDaysBetween(now, due);
  if (dayDelta < 0) {
    const days = Math.abs(dayDelta);
    return {
      label: days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`,
      tone: 'danger',
      sortValue: due.getTime(),
    };
  }
  if (dayDelta === 0) {
    const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
    if (hasTime && due.getTime() < now.getTime()) {
      const mins = Math.max(1, Math.round((now.getTime() - due.getTime()) / 60_000));
      if (mins < 60) {
        return {
          label: mins === 1 ? 'Overdue by 1 min' : `Overdue by ${mins} min`,
          tone: 'danger',
          sortValue: due.getTime(),
        };
      }
      const hours = Math.round(mins / 60);
      return {
        label: hours === 1 ? 'Overdue by 1 hour' : `Overdue by ${hours} hours`,
        tone: 'danger',
        sortValue: due.getTime(),
      };
    }
    const label = hasTime ? `Today · ${formatTime(due)}` : 'Due today';
    return {
      label,
      tone: 'warn',
      sortValue: due.getTime(),
    };
  }
  if (dayDelta === 1) {
    const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
    return {
      label: hasTime ? `Tomorrow · ${formatTime(due)}` : 'Tomorrow',
      tone: 'default',
      sortValue: due.getTime(),
    };
  }
  return {
    label: formatDateShort(due),
    tone: 'default',
    sortValue: due.getTime(),
  };
}

/** Acquisition source only — hide system creation channels from the Source column. */
const SYSTEM_SOURCE_KEYS = new Set(['manual', 'csv', 'existing_customer']);

export function formatLeadSourceName(source?: {
  name?: string | null;
  key?: string | null;
} | null): string {
  if (!source) return '—';
  if (source.key && SYSTEM_SOURCE_KEYS.has(source.key)) return '—';
  const name = source.name?.trim();
  if (!name) return '—';
  // Defensive: some orgs label keys oddly in `name`.
  if (/^(manual|csv import|existing customer)$/i.test(name)) return '—';
  return name;
}

export function ownerInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export function ownerShortName(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean)[0] || fullName.trim();
}
