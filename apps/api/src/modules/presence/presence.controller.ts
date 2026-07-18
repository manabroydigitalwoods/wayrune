import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  ClonePresenceThemeSchema,
  CreatePresenceChildThemeSchema,
  CreatePresenceCollectionSchema,
  CreatePresenceMarketplaceListingSchema,
  CreatePresencePageFromTemplateSchema,
  CreatePresencePageSchema,
  CreatePresenceSiteFromTemplateSchema,
  CreatePresenceSiteFromThemeSchema,
  CreatePresenceSiteSchema,
  InstallPresenceMarketplaceListingSchema,
  ListPresenceCatalogReviewsQuerySchema,
  PresenceAdminSearchQuerySchema,
  PresenceAnalyticsEventSchema,
  PublishPresenceAssetVersionSchema,
  ReorderPresenceSectionsSchema,
  SavePageAsTemplateSchema,
  SavePresenceBuilderSchema,
  UpdatePresencePageSchema,
  UpdatePresenceSiteSchema,
  UpsertPresenceCatalogReviewSchema,
  UpsertPresenceCollectionEntrySchema,
  UpsertPresenceFormSchema,
  UpsertPresenceChatWidgetSchema,
  UpsertPresenceGlobalSectionSchema,
  UpsertPresenceModuleDefinitionSchema,
  UpsertPresencePageTemplateSchema,
  UpsertPresenceSectionSchema,
  UpsertPresenceSiteTemplateSchema,
  UpsertPresenceThemeSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { PresenceAuthoringService } from './presence-authoring.service';
import { PresenceContentService } from './presence-content.service';
import { PresencePublishService } from './presence-publish.service';
import { PresenceRegistryService } from './presence-registry.service';
import { PresenceRuntimeService } from './presence-runtime.service';
import { PresenceTemplateService } from './presence-template.service';
import { PresenceThemePackageService } from './presence-theme-package.service';

@Controller('presence')
@RequireAgencyOrg()
export class PresenceController {
  constructor(
    private registry: PresenceRegistryService,
    private authoring: PresenceAuthoringService,
    private templates: PresenceTemplateService,
    private publish: PresencePublishService,
    private runtime: PresenceRuntimeService,
    private themePackages: PresenceThemePackageService,
    private content: PresenceContentService,
  ) {}

  @Get('identity')
  @RequirePermissions('org.settings.read')
  identity(@CurrentUser() user: AuthUser) {
    return this.registry.identity(user.organizationId);
  }

  @Post('bootstrap')
  @RequirePermissions('org.settings.write')
  bootstrap(@CurrentUser() user: AuthUser) {
    return this.registry.bootstrapOrg(user.organizationId);
  }

  @Get('themes')
  @RequirePermissions('org.settings.read')
  themes(@CurrentUser() user: AuthUser) {
    return this.registry.listThemes(user.organizationId);
  }

  @Get('fonts')
  @RequirePermissions('org.settings.read')
  fonts(@Query('role') role?: string) {
    return this.registry.listFonts(role);
  }

  @Get('catalog-reviews')
  @RequirePermissions('org.settings.read')
  listCatalogReviews(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const parsed = ListPresenceCatalogReviewsQuerySchema.parse(query);
    return this.registry.listCatalogReviews(
      user.organizationId,
      user.sub,
      parsed.targetType,
      parsed.targetId,
    );
  }

  @Put('catalog-reviews')
  @RequirePermissions('org.settings.write')
  upsertCatalogReview(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.upsertCatalogReview(
      user.organizationId,
      user.sub,
      UpsertPresenceCatalogReviewSchema.parse(body),
    );
  }

  @Delete('catalog-reviews/:reviewId')
  @RequirePermissions('org.settings.write')
  deleteCatalogReview(
    @CurrentUser() user: AuthUser,
    @Param('reviewId') reviewId: string,
  ) {
    return this.registry.deleteCatalogReview(user.organizationId, user.sub, reviewId);
  }

