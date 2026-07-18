import { Body, Controller, Post } from '@nestjs/common';
import { CreateTravelRequestSchema } from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequireAllPermissions,
  type AuthUser,
} from '../../common/helpers';
import { TravelRequestsService } from './travel-requests.service';

/**
 * Unified intake entry point. Agency-only, and requires the full authority to
 * assemble the underlying records (party + lead + inquiry) so it never lets a
 * user create something they couldn't create individually.
 */
@Controller('travel-requests')
@RequireAgencyOrg()
@RequireAllPermissions('party.write', 'lead.write', 'inquiry.write')
export class TravelRequestsController {
  constructor(private travelRequests: TravelRequestsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.travelRequests.create(user, CreateTravelRequestSchema.parse(body));
  }
}
