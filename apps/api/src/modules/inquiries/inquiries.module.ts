import { Module } from '@nestjs/common';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { TripsModule } from '../trips/trips.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [TripsModule, LeadsModule],
  controllers: [InquiriesController],
  providers: [InquiriesService],
  exports: [InquiriesService],
})
export class InquiriesModule {}
