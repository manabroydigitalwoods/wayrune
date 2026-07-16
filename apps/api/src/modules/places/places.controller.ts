import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreatePlaceCategorySchema,
  CreatePlaceContributionSchema,
  CreatePlaceSchema,
  CreatePlaceSubcategorySchema,
  UpdatePlaceSchema,
} from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { PlacesService } from './places.service';

@Controller('places')
@RequireAgencyOrg()
export class PlacesController {
  constructor(private places: PlacesService) {}

  @Get()
  @RequirePermissions('inquiry.read', 'trip.read', 'lead.read', 'org.settings.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('domesticOrIntl') domesticOrIntl?: string,
    @Query('kind') kind?: string,
    @Query('parentId') parentId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('includeDescendants') includeDescendants?: string,
  ) {
    return this.places.list(user.organizationId, {
      q,
      domesticOrIntl,
      kind,
      parentId,
      categoryId,
      subcategoryId,
      includeDescendants: includeDescendants === '1' || includeDescendants === 'true',
    });
  }

  @Get('categories')
  @RequirePermissions('inquiry.read', 'trip.read', 'org.settings.read')
  categories(@CurrentUser() user: AuthUser) {
    return this.places.listCategories(user.organizationId);
  }

  @Get('edges')
  @RequirePermissions('trip.read', 'inquiry.read')
  listEdges(
    @CurrentUser() user: AuthUser,
    @Query('fromPlaceId') fromPlaceId?: string,
    @Query('toPlaceId') toPlaceId?: string,
  ) {
    return this.places.listEdges(user.organizationId, fromPlaceId, toPlaceId);
  }

  @Get('route')
  @RequirePermissions('trip.read', 'trip.write', 'inquiry.read')
  resolveRoute(
    @CurrentUser() user: AuthUser,
    @Query('fromPlaceId') fromPlaceId?: string,
    @Query('toPlaceId') toPlaceId?: string,
  ) {
    return this.places.resolveRoute(user.organizationId, fromPlaceId, toPlaceId);
  }

  @Get('contributions')
  @RequirePermissions('org.settings.read', 'org.settings.write', 'trip.read')
  listContributions(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.places.listContributions(user.organizationId, status);
  }

  @Post('contributions')
  @RequirePermissions('trip.write', 'org.settings.write')
  createContribution(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.places.createContribution(
      user.organizationId,
      user.sub,
      CreatePlaceContributionSchema.parse(body),
    );
  }

  @Post('categories')
  @RequirePermissions('org.settings.write')
  createCategory(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.places.createCategory(
      user.organizationId,
      CreatePlaceCategorySchema.parse(body),
    );
  }

  @Post('subcategories')
  @RequirePermissions('org.settings.write')
  createSubcategory(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.places.createSubcategory(
      user.organizationId,
      CreatePlaceSubcategorySchema.parse(body),
    );
  }

  @Get(':id/knowledge')
  @RequirePermissions('inquiry.read', 'trip.read', 'org.settings.read')
  knowledge(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.places.listKnowledge(user.organizationId, id);
  }

  @Get(':id')
  @RequirePermissions('inquiry.read', 'trip.read', 'lead.read', 'org.settings.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.places.getById(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('inquiry.write', 'trip.write', 'org.settings.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.places.create(user.organizationId, user.sub, CreatePlaceSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermissions('org.settings.write', 'trip.write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.places.update(user.organizationId, id, UpdatePlaceSchema.parse(body));
  }
}
