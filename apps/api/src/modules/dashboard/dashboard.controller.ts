import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, RequireAgencyOrg, type AuthUser } from '../../common/helpers';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@RequireAgencyOrg()
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('sales')
  sales(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('windowDays') windowDays?: string,
  ) {
    const days =
      windowDays != null && windowDays !== '' ? Number(windowDays) : undefined;
    return this.dashboard.sales(user, {
      from: from?.trim() || null,
      to: to?.trim() || null,
      windowDays: days != null && Number.isFinite(days) ? days : undefined,
    });
  }

  @Get('claim-gates')
  claimGates(@CurrentUser() user: AuthUser) {
    return this.dashboard.claimGates(user);
  }
}
