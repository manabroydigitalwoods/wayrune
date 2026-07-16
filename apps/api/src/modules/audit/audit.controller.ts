import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, RequirePermissions, type AuthUser } from '../../common/helpers';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.audit.list(user.organizationId, entityType, entityId);
  }
}
