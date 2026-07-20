import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  allotmentHoldWarnMessage,
} from '../inventory/hotel-allocation-quantity';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../files/files.service';
import { MetaCloudMessagingProvider } from '../messaging/meta-cloud.messaging';
import { DriverService } from '../driver/driver.service';
import type { AuthUser } from '../../common/helpers';
import {
  parseBusinessContact,
  parseOrgBranding,
} from '../../common/customer-proposal';
import { inferDestinationPlaceOfSupplyFromLabels } from '../../common/destination-pos-infer';
import { placeAncestorLabelsForRefs } from '../../common/place-refs';
import { resolveQuoteTaxIdentityForDisplay } from '../../common/quote-tax-identity';
import type {
  ConfirmTripPaymentLinkInput,
  CreateFinanceReportPackInput,
  MarkTripVouchersWhatsappSentInput,
  SendHotelEnquiryWhatsappInput,
  SendTripPaymentLinkWhatsappInput,
  SendTripVouchersEmailInput,
  SendTripVouchersWhatsappInput,
  UpdateFinanceReportPackInput,
} from '@wayrune/contracts';
import {
  buildCustomerInstalmentPlan,
  dueDateFromPaymentTerms,
  instalmentScheduleSourceLabel,
  normalizeInstalmentPercentSteps,
  partyCreditLimitBlockMessage,
  percentStepsFromTermsText,
} from '@wayrune/contracts';
import { loadEnv } from '@wayrune/config';
import { hasPermission } from '@wayrune/auth';
import { evaluatePartyCreditStatus } from '../parties/party-credit-limit';
import {
  hotelBookingTitle,
  hotelLinesFromQuoteItems,
  hotelLinesMissingSupplier,
  hotelStayWindow,
  lineBuyTotal,
  lineSellTotal,
  type QuoteLineLike,
} from './hotel-quote-booking';
import {
  assertCanConfirmBooking,
  isBookingComponentStatus,
} from './booking-status';
import {
  transferBookingTitle,
  transferCapacityStampFromLine,
  transferLinesFromQuoteItems,
  transferLinesMissingSupplier,
  transferServiceWindow,
  type TransferQuoteLineLike,
} from './transfer-quote-booking';
import {
  activityBookingTitle,
  activityLinesFromQuoteItems,
  activityLinesMissingSupplier,
  activityServiceWindow,
  type ActivityQuoteLineLike,
} from './activity-quote-booking';
import {
  composeHotelEnquiryWhatsappText,
  normalizeWhatsappPhone,
} from './hotel-enquiry-whatsapp';
import { composeTransferEnquiryWhatsappText } from './transfer-enquiry-whatsapp';
import { composeActivityEnquiryWhatsappText } from './activity-enquiry-whatsapp';
import { composePaymentLinkWhatsappText } from './payment-link-whatsapp';
import {
  allowMockTripPayments,
  assertRazorpayOrderBound,
  outstandingToPaise,
} from './payment-link-checkout';
import {
  composePublicPaymentTaxDisplay,
  formatReceivableTaxNotes,
} from './payment-link-tax-display';
import {
  composeHotelVouchersEmailBody,
  composeHotelVouchersWhatsappText,
  isEligibleHotelVoucherBooking,
  MAX_VOUCHER_PDF_ATTACHMENTS,
  selectVoucherBookingsForMarkSent,
  voucherLineFromBooking,
} from './hotel-voucher-whatsapp';
import {
  composeHotelPayableCommercialDocument,
  HOTEL_PAYABLE_LINKED_ENTITY,
} from './hotel-payable-commercial-document';
import {
  commercialDocumentPaidState,
  composeCustomerReceivableCommercialDocument,
  composeCustomerReceivableSettlePaymentRecord,
  composeSupplierPayableSettlePaymentRecord,
  TRIP_PAYMENT_LINKED_ENTITY,
} from './hotel-payable-settle';
import { buildHotelVoucherPdf } from './hotel-voucher-pdf';
import { buildTransferVoucherPdf } from './transfer-voucher-pdf';
import { buildActivityVoucherPdf } from './activity-voucher-pdf';
import { buildTripControlSummary } from './trip-control';
import { mapSupplierListRow, supplierListInclude } from './supplier-list';
import {
  buildMovementBoard,
  movementWindow,
  type MovementBoardBooking,
  type MovementBoardTripFinance,
} from './movement-board';
import { buildFinanceAging } from './finance-aging';
import { buildFinancePortfolio } from './finance-portfolio';
import { parseOrgFxRates } from '../quotations/quote-fx';
import {
  assertCanRequestWriteOff,
  parseTripPaymentWriteOff,
  planApproveWriteOff,
  planRequestWriteOff,
  tripPaymentOutstanding,
} from './trip-payment-write-off';
import {
  agingBoardToCsv,
  portfolioBoardToCsv,
} from './finance-report-pack-csv';
import {
  listFinanceReportPacksFromSettings,
  upsertFinanceReportPackInSettings,
} from './finance-report-packs';
import {
  formatFleetUnitLabel,
  mergeTransferAssignment,
  parseTransferAssignment,
  transferAssignmentInterval,
} from './transfer-assignment';
import { OutboxService } from '../outbox/outbox.service';

