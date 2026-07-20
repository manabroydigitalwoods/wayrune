import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApplyQuoteTemplateSchema,
  CloneQuotationSchema,
  CreateQuoteTemplateSchema,
  CreateTripFromPackageSchema,
  LockQuoteFxSchema,
  MarkQuoteSentSchema,
  RecordQuoteFitTimingSchema,
  RecordQuoteInventoryRiskAcksSchema,
  RecordQuoteMarginOverridesSchema,
  RecordQuoteRateDriftAcksSchema,
  RequestQuoteApprovalSchema,
  RenameQuoteTemplateFolderSchema,
  UpsertQuoteTemplateFolderSchema,
  RemoveQuoteTemplateFolderSchema,
  MoveQuoteTemplateFolderSchema,
  CascadeDeleteQuoteTemplateFolderSchema,
  ReorderQuoteTemplateSiblingsSchema,
  RestoreQuoteTemplateSchema,
  SaveQuotationVersionSchema,
  SendQuoteEmailSchema,
  SendQuoteWhatsappSchema,
  UpdateQuoteTemplateSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequireAllPermissions,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { QuotationsService } from './quotations.service';

@Controller()
@RequireAgencyOrg()
export class QuotationsController {
  constructor(private quotations: QuotationsService) {}

  @Get('quote-templates')
  @RequirePermissions('quote.read')
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.quotations.listTemplates(user);
  }

  @Post('quote-templates')
  @RequirePermissions('quote.write')
  createTemplate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.quotations.createTemplate(user, CreateQuoteTemplateSchema.parse(body));
  }

  @Patch('quote-templates/:id')
  @RequirePermissions('quote.write')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.quotations.updateTemplate(user, id, UpdateQuoteTemplateSchema.parse(body));
  }

  @Delete('quote-templates/:id')
  @RequirePermissions('quote.write')
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotations.deleteTemplate(user, id);
  }

  @Post('quote-templates/rename-folder')
  @RequirePermissions('quote.write')
  renameTemplateFolder(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.quotations.renameTemplateFolders(
      user,
      RenameQuoteTemplateFolderSchema.parse(body),
    );
  }

  @Post('quote-templates/folders')
  @RequirePermissions('quote.write')
  upsertTemplateFolder(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.quotations.upsertTemplateFolder(
      user,
      UpsertQuoteTemplateFolderSchema.parse(body),
    );
  }

  @Post('quote-templates/folders/remove')
  @RequirePermissions('quote.write')
  removeTemplateFolder(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.quotations.removeTemplateFolder(
      user,
      RemoveQuoteTemplateFolderSchema.parse(body),
    );
  }

  @Post('quote-templates/folders/cascade-delete')
  @RequirePermissions('quote.write')
  cascadeDeleteTemplateFolder(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    return this.quotations.cascadeDeleteTemplateFolder(
      user,
      CascadeDeleteQuoteTemplateFolderSchema.parse(body),
    );
  }

  @Post('quote-templates/reorder-siblings')
  @RequirePermissions('quote.write')
  reorderTemplateSiblings(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    return this.quotations.reorderTemplateSiblings(
      user,
      ReorderQuoteTemplateSiblingsSchema.parse(body),
    );
  }

  @Post('quote-templates/:id/move-folder')
  @RequirePermissions('quote.write')
  moveTemplateFolder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.quotations.moveTemplateFolder(
      user,
      id,
      MoveQuoteTemplateFolderSchema.parse(body),
    );
  }

  @Get('quote-templates/:id/versions')
  @RequirePermissions('quote.read')
  listTemplateVersions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotations.listTemplateVersions(user, id);
  }

  @Post('quote-templates/:id/restore')
  @RequirePermissions('quote.write')
  restoreTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.quotations.restoreTemplate(
      user,
      id,
      RestoreQuoteTemplateSchema.parse(body),
    );
  }

  @Post('trips/from-package')
  @RequireAllPermissions('trip.write', 'quote.write')
  createTripFromPackage(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.quotations.createTripFromPackage(
      user,
      CreateTripFromPackageSchema.parse(body),
    );
  }

  @Post('trips/:tripId/quotations')
  @RequirePermissions('quote.write')
  create(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.quotations.createQuotation(user, tripId);
  }

  @Post('trips/:tripId/quotations/from-accepted')
  @RequirePermissions('quote.write')
  createFromAccepted(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.quotations.createFromAccepted(user, tripId);
  }

  @Post('trips/:tripId/quotations/from-template')
  @RequirePermissions('quote.write')
  createFromTemplate(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.createFromTemplate(
      user,
      tripId,
      ApplyQuoteTemplateSchema.parse(body),
    );
  }

  @Post('trips/:tripId/quotations/:quotationId/clone')
  @RequirePermissions('quote.write')
  clone(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('quotationId') quotationId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.cloneQuotation(
      user,
      tripId,
      quotationId,
      CloneQuotationSchema.parse(body ?? {}),
    );
  }

  @Post('trips/:tripId/quotations/:quotationId/versions')
  @RequirePermissions('quote.write')
  saveVersion(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('quotationId') quotationId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.saveVersion(
      user,
      tripId,
      quotationId,
      SaveQuotationVersionSchema.parse(body),
    );
  }

  @Post('trips/:tripId/quotations/:quotationId/versions/autosave')
  @RequirePermissions('quote.write')
  autosave(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('quotationId') quotationId: string,
    @Body() body: unknown,
  ) {
    const parsed = SaveQuotationVersionSchema.parse(body);
    const versionId =
      body && typeof body === 'object' && 'versionId' in body
        ? ((body as { versionId?: string | null }).versionId ?? null)
        : null;
    return this.quotations.autosave(user, tripId, quotationId, {
      ...parsed,
      versionId,
    });
  }

  @Post('quotations/fit-timing')
  @RequirePermissions('quote.write')
  recordFitTiming(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.quotations.recordFitTiming(
      user,
      RecordQuoteFitTimingSchema.parse(body ?? {}),
    );
  }

  @Post('quotations/:versionId/fx/lock')
  @RequirePermissions('quote.write')
  lockFx(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.lockFx(
      user,
      versionId,
      LockQuoteFxSchema.parse(body ?? {}),
    );
  }

  @Post('quotations/:versionId/margin-overrides')
  @RequirePermissions('below_margin.approve')
  recordMarginOverrides(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.recordMarginOverrides(
      user,
      versionId,
      RecordQuoteMarginOverridesSchema.parse(body),
    );
  }

  @Post('quotations/:versionId/inventory-risk-acks')
  @RequirePermissions('inventory_risk.approve')
  recordInventoryRiskAcks(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.recordInventoryRiskAcks(
      user,
      versionId,
      RecordQuoteInventoryRiskAcksSchema.parse(body),
    );
  }

  @Post('quotations/:versionId/rate-drift-acks')
  @RequirePermissions('rate_drift.approve')
  recordRateDriftAcks(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.recordRateDriftAcks(
      user,
      versionId,
      RecordQuoteRateDriftAcksSchema.parse(body),
    );
  }

  @Post('quotations/:versionId/request-approval')
  @RequirePermissions('quote.write')
  requestApproval(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    const parsed = RequestQuoteApprovalSchema.parse(body ?? {});
    return this.quotations.transition(user, versionId, 'request_approval', {
      extendValidity: parsed.extendValidity === true,
    });
  }

  @Post('quotations/:versionId/approve')
  @RequirePermissions('quote.approve')
  approve(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string) {
    return this.quotations.transition(user, versionId, 'approve');
  }

  @Post('quotations/:versionId/accept')
  @RequirePermissions('quote.write')
  accept(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string) {
    return this.quotations.transition(user, versionId, 'accept');
  }

  @Post('quotations/:versionId/reject')
  @RequirePermissions('quote.approve')
  reject(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string) {
    return this.quotations.transition(user, versionId, 'reject');
  }

  @Post('quotations/:versionId/pdf')
  @RequirePermissions('quote.read')
  pdf(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string) {
    return this.quotations.generatePdf(user, versionId);
  }

  @Post('quotations/:versionId/send')
  @RequirePermissions('quote.write')
  send(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    const parsed = SendQuoteEmailSchema.parse(body ?? {});
    return this.quotations.sendEmail(user, versionId, parsed);
  }

  @Post('quotations/:versionId/send-whatsapp')
  @RequirePermissions('quote.write')
  sendWhatsapp(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.sendWhatsapp(
      user,
      versionId,
      SendQuoteWhatsappSchema.parse(body),
    );
  }

  @Post('quotations/:versionId/mark-sent')
  @RequirePermissions('quote.write')
  markSent(
    @CurrentUser() user: AuthUser,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.quotations.markSent(
      user,
      versionId,
      MarkQuoteSentSchema.parse(body ?? {}),
    );
  }

  @Post('quotations/:versionId/save-to-drive')
  @RequirePermissions('quote.write')
  saveToDrive(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string) {
    return this.quotations.savePdfToDrive(user, versionId);
  }
}
