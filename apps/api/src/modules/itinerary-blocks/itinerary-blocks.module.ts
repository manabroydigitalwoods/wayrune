import { Module } from '@nestjs/common';
import { ItineraryBlocksController } from './itinerary-blocks.controller';
import { ItineraryBlocksService } from './itinerary-blocks.service';

@Module({
  controllers: [ItineraryBlocksController],
  providers: [ItineraryBlocksService],
  exports: [ItineraryBlocksService],
})
export class ItineraryBlocksModule {}
