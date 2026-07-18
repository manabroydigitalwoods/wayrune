import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PresenceAnalyticsEventSchema,
  PresenceVisitorContextSchema,
} from '@wayrune/contracts';
import { Public } from '../../common/helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { PresenceContentService } from './presence-content.service';
import { PresenceRuntimeService } from './presence-runtime.service';

@Controller('presence/public')
export class PresencePublicController {
  constructor(
    private runtime: PresenceRuntimeService,
    private files: FilesService,
    private content: PresenceContentService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @Public()
  async render(
    @Headers('host') hostHeader: string | undefined,
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Query('path') path: string | undefined,
    @Query('host') hostOverride: string | undefined,
    @Query('preview') preview: string | undefined,
    @Query('country') country: string | undefined,
    @Query('device') device: string | undefined,
    @Query('utm_source') utmSource: string | undefined,
    @Query('utm_medium') utmMedium: string | undefined,
    @Query('utm_campaign') utmCampaign: string | undefined,
    @Query('variant') variantSeed: string | undefined,
    @Res() res: Response,
  ) {
    const host = (hostOverride || forwardedHost || hostHeader || '').trim();
    const visitor = PresenceVisitorContextSchema.safeParse({
      country,
      device,
      utmSource,
      utmMedium,
      utmCampaign,
      variantSeed,
    });
    const result = await this.runtime.renderPublicHtml({
      host,
      path: path || '/',
      preview: preview === '1' || preview === 'true',
      visitor: visitor.success ? visitor.data : undefined,
    });
    res.status(result.status).type('html').send(result.html);
  }

  @Post('events')
  @Public()
  async trackEvent(
    @Headers('host') hostHeader: string | undefined,
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Query('host') hostOverride: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = PresenceAnalyticsEventSchema.safeParse(body);
    if (!parsed.success) return { ok: false };
    const host = (hostOverride || forwardedHost || hostHeader || '')
      .trim()
      .split(':')[0]
      ?.toLowerCase() || '';
    let organizationId: string | null = null;
    if (host) {
      organizationId = await this.runtime.resolveOrganizationIdForPublicHost(host);
    }
    if (!organizationId) {
      const site = await this.prisma.presenceSite.findFirst({
        where: { id: parsed.data.siteId },
        select: { organizationId: true },
      });
      organizationId = site?.organizationId ?? null;
    }
    if (!organizationId) throw new NotFoundException('Site not found');
    await this.content.trackPublicEvent(parsed.data.siteId, organizationId, parsed.data);
    return { ok: true };
  }

  @Get('search')
  @Public()
  async publicSearch(
    @Headers('host') hostHeader: string | undefined,
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Query('host') hostOverride: string | undefined,
    @Query('q') q: string | undefined,
    @Query('siteId') siteId: string | undefined,
  ) {
    let resolvedSiteId = siteId;
    if (!resolvedSiteId) {
      const host = (hostOverride || forwardedHost || hostHeader || '')
        .trim()
        .split(':')[0]
        ?.toLowerCase() || '';
      if (host) {
        const orgId = await this.runtime.resolveOrganizationIdForPublicHost(host);
        if (orgId) {
          const site = await this.prisma.presenceSite.findFirst({
            where: { organizationId: orgId, status: 'published' },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            select: { id: true },
          });
          resolvedSiteId = site?.id;
        }
      }
    }
    if (!resolvedSiteId) throw new NotFoundException('Site not found');
    return this.content.publicSearch(resolvedSiteId, q || '');
  }

  /** Public image/media stream for presence sites (auth-free for published HTML). */
  @Get('media/:documentId')
  @Public()
  async media(
    @Param('documentId') documentId: string,
    @Query('host') hostOverride: string | undefined,
    @Headers('host') hostHeader: string | undefined,
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const host =
      (hostOverride || forwardedHost || hostHeader || '').trim().split(':')[0]?.toLowerCase() || '';
    if (!host) throw new NotFoundException('Host required');

    const organizationId = await this.runtime.resolveOrganizationIdForPublicHost(host);
    if (!organizationId) throw new NotFoundException('Site not found');

    const file = await this.files.publicPresenceMedia(organizationId, documentId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'public, max-age=86400',
    });
    return new StreamableFile(file.stream);
  }
}
