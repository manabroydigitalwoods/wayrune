import type { Prisma } from '@prisma/client';
import {
  evaluatePartyCreditLimit,
  paymentOutstandingAmount,
  type PartyCreditLimitEvaluation,
} from '@wayrune/contracts';

export async function loadPartyCustomerOutstanding(
  db: Prisma.TransactionClient | { tripPayment: Prisma.TransactionClient['tripPayment'] },
  organizationId: string,
  partyId: string,
  opts?: {
    orgCurrency?: string;
    excludePaymentId?: string;
  },
): Promise<number> {
  const payments = await db.tripPayment.findMany({
    where: {
      organizationId,
      direction: 'customer',
      status: { notIn: ['cancelled', 'paid'] },
      ...(opts?.excludePaymentId ? { id: { not: opts.excludePaymentId } } : {}),
      trip: { partyId, deletedAt: null },
      ...(opts?.orgCurrency
        ? { currency: opts.orgCurrency.toUpperCase() }
        : {}),
    },
    select: { amount: true, amountPaid: true },
  });
  return payments.reduce(
    (sum, p) => sum + paymentOutstandingAmount(p.amount, p.amountPaid),
    0,
  );
}

export async function evaluatePartyCreditStatus(
  db: Prisma.TransactionClient | { tripPayment: Prisma.TransactionClient['tripPayment']; party: Prisma.TransactionClient['party'] },
  organizationId: string,
  partyId: string,
  opts?: {
    orgCurrency?: string;
    pendingAmount?: number;
    excludePaymentId?: string;
  },
): Promise<
  PartyCreditLimitEvaluation & {
    partyId: string;
    currency: string;
  }
> {
  const party = await db.party.findFirst({
    where: { id: partyId, organizationId, deletedAt: null },
    select: { creditLimit: true },
  });
  const outstanding = await loadPartyCustomerOutstanding(
    db,
    organizationId,
    partyId,
    {
      orgCurrency: opts?.orgCurrency,
      excludePaymentId: opts?.excludePaymentId,
    },
  );
  const evaluation = evaluatePartyCreditLimit({
    creditLimit:
      party?.creditLimit != null ? Number(party.creditLimit) : null,
    outstanding,
    pendingAmount: opts?.pendingAmount,
  });
  return {
    partyId,
    currency: opts?.orgCurrency || 'INR',
    ...evaluation,
  };
}
