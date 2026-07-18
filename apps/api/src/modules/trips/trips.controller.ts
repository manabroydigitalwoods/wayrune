import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateTravellerSchema,
  CreateTripSchema,
  PaginationQuerySchema,
  RecordTripFeedbackSchema,
  UpdateTripDestinationsSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { TripsService } from './trips.service';

@Controller('trips')
@RequireAgencyOrg()
export class TripsController {
  constructor(private trips: TripsService) {}

  @Post()
  @RequirePermissions('trip.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.trips.create(user, CreateTripSchema.parse(body));
  }

  @Get()
  @RequirePermissions('trip.read')
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = PaginationQuerySchema.parse(query);
    const extra = query as { status?: string; partyId?: string };
    return this.trips.list(user.organizationId, q.page, q.pageSize, q.q, extra.status, extra.partyId);
  }

  @Get(':id')
  @RequirePermissions('trip.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.getWorkspace(user, id);
  }

  @Patch(':id/destinations')
  @RequirePermissions('trip.write')
  updateDestinations(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.trips.updateDestinations(
      user,
      id,
      UpdateTripDestinationsSchema.parse(body),
    );
  }

  @Post(':id/travellers')
  @RequirePermissions('trip.write')
  addTraveller(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.trips.addTraveller(user, id, CreateTravellerSchema.parse(body));
  }

  @Get(':id/timeline')
  @RequirePermissions('trip.read')
  timeline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.listTimeline(user, id);
  }

  @Post(':id/status')
  @RequirePermissions('trip.write')
  status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: string; cancellationReason?: string },
  ) {
    return this.trips.updateStatus(user, id, body.status, body.cancellationReason);
  }

  @Post(':id/feedback')
  @RequirePermissions('trip.write')
  feedback(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.trips.recordFeedback(user, id, RecordTripFeedbackSchema.parse(body));
  }

  @Get(':id/feedback')
  @RequirePermissions('trip.read')
  listFeedback(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.listFeedback(user, id);
  }
}
