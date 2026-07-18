import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  CompleteDriverJobSchema,
  CreateDriverJobSchema,
  RecordDriverPaymentSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { DriverService } from './driver.service';

@Controller('driver')
export class DriverController {
  constructor(private driver: DriverService) {}

  @Get('assets/:assetId/availability')
  @RequirePermissions('ops.read', 'reservations.create')
  availability(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('startAt') startAt: string,
    @Query('endAt') endAt: string,
  ) {
    return this.driver.availability(user, assetId, startAt, endAt);
  }

  @Get('assets/:assetId/jobs')
  @RequirePermissions('ops.read', 'reservations.create')
  list(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('day') day?: string,
  ) {
    return this.driver.listJobs(user, assetId, day);
  }

  @Post('jobs')
  @RequirePermissions('ops.write', 'reservations.create')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.driver.createJob(user, CreateDriverJobSchema.parse(body));
  }

  @Get('jobs/:id')
  @RequirePermissions('ops.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driver.getJob(user, id);
  }

  @Post('jobs/:id/accept')
  @RequirePermissions('ops.write')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driver.accept(user, id);
  }

  @Post('jobs/:id/start')
  @RequirePermissions('ops.write')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driver.start(user, id);
  }

  @Post('jobs/:id/complete')
  @RequirePermissions('ops.write')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.driver.complete(
      user,
      id,
      CompleteDriverJobSchema.parse(body ?? {}),
    );
  }

  @Post('jobs/:id/cancel')
  @RequirePermissions('ops.write')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driver.cancel(user, id);
  }

  @Post('jobs/:id/invoice')
  @RequirePermissions('ops.write', 'finance.payment.manage')
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.driver.issueInvoice(user, id);
  }

  @Post('jobs/:id/payments')
  @RequirePermissions('ops.write', 'finance.payment.manage')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.driver.recordPayment(
      user,
      id,
      RecordDriverPaymentSchema.parse(body),
    );
  }
}
