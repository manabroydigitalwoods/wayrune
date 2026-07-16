import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateCampaignSchema,
  CreateCustomFieldDefinitionSchema,
  CreateLeadSourceSchema,
  CreatePipelineSchema,
  CreatePipelineStageSchema,
  CreateWhatsAppTemplateSchema,
  UpdateCampaignSchema,
  UpdateCustomFieldDefinitionSchema,
  UpdateLeadSourceSchema,
  UpdatePipelineSchema,
  UpdateWhatsAppTemplateSchema,
} from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { LeadsService } from './leads.service';

@Controller()
@RequireAgencyOrg()
export class LeadSourcesController {
  constructor(private leads: LeadsService) {}

  @Get('lead-sources')
  @RequirePermissions('lead.read', 'lead.read.own', 'org.settings.read')
  listSources(
    @CurrentUser() user: AuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.leads.listLeadSources(
      user,
      includeInactive === '1' || includeInactive === 'true',
    );
  }

  @Post('lead-sources')
  @RequirePermissions('org.settings.write')
  createSource(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.leads.createLeadSource(user, CreateLeadSourceSchema.parse(body));
  }

  @Patch('lead-sources/:id')
  @RequirePermissions('org.settings.write')
  updateSource(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.leads.updateLeadSource(user, id, UpdateLeadSourceSchema.parse(body));
  }

  @Get('campaigns')
  @RequirePermissions('lead.read', 'lead.read.own')
  listCampaigns(@CurrentUser() user: AuthUser) {
    return this.leads.listCampaigns(user);
  }

  @Post('campaigns')
  @RequirePermissions('lead.write')
  createCampaign(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.leads.createCampaign(user, CreateCampaignSchema.parse(body));
  }

  @Patch('campaigns/:id')
  @RequirePermissions('lead.write')
  updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.leads.updateCampaign(user, id, UpdateCampaignSchema.parse(body));
  }

  @Get('whatsapp-templates')
  @RequirePermissions('lead.read', 'lead.read.own', 'org.settings.read')
  listWhatsAppTemplates(
    @CurrentUser() user: AuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.leads.listWhatsAppTemplates(
      user,
      includeInactive === '1' || includeInactive === 'true',
    );
  }

  @Post('whatsapp-templates')
  @RequirePermissions('org.settings.write')
  createWhatsAppTemplate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.leads.createWhatsAppTemplate(user, CreateWhatsAppTemplateSchema.parse(body));
  }

  @Patch('whatsapp-templates/:id')
  @RequirePermissions('org.settings.write')
  updateWhatsAppTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.leads.updateWhatsAppTemplate(user, id, UpdateWhatsAppTemplateSchema.parse(body));
  }

  @Get('pipelines')
  @RequirePermissions('lead.read', 'lead.read.own', 'org.settings.read')
  listPipelines(@CurrentUser() user: AuthUser) {
    return this.leads.listPipelines(user);
  }

  @Post('pipelines')
  @RequirePermissions('org.settings.write')
  createPipeline(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.leads.createPipeline(user, CreatePipelineSchema.parse(body));
  }

  @Patch('pipelines/:id')
  @RequirePermissions('org.settings.write')
  updatePipeline(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leads.updatePipeline(user, id, UpdatePipelineSchema.parse(body));
  }

  @Post('pipelines/:id/stages')
  @RequirePermissions('org.settings.write')
  addPipelineStage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.leads.addPipelineStage(user, id, CreatePipelineStageSchema.parse(body));
  }

  @Get('custom-fields')
  @RequirePermissions('lead.read', 'lead.read.own', 'org.settings.read')
  listCustomFields(@CurrentUser() user: AuthUser, @Query('entity') entity?: string) {
    return this.leads.listCustomFieldDefinitions(
      user,
      entity === 'lead' || entity === 'party' ? entity : undefined,
    );
  }

  @Post('custom-fields')
  @RequirePermissions('org.settings.write')
  createCustomField(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.leads.createCustomFieldDefinition(
      user,
      CreateCustomFieldDefinitionSchema.parse(body),
    );
  }

  @Patch('custom-fields/:id')
  @RequirePermissions('org.settings.write')
  updateCustomField(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.leads.updateCustomFieldDefinition(
      user,
      id,
      UpdateCustomFieldDefinitionSchema.parse(body),
    );
  }
}
