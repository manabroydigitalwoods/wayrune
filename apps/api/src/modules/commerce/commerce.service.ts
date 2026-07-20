import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type {
  AttachPolicySchema,
  CloseTripSchema,
  ConfirmServiceRequestItemSchema,
  CreateCancellationCaseSchema,
  CreateCommercialDocumentSchema,
  CreateConversationSchema,
  CreateDiningCapacitySchema,
  CreateExperienceProductSchema,
  CreateExperienceSlotSchema,
  CreateFolioChargeSchema,
  CreateHousekeepingTaskSchema,
  CreateInventoryHoldSchema,
  CreateMaintenanceWorkOrderSchema,
  CreateMealPackageSchema,
  CreateMealReservationSchema,
  CreateNegotiatedRateSchema,
  CreatePartnerRatingSchema,
  CreatePartnerSettlementSchema,
  CreatePaymentAllocationSchema,
  CreatePaymentRecordSchema,
  CreatePolicySchema,
  CreateServiceIncidentSchema,
  CreateServiceRequestItemSchema,
  CreateServiceRequestSchema,
  CloneSupplierContractVersionSchema,
  CreateSupplierContractSchema,
  UpdateSupplierContractSchema,
  CreateTripChangeCaseSchema,
  ImportNegotiatedRateCsvSchema,
  NegotiateServiceRequestSchema,
  PostMessageSchema,
  UpdateHousekeepingTaskSchema,
  UpdateMaintenanceWorkOrderSchema,
  UpdateMealReservationSchema,
  UpdateOrganizationProfileSchema,
  UpdatePolicySchema,
  UpdateServiceIncidentSchema,
  UpdateServiceRequestSchema,
  UpdateTripChangeCaseSchema,
} from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  applyInventoryMode,
  type HoldMode,
  type TxClient,
} from './inventory-adapters';
import { assertTransition, resolveCancellationExecutionOutcome } from './lifecycle-transitions';
import {
  buildBookingCancellationPreview,
  pickBookingBaseAmount,
  policyFromQuoteProvenance,
} from './booking-cancellation-preview';
import {
  cancellationApplyCreditNotePlan,
  cancellationCreditNoteAlreadyAllocated,
  composeCancellationCreditNoteAllocateUpdate,
  loadTripReceivablesForCreditAllocation,
  pickCancellationCreditNoteReceivableTarget,
} from './cancellation-credit-note';
import {
  CANCELLATION_REFUND_LINKED_ENTITY,
  commercialDocumentPaidStateFromNote,
  composeCancellationRefundPaymentRecord,
  creditNoteRefundOutstanding,
  creditNoteRefundTotal,
  parseCancellationRefundEval,
} from './cancellation-refund-settle';
import {
  assertCanApproveRefund,
  assertCanRequestRefund,
  assertRefundApprovedForSettle,
  parseRefundApproval,
  planApproveRefundStamp,
  planRequestRefundStamp,
} from './cancellation-refund-approval';
import {
  assertMockRazorpayRefundAllowed,
  createRazorpayPaymentRefund,
  mockRazorpayRefundReference,
  parseCancellationRefundSettleMode,
  pickRazorpaySourcePaymentId,
  resolveCancellationRefundSettleAmount,
} from './razorpay-cancellation-refund';
import {
  buildCommercialTaxBreakdown,
  commercialDocsToGstrExportRows,
  gstrExportRowsToCsv,
} from './gstr-export';
import {
  evaluateCancellationPolicy,
  mealFulfilmentPayload,
  stayFulfilmentPayload,
  type PolicyRules,
} from './policy-evaluator';

type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>;
type UpdateServiceRequestInput = z.infer<typeof UpdateServiceRequestSchema>;

