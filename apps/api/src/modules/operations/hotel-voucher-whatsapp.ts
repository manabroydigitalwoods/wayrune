/** Compose customer-facing voucher summary for WhatsApp / email (bulk). */

export type HotelVoucherLine = {
  /** Defaults to hotel when omitted (backward compatible). */
  type?: 'hotel' | 'transfer' | 'activity';
  /** Display name: hotel, transfer operator, or activity title. */
  hotelName: string;
  confirmationRef?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  serviceDate?: string | null;
  /** Transfer corridor e.g. "Bagdogra → Darjeeling". */
  routeLabel?: string | null;
  activityName?: string | null;
  placeName?: string | null;
  voucherNote?: string | null;
};

export type HotelVoucherMessageInput = {
  agencyName: string;
  guestName?: string | null;
  tripNumber: string;
  tripTitle: string;
  hotels: HotelVoucherLine[];
  /** When Cloud will attach PDF documents after this text. */
  pdfAttached?: boolean;
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

function voucherBullet(h: HotelVoucherLine): string {
  const type = h.type || 'hotel';
  if (type === 'transfer') {
    const bits: string[] = [
      h.routeLabel?.trim() || h.hotelName.trim() || 'Transfer',
    ];
    if (h.routeLabel?.trim() && h.hotelName.trim()) {
      bits.push(h.hotelName.trim());
    }
    const day = fmtDay(h.serviceDate) || fmtDay(h.checkIn);
    if (day) bits.push(day);
    if (h.confirmationRef?.trim()) bits.push(`conf ${h.confirmationRef.trim()}`);
    return `• ${bits.join(' · ')}`;
  }
  if (type === 'activity') {
    const bits: string[] = [
      h.activityName?.trim() || h.hotelName.trim() || 'Activity',
    ];
    if (h.placeName?.trim()) bits.push(h.placeName.trim());
    const day = fmtDay(h.serviceDate) || fmtDay(h.checkIn);
    if (day) bits.push(day);
    if (h.confirmationRef?.trim()) bits.push(`conf ${h.confirmationRef.trim()}`);
    return `• ${bits.join(' · ')}`;
  }
  const bits: string[] = [h.hotelName.trim() || 'Hotel'];
  const from = fmtDay(h.checkIn);
  const to = fmtDay(h.checkOut);
  if (from && to) bits.push(`${from} → ${to}`);
  else if (from) bits.push(`from ${from}`);
  if (h.confirmationRef?.trim()) bits.push(`conf ${h.confirmationRef.trim()}`);
  return `• ${bits.join(' · ')}`;
}

export function composeHotelVouchersWhatsappText(
  input: HotelVoucherMessageInput,
): string {
  const guest = input.guestName?.trim() || 'there';
  const count = input.hotels.length;
  const lines = [
    `Hi ${guest},`,
    ``,
    count === 1
      ? `Your voucher is ready for ${input.tripNumber} (${input.tripTitle}):`
      : `Your vouchers are ready for ${input.tripNumber} (${input.tripTitle}):`,
  ];
  for (const h of input.hotels) {
    lines.push(voucherBullet(h));
  }
  lines.push(
    ``,
    input.pdfAttached
      ? `Please keep the PDF voucher${count === 1 ? '' : 's'} below for your trip. Reply here if you have any questions.`
      : `Please keep this for your trip. Reply here if you need the PDF voucher or have any questions.`,
    `— ${input.agencyName.trim() || 'Travel agency'}`,
  );
  return lines.join('\n').slice(0, 3500);
}

/** Max voucher PDFs attached per Cloud WhatsApp / email send. */
export const MAX_VOUCHER_PDF_ATTACHMENTS = 5;

export function composeHotelVouchersEmailBody(input: HotelVoucherMessageInput): {
  subject: string;
  body: string;
} {
  const guest = input.guestName?.trim() || 'there';
  const count = input.hotels.length;
  const subject =
    count === 1
      ? `Voucher — ${input.tripNumber} · ${input.tripTitle}`
      : `Vouchers — ${input.tripNumber} · ${input.tripTitle}`;
  const lines = [
    `Hi ${guest},`,
    ``,
    count === 1
      ? `Please find attached your voucher for ${input.tripNumber} (${input.tripTitle}).`
      : `Please find attached your vouchers for ${input.tripNumber} (${input.tripTitle}).`,
    ``,
  ];
  for (const h of input.hotels) {
    lines.push(voucherBullet(h));
  }
  lines.push(
    ``,
    `Please keep ${count === 1 ? 'this' : 'these'} for your trip. Reply to this email if you have any questions.`,
    ``,
    `— ${input.agencyName.trim() || 'Travel agency'}`,
  );
  return {
    subject,
    body: lines.join('\n').slice(0, 8000),
  };
}

export function isEligibleHotelVoucherBooking(b: {
  type: string;
  status: string;
  voucherNote?: string | null;
}): boolean {
  return (
    (b.type === 'hotel' || b.type === 'transfer' || b.type === 'activity') &&
    b.status === 'confirmed' &&
    Boolean(b.voucherNote?.trim())
  );
}

/** Eligible vouchered bookings for Mark-as-sent (optional id subset). */
export function selectVoucherBookingsForMarkSent<
  T extends {
    id: string;
    type: string;
    status: string;
    voucherNote?: string | null;
  },
>(bookings: T[], bookingIds?: string[] | null): T[] {
  const eligible = bookings.filter(isEligibleHotelVoucherBooking);
  if (!bookingIds?.length) return eligible;
  const want = new Set(bookingIds);
  return eligible.filter((b) => want.has(b.id));
}

/** Map a booking + travellerRequirementsJson into a voucher message line. */
export function voucherLineFromBooking(b: {
  type: string;
  title: string;
  confirmationRef?: string | null;
  voucherNote?: string | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  supplierName?: string | null;
  travellerRequirementsJson?: unknown;
}): HotelVoucherLine {
  const req =
    b.travellerRequirementsJson &&
    typeof b.travellerRequirementsJson === 'object' &&
    !Array.isArray(b.travellerRequirementsJson)
      ? (b.travellerRequirementsJson as Record<string, unknown>)
      : {};
  const str = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const dayFrom = (v: Date | string | null | undefined) => {
    if (!v) return null;
    if (typeof v === 'string') return v.slice(0, 10);
    return v.toISOString().slice(0, 10);
  };
  const type =
    b.type === 'transfer' || b.type === 'activity' || b.type === 'hotel'
      ? b.type
      : 'hotel';
  const supplierOrTitle =
    b.supplierName?.trim() ||
    b.title?.split('·')[0]?.trim() ||
    b.title;

  if (type === 'transfer') {
    const from = str(req.fromPlaceName);
    const to = str(req.toPlaceName);
    return {
      type: 'transfer',
      hotelName: supplierOrTitle,
      routeLabel: from && to ? `${from} → ${to}` : from || to || null,
      serviceDate: str(req.serviceDate) || dayFrom(b.startAt),
      checkIn: dayFrom(b.startAt),
      confirmationRef: b.confirmationRef,
      voucherNote: b.voucherNote,
    };
  }
  if (type === 'activity') {
    return {
      type: 'activity',
      hotelName: supplierOrTitle,
      activityName: str(req.activityName) || b.title?.trim() || 'Activity',
      placeName: str(req.placeName),
      serviceDate: str(req.serviceDate) || dayFrom(b.startAt),
      checkIn: dayFrom(b.startAt),
      confirmationRef: b.confirmationRef,
      voucherNote: b.voucherNote,
    };
  }
  return {
    type: 'hotel',
    hotelName: supplierOrTitle,
    confirmationRef: b.confirmationRef,
    checkIn: str(req.checkIn) || dayFrom(b.startAt),
    checkOut: str(req.checkOut) || dayFrom(b.endAt),
    voucherNote: b.voucherNote,
  };
}
