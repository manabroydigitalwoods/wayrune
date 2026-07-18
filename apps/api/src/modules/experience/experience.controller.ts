import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  AckExperienceWaiverSchema,
  AddExperienceParticipantSchema,
  CreateExperienceReservationSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { ExperienceService } from './experience.service';

@Controller('experience')
export class ExperienceController {
  constructor(private experience: ExperienceService) {}

  @Get('assets/:assetId/catalog')
  @RequirePermissions('ops.read', 'network.read')
  catalog(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.experience.listCatalog(user, assetId);
  }

  @Get('assets/:assetId/reservations')
  @RequirePermissions('ops.read', 'reservations.create')
  list(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.experience.listReservations(user, assetId);
  }

  @Post('reservations')
  @RequirePermissions('reservations.create', 'ops.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.experience.createReservation(
      user,
      CreateExperienceReservationSchema.parse(body),
    );
  }

  @Get('reservations/:id')
  @RequirePermissions('ops.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.experience.getReservation(user, id);
  }

  @Post('reservations/:id/confirm')
  @RequirePermissions('reservations.confirm', 'ops.write')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.experience.confirm(user, id);
  }

  @Post('reservations/:id/cancel')
  @RequirePermissions('ops.write')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.experience.cancel(user, id);
  }

  @Post('reservations/:id/check-in')
  @RequirePermissions('ops.write')
  checkIn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.experience.checkIn(user, id);
  }

  @Post('reservations/:id/complete')
  @RequirePermissions('ops.write')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.experience.complete(user, id);
  }

  @Post('reservations/:id/participants')
  @RequirePermissions('ops.write')
  addParticipant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.experience.addParticipant(
      user,
      id,
      AddExperienceParticipantSchema.parse(body),
    );
  }

  @Post('reservations/:id/participants/:participantId/attendance')
  @RequirePermissions('ops.write')
  attendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() body: { attended?: boolean },
  ) {
    return this.experience.markAttendance(
      user,
      id,
      participantId,
      body.attended !== false,
    );
  }

  @Post('reservations/:id/waiver')
  @RequirePermissions('ops.write')
  waiver(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.experience.ackWaiver(user, id, AckExperienceWaiverSchema.parse(body));
  }

  @Get('resource-scheduling-policy')
  @RequirePermissions('ops.read')
  policy(@Query() _q: Record<string, string>) {
    return this.experience.resourceSchedulingPolicy();
  }
}
