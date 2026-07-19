/** Compose supplier-facing hotel enquiry text for WhatsApp. */

export type HotelEnquiryMessageInput = {
  agencyName: string;
  hotelName: string;
  tripNumber: string;
  tripTitle: string;
  guestName?: string | null;
  bookingTitle: string;
  checkIn?: string | null;
  checkOut?: string | null;
  rooms?: number | null;
  roomType?: string | null;
  mealPlan?: string | null;
  nights?: number | null;
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

export function composeHotelEnquiryWhatsappText(
  input: HotelEnquiryMessageInput,
): string {
  const hotel = input.hotelName.trim() || 'Hotel';
  const guest = input.guestName?.trim() || 'our guests';
  const stayBits = [
    fmtDay(input.checkIn) && fmtDay(input.checkOut)
      ? `${fmtDay(input.checkIn)} → ${fmtDay(input.checkOut)}`
      : fmtDay(input.checkIn)
        ? `From ${fmtDay(input.checkIn)}`
        : null,
    input.nights != null && input.nights > 0
      ? `${input.nights} night${input.nights === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean);
  const roomBits = [
    input.rooms != null && input.rooms > 0
      ? `${input.rooms} room${input.rooms === 1 ? '' : 's'}`
      : null,
    input.roomType?.trim() || null,
    input.mealPlan?.trim() || null,
  ].filter(Boolean);

  const lines = [
    `Hi ${hotel},`,
    ``,
    `Room enquiry for trip ${input.tripNumber} (${input.tripTitle}) — ${guest}:`,
    `• ${input.bookingTitle}`,
  ];
  if (stayBits.length) lines.push(`• Stay: ${stayBits.join(' · ')}`);
  if (roomBits.length) lines.push(`• ${roomBits.join(' · ')}`);
  lines.push(
    ``,
    `Please confirm availability and rate. Reply here or with a confirmation reference.`,
    `— ${input.agencyName.trim() || 'Travel agency'}`,
  );
  return lines.join('\n').slice(0, 3500);
}

/** Prefer digits Meta accepts; keep India 10-digit mobiles usable. */
export function normalizeWhatsappPhone(waId: string): string | null {
  const digits = waId.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}
