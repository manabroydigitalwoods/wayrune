/** Agency-scoped Document for a partner-uploaded confirmation file. */
export const PARTNER_CONFIRMATION_DOCUMENT_TYPE = 'partner_confirmation';
export const BOOKING_COMPONENT_ENTITY_TYPE = 'booking_component';

export function partnerConfirmationDocumentBinding(bookingId: string) {
  return {
    entityType: BOOKING_COMPONENT_ENTITY_TYPE,
    entityId: bookingId,
    documentType: PARTNER_CONFIRMATION_DOCUMENT_TYPE,
  } as const;
}

/** Allowed MIME types for a thin confirmation attach (PDF / image). */
export function isAllowedPartnerConfirmationMime(mimeType: string): boolean {
  const m = String(mimeType || '')
    .trim()
    .toLowerCase();
  return (
    m === 'application/pdf' ||
    m === 'image/jpeg' ||
    m === 'image/png' ||
    m === 'image/webp'
  );
}

export const MAX_PARTNER_CONFIRMATION_BYTES = 8 * 1024 * 1024;

/** Query path for agency Ops to list partner confirmation docs on a booking. */
export function partnerConfirmationFilesQuery(bookingId: string): string {
  const binding = partnerConfirmationDocumentBinding(bookingId);
  const qs = new URLSearchParams({
    entityType: binding.entityType,
    entityId: binding.entityId,
    documentType: binding.documentType,
  });
  return `/files?${qs.toString()}`;
}

/** Batch list query for many booking ids (repeated entityId). */
export function partnerConfirmationFilesBatchQuery(bookingIds: string[]): string {
  const qs = new URLSearchParams({
    entityType: BOOKING_COMPONENT_ENTITY_TYPE,
    documentType: PARTNER_CONFIRMATION_DOCUMENT_TYPE,
  });
  for (const id of bookingIds) {
    if (id.trim()) qs.append('entityId', id.trim());
  }
  return `/files?${qs.toString()}`;
}
