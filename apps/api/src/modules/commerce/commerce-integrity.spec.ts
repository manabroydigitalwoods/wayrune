import { describe, expect, it } from 'vitest';
import {
  evaluateCancellationPolicy,
  mealFulfilmentPayload,
  stayFulfilmentPayload,
} from './policy-evaluator';
import {
  ConfirmServiceRequestItemSchema,
  CreateInventoryHoldSchema,
  CreatePaymentAllocationSchema,
  IntegrityExitChecklist,
} from '@travel/contracts';

describe('policy evaluator', () => {
  it('applies percentage rule inside window', () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = evaluateCancellationPolicy({
      rules: {
        rules: [
          { beforeHours: 48, chargeType: 'PERCENTAGE', chargeValue: 50 },
          { beforeHours: 24, chargeType: 'PERCENTAGE', chargeValue: 100 },
        ],
      },
      baseAmount: 1000,
      currency: 'INR',
      serviceStartAt: start,
    });
    expect(result.customerCharge).toBe(1000);
    expect(result.refundAmount).toBe(0);
    expect(result.humanExplanation.length).toBeGreaterThan(0);
  });

  it('returns free cancel outside windows', () => {
    const start = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const result = evaluateCancellationPolicy({
      rules: {
        rules: [{ beforeHours: 48, chargeType: 'PERCENTAGE', chargeValue: 50 }],
      },
      baseAmount: 1000,
      currency: 'INR',
      serviceStartAt: start,
    });
    expect(result.customerCharge).toBe(0);
    expect(result.refundAmount).toBe(1000);
  });
});

describe('fulfilment payloads', () => {
  it('does not include margin fields on stay payload', () => {
    const payload = stayFulfilmentPayload({
      guestName: 'A',
      checkIn: '2026-01-01',
      checkOut: '2026-01-02',
    });
    expect(payload).not.toHaveProperty('margin');
    expect(payload).not.toHaveProperty('sellPrice');
    expect(payload.serviceType).toBe('STAY');
  });

  it('meal payload is field-scoped', () => {
    const payload = mealFulfilmentPayload({
      guestName: 'Group',
      guestCount: 20,
      packageName: 'Lunch',
    });
    expect(payload.serviceType).toBe('MEAL');
    expect(payload.guestCount).toBe(20);
  });
});

describe('integrity contracts', () => {
  it('parses confirm item schema with snapshots', () => {
    const parsed = ConfirmServiceRequestItemSchema.parse({
      itemId: 'item_1',
      rateSnapshotJson: { amount: 100 },
      policySnapshotJson: { rules: [] },
      idempotencyKey: 'idem-1',
    });
    expect(parsed.itemId).toBe('item_1');
  });

  it('parses hold and allocation schemas', () => {
    expect(
      CreateInventoryHoldSchema.parse({
        resourceType: 'dining_capacity',
        resourceId: 'cap_1',
        expiresAt: new Date().toISOString(),
      }).resourceType,
    ).toBe('dining_capacity');
    expect(
      CreatePaymentAllocationSchema.parse({
        paymentId: 'pay_1',
        commercialDocumentId: 'doc_1',
        amount: 50,
      }).amount,
    ).toBe(50);
  });

  it('lists integrity exit checklist', () => {
    expect(IntegrityExitChecklist.length).toBe(10);
  });
});
