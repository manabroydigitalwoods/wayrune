import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { FinanceBalanceService } from './finance-balance.service';

@Module({
  imports: [AuditModule, OutboxModule, NotificationsModule],
  controllers: [CommerceController],
  providers: [CommerceService, FinanceBalanceService],
  exports: [CommerceService, FinanceBalanceService],
})
export class CommerceModule {}
