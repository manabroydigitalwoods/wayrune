import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateInquiryInput,
  UpdateInquiryInput,
  UpdateInquiryStatusInput,
} from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripsService } from '../trips/trips.service';
import { LeadsService } from '../leads/leads.service';
import { GoogleService } from '../google/google.service';
import { computeMissingInquiryFields, type AuthUser } from '../../common/helpers';
import {
  placeRefsFromJson,
  resolveOnePlaceRef,
  resolvePlaceRefs,
} from '../../common/place-refs';

@Injectable()
export class InquiriesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private trips: TripsService,
    private leads: LeadsService,
    @Optional()
    @Inject(forwardRef(() => GoogleService))
    private google?: GoogleService,
  ) {}

  private async nextNumber(
    db: PrismaService | Prisma.TransactionClient,
    organizationId: string,
  ) {
    const count = await db.inquiry.count({ where: { organizationId } });
    return `INQ-${String(count + 1).padStart(5, '0')}`;
  }

  async create(user: AuthUser, input: CreateInquiryInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const destinations = await resolvePlaceRefs(
      this.prisma,
      user.organizationId,
      input.destinations,
    );
    const stops = await resolvePlaceRefs(this.prisma, user.organizationId, input.stops);
    const originRef = await resolveOnePlaceRef(
      this.prisma,
      user.organizationId,
      input.origin ?? null,
    );

    const missing = computeMissingInquiryFields({
      destinations: destinations.map((d) => d.name),
      startDate: input.startDate,
      adults: input.adults,
      budgetAmount: input.budgetAmount,
      travelType: input.travelType,
      domesticOrIntl: input.domesticOrIntl,
    });

    const inquiry = await db.inquiry.create({
      data: {
        organizationId: user.organizationId,
        inquiryNumber: await this.nextNumber(db, user.organizationId),
        partyId: input.partyId ?? null,
        leadId: input.leadId ?? null,
        ownerId: user.sub,
        travelType: input.travelType ?? null,
        domesticOrIntl: input.domesticOrIntl ?? null,
        origin: originRef?.name ?? null,
        originPlaceId: originRef?.placeId ?? null,
        destinationsJson: destinations,
        stopsJson: stops,
        dateFlexible: input.dateFlexible ?? false,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        nights: input.nights ?? null,
        adults: input.adults,
        children: input.children,
        infants: input.infants,
        roomRequirements: input.roomRequirements ?? null,
        budgetAmount: input.budgetAmount ?? null,
        budgetCurrency: input.budgetCurrency ?? 'INR',
        hotelCategory: input.hotelCategory ?? null,
        meals: input.meals ?? null,
        transportPref: input.transportPref ?? null,
        flightsRequired: input.flightsRequired ?? false,
        visaAssistance: input.visaAssistance ?? false,
        insurance: input.insurance ?? false,
        interestsJson: input.interests?.length ? input.interests : Prisma.JsonNull,
        expectedCloseAt: input.expectedCloseAt ? new Date(input.expectedCloseAt) : null,
        specialRequirements: input.specialRequirements ?? null,
        internalNotes: input.internalNotes ?? null,
        missingFieldsJson: missing,
        createdBy: user.sub,
        updatedBy: user.sub,
        statusHistory: {
          create: { status: 'open', changedBy: user.sub, note: 'Created' },
        },
      },
    });

    if (input.leadId) {
      await this.leads.syncFromInquiry(user, input.leadId, 'open', {
        note: 'Inquiry captured',
        tx,
      });
    }

    // Skip the audit when composed inside a caller's transaction; the caller
    // records it after the whole unit of work commits.
    if (!tx) {
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.sub,
        action: 'inquiry.create',
        entityType: 'inquiry',
        entityId: inquiry.id,
      });
      await this.maybeSyncInquiryCalendar(user.organizationId, inquiry);
    }

    return inquiry;
  }

  async list(organizationId: string, page = 1, pageSize = 20, q?: string, status?: string) {
    const where: Prisma.InquiryWhereInput = {
      organizationId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { inquiryNumber: { contains: q } },
              { travelType: { contains: q } },
              { party: { displayName: { contains: q } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { party: true, lead: true },
      }),
      this.prisma.inquiry.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(organizationId: string, id: string) {
    const inquiry = await this.prisma.inquiry.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { party: true, lead: true, statusHistory: { orderBy: { createdAt: 'desc' } }, trips: true },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    return inquiry;
  }

  async update(user: AuthUser, id: string, input: UpdateInquiryInput) {
    const existing = await this.get(user.organizationId, id);
    if (existing.status === 'converted') {
      throw new BadRequestException('Converted inquiries cannot be edited');
    }

    const destinations =
      input.destinations !== undefined
        ? await resolvePlaceRefs(this.prisma, user.organizationId, input.destinations)
        : placeRefsFromJson(existing.destinationsJson);
    const stops =
      input.stops !== undefined
        ? await resolvePlaceRefs(this.prisma, user.organizationId, input.stops)
        : placeRefsFromJson(existing.stopsJson);
    const originRef =
      input.origin !== undefined
        ? await resolveOnePlaceRef(this.prisma, user.organizationId, input.origin ?? null)
        : existing.origin
          ? {
              placeId: existing.originPlaceId,
              name: existing.origin,
            }
          : null;

    const travelType = input.travelType !== undefined ? input.travelType : existing.travelType;
    const domesticOrIntl =
      input.domesticOrIntl !== undefined ? input.domesticOrIntl : existing.domesticOrIntl;
    const startDate =
      input.startDate !== undefined
        ? input.startDate
          ? new Date(input.startDate)
          : null
        : existing.startDate;
    const endDate =
      input.endDate !== undefined
        ? input.endDate
          ? new Date(input.endDate)
          : null
        : existing.endDate;
    const adults = input.adults !== undefined ? input.adults : existing.adults;
    const children = input.children !== undefined ? input.children : existing.children;
    const infants = input.infants !== undefined ? input.infants : existing.infants;
    const budgetAmount =
      input.budgetAmount !== undefined ? input.budgetAmount : existing.budgetAmount;
    const budgetCurrency =
      input.budgetCurrency !== undefined ? input.budgetCurrency : existing.budgetCurrency;
    const expectedCloseAt =
      input.expectedCloseAt !== undefined
        ? input.expectedCloseAt
          ? new Date(input.expectedCloseAt)
          : null
        : existing.expectedCloseAt;

    const missing = computeMissingInquiryFields({
      destinations: destinations.map((d) => d.name),
      startDate: startDate?.toISOString() ?? null,
      adults,
      budgetAmount: budgetAmount != null ? Number(budgetAmount) : null,
      travelType,
      domesticOrIntl,
    });

    const autoQualify = missing.length === 0 && existing.status === 'open';

    const inquiry = await this.prisma.inquiry.update({
      where: { id },
      data: {
        ...(input.travelType !== undefined ? { travelType: input.travelType } : {}),
        ...(input.domesticOrIntl !== undefined ? { domesticOrIntl: input.domesticOrIntl } : {}),
        ...(input.origin !== undefined
          ? { origin: originRef?.name ?? null, originPlaceId: originRef?.placeId ?? null }
          : {}),
        ...(input.destinations !== undefined ? { destinationsJson: destinations } : {}),
        ...(input.stops !== undefined ? { stopsJson: stops } : {}),
        ...(input.dateFlexible !== undefined ? { dateFlexible: input.dateFlexible } : {}),
        ...(input.startDate !== undefined ? { startDate } : {}),
        ...(input.endDate !== undefined ? { endDate } : {}),
        ...(input.nights !== undefined ? { nights: input.nights } : {}),
        ...(input.adults !== undefined ? { adults: input.adults } : {}),
        ...(input.children !== undefined ? { children: input.children } : {}),
        ...(input.infants !== undefined ? { infants: input.infants } : {}),
        ...(input.roomRequirements !== undefined
          ? { roomRequirements: input.roomRequirements }
          : {}),
        ...(input.budgetAmount !== undefined ? { budgetAmount: input.budgetAmount } : {}),
        ...(input.budgetCurrency !== undefined ? { budgetCurrency: input.budgetCurrency } : {}),
        ...(input.hotelCategory !== undefined ? { hotelCategory: input.hotelCategory } : {}),
        ...(input.meals !== undefined ? { meals: input.meals } : {}),
        ...(input.transportPref !== undefined ? { transportPref: input.transportPref } : {}),
        ...(input.flightsRequired !== undefined ? { flightsRequired: input.flightsRequired } : {}),
        ...(input.visaAssistance !== undefined ? { visaAssistance: input.visaAssistance } : {}),
        ...(input.insurance !== undefined ? { insurance: input.insurance } : {}),
        ...(input.interests !== undefined
          ? {
              interestsJson: input.interests.length ? input.interests : Prisma.JsonNull,
            }
          : {}),
        ...(input.expectedCloseAt !== undefined ? { expectedCloseAt } : {}),
        ...(input.specialRequirements !== undefined
          ? { specialRequirements: input.specialRequirements }
          : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        ...(autoQualify ? { status: 'qualified' } : {}),
        missingFieldsJson: missing,
        updatedBy: user.sub,
        ...(autoQualify
          ? {
              statusHistory: {
                create: {
                  status: 'qualified',
                  changedBy: user.sub,
                  note: 'Requirements complete',
                },
              },
            }
          : {}),
      },
      include: { party: true, lead: true, statusHistory: { orderBy: { createdAt: 'desc' } }, trips: true },
    });

    if (autoQualify && inquiry.leadId) {
      await this.leads.syncFromInquiry(user, inquiry.leadId, 'qualified', {
        note: 'Inquiry requirements complete',
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'inquiry.update',
      entityType: 'inquiry',
      entityId: inquiry.id,
      metadata: { missingFields: missing },
    });

    if (input.startDate !== undefined || input.endDate !== undefined) {
      await this.maybeSyncInquiryCalendar(user.organizationId, inquiry);
    }

    return inquiry;
  }

  private async maybeSyncInquiryCalendar(
    organizationId: string,
    inquiry: { id: string; inquiryNumber: string; startDate: Date | null; endDate: Date | null },
  ) {
    if (!this.google || !inquiry.startDate) return;
    try {
      await this.google.syncTravelRequestWindow(organizationId, {
        id: inquiry.id,
        inquiryNumber: inquiry.inquiryNumber,
        startDate: inquiry.startDate,
        endDate: inquiry.endDate,
      });
    } catch {
      /* Calendar sync is best-effort */
    }
  }

  /**
   * Manual pipeline transitions. `converted` is a one-way, system-driven
   * status reached only via `convertToTrip`, so it is excluded here.
   */
  private static readonly STATUS_TRANSITIONS: Record<string, string[]> = {
    open: ['qualified', 'lost'],
    qualified: ['open', 'lost'],
    lost: ['open'],
  };

  async updateStatus(user: AuthUser, id: string, input: UpdateInquiryStatusInput) {
    const existing = await this.get(user.organizationId, id);
    if (existing.status === 'converted') {
      throw new BadRequestException('Converted inquiries cannot change status manually');
    }
    if (existing.status === input.status) {
      throw new BadRequestException(`Inquiry is already ${input.status}`);
    }
    const allowed = InquiriesService.STATUS_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(input.status)) {
      throw new BadRequestException(
        `Cannot move an inquiry from '${existing.status}' to '${input.status}'`,
      );
    }

    const inquiry = await this.prisma.inquiry.update({
      where: { id },
      data: {
        status: input.status,
        updatedBy: user.sub,
        statusHistory: {
          create: { status: input.status, changedBy: user.sub, note: input.reason ?? null },
        },
      },
      include: { party: true, lead: true, statusHistory: { orderBy: { createdAt: 'desc' } }, trips: true },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'inquiry.status_change',
      entityType: 'inquiry',
      entityId: inquiry.id,
      metadata: { from: existing.status, to: input.status, reason: input.reason ?? null },
    });

    if (inquiry.leadId) {
      await this.leads.syncFromInquiry(user, inquiry.leadId, input.status, {
        reason: input.reason,
        note: input.reason ? `Inquiry ${input.status}: ${input.reason}` : `Inquiry ${input.status}`,
      });
    }

    return inquiry;
  }

  async clone(user: AuthUser, id: string) {
    const source = await this.get(user.organizationId, id);
    return this.create(user, {
      partyId: source.partyId,
      leadId: source.leadId,
      travelType: source.travelType,
      domesticOrIntl: source.domesticOrIntl as 'domestic' | 'international' | null,
      origin: source.origin
        ? {
            placeId: source.originPlaceId,
            name: source.origin,
          }
        : null,
      destinations: placeRefsFromJson(source.destinationsJson),
      stops: placeRefsFromJson(source.stopsJson),
      dateFlexible: source.dateFlexible,
      startDate: source.startDate?.toISOString() ?? null,
      endDate: source.endDate?.toISOString() ?? null,
      nights: source.nights,
      adults: source.adults,
      children: source.children,
      infants: source.infants,
      budgetAmount: source.budgetAmount ? Number(source.budgetAmount) : null,
      budgetCurrency: source.budgetCurrency,
      hotelCategory: source.hotelCategory,
      meals: source.meals,
      transportPref: source.transportPref,
      flightsRequired: source.flightsRequired,
      visaAssistance: source.visaAssistance,
      insurance: source.insurance,
      interests: Array.isArray(source.interestsJson)
        ? (source.interestsJson as string[])
        : undefined,
      roomRequirements: source.roomRequirements,
      expectedCloseAt: source.expectedCloseAt?.toISOString() ?? null,
      specialRequirements: source.specialRequirements,
      internalNotes: source.internalNotes,
    });
  }

  async convertToTrip(user: AuthUser, id: string) {
    const inquiry = await this.get(user.organizationId, id);
    if (inquiry.status === 'converted') {
      const existing = await this.prisma.trip.findFirst({
        where: { inquiryId: id, organizationId: user.organizationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        throw new BadRequestException(
          `Inquiry already converted to ${existing.tripNumber}. Open that trip instead.`,
        );
      }
    }

    const destinations = [
      ...placeRefsFromJson(inquiry.destinationsJson),
      ...placeRefsFromJson(inquiry.stopsJson),
    ];
    const destLabel =
      destinations
        .map((d) => d.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(' · ') || null;
    const partyName = inquiry.party?.displayName?.trim() || null;
    const title =
      destLabel && partyName
        ? `${partyName} — ${destLabel}`
        : destLabel || partyName || `${inquiry.inquiryNumber} trip`;

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await this.trips.create(
        user,
        {
          title,
          inquiryId: inquiry.id,
          partyId: inquiry.partyId,
          startDate: inquiry.startDate?.toISOString() ?? null,
          endDate: inquiry.endDate?.toISOString() ?? null,
          destinations,
        },
        tx,
      );

      await tx.inquiry.update({
        where: { id },
        data: {
          status: 'converted',
          updatedBy: user.sub,
          statusHistory: {
            create: {
              status: 'converted',
              changedBy: user.sub,
              note: `Converted to ${created.tripNumber}`,
            },
          },
        },
      });

      return created;
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.create',
      entityType: 'trip',
      entityId: trip.id,
      metadata: { fromInquiryId: id },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'inquiry.convert_to_trip',
      entityType: 'inquiry',
      entityId: id,
      metadata: { tripId: trip.id },
    });

    const leadOutcome = await this.leads.markWonIfEligible(
      user,
      inquiry.leadId,
      'converted to trip',
    );

    return { ...trip, leadOutcome };
  }
}
