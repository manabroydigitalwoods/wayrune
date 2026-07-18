import { Module, forwardRef } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { FilesModule } from '../files/files.module';
import { LeadsModule } from '../leads/leads.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [FilesModule, LeadsModule, NotificationsModule, forwardRef(() => GoogleModule)],
  controllers: [QuotationsController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
