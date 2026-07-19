/** Sync payable CommercialDocument status from a supplier TripPayment settlement. */

export type CommercialDocumentPaidState = {
  amountPaid: number;
  status: 'open' | 'partial' | 'paid';
};

export function commercialDocumentPaidState(input: {
  amount: number;
  taxAmount?: number;
  amountPaid: number;
}): CommercialDocumentPaidState {
  const total = Math.round((Number(input.amount) + Number(input.taxAmount || 0)) * 100) / 100;
  const paid = Math.max(
    0,
    Math.min(total, Math.round(Number(input.amountPaid) * 100) / 100),
  );
  if (paid <= 0) return { amountPaid: 0, status: 'open' };
  if (paid + 0.001 >= total) return { amountPaid: paid, status: 'paid' };
  return { amountPaid: paid, status: 'partial' };
}

export const TRIP_PAYMENT_LINKED_ENTITY = 'trip_payment' as const;

export type SupplierPayableSettlePaymentRecord = {
  direction: 'outbound';
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  linkedEntityType: typeof TRIP_PAYMENT_LINKED_ENTITY;
  linkedEntityId: string;
  tripId: string;
  notes: string;
};

export function composeSupplierPayableSettlePaymentRecord(input: {
  tripPaymentId: string;
  tripId: string;
  amount: number;
  currency: string;
  method?: string | null;
  reference?: string | null;
  invoiceNumber?: string | null;
}): SupplierPayableSettlePaymentRecord {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  return {
    direction: 'outbound',
    amount,
    currency: (input.currency || 'INR').toUpperCase().slice(0, 3),
    method: input.method?.trim() || null,
    reference: input.reference?.trim() || null,
    linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
    linkedEntityId: input.tripPaymentId,
    tripId: input.tripId,
    notes: input.invoiceNumber?.trim()
      ? `Settled via trip payable · ${input.invoiceNumber.trim()}`
      : 'Settled via trip payable',
  };
}

/** Compose a receivable CommercialDocument for a customer trip instalment. */
export type CustomerReceivableCommercialDocumentCreate = {
  docType: 'invoice';
  direction: 'receivable';
  counterpartyPartyId: string | null;
  linkedEntityType: typeof TRIP_PAYMENT_LINKED_ENTITY;
  linkedEntityId: string;
  tripId: string;
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

export function composeCustomerReceivableCommercialDocument(input: {
  tripPaymentId: string;
  tripId: string;
  partyId?: string | null;
  label: string;
  amount: number;
  currency: string;
  dueAt?: string | null;
}): CustomerReceivableCommercialDocumentCreate {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const label = input.label.trim() || 'Customer instalment';
  const documentNumber = `AR-${input.tripPaymentId.slice(-8).toUpperCase()}`;
  return {
    docType: 'invoice',
    direction: 'receivable',
    counterpartyPartyId: input.partyId?.trim() || null,
    linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
    linkedEntityId: input.tripPaymentId,
    tripId: input.tripId,
    documentNumber,
    label: `Receivable · ${label}`,
    amount,
    currency: (input.currency || 'INR').toUpperCase().slice(0, 3),
    dueAt: input.dueAt?.trim() || null,
    notes: `Customer instalment · ${label} · ${documentNumber}`,
    lines: [
      {
        description: label,
        quantity: 1,
        unitAmount: amount,
      },
    ],
  };
}

export type CustomerReceivableSettlePaymentRecord = {
  direction: 'inbound';
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  linkedEntityType: typeof TRIP_PAYMENT_LINKED_ENTITY;
  linkedEntityId: string;
  tripId: string;
  notes: string;
};

export function composeCustomerReceivableSettlePaymentRecord(input: {
  tripPaymentId: string;
  tripId: string;
  amount: number;
  currency: string;
  method?: string | null;
  reference?: string | null;
  label?: string | null;
}): CustomerReceivableSettlePaymentRecord {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  return {
    direction: 'inbound',
    amount,
    currency: (input.currency || 'INR').toUpperCase().slice(0, 3),
    method: input.method?.trim() || null,
    reference: input.reference?.trim() || null,
    linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
    linkedEntityId: input.tripPaymentId,
    tripId: input.tripId,
    notes: input.label?.trim()
      ? `Settled via trip receivable · ${input.label.trim()}`
      : 'Settled via trip receivable',
  };
}
