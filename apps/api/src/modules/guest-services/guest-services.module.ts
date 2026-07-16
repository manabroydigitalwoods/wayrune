import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { GuestServicesController } from './guest-services.controller';
import { GuestServicesService } from './guest-services.service';

@Module({
  imports: [InventoryModule, OutboxModule, NotificationsModule, FilesModule],
  controllers: [GuestServicesController],
  providers: [GuestServicesService],
  exports: [GuestServicesService],
})
export class GuestServicesModule {}
