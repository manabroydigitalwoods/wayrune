import { Controller, Get } from '@nestjs/common';
import { CONNECTOR_CAPABILITIES } from '@wayrune/contracts';
import { RequireAgencyOrg, RequirePermissions } from '../../common/helpers';

@Controller('connectors')
@RequireAgencyOrg()
export class ConnectorsController {
  @Get('capabilities')
  @RequirePermissions('lead.read', 'lead.read.own', 'inquiry.read')
  capabilities() {
    return { connectors: CONNECTOR_CAPABILITIES };
  }
}
