import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { AuditService } from './audit.service';
import { isClientAuditAction } from './client-audit-actions';

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

  /** Thin allowlisted friction telemetry from the web app. */
  @Post('client-events')
  @RequirePermissions('quote.write', 'trip.write', 'org.settings.write')
  async clientEvent(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      action?: string;
      entityType?: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const action = typeof body?.action === 'string' ? body.action.trim() : '';
    if (!isClientAuditAction(action)) {
      throw new BadRequestException('Unknown client audit action');
    }
    return this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action,
      entityType:
        typeof body.entityType === 'string' && body.entityType.trim()
          ? body.entityType.trim()
          : 'client',
      entityId:
        typeof body.entityId === 'string' && body.entityId.trim()
          ? body.entityId.trim()
          : null,
      metadata: body.metadata && typeof body.metadata === 'object'
        ? body.metadata
        : undefined,
    });
  }
}
