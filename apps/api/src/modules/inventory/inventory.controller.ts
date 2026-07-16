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
  AllocateInventorySchema,
  CreateAssetAllotmentSchema,
  CreateAssetCalendarBlockSchema,
  CreateAssetFleetUnitSchema,
  CreateAssetRoomProductSchema,
  CreateAssetServiceOfferSchema,
  EnsureShadowAssetSchema,
  InventoryAvailabilityQuerySchema,
  UpdateAssetAllotmentSchema,
  UpdateAssetFleetUnitSchema,
  UpdateAssetRoomProductSchema,
  UpdateAssetServiceOfferSchema,
} from '@travel/contracts';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Post('shadow-asset')
  @RequirePermissions('ops.write', 'network.write')
  ensureShadow(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.inventory.ensureShadowAsset(user, EnsureShadowAssetSchema.parse(body));
  }

  @Get('availability')
  @RequirePermissions('ops.read', 'network.read', 'trip.read')
  availability(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    const parsed = InventoryAvailabilityQuerySchema.parse({
      assetId: query.assetId || undefined,
      supplierId: query.supplierId || undefined,
      from: query.from,
      to: query.to,
      guests: query.guests ? Number(query.guests) : undefined,
    });
    return this.inventory.availability(user, parsed);
  }

  @Post('allocate')
  @RequirePermissions('ops.write', 'network.write')
  allocate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.inventory.allocate(user, AllocateInventorySchema.parse(body));
  }

  @Get('assets/:assetId/rooms')
  @RequirePermissions('ops.read', 'network.read')
  listRooms(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.inventory.listRoomProducts(user, assetId);
  }

  @Post('rooms')
  @RequirePermissions('ops.write', 'network.write')
  createRoom(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.inventory.createRoomProduct(
      user,
      CreateAssetRoomProductSchema.parse(body),
    );
  }

  @Patch('rooms/:id')
  @RequirePermissions('ops.write', 'network.write')
  updateRoom(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.inventory.updateRoomProduct(
      user,
      id,
      UpdateAssetRoomProductSchema.parse(body),
    );
  }

  @Post('allotments')
  @RequirePermissions('ops.write', 'network.write')
  createAllotment(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.inventory.createAllotment(user, CreateAssetAllotmentSchema.parse(body));
  }

  @Patch('allotments/:id')
  @RequirePermissions('ops.write', 'network.write')
  updateAllotment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.inventory.updateAllotment(
      user,
      id,
      UpdateAssetAllotmentSchema.parse(body),
    );
  }

  @Delete('allotments/:id')
  @RequirePermissions('ops.write', 'network.write')
  deleteAllotment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventory.deleteAllotment(user, id);
  }

  @Get('assets/:assetId/fleet')
  @RequirePermissions('ops.read', 'network.read')
  listFleet(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.inventory.listFleetUnits(user, assetId);
  }

  @Post('fleet')
  @RequirePermissions('ops.write', 'network.write')
  createFleet(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.inventory.createFleetUnit(user, CreateAssetFleetUnitSchema.parse(body));
  }

  @Patch('fleet/:id')
  @RequirePermissions('ops.write', 'network.write')
  updateFleet(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.inventory.updateFleetUnit(
      user,
      id,
      UpdateAssetFleetUnitSchema.parse(body),
    );
  }

  @Get('assets/:assetId/calendar')
  @RequirePermissions('ops.read', 'network.read')
  listCalendar(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventory.listCalendar(user, assetId, from, to);
  }

  @Post('calendar')
  @RequirePermissions('ops.write', 'network.write')
  createCalendar(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.inventory.createCalendarBlock(
      user,
      CreateAssetCalendarBlockSchema.parse(body),
    );
  }

  @Delete('calendar/:id')
  @RequirePermissions('ops.write', 'network.write')
  deleteCalendar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventory.deleteCalendarBlock(user, id);
  }

  @Get('assets/:assetId/offers')
  @RequirePermissions('ops.read', 'network.read')
  listOffers(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.inventory.listServiceOffers(user, assetId);
  }

  @Post('offers')
  @RequirePermissions('ops.write', 'network.write')
  createOffer(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.inventory.createServiceOffer(
      user,
      CreateAssetServiceOfferSchema.parse(body),
    );
  }

  @Patch('offers/:id')
  @RequirePermissions('ops.write', 'network.write')
  updateOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.inventory.updateServiceOffer(
      user,
      id,
      UpdateAssetServiceOfferSchema.parse(body),
    );
  }

  @Delete('offers/:id')
  @RequirePermissions('ops.write', 'network.write')
  deleteOffer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventory.softDeleteServiceOffer(user, id);
  }

  @Get('assets/:assetId/allocations')
  @RequirePermissions('ops.read', 'network.read')
  listAllocations(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.inventory.listAllocations(user, assetId);
  }
}
