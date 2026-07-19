import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FilesModule } from '../files/files.module';
import { MessagingModule } from '../messaging/messaging.module';
import { DriverModule } from '../driver/driver.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [
    InventoryModule,
    NotificationsModule,
    FilesModule,
    MessagingModule,
    DriverModule,
  ],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
