import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { LeadsModule } from '../leads/leads.module';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TravelRequestsController } from './travel-requests.controller';
import { TravelRequestsService } from './travel-requests.service';

@Module({
  imports: [
    PartiesModule,
    LeadsModule,
    InquiriesModule,
    InteractionsModule,
    OrganizationsModule,
  ],
  controllers: [TravelRequestsController],
  providers: [TravelRequestsService],
})
export class TravelRequestsModule {}
