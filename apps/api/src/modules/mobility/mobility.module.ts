import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { MobilityController } from './mobility.controller';
import { MobilityService } from './mobility.service';

@Module({
  imports: [OutboxModule],
  controllers: [MobilityController],
  providers: [MobilityService],
  exports: [MobilityService],
})
export class MobilityModule {}
