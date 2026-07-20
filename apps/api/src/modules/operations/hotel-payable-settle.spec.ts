import { describe, expect, it } from 'vitest';
import {
  commercialDocumentPaidState,
  composeCustomerReceivableCommercialDocument,
  composeCustomerReceivableSettlePaymentRecord,
  composeSupplierPayableSettlePaymentRecord,
  TRIP_PAYMENT_LINKED_ENTITY,
} from './hotel-payable-settle';
describe('composeCustomerReceivableCommercialDocument', () => {
  it('builds a receivable invoice for a customer instalment', () => {
    const doc = composeCustomerReceivableCommercialDocument({
      tripPaymentId: 'tp-balance-01',
      tripId: 'trip-1',
      partyId: 'party-1',
      label: 'Balance',
      amount: 45000,
      currency: 'inr',
      dueAt: '2026-06-01T00:00:00.000Z',
    });
    expect(doc).toMatchObject({
      docType: 'invoice',
      direction: 'receivable',
      counterpartyPartyId: 'party-1',
      linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
      linkedEntityId: 'tp-balance-01',
      amount: 45000,
      taxAmount: 0,
      currency: 'INR',
    });
    expect(doc.label).toContain('Receivable');
    expect(doc.documentNumber).toMatch(/^AR-/);
  });

  it('splits tax-inclusive instalment into net + taxAmount', () => {
    const doc = composeCustomerReceivableCommercialDocument({
      tripPaymentId: 'tp-tax-01',
      tripId: 'trip-1',
      label: 'Deposit',
      amount: 55000,
      currency: 'INR',
      taxAmount: 5000,
      taxNotes: 'CGST ₹2,500 · SGST ₹2,500 · display only',
    });
    expect(doc.amount).toBe(50000);
    expect(doc.taxAmount).toBe(5000);
    expect(doc.lines[0]).toMatchObject({
      unitAmount: 50000,
      taxAmount: 5000,
    });
    expect(doc.notes).toMatch(/CGST/);
    expect(doc.amount + doc.taxAmount).toBe(55000);
  });
});

describe('composeCustomerReceivableSettlePaymentRecord', () => {
  it('links an inbound payment to the trip payment', () => {
    const row = composeCustomerReceivableSettlePaymentRecord({
      tripPaymentId: 'tp-1',
      tripId: 'trip-1',
      amount: 21000,
      currency: 'INR',
      method: 'card',
      label: 'Balance',
    });
    expect(row).toMatchObject({
      direction: 'inbound',
      amount: 21000,
      linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
      linkedEntityId: 'tp-1',
    });
    expect(row.notes).toContain('Balance');
  });
});

describe('commercialDocumentPaidState', () => {
  it('marks open / partial / paid from amountPaid', () => {
    expect(
      commercialDocumentPaidState({ amount: 1000, amountPaid: 0 }),
    ).toEqual({ amountPaid: 0, status: 'open' });
    expect(
      commercialDocumentPaidState({ amount: 1000, amountPaid: 400 }),
    ).toEqual({ amountPaid: 400, status: 'partial' });
    expect(
      commercialDocumentPaidState({ amount: 1000, taxAmount: 180, amountPaid: 1180 }),
    ).toEqual({ amountPaid: 1180, status: 'paid' });
  });
});

describe('composeSupplierPayableSettlePaymentRecord', () => {
  it('links an outbound payment to the trip payment', () => {
    const row = composeSupplierPayableSettlePaymentRecord({
      tripPaymentId: 'tp-1',
      tripId: 'trip-1',
      amount: 9000,
      currency: 'inr',
      method: 'upi',
      reference: 'UTR-1',
      invoiceNumber: 'AUTO-SEED-HTL',
    });
    expect(row).toMatchObject({
      direction: 'outbound',
      amount: 9000,
      currency: 'INR',
      linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
      linkedEntityId: 'tp-1',
      tripId: 'trip-1',
    });
    expect(row.notes).toContain('AUTO-SEED-HTL');
  });
});
