/** Compose supplier-facing activity enquiry text for WhatsApp. */

export type ActivityEnquiryMessageInput = {
  agencyName: string;
  supplierName: string;
  tripNumber: string;
  tripTitle: string;
  guestName?: string | null;
  bookingTitle: string;
  serviceDate?: string | null;
  placeName?: string | null;
  privateOrSic?: string | null;
  adults?: number | null;
  children?: number | null;
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

export function composeActivityEnquiryWhatsappText(
  input: ActivityEnquiryMessageInput,
): string {
  const supplier = input.supplierName.trim() || 'Activity desk';
  const guest = input.guestName?.trim() || 'our guests';
  const paxBits = [
    input.adults != null && input.adults > 0
      ? `${input.adults} adult${input.adults === 1 ? '' : 's'}`
      : null,
    input.children != null && input.children > 0
      ? `${input.children} child${input.children === 1 ? '' : 'ren'}`
      : null,
    input.privateOrSic === 'private' || input.privateOrSic === 'sic'
      ? input.privateOrSic.toUpperCase()
      : null,
  ].filter(Boolean);

  const lines = [
    `Hi ${supplier},`,
    ``,
    `Activity enquiry for trip ${input.tripNumber} (${input.tripTitle}) — ${guest}:`,
    `• ${input.bookingTitle}`,
  ];
  if (fmtDay(input.serviceDate)) {
    lines.push(`• Date: ${fmtDay(input.serviceDate)}`);
  }
  if (input.placeName?.trim()) {
    lines.push(`• Place: ${input.placeName.trim()}`);
  }
  if (paxBits.length) lines.push(`• ${paxBits.join(' · ')}`);
  lines.push(
    ``,
    `Please confirm availability and rate. Reply here or with a confirmation reference.`,
    `— ${input.agencyName.trim() || 'Travel agency'}`,
  );
  return lines.join('\n').slice(0, 3500);
}
