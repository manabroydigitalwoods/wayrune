/** Compose customer-facing payment-link text for WhatsApp. */

export type PaymentLinkMessageInput = {
  agencyName: string;
  guestName?: string | null;
  tripNumber: string;
  tripTitle: string;
  label: string;
  amountDue: number;
  currency: string;
  dueAt?: string | null;
  payUrl: string;
};

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || 'INR'} ${Math.round(amount)}`;
  }
}

function fmtDay(iso?: string | null): string | null {
  if (!iso?.trim()) return null;
  const day = iso.trim().slice(0, 10);
  const d = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return day;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function composePaymentLinkWhatsappText(
  input: PaymentLinkMessageInput,
): string {
  const guest = input.guestName?.trim() || 'there';
  const due = fmtDay(input.dueAt);
  const lines = [
    `Hi ${guest},`,
    ``,
    `Payment request for ${input.tripNumber} (${input.tripTitle}):`,
    `• ${input.label}: ${fmtMoney(input.amountDue, input.currency)}`,
  ];
  if (due) lines.push(`• Due: ${due}`);
  lines.push(
    ``,
    `Pay securely here:`,
    input.payUrl,
    ``,
    `Reply here if you have any questions.`,
    `— ${input.agencyName.trim() || 'Travel agency'}`,
  );
  return lines.join('\n').slice(0, 3500);
}
