import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/helpers';
import {
  buildFitClaimProtocolFromRows,
  computeSalesSlaMetrics,
  salesSlaTargetsFromSettings,
} from './sales-sla-metrics';
import {
  computeInboxSlaMetrics,
  inboxAgingHoursFromSettings,
} from './inbox-sla-metrics';
import { fireUnreadSlaAutomations } from '../connectors/unread-sla-fire';

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
      followUpsOverdue,
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
      slaLeadRows,
      inboxUnreadRows,
      orgSettings,
      fitBuildAudits,
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
      this.prisma.lead.count({
        where: {
          organizationId,
          ownerId: user.sub,
          deletedAt: null,
          followUpAt: { lt: now },
          stage: { isWon: false, isLost: false },
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
      this.prisma.lead.findMany({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: last30Start },
        },
        select: {
          createdAt: true,
          activities: {
            where: { type: { in: ['note', 'call', 'email'] } },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { createdAt: true },
          },
          inquiries: {
            where: { deletedAt: null },
            select: {
              trips: {
                where: { deletedAt: null },
                select: {
                  quotations: {
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                    select: { createdAt: true },
                  },
                },
              },
            },
          },
        },
        take: 500,
      }),
      this.prisma.engagementConversation.findMany({
        where: {
          organizationId,
          status: { not: 'closed' },
          unreadCount: { gt: 0 },
          interactions: { some: {} },
        },
        select: { unreadCount: true, lastInteractionAt: true },
        take: 500,
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settingsJson: true },
      }),
      this.prisma.auditEvent.findMany({
        where: {
          organizationId,
          action: 'quote.fit_build',
          createdAt: { gte: last30Start },
        },
        select: { metadataJson: true },
        take: 500,
      }),
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

    const fitBuildRows = fitBuildAudits.map((row) => {
      const meta =
        row.metadataJson && typeof row.metadataJson === 'object'
          ? (row.metadataJson as Record<string, unknown>)
          : {};
      const minutes =
        typeof meta.minutes === 'number' ? meta.minutes : Number(meta.minutes);
      const source = typeof meta.source === 'string' ? meta.source : null;
      return {
        minutes: Number.isFinite(minutes) ? minutes : NaN,
        source,
      };
    });

    const sla = computeSalesSlaMetrics(
      slaLeadRows.map((lead) => {
        let firstQuoteAt: Date | null = null;
        for (const inquiry of lead.inquiries) {
          for (const trip of inquiry.trips) {
            const qAt = trip.quotations[0]?.createdAt;
            if (qAt && (!firstQuoteAt || qAt < firstQuoteAt)) {
              firstQuoteAt = qAt;
            }
          }
        }
        return {
          createdAt: lead.createdAt,
          firstTouchAt: lead.activities[0]?.createdAt ?? null,
          firstQuoteAt,
        };
      }),
      fitBuildRows,
    );

    const fitClaimProtocol = buildFitClaimProtocolFromRows(fitBuildRows);

    const inboxSla = computeInboxSlaMetrics(
      inboxUnreadRows,
      now,
      inboxAgingHoursFromSettings(orgSettings?.settingsJson),
    );
    const salesSlaTargets = salesSlaTargetsFromSettings(orgSettings?.settingsJson);

    if (inboxSla.agingUnreadThreads > 0) {
      void fireUnreadSlaAutomations(this.prisma, {
        organizationId,
        now,
      }).catch(() => undefined);
    }

    return {
      myNewLeads,
      followUpsDue,
      followUpsOverdue,
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
      medianFirstTouchHours30d: sla.medianFirstTouchHours,
      medianLeadToQuoteHours30d: sla.medianLeadToQuoteHours,
      firstTouchSampleSize30d: sla.firstTouchSampleSize,
      leadToQuoteSampleSize30d: sla.leadToQuoteSampleSize,
      medianFitBuildMinutes30d: sla.medianFitBuildMinutes,
      fitBuildSampleSize30d: sla.fitBuildSampleSize,
      fitClaimProtocol,
      firstTouchTargetHours: salesSlaTargets.firstTouchTargetHours,
      leadToQuoteTargetHours: salesSlaTargets.leadToQuoteTargetHours,
      fitBuildTargetMinutes: salesSlaTargets.fitBuildTargetMinutes,
      inboxUnreadThreads: inboxSla.unreadThreads,
      inboxAgingUnreadThreads: inboxSla.agingUnreadThreads,
      inboxAgingHours: inboxSla.agingHours,
    };
  }
}
