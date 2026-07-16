import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  CreateGuestServiceRequestSchema,
  CreateServiceLocationSchema,
  CreateServiceOfferingSchema,
  GuestBookExperienceSchema,
  GuestOfferingRatingSchema,
  GuestPublicPayIntentSchema,
  GuestQrFeedbackSchema,
  GuestSessionPaySchema,
  OpenTableSessionSchema,
  PlaceGuestServiceOrderSchema,
  PutGuestMenuCategoriesSchema,
  PutGuestMenuConfigSchema,
  RenameGuestMenuCategorySchema,
  UpdateServiceLocationSchema,
  UpdateServiceOfferingSchema,
  UpdateServiceOrderStatusSchema,
  UpdateGuestServiceRequestStatusSchema,
} from '@travel/contracts';
import {
  CurrentUser,
  Public,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { assertRateLimit, clientKey } from '../../common/rate-limit';
import { GuestServicesService } from './guest-services.service';

@Controller()
export class GuestServicesController {
  constructor(private gs: GuestServicesService) {}

  // ── Public ──────────────────────────────────────────────────────────

  @Public()
  @Get('public/guest/:token')
  publicResolve(@Param('token') token: string) {
    return this.gs.publicResolve(token);
  }

  @Public()
  @Post('public/guest/:token/orders')
  publicPlaceOrder(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`gs-order:${clientKey(req)}`, 20, 60_000);
    return this.gs.publicPlaceOrder(
      token,
      PlaceGuestServiceOrderSchema.parse(body),
      clientKey(req),
    );
  }

  @Public()
  @Get('public/guest/:token/orders/:orderId')
  publicOrderStatus(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
  ) {
    return this.gs.publicOrderStatus(token, orderId);
  }

  @Public()
  @Post('public/guest/:token/requests')
  publicRequest(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`gs-req:${clientKey(req)}`, 15, 60_000);
    return this.gs.publicCreateRequest(
      token,
      CreateGuestServiceRequestSchema.parse(body),
    );
  }

  @Public()
  @Post('public/guest/:token/request-bill')
  publicRequestBill(
    @Param('token') token: string,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`gs-bill:${clientKey(req)}`, 10, 60_000);
    return this.gs.publicRequestBill(token);
  }

  @Public()
  @Get('public/guest/:token/bill')
  publicBill(@Param('token') token: string) {
    return this.gs.publicSessionBill(token);
  }

  @Public()
  @Post('public/guest/:token/pay-intent')
  publicPayIntent(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`gs-pay-intent:${clientKey(req)}`, 15, 60_000);
    return this.gs.publicPayIntent(token, GuestPublicPayIntentSchema.parse(body ?? {}));
  }

  @Public()
  @Post('public/guest/:token/ratings')
  publicRating(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`gs-rate:${clientKey(req)}`, 30, 60_000);
    return this.gs.publicRateOffering(
      token,
      GuestOfferingRatingSchema.parse(body),
      clientKey(req),
    );
  }

  @Public()
  @Post('public/guest/:token/feedback')
  publicFeedback(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`gs-feedback:${clientKey(req)}`, 8, 60_000);
    return this.gs.publicSubmitFeedback(token, GuestQrFeedbackSchema.parse(body));
  }

  @Public()
  @Get('public/guest/:token/experiences')
  publicExperiences(@Param('token') token: string) {
    return this.gs.publicListExperiences(token);
  }

  @Public()
  @Post('public/guest/:token/experiences/book')
  publicBookExperience(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`gs-xp:${clientKey(req)}`, 10, 60_000);
    return this.gs.publicBookExperience(token, GuestBookExperienceSchema.parse(body));
  }

  // ── Staff ───────────────────────────────────────────────────────────

  @Get('guest-services/assets/:assetId/locations')
  @RequirePermissions('ops.read', 'reservations.create')
  listLocations(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.gs.listLocations(user, assetId);
  }

  @Post('guest-services/locations')
  @RequirePermissions('ops.write', 'reservations.create')
  createLocation(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.gs.createLocation(user, CreateServiceLocationSchema.parse(body));
  }

  @Patch('guest-services/locations/:id')
  @RequirePermissions('ops.write', 'reservations.create')
  updateLocation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.gs.updateLocation(user, id, UpdateServiceLocationSchema.parse(body));
  }

  @Post('guest-services/locations/:id/regenerate-token')
  @RequirePermissions('ops.write', 'reservations.create')
  regenerate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gs.regenerateToken(user, id);
  }

  @Get('guest-services/assets/:assetId/menu-categories')
  @RequirePermissions('ops.read', 'reservations.create')
  listMenuCategories(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.gs.listMenuCategories(user, assetId);
  }

  @Put('guest-services/assets/:assetId/menu-categories')
  @RequirePermissions('ops.write', 'reservations.create')
  putMenuCategories(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
  ) {
    return this.gs.putMenuCategories(
      user,
      assetId,
      PutGuestMenuCategoriesSchema.parse(body),
    );
  }

  @Post('guest-services/assets/:assetId/menu-categories/rename')
  @RequirePermissions('ops.write', 'reservations.create')
  renameMenuCategory(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
  ) {
    return this.gs.renameMenuCategory(
      user,
      assetId,
      RenameGuestMenuCategorySchema.parse(body),
    );
  }

  @Get('guest-services/assets/:assetId/guest-menu')
  @RequirePermissions('ops.read', 'reservations.create')
  getGuestMenu(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.gs.getGuestMenuConfig(user, assetId);
  }

  @Put('guest-services/assets/:assetId/guest-menu')
  @RequirePermissions('ops.write', 'reservations.create')
  putGuestMenu(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
  ) {
    return this.gs.putGuestMenuConfig(
      user,
      assetId,
      PutGuestMenuConfigSchema.parse(body),
    );
  }

  @Get('guest-services/assets/:assetId/offerings')
  @RequirePermissions('ops.read', 'reservations.create')
  listOfferings(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.gs.listOfferings(user, assetId);
  }

  @Post('guest-services/offerings')
  @RequirePermissions('ops.write', 'reservations.create')
  createOffering(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.gs.createOffering(user, CreateServiceOfferingSchema.parse(body));
  }

  @Patch('guest-services/offerings/:id')
  @RequirePermissions('ops.write', 'reservations.create')
  updateOffering(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.gs.updateOffering(user, id, UpdateServiceOfferingSchema.parse(body));
  }

  @Get('guest-services/assets/:assetId/sessions')
  @RequirePermissions('ops.read', 'reservations.create')
  listSessions(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.gs.listOpenSessions(user, assetId);
  }

  @Post('guest-services/sessions/open')
  @RequirePermissions('ops.write', 'reservations.create')
  openSession(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.gs.openTableSession(user, OpenTableSessionSchema.parse(body));
  }

  @Post('guest-services/sessions/:id/close')
  @RequirePermissions('ops.write', 'reservations.create')
  closeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gs.closeTableSession(user, id);
  }

  @Get('guest-services/sessions/:id/bill')
  @RequirePermissions('ops.read', 'reservations.create')
  sessionBill(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gs.sessionBill(user, id);
  }

  @Post('guest-services/sessions/:id/request-bill')
  @RequirePermissions('ops.write', 'reservations.create')
  requestBill(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gs.requestBill(user, id);
  }

  @Post('guest-services/sessions/:id/acknowledge-bill')
  @RequirePermissions('ops.write', 'reservations.create')
  acknowledgeBill(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gs.acknowledgeBillRequest(user, id);
  }

  @Post('guest-services/requests/:id/status')
  @RequirePermissions('ops.write', 'reservations.create')
  updateRequestStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.gs.updateGuestRequestStatus(
      user,
      id,
      UpdateGuestServiceRequestStatusSchema.parse(body),
    );
  }

  @Post('guest-services/sessions/:id/guest-check')
  @RequirePermissions('ops.write', 'reservations.create', 'finance.cost.read')
  guestCheck(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gs.createGuestCheck(user, id);
  }

  @Post('guest-services/sessions/:id/pay-intent')
  @RequirePermissions('ops.write', 'reservations.create', 'finance.payment.manage')
  payIntent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gs.createPayIntent(user, id);
  }

  @Post('guest-services/sessions/:id/pay-confirm')
  @RequirePermissions('ops.write', 'reservations.create', 'finance.payment.manage')
  payConfirm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.gs.confirmSessionPayment(user, id, GuestSessionPaySchema.parse(body));
  }

  @Public()
  @Post('public/guest/sessions/:id/pay-confirm')
  publicPayConfirm(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: { ip?: string; headers?: Record<string, unknown> },
  ) {
    assertRateLimit(`gs-pay:${clientKey(req)}`, 15, 60_000);
    return this.gs.confirmSessionPayment(null, id, GuestSessionPaySchema.parse(body));
  }

  @Get('guest-services/assets/:assetId/orders')
  @RequirePermissions('ops.read', 'reservations.create')
  listOrders(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('status') status?: string,
    @Query('board') board?: string,
  ) {
    return this.gs.listOrders(user, assetId, { status, board });
  }

  @Post('guest-services/orders/:id/status')
  @RequirePermissions('ops.write', 'reservations.create')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.gs.updateOrderStatus(
      user,
      id,
      UpdateServiceOrderStatusSchema.parse(body),
    );
  }

  @Get('guest-services/assets/:assetId/feedback')
  @RequirePermissions('ops.read', 'reservations.create')
  listFeedback(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.gs.listRecentFeedback(user, assetId);
  }

  @Get('guest-services/assets/:assetId/companion-pings')
  @RequirePermissions('ops.read', 'reservations.create')
  companionPings(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.gs.listCompanionPings(user, assetId);
  }
}
