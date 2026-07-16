import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../../common/helpers';

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
  ) {}

  private async ensureTrip(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
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
    return this.prisma.supplier.findMany({
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
      include: {
        linkedOrganization: {
          select: { id: true, name: true, kind: true, slug: true },
        },
        linkedAsset: {
          select: { id: true, name: true, assetKind: true },
        },
        place: { select: { id: true, name: true, kind: true } },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
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

  async listBookings(user: AuthUser, tripId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    return this.prisma.bookingComponent.findMany({
      where: { tripId, organizationId: user.organizationId },
      include: { supplier: true },
      orderBy: { createdAt: 'asc' },
    });
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
    },
  ) {
    const trip = await this.ensureTrip(user.organizationId, tripId);
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
    return booking;
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
    },
  ) {
    const trip = await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.bookingComponent.findFirst({
      where: { id: bookingId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Booking not found');
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
        ...(input.costAmount !== undefined
          ? { costAmount: input.costAmount == null ? null : new Prisma.Decimal(input.costAmount) }
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
    if (input.status) {
      await this.inventory.syncBookingInventory(user, booking);
    }
    return booking;
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
      },
    });

    await this.inventory.releaseForBooking(booking.id);

    return {
      ...booking,
      cascaded: {
        cancelledPayments: unpaidPayments.count,
        cancelledInvoices: openInvoices.count,
      },
    };
  }

  /** Hard-delete only unused pending bookings with no finance links. */
  async deleteBooking(user: AuthUser, tripId: string, bookingId: string) {
    await this.ensureTrip(user.organizationId, tripId);
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
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { currency: true },
    });
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
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
        currency: (input.currency || org.currency || 'INR').toUpperCase(),
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
    return payment;
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
    return payment;
  }

  async markPaymentPaid(
    user: AuthUser,
    tripId: string,
    paymentId: string,
    input?: { amountPaid?: number; method?: string | null; reference?: string | null },
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const existing = await this.prisma.tripPayment.findFirst({
      where: { id: paymentId, tripId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    if (existing.status === 'cancelled') {
      throw new BadRequestException('Cancelled payments cannot be marked paid');
    }
    const targetPaid =
      input?.amountPaid != null ? Number(input.amountPaid) : Number(existing.amount);
    if (!Number.isFinite(targetPaid) || targetPaid <= 0) {
      throw new BadRequestException('Paid amount must be positive');
    }
    const amount = Number(existing.amount);
    const amountPaid = Math.min(targetPaid, amount);
    const fullyPaid = amountPaid >= amount;
    const payment = await this.prisma.tripPayment.update({
      where: { id: paymentId },
      data: {
        amountPaid: new Prisma.Decimal(amountPaid),
        status: fullyPaid ? 'paid' : 'partial',
        paidAt: fullyPaid ? new Date() : existing.paidAt,
        ...(input?.method !== undefined ? { method: input.method } : {}),
        ...(input?.reference !== undefined ? { reference: input.reference } : {}),
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
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'payment.paid',
      entityType: 'trip_payment',
      entityId: payment.id,
      metadata: {
        tripId,
        amountPaid,
        status: payment.status,
        beforeStatus: existing.status,
      },
    });

    try {
      const trip = await this.prisma.trip.findFirst({
        where: { id: tripId },
        select: { ownerId: true, tripNumber: true, title: true },
      });
      const notifyUserId = trip?.ownerId || user.sub;
      if (notifyUserId) {
        const flags = await this.notifications.orgNotifyFlags(user.organizationId);
        await this.notifications.notify({
          organizationId: user.organizationId,
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
      data: { status: 'cancelled', updatedBy: user.sub },
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
        organization: { select: { currency: true } },
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
    const actualBookingCost = activeBookings.reduce(
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
          }
        : null,
      costCompare: {
        estimatedCost,
        actualBookingCost: round2(actualBookingCost),
        invoicedCost: round2(invoicedCost),
        actualCost: round2(actualCost),
        variance: costVariance,
        currency: accepted?.currency || orgCurrency,
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
}
