/** Parse common B2B payment terms like "Net 15" into calendar due dates. */

export function parsePaymentTermsNetDays(
  terms: string | null | undefined,
): number | null {
  const raw = terms?.trim();
  if (!raw) return null;
  const net = raw.match(/^net\s*(\d{1,3})$/i);
  if (net) {
    const days = Number(net[1]);
    return Number.isFinite(days) && days >= 0 ? days : null;
  }
  const onConfirm = /^pay\s*on\s*confirm$/i.test(raw);
  if (onConfirm) return 0;
  return null;
}

export function dueDateFromPaymentTerms(
  terms: string | null | undefined,
  fromDate: Date = new Date(),
): Date | null {
  const days = parsePaymentTermsNetDays(terms);
  if (days == null) return null;
  return new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate() + days,
  );
}

export function formatPaymentTermsDueDate(
  terms: string | null | undefined,
  fromDate: Date = new Date(),
): string | null {
  const due = dueDateFromPaymentTerms(terms, fromDate);
  if (!due) return null;
  const y = due.getFullYear();
  const m = String(due.getMonth() + 1).padStart(2, '0');
  const d = String(due.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function paymentTermsDueCue(
  terms: string | null | undefined,
  fromDate: Date = new Date(),
): string | null {
  const raw = terms?.trim();
  if (!raw) return null;
  const days = parsePaymentTermsNetDays(raw);
  if (days == null) {
    return `Payment terms: ${raw} (due date not auto-calculated)`;
  }
  const due = formatPaymentTermsDueDate(raw, fromDate);
  if (days === 0) return 'Payment terms: Pay on confirm (due today)';
  return due
    ? `Payment terms: ${raw} → due ${due}`
    : `Payment terms: ${raw}`;
}
