import { Body, Controller, Param, Post } from '@nestjs/common';
import { SaveQuotationVersionSchema } from '@travel/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { QuotationsService } from './quotations.service';

@Controller()
@RequireAgencyOrg()
export class QuotationsController {
  constructor(private quotations: QuotationsService) {}

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

  @Post('quotations/:versionId/request-approval')
  @RequirePermissions('quote.write')
  requestApproval(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string) {
    return this.quotations.transition(user, versionId, 'request_approval');
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
    @Body() body: { toEmail: string },
  ) {
    return this.quotations.sendEmail(user, versionId, body.toEmail);
  }
}