  @Put('themes')
  @RequirePermissions('org.settings.write')
  upsertTheme(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.upsertTheme(
      user.organizationId,
      UpsertPresenceThemeSchema.parse(body),
    );
  }

  /** Live HTML preview of a theme’s starter site (catalog “Preview site”). */
  @Get('themes/:themeId/preview')
  @RequirePermissions('org.settings.read')
  async previewThemeStarter(
    @CurrentUser() user: AuthUser,
    @Param('themeId') themeId: string,
    @Query('path') path: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.runtime.renderThemeStarterPreview({
      organizationId: user.organizationId,
      themeId,
      path,
    });
    res.status(result.status).type('html').send(result.html);
  }

  @Post('themes/:themeId/clone')
  @RequirePermissions('org.settings.write')
  cloneTheme(
    @CurrentUser() user: AuthUser,
    @Param('themeId') themeId: string,
    @Body() body: unknown,
  ) {
    return this.registry.cloneTheme(
      user.organizationId,
      themeId,
      ClonePresenceThemeSchema.parse(body ?? {}),
    );
  }

  @Post('themes/:themeId/create-child')
  @RequirePermissions('org.settings.write')
  createChildTheme(
    @CurrentUser() user: AuthUser,
    @Param('themeId') themeId: string,
    @Body() body: unknown,
  ) {
    return this.registry.createChildTheme(
      user.organizationId,
      themeId,
      CreatePresenceChildThemeSchema.parse(body ?? {}),
    );
  }

