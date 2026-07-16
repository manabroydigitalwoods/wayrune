import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadSourcesController } from './lead-sources.controller';
import { LeadsService } from './leads.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PartiesModule } from '../parties/parties.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { OutboxModule } from '../outbox/outbox.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    NotificationsModule,
    PartiesModule,
    InteractionsModule,
    OutboxModule,
    MessagingModule,
  ],
  controllers: [LeadsController, LeadSourcesController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
