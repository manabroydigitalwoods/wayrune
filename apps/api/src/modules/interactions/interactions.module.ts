import { Module, forwardRef } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';
import { EngagementAutomationService } from './engagement-automation.service';

@Module({
  imports: [forwardRef(() => TasksModule)],
  controllers: [InteractionsController],
  providers: [InteractionsService, EngagementAutomationService],
  exports: [InteractionsService],
})
export class InteractionsModule {}
