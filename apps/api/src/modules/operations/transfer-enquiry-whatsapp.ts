/** Compose supplier-facing transfer enquiry text for WhatsApp. */

export type TransferEnquiryMessageInput = {
  agencyName: string;
  supplierName: string;
  tripNumber: string;
  tripTitle: string;
  guestName?: string | null;
  bookingTitle: string;
  serviceDate?: string | null;
  fromPlaceName?: string | null;
  toPlaceName?: string | null;
  vehicleName?: string | null;
  vehicles?: number | null;
};

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

export function composeTransferEnquiryWhatsappText(
  input: TransferEnquiryMessageInput,
): string {
  const supplier = input.supplierName.trim() || 'Fleet';
  const guest = input.guestName?.trim() || 'our guests';
  const routeBits = [
    input.fromPlaceName?.trim() && input.toPlaceName?.trim()
      ? `${input.fromPlaceName.trim()} → ${input.toPlaceName.trim()}`
      : null,
    input.vehicleName?.trim() || null,
    input.vehicles != null && input.vehicles > 0
      ? `${input.vehicles} vehicle${input.vehicles === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean);

  const lines = [
    `Hi ${supplier},`,
    ``,
    `Transfer enquiry for trip ${input.tripNumber} (${input.tripTitle}) — ${guest}:`,
    `• ${input.bookingTitle}`,
  ];
  if (fmtDay(input.serviceDate)) {
    lines.push(`• Date: ${fmtDay(input.serviceDate)}`);
  }
  if (routeBits.length) lines.push(`• ${routeBits.join(' · ')}`);
  lines.push(
    ``,
    `Please confirm availability and rate. Reply here or with a confirmation reference.`,
    `— ${input.agencyName.trim() || 'Travel agency'}`,
  );
  return lines.join('\n').slice(0, 3500);
}
