/** Mirrors API `partner_confirmation` documents on booking_component. */
export const PARTNER_CONFIRMATION_DOCUMENT_TYPE = 'partner_confirmation';
export const BOOKING_COMPONENT_ENTITY_TYPE = 'booking_component';

export type PartnerConfirmationDoc = {
  id: string;
  name: string;
  mimeType?: string;
  createdAt?: string;
  documentType?: string;
  entityId?: string;
};

export function partnerConfirmationFilesPath(bookingId: string): string {
  const qs = new URLSearchParams({
    entityType: BOOKING_COMPONENT_ENTITY_TYPE,
    entityId: bookingId,
    documentType: PARTNER_CONFIRMATION_DOCUMENT_TYPE,
  });
  return `/files?${qs.toString()}`;
}

/** Batch path: repeated entityId for many bookings. */
export function partnerConfirmationFilesBatchPath(bookingIds: string[]): string {
  const qs = new URLSearchParams({
    entityType: BOOKING_COMPONENT_ENTITY_TYPE,
    documentType: PARTNER_CONFIRMATION_DOCUMENT_TYPE,
  });
  for (const id of bookingIds) {
    if (id.trim()) qs.append('entityId', id.trim());
  }
  return `/files?${qs.toString()}`;
}

/** Latest partner confirmation doc per booking (docs ordered newest-first). */
export function latestPartnerConfirmationByBookingId(
  docs: PartnerConfirmationDoc[],
): Map<string, PartnerConfirmationDoc> {
  const map = new Map<string, PartnerConfirmationDoc>();
  for (const doc of docs) {
    const bookingId = doc.entityId?.trim();
    if (!bookingId || map.has(bookingId)) continue;
    map.set(bookingId, doc);
  }
  return map;
}
