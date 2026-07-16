import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/helpers';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async sales(user: AuthUser) {
    const organizationId = user.organizationId;
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const last30Start = new Date(now.getTime() - 30 * day);
    const prior30Start = new Date(now.getTime() - 60 * day);
    const staleCutoff = new Date(now.getTime() - 14 * day);
    const permissionSet = new Set(user.permissions);
    const includeManagerMetrics =
      permissionSet.has('lead.assign') || permissionSet.has('report.sales.read');

    const [
      myNewLeads,
      followUpsDue,
      openInquiries,
      quotesAwaiting,
      wonLost,
      tripsDeparting,
      unconfirmedBookings,
      overduePayments,
      bookingsLast30,
      bookingsPrior30,
      quotesSent,
      arDocs,
      unassignedInquiries,
      teamFollowUpsDue,
      staleOpportunities,
    ] = await Promise.all([
      this.prisma.lead.count({
        where: { organizationId, ownerId: user.sub, deletedAt: null, stage: { key: 'new' } },
      }),
      this.prisma.lead.count({
        where: {
          organizationId,
          ownerId: user.sub,
          deletedAt: null,
          followUpAt: { lte: now },
        },
      }),
      this.prisma.inquiry.count({
        where: { organizationId, status: { in: ['open', 'qualified'] }, deletedAt: null },
      }),
      this.prisma.quotationVersion.count({
        where: {
          status: { in: ['sent', 'pending_approval'] },
          quotation: { organizationId },
        },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, deletedAt: null, stage: { OR: [{ isWon: true }, { isLost: true }] } },
        include: { stage: true },
      }),
      this.prisma.trip.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ['confirmed', 'booking_in_progress', 'ready_to_travel', 'in_progress'] },
        },
      }),
      this.prisma.bookingComponent.count({
        where: {
          organizationId,
          status: { not: 'confirmed' },
        },
      }),
      this.prisma.tripPayment.count({
        where: {
          organizationId,
          status: { in: ['scheduled', 'overdue'] },
          dueAt: { lte: now },
        },
      }),
      this.prisma.bookingComponent.count({
        where: {
          organizationId,
          status: 'confirmed',
          createdAt: { gte: last30Start },
        },
      }),
      this.prisma.bookingComponent.count({
        where: {
          organizationId,
          status: 'confirmed',
          createdAt: { gte: prior30Start, lt: last30Start },
        },
      }),
      this.prisma.quotationVersion.count({
        where: {
          quotation: { organizationId },
          status: { in: ['sent', 'accepted', 'superseded'] },
          createdAt: { gte: last30Start },
        },
      }),
      this.prisma.commercialDocument.findMany({
        where: {
          organizationId,
          direction: 'receivable',
          status: { in: ['open', 'partial'] },
        },
        select: {
          amount: true,
          taxAmount: true,
          amountPaid: true,
          dueAt: true,
          currency: true,
        },
      }),
      includeManagerMetrics
        ? this.prisma.inquiry.count({
            where: {
              organizationId,
              deletedAt: null,
              ownerId: null,
              status: { in: ['open', 'qualified'] },
            },
          })
        : Promise.resolve(0),
      includeManagerMetrics
        ? this.prisma.lead.count({
            where: {
              organizationId,
              deletedAt: null,
              ownerId: { not: user.sub },
              followUpAt: { lte: now },
              stage: { isWon: false, isLost: false },
            },
          })
        : Promise.resolve(0),
      includeManagerMetrics
        ? this.prisma.lead.count({
            where: {
              organizationId,
              deletedAt: null,
              updatedAt: { lte: staleCutoff },
              stage: { isWon: false, isLost: false },
            },
          })
        : Promise.resolve(0),
    ]);

    const won = wonLost.filter((l) => l.stage.isWon).length;
    const lost = wonLost.filter((l) => l.stage.isLost).length;
    const conversionDenom = won + lost;
    const conversionRate = conversionDenom > 0 ? won / conversionDenom : null;
    const quoteToWinRate = quotesSent > 0 ? won / quotesSent : null;

    const aging = {
      current: { count: 0, amount: 0 },
      d1_30: { count: 0, amount: 0 },
      d31_60: { count: 0, amount: 0 },
      d61_plus: { count: 0, amount: 0 },
      noDue: { count: 0, amount: 0 },
    };
    for (const doc of arDocs) {
      const outstanding = Math.max(
        0,
        Number(doc.amount) + Number(doc.taxAmount) - Number(doc.amountPaid),
      );
      if (outstanding <= 0.001) continue;
      if (!doc.dueAt) {
        aging.noDue.count += 1;
        aging.noDue.amount += outstanding;
        continue;
      }
      const daysPast = Math.floor((now.getTime() - doc.dueAt.getTime()) / day);
      if (daysPast <= 0) {
        aging.current.count += 1;
        aging.current.amount += outstanding;
      } else if (daysPast <= 30) {
        aging.d1_30.count += 1;
        aging.d1_30.amount += outstanding;
      } else if (daysPast <= 60) {
        aging.d31_60.count += 1;
        aging.d31_60.amount += outstanding;
      } else {
        aging.d61_plus.count += 1;
        aging.d61_plus.amount += outstanding;
      }
    }

    return {
      myNewLeads,
      followUpsDue,
      openInquiries,
      quotesAwaiting,
      won,
      lost,
      activeTrips: tripsDeparting,
      unconfirmedBookings,
      overduePayments,
      bookingsLast30d: bookingsLast30,
      bookingsPrior30d: bookingsPrior30,
      conversionRate,
      quoteToWinRate,
      quotesSentLast30d: quotesSent,
      arAging: aging,
      unassignedInquiries,
      teamFollowUpsDue,
      staleOpportunities,
    };
  }
}
