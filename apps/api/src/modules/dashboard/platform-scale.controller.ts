import { Controller, Get } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
  RequirePlatformOrg,
  type AuthUser,
} from '../../common/helpers';
import { DashboardService } from './dashboard.service';

/** Platform-only measured scale protocol (publish snapshot to web when ready). */
@Controller('platform/scale')
@RequirePlatformOrg()
export class PlatformScaleController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  @RequirePermissions('platform.catalog.read')
  scale(@CurrentUser() _user: AuthUser) {
    return this.dashboard.platformPublicScale();
  }
}
