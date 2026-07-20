/** Parse common B2B / travel payment terms into calendar due dates. */

export type PaymentTermsDueRule =
  | { kind: 'offset'; days: number }
  | { kind: 'trip_start' };

/**
 * Recognize Net N, Pay on confirm, COD/immediate, Due in N days,
 * Before travel / On arrival (trip-start relative).
 */
export function parsePaymentTermsDueRule(
  terms: string | null | undefined,
): PaymentTermsDueRule | null {
  const raw = terms?.trim();
  if (!raw) return null;
  const t = raw.replace(/\s+/g, ' ');

  const net = t.match(/^net\s*(\d{1,3})$/i);
  if (net) {
    const days = Number(net[1]);
    return Number.isFinite(days) && days >= 0 ? { kind: 'offset', days } : null;
  }

  if (/^pay\s*on\s*confirm$/i.test(t)) {
    return { kind: 'offset', days: 0 };
  }

  if (
    /^(cod|c\.?o\.?d\.?)$/i.test(t) ||
    /^cash(\s+on\s+delivery)?$/i.test(t) ||
    /^(due\s+)?(today|immediately|immediate)$/i.test(t)
  ) {
    return { kind: 'offset', days: 0 };
  }

  const dueIn = t.match(/^(?:due\s+in|within)\s+(\d{1,3})\s*days?$/i);
  if (dueIn) {
    const days = Number(dueIn[1]);
    return Number.isFinite(days) && days >= 0 ? { kind: 'offset', days } : null;
  }

  const bareDays = t.match(/^(\d{1,3})\s*days?$/i);
  if (bareDays) {
    const days = Number(bareDays[1]);
    return Number.isFinite(days) && days >= 0 ? { kind: 'offset', days } : null;
  }

  if (
    /^(due\s+)?(before|prior\s+to)\s+travel$/i.test(t) ||
    /^(due\s+)?on\s+(arrival|departure)$/i.test(t) ||
    /^upon\s+arrival$/i.test(t)
  ) {
    return { kind: 'trip_start' };
  }

  return null;
}

/**
 * Offset days for Net-style terms only. Trip-relative terms return null
 * (callers that need them should use parsePaymentTermsDueRule).
 */
export function parsePaymentTermsNetDays(
  terms: string | null | undefined,
): number | null {
  const rule = parsePaymentTermsDueRule(terms);
  return rule?.kind === 'offset' ? rule.days : null;
}

export function dueDateFromPaymentTerms(
  terms: string | null | undefined,
  fromDate: Date = new Date(),
  tripStartDate?: string | Date | null,
): Date | null {
  const rule = parsePaymentTermsDueRule(terms);
  if (!rule) return null;

  if (rule.kind === 'trip_start') {
    const start = asLocalDate(tripStartDate);
    if (!start) return null;
    return start;
  }

  return new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate() + rule.days,
  );
}

export function formatPaymentTermsDueDate(
  terms: string | null | undefined,
  fromDate: Date = new Date(),
  tripStartDate?: string | Date | null,
): string | null {
  const due = dueDateFromPaymentTerms(terms, fromDate, tripStartDate);
  if (!due) return null;
  return formatLocalDate(due);
}

export function paymentTermsDueCue(
  terms: string | null | undefined,
  fromDate: Date = new Date(),
  tripStartDate?: string | Date | null,
): string | null {
  const raw = terms?.trim();
  if (!raw) return null;
  const rule = parsePaymentTermsDueRule(raw);
  if (!rule) {
    return `Payment terms: ${raw} (due date not auto-calculated)`;
  }
  if (rule.kind === 'trip_start') {
    const due = formatPaymentTermsDueDate(raw, fromDate, tripStartDate);
    return due
      ? `Payment terms: ${raw} → due ${due} (travel start)`
      : `Payment terms: ${raw} (set travel dates to auto-calculate due)`;
  }
  const due = formatPaymentTermsDueDate(raw, fromDate, tripStartDate);
  if (rule.days === 0) {
    return `Payment terms: ${raw} (due today)`;
  }
  return due
    ? `Payment terms: ${raw} → due ${due}`
    : `Payment terms: ${raw}`;
}

function asLocalDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return null;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
