import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PlatformScaleController } from './platform-scale.controller';

@Module({
  controllers: [DashboardController, PlatformScaleController],
  providers: [DashboardService],
})
export class DashboardModule {}
