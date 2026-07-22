import { Prisma } from '@prisma/client';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { buildAbility, hasPermission } from '@wayrune/auth';
import type {
  CreateTravellerSchema,
  CreateTripInput,
  QuotationItem,
  UpdateTravellerSchema,
  UpdateTripDatesInput,
  UpdateTripDestinationPlaceOfSupplyInput,
  UpdateTripDestinationsInput,
} from '@wayrune/contracts';
import { QuotationItemSchema } from '@wayrune/contracts';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calcQuoteTotals, type AuthUser } from '../../common/helpers';
import { resolvePlaceRefs, placeAncestorLabelsForRefs } from '../../common/place-refs';
import { inferDestinationPlaceOfSupplyFromLabels } from '../../common/destination-pos-infer';
import {
  reanchorItineraryDaysToTripStart,
  remintQuoteItems,
  shiftQuoteItemsToTripStart,
} from '../quotations/quote-template-content';
import { rematchQuoteItemsFromRates } from '../quotations/quote-rate-rematch';
import {
  normalizeHotelNationality,
  resolveNationalityOptsFromTripTravellers,
} from '../rates/hotel-nationality';
import {
  normalizeCurrency,
  parseQuoteFxLock,
  quoteFxLockToJson,
  sameCurrencyLock,
} from '../quotations/quote-fx';
import {
  defaultValidUntilDate,
  quoteValidityDaysFromSettings,
  syncTermsWithValidUntil,
} from '../quotations/quote-validity';
import { RatesService } from '../rates/rates.service';
import {
  pickCommercialQuoteSourceForRewrite,
  shouldShiftQuoteDatesOnTripEdit,
  tripStartIso,
  type CommercialQuoteRewriteStatus,
} from './trip-date-shift';
import { normalizeRoomAllocation } from '../operations/room-allocation';

