import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateSupplierInvoiceSchema,
  CreateSupplierSchema,
  CreateTripPaymentSchema,
  MarkPaymentPaidSchema,
  UpdateSupplierInvoiceSchema,
  UpdateTripPaymentSchema,
} from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { OperationsService } from './operations.service';

@Controller()
export class OperationsController {
  constructor(private operations: OperationsService) {}

  @Get('suppliers')
  @RequirePermissions('trip.read', 'network.read')
  listSuppliers(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('placeId') placeId?: string,
  ) {
    return this.operations.listSuppliers(user.organizationId, {
      q,
      type,
      placeId,
    });
  }

  @Post('suppliers')
  @RequirePermissions('trip.write', 'network.write')
  createSupplier(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    return this.operations.createSupplier(user, CreateSupplierSchema.parse(body));
  }

  @Get('trips/:tripId/bookings')
  @RequireAgencyOrg()
  @RequirePermissions('trip.read')
  listBookings(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.operations.listBookings(user, tripId);
  }

  @Post('trips/:tripId/bookings')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  createBooking(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body()
    body: {
      type: string;
      title: string;
      supplierId?: string | null;
      status?: string;
      confirmationRef?: string | null;
      voucherNote?: string | null;
      costAmount?: number | null;
    },
  ) {
    return this.operations.createBooking(user, tripId, body);
  }

  @Patch('trips/:tripId/bookings/:bookingId')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  updateBooking(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
    @Body()
    body: {
      title?: string;
      type?: string;
      status?: string;
      confirmationRef?: string | null;
      voucherNote?: string | null;
      supplierId?: string | null;
      costAmount?: number | null;
    },
  ) {
    return this.operations.updateBooking(user, tripId, bookingId, body);
  }

  @Post('trips/:tripId/bookings/:bookingId/cancel')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  cancelBooking(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.operations.cancelBooking(user, tripId, bookingId);
  }

  @Delete('trips/:tripId/bookings/:bookingId')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  deleteBooking(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.operations.deleteBooking(user, tripId, bookingId);
  }

  @Get('trips/:tripId/finance-summary')
  @RequireAgencyOrg()
  @RequirePermissions('trip.read')
  financeSummary(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.operations.getFinanceSummary(user, tripId);
  }

  @Get('trips/:tripId/payments')
  @RequireAgencyOrg()
  @RequirePermissions('trip.read')
  listPayments(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.operations.listPayments(user, tripId);
  }

  @Post('trips/:tripId/payments')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  createPayment(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.operations.createPayment(user, tripId, CreateTripPaymentSchema.parse(body));
  }

  @Patch('trips/:tripId/payments/:paymentId')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  updatePayment(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    return this.operations.updatePayment(
      user,
      tripId,
      paymentId,
      UpdateTripPaymentSchema.parse(body),
    );
  }

  @Post('trips/:tripId/payments/:paymentId/paid')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  markPaid(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    const parsed = body && Object.keys(body as object).length
      ? MarkPaymentPaidSchema.parse(body)
      : {};
    return this.operations.markPaymentPaid(user, tripId, paymentId, parsed);
  }

  @Post('trips/:tripId/payments/:paymentId/unmark-paid')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  unmarkPaid(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.operations.unmarkPaymentPaid(user, tripId, paymentId);
  }

  @Post('trips/:tripId/payments/:paymentId/cancel')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  cancelPayment(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.operations.cancelPayment(user, tripId, paymentId);
  }

  @Get('trips/:tripId/supplier-invoices')
  @RequireAgencyOrg()
  @RequirePermissions('trip.read')
  listInvoices(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.operations.listSupplierInvoices(user, tripId);
  }

  @Post('trips/:tripId/supplier-invoices')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  createInvoice(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.operations.createSupplierInvoice(
      user,
      tripId,
      CreateSupplierInvoiceSchema.parse(body),
    );
  }

  @Patch('trips/:tripId/supplier-invoices/:invoiceId')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  updateInvoice(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() body: unknown,
  ) {
    return this.operations.updateSupplierInvoice(
      user,
      tripId,
      invoiceId,
      UpdateSupplierInvoiceSchema.parse(body),
    );
  }

  @Get('trips/:tripId/readiness')
  @RequireAgencyOrg()
  @RequirePermissions('trip.read')
  readiness(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.operations.getReadiness(user, tripId);
  }

  @Post('trips/:tripId/readiness/:itemId')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  toggleReadiness(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
    @Body() body: { done: boolean },
  ) {
    return this.operations.toggleReadiness(user, tripId, itemId, Boolean(body.done));
  }
}
