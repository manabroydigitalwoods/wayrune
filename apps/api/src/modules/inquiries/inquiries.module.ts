import { Module, forwardRef } from '@nestjs/common';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { TripsModule } from '../trips/trips.module';
import { LeadsModule } from '../leads/leads.module';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [TripsModule, LeadsModule, forwardRef(() => GoogleModule)],
  controllers: [InquiriesController],
  providers: [InquiriesService],
  exports: [InquiriesService],
})
export class InquiriesModule {}
