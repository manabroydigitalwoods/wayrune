import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ChangeMealPlanSchema,
  ChangeOccupancySchema,
  ChangeRoomProductSchema,
  CloseDaySchema,
  CreateAssetRatePlanSchema,
  CreateAssetRoomUnitSchema,
  CreateStayReservationSchema,
  EarlyDepartureSchema,
  ExtendStaySchema,
  HomestayAttrsSchema,
  MoveUnitSchema,
  PartialCancelRoomSchema,
  RecordStayPaymentSchema,
  StayAvailabilityCalendarQuerySchema,
  StayCheckInSchema,
  StayDashboardQuerySchema,
  UpdateAssetRatePlanSchema,
  UpdateAssetRoomUnitSchema,
  UpdateStayReservationSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { StayService } from './stay.service';

@Controller('stay')
export class StayController {
  constructor(private stay: StayService) {}

  @Get('dashboard')
  @RequirePermissions('network.read', 'ops.read')
  dashboard(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.stay.dashboard(
      user,
      StayDashboardQuerySchema.parse({
        assetId: query.assetId || undefined,
      }),
    );
  }

  @Get('availability-calendar')
  @RequirePermissions('network.read', 'ops.read')
  calendar(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.stay.availabilityCalendar(
      user,
      StayAvailabilityCalendarQuerySchema.parse({
        assetId: query.assetId,
        from: query.from,
        to: query.to,
        roomProductId: query.roomProductId || undefined,
      }),
    );
  }

  @Get('assets/:assetId/units')
  @RequirePermissions('network.read', 'ops.read')
  listUnits(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('roomProductId') roomProductId?: string,
  ) {
    return this.stay.listRoomUnits(user, assetId, roomProductId);
  }

  @Post('units')
  @RequirePermissions('network.write', 'ops.write')
  createUnit(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.stay.createRoomUnit(user, CreateAssetRoomUnitSchema.parse(body));
  }

  @Patch('units/:id')
  @RequirePermissions('network.write', 'ops.write')
  updateUnit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.updateRoomUnit(user, id, UpdateAssetRoomUnitSchema.parse(body));
  }

  @Delete('units/:id')
  @RequirePermissions('network.write', 'ops.write')
  deleteUnit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stay.deleteRoomUnit(user, id);
  }

  @Get('assets/:assetId/rates')
  @RequirePermissions('network.read', 'ops.read')
  listRates(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.stay.listRatePlans(user, assetId);
  }

  @Post('rates')
  @RequirePermissions('network.write', 'ops.write')
  createRate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.stay.createRatePlan(user, CreateAssetRatePlanSchema.parse(body));
  }

  @Patch('rates/:id')
  @RequirePermissions('network.write', 'ops.write')
  updateRate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.updateRatePlan(user, id, UpdateAssetRatePlanSchema.parse(body));
  }

  @Delete('rates/:id')
  @RequirePermissions('network.write', 'ops.write')
  deleteRate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stay.deleteRatePlan(user, id);
  }

  @Get('assets/:assetId/reservations')
  @RequirePermissions('network.read', 'ops.read')
  listReservations(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.stay.listReservations(user, assetId, {
      status: query.status || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
    });
  }

  @Post('reservations')
  @RequirePermissions('network.write', 'ops.write')
  createReservation(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.stay.createReservation(
      user,
      CreateStayReservationSchema.parse(body),
    );
  }

  @Patch('reservations/:id')
  @RequirePermissions('network.write', 'ops.write')
  updateReservation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.updateReservation(
      user,
      id,
      UpdateStayReservationSchema.parse(body),
    );
  }

  @Post('reservations/:id/check-in')
  @RequirePermissions('network.write', 'ops.write')
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.checkIn(user, id, StayCheckInSchema.parse(body ?? {}));
  }

  @Post('reservations/:id/check-out')
  @RequirePermissions('network.write', 'ops.write')
  checkOut(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const force =
      body && typeof body === 'object' && 'force' in body
        ? Boolean((body as { force?: boolean }).force)
        : false;
    return this.stay.checkOut(user, id, force);
  }

  @Get('reservations/:id/folio')
  @RequirePermissions('network.read', 'ops.read')
  folio(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stay.getFolio(user, id);
  }

  @Post('reservations/:id/invoice')
  @RequirePermissions('network.write', 'ops.write', 'finance.payment.manage')
  issueInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stay.issueInvoice(user, id);
  }

  @Post('reservations/:id/payments')
  @RequirePermissions('network.write', 'ops.write', 'finance.payment.manage')
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.recordPayment(user, id, RecordStayPaymentSchema.parse(body));
  }

  @Get('reservations/:id/checkout-blockers')
  @RequirePermissions('network.read', 'ops.read')
  checkoutBlockers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stay.getCheckoutBlockers(user, id);
  }

  @Post('reservations/:id/cancel')
  @RequirePermissions('network.write', 'ops.write')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stay.cancelReservation(user, id);
  }

  // ── Named modify ops ────────────────────────────────────────────────

  @Post('reservations/:id/extend')
  @RequirePermissions('network.write', 'ops.write')
  extend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.extendStay(user, id, ExtendStaySchema.parse(body));
  }

  @Post('reservations/:id/early-departure')
  @RequirePermissions('network.write', 'ops.write')
  earlyDeparture(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.earlyDeparture(user, id, EarlyDepartureSchema.parse(body));
  }

  @Post('reservations/:id/change-room-product')
  @RequirePermissions('network.write', 'ops.write')
  changeRoomProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.changeRoomProduct(user, id, ChangeRoomProductSchema.parse(body));
  }

  @Post('reservations/:id/move-unit')
  @RequirePermissions('network.write', 'ops.write')
  moveUnit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.moveUnit(user, id, MoveUnitSchema.parse(body));
  }

  @Post('reservations/:id/change-occupancy')
  @RequirePermissions('network.write', 'ops.write')
  changeOccupancy(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.changeOccupancy(user, id, ChangeOccupancySchema.parse(body));
  }

  @Post('reservations/:id/change-meal-plan')
  @RequirePermissions('network.write', 'ops.write')
  changeMealPlan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.changeMealPlan(user, id, ChangeMealPlanSchema.parse(body));
  }

  @Post('reservations/:id/partial-cancel')
  @RequirePermissions('network.write', 'ops.write')
  partialCancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.stay.partialCancelRoom(user, id, PartialCancelRoomSchema.parse(body ?? {}));
  }

  // ── Homestay attributes ─────────────────────────────────────────────

  @Patch('assets/:assetId/homestay-attrs')
  @RequirePermissions('network.write', 'ops.write')
  updateHomestayAttrs(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
  ) {
    return this.stay.updateHomestayAttrs(user, assetId, HomestayAttrsSchema.parse(body));
  }

  // ── Property day close ───────────────────────────────────────────────

  @Get('assets/:assetId/day-closes')
  @RequirePermissions('network.read', 'ops.read')
  listDayCloses(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.stay.listDayCloses(user, assetId);
  }

  @Post('assets/:assetId/day-close')
  @RequirePermissions('network.write', 'ops.write')
  closeDay(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
  ) {
    const { businessDate } = CloseDaySchema.parse(body);
    return this.stay.closePropertyDay(user, assetId, businessDate);
  }
}
