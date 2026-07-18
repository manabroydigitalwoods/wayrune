import { Module, forwardRef } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { LeadsModule } from '../leads/leads.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { GoogleController } from './google.controller';
import { GoogleService } from './google.service';

@Module({
  imports: [
    forwardRef(() => LeadsModule),
    forwardRef(() => FilesModule),
    forwardRef(() => InteractionsModule),
    OrganizationsModule,
  ],
  controllers: [GoogleController],
  providers: [GoogleService],
  exports: [GoogleService],
})
export class GoogleModule {}
