import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  AcceptInviteSchema,
  AssignRoleSchema,
  CreateRoleSchema,
  InviteMemberSchema,
  SetPropertyScopesSchema,
  UpdateRoleSchema,
} from '@travel/contracts';
import { CurrentUser, Public, RequirePermissions, type AuthUser } from '../../common/helpers';
import { AccessService } from './access.service';

/**
 * Access administration (P2): custom roles, member role assignment, property
 * scope assignment, effective-access ("test this role") preview, and the
 * role/membership audit history. Every route requires `user.manage`; the
 * service layer enforces the no-escalation / owner-protection / org-kind
 * guardrails and audits + invalidates sessions on each mutation.
 */
@Controller('access')
@RequirePermissions('user.manage')
export class AccessController {
  constructor(private access: AccessService) {}

  @Get('roles')
  listRoles(@CurrentUser() user: AuthUser) {
    return this.access.listRoles(user);
  }

  @Get('permission-catalog')
  permissionCatalog(@CurrentUser() user: AuthUser) {
    return this.access.permissionCatalog(user);
  }

  @Post('roles')
  createRole(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.access.createRole(user, CreateRoleSchema.parse(body));
  }

  @Patch('roles/:id')
  updateRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.access.updateRole(user, id, UpdateRoleSchema.parse(body));
  }

  @Delete('roles/:id')
  deleteRole(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.access.deleteRole(user, id);
  }

  @Get('roles/:id/effective')
  roleEffective(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.access.roleEffective(user, id);
  }

  @Get('members')
  listMembers(@CurrentUser() user: AuthUser) {
    return this.access.listMembers(user);
  }

  @Get('properties')
  listProperties(@CurrentUser() user: AuthUser) {
    return this.access.listProperties(user);
  }

  @Get('members/:membershipId/effective')
  memberEffective(@CurrentUser() user: AuthUser, @Param('membershipId') membershipId: string) {
    return this.access.memberEffective(user, membershipId);
  }

  @Post('members/:membershipId/roles')
  assignRole(
    @CurrentUser() user: AuthUser,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ) {
    return this.access.assignRole(user, membershipId, AssignRoleSchema.parse(body));
  }

  @Delete('members/:membershipId/roles/:roleId')
  removeRole(
    @CurrentUser() user: AuthUser,
    @Param('membershipId') membershipId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.access.removeRole(user, membershipId, roleId);
  }

  @Put('members/:membershipId/property-scopes')
  setPropertyScopes(
    @CurrentUser() user: AuthUser,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ) {
    return this.access.setPropertyScopes(user, membershipId, SetPropertyScopesSchema.parse(body));
  }

  @Get('audit')
  auditHistory(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.access.auditHistory(user, entityType, entityId);
  }

  /* ------------------------------ invites ------------------------------- */

  @Get('invites')
  listInvites(@CurrentUser() user: AuthUser) {
    return this.access.listInvites(user);
  }

  @Post('invites')
  createInvite(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.access.createInvite(user, InviteMemberSchema.parse(body));
  }

  @Delete('invites/:id')
  revokeInvite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.access.revokeInvite(user, id);
  }

  // Public accept flow — token is the authorization. Method-level @Public()
  // overrides the class-level user.manage guard.
  @Public()
  @Get('invites/peek/:token')
  peekInvite(@Param('token') token: string) {
    return this.access.peekInvite(token);
  }

  @Public()
  @Post('invites/accept/:token')
  acceptInvite(@Param('token') token: string, @Body() body: unknown) {
    return this.access.acceptInvite(token, AcceptInviteSchema.parse(body));
  }
}