const DEFAULT_READINESS = [
  'All bookings confirmed',
  'Vouchers issued',
  'Traveller documents collected',
  'Customer balance settled',
  'Emergency contacts recorded',
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class OperationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private inventory: InventoryService,
    private notifications: NotificationsService,
    private files: FilesService,
    private messaging: MetaCloudMessagingProvider,
    private outbox: OutboxService,
    private driver: DriverService,
  ) {}

  private async ensureTrip(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  /**
   * Resolve + validate transfer assignment patch.
   * Rejects unknown drivers / fleet units (and units not on the driver’s linked asset).
   */
  private async resolveTransferAssignmentPatch(
    organizationId: string,
    existingJson: unknown,
    patch: {
      driverSupplierId?: string | null;
      vehicleLabel?: string | null;
      fleetUnitId?: string | null;
    },
  ): Promise<Record<string, unknown>> {
    let vehicleLabel = patch.vehicleLabel;
    let fleetUnitId = patch.fleetUnitId;
    let driverSupplierId = patch.driverSupplierId;

    const mergedPreview = mergeTransferAssignment(existingJson, {
      ...(driverSupplierId !== undefined ? { driverSupplierId } : {}),
      ...(vehicleLabel !== undefined ? { vehicleLabel } : {}),
      ...(fleetUnitId !== undefined ? { fleetUnitId } : {}),
    });
    const next = parseTransferAssignment(mergedPreview);

    if (driverSupplierId !== undefined && next.driverSupplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: {
          id: next.driverSupplierId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true, linkedAssetId: true, type: true, name: true },
      });
      if (!supplier) {
        throw new BadRequestException('Driver supplier not found in this agency');
      }
    }

    if (fleetUnitId !== undefined && next.fleetUnitId) {
      const unit = await this.prisma.assetFleetUnit.findFirst({
        where: { id: next.fleetUnitId, deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          plateNumber: true,
          assetId: true,
          asset: { select: { organizationId: true, deletedAt: true } },
        },
      });
      if (!unit || unit.asset.deletedAt) {
        throw new BadRequestException('Fleet unit not found or inactive');
      }
      // Prefer supplier linked to the driver’s partner asset when a driver is set.
      if (next.driverSupplierId) {
        const supplier = await this.prisma.supplier.findFirst({
          where: {
            id: next.driverSupplierId,
            organizationId,
            deletedAt: null,
          },
          select: { linkedAssetId: true },
        });
        if (supplier?.linkedAssetId && supplier.linkedAssetId !== unit.assetId) {
          throw new BadRequestException(
            'Fleet unit does not belong to the selected driver’s linked asset',
          );
        }
      }
      fleetUnitId = unit.id;
      if (vehicleLabel === undefined || vehicleLabel == null || !String(vehicleLabel).trim()) {
        vehicleLabel = formatFleetUnitLabel(unit);
      }
    } else if (fleetUnitId !== undefined && fleetUnitId?.trim() && !next.fleetUnitId) {
      // cleared — ok
    }

    return mergeTransferAssignment(existingJson, {
      ...(patch.driverSupplierId !== undefined
        ? { driverSupplierId: patch.driverSupplierId }
        : {}),
      ...(vehicleLabel !== undefined ? { vehicleLabel } : {}),
      ...(fleetUnitId !== undefined ? { fleetUnitId } : {}),
    });
  }

  /**
   * Block double-book of the same driver or fleet unit unless allowConflict.
   */
  private async assertTransferAssignmentFree(
    organizationId: string,
    bookingId: string,
    input: {
      driverSupplierId: string | null;
      fleetUnitId: string | null;
      startAt: Date | null;
      endAt: Date | null;
      tripStartDate: Date | null;
      allowConflict?: boolean;
    },
  ) {
    if (input.allowConflict) return;
    if (!input.driverSupplierId && !input.fleetUnitId) return;
    const selfInterval = transferAssignmentInterval({
      startAt: input.startAt,
      endAt: input.endAt,
      tripStartDate: input.tripStartDate,
    });
    if (!selfInterval) return;

    const orFilters: Prisma.BookingComponentWhereInput[] = [];
    if (input.driverSupplierId) {
      orFilters.push({
        travellerRequirementsJson: {
          path: 'driverSupplierId',
          equals: input.driverSupplierId,
        },
      });
    }
    if (input.fleetUnitId) {
      orFilters.push({
        travellerRequirementsJson: {
          path: 'fleetUnitId',
          equals: input.fleetUnitId,
        },
      });
    }

    const peers = await this.prisma.bookingComponent.findMany({
      where: {
        organizationId,
        type: 'transfer',
        status: { notIn: ['cancelled', 'rejected'] },
        id: { not: bookingId },
        OR: orFilters,
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        travellerRequirementsJson: true,
        trip: { select: { tripNumber: true, startDate: true } },
      },
      take: 200,
    });

    const conflicts: string[] = [];
    for (const peer of peers) {
      const a = parseTransferAssignment(peer.travellerRequirementsJson);
      const sameDriver =
        input.driverSupplierId &&
        a.driverSupplierId &&
        a.driverSupplierId === input.driverSupplierId;
      const sameUnit =
        input.fleetUnitId && a.fleetUnitId && a.fleetUnitId === input.fleetUnitId;
      if (!sameDriver && !sameUnit) continue;
      const peerInt = transferAssignmentInterval({
        startAt: peer.startAt,
        endAt: peer.endAt,
        tripStartDate: peer.trip.startDate,
      });
      if (!peerInt) continue;
      if (
        selfInterval.start.getTime() < peerInt.end.getTime() &&
        peerInt.start.getTime() < selfInterval.end.getTime()
      ) {
        const kind = sameUnit ? 'vehicle' : 'driver';
        conflicts.push(
          `${kind} overlap with ${peer.trip.tripNumber || 'trip'} · ${peer.title}`,
        );
      }
    }
    if (conflicts.length) {
      throw new BadRequestException(
        `Assignment conflict: ${conflicts.slice(0, 3).join('; ')}${
          conflicts.length > 3 ? ` (+${conflicts.length - 3} more)` : ''
        }. Clear the other booking, change the day, or pass allowConflict=true to override.`,
      );
    }
  }

  /** Sync partner DriverJob; returns status for UI honesty (never throws). */
  private async softSyncDriverJob(
    user: AuthUser,
    trip: { tripNumber?: string | null; title?: string | null; startDate?: Date | null },
    booking: {
      id: string;
      type: string;
      title: string;
      status: string;
      startAt: Date | null;
      endAt: Date | null;
      costAmount: Prisma.Decimal | null;
      currency: string;
      travellerRequirementsJson?: unknown;
    },
  ): Promise<{
    ok: boolean;
    skipped?: string;
    failed?: string;
    jobId?: string;
    softConflict?: boolean;
    allocationId?: string;
  } | null> {
    if (booking.type !== 'transfer') return null;
    try {
      const assignment = parseTransferAssignment(booking.travellerRequirementsJson);
      const result = await this.driver.syncFromAgencyTransfer({
        agencyOrganizationId: user.organizationId,
        actorUserId: user.sub,
        booking: {
          id: booking.id,
          type: booking.type,
          title: booking.title,
          status: booking.status,
          startAt: booking.startAt,
          endAt: booking.endAt,
          costAmount: booking.costAmount,
          currency: booking.currency || 'INR',
          tripNumber: trip.tripNumber,
          tripTitle: trip.title,
          tripStartDate: trip.startDate ?? null,
        },
        driverSupplierId: assignment.driverSupplierId,
        vehicleLabel: assignment.vehicleLabel,
        fleetUnitId: assignment.fleetUnitId,
      });
      if (result && 'skipped' in result) {
        return { ok: false, skipped: result.skipped };
      }
      if (result && 'id' in result) {
        return {
          ok: true,
          jobId: result.id,
          softConflict: result.softConflict,
          allocationId: result.allocationId,
        };
      }
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        failed: e instanceof Error ? e.message : 'Driver job sync failed',
      };
    }
  }

  async listSuppliers(
    organizationId: string,
    opts?: { q?: string; type?: string; placeId?: string },
  ) {
    const q = opts?.q?.trim();
    const types = opts?.type
      ?.split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const rows = await this.prisma.supplier.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(types?.length === 1
          ? { type: types[0] }
          : types?.length
            ? { type: { in: types } }
            : {}),
        ...(opts?.placeId ? { placeId: opts.placeId } : {}),
        ...(q
          ? {
              OR: [{ name: { contains: q } }, { email: { contains: q } }],
            }
          : {}),
      },
      include: supplierListInclude,
      orderBy: { name: 'asc' },
      take: 50,
    });
    return rows.map(mapSupplierListRow);
  }

  async getSupplier(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: supplierId,
        organizationId,
        deletedAt: null,
      },
      include: {
        linkedOrganization: {
          select: { id: true, name: true, kind: true, slug: true },
        },
        linkedAsset: {
          select: { id: true, name: true, assetKind: true },
        },
        place: { select: { id: true, name: true, kind: true, key: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async createSupplier(
    user: AuthUser,
    input: {
      name: string;
      type?: string;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
      placeId?: string | null;
      linkedAssetId?: string | null;
      profileJson?: Record<string, unknown>;
    },
  ) {
    if (input.placeId) {
      const place = await this.prisma.place.findFirst({
        where: {
          id: input.placeId,
          deletedAt: null,
          isActive: true,
          OR: [
            { isSystem: true, organizationId: null },
            { organizationId: user.organizationId },
          ],
        },
        select: { id: true },
      });
      if (!place) throw new NotFoundException('Place not found');
    }
    if (input.linkedAssetId) {
      const asset = await this.prisma.partnerAsset.findFirst({
        where: {
          id: input.linkedAssetId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!asset) throw new NotFoundException('Partner asset not found');
    }
    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId: user.organizationId,
        name: input.name,
        type: input.type || 'other',
        email: input.email || null,
        phone: input.phone || null,
        notes: input.notes || null,
        placeId: input.placeId || null,
        linkedAssetId: input.linkedAssetId || null,
        profileJson: input.profileJson
          ? (input.profileJson as Prisma.InputJsonValue)
          : undefined,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'supplier.create',
      entityType: 'supplier',
      entityId: supplier.id,
    });
    return supplier;
  }

  async updateSupplier(
    user: AuthUser,
    supplierId: string,
    input: {
      name?: string;
      type?: string;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
      placeId?: string | null;
      linkedAssetId?: string | null;
      profileJson?: Record<string, unknown>;
    },
  ) {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        id: supplierId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    if (input.placeId) {
      const place = await this.prisma.place.findFirst({
        where: {
          id: input.placeId,
          deletedAt: null,
          isActive: true,
          OR: [
            { isSystem: true, organizationId: null },
            { organizationId: user.organizationId },
          ],
        },
        select: { id: true },
      });
      if (!place) throw new NotFoundException('Place not found');
    }
    if (input.linkedAssetId) {
      const asset = await this.prisma.partnerAsset.findFirst({
        where: { id: input.linkedAssetId, deletedAt: null },
        select: { id: true },
      });
      if (!asset) throw new NotFoundException('Partner asset not found');
    }

    const supplier = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.placeId !== undefined
          ? { placeId: input.placeId || null }
          : {}),
        ...(input.linkedAssetId !== undefined
          ? { linkedAssetId: input.linkedAssetId || null }
          : {}),
        ...(input.profileJson !== undefined
          ? { profileJson: input.profileJson as Prisma.InputJsonValue }
          : {}),
      },
      include: {
        linkedOrganization: { select: { id: true, name: true, kind: true } },
        linkedAsset: { select: { id: true, name: true, assetKind: true } },
        place: { select: { id: true, name: true, kind: true, key: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'supplier.update',
      entityType: 'supplier',
      entityId: supplier.id,
    });
    return supplier;
  }

  async listBookings(user: AuthUser, tripId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    return this.prisma.bookingComponent.findMany({
      where: { tripId, organizationId: user.organizationId },
      include: {
        supplier: true,
        invoices: {
          where: { status: { not: 'cancelled' } },
          select: { id: true, invoiceNumber: true, status: true },
          take: 3,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * From an accepted quotation: create hotel BookingComponents + ServiceRequests (status sent).
   * Idempotent on (tripId, quotationLineId).
   */
  async materializeHotelBookingsFromAcceptedQuote(
    organizationId: string,
    actorUserId: string | null,
    tripId: string,
    opts?: { versionId?: string },
  ): Promise<{
    created: number;
    skipped: number;
    bookingIds: string[];
    warnings: string[];
    allotmentHolds: number;
  }> {
    await this.ensureTrip(organizationId, tripId);

    let version = opts?.versionId
      ? await this.prisma.quotationVersion.findFirst({
          where: {
            id: opts.versionId,
            status: 'accepted',
            quotation: { tripId, organizationId },
          },
        })
      : null;
    if (!version) {
      version = await this.prisma.quotationVersion.findFirst({
        where: {
          status: 'accepted',
          quotation: { tripId, organizationId },
        },
        orderBy: { acceptedAt: 'desc' },
      });
    }
    if (!version) {
      throw new BadRequestException('No accepted quotation version for this trip');
    }

    const warnings: string[] = [];
    const missingSupplier = hotelLinesMissingSupplier(version.itemsJson);
    for (const line of missingSupplier.slice(0, 5)) {
      warnings.push(
        `Hotel line “${(line.description || line.id || 'hotel').trim()}” has no supplier — add supplier then run From accepted quote`,
      );
    }
    if (missingSupplier.length > 5) {
      warnings.push(`(+${missingSupplier.length - 5} more hotel lines without supplier)`);
    }

    const lines = hotelLinesFromQuoteItems(version.itemsJson);
    const currency =
      (typeof version.currency === 'string' && version.currency.trim()) || 'INR';
    let created = 0;
    let skipped = 0;
    let allotmentHolds = 0;
    const bookingIds: string[] = [];
    const inventoryUser = await this.inventoryActorUser(organizationId, actorUserId);

    for (const line of lines) {
      const lineId = line.id!.trim();
      const existing = await this.prisma.bookingComponent.findFirst({
        where: {
          tripId,
          organizationId,
          quotationLineId: lineId,
        },
      });
      if (existing) {
        skipped += 1;
        bookingIds.push(existing.id);
        if (!existing.serviceRequestId) {
          await this.ensureEnquiryServiceRequest(
            organizationId,
            actorUserId,
            existing.id,
            line,
          );
        }
        const hold = await this.tryHotelAllotmentHold(inventoryUser, existing);
        if (hold.held) allotmentHolds += 1;
        if (hold.warning) warnings.push(hold.warning);
        continue;
      }

      const supplierId = line.details!.supplierId!;
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId, deletedAt: null },
        select: { id: true, linkedAssetId: true, name: true },
      });
      if (!supplier) {
        skipped += 1;
        warnings.push(
          `Supplier missing for “${hotelBookingTitle(line)}” — restore supplier or rematch before ops`,
        );
        continue;
      }

      const { startAt, endAt } = hotelStayWindow(line.details);
      const costAmount = lineBuyTotal(line);
      const quotedAmount = lineSellTotal(line);
      const rooms = Math.max(1, Math.floor(Number(line.details?.rooms) || 1));

      const booking = await this.prisma.bookingComponent.create({
        data: {
          organizationId,
          tripId,
          type: 'hotel',
          title: hotelBookingTitle(line),
          supplierId: supplier.id,
          partnerAssetId: supplier.linkedAssetId || null,
          quotationLineId: lineId,
          status: 'requested',
          startAt,
          endAt,
          costAmount: costAmount != null ? new Prisma.Decimal(costAmount) : null,
          quotedAmount:
            quotedAmount != null ? new Prisma.Decimal(quotedAmount) : null,
          requiredQuantity: new Prisma.Decimal(rooms),
          currency,
          travellerRequirementsJson: {
            roomType: line.details?.roomType ?? null,
            ...(typeof line.details?.roomProductId === 'string' &&
            line.details.roomProductId.trim()
              ? { roomProductId: line.details.roomProductId.trim() }
              : {}),
            mealPlan: line.details?.mealPlan ?? null,
            nights: line.details?.nights ?? null,
            rooms,
            checkIn: line.details?.checkIn ?? null,
            checkOut: line.details?.checkOut ?? null,
          } as Prisma.InputJsonValue,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await this.ensureEnquiryServiceRequest(
        organizationId,
        actorUserId,
        booking.id,
        line,
      );

      const hold = await this.tryHotelAllotmentHold(inventoryUser, booking);
      if (hold.held) allotmentHolds += 1;
      if (hold.warning) warnings.push(hold.warning);

      created += 1;
      bookingIds.push(booking.id);
    }

    if (created > 0) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: tripId },
        select: { status: true },
      });
      if (trip?.status === 'confirmed') {
        await this.prisma.trip.update({
          where: { id: tripId },
          data: {
            status: 'booking_in_progress',
            updatedBy: actorUserId,
          },
        });
      }
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'booking.materialize_from_quote',
        entityType: 'trip',
        entityId: tripId,
        metadata: {
          versionId: version.id,
          created,
          skipped,
          bookingIds,
          warnings,
          allotmentHolds,
        },
      });
    } else if (warnings.length || allotmentHolds > 0) {
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'booking.materialize_from_quote_warnings',
        entityType: 'trip',
        entityId: tripId,
        metadata: { versionId: version.id, skipped, warnings, allotmentHolds },
      });
    }

    return { created, skipped, bookingIds, warnings, allotmentHolds };
  }

  /** Synthetic actor so accept/public materialize can place allotment holds. */
  private async inventoryActorUser(
    organizationId: string,
    actorUserId: string | null,
  ): Promise<AuthUser> {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { kind: true },
    });
    return {
      sub: actorUserId || 'system',
      email: '',
      organizationId,
      membershipId: '',
      permissions: [],
      organizationKind: org?.kind || 'travel_agency',
    };
  }

  private async tryHotelAllotmentHold(
    user: AuthUser,
    booking: {
      id: string;
      type: string;
      status: string;
      title?: string | null;
      supplierId: string | null;
      partnerAssetId: string | null;
      startAt: Date | null;
      endAt: Date | null;
      requiredQuantity?: unknown;
      travellerRequirementsJson?: unknown;
    },
  ): Promise<{ held: boolean; warning: string | null }> {
    const result = await this.inventory.syncBookingInventory(user, {
      id: booking.id,
      type: booking.type,
      status: booking.status,
      supplierId: booking.supplierId,
      partnerAssetId: booking.partnerAssetId,
      startAt: booking.startAt,
      endAt: booking.endAt,
      requiredQuantity: booking.requiredQuantity as
        | number
        | string
        | { toString(): string }
        | null
        | undefined,
      travellerRequirementsJson: booking.travellerRequirementsJson,
    });
    const title = (booking.title || 'Hotel').trim() || 'Hotel';
    const warning = allotmentHoldWarnMessage(title, result);
    const held = Boolean(result && result.ok && result.allocationId);
    return { held, warning };
  }

  async materializeTransferBookingsFromAcceptedQuote(
    organizationId: string,
    actorUserId: string | null,
    tripId: string,
    opts?: { versionId?: string },
  ): Promise<{
    created: number;
    skipped: number;
    bookingIds: string[];
    warnings: string[];
  }> {
    await this.ensureTrip(organizationId, tripId);

    let version = opts?.versionId
      ? await this.prisma.quotationVersion.findFirst({
          where: {
            id: opts.versionId,
            status: 'accepted',
            quotation: { tripId, organizationId },
          },
        })
      : null;
    if (!version) {
      version = await this.prisma.quotationVersion.findFirst({
        where: {
          status: 'accepted',
          quotation: { tripId, organizationId },
        },
        orderBy: { acceptedAt: 'desc' },
      });
    }
    if (!version) {
      throw new BadRequestException('No accepted quotation version for this trip');
    }

    const warnings: string[] = [];
    const missingSupplier = transferLinesMissingSupplier(version.itemsJson);
    for (const line of missingSupplier.slice(0, 5)) {
      warnings.push(
        `Transfer line “${(line.description || line.id || 'transfer').trim()}” has no supplier — add supplier then run From accepted quote`,
      );
    }
    if (missingSupplier.length > 5) {
      warnings.push(
        `(+${missingSupplier.length - 5} more transfer lines without supplier)`,
      );
    }

    const lines = transferLinesFromQuoteItems(version.itemsJson);
    const currency =
      (typeof version.currency === 'string' && version.currency.trim()) || 'INR';
    let created = 0;
    let skipped = 0;
    const bookingIds: string[] = [];

    for (const line of lines) {
      const lineId = line.id!.trim();
      const existing = await this.prisma.bookingComponent.findFirst({
        where: {
          tripId,
          organizationId,
          quotationLineId: lineId,
        },
      });
      if (existing) {
        skipped += 1;
        bookingIds.push(existing.id);
        if (!existing.serviceRequestId) {
          await this.ensureEnquiryServiceRequest(
            organizationId,
            actorUserId,
            existing.id,
            line,
          );
        }
        continue;
      }

      const supplierId = line.details!.supplierId!;
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId, deletedAt: null },
        select: { id: true, linkedAssetId: true, name: true },
      });
      if (!supplier) {
        skipped += 1;
        warnings.push(
          `Supplier missing for “${transferBookingTitle(line)}” — restore supplier or rematch before ops`,
        );
        continue;
      }

      const { startAt, endAt } = transferServiceWindow(line.details);
      const costAmount = lineBuyTotal(line);
      const quotedAmount = lineSellTotal(line);
      const vehicles = Math.max(
        1,
        Math.floor(Number(line.details?.vehicles) || Number(line.quantity) || 1),
      );
      const capacityStamp = transferCapacityStampFromLine(line);

      const booking = await this.prisma.bookingComponent.create({
        data: {
          organizationId,
          tripId,
          type: 'transfer',
          title: transferBookingTitle(line),
          supplierId: supplier.id,
          partnerAssetId: supplier.linkedAssetId || null,
          quotationLineId: lineId,
          status: 'requested',
          startAt,
          endAt,
          costAmount: costAmount != null ? new Prisma.Decimal(costAmount) : null,
          quotedAmount:
            quotedAmount != null ? new Prisma.Decimal(quotedAmount) : null,
          requiredQuantity: new Prisma.Decimal(vehicles),
          currency,
          travellerRequirementsJson: {
            fromPlaceId: line.details?.fromPlaceId ?? null,
            toPlaceId: line.details?.toPlaceId ?? null,
            fromPlaceName: line.details?.fromPlaceName ?? null,
            toPlaceName: line.details?.toPlaceName ?? null,
            vehicleTypeId: line.details?.vehicleTypeId ?? null,
            vehicleTypeName:
              line.details?.vehicleTypeName ||
              line.details?.vehicleName ||
              null,
            serviceDate:
              line.details?.serviceDate || line.details?.checkIn || null,
            vehicles,
            ...(capacityStamp.adults != null ? { adults: capacityStamp.adults } : {}),
            ...(capacityStamp.children != null
              ? { children: capacityStamp.children }
              : {}),
            ...(capacityStamp.vehicleSeats != null
              ? { vehicleSeats: capacityStamp.vehicleSeats }
              : {}),
          } as Prisma.InputJsonValue,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await this.ensureEnquiryServiceRequest(
        organizationId,
        actorUserId,
        booking.id,
        line,
      );

      created += 1;
      bookingIds.push(booking.id);
    }

    if (created > 0) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: tripId },
        select: { status: true },
      });
      if (trip?.status === 'confirmed') {
        await this.prisma.trip.update({
          where: { id: tripId },
          data: {
            status: 'booking_in_progress',
            updatedBy: actorUserId,
          },
        });
      }
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'booking.materialize_transfer_from_quote',
        entityType: 'trip',
        entityId: tripId,
        metadata: {
          versionId: version.id,
          created,
          skipped,
          bookingIds,
          warnings,
        },
      });
    } else if (warnings.length) {
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'booking.materialize_transfer_from_quote_warnings',
        entityType: 'trip',
        entityId: tripId,
        metadata: { versionId: version.id, skipped, warnings },
      });
    }

    return { created, skipped, bookingIds, warnings };
  }

  /**
   * From an accepted quotation: create activity BookingComponents + ServiceRequests (status sent).
   * Idempotent on (tripId, quotationLineId).
   */
  async materializeActivityBookingsFromAcceptedQuote(
    organizationId: string,
    actorUserId: string | null,
    tripId: string,
    opts?: { versionId?: string },
  ): Promise<{
    created: number;
    skipped: number;
    bookingIds: string[];
    warnings: string[];
  }> {
    await this.ensureTrip(organizationId, tripId);

    let version = opts?.versionId
      ? await this.prisma.quotationVersion.findFirst({
          where: {
            id: opts.versionId,
            status: 'accepted',
            quotation: { tripId, organizationId },
          },
        })
      : null;
    if (!version) {
      version = await this.prisma.quotationVersion.findFirst({
        where: {
          status: 'accepted',
          quotation: { tripId, organizationId },
        },
        orderBy: { acceptedAt: 'desc' },
      });
    }
    if (!version) {
      throw new BadRequestException('No accepted quotation version for this trip');
    }

    const warnings: string[] = [];
    const missingSupplier = activityLinesMissingSupplier(version.itemsJson);
    for (const line of missingSupplier.slice(0, 5)) {
      warnings.push(
        `Activity line “${(line.description || line.id || 'activity').trim()}” has no supplier — add supplier then run From accepted quote`,
      );
    }
    if (missingSupplier.length > 5) {
      warnings.push(
        `(+${missingSupplier.length - 5} more activity lines without supplier)`,
      );
    }

    const lines = activityLinesFromQuoteItems(version.itemsJson);
    const currency =
      (typeof version.currency === 'string' && version.currency.trim()) || 'INR';
    let created = 0;
    let skipped = 0;
    const bookingIds: string[] = [];

    for (const line of lines) {
      const lineId = line.id!.trim();
      const existing = await this.prisma.bookingComponent.findFirst({
        where: {
          tripId,
          organizationId,
          quotationLineId: lineId,
        },
      });
      if (existing) {
        skipped += 1;
        bookingIds.push(existing.id);
        if (!existing.serviceRequestId) {
          await this.ensureEnquiryServiceRequest(
            organizationId,
            actorUserId,
            existing.id,
            line,
          );
        }
        continue;
      }

      const supplierId = line.details!.supplierId!;
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId, deletedAt: null },
        select: { id: true, linkedAssetId: true, name: true },
      });
      if (!supplier) {
        skipped += 1;
        warnings.push(
          `Supplier missing for “${activityBookingTitle(line)}” — restore supplier or rematch before ops`,
        );
        continue;
      }

      const { startAt, endAt } = activityServiceWindow(line.details);
      const costAmount = lineBuyTotal(line);
      const quotedAmount = lineSellTotal(line);
      const adults = Math.max(0, Math.floor(Number(line.details?.adults) || 0));
      const children = Math.max(
        0,
        Math.floor(Number(line.details?.children) || 0),
      );
      const pax =
        adults + children > 0
          ? adults + children
          : Math.max(1, Math.floor(Number(line.quantity) || 1));

      const booking = await this.prisma.bookingComponent.create({
        data: {
          organizationId,
          tripId,
          type: 'activity',
          title: activityBookingTitle(line),
          supplierId: supplier.id,
          partnerAssetId: supplier.linkedAssetId || null,
          quotationLineId: lineId,
          status: 'requested',
          startAt,
          endAt,
          costAmount: costAmount != null ? new Prisma.Decimal(costAmount) : null,
          quotedAmount:
            quotedAmount != null ? new Prisma.Decimal(quotedAmount) : null,
          requiredQuantity: new Prisma.Decimal(pax),
          currency,
          travellerRequirementsJson: {
            activityName:
              line.details?.activityName || line.description || null,
            placeId: line.details?.placeId ?? null,
            placeName: line.details?.placeName ?? null,
            serviceDate:
              line.details?.serviceDate || line.details?.checkIn || null,
            privateOrSic: line.details?.privateOrSic ?? null,
            adults: adults || null,
            children: children || null,
          } as Prisma.InputJsonValue,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await this.ensureEnquiryServiceRequest(
        organizationId,
        actorUserId,
        booking.id,
        line,
      );

      created += 1;
      bookingIds.push(booking.id);
    }

    if (created > 0) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: tripId },
        select: { status: true },
      });
      if (trip?.status === 'confirmed') {
        await this.prisma.trip.update({
          where: { id: tripId },
          data: {
            status: 'booking_in_progress',
            updatedBy: actorUserId,
          },
        });
      }
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'booking.materialize_activity_from_quote',
        entityType: 'trip',
        entityId: tripId,
        metadata: {
          versionId: version.id,
          created,
          skipped,
          bookingIds,
          warnings,
        },
      });
    } else if (warnings.length) {
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'booking.materialize_activity_from_quote_warnings',
        entityType: 'trip',
        entityId: tripId,
        metadata: { versionId: version.id, skipped, warnings },
      });
    }

    return { created, skipped, bookingIds, warnings };
  }

  /** Hotel + transfer + activity materialize for Ops “from accepted quote”. */
  async materializeBookingsFromAcceptedQuote(
    organizationId: string,
    actorUserId: string | null,
    tripId: string,
    opts?: { versionId?: string },
  ) {
    const hotel = await this.materializeHotelBookingsFromAcceptedQuote(
      organizationId,
      actorUserId,
      tripId,
      opts,
    );
    const transfer = await this.materializeTransferBookingsFromAcceptedQuote(
      organizationId,
      actorUserId,
      tripId,
      opts,
    );
    const activity = await this.materializeActivityBookingsFromAcceptedQuote(
      organizationId,
      actorUserId,
      tripId,
      opts,
    );
    return {
      created: hotel.created + transfer.created + activity.created,
      skipped: hotel.skipped + transfer.skipped + activity.skipped,
      bookingIds: [
        ...hotel.bookingIds,
        ...transfer.bookingIds,
        ...activity.bookingIds,
      ],
      allotmentHolds: hotel.allotmentHolds,
      warnings: [
        ...(hotel.warnings || []),
        ...(transfer.warnings || []),
        ...(activity.warnings || []),
      ],
      hotel,
      transfer,
      activity,
    };
  }

  private async ensureEnquiryServiceRequest(
    organizationId: string,
    actorUserId: string | null,
    bookingId: string,
    line: QuoteLineLike | TransferQuoteLineLike | ActivityQuoteLineLike,
  ) {
    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, organizationId },
    });
    if (!booking) return;
    if (booking.serviceRequestId) return;

    const rateSnapshot =
      line.rateProvenance && typeof line.rateProvenance === 'object'
        ? (line.rateProvenance as Prisma.InputJsonValue)
        : undefined;

    const serviceType =
      booking.type === 'transfer'
        ? 'TRANSFER'
        : booking.type === 'activity'
          ? 'ACTIVITY'
          : 'STAY';

    const transferDetails = line.details as TransferQuoteLineLike['details'];
    const activityDetails = line.details as ActivityQuoteLineLike['details'];

    const sr = await this.prisma.serviceRequest.create({
      data: {
        buyerOrganizationId: organizationId,
        supplierId: booking.supplierId,
        partnerAssetId: booking.partnerAssetId,
        serviceType,
        title: booking.title,
        status: 'sent',
        tripId: booking.tripId,
        quotationLineId: booking.quotationLineId,
        serviceStartAt: booking.startAt,
        serviceEndAt: booking.endAt,
        quantity: booking.requiredQuantity,
        quotedAmount: booking.quotedAmount ?? booking.costAmount,
        agreedAmount: booking.costAmount,
        currency: booking.currency,
        rateSnapshotJson: rateSnapshot,
        sourceEntityType: 'quotation_line',
        sourceEntityId: booking.quotationLineId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        items: {
          create: {
            bookingComponentId: booking.id,
            quantity: booking.requiredQuantity ?? 1,
            selected: false,
            status: 'sent',
            agreedAmount: booking.costAmount,
            currency: booking.currency,
            rateSnapshotJson: rateSnapshot,
            requestedTermsJson: {
              startAt: booking.startAt?.toISOString() ?? null,
              endAt: booking.endAt?.toISOString() ?? null,
              title: booking.title,
              roomType: line.details?.roomType ?? null,
              mealPlan: line.details?.mealPlan ?? null,
              fromPlaceId: transferDetails?.fromPlaceId ?? null,
              toPlaceId: transferDetails?.toPlaceId ?? null,
              vehicleTypeId: transferDetails?.vehicleTypeId ?? null,
              activityName: activityDetails?.activityName ?? null,
              placeId: activityDetails?.placeId ?? null,
              privateOrSic: activityDetails?.privateOrSic ?? null,
            } as Prisma.InputJsonValue,
          },
        },
      },
    });

    await this.prisma.bookingComponent.update({
      where: { id: booking.id },
      data: { serviceRequestId: sr.id, updatedBy: actorUserId },
    });
  }

  /** Idempotent supplier invoice + scheduled payment when a booking is confirmed. */
  async ensurePayableOnBookingConfirm(
    user: AuthUser,
    tripId: string,
    bookingId: string,
  ) {
    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
    });
    if (!booking || booking.status !== 'confirmed' || !booking.supplierId) {
      return null;
    }

    let invoice = await this.prisma.supplierInvoice.findFirst({
      where: {
        organizationId: user.organizationId,
        tripId,
        bookingComponentId: bookingId,
        status: { not: 'cancelled' },
      },
    });
    if (!invoice) {
      const amount = Number(
        booking.confirmedAmount ?? booking.costAmount ?? booking.quotedAmount ?? 0,
      );
      if (!Number.isFinite(amount) || amount <= 0) return null;

      const invoiceNumber = `AUTO-${booking.id.slice(-8).toUpperCase()}`;
      invoice = await this.createSupplierInvoice(user, tripId, {
        supplierId: booking.supplierId,
        invoiceNumber,
        amount: round2(amount),
        currency: booking.currency,
        dueAt: booking.startAt ? booking.startAt.toISOString() : null,
        notes: `Auto payable on confirm · ${booking.title}`,
        bookingComponentId: booking.id,
        createPaymentSchedule: true,
      });
    }

    await this.ensureHotelPayableCommercialDocument(user, tripId, booking, invoice);
    return invoice;
  }

  /**
   * Dual-write a payable CommercialDocument for a confirmed hotel booking.
   * Idempotent on (booking_component, payable). Settle sync deferred.
   */
  private async ensureHotelPayableCommercialDocument(
    user: AuthUser,
    tripId: string,
    booking: {
      id: string;
      title: string;
      supplierId: string | null;
      serviceRequestId: string | null;
      currency: string;
      startAt: Date | null;
    },
    invoice: {
      invoiceNumber: string;
      amount: Prisma.Decimal | number | { toString(): string };
      currency: string;
      dueAt: Date | null;
      notes: string | null;
    },
  ) {
    if (!booking.supplierId) return null;

    const existing = await this.prisma.commercialDocument.findFirst({
      where: {
        organizationId: user.organizationId,
        direction: 'payable',
        linkedEntityType: HOTEL_PAYABLE_LINKED_ENTITY,
        linkedEntityId: booking.id,
      },
    });
    if (existing) return existing;

    const amount = Number(invoice.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const payload = composeHotelPayableCommercialDocument({
      bookingId: booking.id,
      tripId,
      supplierId: booking.supplierId,
      serviceRequestId: booking.serviceRequestId,
      bookingTitle: booking.title,
      invoiceNumber: invoice.invoiceNumber,
      amount,
      currency: invoice.currency || booking.currency,
      dueAt: invoice.dueAt?.toISOString() ??
        (booking.startAt ? booking.startAt.toISOString() : null),
      notes: invoice.notes,
    });

    const doc = await this.prisma.commercialDocument.create({
      data: {
        organizationId: user.organizationId,
        docType: payload.docType,
        direction: payload.direction,
        supplierId: payload.supplierId,
        linkedEntityType: payload.linkedEntityType,
        linkedEntityId: payload.linkedEntityId,
        tripId: payload.tripId,
        serviceRequestId: payload.serviceRequestId,
        documentNumber: payload.documentNumber,
        label: payload.label,
        amount: new Prisma.Decimal(payload.amount),
        currency: payload.currency,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
        notes: payload.notes,
        createdBy: user.sub,
        lines: {
          create: payload.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitAmount: l.unitAmount,
            taxAmount: 0,
          })),
        },
      },
      include: { lines: true },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'commercial_document.auto_payable',
      entityType: 'commercial_document',
      entityId: doc.id,
      metadata: {
        tripId,
        bookingId: booking.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: payload.amount,
      },
    });

    return doc;
  }

  /** Mark voucher note and tick “Vouchers issued” when all confirmed hotels have notes. */
  async markBookingVouchered(
    user: AuthUser,
    tripId: string,
    bookingId: string,
    note?: string | null,
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'confirmed') {
      throw new BadRequestException('Confirm the booking before marking vouchered');
    }

    const voucherNote =
      (note && note.trim()) ||
      [
        'Confirmed',
        booking.confirmationRef,
        booking.startAt
          ? booking.startAt.toISOString().slice(0, 10)
          : null,
        booking.endAt ? booking.endAt.toISOString().slice(0, 10) : null,
      ]
        .filter(Boolean)
        .join(' · ');

    const updated = await this.prisma.bookingComponent.update({
      where: { id: bookingId },
      data: { voucherNote, updatedBy: user.sub },
      include: { supplier: true },
    });

    const voucherable = await this.prisma.bookingComponent.findMany({
      where: {
        tripId,
        organizationId: user.organizationId,
        type: { in: ['hotel', 'transfer', 'activity'] },
        status: 'confirmed',
      },
      select: { voucherNote: true },
    });
    const allVouchered =
      voucherable.length > 0 &&
      voucherable.every((h) => Boolean(h.voucherNote?.trim()));
    if (allVouchered) {
      await this.prisma.tripReadinessItem.updateMany({
        where: { tripId, label: 'Vouchers issued' },
        data: { done: true },
      });
    }

    return updated;
  }

  /** Customer hotel/transfer/activity voucher PDF for a confirmed + vouchered booking. */
  async generateHotelVoucherPdf(
    user: AuthUser,
    tripId: string,
    bookingId: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      include: {
        party: { select: { displayName: true } },
        travellers: {
          include: { traveller: { select: { fullName: true } } },
          orderBy: [{ isLead: 'desc' }],
        },
        organization: {
          select: { name: true, brandingJson: true, settingsJson: true },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (
      booking.type !== 'hotel' &&
      booking.type !== 'transfer' &&
      booking.type !== 'activity'
    ) {
      throw new BadRequestException(
        'Voucher PDF is only available for hotel, transfer, or activity bookings',
      );
    }
    if (booking.status !== 'confirmed') {
      throw new BadRequestException('Confirm the booking before generating a voucher');
    }
    if (!booking.voucherNote?.trim()) {
      throw new BadRequestException('Mark the booking vouchered before generating a PDF');
    }

    const req =
      booking.travellerRequirementsJson &&
      typeof booking.travellerRequirementsJson === 'object' &&
      !Array.isArray(booking.travellerRequirementsJson)
        ? (booking.travellerRequirementsJson as Record<string, unknown>)
        : {};
    const str = (v: unknown) =>
      typeof v === 'string' && v.trim() ? v.trim() : null;
    const num = (v: unknown) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const branding = parseOrgBranding(
      trip.organization.brandingJson,
      trip.organization.name,
    );
    const contact = parseBusinessContact(trip.organization.settingsJson);
    const guestNames = trip.travellers
      .map((t) => t.traveller.fullName?.trim())
      .filter((n): n is string => Boolean(n));

    let pdfBuffer: Buffer;
    if (booking.type === 'transfer') {
      const supplierName =
        booking.supplier?.name?.trim() ||
        booking.title?.split('·')[0]?.trim() ||
        booking.title;
      const serviceDate =
        str(req.serviceDate) ||
        (booking.startAt ? booking.startAt.toISOString().slice(0, 10) : null);
      const vehicles = Math.max(
        1,
        num(req.vehicles) || Number(booking.requiredQuantity) || 1,
      );
      pdfBuffer = await buildTransferVoucherPdf({
        branding,
        tripNumber: trip.tripNumber,
        tripTitle: trip.title,
        partyName: trip.party?.displayName || null,
        guestNames,
        supplierName,
        fromPlace: str(req.fromPlaceName),
        toPlace: str(req.toPlaceName),
        vehicleName:
          str(req.vehicleTypeName) ||
          str(req.vehicleLabel) ||
          str(req.vehicleName),
        vehicles,
        serviceDate,
        confirmationRef: booking.confirmationRef,
        agencyPhone: contact.phone || contact.emergencyPhone || null,
      });
    } else if (booking.type === 'activity') {
      const activityName =
        str(req.activityName) ||
        booking.title?.trim() ||
        'Activity';
      const serviceDate =
        str(req.serviceDate) ||
        (booking.startAt ? booking.startAt.toISOString().slice(0, 10) : null);
      pdfBuffer = await buildActivityVoucherPdf({
        branding,
        tripNumber: trip.tripNumber,
        tripTitle: trip.title,
        partyName: trip.party?.displayName || null,
        guestNames,
        activityName,
        supplierName: booking.supplier?.name?.trim() || null,
        placeName: str(req.placeName),
        serviceDate,
        privateOrSic: str(req.privateOrSic),
        adults: num(req.adults),
        children: num(req.children),
        confirmationRef: booking.confirmationRef,
        agencyPhone: contact.phone || contact.emergencyPhone || null,
      });
    } else {
      const checkIn =
        str(req.checkIn) ||
        (booking.startAt ? booking.startAt.toISOString().slice(0, 10) : null);
      const checkOut =
        str(req.checkOut) ||
        (booking.endAt ? booking.endAt.toISOString().slice(0, 10) : null);
      const rooms = Math.max(
        1,
        num(req.rooms) || Number(booking.requiredQuantity) || 1,
      );
      const nights = num(req.nights);
      const hotelName =
        booking.supplier?.name?.trim() ||
        booking.title?.split('·')[0]?.trim() ||
        booking.title;

      pdfBuffer = await buildHotelVoucherPdf({
        branding,
        tripNumber: trip.tripNumber,
        tripTitle: trip.title,
        partyName: trip.party?.displayName || null,
        guestNames,
        hotelName,
        roomType: str(req.roomType),
        mealPlan: str(req.mealPlan),
        rooms,
        nights,
        checkIn,
        checkOut,
        confirmationRef: booking.confirmationRef,
        agencyPhone: contact.phone || contact.emergencyPhone || null,
      });
    }

    const safeRef = (booking.confirmationRef || booking.id.slice(-8))
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 40);
    const fileName = `voucher-${safeRef}.pdf`;

    const doc = await this.files.upload({
      organizationId: user.organizationId,
      userId: user.sub,
      entityType: 'booking_component',
      entityId: booking.id,
      fileName,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      visibility: 'customer',
    });

    return {
      documentId: doc.id,
      contentUrl: doc.contentUrl,
      fileName: doc.name,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey,
    };
  }

  /**
   * Send hotel room enquiry to supplier via WhatsApp Cloud.
   * When Cloud is not configured, returns a wa.me fallback without changing status.
   */
  async sendHotelEnquiryWhatsapp(
    user: AuthUser,
    tripId: string,
    bookingId: string,
    input: SendHotelEnquiryWhatsappInput,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      include: {
        party: { select: { displayName: true } },
        organization: {
          select: { name: true, brandingJson: true, settingsJson: true },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (
      booking.type !== 'hotel' &&
      booking.type !== 'transfer' &&
      booking.type !== 'activity'
    ) {
      throw new BadRequestException(
        'WhatsApp enquiry is only for hotel, transfer, or activity bookings',
      );
    }
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new BadRequestException('Cannot enquire on a cancelled booking');
    }
    if (booking.status === 'confirmed') {
      throw new BadRequestException('Booking is already confirmed');
    }

    const phoneRaw =
      (input.toPhone && input.toPhone.trim()) ||
      booking.supplier?.phone?.trim() ||
      '';
    const digits = normalizeWhatsappPhone(phoneRaw);
    if (!digits) {
      throw new BadRequestException(
        'Supplier has no WhatsApp number — add a phone on the supplier or enter one to send',
      );
    }

    const req =
      booking.travellerRequirementsJson &&
      typeof booking.travellerRequirementsJson === 'object' &&
      !Array.isArray(booking.travellerRequirementsJson)
        ? (booking.travellerRequirementsJson as Record<string, unknown>)
        : {};
    const str = (v: unknown) =>
      typeof v === 'string' && v.trim() ? v.trim() : null;
    const num = (v: unknown) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const branding = parseOrgBranding(
      trip.organization.brandingJson,
      trip.organization.name,
    );
    const supplierName =
      booking.supplier?.name?.trim() ||
      booking.title?.split('·')[0]?.trim() ||
      booking.title;
    const defaultText =
      booking.type === 'transfer'
        ? composeTransferEnquiryWhatsappText({
            agencyName: branding.companyName,
            supplierName,
            tripNumber: trip.tripNumber,
            tripTitle: trip.title,
            guestName: trip.party?.displayName || null,
            bookingTitle: booking.title,
            serviceDate:
              str(req.serviceDate) ||
              (booking.startAt
                ? booking.startAt.toISOString().slice(0, 10)
                : null),
            fromPlaceName: str(req.fromPlaceName),
            toPlaceName: str(req.toPlaceName),
            vehicleName: str(req.vehicleTypeName) || str(req.vehicleLabel),
            vehicles: num(req.vehicles) || Number(booking.requiredQuantity) || 1,
          })
        : booking.type === 'activity'
          ? composeActivityEnquiryWhatsappText({
              agencyName: branding.companyName,
              supplierName,
              tripNumber: trip.tripNumber,
              tripTitle: trip.title,
              guestName: trip.party?.displayName || null,
              bookingTitle: booking.title,
              serviceDate:
                str(req.serviceDate) ||
                (booking.startAt
                  ? booking.startAt.toISOString().slice(0, 10)
                  : null),
              placeName: str(req.placeName),
              privateOrSic: str(req.privateOrSic),
              adults: num(req.adults),
              children: num(req.children),
            })
          : composeHotelEnquiryWhatsappText({
              agencyName: branding.companyName,
              hotelName: supplierName,
              tripNumber: trip.tripNumber,
              tripTitle: trip.title,
              guestName: trip.party?.displayName || null,
              bookingTitle: booking.title,
              checkIn:
                str(req.checkIn) ||
                (booking.startAt
                  ? booking.startAt.toISOString().slice(0, 10)
                  : null),
              checkOut:
                str(req.checkOut) ||
                (booking.endAt
                  ? booking.endAt.toISOString().slice(0, 10)
                  : null),
              rooms: num(req.rooms) || Number(booking.requiredQuantity) || 1,
              roomType: str(req.roomType),
              mealPlan: str(req.mealPlan),
              nights: num(req.nights),
            });
    const text = (input.message?.trim() || defaultText).slice(0, 3500);
    const waMeUrl = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

    const cfg = await this.whatsappCloudConfig(user.organizationId);
    const cloudReady = Boolean(cfg.enabled && cfg.accessToken && cfg.phoneNumberId);
    if (!cloudReady) {
      return {
        sent: false,
        cloudConfigured: false,
        fallbackWaMeUrl: waMeUrl,
        requiresMarkSent: true,
        toPhone: digits,
        hotelName: supplierName,
        tripNumber: trip.tripNumber,
        message:
          'WhatsApp Cloud API is not configured — open WhatsApp to send manually, then mark enquiry as sent.',
      };
    }

    const demo = cfg.accessToken.startsWith('seed-demo-');
    let providerMessageId: string | undefined;
    if (!demo) {
      const result = await this.messaging.sendText({
        to: digits,
        text,
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
      });
      providerMessageId = result.providerMessageId;
    }

    if (booking.status === 'requested' || booking.status === 'pending') {
      await this.prisma.bookingComponent.update({
        where: { id: booking.id },
        data: { status: 'sent', updatedBy: user.sub },
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'booking.send_enquiry_whatsapp',
      entityType: 'booking_component',
      entityId: booking.id,
      metadata: {
        to: digits,
        demo,
        providerMessageId,
        tripId,
        supplierId: booking.supplierId,
      },
    });

    return {
      sent: true,
      cloudConfigured: true,
      demo,
      providerMessageId,
      toPhone: digits,
      hotelName: supplierName,
      tripNumber: trip.tripNumber,
      fallbackWaMeUrl: waMeUrl,
    };
  }

  /**
   * Staff confirms a manual WhatsApp enquiry (wa.me) — advances booking to sent.
   */
  async markEnquirySent(user: AuthUser, tripId: string, bookingId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'cancelled') {
      throw new BadRequestException('Cancelled bookings cannot be marked sent');
    }
    if (booking.status === 'confirmed') {
      return booking;
    }
    if (booking.status !== 'requested' && booking.status !== 'pending' && booking.status !== 'sent') {
      throw new BadRequestException(
        `Cannot mark enquiry sent from status “${booking.status}”`,
      );
    }
    const updated = await this.prisma.bookingComponent.update({
      where: { id: booking.id },
      data: { status: 'sent', updatedBy: user.sub },
      include: { supplier: true },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'booking.mark_enquiry_sent',
      entityType: 'booking_component',
      entityId: booking.id,
      metadata: { tripId, via: 'manual_wa_me' },
    });
    return updated;
  }

  private async whatsappCloudConfig(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
    const integrations = (settings.integrations ?? {}) as Record<string, unknown>;
    const wa = (integrations.whatsapp ?? {}) as Record<string, unknown>;
    return {
      enabled: Boolean(wa.enabled),
      phoneNumberId: typeof wa.phoneNumberId === 'string' ? wa.phoneNumberId : '',
      accessToken: typeof wa.accessToken === 'string' ? wa.accessToken : '',
    };
  }

  async createBooking(
    user: AuthUser,
    tripId: string,
    input: {
      type: string;
      title: string;
      supplierId?: string | null;
      status?: string;
      confirmationRef?: string | null;
      voucherNote?: string | null;
      costAmount?: number | null;
      startAt?: string | null;
      endAt?: string | null;
      driverSupplierId?: string | null;
      vehicleLabel?: string | null;
      fleetUnitId?: string | null;
      allowConflict?: boolean;
    },
  ) {
    const trip = await this.ensureTrip(user.organizationId, tripId);
    const assignment =
      input.type === 'transfer'
        ? await this.resolveTransferAssignmentPatch(
            user.organizationId,
            {},
            {
              driverSupplierId: input.driverSupplierId,
              vehicleLabel: input.vehicleLabel,
              fleetUnitId: input.fleetUnitId,
            },
          )
        : null;
    const startAt = input.startAt ? new Date(input.startAt) : null;
    const endAt = input.endAt ? new Date(input.endAt) : null;
    if (input.type === 'transfer' && assignment) {
      const next = parseTransferAssignment(assignment);
      await this.assertTransferAssignmentFree(user.organizationId, '', {
        driverSupplierId: next.driverSupplierId,
        fleetUnitId: next.fleetUnitId,
        startAt,
        endAt,
        tripStartDate: trip.startDate,
        allowConflict: Boolean(input.allowConflict),
      });
    }
    const booking = await this.prisma.bookingComponent.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        type: input.type,
        title: input.title,
        supplierId: input.supplierId || null,
        status: input.status || 'pending',
        confirmationRef: input.confirmationRef || null,
        voucherNote: input.voucherNote || null,
        costAmount: input.costAmount ?? null,
        startAt,
        endAt,
        ...(assignment && Object.keys(assignment).length
          ? { travellerRequirementsJson: assignment as Prisma.InputJsonValue }
          : {}),
        createdBy: user.sub,
        updatedBy: user.sub,
      },
      include: { supplier: true },
    });
    if (trip.status === 'confirmed') {
      await this.prisma.trip.update({
        where: { id: tripId },
        data: { status: 'booking_in_progress', updatedBy: user.sub },
      });
    }
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'booking.create',
      entityType: 'booking_component',
      entityId: booking.id,
      metadata: { tripId, type: booking.type, title: booking.title },
    });
    let driverJobSync: Awaited<ReturnType<OperationsService['softSyncDriverJob']>> =
      null;
    if (booking.type === 'transfer') {
      driverJobSync = await this.softSyncDriverJob(user, trip, booking);
    }
    return {
      ...booking,
      ...(driverJobSync ? { driverJobSync } : {}),
    };
  }

  async updateBooking(
    user: AuthUser,
    tripId: string,
    bookingId: string,
    input: {
      title?: string;
      type?: string;
      status?: string;
      confirmationRef?: string | null;
      voucherNote?: string | null;
      supplierId?: string | null;
      costAmount?: number | null;
      confirmedAmount?: number | null;
      quotedAmount?: number | null;
      startAt?: string | null;
      endAt?: string | null;
      driverSupplierId?: string | null;
      vehicleLabel?: string | null;
      fleetUnitId?: string | null;
      /** Ops override when intentionally double-booking. */
      allowConflict?: boolean;
      /** Hotel rooms (also stamped onto travellerRequirementsJson.rooms). */
      requiredQuantity?: number | null;
      /** Hotel room product id (stamped onto travellerRequirementsJson.roomProductId). */
      roomProductId?: string | null;
    },
  ) {
    const trip = await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Booking not found');

    if (input.status !== undefined && !isBookingComponentStatus(input.status)) {
      throw new BadRequestException(
        `Unknown booking status “${input.status}”`,
      );
    }

    const becomingConfirmed =
      input.status === 'confirmed' && existing.status !== 'confirmed';

    if (becomingConfirmed) {
      const confirmationRef =
        input.confirmationRef !== undefined
          ? input.confirmationRef
          : existing.confirmationRef;
      try {
        assertCanConfirmBooking({
          currentStatus: existing.status,
          confirmationRef,
        });
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Cannot confirm booking',
        );
      }
    }

    const nextType = input.type ?? existing.type;
    const rawRooms =
      input.requiredQuantity !== undefined && input.requiredQuantity != null
        ? Number(input.requiredQuantity)
        : NaN;
    const roomsQty = Number.isFinite(rawRooms)
      ? Math.min(50, Math.max(1, Math.floor(rawRooms)))
      : null;
    const hotelJsonTouched =
      (roomsQty != null || input.roomProductId !== undefined) &&
      (nextType === 'hotel' || existing.type === 'hotel');
    const hotelRoomsPatch = hotelJsonTouched
      ? (() => {
          const root =
            existing.travellerRequirementsJson &&
            typeof existing.travellerRequirementsJson === 'object' &&
            !Array.isArray(existing.travellerRequirementsJson)
              ? {
                  ...(existing.travellerRequirementsJson as Record<string, unknown>),
                }
              : {};
          if (roomsQty != null) root.rooms = roomsQty;
          if (input.roomProductId !== undefined) {
            const id =
              typeof input.roomProductId === 'string'
                ? input.roomProductId.trim()
                : '';
            if (id) root.roomProductId = id;
            else delete root.roomProductId;
          }
          return root;
        })()
      : null;

    const assignmentPatch =
      input.driverSupplierId !== undefined ||
      input.vehicleLabel !== undefined ||
      input.fleetUnitId !== undefined
        ? await this.resolveTransferAssignmentPatch(
            user.organizationId,
            existing.travellerRequirementsJson,
            {
              driverSupplierId: input.driverSupplierId,
              vehicleLabel: input.vehicleLabel,
              fleetUnitId: input.fleetUnitId,
            },
          )
        : null;

    const nextStartAt =
      input.startAt !== undefined
        ? input.startAt
          ? new Date(input.startAt)
          : null
        : existing.startAt;
    const nextEndAt =
      input.endAt !== undefined
        ? input.endAt
          ? new Date(input.endAt)
          : null
        : existing.endAt;
    const nextAssignment = parseTransferAssignment(
      assignmentPatch ?? existing.travellerRequirementsJson,
    );
    const assignmentOrDatesTouched =
      assignmentPatch != null ||
      input.startAt !== undefined ||
      input.endAt !== undefined ||
      input.status !== undefined;
    if (nextType === 'transfer' && assignmentOrDatesTouched) {
      await this.assertTransferAssignmentFree(user.organizationId, bookingId, {
        driverSupplierId: nextAssignment.driverSupplierId,
        fleetUnitId: nextAssignment.fleetUnitId,
        startAt: nextStartAt,
        endAt: nextEndAt,
        tripStartDate: trip.startDate,
        allowConflict: Boolean(input.allowConflict),
      });
    }

    let partnerAssetIdPatch: string | null | undefined;
    if (input.supplierId !== undefined) {
      if (input.supplierId) {
        const supplier = await this.prisma.supplier.findFirst({
          where: {
            id: input.supplierId,
            organizationId: user.organizationId,
            deletedAt: null,
          },
          select: { linkedAssetId: true },
        });
        if (!supplier) {
          throw new BadRequestException('Supplier not found');
        }
        partnerAssetIdPatch = supplier.linkedAssetId || null;
      } else {
        partnerAssetIdPatch = null;
      }
    } else if (
      nextType === 'transfer' &&
      input.driverSupplierId !== undefined
    ) {
      if (input.driverSupplierId) {
        const driver = await this.prisma.supplier.findFirst({
          where: {
            id: input.driverSupplierId,
            organizationId: user.organizationId,
            deletedAt: null,
          },
          select: { linkedAssetId: true },
        });
        partnerAssetIdPatch = driver?.linkedAssetId ?? null;
      } else {
        partnerAssetIdPatch = null;
      }
    }

    const booking = await this.prisma.bookingComponent.update({
      where: { id: bookingId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.confirmationRef !== undefined
          ? { confirmationRef: input.confirmationRef }
          : {}),
        ...(input.voucherNote !== undefined ? { voucherNote: input.voucherNote } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(partnerAssetIdPatch !== undefined
          ? { partnerAssetId: partnerAssetIdPatch }
          : {}),
        ...(input.startAt !== undefined
          ? { startAt: input.startAt ? new Date(input.startAt) : null }
          : {}),
        ...(input.endAt !== undefined
          ? { endAt: input.endAt ? new Date(input.endAt) : null }
          : {}),
        ...(assignmentPatch && nextType === 'transfer'
          ? {
              travellerRequirementsJson: assignmentPatch as Prisma.InputJsonValue,
            }
          : hotelRoomsPatch
            ? {
                travellerRequirementsJson: hotelRoomsPatch as Prisma.InputJsonValue,
              }
            : {}),
        ...(roomsQty != null
          ? { requiredQuantity: new Prisma.Decimal(roomsQty) }
          : {}),
        ...(input.costAmount !== undefined
          ? { costAmount: input.costAmount == null ? null : new Prisma.Decimal(input.costAmount) }
          : {}),
        ...(input.confirmedAmount !== undefined
          ? {
              confirmedAmount:
                input.confirmedAmount == null
                  ? null
                  : new Prisma.Decimal(input.confirmedAmount),
            }
          : becomingConfirmed &&
              existing.confirmedAmount == null &&
              (existing.costAmount != null || existing.quotedAmount != null)
            ? {
                confirmedAmount: existing.costAmount ?? existing.quotedAmount,
              }
            : {}),
        ...(input.quotedAmount !== undefined
          ? {
              quotedAmount:
                input.quotedAmount == null
                  ? null
                  : new Prisma.Decimal(input.quotedAmount),
            }
          : {}),
        updatedBy: user.sub,
      },
      include: { supplier: true },
    });
    if (
      input.status === 'confirmed' &&
      (trip.status === 'confirmed' || trip.status === 'booking_in_progress')
    ) {
      // Keep trip in booking workflow until readiness completes.
      if (trip.status === 'confirmed') {
        await this.prisma.trip.update({
          where: { id: tripId },
          data: { status: 'booking_in_progress', updatedBy: user.sub },
        });
      }
    }
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'booking.update',
      entityType: 'booking_component',
      entityId: booking.id,
      metadata: { tripId, status: booking.status },
    });
    let inventorySync:
      | {
          ok: true;
          allocationId?: string;
          released?: number;
          upgraded?: boolean;
          quantityResynced?: boolean;
          datesResynced?: boolean;
          assetRebound?: boolean;
          roomProductRematched?: boolean;
          fleetWindowResynced?: boolean;
          orphanReleased?: boolean;
        }
      | { ok: false; skipped?: string; failed?: string }
      | null = null;
    if (booking.status === 'confirmed' || booking.status === 'requested') {
      inventorySync = await this.inventory.syncBookingInventory(user, {
        id: booking.id,
        type: booking.type,
        status: booking.status,
        supplierId: booking.supplierId,
        partnerAssetId: booking.partnerAssetId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        requiredQuantity: booking.requiredQuantity,
        travellerRequirementsJson: booking.travellerRequirementsJson,
      });
    }
    let payableResult: {
      created: boolean;
      invoiceId: string | null;
      reason: string | null;
    } | null = null;
    if (becomingConfirmed) {
      try {
        const invoice = await this.ensurePayableOnBookingConfirm(
          user,
          tripId,
          bookingId,
        );
        if (invoice) {
          payableResult = {
            created: true,
            invoiceId: invoice.id,
            reason: null,
          };
        } else {
          const amount = Number(
            booking.confirmedAmount ??
              booking.costAmount ??
              booking.quotedAmount ??
              0,
          );
          const reason = !booking.supplierId
            ? 'No supplier on booking — add supplier then confirm again, or create payable in Finance'
            : !Number.isFinite(amount) || amount <= 0
              ? 'No buy/confirmed amount — set cost then confirm again, or create payable in Finance'
              : 'Payable was not created';
          payableResult = { created: false, invoiceId: null, reason };
          await this.audit.record({
            organizationId: user.organizationId,
            actorUserId: user.sub,
            action: 'booking.confirm_payable_skipped',
            entityType: 'booking_component',
            entityId: booking.id,
            metadata: { tripId, reason },
          });
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Payable creation failed';
        payableResult = { created: false, invoiceId: null, reason };
        await this.audit.record({
          organizationId: user.organizationId,
          actorUserId: user.sub,
          action: 'booking.confirm_payable_failed',
          entityType: 'booking_component',
          entityId: booking.id,
          metadata: { tripId, reason },
        });
      }
      // Advance linked SR to confirmed when booking is confirmed.
      if (booking.serviceRequestId) {
        await this.prisma.serviceRequest.updateMany({
          where: {
            id: booking.serviceRequestId,
            buyerOrganizationId: user.organizationId,
            status: { in: ['drafted', 'sent', 'negotiating'] },
          },
          data: {
            status: 'confirmed',
            confirmationRef: booking.confirmationRef,
            agreedAmount: booking.confirmedAmount ?? booking.costAmount,
            updatedBy: user.sub,
          },
        });
        await this.prisma.serviceRequestItem.updateMany({
          where: {
            serviceRequestId: booking.serviceRequestId,
            bookingComponentId: booking.id,
          },
          data: {
            status: 'confirmed',
            selected: true,
            agreedAmount: booking.confirmedAmount ?? booking.costAmount,
          },
        });
      }
    }
    const shouldSyncDriver =
      booking.type === 'transfer' &&
      (input.driverSupplierId !== undefined ||
        input.vehicleLabel !== undefined ||
        input.fleetUnitId !== undefined ||
        input.startAt !== undefined ||
        input.endAt !== undefined ||
        input.status !== undefined);
    let driverJobSync: Awaited<ReturnType<OperationsService['softSyncDriverJob']>> =
      null;
    if (shouldSyncDriver) {
      driverJobSync = await this.softSyncDriverJob(user, trip, booking);
    }
    return {
      ...booking,
      ...(payableResult ? { payable: payableResult } : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.upgraded
        ? { allotmentUpgraded: true as const, allocationId: inventorySync.allocationId }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.quantityResynced
        ? { allotmentQuantityResynced: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.datesResynced
        ? { allotmentDatesResynced: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.assetRebound
        ? { allotmentAssetRebound: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.roomProductRematched
        ? { allotmentRoomProductRematched: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.fleetWindowResynced
        ? { allotmentFleetWindowResynced: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.orphanReleased
        ? { allotmentOrphanReleased: true as const }
        : {}),
      ...(inventorySync && !inventorySync.ok && inventorySync.failed
        ? { allotmentSyncFailed: inventorySync.failed }
        : {}),
      ...(driverJobSync ? { driverJobSync } : {}),
    };
  }

  /** Soft-cancel a booking and cascade unpaid/open finance links. */
  async cancelBooking(user: AuthUser, tripId: string, bookingId: string) {
    const trip = await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Booking not found');
    if (existing.status === 'cancelled') {
      return this.prisma.bookingComponent.findFirstOrThrow({
        where: { id: bookingId },
        include: { supplier: true },
      });
    }

    const booking = await this.prisma.bookingComponent.update({
      where: { id: bookingId },
      data: { status: 'cancelled', updatedBy: user.sub },
      include: { supplier: true },
    });

    if (booking.type === 'transfer') {
      await this.softSyncDriverJob(user, trip, booking);
    }

    const unpaidPayments = await this.prisma.tripPayment.updateMany({
      where: {
        organizationId: user.organizationId,
        tripId,
        bookingComponentId: bookingId,
        status: { in: ['scheduled', 'partial', 'overdue'] },
        amountPaid: 0,
      },
      data: { status: 'cancelled', updatedBy: user.sub },
    });

    const openInvoices = await this.prisma.supplierInvoice.updateMany({
      where: {
        organizationId: user.organizationId,
        tripId,
        bookingComponentId: bookingId,
        status: { in: ['open', 'partial'] },
      },
      data: { status: 'cancelled', updatedBy: user.sub },
    });

    const openPayables = await this.prisma.commercialDocument.updateMany({
      where: {
        organizationId: user.organizationId,
        tripId,
        direction: 'payable',
        linkedEntityType: HOTEL_PAYABLE_LINKED_ENTITY,
        linkedEntityId: bookingId,
        status: { in: ['open', 'partial'] },
      },
      data: { status: 'cancelled' },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'booking.cancel',
      entityType: 'booking_component',
      entityId: booking.id,
      metadata: {
        tripId: trip.id,
        cancelledPayments: unpaidPayments.count,
        cancelledInvoices: openInvoices.count,
        cancelledPayableDocs: openPayables.count,
      },
    });

    await this.inventory.releaseForBooking(booking.id);

    return {
      ...booking,
      cascaded: {
        cancelledPayments: unpaidPayments.count,
        cancelledInvoices: openInvoices.count,
        cancelledPayableDocs: openPayables.count,
      },
    };
  }

  /** Hard-delete only unused pending bookings with no finance links. */
  async deleteBooking(user: AuthUser, tripId: string, bookingId: string) {
    const trip = await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
      include: {
        _count: { select: { payments: true, invoices: true } },
      },
    });
    if (!existing) throw new NotFoundException('Booking not found');
    if (existing.status === 'confirmed') {
      throw new BadRequestException('Confirmed bookings cannot be deleted — cancel instead');
    }
    if (existing._count.payments > 0 || existing._count.invoices > 0) {
      throw new BadRequestException(
        'Booking is linked to payments or invoices — cancel instead of delete',
      );
    }
    if (existing.type === 'transfer') {
      await this.softSyncDriverJob(user, trip, {
        ...existing,
        status: 'cancelled',
      });
    }
    await this.prisma.bookingComponent.delete({ where: { id: bookingId } });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'booking.delete',
      entityType: 'booking_component',
      entityId: bookingId,
      metadata: { tripId, title: existing.title },
    });
    return { deleted: true, id: bookingId };
  }

  async listPayments(user: AuthUser, tripId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    const payments = await this.prisma.tripPayment.findMany({
      where: { tripId, organizationId: user.organizationId },
      include: {
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
    return Promise.all(payments.map((p) => this.syncPaymentOverdue(p)));
  }

  private startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private computePaymentStatus(input: {
    status: string;
    amount: Prisma.Decimal | number;
    amountPaid: Prisma.Decimal | number;
    dueAt: Date | null;
  }) {
    if (input.status === 'cancelled' || input.status === 'paid') return input.status;
    const amount = Number(input.amount);
    const paid = Number(input.amountPaid);
    if (paid >= amount && amount > 0) return 'paid';
    if (paid > 0 && paid < amount) return 'partial';
    if (input.dueAt && input.dueAt < this.startOfToday()) return 'overdue';
    return 'scheduled';
  }

  private async syncPaymentOverdue<
    T extends {
      id: string;
      status: string;
      amount: Prisma.Decimal;
      amountPaid: Prisma.Decimal;
      dueAt: Date | null;
    },
  >(payment: T): Promise<T> {
    const next = this.computePaymentStatus(payment);
    if (next === payment.status) return payment;
    if (payment.status === 'cancelled' || payment.status === 'paid') return payment;
    const updated = await this.prisma.tripPayment.update({
      where: { id: payment.id },
      data: { status: next },
    });
    return { ...payment, ...updated };
  }

  private async assertCustomerPaymentCreditLimit(
    user: AuthUser,
    partyId: string | null | undefined,
    orgCurrency: string,
    amount: number,
    excludePaymentId?: string,
  ) {
    if (!partyId || !(amount > 0)) return;
    const status = await evaluatePartyCreditStatus(
      this.prisma,
      user.organizationId,
      partyId,
      {
        orgCurrency,
        pendingAmount: amount,
        excludePaymentId,
      },
    );
    if (
      status.overLimit &&
      !hasPermission(user.permissions, 'finance.credit_limit.override')
    ) {
      throw new BadRequestException(
        partyCreditLimitBlockMessage(status, status.currency),
      );
    }
  }

  async createPayment(
    user: AuthUser,
    tripId: string,
    input: {
      direction: 'customer' | 'supplier';
      label: string;
      amount: number;
      currency?: string;
      dueAt?: string | null;
      method?: string | null;
      reference?: string | null;
      notes?: string | null;
      supplierInvoiceId?: string | null;
      bookingComponentId?: string | null;
    },
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    if (!input.amount || input.amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const [org, trip] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: user.organizationId },
        select: { currency: true },
      }),
      this.prisma.trip.findFirst({
        where: { id: tripId, organizationId: user.organizationId },
        select: {
          partyId: true,
          startDate: true,
          party: { select: { paymentTerms: true } },
        },
      }),
    ]);
    const currency = (input.currency || org.currency || 'INR').toUpperCase();
    if (input.direction === 'customer') {
      await this.assertCustomerPaymentCreditLimit(
        user,
        trip?.partyId,
        currency,
        input.amount,
      );
    }
    let dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (
      !dueAt &&
      input.direction === 'customer' &&
      trip?.party?.paymentTerms?.trim()
    ) {
      dueAt = dueDateFromPaymentTerms(
        trip.party.paymentTerms,
        new Date(),
        trip.startDate,
      );
    }
    const status = this.computePaymentStatus({
      status: 'scheduled',
      amount: input.amount,
      amountPaid: 0,
      dueAt,
    });
    const payment = await this.prisma.tripPayment.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        direction: input.direction,
        label: input.label,
        amount: new Prisma.Decimal(input.amount),
        amountPaid: new Prisma.Decimal(0),
        currency,
        dueAt,
        method: input.method || null,
        reference: input.reference || null,
        notes: input.notes || null,
        supplierInvoiceId: input.supplierInvoiceId || null,
        bookingComponentId: input.bookingComponentId || null,
        status,
        createdBy: user.sub,
        updatedBy: user.sub,
      },
      include: {
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.create',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: { tripId, direction: payment.direction, amount: Number(payment.amount) },
    });
    if (payment.direction === 'customer') {
      await this.ensureCustomerReceivableCommercialDocument(user, tripId, payment);
    }
    return payment;
  }

  /**
   * Preview or create Advance/Balance (or story/%) customer instalments from
   * accepted-quote sell + party Net terms. Explicit staff action — not on accept.
   */
  async customerInstalmentSchedulePreview(user: AuthUser, tripId: string) {
    return this.buildCustomerInstalmentScheduleContext(user, tripId);
  }

  async scheduleCustomerInstalmentsFromTerms(user: AuthUser, tripId: string) {
    const preview = await this.buildCustomerInstalmentScheduleContext(user, tripId);
    if (!preview.canSchedule) {
      throw new BadRequestException(
        preview.blockReason || 'Cannot schedule instalments for this trip',
      );
    }
    if (preview.partyId) {
      await this.assertCustomerPaymentCreditLimit(
        user,
        preview.partyId,
        preview.currency,
        preview.sellTotal,
      );
    }

    const created = [];
    for (const row of preview.rows) {
      const payment = await this.createPayment(user, tripId, {
        direction: 'customer',
        label: row.label,
        amount: row.amount,
        currency: preview.currency,
        dueAt: row.dueAt,
        notes: `Scheduled from terms · ${preview.sourceLabel}`,
      });
      created.push(payment);
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.schedule_from_terms',
      entityType: 'trip',
      entityId: tripId,
      metadata: {
        count: created.length,
        sellTotal: preview.sellTotal,
        sourceLabel: preview.sourceLabel,
      },
    });

    return {
      ...preview,
      payments: created,
    };
  }

  private async buildCustomerInstalmentScheduleContext(
    user: AuthUser,
    tripId: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      select: {
        id: true,
        startDate: true,
        partyId: true,
        party: { select: { paymentTerms: true } },
        organization: { select: { currency: true } },
        quotations: {
          include: {
            versions: { orderBy: { versionNumber: 'desc' } },
          },
        },
        itineraries: {
          include: {
            versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
          },
          take: 1,
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const accepted = trip.quotations
      .flatMap((q) => q.versions)
      .find((v) => v.status === 'accepted');
    const currency = (
      accepted?.currency ||
      trip.organization.currency ||
      'INR'
    ).toUpperCase();
    const sellTotal = accepted ? Number(accepted.sellTotal) : 0;

    const existingCustomer = await this.prisma.tripPayment.count({
      where: {
        organizationId: user.organizationId,
        tripId,
        direction: 'customer',
        status: { not: 'cancelled' },
      },
    });

    let blockReason: string | null = null;
    if (!accepted) {
      blockReason = 'Accept a quote before scheduling customer instalments';
    } else if (!(sellTotal > 0)) {
      blockReason = 'Accepted quote has no sell total';
    } else if (existingCustomer > 0) {
      blockReason =
        'Customer instalments already exist — cancel or edit them before re-scheduling';
    }

    const storyContent = trip.itineraries[0]?.versions[0]?.contentJson;
    const story =
      storyContent &&
      typeof storyContent === 'object' &&
      !Array.isArray(storyContent) &&
      (storyContent as { story?: unknown }).story &&
      typeof (storyContent as { story: unknown }).story === 'object'
        ? ((storyContent as { story: Record<string, unknown> }).story as {
            paymentSchedule?: Array<{ label?: string; percent?: number }>;
          })
        : null;

    const storySteps = normalizeInstalmentPercentSteps(
      (story?.paymentSchedule || [])
        .map((s) => ({
          label: String(s.label || '').trim() || 'Instalment',
          percent: Number(s.percent),
        }))
        .filter((s) => Number.isFinite(s.percent)),
    );
    const termsSteps = percentStepsFromTermsText(accepted?.terms ?? null);
    const usedStorySteps = Boolean(storySteps);
    const usedTermsPercents = !usedStorySteps && Boolean(termsSteps);
    const steps = storySteps || termsSteps || null;

    const partyPaymentTerms = trip.party?.paymentTerms ?? null;
    const rows =
      sellTotal > 0
        ? buildCustomerInstalmentPlan({
            sellTotal,
            steps,
            partyPaymentTerms,
            tripStartDate: trip.startDate,
          })
        : [];

    const sourceLabel = instalmentScheduleSourceLabel({
      usedStorySteps,
      usedTermsPercents,
      partyPaymentTerms,
    });

    return {
      tripId,
      partyId: trip.partyId,
      currency,
      sellTotal,
      partyPaymentTerms,
      tripStartDate: trip.startDate
        ? trip.startDate.toISOString().slice(0, 10)
        : null,
      quoteVersionId: accepted?.id ?? null,
      quoteTerms: accepted?.terms ?? null,
      sourceLabel,
      rows,
      existingCustomerInstalments: existingCustomer,
      canSchedule: !blockReason && rows.length > 0,
      blockReason,
    };
  }

  async updatePayment(
    user: AuthUser,
    tripId: string,
    paymentId: string,
    input: {
      label?: string;
      amount?: number;
      currency?: string;
      dueAt?: string | null;
      method?: string | null;
      reference?: string | null;
      notes?: string | null;
      supplierInvoiceId?: string | null;
      bookingComponentId?: string | null;
    },
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    if (existing.status === 'paid') {
      throw new BadRequestException('Unmark paid before editing a paid payment');
    }
    if (existing.status === 'cancelled') {
      throw new BadRequestException('Cancelled payments cannot be edited');
    }
    const amount = input.amount ?? Number(existing.amount);
    if (existing.direction === 'customer' && input.amount !== undefined) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: tripId, organizationId: user.organizationId },
        select: { partyId: true },
      });
      const currency = (input.currency || existing.currency || 'INR').toUpperCase();
      await this.assertCustomerPaymentCreditLimit(
        user,
        trip?.partyId,
        currency,
        amount,
        paymentId,
      );
    }
    const dueAt =
      input.dueAt !== undefined
        ? input.dueAt
          ? new Date(input.dueAt)
          : null
        : existing.dueAt;
    const status = this.computePaymentStatus({
      status: existing.status,
      amount,
      amountPaid: existing.amountPaid,
      dueAt,
    });
    const payment = await this.prisma.tripPayment.update({
      where: { id: paymentId },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
        ...(input.dueAt !== undefined ? { dueAt } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.supplierInvoiceId !== undefined
          ? { supplierInvoiceId: input.supplierInvoiceId }
          : {}),
        ...(input.bookingComponentId !== undefined
          ? { bookingComponentId: input.bookingComponentId }
          : {}),
        // Amount/currency change invalidates any open Razorpay order.
        ...(input.amount !== undefined || input.currency !== undefined
          ? {
              paymentLinkRazorpayOrderId: null,
              paymentLinkRazorpayAmountPaise: null,
            }
          : {}),
        status,
        updatedBy: user.sub,
      },
      include: {
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.update',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: { tripId, before: { status: existing.status }, after: { status: payment.status } },
    });
    await this.syncReceivableCommercialDocumentDetails(user, tripId, payment);
    return payment;
  }

  async markPaymentPaid(
    user: AuthUser,
    tripId: string,
    paymentId: string,
    input?: { amountPaid?: number; method?: string | null; reference?: string | null },
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    return this.settlePaymentPaid(
      user.organizationId,
      tripId,
      paymentId,
      input,
      user.sub,
    );
  }

  /**
   * Mint (or refresh) a public checkout link for an unpaid customer instalment.
   */
  async createPaymentLink(
    user: AuthUser,
    tripId: string,
    paymentId: string,
    input: { regenerate?: boolean } = {},
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const payment = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.direction !== 'customer') {
      throw new BadRequestException('Payment links are only for customer receivables');
    }
    if (payment.status === 'paid' || payment.status === 'cancelled') {
      throw new BadRequestException('Cannot link a paid or cancelled instalment');
    }
    const outstanding = Math.max(
      0,
      Number(payment.amount) - Number(payment.amountPaid || 0),
    );
    if (outstanding <= 0) {
      throw new BadRequestException('Nothing outstanding on this instalment');
    }

    const regenerate = Boolean(input.regenerate);
    const tokenAlive =
      Boolean(payment.paymentLinkToken) &&
      (!payment.paymentLinkExpiresAt ||
        payment.paymentLinkExpiresAt.getTime() > Date.now());

    if (!regenerate && tokenAlive && payment.paymentLinkToken) {
      return {
        paymentId: payment.id,
        token: payment.paymentLinkToken,
        path: `/p/pay/${payment.paymentLinkToken}`,
        expiresAt: payment.paymentLinkExpiresAt?.toISOString() ?? null,
        amountDue: outstanding,
        currency: payment.currency,
        reused: true,
      };
    }

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await this.prisma.tripPayment.update({
      where: { id: payment.id },
      data: {
        paymentLinkToken: token,
        paymentLinkExpiresAt: expiresAt,
        paymentLinkRazorpayOrderId: null,
        paymentLinkRazorpayAmountPaise: null,
        updatedBy: user.sub,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.link_created',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: {
        tripId,
        expiresAt: expiresAt.toISOString(),
        regenerated: regenerate,
      },
    });

    await this.ensureCustomerReceivableCommercialDocument(user, tripId, payment);

    return {
      paymentId: updated.id,
      token,
      path: `/p/pay/${token}`,
      expiresAt: expiresAt.toISOString(),
      amountDue: outstanding,
      currency: updated.currency,
      reused: false,
    };
  }

  async markPaymentLinkSent(
    user: AuthUser,
    tripId: string,
    paymentId: string,
    input: { channel?: 'whatsapp' } = {},
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const payment = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.direction !== 'customer') {
      throw new BadRequestException('Payment links are only for customer receivables');
    }
    if (!payment.paymentLinkToken) {
      throw new BadRequestException('Create a payment link before marking it sent');
    }
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.link_whatsapp',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: {
        tripId,
        via: 'manual_wa_me',
        channel: input.channel || 'whatsapp',
        path: `/p/pay/${payment.paymentLinkToken}`,
      },
    });
    return {
      marked: true,
      paymentId: payment.id,
      path: `/p/pay/${payment.paymentLinkToken}`,
    };
  }

  /**
   * Bulk-send voucher summaries for a trip via WhatsApp Cloud (or wa.me fallback).
   * Eligible = hotel|transfer|activity + confirmed + non-empty voucherNote.
   * When Cloud is configured: text summary + up to MAX_VOUCHER_PDF_ATTACHMENTS PDF documents
   * (upload to Meta media API — no public file URLs required).
   */
  async sendTripVouchersWhatsapp(
    user: AuthUser,
    tripId: string,
    input: SendTripVouchersWhatsappInput = {},
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      include: {
        party: { select: { displayName: true, phone: true } },
        organization: { select: { name: true, brandingJson: true } },
        bookings: {
          where: { organizationId: user.organizationId },
          include: { supplier: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const eligible = trip.bookings.filter((b) =>
      isEligibleHotelVoucherBooking(b),
    );
    if (!eligible.length) {
      throw new BadRequestException(
        'No vouchered bookings on this trip — confirm hotel/transfer/activity and mark them vouchered first',
      );
    }

    const phoneRaw =
      (input.toPhone && input.toPhone.trim()) || trip.party?.phone?.trim() || '';
    const digits = normalizeWhatsappPhone(phoneRaw);
    if (!digits) {
      throw new BadRequestException(
        'Customer has no WhatsApp number — add a phone on the party or enter one to send',
      );
    }

    const branding = parseOrgBranding(
      trip.organization.brandingJson,
      trip.organization.name,
    );
    const hotels = eligible.map((b) =>
      voucherLineFromBooking({
        type: b.type,
        title: b.title,
        confirmationRef: b.confirmationRef,
        voucherNote: b.voucherNote,
        startAt: b.startAt,
        endAt: b.endAt,
        supplierName: b.supplier?.name,
        travellerRequirementsJson: b.travellerRequirementsJson,
      }),
    );

    const cfg = await this.whatsappCloudConfig(user.organizationId);
    const cloudReady = Boolean(cfg.enabled && cfg.accessToken && cfg.phoneNumberId);
    const willAttachPdfs = cloudReady;

    const defaultText = composeHotelVouchersWhatsappText({
      agencyName: branding.companyName,
      guestName: trip.party?.displayName || null,
      tripNumber: trip.tripNumber,
      tripTitle: trip.title,
      hotels,
      pdfAttached: willAttachPdfs,
    });
    const text = (input.message?.trim() || defaultText).slice(0, 3500);
    const waMeText = input.message?.trim()
      ? text
      : composeHotelVouchersWhatsappText({
          agencyName: branding.companyName,
          guestName: trip.party?.displayName || null,
          tripNumber: trip.tripNumber,
          tripTitle: trip.title,
          hotels,
          pdfAttached: false,
        });
    const waMeUrl = `https://wa.me/${digits}?text=${encodeURIComponent(waMeText)}`;

    if (!cloudReady) {
      return {
        sent: false,
        cloudConfigured: false,
        fallbackWaMeUrl: waMeUrl,
        toPhone: digits,
        tripNumber: trip.tripNumber,
        voucherCount: eligible.length,
        pdfAttachedCount: 0,
        bookingIds: eligible.map((b) => b.id),
        message:
          'WhatsApp Cloud API is not configured — open WhatsApp to send the voucher summary manually, or enable WhatsApp under Integrations. PDF vouchers attach only via Cloud API.',
      };
    }

    const demo = cfg.accessToken.startsWith('seed-demo-');
    let providerMessageId: string | undefined;
    if (!demo) {
      const result = await this.messaging.sendText({
        to: digits,
        text,
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
      });
      providerMessageId = result.providerMessageId;
    }

    const toAttach = eligible.slice(0, MAX_VOUCHER_PDF_ATTACHMENTS);
    const pdfAttachments: Array<{
      bookingId: string;
      documentId?: string;
      fileName?: string;
      providerMessageId?: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const booking of toAttach) {
      try {
        const doc = await this.generateHotelVoucherPdf(user, tripId, booking.id);
        if (demo) {
          pdfAttachments.push({
            bookingId: booking.id,
            documentId: doc.documentId,
            fileName: doc.fileName,
            ok: true,
          });
          continue;
        }
        const file = await this.files.readBuffer(
          user.organizationId,
          doc.documentId,
        );
        const uploaded = await this.messaging.uploadMedia({
          phoneNumberId: cfg.phoneNumberId,
          accessToken: cfg.accessToken,
          fileName: file.fileName,
          mimeType: file.mimeType || 'application/pdf',
          buffer: file.buffer,
        });
        const sentDoc = await this.messaging.sendMediaById({
          to: digits,
          phoneNumberId: cfg.phoneNumberId,
          accessToken: cfg.accessToken,
          mediaType: 'document',
          mediaId: uploaded.mediaId,
          filename: file.fileName,
          caption:
            booking.supplier?.name?.trim() ||
            booking.title?.split('·')[0]?.trim() ||
            booking.title,
        });
        pdfAttachments.push({
          bookingId: booking.id,
          documentId: doc.documentId,
          fileName: doc.fileName,
          providerMessageId: sentDoc.providerMessageId,
          ok: true,
        });
      } catch (e) {
        pdfAttachments.push({
          bookingId: booking.id,
          ok: false,
          error: e instanceof Error ? e.message : 'PDF attach failed',
        });
      }
    }

    const pdfAttachedCount = pdfAttachments.filter((p) => p.ok).length;
    const pdfFailedCount = pdfAttachments.filter((p) => !p.ok).length;

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.vouchers_whatsapp',
      entityType: 'trip',
      entityId: trip.id,
      metadata: {
        tripId,
        to: digits,
        demo,
        providerMessageId,
        bookingIds: eligible.map((b) => b.id),
        voucherCount: eligible.length,
        pdfAttachedCount,
        pdfFailedCount,
        pdfAttachments,
        pdfCap: MAX_VOUCHER_PDF_ATTACHMENTS,
      },
    });

    return {
      sent: true,
      cloudConfigured: true,
      demo,
      providerMessageId,
      toPhone: digits,
      tripNumber: trip.tripNumber,
      voucherCount: eligible.length,
      pdfAttachedCount,
      pdfFailedCount,
      pdfSkipped:
        eligible.length > MAX_VOUCHER_PDF_ATTACHMENTS
          ? eligible.length - MAX_VOUCHER_PDF_ATTACHMENTS
          : 0,
      bookingIds: eligible.map((b) => b.id),
      fallbackWaMeUrl: waMeUrl,
    };
  }

  /**
   * Staff confirms a manual WhatsApp voucher send (wa.me) — audit only;
   * bookings stay confirmed + vouchered.
   */
  async markTripVouchersWhatsappSent(
    user: AuthUser,
    tripId: string,
    input: MarkTripVouchersWhatsappSentInput = { channel: 'whatsapp' },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      include: {
        bookings: {
          where: { organizationId: user.organizationId },
          select: {
            id: true,
            type: true,
            status: true,
            voucherNote: true,
          },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const selected = selectVoucherBookingsForMarkSent(
      trip.bookings,
      input.bookingIds,
    );
    if (!selected.length) {
      throw new BadRequestException(
        'No vouchered bookings to mark sent — confirm hotel/transfer/activity and mark them vouchered first',
      );
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.vouchers_whatsapp_marked_sent',
      entityType: 'trip',
      entityId: trip.id,
      metadata: {
        tripId,
        via: 'manual_wa_me',
        channel: input.channel || 'whatsapp',
        bookingIds: selected.map((b) => b.id),
        voucherCount: selected.length,
      },
    });

    return {
      marked: true,
      tripId: trip.id,
      voucherCount: selected.length,
      bookingIds: selected.map((b) => b.id),
    };
  }

  /**
   * Email voucher PDF pack for a trip (outbox → nodemailer when SMTP is set).
   * Eligible = hotel|transfer|activity + confirmed + voucherNote; attaches up to MAX_VOUCHER_PDF_ATTACHMENTS.
   */
  async sendTripVouchersEmail(
    user: AuthUser,
    tripId: string,
    input: SendTripVouchersEmailInput = {},
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      include: {
        party: { select: { displayName: true, email: true } },
        organization: { select: { name: true, brandingJson: true } },
        bookings: {
          where: { organizationId: user.organizationId },
          include: { supplier: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const eligible = trip.bookings.filter((b) =>
      isEligibleHotelVoucherBooking(b),
    );
    if (!eligible.length) {
      throw new BadRequestException(
        'No vouchered bookings on this trip — confirm hotel/transfer/activity and mark them vouchered first',
      );
    }

    const toEmail =
      (input.toEmail && input.toEmail.trim()) || trip.party?.email?.trim() || '';
    if (!toEmail) {
      throw new BadRequestException(
        'Customer has no email — add one on the party or enter an address to send',
      );
    }

    const branding = parseOrgBranding(
      trip.organization.brandingJson,
      trip.organization.name,
    );
    const hotels = eligible.map((b) =>
      voucherLineFromBooking({
        type: b.type,
        title: b.title,
        confirmationRef: b.confirmationRef,
        voucherNote: b.voucherNote,
        startAt: b.startAt,
        endAt: b.endAt,
        supplierName: b.supplier?.name,
        travellerRequirementsJson: b.travellerRequirementsJson,
      }),
    );

    const composed = composeHotelVouchersEmailBody({
      agencyName: branding.companyName,
      guestName: trip.party?.displayName || null,
      tripNumber: trip.tripNumber,
      tripTitle: trip.title,
      hotels,
    });
    const subject = composed.subject;
    const body = (input.message?.trim() || composed.body).slice(0, 8000);

    const toAttach = eligible.slice(0, MAX_VOUCHER_PDF_ATTACHMENTS);
    const attachments: Array<{
      bookingId: string;
      documentId: string;
      storageKey: string;
      fileName: string;
      mimeType: string;
    }> = [];
    const pdfErrors: Array<{ bookingId: string; error: string }> = [];

    for (const booking of toAttach) {
      try {
        const doc = await this.generateHotelVoucherPdf(user, tripId, booking.id);
        if (!doc.storageKey) {
          throw new Error('Voucher PDF missing storage key');
        }
        attachments.push({
          bookingId: booking.id,
          documentId: doc.documentId,
          storageKey: doc.storageKey,
          fileName: doc.fileName,
          mimeType: doc.mimeType || 'application/pdf',
        });
      } catch (e) {
        pdfErrors.push({
          bookingId: booking.id,
          error: e instanceof Error ? e.message : 'PDF generation failed',
        });
      }
    }

    if (!attachments.length) {
      throw new BadRequestException(
        pdfErrors[0]?.error || 'Could not generate voucher PDFs to email',
      );
    }

    await this.outbox.enqueue({
      organizationId: user.organizationId,
      eventType: 'trip.vouchers.email',
      payload: {
        tripId,
        tripNumber: trip.tripNumber,
        toEmail,
        subject,
        body,
        attachments,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.vouchers_email',
      entityType: 'trip',
      entityId: trip.id,
      metadata: {
        tripId,
        toEmail,
        voucherCount: eligible.length,
        pdfAttachedCount: attachments.length,
        pdfFailedCount: pdfErrors.length,
        pdfSkipped:
          eligible.length > MAX_VOUCHER_PDF_ATTACHMENTS
            ? eligible.length - MAX_VOUCHER_PDF_ATTACHMENTS
            : 0,
        bookingIds: eligible.map((b) => b.id),
        documentIds: attachments.map((a) => a.documentId),
        pdfErrors,
      },
    });

    return {
      queued: true,
      toEmail,
      tripNumber: trip.tripNumber,
      voucherCount: eligible.length,
      pdfAttachedCount: attachments.length,
      pdfFailedCount: pdfErrors.length,
      pdfSkipped:
        eligible.length > MAX_VOUCHER_PDF_ATTACHMENTS
          ? eligible.length - MAX_VOUCHER_PDF_ATTACHMENTS
          : 0,
      bookingIds: eligible.map((b) => b.id),
      documentIds: attachments.map((a) => a.documentId),
    };
  }

  async sendPaymentLinkWhatsapp(
    user: AuthUser,
    tripId: string,
    paymentId: string,
    input: SendTripPaymentLinkWhatsappInput = {},
  ) {
    const link = await this.createPaymentLink(user, tripId, paymentId);
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      include: {
        party: { select: { displayName: true, phone: true } },
        organization: { select: { name: true, brandingJson: true } },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const payment = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const phoneRaw =
      (input.toPhone && input.toPhone.trim()) || trip.party?.phone?.trim() || '';
    const digits = normalizeWhatsappPhone(phoneRaw);
    if (!digits) {
      throw new BadRequestException(
        'Customer has no WhatsApp number — add a phone on the party or enter one to send',
      );
    }

    const branding = parseOrgBranding(
      trip.organization.brandingJson,
      trip.organization.name,
    );
    const webOrigin = loadEnv().webOrigin.replace(/\/$/, '');
    const payUrl = `${webOrigin}${link.path}`;
    const defaultText = composePaymentLinkWhatsappText({
      agencyName: branding.companyName,
      guestName: trip.party?.displayName || null,
      tripNumber: trip.tripNumber,
      tripTitle: trip.title,
      label: payment.label,
      amountDue: link.amountDue,
      currency: link.currency,
      dueAt: payment.dueAt?.toISOString() ?? null,
      payUrl,
    });
    const text = (input.message?.trim() || defaultText).slice(0, 3500);
    const waMeUrl = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

    const cfg = await this.whatsappCloudConfig(user.organizationId);
    const cloudReady = Boolean(cfg.enabled && cfg.accessToken && cfg.phoneNumberId);
    if (!cloudReady) {
      return {
        sent: false,
        cloudConfigured: false,
        fallbackWaMeUrl: waMeUrl,
        path: link.path,
        payUrl,
        toPhone: digits,
        tripNumber: trip.tripNumber,
        message:
          'WhatsApp Cloud API is not configured — open WhatsApp to send the payment link manually, or enable WhatsApp under Integrations.',
      };
    }

    const demo = cfg.accessToken.startsWith('seed-demo-');
    let providerMessageId: string | undefined;
    if (!demo) {
      const result = await this.messaging.sendText({
        to: digits,
        text,
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
      });
      providerMessageId = result.providerMessageId;
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.link_whatsapp',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: {
        tripId,
        to: digits,
        demo,
        providerMessageId,
        path: link.path,
      },
    });

    return {
      sent: true,
      cloudConfigured: true,
      demo,
      providerMessageId,
      toPhone: digits,
      path: link.path,
      payUrl,
      tripNumber: trip.tripNumber,
      fallbackWaMeUrl: waMeUrl,
    };
  }

  async getPublicPaymentLink(token: string) {
    const payment = await this.findPaymentByLinkToken(token);
    const outstanding = Math.max(
      0,
      Number(payment.amount) - Number(payment.amountPaid || 0),
    );
    const branding = parseOrgBranding(
      payment.trip.organization.brandingJson,
      payment.trip.organization.name,
    );
    const contact = parseBusinessContact(payment.trip.organization.settingsJson);

    const taxDisplayAmount =
      outstanding > 0 ? outstanding : Number(payment.amount);
    const tax = await this.resolvePublicPaymentTaxDisplay(
      payment.tripId,
      payment.trip.organization.id,
      taxDisplayAmount,
    );

    return {
      token,
      label: payment.label,
      status: payment.status,
      amount: Number(payment.amount),
      amountPaid: Number(payment.amountPaid || 0),
      amountDue: outstanding,
      currency: payment.currency,
      dueAt: payment.dueAt?.toISOString() ?? null,
      expiresAt: payment.paymentLinkExpiresAt?.toISOString() ?? null,
      paid: payment.status === 'paid' || outstanding <= 0,
      cancelled: payment.status === 'cancelled',
      expired: Boolean(
        payment.paymentLinkExpiresAt &&
          payment.paymentLinkExpiresAt.getTime() < Date.now() &&
          payment.status !== 'paid' &&
          payment.status !== 'cancelled',
      ),
      trip: {
        tripNumber: payment.trip.tripNumber,
        title: payment.trip.title,
      },
      organization: {
        name: branding.companyName || payment.trip.organization.name,
        logoUrl: branding.logoUrl || null,
        supportEmail: contact.supportEmail || null,
        supportPhone: contact.phone || null,
      },
      tax: tax
        ? {
            taxLabel: tax.taxIdentity.taxLabel,
            gstin: tax.taxIdentity.gstin,
            placeOfSupply: tax.taxIdentity.placeOfSupply,
            destinationPlaceOfSupply:
              tax.taxIdentity.destinationPlaceOfSupply,
            instalmentTaxShare: tax.instalmentTaxShare,
            instalmentSellExTax: tax.instalmentSellExTax,
            splitLines: tax.splitLines,
            splitCue: tax.splitCue,
          }
        : null,
    };
  }

  /**
   * Display-only CGST/SGST/IGST share for a public instalment (not a tax invoice).
   */
  private async resolvePublicPaymentTaxDisplay(
    tripId: string,
    organizationId: string,
    instalmentAmount: number,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId, deletedAt: null },
      select: {
        destinationsJson: true,
        destinationPlaceOfSupply: true,
        organization: {
          select: { taxLabel: true, settingsJson: true },
        },
        quotations: {
          select: {
            versions: {
              where: { status: 'accepted' },
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: {
                sellTotal: true,
                taxTotal: true,
                taxIdentityJson: true,
              },
            },
          },
        },
      },
    });
    if (!trip) return null;
    const accepted = trip.quotations.flatMap((q) => q.versions)[0];
    if (!accepted) return null;

    const labels = await placeAncestorLabelsForRefs(
      this.prisma,
      organizationId,
      trip.destinationsJson,
    );
    const inferred = inferDestinationPlaceOfSupplyFromLabels(labels);
    const taxIdentity = resolveQuoteTaxIdentityForDisplay({
      taxIdentityJson: accepted.taxIdentityJson,
      taxLabel: trip.organization.taxLabel,
      settingsJson: trip.organization.settingsJson,
      destinationPlaceOfSupply: trip.destinationPlaceOfSupply,
      inferredDestinationPlaceOfSupply: inferred,
    });

    return composePublicPaymentTaxDisplay({
      instalmentAmount,
      quoteSellTotal: Number(accepted.sellTotal),
      quoteTaxTotal: Number(accepted.taxTotal),
      taxIdentity,
    });
  }

  async createPublicPaymentIntent(token: string) {
    const payment = await this.findPaymentByLinkToken(token, { requireOpen: true });
    const outstanding = Math.max(
      0,
      Number(payment.amount) - Number(payment.amountPaid || 0),
    );
    if (outstanding <= 0) {
      throw new BadRequestException('Nothing outstanding on this instalment');
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      if (!allowMockTripPayments()) {
        throw new BadRequestException(
          'Online checkout is not configured — ask your travel advisor for another payment method',
        );
      }
      return {
        mode: 'mock' as const,
        amount: outstanding,
        currency: payment.currency || 'INR',
        paymentId: payment.id,
        name: payment.trip.organization.name,
        description: `${payment.label} · ${payment.trip.tripNumber}`,
        message: 'Razorpay keys not set — use mock confirm (local only)',
      };
    }

    const amountPaise = outstandingToPaise(outstanding);
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: (payment.currency || 'INR').toUpperCase(),
        receipt: `tp_${payment.id.slice(-12)}`,
        notes: {
          tripPaymentId: payment.id,
          tripId: payment.tripId,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Razorpay order failed: ${text.slice(0, 200)}`);
    }
    const order = (await res.json()) as { id: string; amount: number; currency: string };
    await this.prisma.tripPayment.update({
      where: { id: payment.id },
      data: {
        paymentLinkRazorpayOrderId: order.id,
        paymentLinkRazorpayAmountPaise: amountPaise,
      },
    });
    return {
      mode: 'razorpay' as const,
      keyId,
      razorpayOrderId: order.id,
      amount: outstanding,
      currency: order.currency,
      paymentId: payment.id,
      name: payment.trip.organization.name,
      description: `${payment.label} · ${payment.trip.tripNumber}`,
    };
  }

  async confirmPublicPayment(token: string, input: ConfirmTripPaymentLinkInput) {
    const payment = await this.findPaymentByLinkToken(token, { requireOpen: true });
    const outstanding = Math.max(
      0,
      Number(payment.amount) - Number(payment.amountPaid || 0),
    );
    if (outstanding <= 0) {
      return this.getPublicPaymentLink(token);
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (input.mock) {
      if (!allowMockTripPayments()) {
        throw new BadRequestException('Mock payments are disabled');
      }
    } else {
      if (
        !keySecret ||
        !input.razorpayPaymentId ||
        !input.razorpayOrderId ||
        !input.razorpaySignature
      ) {
        throw new BadRequestException('Payment confirmation incomplete');
      }
      const expected = createHmac('sha256', keySecret)
        .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
        .digest('hex');
      if (expected !== input.razorpaySignature) {
        throw new BadRequestException('Invalid payment signature');
      }
      try {
        assertRazorpayOrderBound({
          storedOrderId: payment.paymentLinkRazorpayOrderId,
          storedAmountPaise: payment.paymentLinkRazorpayAmountPaise,
          confirmOrderId: input.razorpayOrderId,
          currentOutstandingPaise: outstandingToPaise(outstanding),
        });
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Payment order mismatch',
        );
      }
      const duplicate = await this.prisma.tripPayment.findFirst({
        where: {
          organizationId: payment.organizationId,
          reference: input.razorpayPaymentId,
          id: { not: payment.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new BadRequestException('This Razorpay payment was already recorded');
      }
      if (payment.reference === input.razorpayPaymentId && payment.status === 'paid') {
        return this.getPublicPaymentLink(token);
      }
    }

    await this.settlePaymentPaid(
      payment.organizationId,
      payment.tripId,
      payment.id,
      {
        amountPaid: Number(payment.amountPaid || 0) + outstanding,
        method: input.mock ? 'upi' : 'card',
        reference:
          input.razorpayPaymentId ||
          (input.mock ? `mock-${token.slice(0, 8)}` : null),
      },
      null,
      {
        expectedAmountPaid: Number(payment.amountPaid || 0),
        expectedStatus: payment.status,
      },
    );

    return this.getPublicPaymentLink(token);
  }

  private async findPaymentByLinkToken(
    token: string,
    opts?: { requireOpen?: boolean },
  ) {
    const trimmed = String(token || '').trim();
    if (!trimmed) throw new NotFoundException('Payment link not found');

    const payment = await this.prisma.tripPayment.findFirst({
      where: { paymentLinkToken: trimmed },
      include: {
        trip: {
          select: {
            id: true,
            tripNumber: true,
            title: true,
            organization: {
              select: {
                id: true,
                name: true,
                brandingJson: true,
                settingsJson: true,
              },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment link not found');

    if (
      payment.paymentLinkExpiresAt &&
      payment.paymentLinkExpiresAt.getTime() < Date.now()
    ) {
      if (opts?.requireOpen) {
        throw new BadRequestException('This payment link has expired');
      }
    }

    if (opts?.requireOpen) {
      if (payment.direction !== 'customer') {
        throw new BadRequestException('Invalid payment link');
      }
      if (payment.status === 'cancelled') {
        throw new BadRequestException('This instalment was cancelled');
      }
      if (payment.status === 'paid') {
        throw new BadRequestException('This instalment is already paid');
      }
      if (
        payment.paymentLinkExpiresAt &&
        payment.paymentLinkExpiresAt.getTime() < Date.now()
      ) {
        throw new BadRequestException('This payment link has expired');
      }
    }

    return payment;
  }

  private async settlePaymentPaid(
    organizationId: string,
    tripId: string,
    paymentId: string,
    input?: { amountPaid?: number; method?: string | null; reference?: string | null },
    actorUserId: string | null = null,
    cas?: { expectedAmountPaid?: number; expectedStatus?: string },
  ) {
    const existing = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    if (existing.status === 'cancelled') {
      throw new BadRequestException('Cancelled payments cannot be marked paid');
    }
    if (existing.status === 'paid') {
      return this.prisma.tripPayment.findFirstOrThrow({
        where: { id: paymentId },
        include: {
          supplierInvoice: { select: { id: true, invoiceNumber: true } },
          bookingComponent: { select: { id: true, title: true } },
        },
      });
    }
    if (
      cas?.expectedStatus != null &&
      existing.status !== cas.expectedStatus
    ) {
      throw new BadRequestException(
        'Payment changed while settling — refresh and try again',
      );
    }
    if (
      cas?.expectedAmountPaid != null &&
      Math.abs(Number(existing.amountPaid || 0) - cas.expectedAmountPaid) > 0.001
    ) {
      throw new BadRequestException(
        'Payment changed while settling — refresh and try again',
      );
    }
    const targetPaid =
      input?.amountPaid != null ? Number(input.amountPaid) : Number(existing.amount);
    if (!Number.isFinite(targetPaid) || targetPaid <= 0) {
      throw new BadRequestException('Paid amount must be positive');
    }
    const amount = Number(existing.amount);
    const amountPaid = Math.min(targetPaid, amount);
    const fullyPaid = amountPaid >= amount;

    const casResult = await this.prisma.tripPayment.updateMany({
      where: {
        id: paymentId,
        tripId,
        organizationId,
        status: { in: ['scheduled', 'partial', 'overdue'] },
      },
      data: {
        amountPaid: new Prisma.Decimal(amountPaid),
        status: fullyPaid ? 'paid' : 'partial',
        paidAt: fullyPaid ? new Date() : existing.paidAt,
        ...(input?.method !== undefined ? { method: input.method } : {}),
        ...(input?.reference !== undefined ? { reference: input.reference } : {}),
        updatedBy: actorUserId,
        ...(fullyPaid
          ? {
              paymentLinkToken: null,
              paymentLinkExpiresAt: null,
              paymentLinkRazorpayOrderId: null,
              paymentLinkRazorpayAmountPaise: null,
            }
          : {}),
      },
    });
    if (casResult.count === 0) {
      throw new BadRequestException(
        'Payment already settled or changed — refresh and try again',
      );
    }

    const payment = await this.prisma.tripPayment.findFirstOrThrow({
      where: { id: paymentId },
      include: {
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    if (payment.supplierInvoiceId) {
      await this.recalcInvoiceStatus(payment.supplierInvoiceId);
    }
    await this.syncPayableCommercialDocumentSettlement(
      organizationId,
      tripId,
      payment,
      amountPaid,
      actorUserId,
    );
    await this.syncReceivableCommercialDocumentSettlement(
      organizationId,
      tripId,
      payment,
      amountPaid,
      actorUserId,
    );
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'payment.paid',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: {
        tripId,
        amountPaid,
        status: payment.status,
        beforeStatus: existing.status,
        via: actorUserId ? 'staff' : 'payment_link',
      },
    });

    try {
      const trip = await this.prisma.trip.findFirst({
        where: { id: tripId },
        select: { ownerId: true, tripNumber: true, title: true },
      });
      const notifyUserId = trip?.ownerId || actorUserId;
      if (notifyUserId) {
        const flags = await this.notifications.orgNotifyFlags(organizationId);
        await this.notifications.notify({
          organizationId,
          userId: notifyUserId,
          title: fullyPaid ? 'Payment received' : 'Partial payment received',
          body: `${payment.label}: ${amountPaid} ${payment.currency} on ${trip?.tripNumber || tripId}`,
          linkPath: `/trips/${tripId}?finance=1`,
          channel: flags.notifyOnPayment ? 'both' : 'in_app',
        });
      }
    } catch {
      /* non-blocking */
    }

    return payment;
  }

  /**
   * Keep auto-created payable CommercialDocuments in sync with supplier TripPayments.
   * Idempotent on PaymentRecord linked to the trip payment. Settle sync only — no FX.
   */
  private async syncPayableCommercialDocumentSettlement(
    organizationId: string,
    tripId: string,
    payment: {
      id: string;
      direction: string;
      bookingComponentId: string | null;
      currency: string;
      method: string | null;
      reference: string | null;
      supplierInvoice: { id: string; invoiceNumber: string } | null;
    },
    amountPaid: number,
    actorUserId: string | null,
  ) {
    if (payment.direction !== 'supplier' || !payment.bookingComponentId) return;

    const doc = await this.prisma.commercialDocument.findFirst({
      where: {
        organizationId,
        direction: 'payable',
        linkedEntityType: HOTEL_PAYABLE_LINKED_ENTITY,
        linkedEntityId: payment.bookingComponentId,
      },
    });
    if (!doc) return;

    const existingRecord = await this.prisma.paymentRecord.findFirst({
      where: {
        organizationId,
        linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
        linkedEntityId: payment.id,
        direction: 'outbound',
      },
      include: { allocations: true },
    });

    if (amountPaid <= 0) {
      if (existingRecord) {
        if (existingRecord.allocations.length) {
          await this.prisma.paymentAllocation.deleteMany({
            where: { paymentId: existingRecord.id },
          });
        }
        await this.prisma.paymentRecord.delete({ where: { id: existingRecord.id } });
      }
      const cleared = commercialDocumentPaidState({
        amount: Number(doc.amount),
        taxAmount: Number(doc.taxAmount || 0),
        amountPaid: 0,
      });
      await this.prisma.commercialDocument.update({
        where: { id: doc.id },
        data: {
          amountPaid: new Prisma.Decimal(cleared.amountPaid),
          status: cleared.status,
        },
      });
      return;
    }

    const payload = composeSupplierPayableSettlePaymentRecord({
      tripPaymentId: payment.id,
      tripId,
      amount: amountPaid,
      currency: payment.currency || doc.currency,
      method: payment.method,
      reference: payment.reference,
      invoiceNumber: payment.supplierInvoice?.invoiceNumber || doc.documentNumber,
    });
    const next = commercialDocumentPaidState({
      amount: Number(doc.amount),
      taxAmount: Number(doc.taxAmount || 0),
      amountPaid,
    });

    if (existingRecord) {
      await this.prisma.paymentRecord.update({
        where: { id: existingRecord.id },
        data: {
          amount: new Prisma.Decimal(payload.amount),
          method: payload.method,
          reference: payload.reference,
          paidAt: new Date(),
          notes: payload.notes,
        },
      });
      if (existingRecord.allocations.length) {
        await this.prisma.paymentAllocation.deleteMany({
          where: { paymentId: existingRecord.id },
        });
      }
      await this.prisma.paymentAllocation.create({
        data: {
          paymentId: existingRecord.id,
          commercialDocumentId: doc.id,
          amount: payload.amount,
        },
      });
    } else {
      const created = await this.prisma.paymentRecord.create({
        data: {
          organizationId,
          commercialDocumentId: doc.id,
          direction: payload.direction,
          amount: new Prisma.Decimal(payload.amount),
          currency: payload.currency,
          method: payload.method,
          reference: payload.reference,
          paidAt: new Date(),
          linkedEntityType: payload.linkedEntityType,
          linkedEntityId: payload.linkedEntityId,
          tripId: payload.tripId,
          notes: payload.notes,
          createdBy: actorUserId,
          allocations: {
            create: {
              commercialDocumentId: doc.id,
              amount: payload.amount,
            },
          },
        },
      });
      void created;
    }

    await this.prisma.commercialDocument.update({
      where: { id: doc.id },
      data: {
        amountPaid: new Prisma.Decimal(next.amountPaid),
        status: next.status,
      },
    });
  }

  /**
   * Dual-write a receivable CommercialDocument for a customer TripPayment instalment.
   * Idempotent on (trip_payment, receivable).
   */
  private async ensureCustomerReceivableCommercialDocument(
    user: AuthUser,
    tripId: string,
    payment: {
      id: string;
      direction: string;
      label: string;
      amount: Prisma.Decimal | number | { toString(): string };
      currency: string;
      dueAt: Date | null;
    },
  ) {
    if (payment.direction !== 'customer') return null;

    const existing = await this.prisma.commercialDocument.findFirst({
      where: {
        organizationId: user.organizationId,
        direction: 'receivable',
        linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
        linkedEntityId: payment.id,
      },
    });
    if (existing) return existing;

    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId },
      select: { partyId: true },
    });

    const tax = await this.resolvePublicPaymentTaxDisplay(
      tripId,
      user.organizationId,
      amount,
    );
    const payload = composeCustomerReceivableCommercialDocument({
      tripPaymentId: payment.id,
      tripId,
      partyId: trip?.partyId || null,
      label: payment.label,
      amount,
      currency: payment.currency,
      dueAt: payment.dueAt?.toISOString() ?? null,
      taxAmount: tax?.instalmentTaxShare,
      taxNotes: tax ? formatReceivableTaxNotes(tax) : null,
      taxBreakdown: tax
        ? {
            regime: tax.split.regime,
            cgst: tax.split.cgst,
            sgst: tax.split.sgst,
            igst: tax.split.igst,
            taxTotal: tax.split.taxTotal,
            source: 'display_split' as const,
          }
        : null,
    });

    const doc = await this.prisma.commercialDocument.create({
      data: {
        organizationId: user.organizationId,
        docType: payload.docType,
        direction: payload.direction,
        counterpartyPartyId: payload.counterpartyPartyId,
        linkedEntityType: payload.linkedEntityType,
        linkedEntityId: payload.linkedEntityId,
        tripId: payload.tripId,
        documentNumber: payload.documentNumber,
        label: payload.label,
        amount: new Prisma.Decimal(payload.amount),
        taxAmount: new Prisma.Decimal(payload.taxAmount),
        taxBreakdownJson: payload.taxBreakdown
          ? (payload.taxBreakdown as unknown as Prisma.InputJsonValue)
          : undefined,
        currency: payload.currency,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
        notes: payload.notes,
        createdBy: user.sub,
        lines: {
          create: payload.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitAmount: l.unitAmount,
            taxAmount: l.taxAmount,
          })),
        },
      },
      include: { lines: true },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'commercial_document.auto_receivable',
      entityType: 'commercial_document',
      entityId: doc.id,
      metadata: {
        tripId,
        tripPaymentId: payment.id,
        amount: payload.amount,
        taxAmount: payload.taxAmount,
      },
    });

    return doc;
  }

  /** Keep open receivable CD amount/label/due in sync when staff edits the instalment. */
  private async syncReceivableCommercialDocumentDetails(
    user: AuthUser,
    tripId: string,
    payment: {
      id: string;
      direction: string;
      label: string;
      amount: Prisma.Decimal | number | { toString(): string };
      currency: string;
      dueAt: Date | null;
    },
  ) {
    if (payment.direction !== 'customer') return;
    const doc = await this.prisma.commercialDocument.findFirst({
      where: {
        organizationId: user.organizationId,
        direction: 'receivable',
        linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
        linkedEntityId: payment.id,
      },
      include: { lines: { take: 1 } },
    });
    if (!doc) return;
    if (doc.status === 'paid' || doc.status === 'cancelled') {
      return;
    }
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const tax = await this.resolvePublicPaymentTaxDisplay(
      tripId,
      user.organizationId,
      amount,
    );
    const payload = composeCustomerReceivableCommercialDocument({
      tripPaymentId: payment.id,
      tripId,
      partyId: null,
      label: payment.label,
      amount,
      currency: payment.currency,
      dueAt: payment.dueAt?.toISOString() ?? null,
      taxAmount: tax?.instalmentTaxShare,
      taxNotes: tax ? formatReceivableTaxNotes(tax) : null,
      taxBreakdown: tax
        ? {
            regime: tax.split.regime,
            cgst: tax.split.cgst,
            sgst: tax.split.sgst,
            igst: tax.split.igst,
            taxTotal: tax.split.taxTotal,
            source: 'display_split' as const,
          }
        : null,
    });

    await this.prisma.commercialDocument.update({
      where: { id: doc.id },
      data: {
        label: payload.label,
        amount: new Prisma.Decimal(payload.amount),
        taxAmount: new Prisma.Decimal(payload.taxAmount),
        taxBreakdownJson: payload.taxBreakdown
          ? (payload.taxBreakdown as unknown as Prisma.InputJsonValue)
          : undefined,
        currency: payload.currency,
        dueAt: payment.dueAt,
        notes: payload.notes,
      },
    });
    const line = doc.lines[0];
    if (line) {
      await this.prisma.commercialDocumentLine.update({
        where: { id: line.id },
        data: {
          description: payment.label,
          unitAmount: new Prisma.Decimal(payload.amount),
          taxAmount: new Prisma.Decimal(payload.taxAmount),
        },
      });
    }
  }

  /**
   * Keep auto-created receivable CommercialDocuments in sync with customer TripPayments.
   * Creates the CD on settle if missing (legacy instalments). Idempotent PaymentRecord.
   */
  private async syncReceivableCommercialDocumentSettlement(
    organizationId: string,
    tripId: string,
    payment: {
      id: string;
      direction: string;
      label: string;
      amount: Prisma.Decimal | number | { toString(): string };
      currency: string;
      method: string | null;
      reference: string | null;
      dueAt: Date | null;
    },
    amountPaid: number,
    actorUserId: string | null,
  ) {
    if (payment.direction !== 'customer') return;

    let doc = await this.prisma.commercialDocument.findFirst({
      where: {
        organizationId,
        direction: 'receivable',
        linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
        linkedEntityId: payment.id,
      },
    });

    if (!doc && amountPaid > 0) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: tripId, organizationId },
        select: { partyId: true },
      });
      const gross = Number(payment.amount);
      const tax = await this.resolvePublicPaymentTaxDisplay(
        tripId,
        organizationId,
        gross,
      );
      const payload = composeCustomerReceivableCommercialDocument({
        tripPaymentId: payment.id,
        tripId,
        partyId: trip?.partyId || null,
        label: payment.label,
        amount: gross,
        currency: payment.currency,
        dueAt: payment.dueAt?.toISOString() ?? null,
        taxAmount: tax?.instalmentTaxShare,
        taxNotes: tax ? formatReceivableTaxNotes(tax) : null,
        taxBreakdown: tax
          ? {
              regime: tax.split.regime,
              cgst: tax.split.cgst,
              sgst: tax.split.sgst,
              igst: tax.split.igst,
              taxTotal: tax.split.taxTotal,
              source: 'display_split' as const,
            }
          : null,
      });
      doc = await this.prisma.commercialDocument.create({
        data: {
          organizationId,
          docType: payload.docType,
          direction: payload.direction,
          counterpartyPartyId: payload.counterpartyPartyId,
          linkedEntityType: payload.linkedEntityType,
          linkedEntityId: payload.linkedEntityId,
          tripId: payload.tripId,
          documentNumber: payload.documentNumber,
          label: payload.label,
          amount: new Prisma.Decimal(payload.amount),
          taxAmount: new Prisma.Decimal(payload.taxAmount),
          taxBreakdownJson: payload.taxBreakdown
            ? (payload.taxBreakdown as unknown as Prisma.InputJsonValue)
            : undefined,
          currency: payload.currency,
          dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
          notes: payload.notes,
          createdBy: actorUserId,
          lines: {
            create: payload.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitAmount: l.unitAmount,
              taxAmount: l.taxAmount,
            })),
          },
        },
      });
    }
    if (!doc) return;

    // Settlement PaymentRecords use notes prefix to avoid colliding with other trip_payment links.
    const existingRecord = await this.prisma.paymentRecord.findFirst({
      where: {
        organizationId,
        linkedEntityType: TRIP_PAYMENT_LINKED_ENTITY,
        linkedEntityId: payment.id,
        direction: 'inbound',
      },
      include: { allocations: true },
    });

    if (amountPaid <= 0) {
      if (existingRecord) {
        if (existingRecord.allocations.length) {
          await this.prisma.paymentAllocation.deleteMany({
            where: { paymentId: existingRecord.id },
          });
        }
        await this.prisma.paymentRecord.delete({ where: { id: existingRecord.id } });
      }
      const cleared = commercialDocumentPaidState({
        amount: Number(doc.amount),
        taxAmount: Number(doc.taxAmount || 0),
        amountPaid: 0,
      });
      await this.prisma.commercialDocument.update({
        where: { id: doc.id },
        data: {
          amountPaid: new Prisma.Decimal(cleared.amountPaid),
          status: cleared.status,
        },
      });
      return;
    }

    const payload = composeCustomerReceivableSettlePaymentRecord({
      tripPaymentId: payment.id,
      tripId,
      amount: amountPaid,
      currency: payment.currency || doc.currency,
      method: payment.method,
      reference: payment.reference,
      label: payment.label,
    });
    const next = commercialDocumentPaidState({
      amount: Number(doc.amount),
      taxAmount: Number(doc.taxAmount || 0),
      amountPaid,
    });

    if (existingRecord) {
      await this.prisma.paymentRecord.update({
        where: { id: existingRecord.id },
        data: {
          amount: new Prisma.Decimal(payload.amount),
          method: payload.method,
          reference: payload.reference,
          paidAt: new Date(),
          notes: payload.notes,
        },
      });
      if (existingRecord.allocations.length) {
        await this.prisma.paymentAllocation.deleteMany({
          where: { paymentId: existingRecord.id },
        });
      }
      await this.prisma.paymentAllocation.create({
        data: {
          paymentId: existingRecord.id,
          commercialDocumentId: doc.id,
          amount: payload.amount,
        },
      });
    } else {
      await this.prisma.paymentRecord.create({
        data: {
          organizationId,
          commercialDocumentId: doc.id,
          direction: payload.direction,
          amount: new Prisma.Decimal(payload.amount),
          currency: payload.currency,
          method: payload.method,
          reference: payload.reference,
          paidAt: new Date(),
          linkedEntityType: payload.linkedEntityType,
          linkedEntityId: payload.linkedEntityId,
          tripId: payload.tripId,
          notes: payload.notes,
          createdBy: actorUserId,
          allocations: {
            create: {
              commercialDocumentId: doc.id,
              amount: payload.amount,
            },
          },
        },
      });
    }

    await this.prisma.commercialDocument.update({
      where: { id: doc.id },
      data: {
        amountPaid: new Prisma.Decimal(next.amountPaid),
        status: next.status,
      },
    });
  }

  async unmarkPaymentPaid(user: AuthUser, tripId: string, paymentId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    if (existing.status !== 'paid' && existing.status !== 'partial') {
      throw new BadRequestException('Only paid or partial payments can be unmarked');
    }
    const status = this.computePaymentStatus({
      status: 'scheduled',
      amount: existing.amount,
      amountPaid: 0,
      dueAt: existing.dueAt,
    });
    const payment = await this.prisma.tripPayment.update({
      where: { id: paymentId },
      data: {
        amountPaid: new Prisma.Decimal(0),
        paidAt: null,
        status,
        updatedBy: user.sub,
      },
      include: {
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    if (payment.supplierInvoiceId) {
      await this.recalcInvoiceStatus(payment.supplierInvoiceId);
    }
    await this.syncPayableCommercialDocumentSettlement(
      user.organizationId,
      tripId,
      payment,
      0,
      user.sub,
    );
    await this.syncReceivableCommercialDocumentSettlement(
      user.organizationId,
      tripId,
      payment,
      0,
      user.sub,
    );
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.unmark',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: { tripId, beforeStatus: existing.status, afterStatus: status },
    });
    return payment;
  }

  async cancelPayment(user: AuthUser, tripId: string, paymentId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    if (existing.status === 'paid') {
      throw new BadRequestException('Unmark paid before cancelling');
    }
    const payment = await this.prisma.tripPayment.update({
      where: { id: paymentId },
      data: {
        status: 'cancelled',
        paymentLinkToken: null,
        paymentLinkExpiresAt: null,
        paymentLinkRazorpayOrderId: null,
        paymentLinkRazorpayAmountPaise: null,
        updatedBy: user.sub,
      },
      include: {
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.cancel',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: { tripId, beforeStatus: existing.status },
    });
    return payment;
  }

  async requestTripPaymentWriteOff(
    user: AuthUser,
    tripId: string,
    paymentId: string,
    input: { amount: number; reason: string },
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    const wo = parseTripPaymentWriteOff(existing.notes);
    const outstanding = tripPaymentOutstanding({
      amount: Number(existing.amount),
      amountPaid: Number(existing.amountPaid || 0),
      notes: existing.notes,
    });
    try {
      assertCanRequestWriteOff({
        direction: existing.direction,
        status: existing.status,
        outstanding,
        writeOffStatus: wo.status,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Cannot request write-off',
      );
    }
    const amount = Math.min(
      Math.round(Number(input.amount) * 100) / 100,
      outstanding,
    );
    let planned: { notes: string; amount: number };
    try {
      planned = planRequestWriteOff({
        notes: existing.notes,
        amount,
        reason: input.reason,
        userId: user.sub,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Cannot request write-off',
      );
    }
    const payment = await this.prisma.tripPayment.update({
      where: { id: paymentId },
      data: {
        notes: planned.notes,
        updatedBy: user.sub,
      },
      include: {
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.write_off_request',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: { tripId, amount: planned.amount, reason: input.reason },
    });
    return {
      ...payment,
      writeOff: parseTripPaymentWriteOff(payment.notes),
      outstanding: tripPaymentOutstanding({
        amount: Number(payment.amount),
        amountPaid: Number(payment.amountPaid || 0),
        notes: payment.notes,
      }),
    };
  }

  async approveTripPaymentWriteOff(
    user: AuthUser,
    tripId: string,
    paymentId: string,
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    let planned: { notes: string; amount: number };
    try {
      planned = planApproveWriteOff({
        notes: existing.notes,
        userId: user.sub,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Cannot approve write-off',
      );
    }
    const nextOutstanding = tripPaymentOutstanding({
      amount: Number(existing.amount),
      amountPaid: Number(existing.amountPaid || 0),
      notes: planned.notes,
    });
    const payment = await this.prisma.tripPayment.update({
      where: { id: paymentId },
      data: {
        notes: planned.notes,
        status: nextOutstanding <= 0.001 ? 'paid' : existing.status,
        paidAt:
          nextOutstanding <= 0.001
            ? existing.paidAt ?? new Date()
            : existing.paidAt,
        updatedBy: user.sub,
      },
      include: {
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.write_off_approve',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: { tripId, amount: planned.amount },
    });
    return {
      ...payment,
      writeOff: parseTripPaymentWriteOff(payment.notes),
      outstanding: nextOutstanding,
    };
  }

  private async recalcInvoiceStatus(invoiceId: string) {
    const invoice = await this.prisma.supplierInvoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    if (!invoice || invoice.status === 'cancelled') return;
    const paid = invoice.payments
      .filter((p) => p.status !== 'cancelled')
      .reduce((s, p) => s + Number(p.amountPaid), 0);
    const amount = Number(invoice.amount);
    let status = 'open';
    if (paid >= amount && amount > 0) status = 'paid';
    else if (paid > 0) status = 'partial';
    await this.prisma.supplierInvoice.update({
      where: { id: invoiceId },
      data: { status },
    });
  }

  async listSupplierInvoices(user: AuthUser, tripId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    return this.prisma.supplierInvoice.findMany({
      where: { tripId, organizationId: user.organizationId },
      include: {
        supplier: { select: { id: true, name: true } },
        bookingComponent: { select: { id: true, title: true } },
        payments: true,
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createSupplierInvoice(
    user: AuthUser,
    tripId: string,
    input: {
      supplierId: string;
      invoiceNumber: string;
      amount: number;
      currency?: string;
      dueAt?: string | null;
      notes?: string | null;
      bookingComponentId?: string | null;
      createPaymentSchedule?: boolean;
    },
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { currency: true },
    });
    const invoice = await this.prisma.supplierInvoice.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        supplierId: input.supplierId,
        invoiceNumber: input.invoiceNumber.trim(),
        amount: new Prisma.Decimal(input.amount),
        currency: (input.currency || org.currency || 'INR').toUpperCase(),
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        notes: input.notes || null,
        bookingComponentId: input.bookingComponentId || null,
        status: 'open',
        createdBy: user.sub,
        updatedBy: user.sub,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'supplier_invoice.create',
      entityType: 'supplier_invoice',
      entityId: invoice.id,
      metadata: { tripId, amount: Number(invoice.amount), invoiceNumber: invoice.invoiceNumber },
    });
    if (input.createPaymentSchedule) {
      await this.createPayment(user, tripId, {
        direction: 'supplier',
        label: `Invoice ${invoice.invoiceNumber}`,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        dueAt: input.dueAt || null,
        supplierInvoiceId: invoice.id,
        bookingComponentId: input.bookingComponentId || null,
      });
    }
    return invoice;
  }

  async updateSupplierInvoice(
    user: AuthUser,
    tripId: string,
    invoiceId: string,
    input: {
      invoiceNumber?: string;
      amount?: number;
      currency?: string;
      dueAt?: string | null;
      notes?: string | null;
      status?: 'open' | 'partial' | 'paid' | 'cancelled';
      bookingComponentId?: string | null;
      supplierId?: string;
    },
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.supplierInvoice.findFirst({
      where: { id: invoiceId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Invoice not found');
    const invoice = await this.prisma.supplierInvoice.update({
      where: { id: invoiceId },
      data: {
        ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
        ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
        ...(input.dueAt !== undefined
          ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.bookingComponentId !== undefined
          ? { bookingComponentId: input.bookingComponentId }
          : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        updatedBy: user.sub,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        bookingComponent: { select: { id: true, title: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'supplier_invoice.update',
      entityType: 'supplier_invoice',
      entityId: invoice.id,
      metadata: { tripId, status: invoice.status },
    });
    return invoice;
  }

  async getFinanceSummary(user: AuthUser, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      include: {
        organization: {
          select: { currency: true, taxLabel: true, settingsJson: true },
        },
        party: { select: { id: true, creditLimit: true } },
        quotations: {
          include: {
            versions: { orderBy: { versionNumber: 'desc' } },
          },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const orgCurrency = trip.organization.currency || 'INR';
    const accepted = trip.quotations
      .flatMap((q) => q.versions)
      .find((v) => v.status === 'accepted');

    let quoteTaxIdentity = null as ReturnType<
      typeof resolveQuoteTaxIdentityForDisplay
    > | null;
    if (accepted) {
      const labels = await placeAncestorLabelsForRefs(
        this.prisma,
        user.organizationId,
        trip.destinationsJson,
      );
      const inferred = inferDestinationPlaceOfSupplyFromLabels(labels);
      quoteTaxIdentity = resolveQuoteTaxIdentityForDisplay({
        taxIdentityJson: accepted.taxIdentityJson,
        taxLabel: trip.organization.taxLabel,
        settingsJson: trip.organization.settingsJson,
        destinationPlaceOfSupply: trip.destinationPlaceOfSupply,
        inferredDestinationPlaceOfSupply: inferred,
      });
    }

    const [payments, invoices, bookings, feedback] = await Promise.all([
      this.listPayments(user, tripId),
      this.listSupplierInvoices(user, tripId),
      this.listBookings(user, tripId),
      this.prisma.tripFeedback.findMany({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const paymentIds = payments.map((p) => p.id);
    const invoiceIds = invoices.map((i) => i.id);
    const financeAudit = await this.prisma.auditEvent.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [
          ...(paymentIds.length
            ? [{ entityType: 'trip_payment', entityId: { in: paymentIds } }]
            : []),
          ...(invoiceIds.length
            ? [{ entityType: 'supplier_invoice', entityId: { in: invoiceIds } }]
            : []),
          { entityType: 'trip', entityId: tripId, action: 'trip.feedback' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { actor: { select: { fullName: true, email: true } } },
    });

    const active = payments.filter((p) => p.status !== 'cancelled');
    const sameCurrency = (c: string) => c.toUpperCase() === orgCurrency.toUpperCase();
    const customer = active.filter((p) => p.direction === 'customer' && sameCurrency(p.currency));
    const supplier = active.filter((p) => p.direction === 'supplier' && sameCurrency(p.currency));
    const sumPaid = (list: typeof payments) =>
      list.reduce((s, p) => s + Number(p.amountPaid || 0), 0);
    const sumDue = (list: typeof payments) =>
      list.reduce((s, p) => s + Math.max(0, Number(p.amount) - Number(p.amountPaid || 0)), 0);
    const overdueCount = active.filter((p) => p.status === 'overdue').length;

    const activeBookings = bookings.filter((b) => b.status !== 'cancelled');
    const bookingsSameCurrency = activeBookings.filter((b) =>
      sameCurrency(b.currency || orgCurrency),
    );
    const otherCurrencyBookingCount =
      activeBookings.length - bookingsSameCurrency.length;
    const actualBookingCost = bookingsSameCurrency.reduce(
      (s, b) => s + Number(b.costAmount || 0),
      0,
    );
    const invoiceOpenSame = invoices.filter(
      (i) => i.status !== 'cancelled' && sameCurrency(i.currency),
    );
    const invoicedCost = invoiceOpenSame.reduce((s, i) => s + Number(i.amount), 0);
    const estimatedCost = accepted ? Number(accepted.costTotal) : null;
    // Prefer live booking costs; fall back to invoiced when bookings have no cost yet.
    const actualCost =
      actualBookingCost > 0 ? actualBookingCost : invoicedCost > 0 ? invoicedCost : 0;
    const costVariance =
      estimatedCost == null ? null : round2(actualCost - estimatedCost);

    const invoiceOutstanding = invoiceOpenSame.reduce((s, i) => {
      const paid = i.payments
        .filter((p) => p.status !== 'cancelled')
        .reduce((x, p) => x + Number(p.amountPaid), 0);
      return s + Math.max(0, Number(i.amount) - paid);
    }, 0);

    const partyCredit = trip.partyId
      ? await evaluatePartyCreditStatus(
          this.prisma,
          user.organizationId,
          trip.partyId,
          { orgCurrency },
        )
      : null;

    return {
      orgCurrency,
      quote: accepted
        ? {
            versionId: accepted.id,
            versionNumber: accepted.versionNumber,
            sellTotal: Number(accepted.sellTotal),
            costTotal: Number(accepted.costTotal),
            taxTotal: Number(accepted.taxTotal),
            marginAmount: Number(accepted.marginAmount),
            marginPercent: Number(accepted.marginPercent),
            currency: accepted.currency,
            taxIdentity: quoteTaxIdentity,
          }
        : null,
      costCompare: {
        estimatedCost,
        actualBookingCost: round2(actualBookingCost),
        invoicedCost: round2(invoicedCost),
        actualCost: round2(actualCost),
        variance: costVariance,
        currency: accepted?.currency || orgCurrency,
        otherCurrencyBookingCount,
      },
      summary: {
        customerDue: sumDue(customer),
        customerPaid: sumPaid(customer),
        supplierDue: Math.max(sumDue(supplier), invoiceOutstanding),
        supplierPaid: sumPaid(supplier),
        overdueCount,
      },
      payments,
      invoices,
      bookings,
      feedback,
      latestFeedback: feedback[0] || null,
      audit: financeAudit,
      otherCurrencyPayments: active.filter((p) => !sameCurrency(p.currency)),
      partyCredit,
    };
  }

  async getReadiness(user: AuthUser, tripId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    let items = await this.prisma.tripReadinessItem.findMany({
      where: { tripId },
      orderBy: { position: 'asc' },
    });
    if (!items.length) {
      await this.prisma.tripReadinessItem.createMany({
        data: DEFAULT_READINESS.map((label, position) => ({
          tripId,
          label,
          position,
          done: false,
        })),
      });
      items = await this.prisma.tripReadinessItem.findMany({
        where: { tripId },
        orderBy: { position: 'asc' },
      });
    }
    const allDone = items.every((i) => i.done);
    return { items, allDone };
  }

  async toggleReadiness(user: AuthUser, tripId: string, itemId: string, done: boolean) {
    await this.ensureTrip(user.organizationId, tripId);
    const item = await this.prisma.tripReadinessItem.findFirst({
      where: { id: itemId, tripId },
    });
    if (!item) throw new NotFoundException('Readiness item not found');
    const updated = await this.prisma.tripReadinessItem.update({
      where: { id: itemId },
      data: { done },
    });
    const readiness = await this.getReadiness(user, tripId);
    if (readiness.allDone) {
      const before = await this.prisma.trip.findFirst({
        where: { id: tripId },
        select: { status: true },
      });
      const advanceable = new Set(['confirmed', 'booking_in_progress']);
      if (before && advanceable.has(before.status)) {
        await this.prisma.trip.update({
          where: { id: tripId },
          data: { status: 'ready_to_travel', updatedBy: user.sub },
        });
        if (before.status !== 'ready_to_travel') {
          await this.audit.record({
            organizationId: user.organizationId,
            actorUserId: user.sub,
            action: 'trip.status_change',
            entityType: 'trip',
            entityId: tripId,
            metadata: {
              fromStatus: before.status,
              toStatus: 'ready_to_travel',
              status: 'ready_to_travel',
              reason: 'readiness_complete',
            },
          });
        }
      }
    }
    return updated;
  }

  /** Composed ops + finance + readiness signals for the trip control centre. */
  async getTripControl(user: AuthUser, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, startDate: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const [bookings, finance, readiness, openIncidents, openChangeCases, openCancellationCases] =
      await Promise.all([
      this.listBookings(user, tripId),
      this.getFinanceSummary(user, tripId),
      this.getReadiness(user, tripId),
      this.prisma.serviceIncident.count({
        where: {
          organizationId: user.organizationId,
          tripId,
          status: { notIn: ['closed', 'resolved', 'cancelled'] },
        },
      }),
      this.prisma.tripChangeCase.count({
        where: {
          organizationId: user.organizationId,
          tripId,
          status: { notIn: ['closed', 'resolved', 'cancelled', 'applied'] },
        },
      }),
      this.prisma.cancellationCase.count({
        where: {
          organizationId: user.organizationId,
          tripId,
          approvalStatus: { in: ['draft', 'awaiting_approval', 'approved'] },
          executionStatus: { in: ['pending', 'applying', 'failed'] },
        },
      }),
    ]);

    return buildTripControlSummary({
      tripStartDate: trip.startDate,
      bookings: bookings.map((b) => ({
        id: b.id,
        type: b.type,
        title: b.title,
        status: b.status,
        startAt: b.startAt,
        voucherNote: b.voucherNote,
      })),
      finance: {
        orgCurrency: finance.orgCurrency,
        quote: finance.quote
          ? {
              sellTotal: finance.quote.sellTotal,
              marginAmount: finance.quote.marginAmount,
              marginPercent: finance.quote.marginPercent,
              currency: finance.quote.currency,
            }
          : null,
        summary: finance.summary,
        partyCredit: finance.partyCredit,
      },
      readiness: {
        items: readiness.items.map((i) => ({ done: i.done })),
        allDone: readiness.allDone,
      },
      openIncidents,
      openChangeCases,
      openCancellationCases,
    });
  }

  /**
   * Org-wide upcoming hotel check-ins + transfers with risk chips.
   * Conflict scan includes assigned transfers outside the display window
   * so overlaps are not false-negative.
   */
  async getMovementBoard(user: AuthUser, days = 14) {
    const win = movementWindow(days);
    const orgId = user.organizationId;

    const candidates = await this.prisma.bookingComponent.findMany({
      where: {
        organizationId: orgId,
        type: { in: ['hotel', 'transfer', 'activity'] },
        status: { notIn: ['cancelled', 'rejected'] },
        trip: { deletedAt: null },
        OR: [
          { startAt: { gte: win.from, lt: win.to } },
          {
            startAt: null,
            trip: { startDate: { gte: win.from, lt: win.to } },
          },
        ],
      },
      select: { tripId: true },
    });

    const tripIds = [...new Set(candidates.map((c) => c.tripId))];
    if (tripIds.length === 0) {
      return buildMovementBoard({
        bookings: [],
        financeByTrip: new Map(),
        days: win.days,
      });
    }

    const [rows, payments] = await Promise.all([
      this.prisma.bookingComponent.findMany({
        where: {
          organizationId: orgId,
          tripId: { in: tripIds },
          type: { in: ['hotel', 'transfer', 'activity'] },
          status: { notIn: ['cancelled', 'rejected'] },
        },
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          startAt: true,
          endAt: true,
          confirmationRef: true,
          voucherNote: true,
          travellerRequirementsJson: true,
          tripId: true,
          supplier: { select: { name: true } },
          trip: {
            select: {
              tripNumber: true,
              title: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.tripPayment.findMany({
        where: {
          organizationId: orgId,
          tripId: { in: tripIds },
          status: { not: 'cancelled' },
        },
        select: {
          tripId: true,
          direction: true,
          status: true,
          amount: true,
          amountPaid: true,
        },
      }),
    ]);

    // Extra transfers with assignment (may sit outside the window) for conflict accuracy.
    const extraTransfers = await this.prisma.bookingComponent.findMany({
      where: {
        organizationId: orgId,
        type: 'transfer',
        status: { notIn: ['cancelled', 'rejected'] },
        id: { notIn: rows.map((r) => r.id) },
      },
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        startAt: true,
        endAt: true,
        confirmationRef: true,
        voucherNote: true,
        travellerRequirementsJson: true,
        tripId: true,
        supplier: { select: { name: true } },
        trip: {
          select: {
            tripNumber: true,
            title: true,
            startDate: true,
            endDate: true,
          },
        },
      },
      take: 500,
    });
    const conflictPeers = extraTransfers.filter((b) => {
      const a = parseTransferAssignment(b.travellerRequirementsJson);
      return Boolean(a.driverSupplierId || a.fleetUnitId);
    });
    const rowsForConflicts = [...rows, ...conflictPeers];

    const driverIds = [
      ...new Set(
        rowsForConflicts
          .map((b) => parseTransferAssignment(b.travellerRequirementsJson).driverSupplierId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const drivers = driverIds.length
      ? await this.prisma.supplier.findMany({
          where: { organizationId: orgId, id: { in: driverIds } },
          select: { id: true, name: true },
        })
      : [];
    const driverNameById = new Map(drivers.map((d) => [d.id, d.name]));

    const bookings: MovementBoardBooking[] = rowsForConflicts.map((b) => {
      const assignment = parseTransferAssignment(b.travellerRequirementsJson);
      return {
        id: b.id,
        type: b.type,
        title: b.title,
        status: b.status,
        startAt: b.startAt,
        endAt: b.endAt,
        confirmationRef: b.confirmationRef,
        voucherNote: b.voucherNote,
        supplierName: b.supplier?.name ?? null,
        tripId: b.tripId,
        tripNumber: b.trip.tripNumber,
        tripTitle: b.trip.title,
        tripStartDate: b.trip.startDate,
        tripEndDate: b.trip.endDate,
        driverSupplierId: assignment.driverSupplierId,
        driverName: assignment.driverSupplierId
          ? driverNameById.get(assignment.driverSupplierId) ?? null
          : null,
        vehicleLabel: assignment.vehicleLabel,
        fleetUnitId: assignment.fleetUnitId,
      };
    });

    const financeByTrip = new Map<string, MovementBoardTripFinance>();
    for (const tripId of tripIds) {
      financeByTrip.set(tripId, {
        tripId,
        overdueCount: 0,
        supplierDue: 0,
      });
    }
    for (const p of payments) {
      const fin = financeByTrip.get(p.tripId);
      if (!fin) continue;
      if (p.status === 'overdue') fin.overdueCount += 1;
      if (p.direction === 'supplier') {
        fin.supplierDue += Math.max(
          0,
          Number(p.amount) - Number(p.amountPaid || 0),
        );
      }
    }

    return buildMovementBoard({
      bookings,
      financeByTrip,
      days: win.days,
    });
  }

  /**
   * Org-wide AR/AP aging from TripPayment outstanding balances.
   * Soft-syncs overdue status on read (same as listPayments).
   */
  async getFinanceAging(
    user: AuthUser,
    opts: {
      direction?: 'customer' | 'supplier' | 'all';
      overdueOnly?: boolean;
    } = {},
  ) {
    const orgId = user.organizationId;
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: { currency: true },
    });

    const payments = await this.prisma.tripPayment.findMany({
      where: {
        organizationId: orgId,
        status: { notIn: ['paid', 'cancelled'] },
        trip: { deletedAt: null },
      },
      select: {
        id: true,
        tripId: true,
        direction: true,
        label: true,
        amount: true,
        amountPaid: true,
        currency: true,
        dueAt: true,
        status: true,
        notes: true,
        supplierInvoiceId: true,
        bookingComponentId: true,
        trip: {
          select: {
            tripNumber: true,
            title: true,
            party: { select: { displayName: true } },
          },
        },
        supplierInvoice: {
          select: { supplier: { select: { name: true } } },
        },
        bookingComponent: {
          select: { supplier: { select: { name: true } } },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });

    const synced = await Promise.all(payments.map((p) => this.syncPaymentOverdue(p)));

    const board = buildFinanceAging({
      payments: synced.map((p) => ({
        id: p.id,
        tripId: p.tripId,
        tripNumber: p.trip.tripNumber,
        tripTitle: p.trip.title,
        partyName: p.trip.party?.displayName ?? null,
        direction: p.direction === 'supplier' ? 'supplier' : 'customer',
        label: p.label,
        amount: Number(p.amount),
        amountPaid: Number(p.amountPaid || 0),
        currency: p.currency || org?.currency || 'INR',
        dueAt: p.dueAt,
        status: p.status,
        notes: p.notes,
        supplierName:
          p.supplierInvoice?.supplier?.name ||
          p.bookingComponent?.supplier?.name ||
          null,
      })),
      direction: opts.direction ?? 'all',
      overdueOnly: Boolean(opts.overdueOnly),
    });

    return {
      ...board,
      summary: {
        ...board.summary,
        currency: board.summary.currency || org?.currency || 'INR',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Org-wide portfolio profitability from accepted quotation versions.
   */
  async getFinancePortfolio(
    user: AuthUser,
    opts: { from?: string | null; to?: string | null } = {},
  ) {
    const orgId = user.organizationId;
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: { currency: true, settingsJson: true },
    });

    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        quotations: {
          some: {
            versions: { some: { status: 'accepted' } },
          },
        },
      },
      select: {
        id: true,
        tripNumber: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        party: { select: { displayName: true } },
        quotations: {
          select: {
            quoteNumber: true,
            versions: {
              where: { status: 'accepted' },
              orderBy: { acceptedAt: 'desc' },
              take: 1,
              select: {
                versionNumber: true,
                acceptedAt: true,
                currency: true,
                sellTotal: true,
                costTotal: true,
                taxTotal: true,
                marginAmount: true,
                marginPercent: true,
              },
            },
          },
        },
      },
      orderBy: [{ startDate: 'asc' }, { tripNumber: 'asc' }],
    });

    const board = buildFinancePortfolio({
      trips: trips.flatMap((trip) => {
        const accepted = trip.quotations
          .flatMap((q) =>
            q.versions.map((v) => ({
              ...v,
              quoteNumber: q.quoteNumber,
            })),
          )
          .sort((a, b) => {
            const at = a.acceptedAt?.getTime() ?? 0;
            const bt = b.acceptedAt?.getTime() ?? 0;
            return bt - at;
          })[0];
        if (!accepted) return [];
        return [
          {
            tripId: trip.id,
            tripNumber: trip.tripNumber,
            tripTitle: trip.title,
            tripStatus: trip.status,
            partyName: trip.party?.displayName ?? null,
            startDate: trip.startDate,
            endDate: trip.endDate,
            currency: accepted.currency || org?.currency || 'INR',
            sellTotal: Number(accepted.sellTotal),
            costTotal: Number(accepted.costTotal),
            taxTotal: Number(accepted.taxTotal),
            marginAmount: Number(accepted.marginAmount),
            marginPercent: Number(accepted.marginPercent),
            acceptedAt: accepted.acceptedAt,
            quoteNumber: accepted.quoteNumber,
            versionNumber: accepted.versionNumber,
          },
        ];
      }),
      from: opts.from || null,
      to: opts.to || null,
      bookCurrency: org?.currency || 'INR',
      fxRates: parseOrgFxRates(org?.settingsJson),
    });

    return {
      ...board,
      summary: {
        ...board.summary,
        currency: board.summary.currency || org?.currency || 'INR',
      },
      window: {
        from: opts.from || null,
        to: opts.to || null,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /** Org-shared named filters for aging / portfolio (settingsJson). */
  async listFinanceReportPacks(user: AuthUser) {
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      items: listFinanceReportPacksFromSettings(org.settingsJson),
    };
  }

  async createFinanceReportPack(
    user: AuthUser,
    input: CreateFinanceReportPackInput,
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    let result;
    try {
      result = upsertFinanceReportPackInSettings({
        settingsJson: org.settingsJson,
        create: input,
        createdByUserId: user.sub,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Could not create report pack',
      );
    }
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { settingsJson: result.settingsJson as Prisma.InputJsonValue },
    });
    return { item: result.packs[0]! };
  }

  async updateFinanceReportPack(
    user: AuthUser,
    packId: string,
    patch: UpdateFinanceReportPackInput,
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    let result;
    try {
      result = upsertFinanceReportPackInSettings({
        settingsJson: org.settingsJson,
        update: { id: packId, patch },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not update report pack';
      if (msg === 'Report pack not found') throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { settingsJson: result.settingsJson as Prisma.InputJsonValue },
    });
    const item = result.packs.find((p) => p.id === packId);
    if (!item) throw new NotFoundException('Report pack not found');
    return { item };
  }

  async deleteFinanceReportPack(user: AuthUser, packId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const before = listFinanceReportPacksFromSettings(org.settingsJson);
    if (!before.some((p) => p.id === packId)) {
      throw new NotFoundException('Report pack not found');
    }
    const result = upsertFinanceReportPackInSettings({
      settingsJson: org.settingsJson,
      removeId: packId,
    });
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { settingsJson: result.settingsJson as Prisma.InputJsonValue },
    });
    return { ok: true as const };
  }

  /**
   * One-shot email of CSV attachment(s) for an org report pack (also used to test schedules).
   * Defaults to pack.delivery.toEmails when toEmails omitted.
   */
  async sendFinanceReportPackEmail(
    user: AuthUser,
    packId: string,
    opts: { toEmails?: string[] } = {},
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { id: true, name: true, settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const pack = listFinanceReportPacksFromSettings(org.settingsJson).find(
      (p) => p.id === packId,
    );
    if (!pack) throw new NotFoundException('Report pack not found');

    const toEmails = (
      opts.toEmails?.length ? opts.toEmails : pack.delivery?.toEmails || []
    )
      .map((e) => e.trim())
      .filter(Boolean);
    if (!toEmails.length) {
      throw new BadRequestException(
        'Add delivery emails on the pack or pass toEmails',
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const attachments: Array<{
      documentId: string;
      storageKey: string;
      fileName: string;
      mimeType: string;
    }> = [];

    if (pack.aging) {
      const board = await this.getFinanceAging(user, {
        direction: pack.aging.direction,
        overdueOnly: pack.aging.overdueOnly,
      });
      const csv = agingBoardToCsv(board.rows);
      const fileName = `aging-${pack.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 40)}-${stamp}.csv`;
      const doc = await this.files.upload({
        organizationId: user.organizationId,
        userId: user.sub,
        entityType: 'finance_report_pack',
        entityId: pack.id,
        fileName,
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf8'),
        visibility: 'internal',
      });
      attachments.push({
        documentId: doc.id,
        storageKey: doc.storageKey,
        fileName: doc.name,
        mimeType: doc.mimeType || 'text/csv',
      });
    }

    if (pack.portfolio) {
      const board = await this.getFinancePortfolio(user, {
        from: pack.portfolio.from || null,
        to: pack.portfolio.to || null,
      });
      const csv = portfolioBoardToCsv(board.rows);
      const fileName = `portfolio-${pack.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 40)}-${stamp}.csv`;
      const doc = await this.files.upload({
        organizationId: user.organizationId,
        userId: user.sub,
        entityType: 'finance_report_pack',
        entityId: pack.id,
        fileName,
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf8'),
        visibility: 'internal',
      });
      attachments.push({
        documentId: doc.id,
        storageKey: doc.storageKey,
        fileName: doc.name,
        mimeType: doc.mimeType || 'text/csv',
      });
    }

    if (!attachments.length) {
      throw new BadRequestException('Pack has no aging or portfolio filters');
    }

    const subject = `Finance report — ${pack.name}`;
    const body = [
      `Hello,`,
      ``,
      `Attached is the scheduled finance report pack “${pack.name}” for ${org.name}.`,
      ``,
      `Generated ${new Date().toISOString()}.`,
    ].join('\n');

    for (const toEmail of toEmails) {
      await this.outbox.enqueue({
        organizationId: user.organizationId,
        eventType: 'finance.report-pack.email',
        payload: {
          packId: pack.id,
          packName: pack.name,
          toEmail,
          subject,
          body,
          attachments,
        },
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'finance.report_pack_email',
      entityType: 'organization',
      entityId: user.organizationId,
      metadata: {
        packId,
        toEmails,
        attachmentCount: attachments.length,
      },
    });

    return {
      queued: true,
      toEmails,
      packId: pack.id,
      packName: pack.name,
      attachmentCount: attachments.length,
    };
  }
}