@Injectable()
export class CommerceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private outbox: OutboxService,
    private notifications: NotificationsService,
  ) {}

  private holdRef(
    organizationId: string,
    hold: {
      resourceType: string;
      resourceId: string;
      quantity: unknown;
      windowStart?: Date | null;
      windowEnd?: Date | null;
    },
  ) {
    return {
      organizationId,
      resourceType: hold.resourceType,
      resourceId: hold.resourceId,
      quantity: Number(hold.quantity) || 1,
      windowStart: hold.windowStart ?? null,
      windowEnd: hold.windowEnd ?? null,
    };
  }

  private async applyHoldCapacity(
    tx: TxClient,
    organizationId: string,
    hold: {
      resourceType: string;
      resourceId: string;
      quantity: unknown;
      windowStart?: Date | null;
      windowEnd?: Date | null;
    },
    mode: HoldMode,
  ) {
    try {
      await applyInventoryMode(tx, mode, this.holdRef(organizationId, hold));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('No inventory adapter')) return;
      if (msg.includes('Insufficient')) {
        throw new ConflictException(msg);
      }
      throw e;
    }
  }

  private async timeline(
    organizationId: string,
    eventType: string,
    entityType: string,
    entityId: string,
    summary: string,
    actorUserId?: string,
    payload?: Record<string, unknown>,
  ) {
    await this.prisma.businessTimelineEvent.create({
      data: {
        organizationId,
        eventType,
        entityType,
        entityId,
        summary,
        actorUserId: actorUserId ?? null,
        payloadJson: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await this.outbox.enqueue({
      organizationId,
      eventType,
      payload: { entityType, entityId, summary, ...(payload || {}) },
    });
  }

  // ─── Org profile ───────────────────────────────────────────────────

  async getOrganizationProfile(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      include: { partnerProfile: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateOrganizationProfile(
    organizationId: string,
    userId: string,
    input: z.infer<typeof UpdateOrganizationProfileSchema>,
  ) {
    const existing = await this.prisma.organizationPartnerProfile.findUnique({
      where: { organizationId },
    });
    const data: Prisma.OrganizationPartnerProfileUpdateInput = {
      legalName: input.legalName ?? undefined,
      displayName: input.displayName ?? undefined,
      bio: input.description ?? undefined,
      logoUrl: input.logoUrl ?? undefined,
      website: input.website ?? undefined,
      contactEmail: input.contactEmail ?? undefined,
      contactPhone: input.contactPhone ?? undefined,
      city: input.city ?? undefined,
      region: input.region ?? undefined,
      country: input.country ?? undefined,
      verificationStatus: input.verificationStatus ?? undefined,
      latitude: input.latitude != null ? input.latitude : undefined,
      longitude: input.longitude != null ? input.longitude : undefined,
      profileJson: {
        ...((existing?.profileJson as Record<string, unknown>) || {}),
        ...input,
      } as Prisma.InputJsonValue,
    };
    if (existing) {
      return this.prisma.organizationPartnerProfile.update({
        where: { organizationId },
        data,
      });
    }
    return this.prisma.organizationPartnerProfile.create({
      data: {
        organizationId,
        ...data,
        discoverable: false,
      } as Prisma.OrganizationPartnerProfileCreateInput,
    });
  }

  // ─── Policies ──────────────────────────────────────────────────────

  async listPolicies(organizationId: string, policyType?: string) {
    return this.prisma.policy.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(policyType ? { policyType } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createPolicy(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreatePolicySchema>,
  ) {
    const policy = await this.prisma.policy.create({
      data: {
        organizationId,
        name: input.name,
        policyType: input.policyType,
        rulesJson: (input.rulesJson ?? undefined) as Prisma.InputJsonValue | undefined,
        textBody: input.textBody ?? null,
        isDefault: input.isDefault ?? false,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
        createdBy: userId,
      },
    });
    await this.audit.record({
      organizationId,
      actorUserId: userId,
      action: 'policy.create',
      entityType: 'policy',
      entityId: policy.id,
    });
    return policy;
  }

  async updatePolicy(
    organizationId: string,
    id: string,
    input: z.infer<typeof UpdatePolicySchema>,
  ) {
    await this.requirePolicy(organizationId, id);
    return this.prisma.policy.update({
      where: { id },
      data: {
        name: input.name,
        policyType: input.policyType,
        rulesJson: input.rulesJson as Prisma.InputJsonValue | undefined,
        textBody: input.textBody,
        isDefault: input.isDefault,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
        effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : undefined,
      },
    });
  }

  async attachPolicy(
    organizationId: string,
    userId: string,
    input: z.infer<typeof AttachPolicySchema>,
  ) {
    await this.requirePolicy(organizationId, input.policyId);
    const row = await this.prisma.policyAttachment.upsert({
      where: {
        policyId_entityType_entityId: {
          policyId: input.policyId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      },
      create: {
        policyId: input.policyId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      update: {},
    });
    await this.timeline(
      organizationId,
      'PolicyAttached',
      input.entityType,
      input.entityId,
      `Policy attached`,
      userId,
      { policyId: input.policyId },
    );
    return row;
  }

  private async requirePolicy(organizationId: string, id: string) {
    const p = await this.prisma.policy.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!p) throw new NotFoundException('Policy not found');
    return p;
  }

  // ─── Service requests ──────────────────────────────────────────────

  async listServiceRequests(
    organizationId: string,
    side: 'buyer' | 'seller' | 'all' = 'all',
    status?: string,
  ) {
    const where: Prisma.ServiceRequestWhereInput = {
      ...(status ? { status } : {}),
      OR:
        side === 'buyer'
          ? [{ buyerOrganizationId: organizationId }]
          : side === 'seller'
            ? [{ sellerOrganizationId: organizationId }]
            : [
                { buyerOrganizationId: organizationId },
                { sellerOrganizationId: organizationId },
              ],
    };
    return this.prisma.serviceRequest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        supplier: { select: { id: true, name: true } },
        partnerAsset: { select: { id: true, name: true, assetKind: true } },
        trip: { select: { id: true, tripNumber: true, title: true } },
        items: {
          select: {
            id: true,
            status: true,
            productRef: true,
            quantity: true,
            agreedAmount: true,
            currency: true,
            selected: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async createServiceRequest(
    organizationId: string,
    userId: string,
    input: CreateServiceRequestInput,
  ) {
    const sr = await this.prisma.serviceRequest.create({
      data: {
        buyerOrganizationId: organizationId,
        sellerOrganizationId: input.sellerOrganizationId ?? null,
        supplierId: input.supplierId ?? null,
        partnerAssetId: input.partnerAssetId ?? null,
        serviceType: input.serviceType,
        title: input.title,
        status: 'drafted',
        sourceEntityType: input.sourceEntityType ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
        tripId: input.tripId ?? null,
        quotationLineId: input.quotationLineId ?? null,
        serviceStartAt: input.serviceStartAt ? new Date(input.serviceStartAt) : null,
        serviceEndAt: input.serviceEndAt ? new Date(input.serviceEndAt) : null,
        quantity: input.quantity ?? null,
        adults: input.adults ?? null,
        children: input.children ?? null,
        requirementsJson: (input.requirementsJson ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        quotedAmount: input.quotedAmount ?? null,
        currency: input.currency || 'INR',
        notes: input.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    if (input.bookingComponentId) {
      await this.prisma.bookingComponent.updateMany({
        where: { id: input.bookingComponentId, organizationId },
        data: {
          serviceRequestId: sr.id,
          status: 'drafted',
          quotedAmount: input.quotedAmount ?? undefined,
        },
      });
    } else if (input.tripId) {
      const booking = await this.prisma.bookingComponent.create({
        data: {
          organizationId,
          tripId: input.tripId,
          supplierId: input.supplierId ?? null,
          partnerAssetId: input.partnerAssetId ?? null,
          serviceRequestId: sr.id,
          type: this.mapServiceTypeToBooking(input.serviceType),
          title: input.title,
          status: 'drafted',
          startAt: input.serviceStartAt ? new Date(input.serviceStartAt) : null,
          endAt: input.serviceEndAt ? new Date(input.serviceEndAt) : null,
          quotedAmount: input.quotedAmount ?? null,
          costAmount: input.quotedAmount ?? null,
          currency: input.currency || 'INR',
          createdBy: userId,
          updatedBy: userId,
        },
      });
      void booking;
    }

    await this.timeline(
      organizationId,
      'ServiceRequested',
      'service_request',
      sr.id,
      `Service request drafted: ${sr.title}`,
      userId,
    );
    return sr;
  }

  private mapServiceTypeToBooking(serviceType: string) {
    switch (serviceType) {
      case 'STAY':
        return 'hotel';
      case 'TRANSFER':
        return 'transfer';
      case 'MEAL':
        return 'meal';
      case 'ACTIVITY':
        return 'activity';
      default:
        return 'other';
    }
  }

  async updateServiceRequest(
    organizationId: string,
    id: string,
    userId: string,
    input: UpdateServiceRequestInput,
  ) {
    const existing = await this.prisma.serviceRequest.findFirst({
      where: {
        id,
        OR: [
          { buyerOrganizationId: organizationId },
          { sellerOrganizationId: organizationId },
        ],
      },
    });
    if (!existing) throw new NotFoundException('Service request not found');

    if (input.status !== undefined && input.status !== existing.status) {
      assertTransition('service_request', existing.status, input.status);
    }

    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: {
        status: input.status,
        agreedAmount: input.agreedAmount,
        quotedAmount: input.quotedAmount,
        confirmationRef: input.confirmationRef,
        reservationId: input.reservationId,
        reservationType: input.reservationType,
        policySnapshotJson: input.policySnapshotJson as Prisma.InputJsonValue | undefined,
        rateSnapshotJson: input.rateSnapshotJson as Prisma.InputJsonValue | undefined,
        notes: input.notes,
        rejectReason: input.rejectReason,
        updatedBy: userId,
      },
    });

    if (input.status === 'confirmed') {
      if (!updated.rateSnapshotJson || !updated.policySnapshotJson) {
        // Soft rule: encourage snapshots; auto-stamp minimal if missing
        await this.prisma.serviceRequest.update({
          where: { id },
          data: {
            rateSnapshotJson: (updated.rateSnapshotJson || {
              agreedAmount: updated.agreedAmount,
              currency: updated.currency,
              capturedAt: new Date().toISOString(),
            }) as Prisma.InputJsonValue,
            policySnapshotJson: (updated.policySnapshotJson || {
              policyText: 'Default confirmation terms',
              capturedAt: new Date().toISOString(),
            }) as Prisma.InputJsonValue,
          },
        });
      }
      const bookings = await this.prisma.bookingComponent.findMany({
        where: { serviceRequestId: id },
      });
      for (const b of bookings) {
        if (b.status !== 'confirmed') {
          assertTransition('booking_requirement', b.status, 'confirmed');
        }
      }
      await this.prisma.bookingComponent.updateMany({
        where: { serviceRequestId: id },
        data: {
          status: 'confirmed',
          confirmationRef: input.confirmationRef ?? undefined,
          confirmedAmount: input.agreedAmount ?? undefined,
          costAmount: input.agreedAmount ?? undefined,
        },
      });
      await this.timeline(
        organizationId,
        'ReservationConfirmed',
        'service_request',
        id,
        `Service confirmed: ${updated.title}`,
        userId,
      );
    }

    return this.prisma.serviceRequest.findUnique({ where: { id } });
  }

  /** Ensure booking has a linked ServiceRequest + Item (BookingRequirement adapter). */
  async ensureServiceRequestForBooking(
    organizationId: string,
    userId: string,
    bookingId: string,
  ) {
    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, organizationId },
      include: { serviceRequestItems: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.serviceRequestId) {
      const existingItem = booking.serviceRequestItems.find(
        (i) => i.serviceRequestId === booking.serviceRequestId,
      );
      if (!existingItem) {
        await this.prisma.serviceRequestItem.create({
          data: {
            serviceRequestId: booking.serviceRequestId,
            bookingComponentId: booking.id,
            quantity: booking.requiredQuantity ?? 1,
            selected: booking.status === 'confirmed',
            status: booking.status === 'confirmed' ? 'confirmed' : 'drafted',
            agreedAmount: booking.confirmedAmount ?? booking.costAmount,
            currency: booking.currency,
          },
        });
      }
      return this.prisma.serviceRequest.findUnique({
        where: { id: booking.serviceRequestId },
        include: { items: true },
      });
    }

    const serviceType =
      booking.type === 'hotel'
        ? 'STAY'
        : booking.type === 'transfer'
          ? 'TRANSFER'
          : booking.type === 'meal'
            ? 'MEAL'
            : booking.type === 'activity'
              ? 'ACTIVITY'
              : 'OTHER';
    const sr = await this.prisma.serviceRequest.create({
      data: {
        buyerOrganizationId: organizationId,
        supplierId: booking.supplierId,
        partnerAssetId: booking.partnerAssetId,
        serviceType,
        title: booking.title,
        status: booking.status === 'confirmed' ? 'confirmed' : 'drafted',
        tripId: booking.tripId,
        serviceStartAt: booking.startAt,
        serviceEndAt: booking.endAt,
        quotedAmount: booking.quotedAmount ?? booking.costAmount,
        agreedAmount: booking.confirmedAmount ?? booking.costAmount,
        currency: booking.currency,
        createdBy: userId,
        updatedBy: userId,
        items: {
          create: {
            bookingComponentId: booking.id,
            quantity: booking.requiredQuantity ?? 1,
            selected: booking.status === 'confirmed',
            status: booking.status === 'confirmed' ? 'confirmed' : 'drafted',
            agreedAmount: booking.confirmedAmount ?? booking.costAmount,
            currency: booking.currency,
            requestedTermsJson: {
              startAt: booking.startAt?.toISOString() ?? null,
              endAt: booking.endAt?.toISOString() ?? null,
              title: booking.title,
            },
          },
        },
      },
      include: { items: true },
    });
    await this.prisma.bookingComponent.update({
      where: { id: bookingId },
      data: { serviceRequestId: sr.id },
    });
    return sr;
  }

  // ─── Commercial docs / payments ────────────────────────────────────

  async createCommercialDocument(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateCommercialDocumentSchema>,
  ) {
    const taxAmount = input.taxAmount ?? 0;
    const taxBreakdown =
      input.taxBreakdown != null
        ? buildCommercialTaxBreakdown({
            taxTotal: input.taxBreakdown.taxTotal ?? taxAmount,
            regime: input.taxBreakdown.regime,
            cgst: input.taxBreakdown.cgst,
            sgst: input.taxBreakdown.sgst,
            igst: input.taxBreakdown.igst,
            hsn: input.taxBreakdown.hsn,
            source: input.taxBreakdown.source,
          })
        : buildCommercialTaxBreakdown({ taxTotal: taxAmount, regime: 'unknown' });
    const doc = await this.prisma.commercialDocument.create({
      data: {
        organizationId,
        docType: input.docType,
        direction: input.direction,
        counterpartyPartyId: input.counterpartyPartyId ?? null,
        counterpartyOrgId: input.counterpartyOrgId ?? null,
        supplierId: input.supplierId ?? null,
        linkedEntityType: input.linkedEntityType ?? null,
        linkedEntityId: input.linkedEntityId ?? null,
        tripId: input.tripId ?? null,
        serviceRequestId: input.serviceRequestId ?? null,
        documentNumber: input.documentNumber ?? null,
        label: input.label,
        amount: input.amount,
        taxAmount,
        taxBreakdownJson: taxBreakdown
          ? (taxBreakdown as unknown as Prisma.InputJsonValue)
          : undefined,
        currency: input.currency || 'INR',
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        notes: input.notes ?? null,
        createdBy: userId,
        lines: input.lines?.length
          ? {
              create: input.lines.map((l) => ({
                description: l.description,
                quantity: l.quantity,
                unitAmount: l.unitAmount,
                taxAmount: l.taxAmount ?? 0,
              })),
            }
          : undefined,
      },
      include: { lines: true },
    });
    return doc;
  }

  async listCommercialDocuments(organizationId: string) {
    return this.prisma.commercialDocument.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { lines: true, payments: true, allocations: true },
    });
  }

  /** Accountant/GSP-ready CSV of commercial docs + payments (not in-app GSTR filing). */
  async exportGstrReadyCsv(
    organizationId: string,
    opts?: { from?: string; to?: string },
  ) {
    const from = opts?.from ? new Date(opts.from) : null;
    const to = opts?.to ? new Date(opts.to) : null;
    const docs = await this.prisma.commercialDocument.findMany({
      where: {
        organizationId,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lt: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 2000,
      include: { payments: true },
    });
    const rows = commercialDocsToGstrExportRows(
      docs.map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
        docType: d.docType,
        direction: d.direction,
        label: d.label,
        status: d.status,
        currency: d.currency,
        amount: Number(d.amount),
        taxAmount: Number(d.taxAmount),
        taxBreakdownJson: d.taxBreakdownJson,
        createdAt: d.createdAt,
        payments: d.payments.map((p) => ({
          amount: Number(p.amount),
          paidAt: p.paidAt,
        })),
      })),
    );
    return {
      csv: gstrExportRowsToCsv(rows),
      rowCount: rows.length,
      disclaimer:
        'GSTR-ready export for accountant/GSP — not in-app filing or a GST-compliant ledger.',
    };
  }

  async createPaymentRecord(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreatePaymentRecordSchema>,
  ) {
    const payment = await this.prisma.paymentRecord.create({
      data: {
        organizationId,
        commercialDocumentId: input.commercialDocumentId ?? null,
        direction: input.direction,
        amount: input.amount,
        currency: input.currency || 'INR',
        method: input.method ?? null,
        reference: input.reference ?? null,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        linkedEntityType: input.linkedEntityType ?? null,
        linkedEntityId: input.linkedEntityId ?? null,
        tripId: input.tripId ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
      },
    });
    if (input.commercialDocumentId) {
      await this.allocatePayment(organizationId, {
        paymentId: payment.id,
        commercialDocumentId: input.commercialDocumentId,
        amount: input.amount,
      });
    }
    await this.timeline(
      organizationId,
      'PaymentReceived',
      'payment_record',
      payment.id,
      `Payment ${input.amount}`,
      userId,
    );
    return payment;
  }

  async allocatePayment(
    organizationId: string,
    input: z.infer<typeof CreatePaymentAllocationSchema>,
  ) {
    const payment = await this.prisma.paymentRecord.findFirst({
      where: { id: input.paymentId, organizationId },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const doc = await this.prisma.commercialDocument.findFirst({
      where: { id: input.commercialDocumentId, organizationId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const already = payment.allocations.reduce((s, a) => s + Number(a.amount), 0);
    if (already + input.amount > Number(payment.amount) + 0.001) {
      throw new BadRequestException('Allocation exceeds payment amount');
    }

    const allocation = await this.prisma.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        commercialDocumentId: doc.id,
        amount: input.amount,
      },
    });

    const paid = Number(doc.amountPaid) + input.amount;
    const nextStatus = paid >= Number(doc.amount) + Number(doc.taxAmount) ? 'paid' : 'partial';
    if (doc.status !== nextStatus) {
      assertTransition('commercial_document', doc.status, nextStatus);
    }
    await this.prisma.commercialDocument.update({
      where: { id: doc.id },
      data: {
        amountPaid: paid,
        status: nextStatus,
      },
    });

    await this.timeline(
      organizationId,
      'PaymentAllocated',
      'payment_allocation',
      allocation.id,
      `Allocated ${input.amount} to document ${doc.id}`,
    );
    return allocation;
  }

  async paymentUnallocated(organizationId: string, paymentId: string) {
    const payment = await this.prisma.paymentRecord.findFirst({
      where: { id: paymentId, organizationId },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const allocated = payment.allocations.reduce((s, a) => s + Number(a.amount), 0);
    return {
      paymentId,
      amount: Number(payment.amount),
      allocated,
      unallocated: Number(payment.amount) - allocated,
    };
  }

  // ─── Conversations ─────────────────────────────────────────────────

  async listConversations(organizationId: string) {
    return this.prisma.conversation.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        party: { select: { id: true, displayName: true } },
      },
    });
  }

  async createConversation(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateConversationSchema>,
  ) {
    return this.prisma.conversation.create({
      data: {
        organizationId,
        subject: input.subject,
        linkedEntityType: input.linkedEntityType ?? null,
        linkedEntityId: input.linkedEntityId ?? null,
        counterpartyOrgId: input.counterpartyOrgId ?? null,
        partyId: input.partyId ?? null,
        assignedUserId: input.assignedUserId ?? null,
        createdBy: userId,
      },
    });
  }

  async postMessage(
    organizationId: string,
    conversationId: string,
    userId: string,
    input: z.infer<typeof PostMessageSchema>,
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    const msg = await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        body: input.body,
        visibility: input.visibility,
        authorUserId: userId,
        attachmentsJson: input.attachmentDocumentIds
          ? { documentIds: input.attachmentDocumentIds }
          : undefined,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    await this.timeline(
      organizationId,
      'ConversationMessagePosted',
      'conversation',
      conversationId,
      'Message posted',
      userId,
    );
    return msg;
  }

  async getTimeline(organizationId: string, entityType?: string, entityId?: string) {
    return this.prisma.businessTimelineEvent.findMany({
      where: {
        organizationId,
        ...(entityType && entityId ? { entityType, entityId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  // ─── Agency: contracts, changes, incidents, closure, ops centre ────

  async listSupplierContracts(organizationId: string, supplierId?: string) {
    return this.prisma.supplierContract.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(supplierId ? { supplierId } : {}),
      },
      include: { supplier: { select: { id: true, name: true, type: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createSupplierContract(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateSupplierContractSchema>,
  ) {
    const created = await this.prisma.supplierContract.create({
      data: {
        organizationId,
        supplierId: input.supplierId,
        title: input.title,
        status: input.status,
        versionNumber: input.versionNumber ?? 1,
        supersedesId: input.supersedesId ?? null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
        creditLimit: input.creditLimit ?? null,
        paymentTerms: input.paymentTerms ?? null,
        cancellationTerms: input.cancellationTerms ?? null,
        cancellationPolicyJson:
          input.cancellationPolicyJson === undefined
            ? undefined
            : input.cancellationPolicyJson == null
              ? Prisma.JsonNull
              : (input.cancellationPolicyJson as Prisma.InputJsonValue),
        commissionPercent: input.commissionPercent ?? null,
        preferred: input.preferred ?? false,
        blackoutJson: (input.blackoutJson ?? undefined) as Prisma.InputJsonValue | undefined,
        stopSaleJson: (input.stopSaleJson ?? undefined) as Prisma.InputJsonValue | undefined,
        notes: input.notes ?? null,
        createdBy: userId,
      },
    });
    if (created.status === 'active') {
      await this.supersedeOtherActiveContracts(
        organizationId,
        created.supplierId,
        created.id,
      );
    }
    return created;
  }

  async updateSupplierContract(
    organizationId: string,
    contractId: string,
    input: z.infer<typeof UpdateSupplierContractSchema>,
  ) {
    const existing = await this.prisma.supplierContract.findFirst({
      where: { id: contractId, organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Contract not found');

    const updated = await this.prisma.supplierContract.update({
      where: { id: contractId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.versionNumber !== undefined
          ? { versionNumber: input.versionNumber }
          : {}),
        ...(input.supersedesId !== undefined
          ? { supersedesId: input.supersedesId }
          : {}),
        ...(input.effectiveFrom !== undefined
          ? { effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null }
          : {}),
        ...(input.effectiveUntil !== undefined
          ? {
              effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
            }
          : {}),
        ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
        ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms } : {}),
        ...(input.cancellationTerms !== undefined
          ? { cancellationTerms: input.cancellationTerms }
          : {}),
        ...(input.cancellationPolicyJson !== undefined
          ? {
              cancellationPolicyJson:
                input.cancellationPolicyJson == null
                  ? Prisma.JsonNull
                  : (input.cancellationPolicyJson as Prisma.InputJsonValue),
            }
          : {}),
        ...(input.commissionPercent !== undefined
          ? { commissionPercent: input.commissionPercent }
          : {}),
        ...(input.preferred !== undefined ? { preferred: input.preferred } : {}),
        ...(input.blackoutJson !== undefined
          ? { blackoutJson: input.blackoutJson as Prisma.InputJsonValue }
          : {}),
        ...(input.stopSaleJson !== undefined
          ? { stopSaleJson: input.stopSaleJson as Prisma.InputJsonValue }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { supplier: { select: { id: true, name: true, type: true } } },
    });

    if (input.status === 'active') {
      await this.supersedeOtherActiveContracts(
        organizationId,
        updated.supplierId,
        updated.id,
      );
    }

    return updated;
  }

  /**
   * Clone an active (or any) contract as a new draft version.
   * Prior rates stay on the superseded contract; optional copy onto the draft.
   */
  async cloneSupplierContractVersion(
    organizationId: string,
    userId: string,
    contractId: string,
    input?: { copyRates?: boolean },
  ) {
    const source = await this.prisma.supplierContract.findFirst({
      where: { id: contractId, organizationId, deletedAt: null },
    });
    if (!source) throw new NotFoundException('Contract not found');

    const maxVersion = await this.prisma.supplierContract.aggregate({
      where: {
        organizationId,
        supplierId: source.supplierId,
        deletedAt: null,
      },
      _max: { versionNumber: true },
    });
    const nextVersion = (maxVersion._max.versionNumber ?? source.versionNumber) + 1;

    const draft = await this.prisma.supplierContract.create({
      data: {
        organizationId,
        supplierId: source.supplierId,
        title: source.title,
        status: 'draft',
        versionNumber: nextVersion,
        supersedesId: source.id,
        effectiveFrom: source.effectiveFrom,
        effectiveUntil: source.effectiveUntil,
        creditLimit: source.creditLimit,
        paymentTerms: source.paymentTerms,
        cancellationTerms: source.cancellationTerms,
        cancellationPolicyJson: source.cancellationPolicyJson ?? undefined,
        commissionPercent: source.commissionPercent,
        preferred: source.preferred,
        blackoutJson: source.blackoutJson ?? undefined,
        stopSaleJson: source.stopSaleJson ?? undefined,
        notes: source.notes,
        createdBy: userId,
      },
      include: { supplier: { select: { id: true, name: true, type: true } } },
    });

    const copyRates = input?.copyRates !== false;
    if (copyRates) {
      const rates = await this.prisma.supplierHotelRate.findMany({
        where: {
          organizationId,
          contractId: source.id,
          deletedAt: null,
        },
      });
      if (rates.length) {
        await this.prisma.supplierHotelRate.createMany({
          data: rates.map((r) => ({
            organizationId: r.organizationId,
            supplierId: r.supplierId,
            placeId: r.placeId,
            isSystem: false,
            roomType: r.roomType,
            roomProductId: r.roomProductId,
            contractId: draft.id,
            mealPlan: r.mealPlan,
            unitCost: r.unitCost,
            weekendUnitCost: r.weekendUnitCost,
            occupancyPricingJson:
              r.occupancyPricingJson === null
                ? Prisma.JsonNull
                : (r.occupancyPricingJson as Prisma.InputJsonValue),
            currency: r.currency,
            startDate: r.startDate,
            endDate: r.endDate,
            isActive: r.isActive,
            versionNumber: 1,
            supersedesId: r.id,
            createdBy: userId,
          })),
        });
      }
    }

    return draft;
  }

  private async supersedeOtherActiveContracts(
    organizationId: string,
    supplierId: string,
    keepActiveId: string,
  ) {
    await this.prisma.supplierContract.updateMany({
      where: {
        organizationId,
        supplierId,
        deletedAt: null,
        status: 'active',
        id: { not: keepActiveId },
      },
      data: { status: 'superseded' },
    });
  }

  async listTripChangeCases(organizationId: string, tripId?: string) {
    return this.prisma.tripChangeCase.findMany({
      where: {
        organizationId,
        ...(tripId ? { tripId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTripChangeCase(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateTripChangeCaseSchema>,
  ) {
    return this.prisma.tripChangeCase.create({
      data: {
        organizationId,
        tripId: input.tripId,
        changeType: input.changeType,
        summary: input.summary,
        impactJson: (input.impactJson ?? undefined) as Prisma.InputJsonValue | undefined,
        additionalAmount: input.additionalAmount ?? null,
        currency: input.currency || 'INR',
        createdBy: userId,
      },
    });
  }

  async updateTripChangeCase(
    organizationId: string,
    id: string,
    input: z.infer<typeof UpdateTripChangeCaseSchema>,
  ) {
    const row = await this.prisma.tripChangeCase.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Change case not found');
    if (input.status !== undefined && input.status !== row.status) {
      assertTransition('trip_change', row.status, input.status);
    }
    return this.prisma.tripChangeCase.update({
      where: { id },
      data: {
        status: input.status,
        impactJson: input.impactJson as Prisma.InputJsonValue | undefined,
        additionalAmount: input.additionalAmount,
        resolutionNote: input.resolutionNote,
      },
    });
  }

  async createIncident(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateServiceIncidentSchema>,
  ) {
    const incident = await this.prisma.serviceIncident.create({
      data: {
        organizationId,
        tripId: input.tripId ?? null,
        serviceRequestId: input.serviceRequestId ?? null,
        supplierId: input.supplierId ?? null,
        severity: input.severity,
        category: input.category,
        title: input.title,
        description: input.description ?? null,
        reportedBy: input.reportedBy ?? userId,
        travellerImpact: input.travellerImpact ?? null,
        compensationAmount: input.compensationAmount ?? null,
        currency: input.currency || 'INR',
        createdBy: userId,
      },
    });
    await this.timeline(
      organizationId,
      'IncidentReported',
      'service_incident',
      incident.id,
      incident.title,
      userId,
    );

    try {
      const recipientIds = new Set<string>();
      if (input.tripId) {
        const trip = await this.prisma.trip.findFirst({
          where: { id: input.tripId, organizationId, deletedAt: null },
          select: { ownerId: true },
        });
        if (trip?.ownerId) recipientIds.add(trip.ownerId);
      }
      if (recipientIds.size === 0) {
        const owners = await this.prisma.organizationMembership.findMany({
          where: {
            organizationId,
            isActive: true,
            deletedAt: null,
            isOwner: true,
          },
          select: { userId: true },
        });
        for (const o of owners) recipientIds.add(o.userId);
      }
      recipientIds.delete(userId);
      if (recipientIds.size) {
        const flags = await this.notifications.orgNotifyFlags(organizationId);
        const channel = flags.notifyOnIncident ? 'both' : 'in_app';
        await Promise.all(
          [...recipientIds].map((uid) =>
            this.notifications.notify({
              organizationId,
              userId: uid,
              title: `Incident: ${incident.title}`,
              body: `${incident.severity} · ${incident.category}${
                incident.travellerImpact ? ` · ${incident.travellerImpact}` : ''
              }`,
              linkPath: input.tripId ? `/trips/${input.tripId}` : '/care',
              channel,
            }),
          ),
        );
      }
    } catch {
      /* non-blocking */
    }

    return incident;
  }

  async updateIncident(
    organizationId: string,
    id: string,
    input: z.infer<typeof UpdateServiceIncidentSchema>,
  ) {
    const row = await this.prisma.serviceIncident.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Incident not found');
    return this.prisma.serviceIncident.update({
      where: { id },
      data: {
        status: input.status,
        resolution: input.resolution,
        compensationAmount: input.compensationAmount,
        assignedUserId: input.assignedUserId,
      },
    });
  }

  async listIncidents(organizationId: string, tripId?: string, status?: string) {
    return this.prisma.serviceIncident.findMany({
      where: {
        organizationId,
        ...(tripId ? { tripId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        trip: { select: { id: true, tripNumber: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async closeTrip(
    organizationId: string,
    userId: string,
    tripId: string,
    input: z.infer<typeof CloseTripSchema>,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'completed', updatedBy: userId },
    });
    const closure = await this.prisma.tripClosure.upsert({
      where: { tripId },
      create: {
        tripId,
        organizationId,
        reconciliationNote: input.reconciliationNote ?? null,
        suppliersSettled: input.suppliersSettled ?? false,
        feedbackRequested: input.feedbackRequested ?? false,
        closeReason: input.closeReason ?? null,
        closedBy: userId,
      },
      update: {
        reconciliationNote: input.reconciliationNote ?? null,
        suppliersSettled: input.suppliersSettled ?? false,
        feedbackRequested: input.feedbackRequested ?? false,
        closeReason: input.closeReason ?? null,
        closedBy: userId,
        closedAt: new Date(),
      },
    });
    await this.timeline(
      organizationId,
      'TripClosed',
      'trip',
      tripId,
      'Trip closed',
      userId,
    );
    return closure;
  }

  async opsCommandCentre(organizationId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const [
      unconfirmedBookings,
      openIncidents,
      openServiceRequests,
      openChangeCases,
      overduePayments,
      upcomingArrivals,
      openConversations,
      activeHolds,
      dataQualityOpen,
      openRecoveryItems,
    ] = await Promise.all([
      this.prisma.bookingComponent.count({
        where: {
          organizationId,
          status: { in: ['pending', 'requested', 'drafted', 'required', 'held'] },
        },
      }),
      this.prisma.serviceIncident.count({
        where: { organizationId, status: { in: ['open', 'investigating'] } },
      }),
      this.prisma.serviceRequest.count({
        where: {
          buyerOrganizationId: organizationId,
          status: { in: ['sent', 'acknowledged', 'held', 'drafted'] },
        },
      }),
      this.prisma.tripChangeCase.count({
        where: {
          organizationId,
          status: { in: ['requested', 'impact_calculated', 'awaiting_customer', 'awaiting_supplier'] },
        },
      }),
      this.prisma.tripPayment.count({
        where: {
          organizationId,
          status: { in: ['scheduled', 'partial', 'overdue'] },
          dueAt: { lt: now },
        },
      }),
      this.prisma.bookingComponent.count({
        where: {
          organizationId,
          status: 'confirmed',
          startAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.conversation.count({
        where: { organizationId, status: 'open' },
      }),
      this.prisma.inventoryHold.count({
        where: { organizationId, status: 'active' },
      }),
      this.prisma.dataQualityIssue.count({
        where: { organizationId, state: 'open' },
      }),
      this.prisma.workflowRecoveryItem.count({
        where: { organizationId, status: { in: ['open', 'retrying'] } },
      }),
    ]);

    return {
      unconfirmedBookings,
      openIncidents,
      openServiceRequests,
      openChangeCases,
      overduePayments,
      upcomingArrivals,
      openConversations,
      activeHolds,
      dataQualityOpen,
      openRecoveryItems,
      generatedAt: now.toISOString(),
    };
  }

  // ─── Stay OS ───────────────────────────────────────────────────────

  async listBuildings(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    return this.prisma.assetBuilding.findMany({
      where: { assetId },
      include: { floors: { orderBy: { level: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createBuilding(
    organizationId: string,
    input: { assetId: string; name: string; floorsHint?: number },
  ) {
    await this.requireAsset(organizationId, input.assetId);
    return this.prisma.assetBuilding.create({
      data: {
        assetId: input.assetId,
        name: input.name,
        floorsHint: input.floorsHint ?? null,
      },
    });
  }

  async listMaintenance(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    return this.prisma.maintenanceWorkOrder.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      include: { roomUnit: true },
    });
  }

  async listDiningCapacities(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    return this.prisma.diningCapacity.findMany({
      where: { assetId },
      orderBy: [{ serviceDate: 'asc' }, { slotStart: 'asc' }],
    });
  }

  async listSettlements(organizationId: string) {
    const rows = await this.prisma.partnerSettlement.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        serviceRequest: {
          select: { id: true, title: true, status: true, serviceType: true },
        },
      },
      take: 100,
    });
    const orgIds = [...new Set(rows.map((r) => r.counterpartyOrgId))];
    const orgs = orgIds.length
      ? await this.prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, kind: true },
        })
      : [];
    const byId = Object.fromEntries(orgs.map((o) => [o.id, o]));
    return rows.map((r) => ({
      ...r,
      counterpartyOrg: byId[r.counterpartyOrgId] ?? null,
    }));
  }

  async listRatings(organizationId: string) {
    const rows = await this.prisma.partnerRating.findMany({
      where: {
        OR: [
          { fromOrganizationId: organizationId },
          { targetOrganizationId: organizationId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const orgIds = [
      ...new Set([
        ...rows.map((r) => r.fromOrganizationId),
        ...rows.map((r) => r.targetOrganizationId),
      ]),
    ];
    const orgs = orgIds.length
      ? await this.prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, kind: true },
        })
      : [];
    const byId = Object.fromEntries(orgs.map((o) => [o.id, o]));
    return rows.map((r) => ({
      ...r,
      fromOrganization: byId[r.fromOrganizationId] ?? null,
      targetOrganization: byId[r.targetOrganizationId] ?? null,
      direction:
        r.fromOrganizationId === organizationId ? ('given' as const) : ('received' as const),
    }));
  }

  /** Phase B Care board — open incidents + recent partner ratings. */
  async careBoard(organizationId: string) {
    const [openIncidents, ratings] = await Promise.all([
      this.prisma.serviceIncident.findMany({
        where: {
          organizationId,
          status: { in: ['open', 'investigating'] },
        },
        include: {
          supplier: { select: { id: true, name: true } },
          trip: { select: { id: true, tripNumber: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.listRatings(organizationId),
    ]);
    return {
      openIncidents,
      ratings: ratings.slice(0, 30),
      counts: {
        openIncidents: openIncidents.length,
        ratings: ratings.length,
      },
    };
  }

  async createFloor(organizationId: string, buildingId: string, name: string, level = 0) {
    const building = await this.prisma.assetBuilding.findFirst({
      where: { id: buildingId, asset: { organizationId } },
    });
    if (!building) throw new NotFoundException('Building not found');
    return this.prisma.assetFloor.create({
      data: { buildingId, name, level },
    });
  }

  async createHousekeepingTask(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateHousekeepingTaskSchema>,
  ) {
    await this.requireAsset(organizationId, input.assetId);
    return this.prisma.housekeepingTask.create({
      data: {
        assetId: input.assetId,
        roomUnitId: input.roomUnitId,
        priority: input.priority,
        checklistJson: (input.checklistJson ?? undefined) as Prisma.InputJsonValue | undefined,
        assignedUserId: input.assignedUserId ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        notes: input.notes ?? null,
        createdBy: userId,
      },
    });
  }

  async updateHousekeepingTask(
    organizationId: string,
    id: string,
    userId: string,
    input: z.infer<typeof UpdateHousekeepingTaskSchema>,
  ) {
    const task = await this.prisma.housekeepingTask.findFirst({
      where: { id, asset: { organizationId } },
    });
    if (!task) throw new NotFoundException('Housekeeping task not found');

    if (input.status !== undefined && input.status !== task.status) {
      assertTransition('housekeeping_task', task.status, input.status);
    }
    if (input.status === 'cleaning' && task.status !== 'cleaning') {
      // Reopening a previously blocked/ready task back into cleaning needs a reason.
      if (task.status === 'blocked' && !input.reopenedReason) {
        throw new BadRequestException('reopenedReason is required to reopen a blocked task');
      }
    }

    const now = new Date();
    const updated = await this.prisma.housekeepingTask.update({
      where: { id },
      data: {
        status: input.status,
        assignedUserId: input.assignedUserId,
        notes: input.notes,
        ...(input.status === 'cleaning' && task.status !== 'cleaning'
          ? { startedAt: now, ...(input.reopenedReason ? { reopenedReason: input.reopenedReason } : {}) }
          : {}),
        ...(input.status === 'inspected'
          ? { inspectedAt: now, inspectedByUserId: input.inspectedByUserId ?? userId }
          : {}),
        ...(input.status === 'ready' ? { completedAt: now } : {}),
        ...(input.reopenedReason !== undefined ? { reopenedReason: input.reopenedReason } : {}),
      },
    });
    if (input.status === 'ready') {
      await this.prisma.assetRoomUnit.update({
        where: { id: task.roomUnitId },
        data: { status: 'vacant_clean' },
      });
      await this.timeline(
        organizationId,
        'RoomMarkedReady',
        'asset_room_unit',
        task.roomUnitId,
        'Room marked ready',
      );
    }
    return updated;
  }

  async listHousekeepingTasks(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    return this.prisma.housekeepingTask.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      include: { roomUnit: true },
    });
  }

  async createMaintenance(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateMaintenanceWorkOrderSchema>,
  ) {
    await this.requireAsset(organizationId, input.assetId);
    const wo = await this.prisma.maintenanceWorkOrder.create({
      data: {
        assetId: input.assetId,
        roomUnitId: input.roomUnitId ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        estimatedCost: input.estimatedCost ?? null,
        blockInventory: input.blockInventory ?? false,
        category: input.category ?? null,
        vendorName: input.vendorName ?? null,
        downtimeFrom: input.downtimeFrom ? new Date(input.downtimeFrom) : null,
        downtimeTo: input.downtimeTo ? new Date(input.downtimeTo) : null,
        partsJson: (input.partsJson ?? undefined) as Prisma.InputJsonValue | undefined,
        recurring: input.recurring ?? false,
        createdBy: userId,
      },
    });
    if (input.blockInventory && input.roomUnitId) {
      await this.prisma.assetRoomUnit.update({
        where: { id: input.roomUnitId },
        data: { status: 'ooo' },
      });
    }
    return wo;
  }

  async updateMaintenance(
    organizationId: string,
    id: string,
    input: z.infer<typeof UpdateMaintenanceWorkOrderSchema>,
  ) {
    const wo = await this.prisma.maintenanceWorkOrder.findFirst({
      where: { id, asset: { organizationId } },
    });
    if (!wo) throw new NotFoundException('Work order not found');
    const updated = await this.prisma.maintenanceWorkOrder.update({
      where: { id },
      data: {
        status: input.status,
        assignedTo: input.assignedTo,
        actualCost: input.actualCost,
        resolution: input.resolution,
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
        ...(input.downtimeFrom !== undefined
          ? { downtimeFrom: input.downtimeFrom ? new Date(input.downtimeFrom) : null }
          : {}),
        ...(input.downtimeTo !== undefined
          ? { downtimeTo: input.downtimeTo ? new Date(input.downtimeTo) : null }
          : {}),
        ...(input.partsJson !== undefined
          ? { partsJson: input.partsJson as Prisma.InputJsonValue }
          : {}),
        ...(input.recurring !== undefined ? { recurring: input.recurring } : {}),
      },
    });
    if (
      (input.status === 'resolved' || input.status === 'closed') &&
      wo.roomUnitId &&
      wo.blockInventory
    ) {
      await this.prisma.assetRoomUnit.update({
        where: { id: wo.roomUnitId },
        data: { status: 'vacant_dirty' },
      });
    }
    return updated;
  }

  async addFolioCharge(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateFolioChargeSchema>,
  ) {
    if (input.mealReservationId) {
      const meal = await this.prisma.mealReservation.findFirst({
        where: { id: input.mealReservationId, asset: { organizationId } },
      });
      if (!meal) throw new NotFoundException('Meal reservation not found');
      return this.prisma.folioCharge.create({
        data: {
          mealReservationId: input.mealReservationId,
          description: input.description,
          amount: input.amount,
          taxAmount: input.taxAmount ?? 0,
          category: input.category,
          currency: meal.currency,
          createdBy: userId,
        },
      });
    }
    const res = await this.prisma.stayReservation.findFirst({
      where: { id: input.stayReservationId!, asset: { organizationId } },
    });
    if (!res) throw new NotFoundException('Reservation not found');
    return this.prisma.folioCharge.create({
      data: {
        stayReservationId: input.stayReservationId!,
        description: input.description,
        amount: input.amount,
        taxAmount: input.taxAmount ?? 0,
        category: input.category,
        currency: res.currency,
        createdBy: userId,
      },
    });
  }

  async getFolio(organizationId: string, stayReservationId: string) {
    const res = await this.prisma.stayReservation.findFirst({
      where: { id: stayReservationId, asset: { organizationId } },
      include: { folioCharges: true },
    });
    if (!res) throw new NotFoundException('Reservation not found');
    const roomCharge = Number(res.rateAmount || 0);
    const extras = res.folioCharges.reduce(
      (s, c) => s + Number(c.amount) + Number(c.taxAmount),
      0,
    );
    const charges = extras;
    const paid = Number(res.amountPaid);
    return {
      reservation: res,
      roomCharge,
      extras,
      charges,
      paid,
      outstanding: Math.max(0, charges - paid),
      total: roomCharge + extras,
      currency: res.currency,
    };
  }

  async markNoShow(organizationId: string, stayReservationId: string) {
    const res = await this.prisma.stayReservation.findFirst({
      where: { id: stayReservationId, asset: { organizationId } },
    });
    if (!res) throw new NotFoundException('Reservation not found');
    if (!['confirmed', 'held', 'tentative'].includes(res.status)) {
      throw new BadRequestException('Cannot mark no-show in current status');
    }
    return this.prisma.stayReservation.update({
      where: { id: stayReservationId },
      data: { status: 'no_show' },
    });
  }

  async frontDeskBoards(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    const today = new Date();
    const day = today.toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(`${day}T23:59:59.999Z`);
    const [arrivals, departures, inHouse] = await Promise.all([
      this.prisma.stayReservation.findMany({
        where: {
          assetId,
          checkIn: start,
          status: { in: ['confirmed', 'held', 'tentative'] },
        },
        include: { roomUnit: true, roomProduct: true },
      }),
      this.prisma.stayReservation.findMany({
        where: {
          assetId,
          checkOut: start,
          status: 'checked_in',
        },
        include: { roomUnit: true, roomProduct: true },
      }),
      this.prisma.stayReservation.findMany({
        where: { assetId, status: 'checked_in' },
        include: { roomUnit: true, roomProduct: true },
      }),
    ]);
    return { arrivals, departures, inHouse, date: day, asOf: end.toISOString() };
  }

  // ─── Farmstay experiences ──────────────────────────────────────────

  async createExperience(
    organizationId: string,
    input: z.infer<typeof CreateExperienceProductSchema>,
  ) {
    await this.requireAsset(organizationId, input.assetId);
    return this.prisma.experienceProduct.create({
      data: {
        assetId: input.assetId,
        title: input.title,
        category: input.category ?? null,
        durationMinutes: input.durationMinutes ?? null,
        capacity: input.capacity ?? null,
        ageMin: input.ageMin ?? null,
        ageMax: input.ageMax ?? null,
        seasonalJson: (input.seasonalJson ?? undefined) as Prisma.InputJsonValue | undefined,
        safetyJson: (input.safetyJson ?? undefined) as Prisma.InputJsonValue | undefined,
        price: input.price ?? null,
        currency: input.currency || 'INR',
        instructorRequired: input.instructorRequired ?? false,
        weatherDependent: input.weatherDependent ?? false,
        description: input.description ?? null,
      },
    });
  }

  async listExperiences(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    return this.prisma.experienceProduct.findMany({
      where: { assetId, deletedAt: null },
      include: { slots: true },
      orderBy: { title: 'asc' },
    });
  }

  async createExperienceSlot(
    organizationId: string,
    input: z.infer<typeof CreateExperienceSlotSchema>,
  ) {
    const product = await this.prisma.experienceProduct.findFirst({
      where: { id: input.experienceProductId, asset: { organizationId } },
    });
    if (!product) throw new NotFoundException('Experience not found');
    return this.prisma.experienceSlot.create({
      data: {
        experienceProductId: input.experienceProductId,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        capacity: input.capacity,
      },
    });
  }

  // ─── Restaurant ────────────────────────────────────────────────────

  async createMealPackage(
    organizationId: string,
    input: z.infer<typeof CreateMealPackageSchema>,
  ) {
    await this.requireAsset(organizationId, input.assetId);
    return this.prisma.mealPackage.create({
      data: {
        assetId: input.assetId,
        name: input.name,
        mealType: input.mealType,
        pricePerPerson: input.pricePerPerson,
        currency: input.currency || 'INR',
        minGuests: input.minGuests ?? null,
        maxGuests: input.maxGuests ?? null,
        advanceNoticeHours: input.advanceNoticeHours ?? null,
        serviceWindow: input.serviceWindow ?? null,
        itemsIncludedJson: (input.itemsIncludedJson ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        dietaryOptionsJson: (input.dietaryOptions ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        description: input.description ?? null,
      },
    });
  }

  async listMealPackages(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    return this.prisma.mealPackage.findMany({
      where: { assetId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createDiningCapacity(
    organizationId: string,
    input: z.infer<typeof CreateDiningCapacitySchema>,
  ) {
    await this.requireAsset(organizationId, input.assetId);
    return this.prisma.diningCapacity.create({
      data: {
        assetId: input.assetId,
        serviceDate: new Date(input.serviceDate),
        slotStart: new Date(input.slotStart),
        slotEnd: new Date(input.slotEnd),
        totalCapacity: input.totalCapacity,
        zone: input.zone ?? null,
      },
    });
  }

  async createMealReservation(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateMealReservationSchema>,
  ) {
    // Delegate to Restaurant OS path via inline hold-safe create (legacy commerce clients).
    await this.requireAsset(organizationId, input.assetId);
    const pkg = input.mealPackageId
      ? await this.prisma.mealPackage.findFirst({
          where: { id: input.mealPackageId, assetId: input.assetId },
        })
      : null;
    const amount =
      input.rateAmount ??
      (pkg ? Number(pkg.pricePerPerson) * input.guestCount : null);

    return this.prisma.$transaction(async (tx) => {
      let holdId: string | null = null;
      if (input.diningCapacityId) {
        const hold = await tx.inventoryHold.create({
          data: {
            organizationId,
            resourceType: 'dining_capacity',
            resourceId: input.diningCapacityId,
            quantity: input.guestCount,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            status: 'active',
          },
        });
        holdId = hold.id;
        await this.applyHoldCapacity(
          tx,
          organizationId,
          {
            resourceType: 'dining_capacity',
            resourceId: input.diningCapacityId,
            quantity: input.guestCount,
          },
          'hold',
        );
        assertTransition('inventory_hold', 'active', 'confirmed');
        await tx.inventoryHold.update({
          where: { id: hold.id },
          data: { status: 'confirmed', releasedAt: new Date() },
        });
        await this.applyHoldCapacity(
          tx,
          organizationId,
          {
            resourceType: 'dining_capacity',
            resourceId: input.diningCapacityId,
            quantity: input.guestCount,
          },
          'confirm',
        );
      }

      return tx.mealReservation.create({
        data: {
          assetId: input.assetId,
          mealPackageId: input.mealPackageId ?? null,
          diningCapacityId: input.diningCapacityId ?? null,
          inventoryHoldId: holdId,
          serviceRequestId: input.serviceRequestId ?? null,
          partyId: input.partyId ?? null,
          serviceAt: new Date(input.serviceAt),
          guestCount: input.guestCount,
          guestName: input.guestName,
          source: input.source || 'manual',
          dietaryJson: (input.dietaryJson ?? undefined) as Prisma.InputJsonValue | undefined,
          rateAmount: amount,
          currency: input.currency || pkg?.currency || 'INR',
          rateSnapshotJson: {
            amount,
            mealPackageId: input.mealPackageId,
            capturedAt: new Date().toISOString(),
          },
          policySnapshotJson: {
            policyText: 'Standard group meal confirmation',
            capturedAt: new Date().toISOString(),
          },
          notes: input.notes ?? null,
          status: 'confirmed',
          createdBy: userId,
        },
      });
    });
  }

  async updateMealReservation(
    organizationId: string,
    id: string,
    input: z.infer<typeof UpdateMealReservationSchema>,
  ) {
    const row = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId } },
    });
    if (!row) throw new NotFoundException('Meal reservation not found');
    if (input.status && input.status !== row.status) {
      assertTransition('meal_reservation', row.status, input.status);
    }
    const updated = await this.prisma.mealReservation.update({
      where: { id },
      data: {
        status: input.status,
        preparationStatus: input.preparationStatus,
        guestCount: input.guestCount,
        notes: input.notes,
      },
    });
    if (input.status === 'served' || input.preparationStatus === 'served') {
      await this.timeline(
        organizationId,
        'MealServiceCompleted',
        'meal_reservation',
        id,
        'Meal service completed',
      );
    }
    return updated;
  }

  async kitchenBoard(organizationId: string, assetId: string) {
    await this.requireAsset(organizationId, assetId);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return this.prisma.mealReservation.findMany({
      where: {
        assetId,
        serviceAt: { gte: start, lte: end },
        status: { notIn: ['cancelled'] },
      },
      include: { mealPackage: true },
      orderBy: { serviceAt: 'asc' },
    });
  }

  // ─── Network ───────────────────────────────────────────────────────

  async createNegotiatedRate(
    organizationId: string,
    input: z.infer<typeof CreateNegotiatedRateSchema>,
  ) {
    const rel = await this.prisma.orgRelationship.findFirst({
      where: { id: input.relationshipId, fromOrganizationId: organizationId },
    });
    if (!rel) throw new NotFoundException('Relationship not found');
    return this.prisma.negotiatedRate.create({
      data: {
        relationshipId: input.relationshipId,
        buyerOrganizationId: organizationId,
        serviceType: input.serviceType,
        partnerAssetId: input.partnerAssetId ?? null,
        productRef: input.productRef ?? null,
        amount: input.amount,
        currency: input.currency || 'INR',
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
        notes: input.notes ?? null,
      },
    });
  }

  async importNegotiatedRatesCsv(
    organizationId: string,
    input: z.infer<typeof ImportNegotiatedRateCsvSchema>,
  ) {
    const relationships = await this.prisma.orgRelationship.findMany({
      where: { fromOrganizationId: organizationId },
      include: { toOrganization: { select: { id: true, name: true } } },
    });
    const byId = new Map(relationships.map((r) => [r.id, r]));
    const byPartnerName = new Map<string, typeof relationships>();
    for (const r of relationships) {
      const key = r.toOrganization.name.trim().toLowerCase();
      const list = byPartnerName.get(key) ?? [];
      list.push(r);
      byPartnerName.set(key, list);
    }

    const results: Array<{
      partner?: string | null;
      serviceType: string;
      amount: number;
      status: 'created' | 'skipped';
      id?: string;
      reason?: string;
    }> = [];

    for (const row of input.rows) {
      let relationshipId = row.relationshipId?.trim() || '';
      const partnerLabel = row.partner?.trim() || null;

      if (!relationshipId && partnerLabel) {
        const matches = byPartnerName.get(partnerLabel.toLowerCase()) ?? [];
        if (matches.length === 0) {
          results.push({
            partner: partnerLabel,
            serviceType: row.serviceType,
            amount: row.amount,
            status: 'skipped',
            reason: 'partner_not_found',
          });
          continue;
        }
        if (matches.length > 1) {
          results.push({
            partner: partnerLabel,
            serviceType: row.serviceType,
            amount: row.amount,
            status: 'skipped',
            reason: 'partner_ambiguous',
          });
          continue;
        }
        relationshipId = matches[0]!.id;
      }

      if (!relationshipId) {
        results.push({
          partner: partnerLabel,
          serviceType: row.serviceType,
          amount: row.amount,
          status: 'skipped',
          reason: 'missing_partner',
        });
        continue;
      }

      if (!byId.has(relationshipId)) {
        results.push({
          partner: partnerLabel,
          serviceType: row.serviceType,
          amount: row.amount,
          status: 'skipped',
          reason: 'relationship_not_found',
        });
        continue;
      }

      try {
        const created = await this.createNegotiatedRate(organizationId, {
          relationshipId,
          serviceType: row.serviceType,
          amount: row.amount,
          currency: row.currency,
          productRef: row.productRef ?? undefined,
          effectiveFrom: row.effectiveFrom ?? undefined,
          effectiveUntil: row.effectiveUntil ?? undefined,
          notes: row.notes ?? undefined,
        });
        results.push({
          partner: partnerLabel ?? byId.get(relationshipId)?.toOrganization.name,
          serviceType: row.serviceType,
          amount: row.amount,
          status: 'created',
          id: created.id,
        });
      } catch {
        results.push({
          partner: partnerLabel,
          serviceType: row.serviceType,
          amount: row.amount,
          status: 'skipped',
          reason: 'create_failed',
        });
      }
    }

    const created = results.filter((r) => r.status === 'created').length;
    return { imported: created, skipped: results.length - created, results };
  }

  async listNegotiatedRates(organizationId: string) {
    const rows = await this.prisma.negotiatedRate.findMany({
      where: { buyerOrganizationId: organizationId },
      include: {
        relationship: {
          include: { toOrganization: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      ...r,
      partner: r.relationship.toOrganization,
    }));
  }

  async createSettlement(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreatePartnerSettlementSchema>,
  ) {
    return this.prisma.partnerSettlement.create({
      data: {
        organizationId,
        counterpartyOrgId: input.counterpartyOrgId,
        serviceRequestId: input.serviceRequestId ?? null,
        amount: input.amount,
        commissionAmount: input.commissionAmount ?? 0,
        currency: input.currency || 'INR',
        notes: input.notes ?? null,
        createdBy: userId,
      },
    });
  }

  async createRating(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreatePartnerRatingSchema>,
  ) {
    return this.prisma.partnerRating.create({
      data: {
        fromOrganizationId: organizationId,
        targetOrganizationId: input.targetOrganizationId,
        serviceRequestId: input.serviceRequestId ?? null,
        score: input.score,
        note: input.note ?? null,
        createdBy: userId,
      },
    });
  }

  // ─── Commerce Integrity ────────────────────────────────────────────

  /** RFQ: another ServiceRequest (+ item) against the same BookingRequirement. */
  async negotiateForBooking(
    organizationId: string,
    userId: string,
    input: z.infer<typeof NegotiateServiceRequestSchema>,
  ) {
    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: input.bookingComponentId, organizationId },
    });
    if (!booking) throw new NotFoundException('Booking requirement not found');

    const serviceType =
      booking.type === 'hotel'
        ? 'STAY'
        : booking.type === 'transfer'
          ? 'TRANSFER'
          : booking.type === 'meal'
            ? 'MEAL'
            : booking.type === 'activity'
              ? 'ACTIVITY'
              : 'OTHER';

    return this.prisma.serviceRequest.create({
      data: {
        buyerOrganizationId: organizationId,
        sellerOrganizationId: input.sellerOrganizationId ?? null,
        supplierId: input.supplierId ?? booking.supplierId,
        partnerAssetId: input.partnerAssetId ?? booking.partnerAssetId,
        serviceType,
        title: input.title || booking.title,
        status: 'sent',
        tripId: booking.tripId,
        serviceStartAt: booking.startAt,
        serviceEndAt: booking.endAt,
        quotedAmount: input.quotedAmount ?? booking.quotedAmount,
        currency: booking.currency,
        notes: input.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
        items: {
          create: {
            bookingComponentId: booking.id,
            quantity: booking.requiredQuantity ?? 1,
            status: 'sent',
            requestedTermsJson: {
              startAt: booking.startAt?.toISOString() ?? null,
              endAt: booking.endAt?.toISOString() ?? null,
            },
            currency: booking.currency,
          },
        },
      },
      include: { items: true },
    });
  }

  async createServiceRequestItem(
    organizationId: string,
    input: z.infer<typeof CreateServiceRequestItemSchema>,
  ) {
    const sr = await this.prisma.serviceRequest.findFirst({
      where: {
        id: input.serviceRequestId,
        OR: [
          { buyerOrganizationId: organizationId },
          { sellerOrganizationId: organizationId },
        ],
      },
    });
    if (!sr) throw new NotFoundException('Service request not found');
    return this.prisma.serviceRequestItem.create({
      data: {
        serviceRequestId: input.serviceRequestId,
        bookingComponentId: input.bookingComponentId ?? null,
        productRef: input.productRef ?? null,
        quantity: input.quantity ?? 1,
        requestedTermsJson: (input.requestedTermsJson ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        offeredTermsJson: (input.offeredTermsJson ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        agreedAmount: input.agreedAmount ?? null,
        currency: input.currency || 'INR',
      },
    });
  }

  async createInventoryHold(
    organizationId: string,
    input: z.infer<typeof CreateInventoryHoldSchema>,
  ) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.inventoryHold.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }
    const hold = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryHold.create({
        data: {
          organizationId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          quantity: input.quantity ?? 1,
          windowStart: input.windowStart ? new Date(input.windowStart) : null,
          windowEnd: input.windowEnd ? new Date(input.windowEnd) : null,
          expiresAt: new Date(input.expiresAt),
          sourceServiceRequestItemId: input.sourceServiceRequestItemId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          status: 'active',
        },
      });
      await this.applyHoldCapacity(tx, organizationId, created, 'hold');
      return created;
    });
    await this.timeline(
      organizationId,
      'HoldCreated',
      'inventory_hold',
      hold.id,
      `Hold on ${hold.resourceType}:${hold.resourceId}`,
    );
    return hold;
  }

  async expireHolds(limit = 50) {
    const now = new Date();
    const due = await this.prisma.inventoryHold.findMany({
      where: { status: 'active', expiresAt: { lte: now } },
      take: limit,
    });
    const results: string[] = [];
    for (const hold of due) {
      await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.inventoryHold.findFirst({
          where: { id: hold.id, status: 'active' },
        });
        if (!fresh) return;
        assertTransition('inventory_hold', fresh.status, 'expired');
        await tx.inventoryHold.update({
          where: { id: hold.id },
          data: { status: 'expired', releasedAt: now },
        });
        await this.applyHoldCapacity(tx, hold.organizationId, fresh, 'expire');
        results.push(hold.id);
      });
      await this.timeline(
        hold.organizationId,
        'HoldExpired',
        'inventory_hold',
        hold.id,
        'Hold expired and capacity released',
      );
    }
    return { expired: results };
  }

  async confirmServiceRequestItem(
    organizationId: string,
    userId: string,
    input: z.infer<typeof ConfirmServiceRequestItemSchema>,
  ) {
    const item = await this.prisma.serviceRequestItem.findFirst({
      where: { id: input.itemId },
      include: {
        serviceRequest: true,
        bookingComponent: true,
        inventoryHold: true,
      },
    });
    if (!item || item.serviceRequest.buyerOrganizationId !== organizationId) {
      throw new NotFoundException('Service request item not found');
    }

    if (input.idempotencyKey) {
      const prior = await this.prisma.serviceRequest.findFirst({
        where: {
          buyerOrganizationId: organizationId,
          confirmIdempotencyKey: input.idempotencyKey,
        },
        include: { items: true },
      });
      if (prior) {
        return {
          serviceRequest: prior,
          item: prior.items.find((i) => i.id === item.id) ?? item,
        };
      }
    }

    if (!input.rateSnapshotJson || !input.policySnapshotJson) {
      throw new BadRequestException('Confirm requires rate and policy snapshots');
    }

    assertTransition('service_request_item', item.status, 'confirmed');
    assertTransition('service_request', item.serviceRequest.status, 'confirmed');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let hold = item.inventoryHold;
        if (input.hold) {
          if (input.hold.idempotencyKey) {
            hold =
              (await tx.inventoryHold.findFirst({
                where: {
                  organizationId,
                  idempotencyKey: input.hold.idempotencyKey,
                },
              })) ?? null;
          }
          if (!hold) {
            hold = await tx.inventoryHold.create({
              data: {
                organizationId,
                resourceType: input.hold.resourceType,
                resourceId: input.hold.resourceId,
                quantity: input.hold.quantity ?? 1,
                windowStart: input.hold.windowStart
                  ? new Date(input.hold.windowStart)
                  : null,
                windowEnd: input.hold.windowEnd
                  ? new Date(input.hold.windowEnd)
                  : null,
                expiresAt: new Date(input.hold.expiresAt),
                sourceServiceRequestItemId: item.id,
                idempotencyKey: input.hold.idempotencyKey ?? null,
                status: 'active',
              },
            });
            await this.applyHoldCapacity(tx, organizationId, hold, 'hold');
          }
        }

        if (hold && hold.status === 'active') {
          assertTransition('inventory_hold', hold.status, 'confirmed');
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: 'confirmed', releasedAt: new Date() },
          });
          await this.applyHoldCapacity(tx, organizationId, hold, 'confirm');
        }

        const updatedItem = await tx.serviceRequestItem.update({
          where: { id: item.id },
          data: {
            selected: true,
            status: 'confirmed',
            rateSnapshotJson: input.rateSnapshotJson as Prisma.InputJsonValue,
            policySnapshotJson: input.policySnapshotJson as Prisma.InputJsonValue,
            agreedAmount: input.agreedAmount ?? item.agreedAmount,
          },
        });

        if (item.bookingComponentId) {
          const siblings = await tx.serviceRequestItem.findMany({
            where: {
              bookingComponentId: item.bookingComponentId,
              id: { not: item.id },
              selected: true,
            },
          });
          for (const sib of siblings) {
            if (sib.status !== 'rejected') {
              assertTransition('service_request_item', sib.status, 'rejected');
            }
          }
          await tx.serviceRequestItem.updateMany({
            where: {
              bookingComponentId: item.bookingComponentId,
              id: { not: item.id },
              selected: true,
            },
            data: { selected: false, status: 'rejected' },
          });
          const booking = await tx.bookingComponent.findUnique({
            where: { id: item.bookingComponentId },
          });
          if (booking && booking.status !== 'confirmed') {
            assertTransition('booking_requirement', booking.status, 'confirmed');
          }
          await tx.bookingComponent.update({
            where: { id: item.bookingComponentId },
            data: {
              status: 'confirmed',
              confirmedAmount: input.agreedAmount ?? item.agreedAmount,
              confirmationRef: input.confirmationRef ?? undefined,
              serviceRequestId: item.serviceRequestId,
            },
          });
        }

        const sr = await tx.serviceRequest.update({
          where: { id: item.serviceRequestId },
          data: {
            status: 'confirmed',
            agreedAmount: input.agreedAmount ?? item.agreedAmount,
            confirmationRef: input.confirmationRef ?? undefined,
            rateSnapshotJson: input.rateSnapshotJson as Prisma.InputJsonValue,
            policySnapshotJson: input.policySnapshotJson as Prisma.InputJsonValue,
            confirmIdempotencyKey: input.idempotencyKey ?? undefined,
            updatedBy: userId,
          },
          include: { items: true },
        });

        return { serviceRequest: sr, item: updatedItem, hold };
      });
      await this.timeline(
        organizationId,
        'ServiceRequestConfirmed',
        'service_request',
        item.serviceRequestId,
        `Confirmed item ${item.id}`,
        userId,
      );
      return result;
    } catch (e) {
      if (e instanceof ConflictException || e instanceof BadRequestException) {
        throw e;
      }
      await this.prisma.workflowRecoveryItem.create({
        data: {
          organizationId,
          workflowType: 'service_request_confirm',
          failedStep: 'RESERVATION_CREATION_FAILED',
          affectedEntitiesJson: {
            serviceRequestItemId: item.id,
            serviceRequestId: item.serviceRequestId,
            holdId: item.inventoryHold?.id ?? null,
          } as Prisma.InputJsonValue,
          lastError: e instanceof Error ? e.message : String(e),
          retryEligible: true,
          status: 'open',
          assignedUserId: userId,
        },
      });
      throw e;
    }
  }

  fulfilmentPayloadForRequest(organizationId: string, serviceRequestId: string) {
    return this.prisma.serviceRequest
      .findFirst({
        where: {
          id: serviceRequestId,
          OR: [
            { buyerOrganizationId: organizationId },
            { sellerOrganizationId: organizationId },
          ],
        },
        include: { items: true },
      })
      .then((sr) => {
        if (!sr) throw new NotFoundException('Service request not found');
        if (sr.serviceType === 'MEAL') {
          return mealFulfilmentPayload({
            guestName: sr.title,
            guestCount: sr.adults,
            serviceAt: sr.serviceStartAt?.toISOString() ?? null,
            packageName: sr.title,
          });
        }
        return stayFulfilmentPayload({
          guestName: sr.title,
          guestCount: (sr.adults ?? 0) + (sr.children ?? 0) || null,
          checkIn: sr.serviceStartAt?.toISOString() ?? null,
          checkOut: sr.serviceEndAt?.toISOString() ?? null,
          confirmationRef: sr.confirmationRef,
          specialRequests:
            typeof sr.notes === 'string' ? sr.notes : null,
        });
      });
  }

  async createCancellationCase(
    organizationId: string,
    userId: string,
    input: z.infer<typeof CreateCancellationCaseSchema>,
  ) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.cancellationCase.findFirst({
        where: { organizationId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }

    const rules = (input.applicablePolicySnapshotJson || {}) as PolicyRules;
    const evaluation = evaluateCancellationPolicy({
      rules,
      baseAmount: input.baseAmount ?? 0,
      currency: input.currency || 'INR',
      serviceStartAt: input.serviceStartAt
        ? new Date(input.serviceStartAt)
        : new Date(),
    });

    return this.prisma.cancellationCase.create({
      data: {
        organizationId,
        tripId: input.tripId ?? null,
        scope: input.scope,
        reason: input.reason ?? null,
        affectedEntitiesJson: (input.affectedEntitiesJson ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        applicablePolicySnapshotJson: (input.applicablePolicySnapshotJson ??
          undefined) as Prisma.InputJsonValue | undefined,
        calculatedCharges: evaluation.customerCharge,
        expectedRefund: evaluation.refundAmount,
        supplierPenalty: evaluation.supplierPenalty,
        currency: input.currency || 'INR',
        evaluationJson: evaluation as unknown as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey ?? null,
        approvalStatus: 'draft',
        executionStatus: 'pending',
        createdBy: userId,
        requestedBy: userId,
      },
    });
  }

  /**
   * Ops cancel sheet: fee preview from quote-line stamp or supplier contract.
   */
  async previewBookingCancellation(
    organizationId: string,
    tripId: string,
    bookingId: string,
  ) {
    const booking = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    let quoteLinePolicy: unknown | null = null;
    if (booking.quotationLineId) {
      const versions = await this.prisma.quotationVersion.findMany({
        where: {
          status: 'accepted',
          quotation: { organizationId, tripId },
        },
        orderBy: [{ acceptedAt: 'desc' }, { versionNumber: 'desc' }],
        take: 8,
        select: { itemsJson: true },
      });
      for (const version of versions) {
        const items = Array.isArray(version.itemsJson)
          ? (version.itemsJson as Array<Record<string, unknown>>)
          : [];
        const line = items.find(
          (row) =>
            row &&
            typeof row === 'object' &&
            String(row.id ?? '') === booking.quotationLineId,
        );
        if (line) {
          quoteLinePolicy = policyFromQuoteProvenance(line.rateProvenance);
          break;
        }
      }
    }

    let contractPolicy: unknown | null = null;
    if (booking.supplierId) {
      const contract = await this.prisma.supplierContract.findFirst({
        where: {
          organizationId,
          supplierId: booking.supplierId,
          status: 'active',
          deletedAt: null,
        },
        orderBy: [{ preferred: 'desc' }, { versionNumber: 'desc' }],
        select: { cancellationPolicyJson: true },
      });
      contractPolicy = contract?.cancellationPolicyJson ?? null;
    }

    const preview = buildBookingCancellationPreview({
      bookingId: booking.id,
      tripId: booking.tripId,
      title: booking.title,
      baseAmount: pickBookingBaseAmount(booking),
      currency: booking.currency,
      serviceStartAt: booking.startAt,
      endAt: booking.endAt,
      quoteLinePolicy,
      contractPolicy,
    });

    const openCase = await this.findOpenCancellationForBooking(
      organizationId,
      tripId,
      bookingId,
    );

    return { ...preview, openCase };
  }

  async listTripCancellationCases(organizationId: string, tripId: string) {
    return this.prisma.cancellationCase.findMany({
      where: { organizationId, tripId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async requestCancellationCase(
    organizationId: string,
    userId: string,
    id: string,
  ) {
    const c = await this.prisma.cancellationCase.findFirst({
      where: { id, organizationId },
    });
    if (!c) throw new NotFoundException('Cancellation case not found');
    assertTransition(
      'cancellation_approval',
      c.approvalStatus,
      'awaiting_approval',
    );
    return this.prisma.cancellationCase.update({
      where: { id },
      data: {
        approvalStatus: 'awaiting_approval',
        requestedBy: userId,
      },
    });
  }

  async approveCancellationCase(
    organizationId: string,
    _userId: string,
    id: string,
  ) {
    const c = await this.prisma.cancellationCase.findFirst({
      where: { id, organizationId },
    });
    if (!c) throw new NotFoundException('Cancellation case not found');
    assertTransition('cancellation_approval', c.approvalStatus, 'approved');
    return this.prisma.cancellationCase.update({
      where: { id },
      data: { approvalStatus: 'approved' },
    });
  }

  private async findOpenCancellationForBooking(
    organizationId: string,
    tripId: string,
    bookingId: string,
  ) {
    const rows = await this.prisma.cancellationCase.findMany({
      where: {
        organizationId,
        tripId,
        approvalStatus: { in: ['draft', 'awaiting_approval', 'approved'] },
        executionStatus: { in: ['pending', 'applying', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return (
      rows.find((row) => {
        const affected = row.affectedEntitiesJson;
        if (!Array.isArray(affected)) return false;
        return affected.some(
          (ent) =>
            ent &&
            typeof ent === 'object' &&
            !Array.isArray(ent) &&
            (ent as { type?: string; id?: string }).type ===
              'booking_component' &&
            (ent as { type?: string; id?: string }).id === bookingId,
        );
      }) ?? null
    );
  }

  async applyCancellationCase(
    organizationId: string,
    userId: string,
    id: string,
  ) {
    const c = await this.prisma.cancellationCase.findFirst({
      where: { id, organizationId },
    });
    if (!c) throw new NotFoundException('Cancellation case not found');
    if (c.executionStatus === 'applied') {
      const evalJson =
        c.evaluationJson &&
        typeof c.evaluationJson === 'object' &&
        !Array.isArray(c.evaluationJson)
          ? (c.evaluationJson as Record<string, unknown>)
          : {};
      return {
        ...c,
        creditNoteId:
          typeof evalJson.creditNoteId === 'string' ? evalJson.creditNoteId : null,
        creditNoteAmount:
          typeof evalJson.creditNoteAmount === 'number'
            ? evalJson.creditNoteAmount
            : Number(c.expectedRefund ?? 0) || null,
        creditNoteAllocatedToDocumentId:
          typeof evalJson.creditNoteAllocatedToDocumentId === 'string'
            ? evalJson.creditNoteAllocatedToDocumentId
            : null,
        creditNoteAllocatedAmount:
          typeof evalJson.creditNoteAllocatedAmount === 'number'
            ? evalJson.creditNoteAllocatedAmount
            : null,
      };
    }

    if (c.approvalStatus !== 'approved') {
      assertTransition('cancellation_approval', c.approvalStatus, 'approved');
    }
    assertTransition('cancellation_execution', c.executionStatus, 'applying');

    const affected = (c.affectedEntitiesJson as Array<{
      type: string;
      id: string;
    }> | null) || [];

    let applied = 0;
    let failed = 0;
    const errors: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.cancellationCase.update({
        where: { id },
        data: {
          approvalStatus: 'approved',
          executionStatus: 'applying',
        },
      });

      for (const ent of affected) {
        try {
          if (ent.type === 'inventory_hold') {
            const hold = await tx.inventoryHold.findFirst({
              where: { id: ent.id, organizationId, status: 'active' },
            });
            if (hold) {
              assertTransition('inventory_hold', hold.status, 'released');
              await tx.inventoryHold.update({
                where: { id: hold.id },
                data: { status: 'released', releasedAt: new Date() },
              });
              await this.applyHoldCapacity(tx, organizationId, hold, 'release');
              applied += 1;
            }
          } else if (ent.type === 'service_request_item') {
            const it = await tx.serviceRequestItem.findUnique({ where: { id: ent.id } });
            if (it && it.status !== 'cancelled') {
              assertTransition('service_request_item', it.status, 'cancelled');
            }
            await tx.serviceRequestItem.updateMany({
              where: { id: ent.id },
              data: { status: 'cancelled', selected: false },
            });
            applied += 1;
          } else if (ent.type === 'booking_component') {
            const b = await tx.bookingComponent.findFirst({
              where: { id: ent.id, organizationId },
            });
            if (b && b.status !== 'cancelled') {
              assertTransition('booking_requirement', b.status, 'cancelled');
            }
            await tx.bookingComponent.updateMany({
              where: { id: ent.id, organizationId },
              data: { status: 'cancelled' },
            });
            applied += 1;
          } else if (ent.type === 'service_request') {
            const sr = await tx.serviceRequest.findFirst({
              where: { id: ent.id, buyerOrganizationId: organizationId },
            });
            if (sr && sr.status !== 'cancelled') {
              assertTransition('service_request', sr.status, 'cancelled');
            }
            await tx.serviceRequest.updateMany({
              where: { id: ent.id, buyerOrganizationId: organizationId },
              data: { status: 'cancelled' },
            });
            applied += 1;
          } else if (ent.type === 'stay_reservation') {
            const stay = await tx.stayReservation.findFirst({
              where: { id: ent.id, asset: { organizationId } },
            });
            if (stay) {
              if (stay.status !== 'cancelled') {
                assertTransition('stay_reservation', stay.status, 'cancelled');
              }
              await tx.stayReservation.update({
                where: { id: stay.id },
                data: { status: 'cancelled' },
              });
              if (stay.inventoryAllocationId) {
                await tx.inventoryAllocation.updateMany({
                  where: { id: stay.inventoryAllocationId },
                  data: { status: 'released' },
                });
              }
              applied += 1;
            }
          } else if (ent.type === 'meal_reservation') {
            await tx.mealReservation.updateMany({
              where: { id: ent.id, asset: { organizationId } },
              data: { status: 'cancelled' },
            });
            applied += 1;
          } else if (ent.type === 'inventory_allocation') {
            await tx.inventoryAllocation.updateMany({
              where: { id: ent.id, asset: { organizationId } },
              data: { status: 'released' },
            });
            applied += 1;
          } else if (ent.type === 'credit_note_draft' || ent.type === 'commercial_document') {
            // Guidance only — draft credit note, never delete money silently
            await tx.commercialDocument.create({
              data: {
                organizationId,
                docType: 'credit_note',
                direction: 'payable',
                linkedEntityType: 'cancellation_case',
                linkedEntityId: id,
                tripId: c.tripId,
                label: `Credit guidance for cancellation ${id}`,
                amount: Number(c.expectedRefund ?? 0),
                currency: c.currency,
                status: 'open',
                notes: 'Draft credit note — allocate / apply manually',
                createdBy: userId,
              },
            });
            applied += 1;
          }
        } catch (stepErr) {
          failed += 1;
          errors.push(
            `${ent.type}:${ent.id} — ${stepErr instanceof Error ? stepErr.message : String(stepErr)}`,
          );
        }
      }

      // Auto draft credit note when policy expects a guest refund (idempotent).
      let creditNoteId: string | null = null;
      let creditNoteAllocatedToDocumentId: string | null = null;
      let creditNoteAllocatedAmount: number | null = null;
      const creditPlan = cancellationApplyCreditNotePlan({
        expectedRefund:
          c.expectedRefund != null ? Number(c.expectedRefund) : null,
        applyFailed: failed,
      });
      const refundAmount = creditPlan?.amount ?? 0;
      if (creditPlan) {
        const priorEval =
          c.evaluationJson &&
          typeof c.evaluationJson === 'object' &&
          !Array.isArray(c.evaluationJson)
            ? (c.evaluationJson as Record<string, unknown>)
            : {};
        const priorCreditNoteId =
          typeof priorEval.creditNoteId === 'string'
            ? priorEval.creditNoteId
            : null;
        const existingNote = await tx.commercialDocument.findFirst({
          where: {
            organizationId,
            docType: 'credit_note',
            OR: [
              { linkedEntityType: 'cancellation_case', linkedEntityId: id },
              ...(priorCreditNoteId ? [{ id: priorCreditNoteId }] : []),
            ],
          },
        });
        let note =
          existingNote ??
          (await tx.commercialDocument.create({
            data: {
              organizationId,
              docType: 'credit_note',
              direction: 'payable',
              linkedEntityType: 'cancellation_case',
              linkedEntityId: id,
              tripId: c.tripId,
              label: `Credit note · cancellation ${id.slice(-8).toUpperCase()}`,
              amount: creditPlan.amount,
              currency: c.currency,
              status: 'open',
              notes:
                'Draft credit note from cancellation policy — settle / allocate manually',
              createdBy: userId,
            },
          }));
        creditNoteId = note.id;

        if (cancellationCreditNoteAlreadyAllocated(note)) {
          creditNoteAllocatedToDocumentId = note.linkedEntityId;
          creditNoteAllocatedAmount = Number(note.amount);
        } else if (c.tripId) {
          const receivables = await loadTripReceivablesForCreditAllocation(
            tx,
            organizationId,
            c.tripId,
          );
          const target = pickCancellationCreditNoteReceivableTarget(
            receivables,
            creditPlan.amount,
          );
          if (target) {
            const allocateUpdate = composeCancellationCreditNoteAllocateUpdate({
              cancellationCaseId: id,
              target,
            });
            note = await tx.commercialDocument.update({
              where: { id: note.id },
              data: allocateUpdate,
            });
            creditNoteAllocatedToDocumentId = target.documentId;
            creditNoteAllocatedAmount = target.allocateAmount;
          }
        }
      }

      const executionStatus = resolveCancellationExecutionOutcome({
        affectedCount: affected.length,
        applied,
        failed,
      });
      assertTransition('cancellation_execution', 'applying', executionStatus);

      await tx.cancellationCase.update({
        where: { id },
        data: {
          approvalStatus: 'approved',
          executionStatus,
          evaluationJson: {
            ...((c.evaluationJson as object) || {}),
            applyErrors: errors,
            applied,
            failed,
            ...(creditNoteId
              ? {
                  creditNoteId,
                  creditNoteAmount: refundAmount,
                  ...(creditNoteAllocatedToDocumentId
                    ? {
                        creditNoteAllocatedToDocumentId,
                        creditNoteAllocatedAmount,
                      }
                    : {}),
                }
              : {}),
          } as Prisma.InputJsonValue,
        },
      });
    });

    await this.timeline(
      organizationId,
      'CancellationApplied',
      'cancellation_case',
      id,
      c.scope,
      userId,
    );
    const updated = await this.prisma.cancellationCase.findUnique({ where: { id } });
    const evalJson =
      updated?.evaluationJson &&
      typeof updated.evaluationJson === 'object' &&
      !Array.isArray(updated.evaluationJson)
        ? (updated.evaluationJson as Record<string, unknown>)
        : {};
    return {
      ...updated,
      creditNoteId:
        typeof evalJson.creditNoteId === 'string' ? evalJson.creditNoteId : null,
      creditNoteAmount:
        typeof evalJson.creditNoteAmount === 'number'
          ? evalJson.creditNoteAmount
          : Number(updated?.expectedRefund ?? 0) || null,
      creditNoteAllocatedToDocumentId:
        typeof evalJson.creditNoteAllocatedToDocumentId === 'string'
          ? evalJson.creditNoteAllocatedToDocumentId
          : null,
      creditNoteAllocatedAmount:
        typeof evalJson.creditNoteAllocatedAmount === 'number'
          ? evalJson.creditNoteAllocatedAmount
          : null,
    };
  }

  async cancellationRefundStatus(organizationId: string, caseId: string) {
    const c = await this.prisma.cancellationCase.findFirst({
      where: { id: caseId, organizationId },
    });
    if (!c) throw new NotFoundException('Cancellation case not found');

    const evalFields = parseCancellationRefundEval(c.evaluationJson);
    const razorpaySourcePaymentId = c.tripId
      ? await this.findTripRazorpaySourcePaymentId(organizationId, c.tripId)
      : null;

    if (!evalFields.creditNoteId) {
      const approval = parseRefundApproval(c.evaluationJson);
      return {
        cancellationCaseId: caseId,
        tripId: c.tripId,
        executionStatus: c.executionStatus,
        creditNoteId: null as string | null,
        creditNoteAmount: null as number | null,
        refundDue: 0,
        refundSettledAmount: 0,
        refundPaymentId: evalFields.refundPaymentId,
        currency: c.currency,
        canSettle: false,
        razorpaySourcePaymentId,
        canRefundViaRazorpay: Boolean(razorpaySourcePaymentId),
        ...approval,
        canRequestRefund: false,
        canApproveRefund: false,
      };
    }

    const note = await this.prisma.commercialDocument.findFirst({
      where: {
        id: evalFields.creditNoteId,
        organizationId,
        docType: 'credit_note',
      },
    });
    if (!note) throw new NotFoundException('Credit note not found');

    const creditNoteAmount = creditNoteRefundTotal(note);
    const refundDue = creditNoteRefundOutstanding(note);
    const refundSettledAmount = Math.max(
      0,
      Math.round((creditNoteAmount - refundDue) * 100) / 100,
    );
    const approval = parseRefundApproval(c.evaluationJson);
    const applied = c.executionStatus === 'applied';
    const dueOpen = refundDue > 0.001;

    return {
      cancellationCaseId: caseId,
      tripId: c.tripId,
      executionStatus: c.executionStatus,
      creditNoteId: note.id,
      creditNoteAmount,
      refundDue,
      refundSettledAmount,
      refundPaymentId: evalFields.refundPaymentId,
      currency: note.currency || c.currency,
      canSettle:
        applied &&
        dueOpen &&
        approval.refundApprovalStatus === 'approved',
      razorpaySourcePaymentId,
      canRefundViaRazorpay: Boolean(razorpaySourcePaymentId),
      ...approval,
      canRequestRefund:
        applied && dueOpen && approval.refundApprovalStatus === 'none',
      canApproveRefund:
        applied &&
        dueOpen &&
        approval.refundApprovalStatus === 'awaiting_approval',
    };
  }

  private async findTripRazorpaySourcePaymentId(
    organizationId: string,
    tripId: string,
  ): Promise<string | null> {
    const rows = await this.prisma.tripPayment.findMany({
      where: {
        organizationId,
        tripId,
        direction: 'customer',
        status: { in: ['paid', 'partial'] },
      },
      select: { reference: true, paidAt: true },
      orderBy: { paidAt: 'desc' },
      take: 20,
    });
    return pickRazorpaySourcePaymentId(rows);
  }

  async requestCancellationRefund(
    organizationId: string,
    userId: string,
    caseId: string,
    input: { reason: string },
  ) {
    const status = await this.cancellationRefundStatus(organizationId, caseId);
    try {
      assertCanRequestRefund({
        executionStatus: status.executionStatus,
        refundDue: status.refundDue,
        refundApprovalStatus: status.refundApprovalStatus,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Cannot request refund',
      );
    }
    if (!status.creditNoteId) {
      throw new BadRequestException(
        'No refund credit note on this cancellation case',
      );
    }

    const c = await this.prisma.cancellationCase.findFirstOrThrow({
      where: { id: caseId, organizationId },
    });
    const priorEval =
      c.evaluationJson &&
      typeof c.evaluationJson === 'object' &&
      !Array.isArray(c.evaluationJson)
        ? (c.evaluationJson as Record<string, unknown>)
        : {};

    let evaluationJson: Record<string, unknown>;
    try {
      evaluationJson = planRequestRefundStamp({
        priorEval,
        amount: status.refundDue,
        reason: input.reason,
        userId,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Invalid refund request',
      );
    }

    await this.prisma.cancellationCase.update({
      where: { id: caseId },
      data: { evaluationJson },
    });

    await this.timeline(
      organizationId,
      'RefundRequested',
      'cancellation_case',
      caseId,
      `Refund requested ${status.refundDue}`,
      userId,
    );

    return this.cancellationRefundStatus(organizationId, caseId);
  }

  async approveCancellationRefund(
    organizationId: string,
    userId: string,
    caseId: string,
  ) {
    const status = await this.cancellationRefundStatus(organizationId, caseId);
    try {
      assertCanApproveRefund({
        refundApprovalStatus: status.refundApprovalStatus,
        refundRequestedAmount: status.refundRequestedAmount,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Cannot approve refund',
      );
    }

    const c = await this.prisma.cancellationCase.findFirstOrThrow({
      where: { id: caseId, organizationId },
    });
    const priorEval =
      c.evaluationJson &&
      typeof c.evaluationJson === 'object' &&
      !Array.isArray(c.evaluationJson)
        ? (c.evaluationJson as Record<string, unknown>)
        : {};

    const evaluationJson = planApproveRefundStamp({
      priorEval,
      userId,
    });

    await this.prisma.cancellationCase.update({
      where: { id: caseId },
      data: { evaluationJson },
    });

    await this.timeline(
      organizationId,
      'RefundApproved',
      'cancellation_case',
      caseId,
      `Refund approved ${status.refundRequestedAmount ?? ''}`,
      userId,
    );

    return this.cancellationRefundStatus(organizationId, caseId);
  }

  async settleCancellationRefund(
    organizationId: string,
    userId: string,
    caseId: string,
    input?: {
      method?: string | null;
      reference?: string | null;
      amount?: number;
      mode?: 'manual' | 'razorpay' | 'mock_razorpay';
      razorpayPaymentId?: string | null;
    },
  ) {
    const status = await this.cancellationRefundStatus(organizationId, caseId);
    if (!status.creditNoteId) {
      throw new BadRequestException(
        'No refund credit note on this cancellation case',
      );
    }
    if (status.executionStatus !== 'applied') {
      throw new BadRequestException(
        'Cancellation case must be applied before refund settlement',
      );
    }
    if (status.refundDue <= 0.001) {
      throw new BadRequestException('Refund already settled');
    }
    if (!status.tripId) {
      throw new BadRequestException(
        'Cancellation case has no trip — cannot settle refund',
      );
    }

    let settleAmount: number;
    try {
      settleAmount = resolveCancellationRefundSettleAmount({
        refundDue: status.refundDue,
        amount: input?.amount,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Invalid refund amount',
      );
    }

    try {
      assertRefundApprovedForSettle({
        refundApprovalStatus: status.refundApprovalStatus,
        refundRequestedAmount: status.refundRequestedAmount,
        settleAmount,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Refund not approved for settlement',
      );
    }

    const mode = parseCancellationRefundSettleMode(input?.mode);
    let method = input?.method?.trim() || null;
    let reference = input?.reference?.trim() || null;

    if (mode === 'mock_razorpay') {
      try {
        assertMockRazorpayRefundAllowed();
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Mock refund not allowed',
        );
      }
      method = 'mock_razorpay_refund';
      reference = mockRazorpayRefundReference(caseId);
    } else if (mode === 'razorpay') {
      const sourceId =
        input?.razorpayPaymentId?.trim() ||
        status.razorpaySourcePaymentId ||
        null;
      if (!sourceId) {
        throw new BadRequestException(
          'No Razorpay payment on this trip — mark refund settled manually or collect a Razorpay payment first',
        );
      }
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        throw new BadRequestException(
          'Razorpay keys are not configured — use Mark refund settled or mock refund in local',
        );
      }
      try {
        const { refundId } = await createRazorpayPaymentRefund({
          paymentId: sourceId,
          amountInr: settleAmount,
          keyId,
          keySecret,
        });
        method = 'razorpay_refund';
        reference = refundId;
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Razorpay refund failed',
        );
      }
    }

    const c = await this.prisma.cancellationCase.findFirstOrThrow({
      where: { id: caseId, organizationId },
    });
    const note = await this.prisma.commercialDocument.findFirstOrThrow({
      where: { id: status.creditNoteId, organizationId },
    });

    const payload = composeCancellationRefundPaymentRecord({
      cancellationCaseId: caseId,
      creditNoteId: note.id,
      tripId: status.tripId,
      amount: settleAmount,
      currency: note.currency,
      method,
      reference,
    });

    const priorPaid =
      Math.round(Number(note.amountPaid || 0) * 100) / 100;
    const nextPaid =
      Math.round((priorPaid + settleAmount) * 100) / 100;

    const paymentId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentRecord.create({
        data: {
          organizationId,
          commercialDocumentId: note.id,
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
          createdBy: userId,
          allocations: {
            create: {
              commercialDocumentId: note.id,
              amount: settleAmount,
            },
          },
        },
      });

      const paidState = commercialDocumentPaidStateFromNote(note, nextPaid);
      await tx.commercialDocument.update({
        where: { id: note.id },
        data: {
          amountPaid: new Prisma.Decimal(paidState.amountPaid),
          status: paidState.status,
        },
      });

      const priorEval =
        c.evaluationJson &&
        typeof c.evaluationJson === 'object' &&
        !Array.isArray(c.evaluationJson)
          ? (c.evaluationJson as Record<string, unknown>)
          : {};

      await tx.cancellationCase.update({
        where: { id: caseId },
        data: {
          evaluationJson: {
            ...priorEval,
            refundPaymentId: created.id,
            refundSettledAmount: nextPaid,
            refundSettleMode: mode,
          },
        },
      });

      return created.id;
    });

    await this.timeline(
      organizationId,
      'RefundSettled',
      'cancellation_case',
      caseId,
      `Refund ${settleAmount}${mode !== 'manual' ? ` (${mode})` : ''}`,
      userId,
    );

    return {
      ...(await this.cancellationRefundStatus(organizationId, caseId)),
      paymentId,
      settledAmount: settleAmount,
      mode,
    };
  }

  async applyTripChangeCase(
    organizationId: string,
    userId: string,
    id: string,
  ) {
    const change = await this.prisma.tripChangeCase.findFirst({
      where: { id, organizationId },
    });
    if (!change) throw new NotFoundException('Change case not found');
    if (change.status === 'applied') return change;

    const impact = (change.impactJson || {}) as {
      releaseHoldIds?: string[];
      cancelItemIds?: string[];
      policySnapshot?: PolicyRules;
      baseAmount?: number;
      serviceStartAt?: string;
    };

    if (impact.policySnapshot && impact.baseAmount != null) {
      evaluateCancellationPolicy({
        rules: impact.policySnapshot,
        baseAmount: impact.baseAmount,
        currency: change.currency,
        serviceStartAt: impact.serviceStartAt
          ? new Date(impact.serviceStartAt)
          : new Date(),
      });
    }

    assertTransition('trip_change', change.status, 'applied');

    await this.prisma.$transaction(async (tx) => {
      for (const holdId of impact.releaseHoldIds || []) {
        const hold = await tx.inventoryHold.findFirst({
          where: { id: holdId, organizationId, status: 'active' },
        });
        if (hold) {
          assertTransition('inventory_hold', hold.status, 'released');
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: 'released', releasedAt: new Date() },
          });
          await this.applyHoldCapacity(tx, organizationId, hold, 'release');
        }
      }
      for (const itemId of impact.cancelItemIds || []) {
        const it = await tx.serviceRequestItem.findUnique({ where: { id: itemId } });
        if (it && it.status !== 'cancelled') {
          assertTransition('service_request_item', it.status, 'cancelled');
        }
        await tx.serviceRequestItem.updateMany({
          where: { id: itemId },
          data: { status: 'cancelled', selected: false },
        });
      }
      await tx.tripChangeCase.update({
        where: { id },
        data: { status: 'applied', resolutionNote: 'Applied with side effects' },
      });
    });

    await this.timeline(
      organizationId,
      'TripChangeApplied',
      'trip_change_case',
      id,
      change.summary,
      userId,
    );
    return this.prisma.tripChangeCase.findUnique({ where: { id } });
  }

  async tripCommerceReconciliation(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      include: {
        quotations: {
          include: {
            versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
          },
        },
        bookings: true,
        serviceRequests: true,
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const latestVersions = trip.quotations.flatMap((q) => q.versions);
    const quoted = latestVersions.reduce((s, v) => s + Number(v.sellTotal ?? 0), 0);
    const agreed = trip.serviceRequests.reduce(
      (s, sr) => s + Number(sr.agreedAmount ?? 0),
      0,
    );
    const booked = trip.bookings
      .filter((b) => b.status === 'confirmed')
      .reduce((s, b) => s + Number(b.confirmedAmount ?? b.costAmount ?? 0), 0);
    const docs = await this.prisma.commercialDocument.findMany({
      where: { organizationId, tripId },
    });
    const invoiced = docs.reduce((s, d) => s + Number(d.amount), 0);
    const paid = docs.reduce((s, d) => s + Number(d.amountPaid), 0);

    const drifts: string[] = [];
    if (quoted > 0 && booked > 0 && Math.abs(quoted - booked) > 1) {
      drifts.push('quoted_vs_booked');
    }
    if (agreed > 0 && booked > 0 && Math.abs(agreed - booked) > 1) {
      drifts.push('agreed_vs_booked');
    }
    if (invoiced > 0 && paid < invoiced - 1) {
      drifts.push('invoiced_vs_paid');
    }

    return {
      tripId,
      quoted,
      agreed,
      booked,
      delivered: booked,
      invoiced,
      paid,
      drifts,
      currency: latestVersions[0]?.currency || 'INR',
    };
  }

  async detectDataQualityIssues(organizationId: string) {
    const created: string[] = [];
    const srs = await this.prisma.serviceRequest.findMany({
      where: { buyerOrganizationId: organizationId, status: 'confirmed' },
      take: 100,
    });
    for (const sr of srs) {
      if (sr.agreedAmount == null) {
        const issue = await this.upsertDq(
          organizationId,
          'sr_confirmed_without_agreed_amount',
          'service_request',
          sr.id,
          'Confirmed service request missing agreed amount',
        );
        if (issue) created.push(issue);
      }
    }
    const stays = await this.prisma.stayReservation.findMany({
      where: {
        asset: { organizationId },
        status: 'confirmed',
      },
      take: 100,
    });
    for (const r of stays) {
      if (!r.guestName?.trim()) {
        const issue = await this.upsertDq(
          organizationId,
          'stay_confirmed_without_guest',
          'stay_reservation',
          r.id,
          'Confirmed stay reservation has no guest',
        );
        if (issue) created.push(issue);
      }
    }
    return this.prisma.dataQualityIssue.findMany({
      where: { organizationId, state: 'open' },
      orderBy: { detectedAt: 'desc' },
      take: 50,
    });
  }

  private async upsertDq(
    organizationId: string,
    ruleCode: string,
    entityType: string,
    entityId: string,
    message: string,
  ) {
    const existing = await this.prisma.dataQualityIssue.findFirst({
      where: { organizationId, ruleCode, entityType, entityId, state: 'open' },
    });
    if (existing) return null;
    const row = await this.prisma.dataQualityIssue.create({
      data: {
        organizationId,
        ruleCode,
        entityType,
        entityId,
        message,
        severity: 'warn',
      },
    });
    return row.id;
  }

  private async requireAsset(organizationId: string, assetId: string) {
    const asset = await this.prisma.partnerAsset.findFirst({
      where: { id: assetId, organizationId, deletedAt: null },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  // ─── Workflow recovery ─────────────────────────────────────────────

  async listWorkflowRecovery(organizationId: string, status?: string) {
    return this.prisma.workflowRecoveryItem.findMany({
      where: {
        organizationId,
        ...(status ? { status } : { status: { in: ['open', 'retrying'] } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async retryWorkflowRecovery(organizationId: string, userId: string, id: string) {
    const item = await this.prisma.workflowRecoveryItem.findFirst({
      where: { id, organizationId },
    });
    if (!item) throw new NotFoundException('Recovery item not found');
    if (!item.retryEligible) {
      throw new BadRequestException('Item is not retry-eligible');
    }
    await this.prisma.workflowRecoveryItem.update({
      where: { id },
      data: { status: 'retrying', assignedUserId: userId },
    });
    // Confirm re-entry is idempotent when key present — ops marks resolved after manual fix
    return this.prisma.workflowRecoveryItem.update({
      where: { id },
      data: {
        status: 'resolved',
        lastError: item.lastError
          ? `${item.lastError}\n[retried ${new Date().toISOString()}]`
          : `Retried ${new Date().toISOString()}`,
      },
    });
  }

  async compensateWorkflowRecovery(
    organizationId: string,
    userId: string,
    id: string,
  ) {
    const item = await this.prisma.workflowRecoveryItem.findFirst({
      where: { id, organizationId },
    });
    if (!item) throw new NotFoundException('Recovery item not found');
    const entities = (item.affectedEntitiesJson || {}) as {
      holdId?: string | null;
    };
    if (entities.holdId) {
      const hold = await this.prisma.inventoryHold.findFirst({
        where: { id: entities.holdId, organizationId, status: 'active' },
      });
      if (hold) {
        await this.prisma.$transaction(async (tx) => {
          assertTransition('inventory_hold', hold.status, 'released');
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: 'released', releasedAt: new Date() },
          });
          await this.applyHoldCapacity(tx, organizationId, hold, 'release');
        });
      }
    }
    return this.prisma.workflowRecoveryItem.update({
      where: { id },
      data: {
        status: 'resolved',
        assignedUserId: userId,
        compensationJson: {
          compensatedAt: new Date().toISOString(),
          releasedHoldId: entities.holdId ?? null,
        } as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Phase B Care — guest/party history across vertical reservations for this org.
   * When partyId is provided, lookup is party-scoped (plus walk-ins tied by that party's
   * phone digits / exact display name). Walk-in phone uses last-10-digit contains.
   */
  async careGuestHistory(
    organizationId: string,
    query: { partyId?: string; guestPhone?: string; guestName?: string },
  ) {
    const partyId = query.partyId?.trim() || undefined;
    const guestPhone = query.guestPhone?.trim() || undefined;
    const guestName = query.guestName?.trim() || undefined;
    if (!partyId && !guestPhone && !guestName) {
      throw new BadRequestException('Provide partyId, guestPhone, or guestName');
    }

    let party = null as Awaited<ReturnType<typeof this.prisma.party.findFirst>>;
    if (partyId) {
      party = await this.prisma.party.findFirst({
        where: { id: partyId, organizationId, deletedAt: null },
      });
      if (!party) throw new NotFoundException('Party not found');
    }

    const digits = (s: string) => s.replace(/\D/g, '');
    const phoneNeedle = (() => {
      const raw = party ? party.phone || '' : guestPhone || '';
      const d = digits(raw);
      if (d.length >= 7) return d.slice(-10);
      return raw.trim() || undefined;
    })();

    const guestFieldOr = (): Array<Record<string, unknown>> => {
      if (party) {
        const or: Array<Record<string, unknown>> = [{ partyId: party.id }];
        if (phoneNeedle) or.push({ guestPhone: { contains: phoneNeedle } });
        or.push({ guestName: { equals: party.displayName } });
        return or;
      }
      const or: Array<Record<string, unknown>> = [];
      if (phoneNeedle) or.push({ guestPhone: { contains: phoneNeedle } });
      if (guestPhone && guestPhone !== phoneNeedle) {
        or.push({ guestPhone: { contains: guestPhone } });
      }
      if (guestName) or.push({ guestName: { contains: guestName } });
      return or;
    };

    /** MealReservation has guestName + partyId only — no guestPhone column. */
    const mealGuestFieldOr = (): Array<Record<string, unknown>> => {
      if (party) {
        return [{ partyId: party.id }, { guestName: { equals: party.displayName } }];
      }
      const or: Array<Record<string, unknown>> = [];
      if (guestName) or.push({ guestName: { contains: guestName } });
      return or;
    };

    const reservationWhere = () => {
      const or = guestFieldOr();
      return {
        asset: { organizationId },
        ...(or.length > 1 ? { OR: or } : or[0] || {}),
      };
    };

    const mealReservationWhere = (): Prisma.MealReservationWhereInput => {
      const or = mealGuestFieldOr();
      if (!or.length) {
        // Phone-only walk-in: MealReservation has no guestPhone — return no rows.
        return { id: { in: [] } };
      }
      return {
        asset: { organizationId },
        ...(or.length > 1 ? { OR: or } : (or[0] as Prisma.MealReservationWhereInput)),
      };
    };

    const inquiryWhere = () => {
      if (party) {
        const or: Array<Record<string, unknown>> = [{ partyId: party.id }];
        if (phoneNeedle) or.push({ contactPhone: { contains: phoneNeedle } });
        or.push({ contactName: { equals: party.displayName } });
        return { asset: { organizationId }, OR: or };
      }
      const or: Array<Record<string, unknown>> = [];
      if (phoneNeedle) or.push({ contactPhone: { contains: phoneNeedle } });
      if (guestName) or.push({ contactName: { contains: guestName } });
      return { asset: { organizationId }, OR: or };
    };

    const experienceWhere = () => {
      if (party) {
        const or: Array<Record<string, unknown>> = [{ partyId: party.id }];
        if (phoneNeedle) or.push({ bookerPhone: { contains: phoneNeedle } });
        or.push({ bookerName: { equals: party.displayName } });
        return { asset: { organizationId }, OR: or };
      }
      const or: Array<Record<string, unknown>> = [];
      if (phoneNeedle) or.push({ bookerPhone: { contains: phoneNeedle } });
      if (guestName) {
        or.push({ bookerName: { contains: guestName } });
        or.push({
          participants: { some: { fullName: { contains: guestName } } },
        });
      }
      return { asset: { organizationId }, OR: or };
    };

    const incidentOr: Array<Record<string, unknown>> = [];
    if (party) {
      incidentOr.push(
        { title: { contains: party.displayName } },
        { travellerImpact: { contains: party.displayName } },
      );
      if (phoneNeedle) {
        incidentOr.push(
          { description: { contains: phoneNeedle } },
          { travellerImpact: { contains: phoneNeedle } },
        );
      }
    } else {
      if (guestName) {
        incidentOr.push(
          { title: { contains: guestName } },
          { description: { contains: guestName } },
          { travellerImpact: { contains: guestName } },
        );
      }
      if (phoneNeedle) {
        incidentOr.push(
          { description: { contains: phoneNeedle } },
          { travellerImpact: { contains: phoneNeedle } },
        );
      }
    }

    const [
      stays,
      meals,
      mealInquiries,
      rentals,
      driverJobs,
      experiences,
      matchedParties,
      relatedIncidents,
    ] = await Promise.all([
      this.prisma.stayReservation.findMany({
        where: reservationWhere() as Prisma.StayReservationWhereInput,
        include: {
          asset: { select: { id: true, name: true } },
          roomProduct: { select: { id: true, name: true } },
        },
        orderBy: { checkIn: 'desc' },
        take: 40,
      }),
      this.prisma.mealReservation.findMany({
        where: mealReservationWhere(),
        include: {
          asset: { select: { id: true, name: true } },
          mealPackage: { select: { id: true, name: true } },
        },
        orderBy: { serviceAt: 'desc' },
        take: 40,
      }),
      this.prisma.mealInquiry.findMany({
        where: inquiryWhere() as Prisma.MealInquiryWhereInput,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.rentalReservation.findMany({
        where: reservationWhere() as Prisma.RentalReservationWhereInput,
        include: {
          asset: { select: { id: true, name: true } },
          fleetUnit: { select: { id: true, name: true, plateNumber: true } },
        },
        orderBy: { startAt: 'desc' },
        take: 40,
      }),
      this.prisma.driverJob.findMany({
        where: reservationWhere() as Prisma.DriverJobWhereInput,
        include: {
          asset: { select: { id: true, name: true } },
        },
        orderBy: { startAt: 'desc' },
        take: 40,
      }),
      this.prisma.experienceReservation.findMany({
        where: experienceWhere() as Prisma.ExperienceReservationWhereInput,
        include: {
          asset: { select: { id: true, name: true } },
          experienceProduct: { select: { id: true, title: true } },
          experienceSlot: { select: { id: true, startAt: true } },
          participants: { select: { id: true, fullName: true }, take: 8 },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      party
        ? Promise.resolve([party])
        : this.prisma.party.findMany({
            where: {
              organizationId,
              deletedAt: null,
              OR: [
                ...(phoneNeedle ? [{ phone: { contains: phoneNeedle } }] : []),
                ...(guestName ? [{ displayName: { contains: guestName } }] : []),
              ],
            },
            take: 10,
            orderBy: { updatedAt: 'desc' },
          }),
      incidentOr.length === 0
        ? Promise.resolve([])
        : this.prisma.serviceIncident.findMany({
            where: { organizationId, OR: incidentOr },
            include: {
              supplier: { select: { id: true, name: true } },
              trip: { select: { id: true, tripNumber: true, title: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
    ]);

    return {
      query: {
        partyId: partyId ?? null,
        guestPhone: guestPhone ?? null,
        guestName: guestName ?? null,
        partyScoped: Boolean(party),
        phoneNeedle: phoneNeedle ?? null,
      },
      party,
      matchedParties,
      stays,
      meals,
      mealInquiries,
      rentals,
      driverJobs,
      experiences,
      relatedIncidents,
      counts: {
        stays: stays.length,
        meals: meals.length,
        mealInquiries: mealInquiries.length,
        rentals: rentals.length,
        driverJobs: driverJobs.length,
        experiences: experiences.length,
        relatedIncidents: relatedIncidents.length,
      },
    };
  }
}
