import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { AiController, AssistController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [PlacesModule],
  controllers: [AiController, AssistController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
