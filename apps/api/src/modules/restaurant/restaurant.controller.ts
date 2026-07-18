import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ConfirmMealReservationSchema,
  ConvertMealInquirySchema,
  CreateMealInquirySchema,
  CreateMealReservationSchema,
  QuoteMealInquirySchema,
  UpdateMealReservationSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { RestaurantService } from './restaurant.service';

@Controller('restaurant')
export class RestaurantController {
  constructor(private restaurant: RestaurantService) {}

  @Get('assets/:assetId/inquiries')
  @RequirePermissions('ops.read', 'reservations.create')
  listInquiries(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('status') status?: string,
  ) {
    return this.restaurant.listInquiries(user, assetId, status);
  }

  @Post('inquiries')
  @RequirePermissions('ops.write', 'reservations.create')
  createInquiry(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.restaurant.createInquiry(user, CreateMealInquirySchema.parse(body));
  }

  @Post('inquiries/:id/quote')
  @RequirePermissions('ops.write', 'finance.payment.manage')
  quoteInquiry(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.restaurant.quoteInquiry(user, id, QuoteMealInquirySchema.parse(body));
  }

  @Post('inquiries/:id/convert')
  @RequirePermissions('ops.write', 'reservations.create')
  convertInquiry(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.restaurant.convertInquiry(
      user,
      id,
      ConvertMealInquirySchema.parse(body),
    );
  }

  @Get('assets/:assetId/reservations')
  @RequirePermissions('ops.read', 'reservations.create')
  listReservations(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.restaurant.listReservations(user, assetId, {
      from: query.from,
      to: query.to,
      status: query.status,
    });
  }

  @Post('reservations')
  @RequirePermissions('reservations.create', 'ops.write')
  createReservation(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const base = CreateMealReservationSchema.parse(body);
    const confirmImmediately = Boolean(
      (body as { confirmImmediately?: boolean }).confirmImmediately,
    );
    return this.restaurant.createReservation(user, {
      ...base,
      confirmImmediately,
    });
  }

  @Post('reservations/:id/confirm')
  @RequirePermissions('reservations.confirm', 'ops.write')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.restaurant.confirmReservation(
      user,
      id,
      ConfirmMealReservationSchema.parse(body ?? {}),
    );
  }

  @Post('reservations/:id/arrive')
  @RequirePermissions('ops.write')
  arrive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.restaurant.arrive(user, id);
  }

  @Post('reservations/:id/seat')
  @RequirePermissions('ops.write')
  seat(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.restaurant.seat(user, id);
  }

  @Post('reservations/:id/serve')
  @RequirePermissions('ops.write')
  serve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.restaurant.serve(user, id);
  }

  @Post('reservations/:id/complete')
  @RequirePermissions('ops.write')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    return this.restaurant.complete(user, id, force === '1' || force === 'true');
  }

  @Post('reservations/:id/cancel')
  @RequirePermissions('ops.write', 'reservations.confirm')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.restaurant.cancel(user, id);
  }

  @Post('reservations/:id/no-show')
  @RequirePermissions('ops.write')
  noShow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.restaurant.noShow(user, id);
  }

  @Get('reservations/:id/bill-blockers')
  @RequirePermissions('ops.read')
  billBlockers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.restaurant.getBillBlockers(user, id);
  }

  @Get('reservations/:id/folio')
  @RequirePermissions('ops.read', 'finance.cost.read')
  folio(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.restaurant.getFolio(user, id);
  }

  @Post('reservations/:id/folio-charges')
  @RequirePermissions('ops.write', 'finance.payment.manage')
  addCharge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { description: string; amount: number; taxAmount?: number },
  ) {
    return this.restaurant.addFolioCharge(user, id, body);
  }

  @Post('reservations/:id/invoice')
  @RequirePermissions('finance.payment.manage', 'ops.write')
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.restaurant.issueInvoice(user, id);
  }

  @Post('reservations/:id/payments')
  @RequirePermissions('finance.payment.manage', 'ops.write')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { amount: number; method?: string; reference?: string },
  ) {
    return this.restaurant.recordPayment(user, id, body);
  }

  @Patch('reservations/:id')
  @RequirePermissions('ops.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.restaurant.updateReservation(
      user,
      id,
      UpdateMealReservationSchema.parse(body),
    );
  }

  @Get('assets/:assetId/kitchen-board')
  @RequirePermissions('ops.read')
  kitchen(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.restaurant.kitchenBoard(user, assetId);
  }

  @Post('reservations/:id/preparation')
  @RequirePermissions('ops.write')
  prep(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { preparationStatus: 'pending' | 'prepping' | 'ready' | 'served' },
  ) {
    return this.restaurant.setPreparation(user, id, body.preparationStatus);
  }

  @Get('parties/:partyId/history')
  @RequirePermissions('ops.read')
  partyHistory(@CurrentUser() user: AuthUser, @Param('partyId') partyId: string) {
    return this.restaurant.partyHistory(user, partyId);
  }
}
