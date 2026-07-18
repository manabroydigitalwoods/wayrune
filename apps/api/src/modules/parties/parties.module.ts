import { Module, forwardRef } from '@nestjs/common';
import { PartiesController } from './parties.controller';
import { PartiesService } from './parties.service';
import { InteractionsModule } from '../interactions/interactions.module';

@Module({
  imports: [forwardRef(() => InteractionsModule)],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
