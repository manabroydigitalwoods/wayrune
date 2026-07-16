import { Prisma } from '@prisma/client';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { buildAbility, hasPermission } from '@travel/auth';
import type {
  CreateTravellerSchema,
  CreateTripInput,
  UpdateTripDestinationsInput,
} from '@travel/contracts';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/helpers';
import { resolvePlaceRefs } from '../../common/place-refs';

type CreateTravellerInput = z.infer<typeof CreateTravellerSchema>;

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async nextNumber(
    db: PrismaService | Prisma.TransactionClient,
    organizationId: string,
  ) {
    const count = await db.trip.count({ where: { organizationId } });
    return `TRP-${String(count + 1).padStart(5, '0')}`;
  }

  async create(user: AuthUser, input: CreateTripInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const destinations = await resolvePlaceRefs(
      this.prisma,
      user.organizationId,
      input.destinations,
    );
    const trip = await db.trip.create({
      data: {
        organizationId: user.organizationId,
        tripNumber: await this.nextNumber(db, user.organizationId),
        title: input.title,
        inquiryId: input.inquiryId ?? null,
        partyId: input.partyId ?? null,
        ownerId: user.sub,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        destinationsJson: destinations,
        status: 'planning',
        createdBy: user.sub,
        updatedBy: user.sub,
        itineraries: {
          create: {
            organizationId: user.organizationId,
            title: 'Main itinerary',
            versions: {
              create: {
                versionNumber: 1,
                label: 'v1',
                status: 'draft',
                contentJson: { days: [] },
                createdBy: user.sub,
              },
            },
          },
        },
      },
      include: { itineraries: { include: { versions: true } } },
    });

    if (!tx) {
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.sub,
        action: 'trip.create',
        entityType: 'trip',
        entityId: trip.id,
      });
    }

    return trip;
  }

  async updateDestinations(
    user: AuthUser,
    tripId: string,
    input: UpdateTripDestinationsInput,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    const destinations = await resolvePlaceRefs(
      this.prisma,
      user.organizationId,
      input.destinations,
    );
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        destinationsJson: destinations,
        updatedBy: user.sub,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.destinations_update',
      entityType: 'trip',
      entityId: tripId,
    });
    return updated;
  }

  async list(
    organizationId: string,
    page = 1,
    pageSize = 20,
    q?: string,
    status?: string,
    partyId?: string,
  ) {
    const where: Prisma.TripWhereInput = {
      organizationId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(partyId ? { partyId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { tripNumber: { contains: q } },
              { party: { displayName: { contains: q } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          party: { select: { id: true, displayName: true, email: true } },
          inquiry: {
            select: {
              id: true,
              inquiryNumber: true,
              travelType: true,
              domesticOrIntl: true,
              leadId: true,
            },
          },
          bookings: { select: { status: true } },
          readinessItems: { select: { done: true } },
        },
      }),
      this.prisma.trip.count({ where }),
    ]);
    const mapped = items.map(({ bookings, readinessItems, ...trip }) => {
      const totalBookings = bookings.length;
      const openBookings = bookings.filter((b) => b.status !== 'confirmed' && b.status !== 'cancelled')
        .length;
      const readinessTotal = readinessItems.length;
      const readinessDone = readinessItems.filter((i) => i.done).length;
      return {
        ...trip,
        opsSummary: {
          totalBookings,
          openBookings,
          readinessDone,
          readinessTotal,
        },
      };
    });
    return { items: mapped, total, page, pageSize };
  }

  async getWorkspace(user: AuthUser, id: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: {
        organization: { select: { currency: true } },
        party: true,
        inquiry: true,
        travellers: { include: { traveller: true } },
        itineraries: { include: { versions: { orderBy: { versionNumber: 'desc' } } } },
        quotations: {
          orderBy: { createdAt: 'desc' },
          include: { versions: { orderBy: { versionNumber: 'desc' } } },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const ability = buildAbility(user.permissions);
    const canViewPassport = ability.can('traveller.passport.read');
    const canViewCost = ability.can('quote.view_cost');

    // Field-level redaction (RBAC Integrity 1.0 / P1-5): traveller identity
    // fields are only returned to holders of `traveller.passport.read`.
    const travellers = trip.travellers.map((tt) => ({
      ...tt,
      traveller: {
        ...tt.traveller,
        passportNumber: canViewPassport ? tt.traveller.passportNumber : null,
        passportExpiry: canViewPassport ? tt.traveller.passportExpiry : null,
      },
    }));

    const quotations = trip.quotations.map((q) => ({
      ...q,
      versions: q.versions.map((v) => {
        if (canViewCost) return v;
        const { costTotal, marginAmount, marginPercent, itemsJson, ...rest } = v;
        const items = Array.isArray(itemsJson)
          ? (itemsJson as Array<Record<string, unknown>>).map(({ unitCost, ...item }) => item)
          : itemsJson;
        void costTotal;
        void marginAmount;
        void marginPercent;
        return { ...rest, itemsJson: items, costHidden: true };
      }),
    }));

    return { ...trip, travellers, quotations };
  }

  async addTraveller(user: AuthUser, tripId: string, input: CreateTravellerInput) {
    await this.getWorkspace(user, tripId);
    if (input.passportNumber && !hasPermission(user.permissions, 'traveller.passport.read')) {
      throw new ForbiddenException('Cannot write passport data without permission');
    }

    const traveller = await this.prisma.traveller.create({
      data: {
        organizationId: user.organizationId,
        fullName: input.fullName,
        type: input.type,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        passportNumber: input.passportNumber ?? null,
        passportExpiry: input.passportExpiry ? new Date(input.passportExpiry) : null,
        nationality: input.nationality ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        createdBy: user.sub,
        updatedBy: user.sub,
      },
    });

    await this.prisma.tripTraveller.create({
      data: {
        tripId,
        travellerId: traveller.id,
        isLead: input.isLead ?? false,
      },
    });

    return traveller;
  }

  async updateStatus(
    user: AuthUser,
    id: string,
    status: string,
    cancellationReason?: string | null,
  ) {
    const allowed = new Set([
      'planning',
      'quoted',
      'awaiting_approval',
      'confirmed',
      'booking_in_progress',
      'ready_to_travel',
      'in_progress',
      'completed',
      'cancelled',
    ]);
    if (!allowed.has(status)) {
      throw new BadRequestException(`Unknown trip status: ${status}`);
    }
    const existing = await this.getWorkspace(user, id);
    if (status === 'cancelled' && !cancellationReason?.trim()) {
      throw new BadRequestException('Cancellation reason is required');
    }
    const trip = await this.prisma.trip.update({
      where: { id },
      data: {
        status,
        cancellationReason: status === 'cancelled' ? cancellationReason ?? null : null,
        updatedBy: user.sub,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.status_change',
      entityType: 'trip',
      entityId: id,
      metadata: {
        fromStatus: existing.status,
        toStatus: status,
        status,
        cancellationReason,
      },
    });
    return trip;
  }

  async listTimeline(user: AuthUser, id: string) {
    await this.getWorkspace(user, id);

    const [bookings, payments, invoices, quotations] = await Promise.all([
      this.prisma.bookingComponent.findMany({
        where: { tripId: id, organizationId: user.organizationId },
        select: { id: true },
      }),
      this.prisma.tripPayment.findMany({
        where: { tripId: id, organizationId: user.organizationId },
        select: { id: true },
      }),
      this.prisma.supplierInvoice.findMany({
        where: { tripId: id, organizationId: user.organizationId },
        select: { id: true },
      }),
      this.prisma.quotation.findMany({
        where: { tripId: id, organizationId: user.organizationId },
        select: { id: true, versions: { select: { id: true } } },
      }),
    ]);

    const quotationIds = quotations.map((q) => q.id);
    const versionIds = quotations.flatMap((q) => q.versions.map((v) => v.id));
    const bookingIds = bookings.map((b) => b.id);
    const paymentIds = payments.map((p) => p.id);
    const invoiceIds = invoices.map((i) => i.id);

    const or: Prisma.AuditEventWhereInput[] = [
      { entityType: 'trip', entityId: id },
      ...(quotationIds.length
        ? [{ entityType: 'quotation', entityId: { in: quotationIds } }]
        : []),
      ...(versionIds.length
        ? [{ entityType: 'quotation_version', entityId: { in: versionIds } }]
        : []),
      ...(bookingIds.length
        ? [{ entityType: 'booking_component', entityId: { in: bookingIds } }]
        : []),
      ...(paymentIds.length
        ? [{ entityType: 'trip_payment', entityId: { in: paymentIds } }]
        : []),
      ...(invoiceIds.length
        ? [{ entityType: 'supplier_invoice', entityId: { in: invoiceIds } }]
        : []),
    ];

    const events = await this.prisma.auditEvent.findMany({
      where: {
        organizationId: user.organizationId,
        OR: or,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
      },
    });

    return { items: events };
  }

  async recordFeedback(
    user: AuthUser,
    id: string,
    input: { score: number; note?: string | null },
  ) {
    await this.getWorkspace(user, id);
    const score = Math.round(Number(input.score));
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      throw new BadRequestException('Feedback score must be 0–10');
    }
    const note = input.note?.trim() || null;
    const row = await this.prisma.tripFeedback.create({
      data: {
        tripId: id,
        score,
        note,
        createdBy: user.sub,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.feedback',
      entityType: 'trip',
      entityId: id,
      metadata: { score, note, feedbackId: row.id },
    });
    return row;
  }

  async listFeedback(user: AuthUser, id: string) {
    await this.getWorkspace(user, id);
    const items = await this.prisma.tripFeedback.findMany({
      where: { tripId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items, latest: items[0] || null };
  }
}
