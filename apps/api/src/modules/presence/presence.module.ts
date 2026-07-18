import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PresenceContentEngineService } from './content-engine/content-engine.service';
import { PresenceAuthoringService } from './presence-authoring.service';
import { PresenceContentService } from './presence-content.service';
import { PresenceController } from './presence.controller';
import { PresenceJsModuleService } from './presence-js-module.service';
import { PresenceLiquidService } from './presence-liquid.service';
import { PresencePublishService } from './presence-publish.service';
import { PresencePublicController } from './presence-public.controller';
import { PresenceRegistryService } from './presence-registry.service';
import { PresenceRuntimeService } from './presence-runtime.service';
import { PresenceTemplateService } from './presence-template.service';
import { PresenceThemePackageService } from './presence-theme-package.service';

@Module({
  imports: [OrganizationsModule, FilesModule],
  controllers: [PresenceController, PresencePublicController],
  providers: [
    PresenceRegistryService,
    PresenceAuthoringService,
    PresenceTemplateService,
    PresencePublishService,
    PresenceRuntimeService,
    PresenceLiquidService,
    PresenceJsModuleService,
    PresenceThemePackageService,
    PresenceContentEngineService,
    PresenceContentService,
  ],
  exports: [
    PresenceRegistryService,
    PresenceAuthoringService,
    PresenceTemplateService,
    PresencePublishService,
    PresenceRuntimeService,
    PresenceLiquidService,
    PresenceJsModuleService,
    PresenceThemePackageService,
    PresenceContentEngineService,
    PresenceContentService,
  ],
})
export class PresenceModule {}
