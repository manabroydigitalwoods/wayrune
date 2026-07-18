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
  CreatePlaceSchema,
  CreateVehicleTypeSchema,
  ReviewPlaceContributionSchema,
  UpdatePlaceSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequirePermissions,
  RequirePlatformOrg,
  type AuthUser,
} from '../../common/helpers';
import { PlacesService } from './places.service';
import { VehicleTypesService } from '../vehicle-types/vehicle-types.service';

/**
 * Travel OS platform catalog admin.
 * Only organization.kind === 'platform' with platform.catalog.* permissions.
 */
@Controller('platform/catalog')
@RequirePlatformOrg()
export class PlatformCatalogController {
  constructor(
    private places: PlacesService,
    private vehicleTypes: VehicleTypesService,
  ) {}

  @Get('places')
  @RequirePermissions('platform.catalog.read')
  listPlaces(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('kind') kind?: string,
    @Query('parentId') parentId?: string,
  ) {
    // Platform org has no tenant places; include inactive so admin can reactivate.
    return this.places.list(user.organizationId, {
      q,
      kind,
      parentId,
      includeInactive: true,
    });
  }

  @Get('places/:id')
  @RequirePermissions('platform.catalog.read')
  getPlace(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.places.getById(user.organizationId, id);
  }

  @Post('places')
  @RequirePermissions('platform.catalog.write')
  createPlace(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.places.platformCreateSystemPlace(user.sub, CreatePlaceSchema.parse(body));
  }

  @Patch('places/:id')
  @RequirePermissions('platform.catalog.write')
  updatePlace(@Param('id') id: string, @Body() body: unknown) {
    return this.places.platformUpdateSystemPlace(id, UpdatePlaceSchema.parse(body));
  }

  @Post('places/:id/knowledge')
  @RequirePermissions('platform.catalog.write')
  createKnowledge(@Param('id') id: string, @Body() body: unknown) {
    const input = body as {
      season?: string;
      kind?: string;
      title?: string | null;
      body?: string;
      meta?: Record<string, unknown>;
    };
    return this.places.platformCreateKnowledge(id, {
      season: input.season,
      kind: input.kind || 'tip',
      title: input.title,
      body: input.body || '',
      meta: input.meta,
    });
  }

  @Patch('knowledge/:id')
  @RequirePermissions('platform.catalog.write')
  updateKnowledge(@Param('id') id: string, @Body() body: unknown) {
    const input = body as {
      season?: string;
      kind?: string;
      title?: string | null;
      body?: string;
      meta?: Record<string, unknown>;
    };
    return this.places.platformUpdateKnowledge(id, input);
  }

  @Delete('knowledge/:id')
  @RequirePermissions('platform.catalog.write')
  deleteKnowledge(@Param('id') id: string) {
    return this.places.platformDeleteKnowledge(id);
  }

  @Get('edges')
  @RequirePermissions('platform.catalog.read')
  listEdges(
    @Query('fromPlaceId') fromPlaceId?: string,
    @Query('toPlaceId') toPlaceId?: string,
    @Query('q') q?: string,
  ) {
    return this.places.platformListEdges({ fromPlaceId, toPlaceId, q });
  }

  @Post('edges')
  @RequirePermissions('platform.catalog.write')
  createEdge(@Body() body: unknown) {
    const input = body as {
      fromPlaceId: string;
      toPlaceId: string;
      mode?: string;
      distanceKm?: number | null;
      durationMin?: number | null;
      roadHint?: string | null;
    };
    return this.places.platformUpsertEdge(input);
  }

  @Patch('edges/:id')
  @RequirePermissions('platform.catalog.write')
  updateEdge(@Param('id') id: string, @Body() body: unknown) {
    const input = body as {
      distanceKm?: number | null;
      durationMin?: number | null;
      roadHint?: string | null;
      mode?: string;
    };
    return this.places.platformUpdateEdge(id, input);
  }

  @Delete('edges/:id')
  @RequirePermissions('platform.catalog.write')
  deleteEdge(@Param('id') id: string) {
    return this.places.platformDeleteEdge(id);
  }

  @Get('subcategories')
  @RequirePermissions('platform.catalog.read')
  listSubcategories() {
    return this.places.listSystemSubcategories();
  }

  @Get('vehicle-types')
  @RequirePermissions('platform.catalog.read')
  listVehicleTypes(@Query('q') q?: string) {
    return this.vehicleTypes.listSystem(q);
  }

  @Post('vehicle-types')
  @RequirePermissions('platform.catalog.write')
  createVehicleType(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.vehicleTypes.platformCreate(user.sub, CreateVehicleTypeSchema.parse(body));
  }

  @Patch('vehicle-types/:id')
  @RequirePermissions('platform.catalog.write')
  updateVehicleType(@Param('id') id: string, @Body() body: unknown) {
    const input = body as Partial<{
      name: string;
      description: string | null;
      seats: number;
      profile: {
        imageUrl?: string;
        imageUrls?: string[];
        suitabilityTags?: string[];
      };
      isActive: boolean;
    }>;
    return this.vehicleTypes.platformUpdate(id, input);
  }

  @Get('contributions')
  @RequirePermissions('platform.catalog.read')
  listContributions(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.places.listContributions(user.organizationId, status || 'pending', {
      allOrgs: true,
    });
  }

  @Patch('contributions/:id')
  @RequirePermissions('platform.catalog.write')
  reviewContribution(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.places.reviewContribution(
      user.organizationId,
      user.sub,
      id,
      ReviewPlaceContributionSchema.parse(body),
    );
  }
}
