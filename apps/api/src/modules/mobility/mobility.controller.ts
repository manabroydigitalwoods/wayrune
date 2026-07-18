import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  CreateAssetFleetRateSchema,
  CreateRentalReservationSchema,
  RecordRentalPaymentSchema,
  RentalCheckoutSchema,
  RentalReturnSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { MobilityService } from './mobility.service';

@Controller('mobility')
export class MobilityController {
  constructor(private mobility: MobilityService) {}

  @Get('assets/:assetId/rates')
  @RequirePermissions('ops.read', 'rates.manage')
  listRates(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.mobility.listRates(user, assetId);
  }

  @Post('rates')
  @RequirePermissions('ops.write', 'rates.manage')
  createRate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.mobility.createRate(user, CreateAssetFleetRateSchema.parse(body));
  }

  @Get('assets/:assetId/availability')
  @RequirePermissions('ops.read', 'reservations.create')
  availability(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('startAt') startAt: string,
    @Query('endAt') endAt: string,
  ) {
    return this.mobility.availability(user, assetId, startAt, endAt);
  }

  @Get('assets/:assetId/reservations')
  @RequirePermissions('ops.read', 'reservations.create')
  list(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.mobility.listReservations(user, assetId);
  }

  @Post('reservations')
  @RequirePermissions('ops.write', 'reservations.create')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.mobility.createReservation(
      user,
      CreateRentalReservationSchema.parse(body),
    );
  }

  @Get('reservations/:id')
  @RequirePermissions('ops.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mobility.getReservation(user, id);
  }

  @Post('reservations/:id/confirm')
  @RequirePermissions('ops.write', 'reservations.confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mobility.confirm(user, id);
  }

  @Post('reservations/:id/cancel')
  @RequirePermissions('ops.write')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mobility.cancel(user, id);
  }

  @Post('reservations/:id/checkout')
  @RequirePermissions('ops.write')
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.mobility.checkout(user, id, RentalCheckoutSchema.parse(body ?? {}));
  }

  @Post('reservations/:id/return')
  @RequirePermissions('ops.write')
  returnVehicle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.mobility.returnVehicle(user, id, RentalReturnSchema.parse(body ?? {}));
  }

  @Get('reservations/:id/folio')
  @RequirePermissions('ops.read')
  folio(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mobility.getFolio(user, id);
  }

  @Post('reservations/:id/deposit-invoice')
  @RequirePermissions('ops.write', 'finance.payment.manage')
  depositInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mobility.issueDepositDoc(user, id);
  }

  @Post('reservations/:id/invoice')
  @RequirePermissions('ops.write', 'finance.payment.manage')
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mobility.issueFinalInvoice(user, id);
  }

  @Post('reservations/:id/payments')
  @RequirePermissions('ops.write', 'finance.payment.manage')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.mobility.recordPayment(
      user,
      id,
      RecordRentalPaymentSchema.parse(body),
    );
  }
}
