import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
  CreateAdditionalOrganizationSchema,
  UpdateOrganizationSettingsSchema,
} from '@travel/contracts';
import { CurrentUser, RequirePermissions, type AuthUser } from '../../common/helpers';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private orgs: OrganizationsService) {}

  @Get('current')
  @RequirePermissions('org.settings.read')
  current(@CurrentUser() user: AuthUser) {
    return this.orgs.getSettings(user.organizationId);
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
  update(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.orgs.updateSettings(
      user.organizationId,
      UpdateOrganizationSettingsSchema.parse(body),
    );
  }
}