type CreateTravellerInput = z.infer<typeof CreateTravellerSchema>;
type UpdateTravellerInput = z.infer<typeof UpdateTravellerSchema>;

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private rates: RatesService,
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
    return {
      ...updated,
      inferredDestinationPlaceOfSupply:
        inferDestinationPlaceOfSupplyFromLabels(
          await placeAncestorLabelsForRefs(
            this.prisma,
            user.organizationId,
            updated.destinationsJson,
          ),
        ),
    };
  }

  async updateDestinationPlaceOfSupply(
    user: AuthUser,
    tripId: string,
    input: UpdateTripDestinationPlaceOfSupplyInput,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    const value =
      typeof input.destinationPlaceOfSupply === 'string' &&
      input.destinationPlaceOfSupply.trim()
        ? input.destinationPlaceOfSupply.trim()
        : null;
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        destinationPlaceOfSupply: value,
        updatedBy: user.sub,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.destination_place_of_supply_update',
      entityType: 'trip',
      entityId: tripId,
    });
    return updated;
  }

  async updateDates(user: AuthUser, tripId: string, input: UpdateTripDatesInput) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const previousStartIso = tripStartIso(trip.startDate);
    const nextStart =
      input.startDate !== undefined
        ? input.startDate
          ? new Date(input.startDate)
          : null
        : trip.startDate;
    const nextEnd =
      input.endDate !== undefined
        ? input.endDate
          ? new Date(input.endDate)
          : null
        : trip.endDate;

    const startIso = tripStartIso(nextStart);
    const endIso = tripStartIso(nextEnd);
    if (startIso && endIso && endIso < startIso) {
      throw new BadRequestException('Travel end must be on or after travel start');
    }

    const shiftQuoteDates = input.shiftQuoteDates !== false;
    const doShift = shouldShiftQuoteDatesOnTripEdit({
      previousStartIso,
      nextStartIso: startIso,
      shiftQuoteDates,
    });

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        ...(input.startDate !== undefined ? { startDate: nextStart } : {}),
        ...(input.endDate !== undefined ? { endDate: nextEnd } : {}),
        updatedBy: user.sub,
      },
    });

    let dateShiftDays = 0;
    let quoteVersionsShifted = 0;
    let itineraryDaysReanchored = false;
    let quoteRewriteFromStatus: CommercialQuoteRewriteStatus | null = null;
    let quoteRewriteQuotationId: string | null = null;
    let quoteRewriteVersionId: string | null = null;
    let rematchMatched = 0;
    let rematchUnmatched = 0;

    if (doShift && startIso) {
      const tripTravellerRows = await this.prisma.tripTraveller.findMany({
        where: { tripId },
        select: {
          isLead: true,
          traveller: { select: { nationality: true } },
        },
      });
      const travellerNat =
        resolveNationalityOptsFromTripTravellers(tripTravellerRows);
      const versions = await this.prisma.quotationVersion.findMany({
        where: {
          status: { in: ['draft', 'pending_approval'] },
          quotation: {
            tripId,
            organizationId: user.organizationId,
          },
        },
      });
      for (const version of versions) {
        const items: QuotationItem[] = [];
        const raw = Array.isArray(version.itemsJson) ? version.itemsJson : [];
        for (const row of raw) {
          const parsed = QuotationItemSchema.safeParse(row);
          if (parsed.success) items.push(parsed.data);
        }
        if (!items.length) continue;
        const { items: shifted, shiftDays } = shiftQuoteItemsToTripStart(
          items,
          startIso,
        );
        const rematch = await rematchQuoteItemsFromRates(
          this.rates,
          user.organizationId,
          shifted,
          {
            startDate: startIso,
            partyId: trip.partyId ?? null,
            ...travellerNat,
            destinationPlaceOfSupply: trip.destinationPlaceOfSupply ?? null,
          },
        );
        const totals = calcQuoteTotals(
          rematch.items,
          Number(version.discountTotal) || 0,
        );
        await this.prisma.quotationVersion.update({
          where: { id: version.id },
          data: {
            itemsJson: rematch.items as unknown as Prisma.InputJsonValue,
            ...totals,
            versionLock: { increment: 1 },
          },
        });
        quoteVersionsShifted += 1;
        rematchMatched += rematch.matchedCount;
        rematchUnmatched += rematch.unmatchedCount;
        if (Math.abs(shiftDays) > Math.abs(dateShiftDays)) {
          dateShiftDays = shiftDays;
        }
      }

      if (quoteVersionsShifted === 0) {
        const rewrite = await this.createShiftedDraftFromLockedQuote(
          user,
          tripId,
          startIso,
          trip.partyId ?? null,
        );
        if (rewrite) {
          quoteVersionsShifted = 1;
          dateShiftDays = rewrite.dateShiftDays;
          quoteRewriteFromStatus = rewrite.sourceStatus;
          quoteRewriteQuotationId = rewrite.quotationId;
          quoteRewriteVersionId = rewrite.versionId;
          rematchMatched = rewrite.rematchMatched;
          rematchUnmatched = rewrite.rematchUnmatched;
        }
      }

      itineraryDaysReanchored = await this.reanchorTripItineraryDays(
        user.organizationId,
        tripId,
        nextStart,
      );
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.dates_update',
      entityType: 'trip',
      entityId: tripId,
      metadata: {
        startDate: startIso,
        endDate: endIso,
        previousStartDate: previousStartIso,
        shiftQuoteDates,
        dateShiftDays,
        quoteVersionsShifted,
        itineraryDaysReanchored,
        quoteRewriteFromStatus,
        quoteRewriteQuotationId,
        quoteRewriteVersionId,
        rematchMatched,
        rematchUnmatched,
      },
    });
    return {
      ...updated,
      dateShiftDays,
      quoteVersionsShifted,
      itineraryDaysReanchored,
      quoteRewriteFromStatus,
      quoteRewriteQuotationId,
      quoteRewriteVersionId,
      rematchMatched,
      rematchUnmatched,
    };
  }

  /**
   * When travel start shifts and no draft exists, clone the newest locked commercial
   * quote (accepted → approved → sent) into a shifted + rematched draft.
   */
  private async createShiftedDraftFromLockedQuote(
    user: AuthUser,
    tripId: string,
    startIso: string,
    partyId: string | null,
  ): Promise<{
    quotationId: string;
    versionId: string;
    sourceStatus: CommercialQuoteRewriteStatus;
    dateShiftDays: number;
    rematchMatched: number;
    rematchUnmatched: number;
  } | null> {
    const locked = await this.prisma.quotationVersion.findMany({
      where: {
        status: { in: ['accepted', 'approved', 'sent'] },
        quotation: { tripId, organizationId: user.organizationId },
      },
      select: {
        id: true,
        status: true,
        acceptedAt: true,
        updatedAt: true,
        currency: true,
        itemsJson: true,
        inclusions: true,
        exclusions: true,
        terms: true,
        exchangeRatesJson: true,
        discountTotal: true,
        quotationId: true,
      },
    });
    const pick = pickCommercialQuoteSourceForRewrite(locked);
    if (!pick) return null;
    const source = locked.find((v) => v.id === pick.id);
    if (!source) return null;

    const items: QuotationItem[] = [];
    const raw = Array.isArray(source.itemsJson) ? source.itemsJson : [];
    for (const row of raw) {
      const parsed = QuotationItemSchema.safeParse(row);
      if (parsed.success) items.push(parsed.data);
    }
    if (!items.length) return null;

    const reminted = remintQuoteItems(items, 'shift');
    const { items: shifted, shiftDays } = shiftQuoteItemsToTripStart(
      reminted,
      startIso,
    );
    const tripTravellerRows = await this.prisma.tripTraveller.findMany({
      where: { tripId },
      select: {
        isLead: true,
        traveller: { select: { nationality: true } },
      },
    });
    const rematch = await rematchQuoteItemsFromRates(
      this.rates,
      user.organizationId,
      shifted,
      {
        startDate: startIso,
        partyId,
        ...resolveNationalityOptsFromTripTravellers(tripTravellerRows),
        destinationPlaceOfSupply:
          (
            await this.prisma.trip.findFirst({
              where: { id: tripId },
              select: { destinationPlaceOfSupply: true },
            })
          )?.destinationPlaceOfSupply ?? null,
      },
    );
    const totals = calcQuoteTotals(
      rematch.items,
      Number(source.discountTotal) || 0,
    );

    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    const validUntil = defaultValidUntilDate(
      quoteValidityDaysFromSettings(org?.settingsJson),
    );
    const count = await this.prisma.quotation.count({
      where: { organizationId: user.organizationId },
    });
    const currency = normalizeCurrency(source.currency || 'INR');
    const quotation = await this.prisma.quotation.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        quoteNumber: `QT-${String(count + 1).padStart(5, '0')}`,
        versions: {
          create: {
            versionNumber: 1,
            label: `v1 (date shift from ${pick.status})`,
            status: 'draft',
            currency,
            validUntil,
            itemsJson: rematch.items as unknown as Prisma.InputJsonValue,
            inclusions: source.inclusions,
            exclusions: source.exclusions,
            terms: syncTermsWithValidUntil(source.terms, validUntil),
            exchangeRatesJson: (parseQuoteFxLock(source.exchangeRatesJson) != null
              ? source.exchangeRatesJson
              : quoteFxLockToJson(sameCurrencyLock(currency))) as Prisma.InputJsonValue,
            ...totals,
            createdBy: user.sub,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const version = quotation.versions[0];
    if (!version) return null;

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.create_from_date_shift',
      entityType: 'quotation',
      entityId: quotation.id,
      metadata: {
        sourceVersionId: source.id,
        sourceQuotationId: source.quotationId,
        sourceStatus: pick.status,
        dateShiftDays: shiftDays,
        rematchMatched: rematch.matchedCount,
        rematchUnmatched: rematch.unmatchedCount,
      },
    });

    return {
      quotationId: quotation.id,
      versionId: version.id,
      sourceStatus: pick.status,
      dateShiftDays: shiftDays,
      rematchMatched: rematch.matchedCount,
      rematchUnmatched: rematch.unmatchedCount,
    };
  }

  /** Align trip story day dates to trip.startDate + (dayNumber − 1). */
  private async reanchorTripItineraryDays(
    organizationId: string,
    tripId: string,
    tripStartDate: Date | null,
  ): Promise<boolean> {
    if (!tripStartDate) return false;
    const itinerary = await this.prisma.itinerary.findFirst({
      where: { tripId, organizationId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const version = itinerary?.versions[0];
    if (!version) return false;
    const content =
      version.contentJson &&
      typeof version.contentJson === 'object' &&
      !Array.isArray(version.contentJson)
        ? { ...(version.contentJson as Record<string, unknown>) }
        : {};
    const rawDays = Array.isArray(content.days) ? content.days : [];
    if (!rawDays.length) return false;
    const { days, changed } = reanchorItineraryDaysToTripStart(
      rawDays as Array<Record<string, unknown> & { dayNumber?: number; date?: string | null }>,
      tripStartDate,
    );
    if (!changed) return false;
    await this.prisma.itineraryVersion.update({
      where: { id: version.id },
      data: {
        contentJson: { ...content, days } as Prisma.InputJsonValue,
        versionLock: { increment: 1 },
      },
    });
    return true;
  }

  async list(
    organizationId: string,
    page = 1,
    pageSize = 20,
    q?: string,
    status?: string,
    partyId?: string,
    travelFrom?: string | null,
    travelTo?: string | null,
  ) {
    const startDateFilter: Prisma.DateTimeNullableFilter | undefined = (() => {
      const gte =
        travelFrom && /^\d{4}-\d{2}-\d{2}$/.test(travelFrom)
          ? new Date(`${travelFrom}T00:00:00.000Z`)
          : undefined;
      const lte =
        travelTo && /^\d{4}-\d{2}-\d{2}$/.test(travelTo)
          ? new Date(`${travelTo}T23:59:59.999Z`)
          : undefined;
      if (!gte && !lte) return undefined;
      return {
        ...(gte ? { gte } : {}),
        ...(lte ? { lte } : {}),
      };
    })();

    const where: Prisma.TripWhereInput = {
      organizationId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(partyId ? { partyId } : {}),
      ...(startDateFilter ? { startDate: startDateFilter } : {}),
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
        organization: { select: { currency: true, settingsJson: true, kind: true, taxLabel: true, timezone: true } },
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

    const inferredDestinationPlaceOfSupply =
      inferDestinationPlaceOfSupplyFromLabels(
        await placeAncestorLabelsForRefs(
          this.prisma,
          user.organizationId,
          trip.destinationsJson,
        ),
      );

    return {
      ...trip,
      travellers,
      quotations,
      inferredDestinationPlaceOfSupply,
    };
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
        nationality: input.nationality
          ? normalizeHotelNationality(input.nationality) ?? input.nationality.trim().toUpperCase()
          : null,
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

  async updateTraveller(
    user: AuthUser,
    tripId: string,
    travellerId: string,
    input: UpdateTravellerInput,
  ) {
    await this.getWorkspace(user, tripId);
    const link = await this.prisma.tripTraveller.findFirst({
      where: {
        tripId,
        travellerId,
        traveller: { organizationId: user.organizationId, deletedAt: null },
      },
    });
    if (!link) throw new NotFoundException('Traveller not found on this trip');

    const data: {
      nationality?: string | null;
      fullName?: string;
      type?: string;
      updatedBy: string;
    } = { updatedBy: user.sub };

    if (input.nationality !== undefined) {
      data.nationality = input.nationality
        ? normalizeHotelNationality(input.nationality) ??
          input.nationality.trim().toUpperCase()
        : null;
    }
    if (input.fullName != null && input.fullName.trim()) {
      data.fullName = input.fullName.trim();
    }
    if (input.type) data.type = input.type;

    const traveller = await this.prisma.traveller.update({
      where: { id: travellerId },
      data,
    });

    const linkPatch: { isLead?: boolean; roomAllocation?: string | null } = {};
    if (input.isLead !== undefined) linkPatch.isLead = input.isLead;
    if (input.roomAllocation !== undefined) {
      if (input.roomAllocation == null || !String(input.roomAllocation).trim()) {
        linkPatch.roomAllocation = null;
      } else {
        const normalized = normalizeRoomAllocation(input.roomAllocation);
        if (!normalized) {
          throw new BadRequestException(
            'Invalid roomAllocation — use R1, R2, or a room number',
          );
        }
        linkPatch.roomAllocation = normalized;
      }
    }

    if (linkPatch.isLead === true) {
      await this.prisma.$transaction([
        this.prisma.tripTraveller.updateMany({
          where: { tripId },
          data: { isLead: false },
        }),
        this.prisma.tripTraveller.update({
          where: { tripId_travellerId: { tripId, travellerId } },
          data: {
            isLead: true,
            ...(linkPatch.roomAllocation !== undefined
              ? { roomAllocation: linkPatch.roomAllocation }
              : {}),
          },
        }),
      ]);
    } else if (Object.keys(linkPatch).length > 0) {
      await this.prisma.tripTraveller.update({
        where: { tripId_travellerId: { tripId, travellerId } },
        data: linkPatch,
      });
    }

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
