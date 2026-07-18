import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrgIdentityService } from './org-identity.service';
import { PartnerAssetsModule } from '../partner-assets/partner-assets.module';

@Module({
  imports: [PartnerAssetsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrgIdentityService],
  exports: [OrganizationsService, OrgIdentityService],
})
export class OrganizationsModule {}
