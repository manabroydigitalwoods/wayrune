import { Controller, Get } from '@nestjs/common';
import { CurrentUser, RequireAgencyOrg, type AuthUser } from '../../common/helpers';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@RequireAgencyOrg()
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('sales')
  sales(@CurrentUser() user: AuthUser) {
    return this.dashboard.sales(user);
  }

  @Get('claim-gates')
  claimGates(@CurrentUser() user: AuthUser) {
    return this.dashboard.claimGates(user);
  }
}
