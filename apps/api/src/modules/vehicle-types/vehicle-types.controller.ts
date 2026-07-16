import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateVehicleTypeSchema } from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { VehicleTypesService } from './vehicle-types.service';

@Controller('vehicle-types')
@RequireAgencyOrg()
export class VehicleTypesController {
  constructor(private vehicleTypes: VehicleTypesService) {}

  @Get()
  @RequirePermissions('inquiry.read', 'trip.read')
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.vehicleTypes.list(user.organizationId, q);
  }

  @Post()
  @RequirePermissions('inquiry.write', 'trip.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.vehicleTypes.create(
      user.organizationId,
      user.sub,
      CreateVehicleTypeSchema.parse(body),
    );
  }
}
