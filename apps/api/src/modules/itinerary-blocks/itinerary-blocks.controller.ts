import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateItineraryBlockSchema } from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { ItineraryBlocksService } from './itinerary-blocks.service';

@Controller('itinerary-blocks')
@RequireAgencyOrg()
export class ItineraryBlocksController {
  constructor(private blocks: ItineraryBlocksService) {}

  @Get()
  @RequirePermissions('trip.read')
  list(@CurrentUser() user: AuthUser) {
    return this.blocks.list(user.organizationId);
  }

  @Post()
  @RequirePermissions('trip.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.blocks.create(user.organizationId, CreateItineraryBlockSchema.parse(body));
  }

  @Get(':id')
  @RequirePermissions('trip.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.blocks.get(user.organizationId, id);
  }

  @Get(':id/expand')
  @RequirePermissions('trip.read', 'trip.write')
  expand(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.blocks.expand(user.organizationId, id);
  }

  @Post(':id/apply')
  @RequirePermissions('trip.write')
  apply(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.blocks.expand(user.organizationId, id);
  }
}
