import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CreateAdditionalOrganizationSchema,
  UpdateOrganizationSettingsSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private orgs: OrganizationsService) {}

  @Get('current')
  @RequirePermissions('org.settings.read')
  current(@CurrentUser() user: AuthUser) {
    return this.orgs.getSettings(user.organizationId);
  }

  @Get('onboarding-status')
  @RequirePermissions('org.settings.read', 'trip.read')
  onboardingStatus(@CurrentUser() user: AuthUser) {
    return this.orgs.getOnboardingStatus(user.organizationId);
  }

  @Get('starter-packs')
  @RequireAgencyOrg()
  @RequirePermissions('org.settings.read', 'quote.write')
  listStarterPacks() {
    return this.orgs.listStarterPacks();
  }

  @Post('starter-packs/:packId/install')
  @RequireAgencyOrg()
  @RequirePermissions('quote.write', 'org.settings.write')
  installStarterPack(
    @CurrentUser() user: AuthUser,
    @Param('packId') packId: string,
  ) {
    return this.orgs.installStarterPack(user, packId);
  }

  @Get('current/members')
  @RequirePermissions('org.settings.read')
  members(@CurrentUser() user: AuthUser) {
    return this.orgs.listMembers(user.organizationId);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.orgs.listMembershipsForUser(user.sub);
  }

  @Post()
  createAdditional(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.orgs.createAdditionalOrganization(
      user,
      CreateAdditionalOrganizationSchema.parse(body),
    );
  }

  @Patch('current')
  @RequirePermissions('org.settings.write')
  update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.orgs.updateSettings(
      user.organizationId,
      UpdateOrganizationSettingsSchema.parse(body),
    );
  }

  @Post('current/fx/refresh')
  @RequirePermissions('org.settings.write')
  refreshFx(@CurrentUser() user: AuthUser) {
    return this.orgs.refreshFxRates(user.organizationId);
  }
}
