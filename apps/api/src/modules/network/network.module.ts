import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OperationsModule } from '../operations/operations.module';
import { PartnerAssetsModule } from '../partner-assets/partner-assets.module';
import { StayModule } from '../stay/stay.module';
import { NetworkController } from './network.controller';
import { NetworkService } from './network.service';

@Module({
  imports: [
    AuditModule,
    PartnerAssetsModule,
    InventoryModule,
    StayModule,
    OperationsModule,
    FilesModule,
  ],
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
