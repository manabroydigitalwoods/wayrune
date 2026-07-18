import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  CreateItineraryShareSchema,
  ProposalFamilyAgencyReplySchema,
  ProposalFamilyJoinSchema,
  ProposalFamilyMessageSchema,
  ProposalFamilyReactSchema,
  SaveItineraryVersionSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  Public,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { clientKey } from '../../common/rate-limit';
import { ItinerariesService } from './itineraries.service';

@Controller()
@RequireAgencyOrg()
export class ItinerariesController {
  constructor(private itineraries: ItinerariesService) {}

  @Get('trips/:tripId/itinerary-versions')
  @RequirePermissions('trip.read')
  list(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.itineraries.listVersions(user.organizationId, tripId);
  }

  @Post('trips/:tripId/itinerary-versions')
  @RequirePermissions('itinerary.edit')
  save(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string, @Body() body: unknown) {
    return this.itineraries.saveVersion(user, tripId, SaveItineraryVersionSchema.parse(body));
  }

  @Post('trips/:tripId/itinerary-versions/autosave')
  @RequirePermissions('itinerary.edit')
  autosave(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string, @Body() body: unknown) {
    return this.itineraries.autosave(user, tripId, SaveItineraryVersionSchema.parse(body));
  }

  @Post('trips/:tripId/itinerary-versions/:versionId/restore')
  @RequirePermissions('itinerary.edit')
  restore(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.itineraries.restore(user, tripId, versionId);
  }

  @Get('trips/:tripId/itinerary-versions/compare')
  @RequirePermissions('trip.read')
  compare(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Query('a') a: string,
    @Query('b') b: string,
  ) {
    return this.itineraries.compare(user.organizationId, tripId, a, b);
  }

  @Get('trips/:tripId/itinerary-preview')
  @RequirePermissions('trip.read')
  preview(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Query('versionId') versionId?: string,
  ) {
    return this.itineraries.getStaffPreview(user, tripId, versionId);
  }

  @Post('trips/:tripId/itinerary-shares')
  @RequirePermissions('itinerary.edit')
  createShare(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.itineraries.createShare(user, tripId, CreateItineraryShareSchema.parse(body ?? {}));
  }

  @Get('trips/:tripId/proposal-family')
  @RequirePermissions('trip.read')
  staffFamily(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.itineraries.getStaffFamily(user, tripId);
  }

  @Post('trips/:tripId/proposal-family/messages')
  @RequirePermissions('itinerary.edit')
  staffFamilyReply(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.itineraries.replyStaffFamily(
      user,
      tripId,
      ProposalFamilyAgencyReplySchema.parse(body ?? {}),
    );
  }

  @Public()
  @Get('public/itinerary/:token')
  publicPreview(@Param('token') token: string) {
    return this.itineraries.getPublicPreview(token);
  }

  @Public()
  @Post('public/itinerary/:token/accept-quote')
  publicAcceptQuote(@Param('token') token: string) {
    return this.itineraries.acceptPublicQuote(token);
  }

  @Public()
  @Get('public/itinerary/:token/family')
  publicFamily(
    @Param('token') token: string,
    @Query('viewerKey') viewerKey?: string,
    @Query('pin') pin?: string,
    @Req() req?: { ip?: string; headers?: Record<string, unknown> },
  ) {
    return this.itineraries.getPublicFamily(token, viewerKey, pin, clientKey(req));
  }

  @Public()
  @Post('public/itinerary/:token/family/join')
  publicFamilyJoin(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req?: { ip?: string; headers?: Record<string, unknown> },
  ) {
    return this.itineraries.joinPublicFamily(
      token,
      ProposalFamilyJoinSchema.parse(body ?? {}),
      clientKey(req),
    );
  }

  @Public()
  @Post('public/itinerary/:token/family/react')
  publicFamilyReact(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req?: { ip?: string; headers?: Record<string, unknown> },
  ) {
    return this.itineraries.reactPublicFamily(
      token,
      ProposalFamilyReactSchema.parse(body ?? {}),
      clientKey(req),
    );
  }

  @Public()
  @Post('public/itinerary/:token/family/messages')
  publicFamilyMessage(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req?: { ip?: string; headers?: Record<string, unknown> },
  ) {
    return this.itineraries.postPublicFamilyMessage(
      token,
      ProposalFamilyMessageSchema.parse(body ?? {}),
      clientKey(req),
    );
  }
}
