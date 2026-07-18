import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AddNetworkSupplierSchema,
  ClaimSupplierInviteSchema,
  ConfirmInboundBookingSchema,
  CreateOrgRelationshipSchema,
  CreateSupplierInviteSchema,
  UpdateOrgRelationshipSchema,
  UpdatePartnerProfileSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  Public,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { NetworkService } from './network.service';

@Controller('network')
export class NetworkController {
  constructor(private network: NetworkService) {}

  @Get('partners')
  @RequirePermissions('network.read')
  discover(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('kind') kind?: string,
    @Query('city') city?: string,
  ) {
    return this.network.discoverPartners(user, { q, kind, city });
  }

  @Get('relationships')
  @RequirePermissions('network.read')
  listRelationships(@CurrentUser() user: AuthUser) {
    return this.network.listMyRelationships(user);
  }

  @Get('followers')
  @RequirePermissions('network.read')
  listFollowers(@CurrentUser() user: AuthUser) {
    return this.network.listFollowers(user);
  }

  @Get('followed-partners')
  @RequirePermissions('network.read')
  followedForPicker(@CurrentUser() user: AuthUser) {
    return this.network.listFollowedPartnersForPicker(user);
  }

  @Post('relationships')
  @RequirePermissions('network.write')
  follow(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.network.follow(user, CreateOrgRelationshipSchema.parse(body));
  }

  @Patch('relationships/:id')
  @RequirePermissions('network.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.network.updateRelationship(user, id, UpdateOrgRelationshipSchema.parse(body));
  }

  @Delete('relationships/:id')
  @RequirePermissions('network.write')
  unfollow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.network.unfollow(user, id);
  }

  @Post('suppliers')
  @RequirePermissions('network.write')
  addSupplier(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.network.addToMySuppliers(user, AddNetworkSupplierSchema.parse(body));
  }

  @Post('suppliers/:id/invites')
  @RequireAgencyOrg()
  @RequirePermissions('network.write')
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.network.createSupplierInvite(
      user,
      id,
      CreateSupplierInviteSchema.parse(body ?? {}),
    );
  }

  @Get('invites/:token')
  @Public()
  peekInvite(@Param('token') token: string) {
    return this.network.peekInvite(token);
  }

  @Post('invites/:token/claim')
  @RequirePermissions('network.write')
  claimInvite(
    @CurrentUser() user: AuthUser,
    @Param('token') token: string,
    @Body() body: unknown,
  ) {
    const input = ClaimSupplierInviteSchema.parse(body ?? {});
    return this.network.claimInvite(user, token, input.assetId);
  }

  @Get('profile')
  @RequirePermissions('network.read')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.network.getMyPartnerProfile(user);
  }

  @Patch('profile')
  @RequirePermissions('network.write')
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.network.updateMyPartnerProfile(user, UpdatePartnerProfileSchema.parse(body));
  }

  @Get('inbound-bookings')
  @RequirePermissions('network.read')
  inbound(@CurrentUser() user: AuthUser) {
    return this.network.listInboundBookings(user);
  }

  @Patch('inbound-bookings/:id')
  @RequirePermissions('network.write')
  confirmInbound(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.network.confirmInboundBooking(
      user,
      id,
      ConfirmInboundBookingSchema.parse(body),
    );
  }
}
