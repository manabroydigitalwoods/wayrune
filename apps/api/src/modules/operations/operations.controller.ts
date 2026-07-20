import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ConfirmTripPaymentLinkSchema,
  CreateFinanceReportPackSchema,
  CreateSupplierInvoiceSchema,
  CreateSupplierSchema,
  CreateTripPaymentLinkSchema,
  CreateTripPaymentSchema,
  MarkPaymentPaidSchema,
  MarkTripPaymentLinkSentSchema,
  MarkTripVouchersWhatsappSentSchema,
  SendHotelEnquiryWhatsappSchema,
  SendTripPaymentLinkWhatsappSchema,
  SendTripVouchersEmailSchema,
  SendTripVouchersWhatsappSchema,
  UpdateFinanceReportPackSchema,
  UpdateSupplierInvoiceSchema,
  UpdateSupplierSchema,
  UpdateTripPaymentSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  Public,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { assertRateLimit, clientKey } from '../../common/rate-limit';
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

  @Get('suppliers/:id')
  @RequirePermissions('trip.read', 'network.read')
  getSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.operations.getSupplier(user.organizationId, id);
  }

  @Post('suppliers')
  @RequirePermissions('trip.write', 'network.write')
  createSupplier(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    return this.operations.createSupplier(user, CreateSupplierSchema.parse(body));
  }

  @Patch('suppliers/:id')
  @RequirePermissions('trip.write', 'network.write')
  updateSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.operations.updateSupplier(
      user,
      id,
      UpdateSupplierSchema.parse(body),
    );
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
      startAt?: string | null;
      endAt?: string | null;
      driverSupplierId?: string | null;
      vehicleLabel?: string | null;
      fleetUnitId?: string | null;
      allowConflict?: boolean;
    },
  ) {
    return this.operations.createBooking(user, tripId, body);
  }

  @Post('trips/:tripId/bookings/from-accepted-quote')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  materializeFromAcceptedQuote(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body?: { versionId?: string },
  ) {
    return this.operations.materializeBookingsFromAcceptedQuote(
      user.organizationId,
      user.sub,
      tripId,
      { versionId: body?.versionId },
    );
  }

  @Post('trips/:tripId/bookings/:bookingId/mark-vouchered')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  markVouchered(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
    @Body() body?: { note?: string | null },
  ) {
    return this.operations.markBookingVouchered(
      user,
      tripId,
      bookingId,
      body?.note,
    );
  }

  @Post('trips/:tripId/bookings/:bookingId/voucher-pdf')
  @RequireAgencyOrg()
  @RequirePermissions('trip.read')
  voucherPdf(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.operations.generateHotelVoucherPdf(user, tripId, bookingId);
  }

  @Post('trips/:tripId/send-vouchers-whatsapp')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  sendVouchersWhatsapp(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.operations.sendTripVouchersWhatsapp(
      user,
      tripId,
      SendTripVouchersWhatsappSchema.parse(body ?? {}),
    );
  }

  @Post('trips/:tripId/mark-vouchers-whatsapp-sent')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  markVouchersWhatsappSent(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.operations.markTripVouchersWhatsappSent(
      user,
      tripId,
      MarkTripVouchersWhatsappSentSchema.parse(body ?? {}),
    );
  }

  @Post('trips/:tripId/send-vouchers-email')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  sendVouchersEmail(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.operations.sendTripVouchersEmail(
      user,
      tripId,
      SendTripVouchersEmailSchema.parse(body ?? {}),
    );
  }

  @Post('trips/:tripId/bookings/:bookingId/send-enquiry-whatsapp')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  sendEnquiryWhatsapp(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    return this.operations.sendHotelEnquiryWhatsapp(
      user,
      tripId,
      bookingId,
      SendHotelEnquiryWhatsappSchema.parse(body ?? {}),
    );
  }

  @Post('trips/:tripId/bookings/:bookingId/mark-enquiry-sent')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  markEnquirySent(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.operations.markEnquirySent(user, tripId, bookingId);
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
      confirmedAmount?: number | null;
      quotedAmount?: number | null;
      startAt?: string | null;
      endAt?: string | null;
      driverSupplierId?: string | null;
      vehicleLabel?: string | null;
      fleetUnitId?: string | null;
      allowConflict?: boolean;
      requiredQuantity?: number | null;
      roomProductId?: string | null;
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

  @Get('trips/:tripId/payments/schedule-preview')
  @RequireAgencyOrg()
  @RequirePermissions('trip.read', 'trip.write')
  instalmentSchedulePreview(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
  ) {
    return this.operations.customerInstalmentSchedulePreview(user, tripId);
  }

  @Post('trips/:tripId/payments/schedule-from-terms')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write')
  scheduleInstalmentsFromTerms(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
  ) {
    return this.operations.scheduleCustomerInstalmentsFromTerms(user, tripId);
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

  @Post('trips/:tripId/payments/:paymentId/payment-link')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write', 'finance.payment.manage')
  createPaymentLink(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    return this.operations.createPaymentLink(
      user,
      tripId,
      paymentId,
      CreateTripPaymentLinkSchema.parse(body ?? {}),
    );
  }

  @Post('trips/:tripId/payments/:paymentId/mark-payment-link-sent')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write', 'finance.payment.manage')
  markPaymentLinkSent(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    return this.operations.markPaymentLinkSent(
      user,
      tripId,
      paymentId,
      MarkTripPaymentLinkSentSchema.parse(body ?? {}),
    );
  }

  @Post('trips/:tripId/payments/:paymentId/send-payment-link-whatsapp')
  @RequireAgencyOrg()
  @RequirePermissions('trip.write', 'finance.payment.manage')
  sendPaymentLinkWhatsapp(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    return this.operations.sendPaymentLinkWhatsapp(
      user,
      tripId,
      paymentId,
      SendTripPaymentLinkWhatsappSchema.parse(body ?? {}),
    );
  }

  @Public()
  @Get('public/trip-payments/:token')
  publicPaymentLink(@Param('token') token: string) {
    return this.operations.getPublicPaymentLink(token);
  }

  @Public()
  @Post('public/trip-payments/:token/pay-intent')
  publicPaymentIntent(
    @Param('token') token: string,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`trip-pay-intent:${clientKey(req)}`, 15, 60_000);
    return this.operations.createPublicPaymentIntent(token);
  }

  @Public()
  @Post('public/trip-payments/:token/pay-confirm')
  publicPaymentConfirm(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`trip-pay-confirm:${clientKey(req)}`, 15, 60_000);
    return this.operations.confirmPublicPayment(
      token,
      ConfirmTripPaymentLinkSchema.parse(body ?? {}),
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

  @Get('operations/movement-board')
  @RequireAgencyOrg()
  @RequirePermissions('ops.read', 'trip.read')
  movementBoard(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ) {
    const n = days != null && days !== '' ? Number(days) : 14;
    return this.operations.getMovementBoard(user, Number.isFinite(n) ? n : 14);
  }

  @Get('operations/finance/aging')
  @RequireAgencyOrg()
  @RequirePermissions('finance.cost.read', 'finance.settlement.read', 'trip.read')
  financeAging(
    @CurrentUser() user: AuthUser,
    @Query('direction') direction?: string,
    @Query('overdueOnly') overdueOnly?: string,
  ) {
    const dir =
      direction === 'customer' || direction === 'supplier' || direction === 'all'
        ? direction
        : 'all';
    return this.operations.getFinanceAging(user, {
      direction: dir,
      overdueOnly: overdueOnly === '1' || overdueOnly === 'true',
    });
  }

  @Get('operations/finance/portfolio')
  @RequireAgencyOrg()
  @RequirePermissions('finance.margin.read', 'finance.cost.read')
  financePortfolio(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.operations.getFinancePortfolio(user, {
      from: from?.trim() || null,
      to: to?.trim() || null,
    });
  }

  @Get('operations/finance/report-packs')
  @RequireAgencyOrg()
  @RequirePermissions(
    'finance.cost.read',
    'finance.margin.read',
    'finance.settlement.read',
    'trip.read',
  )
  listFinanceReportPacks(@CurrentUser() user: AuthUser) {
    return this.operations.listFinanceReportPacks(user);
  }

  @Post('operations/finance/report-packs')
  @RequireAgencyOrg()
  @RequirePermissions(
    'finance.cost.read',
    'finance.margin.read',
    'org.settings.write',
  )
  createFinanceReportPack(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.operations.createFinanceReportPack(
      user,
      CreateFinanceReportPackSchema.parse(body),
    );
  }

  @Patch('operations/finance/report-packs/:packId')
  @RequireAgencyOrg()
  @RequirePermissions(
    'finance.cost.read',
    'finance.margin.read',
    'org.settings.write',
  )
  updateFinanceReportPack(
    @CurrentUser() user: AuthUser,
    @Param('packId') packId: string,
    @Body() body: unknown,
  ) {
    return this.operations.updateFinanceReportPack(
      user,
      packId,
      UpdateFinanceReportPackSchema.parse(body),
    );
  }

  @Delete('operations/finance/report-packs/:packId')
  @RequireAgencyOrg()
  @RequirePermissions(
    'finance.cost.read',
    'finance.margin.read',
    'org.settings.write',
  )
  deleteFinanceReportPack(
    @CurrentUser() user: AuthUser,
    @Param('packId') packId: string,
  ) {
    return this.operations.deleteFinanceReportPack(user, packId);
  }

  @Post('operations/finance/report-packs/:packId/send')
  @RequireAgencyOrg()
  @RequirePermissions(
    'finance.cost.read',
    'finance.margin.read',
    'org.settings.write',
  )
  sendFinanceReportPack(
    @CurrentUser() user: AuthUser,
    @Param('packId') packId: string,
    @Body() body: unknown,
  ) {
    const parsed =
      body && typeof body === 'object'
        ? (body as { toEmails?: string[] })
        : {};
    return this.operations.sendFinanceReportPackEmail(user, packId, {
      toEmails: Array.isArray(parsed.toEmails) ? parsed.toEmails : undefined,
    });
  }

  @Get('trips/:tripId/control')
  @RequireAgencyOrg()
  @RequirePermissions('trip.read')
  tripControl(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.operations.getTripControl(user, tripId);
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
