/** Compose a payable CommercialDocument for a confirmed hotel booking. */

export const HOTEL_PAYABLE_LINKED_ENTITY = 'booking_component' as const;

export type HotelPayableCommercialDocumentInput = {
  bookingId: string;
  tripId: string;
  supplierId: string;
  serviceRequestId?: string | null;
  bookingTitle: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueAt?: string | null;
  notes?: string | null;
};

export type HotelPayableCommercialDocumentCreate = {
  docType: 'invoice';
  direction: 'payable';
  supplierId: string;
  linkedEntityType: typeof HOTEL_PAYABLE_LINKED_ENTITY;
  linkedEntityId: string;
  tripId: string;
  serviceRequestId: string | null;
  documentNumber: string;
  label: string;
  amount: number;
  currency: string;
  dueAt: string | null;
  notes: string | null;
  lines: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
  }>;
};

export function composeHotelPayableCommercialDocument(
  input: HotelPayableCommercialDocumentInput,
): HotelPayableCommercialDocumentCreate {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const title = input.bookingTitle.trim() || 'Hotel booking';
  const invoiceNumber = input.invoiceNumber.trim();
  return {
    docType: 'invoice',
    direction: 'payable',
    supplierId: input.supplierId,
    linkedEntityType: HOTEL_PAYABLE_LINKED_ENTITY,
    linkedEntityId: input.bookingId,
    tripId: input.tripId,
    serviceRequestId: input.serviceRequestId?.trim() || null,
    documentNumber: invoiceNumber,
    label: `Payable · ${title}`,
    amount,
    currency: (input.currency || 'INR').toUpperCase().slice(0, 3),
    dueAt: input.dueAt?.trim() || null,
    notes:
      input.notes?.trim() ||
      `Auto payable on confirm · ${title} · ${invoiceNumber}`,
    lines: [
      {
        description: title,
        quantity: 1,
        unitAmount: amount,
      },
    ],
  };
}
