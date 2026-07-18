import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  BindGoogleLocationsSchema,
  GoogleBusinessIngestSchema,
  GoogleSheetsExportSchema,
  GoogleSheetsImportSchema,
  ReplyGoogleBusinessSchema,
  UpdateGoogleConnectionSettingsSchema,
} from '@wayrune/contracts';
import { loadEnv } from '@wayrune/config';
import {
  CurrentUser,
  Public,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { GoogleService } from './google.service';
import { OrgIdentityService } from '../organizations/org-identity.service';

@Controller('integrations/google')
export class GoogleController {
  constructor(
    private google: GoogleService,
    private orgIdentity: OrgIdentityService,
  ) {}

  @Get('connect')
  @RequireAgencyOrg()
  @RequirePermissions('org.settings.write')
  connect(@CurrentUser() user: AuthUser) {
    return this.google.buildConnectUrl(user);
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const env = loadEnv();
    const web = env.webOrigin.replace(/\/$/, '');
    if (error) {
      res.redirect(`${web}/settings/integrations?google=error&reason=${encodeURIComponent(error)}`);
      return;
    }
    try {
      await this.google.handleConnectCallback(code, state);
      res.redirect(`${web}/settings/integrations?google=connected`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'connect_failed';
      res.redirect(`${web}/settings/integrations?google=error&reason=${encodeURIComponent(msg)}`);
    }
  }

  @Get('status')
  @RequireAgencyOrg()
  @RequirePermissions('org.settings.read', 'org.settings.write')
  status(@CurrentUser() user: AuthUser) {
    return this.google.status(user);
  }

  @Post('disconnect')
  @RequireAgencyOrg()
  @RequirePermissions('org.settings.write')
  disconnect(@CurrentUser() user: AuthUser) {
    return this.google.disconnect(user);
  }

  @Patch('settings')
  @RequireAgencyOrg()
  @RequirePermissions('org.settings.write')
  updateSettings(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.google.updateSettings(user, UpdateGoogleConnectionSettingsSchema.parse(body));
  }

  @Get('locations')
  @RequireAgencyOrg()
  @RequirePermissions('org.settings.write')
  listLocations(@CurrentUser() user: AuthUser) {
    return this.google.listLocations(user);
  }

  @Post('locations')
  @RequireAgencyOrg()
  @RequirePermissions('org.settings.write')
  bindLocations(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.google.bindLocations(user, BindGoogleLocationsSchema.parse(body));
  }

  @Post('sync-reviews')
  @RequireAgencyOrg()
  @RequirePermissions('org.settings.write', 'lead.write')
  syncReviews(@CurrentUser() user: AuthUser) {
    return this.google.syncReviews(user);
  }

  /** Webhook / manual GBP ingest — Interaction-first. */
  @Post('ingest/:organizationId')
  @Public()
  async ingest(@Param('organizationId') organizationId: string, @Body() body: unknown) {
    const org = await this.orgIdentity.resolveRef(organizationId);
    return this.google.ingestBusinessTouch(
      org.id,
      GoogleBusinessIngestSchema.parse(body),
    );
  }

  @Post('interactions/:id/reply')
  @RequireAgencyOrg()
  @RequirePermissions('lead.write', 'inquiry.write')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = ReplyGoogleBusinessSchema.parse(body);
    return this.google.replyToBusinessInteraction(user, id, parsed.text);
  }

  @Post('drive/documents/:documentId')
  @RequireAgencyOrg()
  @RequirePermissions('document.write', 'quote.write')
  saveDoc(@CurrentUser() user: AuthUser, @Param('documentId') documentId: string) {
    return this.google.saveDocumentToDrive(user, documentId);
  }

  @Post('sheets/export-interactions')
  @RequireAgencyOrg()
  @RequirePermissions('report.sales.read', 'org.settings.write')
  exportSheet(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.google.exportInteractionsSheet(
      user,
      GoogleSheetsExportSchema.parse(body ?? {}),
    );
  }

  @Post('sheets/import-interactions')
  @RequireAgencyOrg()
  @RequirePermissions('lead.write', 'org.settings.write')
  importSheet(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.google.importInteractionsSheet(
      user,
      GoogleSheetsImportSchema.parse(body),
    );
  }
}
