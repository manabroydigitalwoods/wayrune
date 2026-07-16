import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommerceModule } from '../commerce/commerce.module';
import { InventoryModule } from '../inventory/inventory.module';
import { StayController } from './stay.controller';
import { StayService } from './stay.service';

@Module({
  imports: [AuditModule, InventoryModule, CommerceModule],
  controllers: [StayController],
  providers: [StayService],
  exports: [StayService],
})
export class StayModule {}
