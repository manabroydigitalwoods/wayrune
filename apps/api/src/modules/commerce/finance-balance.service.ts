import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FinanceBalanceService {
  constructor(private prisma: PrismaService) {}

  async documentBalance(organizationId: string, documentId: string) {
    const doc = await this.prisma.commercialDocument.findFirst({
      where: { id: documentId, organizationId },
      include: { allocations: true },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const total = Number(doc.amount) + Number(doc.taxAmount);
    const allocated = doc.allocations.reduce((s, a) => s + Number(a.amount), 0);
    const creditNotes = await this.prisma.commercialDocument.findMany({
      where: {
        organizationId,
        docType: 'credit_note',
        linkedEntityType: 'commercial_document',
        linkedEntityId: documentId,
        status: { notIn: ['cancelled', 'void'] },
      },
    });
    const creditTotal = creditNotes.reduce(
      (s, c) => s + Number(c.amount) + Number(c.taxAmount),
      0,
    );
    const writeOffDocs = await this.prisma.commercialDocument.findMany({
      where: {
        organizationId,
        docType: 'write_off',
        linkedEntityType: 'commercial_document',
        linkedEntityId: documentId,
        status: { notIn: ['cancelled', 'void', 'pending_approval'] },
      },
    });
    const writeOffs = writeOffDocs.reduce(
      (s, w) => s + Number(w.amount) + Number(w.taxAmount),
      0,
    );
    const outstanding = Math.max(0, total - creditTotal - allocated - writeOffs);

    return {
      documentId,
      total,
      creditNotes: creditTotal,
      allocated,
      writeOffs,
      outstanding,
      amountPaidDenorm: Number(doc.amountPaid),
      currency: doc.currency,
      status: outstanding <= 0.001 ? 'paid' : allocated > 0 ? 'partial' : 'open',
    };
  }

  async paymentBalance(organizationId: string, paymentId: string) {
    const payment = await this.prisma.paymentRecord.findFirst({
      where: { id: paymentId, organizationId },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const amount = Number(payment.amount);
    const allocated = payment.allocations.reduce((s, a) => s + Number(a.amount), 0);
    const refunded = 0;
    return {
      paymentId,
      amount,
      allocated,
      refunded,
      unallocated: Math.max(0, amount - allocated - refunded),
      currency: payment.currency,
    };
  }

  async tripPayableRollup(organizationId: string, tripId: string) {
    const items = await this.prisma.serviceRequestItem.findMany({
      where: {
        selected: true,
        status: 'confirmed',
        bookingComponent: { organizationId, tripId },
      },
    });
    const agreed = items.reduce((s, i) => s + Number(i.agreedAmount ?? 0), 0);
    const settlements = await this.prisma.partnerSettlement.findMany({
      where: { organizationId },
      take: 200,
    });
    // Settlement may link via serviceRequest — sum where SR on this trip
    const srs = await this.prisma.serviceRequest.findMany({
      where: { buyerOrganizationId: organizationId, tripId },
      select: { id: true },
    });
    const srIds = new Set(srs.map((s) => s.id));
    const settled = settlements
      .filter((s) => s.serviceRequestId && srIds.has(s.serviceRequestId))
      .reduce((sum, s) => sum + Number(s.amount), 0);

    return {
      tripId,
      agreed,
      settled,
      outstandingPayable: Math.max(0, agreed - settled),
    };
  }
}
