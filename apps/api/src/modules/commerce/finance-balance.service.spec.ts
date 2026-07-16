import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FinanceBalanceService } from './finance-balance.service';
import type { PrismaService } from '../../prisma/prisma.service';

/** Minimal fake of the PrismaService surface `documentBalance` touches. */
function makeFakePrisma(options: {
  doc: {
    id: string;
    organizationId: string;
    amount: number;
    taxAmount: number;
    amountPaid: number;
    currency: string;
    allocations: Array<{ amount: number }>;
  } | null;
  creditNotes?: Array<{ amount: number; taxAmount: number }>;
}) {
  return {
    commercialDocument: {
      findFirst: async () => options.doc,
      findMany: async () => options.creditNotes ?? [],
    },
  } as unknown as PrismaService;
}

describe('FinanceBalanceService.documentBalance', () => {
  it('throws NotFoundException when the document does not exist', async () => {
    const service = new FinanceBalanceService(makeFakePrisma({ doc: null }));
    await expect(service.documentBalance('org_1', 'doc_missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('is "open" when nothing has been allocated yet', async () => {
    const service = new FinanceBalanceService(
      makeFakePrisma({
        doc: {
          id: 'doc_1',
          organizationId: 'org_1',
          amount: 1000,
          taxAmount: 100,
          amountPaid: 0,
          currency: 'INR',
          allocations: [],
        },
      }),
    );
    const balance = await service.documentBalance('org_1', 'doc_1');
    expect(balance.total).toBe(1100);
    expect(balance.outstanding).toBe(1100);
    expect(balance.status).toBe('open');
  });

  it('is "partial" once some but not all of the total has been allocated', async () => {
    const service = new FinanceBalanceService(
      makeFakePrisma({
        doc: {
          id: 'doc_1',
          organizationId: 'org_1',
          amount: 1000,
          taxAmount: 0,
          amountPaid: 400,
          currency: 'INR',
          allocations: [{ amount: 400 }],
        },
      }),
    );
    const balance = await service.documentBalance('org_1', 'doc_1');
    expect(balance.outstanding).toBe(600);
    expect(balance.status).toBe('partial');
  });

  it('is "paid" once allocations (net of credit notes) cover the total', async () => {
    const service = new FinanceBalanceService(
      makeFakePrisma({
        doc: {
          id: 'doc_1',
          organizationId: 'org_1',
          amount: 1000,
          taxAmount: 0,
          amountPaid: 1000,
          currency: 'INR',
          allocations: [{ amount: 1000 }],
        },
      }),
    );
    const balance = await service.documentBalance('org_1', 'doc_1');
    expect(balance.outstanding).toBe(0);
    expect(balance.status).toBe('paid');
  });

  it('nets active credit notes against the outstanding balance', async () => {
    const service = new FinanceBalanceService(
      makeFakePrisma({
        doc: {
          id: 'doc_1',
          organizationId: 'org_1',
          amount: 1000,
          taxAmount: 0,
          amountPaid: 0,
          currency: 'INR',
          allocations: [],
        },
        creditNotes: [{ amount: 1000, taxAmount: 0 }],
      }),
    );
    const balance = await service.documentBalance('org_1', 'doc_1');
    expect(balance.creditNotes).toBe(1000);
    expect(balance.outstanding).toBe(0);
    expect(balance.status).toBe('paid');
  });
});
