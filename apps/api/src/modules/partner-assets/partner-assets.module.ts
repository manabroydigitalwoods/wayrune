import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PartnerAssetsController } from './partner-assets.controller';
import { PartnerAssetsService } from './partner-assets.service';

@Module({
  imports: [AuditModule],
  controllers: [PartnerAssetsController],
  providers: [PartnerAssetsService],
  exports: [PartnerAssetsService],
})
export class PartnerAssetsModule {}