  /** Upload a built theme package ZIP (look + optional components/ + site/). */
  @Post('themes/upload-package')
  @RequirePermissions('org.settings.write')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadThemePackage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      siteName?: string;
      confirmReplace?: string | boolean;
      onConflict?: string;
    },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('ZIP file is required (field name: file)');
    }
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.zip') && file.mimetype !== 'application/zip' && file.mimetype !== 'application/x-zip-compressed') {
      throw new BadRequestException('Upload must be a .zip file');
    }
    const confirmRaw = body?.confirmReplace;
    const confirmReplace =
      confirmRaw === true ||
      confirmRaw === 'true' ||
      confirmRaw === '1' ||
      confirmRaw === 'yes';
    const onConflictRaw = typeof body?.onConflict === 'string' ? body.onConflict : 'overwrite';
    const onConflict =
      onConflictRaw === 'suffix' ? ('suffix' as const) : ('overwrite' as const);
    return this.themePackages.installFromZip({
      organizationId: user.organizationId,
      userId: user.sub,
      buffer: file.buffer,
      siteName: typeof body?.siteName === 'string' ? body.siteName : undefined,
      confirmReplace,
      onConflict,
    });
  }

  @Post('themes/:themeId/export')
  @RequirePermissions('org.settings.read')
  async exportThemePackage(
    @CurrentUser() user: AuthUser,
    @Param('themeId') themeId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.themePackages.exportToZip(user.organizationId, themeId);
    const theme = await this.registry.getThemeMeta(user.organizationId, themeId);
    const filename = `${(theme?.key || 'theme').replace(/[^a-z0-9-_]/gi, '_')}.zip`;
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }

  @Delete('themes/:themeId')
  @RequirePermissions('org.settings.write')
  deleteTheme(@CurrentUser() user: AuthUser, @Param('themeId') themeId: string) {
    return this.registry.deleteTheme(user.organizationId, themeId);
  }

  /** Upload a built component package ZIP (component.json + HTML/CSS/JS). */
  @Post('modules/upload-package')
  @RequirePermissions('org.settings.write')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadModulePackage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('ZIP file is required (field name: file)');
    }
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.zip') && file.mimetype !== 'application/zip' && file.mimetype !== 'application/x-zip-compressed') {
      throw new BadRequestException('Upload must be a .zip file');
    }
    return this.themePackages.installComponentFromZip({
      organizationId: user.organizationId,
      userId: user.sub,
      buffer: file.buffer,
    });
  }

  /** Export the site as a full theme ZIP (look + used components + pages). */
  @Post('sites/:siteId/export-theme')
  @RequirePermissions('org.settings.read')
  async exportSiteAsTheme(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.themePackages.exportSiteAsFullTheme(user.organizationId, siteId);
    const filename = `theme-site-${siteId.slice(0, 8)}.zip`;
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }

  @Get('modules')
  @RequirePermissions('org.settings.read')
  modules(@CurrentUser() user: AuthUser) {
    return this.registry.listModuleDefinitions(user.organizationId);
  }

  @Put('modules')
  @RequirePermissions('org.settings.write')
  upsertModule(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.upsertModuleDefinition(
      user.organizationId,
      UpsertPresenceModuleDefinitionSchema.parse(body),
    );
  }

  @Delete('modules/:moduleId')
  @RequirePermissions('org.settings.write')
  deleteModule(@CurrentUser() user: AuthUser, @Param('moduleId') moduleId: string) {
    return this.registry.deleteModuleDefinition(user.organizationId, moduleId);
  }

  @Get('site-templates')
  @RequirePermissions('org.settings.read')
  siteTemplates(@CurrentUser() user: AuthUser) {
    return this.registry.listSiteTemplates(user.organizationId);
  }

  @Put('site-templates')
  @RequirePermissions('org.settings.write')
  upsertSiteTemplate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.upsertSiteTemplate(
      user.organizationId,
      UpsertPresenceSiteTemplateSchema.parse(body),
    );
  }

  @Get('page-templates')
  @RequirePermissions('org.settings.read')
  pageTemplates(@CurrentUser() user: AuthUser) {
    return this.registry.listPageTemplates(user.organizationId);
  }

  @Put('page-templates')
  @RequirePermissions('org.settings.write')
  upsertPageTemplate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.upsertPageTemplate(
      user.organizationId,
      UpsertPresencePageTemplateSchema.parse(body),
    );
  }

  @Get('sites')
  @RequirePermissions('org.settings.read')
  listSites(@CurrentUser() user: AuthUser) {
    return this.authoring.listSites(user.organizationId);
  }

  @Post('sites')
  @RequirePermissions('org.settings.write')
  createSite(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.authoring.createSite(user.organizationId, CreatePresenceSiteSchema.parse(body));
  }

  @Post('sites/from-template')
  @RequirePermissions('org.settings.write')
  createSiteFromTemplate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.templates.createSiteFromTemplate(
      user.organizationId,
      CreatePresenceSiteFromTemplateSchema.parse(body),
    );
  }

  /** Create a site from a theme's built-in full-site structure. */
  @Post('sites/from-theme')
  @RequirePermissions('org.settings.write')
  createSiteFromTheme(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.templates.createSiteFromTheme(
      user.organizationId,
      CreatePresenceSiteFromThemeSchema.parse(body),
    );
  }

  @Get('sites/:siteId')
  @RequirePermissions('org.settings.read')
  getSite(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.authoring.getSite(user.organizationId, siteId);
  }

  @Patch('sites/:siteId')
  @RequirePermissions('org.settings.write')
  updateSite(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Body() body: unknown,
  ) {
    return this.authoring.updateSite(
      user.organizationId,
      siteId,
      UpdatePresenceSiteSchema.parse(body),
    );
  }

  @Delete('sites/:siteId')
  @RequirePermissions('org.settings.write')
  deleteSite(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.authoring.deleteSite(user.organizationId, siteId);
  }

  @Post('sites/:siteId/publish')
  @RequirePermissions('org.settings.write')
  publishSite(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.publish.publishSite(user.organizationId, siteId, true, user.sub);
  }

  @Post('sites/:siteId/unpublish')
  @RequirePermissions('org.settings.write')
  unpublishSite(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.publish.publishSite(user.organizationId, siteId, false);
  }

  @Get('sites/:siteId/publish-versions')
  @RequirePermissions('org.settings.read')
  listPublishVersions(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.publish.listPublishVersions(user.organizationId, siteId);
  }

  @Post('sites/:siteId/publish-versions/:versionId/rollback')
  @RequirePermissions('org.settings.write')
  rollbackPublishVersion(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.publish.rollbackToVersion(user.organizationId, siteId, versionId);
  }

  @Get('sites/:siteId/global-sections')
  @RequirePermissions('org.settings.read')
  listGlobalSections(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.authoring.listGlobalSections(user.organizationId, siteId);
  }

  @Put('sites/:siteId/global-sections/:slotKey')
  @RequirePermissions('org.settings.write')
  upsertGlobalSection(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('slotKey') slotKey: string,
    @Body() body: unknown,
  ) {
    return this.authoring.upsertGlobalSection(
      user.organizationId,
      siteId,
      slotKey,
      UpsertPresenceGlobalSectionSchema.parse(body),
    );
  }

  @Delete('sites/:siteId/global-sections/:slotKey')
  @RequirePermissions('org.settings.write')
  deleteGlobalSection(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('slotKey') slotKey: string,
  ) {
    return this.authoring.deleteGlobalSection(user.organizationId, siteId, slotKey);
  }

  @Get('pages')
  @RequirePermissions('org.settings.read')
  listPages(@CurrentUser() user: AuthUser) {
    return this.authoring.listPages(user.organizationId);
  }

  @Post('sites/:siteId/pages')
  @RequirePermissions('org.settings.write')
  createPage(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Body() body: unknown,
  ) {
    return this.authoring.createPage(user.organizationId, siteId, CreatePresencePageSchema.parse(body));
  }

  @Post('pages/from-template')
  @RequirePermissions('org.settings.write')
  createPageFromTemplate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.templates.createPageFromTemplate(
      user.organizationId,
      CreatePresencePageFromTemplateSchema.parse(body),
    );
  }

  @Get('pages/:pageId')
  @RequirePermissions('org.settings.read')
  getPage(@CurrentUser() user: AuthUser, @Param('pageId') pageId: string) {
    return this.authoring.getPage(user.organizationId, pageId);
  }

  @Patch('pages/:pageId')
  @RequirePermissions('org.settings.write')
  updatePage(
    @CurrentUser() user: AuthUser,
    @Param('pageId') pageId: string,
    @Body() body: unknown,
  ) {
    return this.authoring.updatePage(
      user.organizationId,
      pageId,
      UpdatePresencePageSchema.parse(body),
    );
  }

  @Post('pages/:pageId/duplicate')
  @RequirePermissions('org.settings.write')
  duplicatePage(@CurrentUser() user: AuthUser, @Param('pageId') pageId: string) {
    return this.authoring.duplicatePage(user.organizationId, pageId);
  }

  @Post('pages/:pageId/publish')
  @RequirePermissions('org.settings.write')
  publishPage(@CurrentUser() user: AuthUser, @Param('pageId') pageId: string) {
    return this.publish.publishPage(user.organizationId, pageId, true);
  }

  @Post('pages/:pageId/unpublish')
  @RequirePermissions('org.settings.write')
  unpublishPage(@CurrentUser() user: AuthUser, @Param('pageId') pageId: string) {
    return this.publish.publishPage(user.organizationId, pageId, false);
  }

  @Put('pages/:pageId/builder')
  @RequirePermissions('org.settings.write')
  saveBuilder(
    @CurrentUser() user: AuthUser,
    @Param('pageId') pageId: string,
    @Body() body: unknown,
  ) {
    return this.authoring.saveBuilder(
      user.organizationId,
      pageId,
      SavePresenceBuilderSchema.parse(body),
    );
  }

  @Post('pages/:pageId/save-as-template')
  @RequirePermissions('org.settings.write')
  savePageAsTemplate(
    @CurrentUser() user: AuthUser,
    @Param('pageId') pageId: string,
    @Body() body: unknown,
  ) {
    return this.authoring.savePageAsTemplate(
      user.organizationId,
      pageId,
      SavePageAsTemplateSchema.parse(body),
    );
  }

  @Delete('pages/:pageId')
  @RequirePermissions('org.settings.write')
  deletePage(@CurrentUser() user: AuthUser, @Param('pageId') pageId: string) {
    return this.authoring.deletePage(user.organizationId, pageId);
  }

  @Post('pages/:pageId/sections')
  @RequirePermissions('org.settings.write')
  addSection(
    @CurrentUser() user: AuthUser,
    @Param('pageId') pageId: string,
    @Body() body: unknown,
  ) {
    return this.authoring.addSection(
      user.organizationId,
      pageId,
      UpsertPresenceSectionSchema.parse(body),
    );
  }

  @Put('pages/:pageId/sections/reorder')
  @RequirePermissions('org.settings.write')
  reorderSections(
    @CurrentUser() user: AuthUser,
    @Param('pageId') pageId: string,
    @Body() body: unknown,
  ) {
    const { orderedIds } = ReorderPresenceSectionsSchema.parse(body);
    return this.authoring.reorderSections(user.organizationId, pageId, orderedIds);
  }

  @Patch('sections/:sectionId')
  @RequirePermissions('org.settings.write')
  updateSection(
    @CurrentUser() user: AuthUser,
    @Param('sectionId') sectionId: string,
    @Body() body: unknown,
  ) {
    return this.authoring.updateSection(
      user.organizationId,
      sectionId,
      UpsertPresenceSectionSchema.parse(body),
    );
  }

  @Delete('sections/:sectionId')
  @RequirePermissions('org.settings.write')
  deleteSection(@CurrentUser() user: AuthUser, @Param('sectionId') sectionId: string) {
    return this.authoring.deleteSection(user.organizationId, sectionId);
  }

  @Get('forms')
  @RequirePermissions('org.settings.read')
  listForms(@CurrentUser() user: AuthUser) {
    return this.registry.listForms(user.organizationId);
  }

  @Put('forms')
  @RequirePermissions('org.settings.write')
  upsertForm(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.upsertForm(user.organizationId, UpsertPresenceFormSchema.parse(body));
  }

  @Get('chat-widgets')
  @RequirePermissions('org.settings.read')
  listChatWidgets(@CurrentUser() user: AuthUser) {
    return this.registry.listChatWidgets(user.organizationId);
  }

  @Put('chat-widgets')
  @RequirePermissions('org.settings.write')
  upsertChatWidget(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.upsertChatWidget(
      user.organizationId,
      UpsertPresenceChatWidgetSchema.parse(body),
    );
  }

  @Delete('chat-widgets/:widgetId')
  @RequirePermissions('org.settings.write')
  deleteChatWidget(@CurrentUser() user: AuthUser, @Param('widgetId') widgetId: string) {
    return this.registry.deleteChatWidget(user.organizationId, widgetId);
  }

  @Get('versions/:assetType/:assetId')
  @RequirePermissions('org.settings.read')
  listAssetVersions(
    @CurrentUser() user: AuthUser,
    @Param('assetType') assetType: string,
    @Param('assetId') assetId: string,
  ) {
    return this.registry.listAssetVersions(user.organizationId, assetType, assetId);
  }

  @Post('versions/publish')
  @RequirePermissions('org.settings.write')
  publishAssetVersion(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.publishAssetVersion(
      user.organizationId,
      PublishPresenceAssetVersionSchema.parse(body),
    );
  }

  @Get('marketplace')
  @RequirePermissions('org.settings.read')
  listMarketplace() {
    return this.registry.listMarketplaceListings();
  }

  @Post('marketplace')
  @RequirePermissions('org.settings.write')
  createMarketplaceListing(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.createMarketplaceListing(
      user.organizationId,
      CreatePresenceMarketplaceListingSchema.parse(body),
    );
  }

  @Post('marketplace/install')
  @RequirePermissions('org.settings.write')
  installMarketplaceListing(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.registry.installMarketplaceListing(
      user.organizationId,
      user.sub,
      InstallPresenceMarketplaceListingSchema.parse(body),
    );
  }

  @Post('preview-module')
  @RequirePermissions('org.settings.read')
  previewModule(@Body() body: unknown) {
    const input = body as {
      rendererKey?: string;
      propsJson?: Record<string, unknown>;
      templateSource?: string | null;
      moduleSource?: string | null;
      themeTokens?: Record<string, unknown>;
    };
    return this.runtime.renderModulePreview({
      rendererKey: String(input.rendererKey || 'liquid'),
      propsJson: input.propsJson,
      templateSource: input.templateSource,
      moduleSource: input.moduleSource,
      themeTokens: input.themeTokens,
    });
  }

  @Get('command-search')
  @RequirePermissions('org.settings.read')
  commandSearch(
    @CurrentUser() user: AuthUser,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = PresenceAdminSearchQuerySchema.safeParse({
      q: q || '',
      limit: limit ? Number(limit) : undefined,
    });
    if (!parsed.success) return { results: [] };
    return this.content.adminSearch(user.organizationId, parsed.data.q, parsed.data.limit);
  }

  @Get('sites/:siteId/data-sources')
  @RequirePermissions('org.settings.read')
  listDataSources(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.content.listDataSources(user.organizationId, siteId);
  }

  @Get('sites/:siteId/collections')
  @RequirePermissions('org.settings.read')
  listCollections(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.content.listCollections(user.organizationId, siteId);
  }

  @Post('sites/:siteId/collections')
  @RequirePermissions('org.settings.write')
  createCollection(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Body() body: unknown,
  ) {
    return this.content.createCollection(
      user.organizationId,
      siteId,
      CreatePresenceCollectionSchema.parse(body),
    );
  }

  @Delete('sites/:siteId/collections/:collectionId')
  @RequirePermissions('org.settings.write')
  deleteCollection(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
  ) {
    return this.content.deleteCollection(user.organizationId, siteId, collectionId);
  }

  @Get('sites/:siteId/collections/:collectionId/entries')
  @RequirePermissions('org.settings.read')
  listEntries(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
  ) {
    return this.content.listEntries(user.organizationId, siteId, collectionId);
  }

  @Post('sites/:siteId/collections/:collectionId/entries')
  @RequirePermissions('org.settings.write')
  createEntry(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Body() body: unknown,
  ) {
    return this.content.upsertEntry(
      user.organizationId,
      siteId,
      collectionId,
      UpsertPresenceCollectionEntrySchema.parse(body),
    );
  }

  @Patch('sites/:siteId/collections/:collectionId/entries/:entryId')
  @RequirePermissions('org.settings.write')
  updateEntry(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Param('entryId') entryId: string,
    @Body() body: unknown,
  ) {
    return this.content.upsertEntry(
      user.organizationId,
      siteId,
      collectionId,
      UpsertPresenceCollectionEntrySchema.parse(body),
      entryId,
    );
  }

  @Delete('sites/:siteId/collections/:collectionId/entries/:entryId')
  @RequirePermissions('org.settings.write')
  deleteEntry(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.content.deleteEntry(user.organizationId, siteId, collectionId, entryId);
  }

  @Get('sites/:siteId/analytics')
  @RequirePermissions('org.settings.read')
  analyticsSummary(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.content.analyticsSummary(user.organizationId, siteId);
  }

  @Post('sites/:siteId/analytics/events')
  @RequirePermissions('org.settings.write')
  trackAnalytics(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Body() body: unknown,
  ) {
    return this.content.trackEvent(
      user.organizationId,
      PresenceAnalyticsEventSchema.parse({ ...((body as object) || {}), siteId }),
    );
  }
}
