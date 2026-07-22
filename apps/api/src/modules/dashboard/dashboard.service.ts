import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/helpers';
import {
  buildFitClaimProtocolFromRows,
  computeSalesSlaMetrics,
  salesSlaTargetsFromSettings,
} from './sales-sla-metrics';
import { fitClaimOpsChecklist, publicScaleOpsChecklist } from './claim-gates';
import { buildParityDogfoodKit } from './parity-dogfood-kit';
import {
  buildPilotReadinessPayload,
  parsePilotProgramSettings,
} from './pilot-readiness';
import { isDemoOperateSupplier } from '../organizations/demo-operate-pack';
import {
  buildPublicScaleProtocol,
  PUBLIC_SCALE_WINDOW_DAYS,
  snapshotFromProtocol,
} from './public-scale-metrics';
import {
  computeInboxSlaMetrics,
  inboxAgingHoursFromSettings,
} from './inbox-sla-metrics';
import { fireUnreadSlaAutomations } from '../connectors/unread-sla-fire';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /** Cross-tenant measured scale for platform admins — never invent vanity numbers. */
  async platformPublicScale() {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - PUBLIC_SCALE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [sentQuotes, acceptedQuotes] = await Promise.all([
      this.prisma.quotationVersion.findMany({
        where: {
          status: { in: ['sent', 'accepted'] },
          updatedAt: { gte: windowStart },
        },
        select: {
          id: true,
          quotation: { select: { organizationId: true, tripId: true } },
        },
      }),
      this.prisma.quotationVersion.findMany({
        where: {
          status: 'accepted',
          OR: [
            { acceptedAt: { gte: windowStart } },
            {
              AND: [{ acceptedAt: null }, { updatedAt: { gte: windowStart } }],
            },
          ],
        },
        select: {
          quotation: { select: { tripId: true, organizationId: true } },
        },
      }),
    ]);

    const agencyOrgIds = new Set<string>();
    for (const q of sentQuotes) {
      if (q.quotation.organizationId) agencyOrgIds.add(q.quotation.organizationId);
    }
    const agencyOrgs =
      agencyOrgIds.size === 0
        ? []
        : await this.prisma.organization.findMany({
            where: {
              id: { in: [...agencyOrgIds] },
              kind: 'travel_agency',
            },
            select: { id: true },
          });

    const trips = new Set<string>();
    for (const q of acceptedQuotes) {
      if (q.quotation.tripId) trips.add(q.quotation.tripId);
    }

    const protocol = buildPublicScaleProtocol(
      {
        activeAgencyOrgs: agencyOrgs.length,
        tripsWithAcceptedQuote: trips.size,
        quotesSent90d: sentQuotes.length,
      },
      { asOf: now },
    );

    return {
      protocol,
      snapshot: snapshotFromProtocol(protocol),
      publishHint:
        'When publicScaleAllowed, copy snapshot into apps/web/src/lib/public-scale-snapshot.json for login-free /docs.',
      opsChecklist: publicScaleOpsChecklist(protocol),
    };
  }

  /** Org-scoped marketing claim gates — observability only; registry stays Testing until ops flip. */
  async claimGates(user: AuthUser) {
    const organizationId = user.organizationId;
    const now = new Date();
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [
      fitBuildAudits,
      org,
      memberships,
      travellerCount,
      inquiryWithPax,
      quoteTemplateCount,
      quotationCount,
      proposalCount,
      suppliers,
      hotelRateActive,
      transferRateActive,
      activityRateActive,
      enquiryCount,
      confirmCount,
      payableCount,
      voucherCount,
    ] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where: {
          organizationId,
          action: 'quote.fit_build',
          createdAt: { gte: last30Start },
        },
        select: { metadataJson: true },
        take: 500,
      }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: {
          slug: true,
          name: true,
          brandingJson: true,
          settingsJson: true,
        },
      }),
      this.prisma.organizationMembership.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          roles: { select: { role: { select: { key: true } } } },
        },
      }),
      this.prisma.tripTraveller.count({
        where: { trip: { organizationId } },
      }),
      this.prisma.inquiry.count({
        where: {
          organizationId,
          deletedAt: null,
          adults: { gt: 0 },
        },
      }),
      this.prisma.quoteTemplate.count({ where: { organizationId } }),
      this.prisma.quotation.count({ where: { organizationId } }),
      this.prisma.quotationVersion.count({
        where: {
          quotation: { organizationId },
          status: { in: ['sent', 'accepted'] },
        },
      }),
      this.prisma.supplier.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          type: true,
          name: true,
          email: true,
          phone: true,
          profileJson: true,
        },
      }),
      this.prisma.supplierHotelRate.count({
        where: { organizationId, isActive: true, deletedAt: null },
      }),
      this.prisma.transferFare.count({
        where: { organizationId, isActive: true, deletedAt: null },
      }),
      this.prisma.supplierActivityRate.count({
        where: { organizationId, isActive: true, deletedAt: null },
      }),
      this.prisma.bookingComponent.count({
        where: {
          organizationId,
          status: {
            in: ['requested', 'sent', 'acknowledged', 'held', 'confirmed'],
          },
        },
      }),
      this.prisma.bookingComponent.count({
        where: { organizationId, status: 'confirmed' },
      }),
      this.prisma.supplierInvoice.count({ where: { organizationId } }),
      this.prisma.bookingComponent.count({
        where: {
          organizationId,
          NOT: { voucherNote: null },
        },
      }),
    ]);

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
    const fitClaimProtocol = buildFitClaimProtocolFromRows(fitBuildRows);

    const branding = asJsonRecord(org.brandingJson);
    const settings = asJsonRecord(org.settingsJson);
    const business = asJsonRecord(settings.business);
    const demoPack = asJsonRecord(settings.demoOperatePack);
    const demoOperatePackActive = Object.keys(demoPack).length > 0;

    const hotelTypes = new Set(['hotel', 'homestay', 'farmstay']);
    const transferTypes = new Set([
      'car_rental',
      'driver',
      'transfer',
      'transport',
    ]);
    const activityTypes = new Set(['activity', 'guide']);
    const contactOk = (types: Set<string>) =>
      suppliers.some(
        (s) =>
          types.has(s.type) &&
          Boolean(s.name?.trim()) &&
          Boolean(s.email?.trim() || s.phone?.trim()),
      );

    const hasNonDemoSupplier = suppliers.some(
      (s) =>
        !isDemoOperateSupplier(s.name) &&
        !isDemoOperateSupplier(asJsonRecord(s.profileJson)),
    );

    const salesKeys = new Set([
      'owner',
      'admin',
      'sales_executive',
      'sales_manager',
      'agency_admin',
    ]);
    const hasSalesUser = memberships.some((m) =>
      m.roles.some(
        (r) => salesKeys.has(r.role.key) || r.role.key.includes('sales'),
      ),
    );

    const hasBranding =
      (typeof branding.logoUrl === 'string' &&
        Boolean(branding.logoUrl.trim())) ||
      (typeof branding.primaryColor === 'string' &&
        Boolean(branding.primaryColor.trim()) &&
        branding.primaryColor.trim().toLowerCase() !== '#0f6e56');

    const hasOrgProfile =
      Boolean(String(business.legalName ?? '').trim()) ||
      Boolean(String(business.gstin ?? '').trim()) ||
      Boolean(String(org.name ?? '').trim());

    const hasMarkupOrTaxConfigured =
      typeof settings.defaultTaxPercent === 'number' ||
      typeof settings.defaultMarkupPercent === 'number';

    const pilotSettings = parsePilotProgramSettings(org.settingsJson);
    const pilotReadiness = buildPilotReadinessPayload(
      {
        orgSlug: org.slug,
        isSharedDemoSeed: org.slug === 'demo-travel',
        hasOrgProfile,
        hasBranding,
        hasSalesUser,
        hasTravellerIntake: travellerCount > 0 || inquiryWithPax > 0,
        hasQuotePath: quoteTemplateCount > 0 || quotationCount > 0,
        hasMarkupOrTaxConfigured,
        hasProposalPreview: proposalCount > 0,
        hasSuppliers: suppliers.length > 0,
        hotelSupplierContactOk: contactOk(hotelTypes),
        transferSupplierContactOk: contactOk(transferTypes),
        activitySupplierContactOk: contactOk(activityTypes),
        hotelRateActive: hotelRateActive > 0,
        transferRateActive: transferRateActive > 0,
        activityRateActive: activityRateActive > 0,
        hasSupplierEnquiry: enquiryCount > 0,
        hasSupplierConfirm: confirmCount > 0,
        hasPayable: payableCount > 0,
        hasVoucher: voucherCount > 0,
        demoOperatePackActive,
        hasNonDemoSupplier,
        hasTestRoles: memberships.length >= 1 && hasSalesUser,
        fitDemoSamplesExcludedUnderstood: true,
      },
      pilotSettings,
    );

    return {
      fitClaimProtocol,
      fitOpsChecklist: fitClaimOpsChecklist(fitClaimProtocol),
      /** Claim registry remains Testing until explicit product sign-off. */
      registryStatus: 'testing' as const,
      parityDogfoodKit: buildParityDogfoodKit(),
      pilotReadiness,
    };
  }

  async sales(
    user: AuthUser,
    opts: { from?: string | null; to?: string | null; windowDays?: number } = {},
  ) {
    const organizationId = user.organizationId;
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;

    let windowEnd = now;
    let last30Start: Date;
    let prior30Start: Date;
    let windowDays: number;

    if (
      opts.from &&
      opts.to &&
      /^\d{4}-\d{2}-\d{2}$/.test(opts.from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(opts.to)
    ) {
      last30Start = new Date(`${opts.from}T00:00:00.000Z`);
      windowEnd = new Date(`${opts.to}T23:59:59.999Z`);
      windowDays = Math.max(
        1,
        Math.round((windowEnd.getTime() - last30Start.getTime()) / day) + 1,
      );
      prior30Start = new Date(last30Start.getTime() - windowDays * day);
    } else {
      windowDays = Math.min(365, Math.max(1, Math.floor(opts.windowDays ?? 30) || 30));
      last30Start = new Date(now.getTime() - windowDays * day);
      prior30Start = new Date(now.getTime() - windowDays * 2 * day);
    }

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
          createdAt: { gte: last30Start, lte: windowEnd },
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
          createdAt: { gte: last30Start, lte: windowEnd },
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
          createdAt: { gte: last30Start, lte: windowEnd },
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
          createdAt: { gte: last30Start, lte: windowEnd },
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
      fitBuildDemoSampleSize30d: sla.fitBuildDemoSampleSize,
      fitClaimProtocol,
      firstTouchTargetHours: salesSlaTargets.firstTouchTargetHours,
      leadToQuoteTargetHours: salesSlaTargets.leadToQuoteTargetHours,
      fitBuildTargetMinutes: salesSlaTargets.fitBuildTargetMinutes,
      inboxUnreadThreads: inboxSla.unreadThreads,
      inboxAgingUnreadThreads: inboxSla.agingUnreadThreads,
      inboxAgingHours: inboxSla.agingHours,
      window: {
        from: last30Start.toISOString().slice(0, 10),
        to: windowEnd.toISOString().slice(0, 10),
        days: windowDays,
      },
    };
  }
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
