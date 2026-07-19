import { Module, forwardRef } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { FilesModule } from '../files/files.module';
import { LeadsModule } from '../leads/leads.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GoogleModule } from '../google/google.module';
import { MessagingModule } from '../messaging/messaging.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { OperationsModule } from '../operations/operations.module';
import { TripsModule } from '../trips/trips.module';
import { RatesModule } from '../rates/rates.module';

@Module({
  imports: [
    TripsModule,
    RatesModule,
    FilesModule,
    LeadsModule,
    NotificationsModule,
    MessagingModule,
    OperationsModule,
    forwardRef(() => InteractionsModule),
    forwardRef(() => GoogleModule),
  ],
  controllers: [QuotationsController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
