import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreatePartnerAssetSchema, UpdatePartnerAssetSchema } from '@wayrune/contracts';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { PartnerAssetsService } from './partner-assets.service';

@Controller('partner-assets')
export class PartnerAssetsController {
  constructor(private partnerAssets: PartnerAssetsService) {}

  @Get()
  @RequirePermissions('network.read', 'org.settings.read')
  list(@CurrentUser() user: AuthUser) {
    return this.partnerAssets.list(user);
  }

  @Get(':id')
  @RequirePermissions('network.read', 'org.settings.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.partnerAssets.get(user, id);
  }

  @Post()
  @RequirePermissions('network.write', 'org.settings.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.partnerAssets.create(user, CreatePartnerAssetSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermissions('network.write', 'org.settings.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.partnerAssets.update(user, id, UpdatePartnerAssetSchema.parse(body));
  }

  @Delete(':id')
  @RequirePermissions('network.write', 'org.settings.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.partnerAssets.softDelete(user, id);
  }
}
