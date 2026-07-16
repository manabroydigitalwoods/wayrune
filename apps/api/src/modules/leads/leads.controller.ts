import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AssignLeadSchema,
  CreateLeadActivitySchema,
  CreateLeadSchema,
  PaginationQuerySchema,
  ReplyEmailSchema,
  ReplyInstagramSchema,
  ReplyWhatsappSchema,
  ReplyWhatsappTemplateSchema,
  UpdateLeadActivitySchema,
  UpdateLeadSchema,
  UpdateLeadStageSchema,
  WebhookLeadSchema,
  WidgetIngestSchema,
} from '@travel/contracts';
import {
  CurrentUser,
  Public,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { LeadsService } from './leads.service';

@Controller('leads')
@RequireAgencyOrg()
export class LeadsController {
  constructor(private leads: LeadsService) {}

  @Post()
  @RequirePermissions('lead.write')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.leads.create(user, CreateLeadSchema.parse(body));
  }

  @Get()
  @RequirePermissions('lead.read', 'lead.read.own')
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = PaginationQuerySchema.parse(query);
    const extra = query as { stageKey?: string; priority?: string };
    return this.leads.list(user, q.page, q.pageSize, extra.stageKey, q.q, extra.priority);
  }

  @Get('board')
  @RequirePermissions('lead.read', 'lead.read.own')
  board(@CurrentUser() user: AuthUser, @Query('pageSize') pageSize?: string) {
    const size = Math.min(50, Math.max(5, Number(pageSize) || 10));
    return this.leads.pipelineBoard(user, size);
  }

  @Get('reports/summary')
  @RequirePermissions('report.sales.read')
  report(@CurrentUser() user: AuthUser) {
    return this.leads.reportBySource(user);
  }

  @Get(':id')
  @RequirePermissions('lead.read', 'lead.read.own')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('lead.write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leads.update(user, id, UpdateLeadSchema.parse(body));
  }

  @Post(':id/activities')
  @RequirePermissions('lead.write')
  addActivity(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leads.addActivity(user, id, CreateLeadActivitySchema.parse(body));
  }

  @Patch(':id/activities/:activityId')
  @RequirePermissions('lead.write')
  updateActivity(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() body: unknown,
  ) {
    return this.leads.updateActivity(user, id, activityId, UpdateLeadActivitySchema.parse(body));
  }

  @Post(':id/stage')
  @RequirePermissions('lead.write')
  stage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const data = UpdateLeadStageSchema.parse(body);
    return this.leads.updateStage(user, id, data.stageKey, data.note, data.lostReason);
  }

  @Post(':id/assign')
  @RequirePermissions('lead.assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const data = AssignLeadSchema.parse(body);
    return this.leads.assign(user, id, data.ownerId);
  }

  @Post(':id/convert-to-client')
  @RequirePermissions('lead.write')
  convertToClient(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.convertToClient(user, id);
  }

  @Post(':id/merge')
  @RequirePermissions('lead.write')
  merge(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { secondaryId: string }) {
    return this.leads.merge(user, id, body.secondaryId);
  }

  @Post('import/csv')
  @RequirePermissions('lead.write')
  importCsv(
    @CurrentUser() user: AuthUser,
    @Body() body: { rows: Array<{ title: string; email?: string; phone?: string; contactName?: string }> },
  ) {
    return this.leads.importCsv(user, body.rows ?? []);
  }

  @Post('whatsapp/reply/:interactionId')
  @RequirePermissions('lead.write')
  whatsappReply(
    @CurrentUser() user: AuthUser,
    @Param('interactionId') interactionId: string,
    @Body() body: unknown,
  ) {
    return this.leads.replyWhatsapp(user, interactionId, ReplyWhatsappSchema.parse(body));
  }

  @Post('whatsapp/reply-template/:interactionId')
  @RequirePermissions('lead.write')
  whatsappReplyTemplate(
    @CurrentUser() user: AuthUser,
    @Param('interactionId') interactionId: string,
    @Body() body: unknown,
  ) {
    return this.leads.replyWhatsappTemplate(
      user,
      interactionId,
      ReplyWhatsappTemplateSchema.parse(body),
    );
  }

  @Post('email/reply/:interactionId')
  @RequirePermissions('lead.write')
  emailReply(
    @CurrentUser() user: AuthUser,
    @Param('interactionId') interactionId: string,
    @Body() body: unknown,
  ) {
    return this.leads.replyEmail(user, interactionId, ReplyEmailSchema.parse(body));
  }

  @Post('instagram/reply/:interactionId')
  @RequirePermissions('lead.write')
  instagramReply(
    @CurrentUser() user: AuthUser,
    @Param('interactionId') interactionId: string,
    @Body() body: unknown,
  ) {
    return this.leads.replyInstagram(user, interactionId, ReplyInstagramSchema.parse(body));
  }

  @Public()
  @Post('ingest/webhook/:organizationId')
  webhook(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Headers('x-webhook-ingest-token') sharedSecret: string | undefined,
  ) {
    return this.leads.ingestWebhook(organizationId, WebhookLeadSchema.parse(body), {
      sharedSecretHeader: sharedSecret,
    });
  }

  @Public()
  @Get('ingest/whatsapp/:organizationId')
  async whatsappVerify(
    @Param('organizationId') organizationId: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const text = await this.leads.verifyWhatsappWebhook(organizationId, {
      mode,
      verify_token: verifyToken,
      challenge,
    });
    res.status(200).send(text);
  }

  @Public()
  @Post('ingest/whatsapp/:organizationId')
  whatsappReceive(
    @Param('organizationId') organizationId: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: unknown,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ) {
    return this.leads.ingestWhatsappWebhook(organizationId, body, {
      signatureHeader: signature,
      rawBody: req.rawBody,
    });
  }

  @Public()
  @Get('ingest/facebook/:organizationId')
  async facebookVerify(
    @Param('organizationId') organizationId: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const text = await this.leads.verifyFacebookWebhook(organizationId, {
      mode,
      verify_token: verifyToken,
      challenge,
    });
    res.status(200).send(text);
  }

  @Public()
  @Post('ingest/facebook/:organizationId')
  facebookReceive(
    @Param('organizationId') organizationId: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: unknown,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ) {
    return this.leads.ingestFacebookWebhook(organizationId, body, {
      signatureHeader: signature,
      rawBody: req.rawBody,
    });
  }

  @Public()
  @Post('ingest/email/:organizationId')
  emailReceive(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Headers('x-email-ingest-token') sharedSecret: string | undefined,
  ) {
    return this.leads.ingestEmailWebhook(organizationId, body, {
      sharedSecretHeader: sharedSecret,
    });
  }

  @Public()
  @Get('ingest/instagram/:organizationId')
  async instagramVerify(
    @Param('organizationId') organizationId: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const text = await this.leads.verifyInstagramWebhook(organizationId, {
      mode,
      verify_token: verifyToken,
      challenge,
    });
    res.status(200).send(text);
  }

  @Public()
  @Post('ingest/instagram/:organizationId')
  instagramReceive(
    @Param('organizationId') organizationId: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: unknown,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ) {
    return this.leads.ingestInstagramWebhook(organizationId, body, {
      signatureHeader: signature,
      rawBody: req.rawBody,
    });
  }

  /** Conversation widget config (public). */
  @Public()
  @Get('widget/:organizationId/config')
  widgetConfig(
    @Param('organizationId') organizationId: string,
    @Query('publicKey') publicKey: string | undefined,
  ) {
    return this.leads.widgetConfig(organizationId, publicKey);
  }

  /** Conversation widget ingest — Interaction-first (never creates Lead). */
  @Public()
  @Post('widget/ingest')
  widgetIngest(@Body() body: unknown) {
    return this.leads.ingestWidget(WidgetIngestSchema.parse(body));
  }

  /**
   * HubSpot inbound webhook — Interaction only (never creates Lead/Inquiry/Trip).
   * Configure HubSpot workflow webhook to POST contact payloads here.
   */
  @Public()
  @Post('ingest/hubspot/:organizationId')
  hubspotInbound(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Headers('x-hubspot-ingest-token') sharedSecret: string | undefined,
  ) {
    return this.leads.ingestHubspotInbound(organizationId, body, {
      sharedSecretHeader: sharedSecret,
    });
  }
}
