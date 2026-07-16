import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateRoomTypeSchema } from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { RoomTypesService } from './room-types.service';

@Controller('room-types')
@RequireAgencyOrg()
export class RoomTypesController {
  constructor(private roomTypes: RoomTypesService) {}

  @Get()
  @RequirePermissions('inquiry.read', 'trip.read')
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.roomTypes.list(user.organizationId, q);
  }

  @Post()
  @RequirePermissions('inquiry.write', 'trip.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.roomTypes.create(
      user.organizationId,
      user.sub,
      CreateRoomTypeSchema.parse(body),
    );
  }
}
