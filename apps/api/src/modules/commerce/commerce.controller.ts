import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AttachPolicySchema,
  CloseTripSchema,
  ConfirmServiceRequestItemSchema,
  CreateAssetBuildingSchema,
  CreateCancellationCaseSchema,
  CreateCommercialDocumentSchema,
  CreateConversationSchema,
  CreateDiningCapacitySchema,
  CreateExperienceProductSchema,
  CreateExperienceSlotSchema,
  CreateFolioChargeSchema,
  CreateHousekeepingTaskSchema,
  CreateInventoryHoldSchema,
  CreateMaintenanceWorkOrderSchema,
  CreateMealPackageSchema,
  CreateMealReservationSchema,
  CreateNegotiatedRateSchema,
  CreatePartnerRatingSchema,
  CreatePartnerSettlementSchema,
  CreatePaymentAllocationSchema,
  CreatePaymentRecordSchema,
  CreatePolicySchema,
  SettleCancellationRefundSchema,
  CreateServiceIncidentSchema,
  CreateServiceRequestItemSchema,
  CreateServiceRequestSchema,
  CreateSupplierContractSchema,
  UpdateSupplierContractSchema,
  CloneSupplierContractVersionSchema,
  CreateTripChangeCaseSchema,
  ImportNegotiatedRateCsvSchema,
  NegotiateServiceRequestSchema,
  PostMessageSchema,
  UpdateHousekeepingTaskSchema,
  UpdateMaintenanceWorkOrderSchema,
  UpdateMealReservationSchema,
  UpdateOrganizationProfileSchema,
  UpdatePolicySchema,
  UpdateServiceIncidentSchema,
  UpdateServiceRequestSchema,
  UpdateTripChangeCaseSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { CommerceService } from './commerce.service';
import { FinanceBalanceService } from './finance-balance.service';

@Controller('commerce')
export class CommerceController {
  constructor(
    private commerce: CommerceService,
    private finance: FinanceBalanceService,
  ) {}

  // Profile
  @Get('profile')
  @RequirePermissions('org.settings.read')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.commerce.getOrganizationProfile(user.organizationId);
  }

  @Patch('profile')
  @RequirePermissions('org.settings.write', 'profile.publish')
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.updateOrganizationProfile(
      user.organizationId,
      user.sub,
      UpdateOrganizationProfileSchema.parse(body),
    );
  }

  // Policies
  @Get('policies')
  @RequirePermissions('policy.manage', 'ops.read')
  listPolicies(@CurrentUser() user: AuthUser, @Query('type') type?: string) {
    return this.commerce.listPolicies(user.organizationId, type);
  }

  @Post('policies')
  @RequirePermissions('policy.manage')
  createPolicy(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createPolicy(
      user.organizationId,
      user.sub,
      CreatePolicySchema.parse(body),
    );
  }

  @Patch('policies/:id')
  @RequirePermissions('policy.manage')
  updatePolicy(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.updatePolicy(
      user.organizationId,
      id,
      UpdatePolicySchema.parse(body),
    );
  }

  @Post('policies/attach')
  @RequirePermissions('policy.manage')
  attachPolicy(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.attachPolicy(
      user.organizationId,
      user.sub,
      AttachPolicySchema.parse(body),
    );
  }

  // Service requests
  @Get('service-requests')
  @RequirePermissions('ops.read')
  listServiceRequests(
    @CurrentUser() user: AuthUser,
    @Query('side') side?: 'buyer' | 'seller' | 'all',
    @Query('status') status?: string,
  ) {
    return this.commerce.listServiceRequests(
      user.organizationId,
      side || 'all',
      status,
    );
  }

  @Post('service-requests')
  @RequirePermissions('ops.write', 'reservations.create')
  createServiceRequest(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createServiceRequest(
      user.organizationId,
      user.sub,
      CreateServiceRequestSchema.parse(body),
    );
  }

  @Patch('service-requests/:id')
  @RequirePermissions('ops.write', 'reservations.confirm')
  updateServiceRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.updateServiceRequest(
      user.organizationId,
      id,
      user.sub,
      UpdateServiceRequestSchema.parse(body),
    );
  }

  @Post('bookings/:bookingId/ensure-service-request')
  @RequirePermissions('ops.write')
  ensureSr(@CurrentUser() user: AuthUser, @Param('bookingId') bookingId: string) {
    return this.commerce.ensureServiceRequestForBooking(
      user.organizationId,
      user.sub,
      bookingId,
    );
  }

  // Money
  @Get('commercial-documents')
  @RequirePermissions('finance.cost.read')
  listDocs(@CurrentUser() user: AuthUser) {
    return this.commerce.listCommercialDocuments(user.organizationId);
  }

  @Get('gstr-export')
  @RequirePermissions('finance.cost.read')
  gstrExport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.commerce.exportGstrReadyCsv(user.organizationId, { from, to });
  }

  @Post('commercial-documents')
  @RequirePermissions('finance.payment.manage')
  createDoc(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createCommercialDocument(
      user.organizationId,
      user.sub,
      CreateCommercialDocumentSchema.parse(body),
    );
  }

  @Post('payments')
  @RequirePermissions('finance.payment.manage')
  createPayment(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createPaymentRecord(
      user.organizationId,
      user.sub,
      CreatePaymentRecordSchema.parse(body),
    );
  }

  // Inbox
  @Get('conversations')
  @RequirePermissions('ops.read')
  listConversations(@CurrentUser() user: AuthUser) {
    return this.commerce.listConversations(user.organizationId);
  }

  @Post('conversations')
  @RequirePermissions('ops.write')
  createConversation(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createConversation(
      user.organizationId,
      user.sub,
      CreateConversationSchema.parse(body),
    );
  }

  @Post('conversations/:id/messages')
  @RequirePermissions('ops.write')
  postMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.postMessage(
      user.organizationId,
      id,
      user.sub,
      PostMessageSchema.parse(body),
    );
  }

  @Get('timeline')
  @RequirePermissions('ops.read', 'audit.read')
  timeline(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.commerce.getTimeline(user.organizationId, entityType, entityId);
  }

  // Agency depth
  @Get('ops-centre')
  @RequirePermissions('ops.read')
  opsCentre(@CurrentUser() user: AuthUser) {
    return this.commerce.opsCommandCentre(user.organizationId);
  }

  @Get('supplier-contracts')
  @RequirePermissions('ops.read')
  listContracts(
    @CurrentUser() user: AuthUser,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.commerce.listSupplierContracts(user.organizationId, supplierId);
  }

  @Post('supplier-contracts')
  @RequirePermissions('ops.write')
  createContract(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createSupplierContract(
      user.organizationId,
      user.sub,
      CreateSupplierContractSchema.parse(body),
    );
  }

  @Patch('supplier-contracts/:id')
  @RequirePermissions('ops.write')
  updateContract(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.updateSupplierContract(
      user.organizationId,
      id,
      UpdateSupplierContractSchema.parse(body),
    );
  }

  @Post('supplier-contracts/:id/clone-version')
  @RequirePermissions('ops.write')
  cloneContractVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.cloneSupplierContractVersion(
      user.organizationId,
      user.sub,
      id,
      CloneSupplierContractVersionSchema.parse(body ?? {}),
    );
  }

  @Get('trip-changes')
  @RequirePermissions('trip.read', 'ops.read')
  listChanges(
    @CurrentUser() user: AuthUser,
    @Query('tripId') tripId?: string,
  ) {
    return this.commerce.listTripChangeCases(user.organizationId, tripId);
  }

  @Post('trip-changes')
  @RequirePermissions('trip.write')
  createChange(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createTripChangeCase(
      user.organizationId,
      user.sub,
      CreateTripChangeCaseSchema.parse(body),
    );
  }

  @Patch('trip-changes/:id')
  @RequirePermissions('trip.write')
  updateChange(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.updateTripChangeCase(
      user.organizationId,
      id,
      UpdateTripChangeCaseSchema.parse(body),
    );
  }

  @Get('incidents')
  @RequirePermissions('incident.manage', 'ops.read')
  listIncidents(
    @CurrentUser() user: AuthUser,
    @Query('tripId') tripId?: string,
    @Query('status') status?: string,
  ) {
    return this.commerce.listIncidents(user.organizationId, tripId, status);
  }

  @Post('incidents')
  @RequirePermissions('incident.manage', 'ops.write')
  createIncident(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createIncident(
      user.organizationId,
      user.sub,
      CreateServiceIncidentSchema.parse(body),
    );
  }

  @Patch('incidents/:id')
  @RequirePermissions('incident.manage', 'ops.write')
  updateIncident(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.updateIncident(
      user.organizationId,
      id,
      UpdateServiceIncidentSchema.parse(body),
    );
  }

  @Post('trips/:tripId/close')
  @RequirePermissions('trip.write')
  closeTrip(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: unknown,
  ) {
    return this.commerce.closeTrip(
      user.organizationId,
      user.sub,
      tripId,
      CloseTripSchema.parse(body ?? {}),
    );
  }

  // Stay OS
  @Get('assets/:assetId/buildings')
  @RequirePermissions('inventory.manage', 'ops.read')
  listBuildings(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.commerce.listBuildings(user.organizationId, assetId);
  }

  @Post('buildings')
  @RequirePermissions('inventory.manage')
  createBuilding(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateAssetBuildingSchema.parse(body);
    return this.commerce.createBuilding(user.organizationId, input);
  }

  @Post('buildings/:buildingId/floors')
  @RequirePermissions('inventory.manage')
  createFloor(
    @CurrentUser() user: AuthUser,
    @Param('buildingId') buildingId: string,
    @Body() body: { name: string; level?: number },
  ) {
    return this.commerce.createFloor(
      user.organizationId,
      buildingId,
      body.name,
      body.level ?? 0,
    );
  }

  @Get('assets/:assetId/front-desk')
  @RequirePermissions('ops.read', 'reservations.create')
  frontDesk(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.commerce.frontDeskBoards(user.organizationId, assetId);
  }

  @Get('assets/:assetId/housekeeping-tasks')
  @RequirePermissions('ops.read')
  listHk(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.commerce.listHousekeepingTasks(user.organizationId, assetId);
  }

  @Post('housekeeping-tasks')
  @RequirePermissions('ops.write')
  createHk(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createHousekeepingTask(
      user.organizationId,
      user.sub,
      CreateHousekeepingTaskSchema.parse(body),
    );
  }

  @Patch('housekeeping-tasks/:id')
  @RequirePermissions('ops.write')
  updateHk(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.updateHousekeepingTask(
      user.organizationId,
      id,
      user.sub,
      UpdateHousekeepingTaskSchema.parse(body),
    );
  }

  @Get('assets/:assetId/maintenance')
  @RequirePermissions('ops.read')
  listMaint(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.commerce.listMaintenance(user.organizationId, assetId);
  }

  @Post('maintenance')
  @RequirePermissions('ops.write', 'inventory.manage')
  createMaint(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createMaintenance(
      user.organizationId,
      user.sub,
      CreateMaintenanceWorkOrderSchema.parse(body),
    );
  }

  @Patch('maintenance/:id')
  @RequirePermissions('ops.write')
  updateMaint(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.updateMaintenance(
      user.organizationId,
      id,
      UpdateMaintenanceWorkOrderSchema.parse(body),
    );
  }

  @Post('folio-charges')
  @RequirePermissions('finance.payment.manage', 'ops.write')
  addFolio(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.addFolioCharge(
      user.organizationId,
      user.sub,
      CreateFolioChargeSchema.parse(body),
    );
  }

  @Get('stay-reservations/:id/folio')
  @RequirePermissions('finance.cost.read', 'ops.read')
  getFolio(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.getFolio(user.organizationId, id);
  }

  @Post('stay-reservations/:id/no-show')
  @RequirePermissions('reservations.cancel', 'ops.write')
  noShow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.markNoShow(user.organizationId, id);
  }

  // Experiences
  @Get('assets/:assetId/experiences')
  @RequirePermissions('ops.read')
  listExperiences(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.commerce.listExperiences(user.organizationId, assetId);
  }

  @Post('experiences')
  @RequirePermissions('inventory.manage')
  createExperience(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createExperience(
      user.organizationId,
      CreateExperienceProductSchema.parse(body),
    );
  }

  @Post('experience-slots')
  @RequirePermissions('inventory.manage')
  createSlot(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createExperienceSlot(
      user.organizationId,
      CreateExperienceSlotSchema.parse(body),
    );
  }

  // Restaurant
  @Get('assets/:assetId/meal-packages')
  @RequirePermissions('ops.read')
  listPackages(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.commerce.listMealPackages(user.organizationId, assetId);
  }

  @Post('meal-packages')
  @RequirePermissions('inventory.manage', 'rates.manage')
  createPackage(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createMealPackage(
      user.organizationId,
      CreateMealPackageSchema.parse(body),
    );
  }

  @Post('dining-capacities')
  @RequirePermissions('inventory.manage')
  createCapacity(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createDiningCapacity(
      user.organizationId,
      CreateDiningCapacitySchema.parse(body),
    );
  }

  @Get('assets/:assetId/dining-capacities')
  @RequirePermissions('ops.read', 'inventory.manage')
  listCapacities(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.commerce.listDiningCapacities(user.organizationId, assetId);
  }

  @Post('meal-reservations')
  @RequirePermissions('reservations.create')
  createMealRes(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createMealReservation(
      user.organizationId,
      user.sub,
      CreateMealReservationSchema.parse(body),
    );
  }

  @Patch('meal-reservations/:id')
  @RequirePermissions('reservations.confirm', 'ops.write')
  updateMealRes(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.updateMealReservation(
      user.organizationId,
      id,
      UpdateMealReservationSchema.parse(body),
    );
  }

  @Get('assets/:assetId/kitchen-board')
  @RequirePermissions('ops.read')
  kitchenBoard(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.commerce.kitchenBoard(user.organizationId, assetId);
  }

  // Network
  @Get('negotiated-rates')
  @RequirePermissions('network.read')
  listRates(@CurrentUser() user: AuthUser) {
    return this.commerce.listNegotiatedRates(user.organizationId);
  }

  @Post('negotiated-rates')
  @RequirePermissions('network.write')
  createRate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createNegotiatedRate(
      user.organizationId,
      CreateNegotiatedRateSchema.parse(body),
    );
  }

  @Post('negotiated-rates/import/csv')
  @RequirePermissions('network.write')
  importRatesCsv(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.importNegotiatedRatesCsv(
      user.organizationId,
      ImportNegotiatedRateCsvSchema.parse(body),
    );
  }

  @Post('settlements')
  @RequirePermissions('finance.payment.manage', 'network.write')
  createSettlement(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createSettlement(
      user.organizationId,
      user.sub,
      CreatePartnerSettlementSchema.parse(body),
    );
  }

  @Get('settlements')
  @RequirePermissions('finance.cost.read', 'network.read')
  listSettlements(@CurrentUser() user: AuthUser) {
    return this.commerce.listSettlements(user.organizationId);
  }

  @Post('ratings')
  @RequirePermissions('network.write')
  createRating(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createRating(
      user.organizationId,
      user.sub,
      CreatePartnerRatingSchema.parse(body),
    );
  }

  @Get('ratings')
  @RequirePermissions('network.read')
  listRatings(@CurrentUser() user: AuthUser) {
    return this.commerce.listRatings(user.organizationId);
  }

  // Commerce Integrity
  @Post('bookings/:bookingId/negotiate')
  @RequirePermissions('ops.write')
  negotiate(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    return this.commerce.negotiateForBooking(
      user.organizationId,
      user.sub,
      NegotiateServiceRequestSchema.parse({ ...body as object, bookingComponentId: bookingId }),
    );
  }

  @Post('service-request-items')
  @RequirePermissions('ops.write')
  createItem(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createServiceRequestItem(
      user.organizationId,
      CreateServiceRequestItemSchema.parse(body),
    );
  }

  @Post('service-request-items/confirm')
  @RequirePermissions('ops.write', 'reservations.confirm')
  confirmItem(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.confirmServiceRequestItem(
      user.organizationId,
      user.sub,
      ConfirmServiceRequestItemSchema.parse(body),
    );
  }

  @Post('holds')
  @RequirePermissions('ops.write', 'inventory.manage')
  createHold(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createInventoryHold(
      user.organizationId,
      CreateInventoryHoldSchema.parse(body),
    );
  }

  @Post('holds/expire')
  @RequirePermissions('ops.write')
  expireHolds() {
    return this.commerce.expireHolds();
  }

  @Post('payment-allocations')
  @RequirePermissions('finance.payment.manage')
  allocate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.allocatePayment(
      user.organizationId,
      CreatePaymentAllocationSchema.parse(body),
    );
  }

  @Get('payments/:id/unallocated')
  @RequirePermissions('finance.cost.read')
  unallocated(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.paymentUnallocated(user.organizationId, id);
  }

  @Get('trips/:tripId/bookings/:bookingId/cancellation-preview')
  @RequirePermissions('ops.read', 'trip.read', 'ops.write', 'trip.write')
  previewBookingCancel(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.commerce.previewBookingCancellation(
      user.organizationId,
      tripId,
      bookingId,
    );
  }

  @Get('trips/:tripId/cancellations')
  @RequirePermissions('ops.read', 'trip.read', 'ops.write', 'trip.write')
  listTripCancels(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
  ) {
    return this.commerce.listTripCancellationCases(
      user.organizationId,
      tripId,
    );
  }

  @Post('cancellations')
  @RequirePermissions('ops.write', 'trip.write')
  createCancel(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.commerce.createCancellationCase(
      user.organizationId,
      user.sub,
      CreateCancellationCaseSchema.parse(body),
    );
  }

  @Post('cancellations/:id/request')
  @RequirePermissions('ops.write', 'trip.write')
  requestCancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.requestCancellationCase(
      user.organizationId,
      user.sub,
      id,
    );
  }

  @Post('cancellations/:id/approve')
  @RequirePermissions('ops.write', 'trip.write')
  approveCancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.approveCancellationCase(
      user.organizationId,
      user.sub,
      id,
    );
  }

  @Post('cancellations/:id/apply')
  @RequirePermissions('ops.write', 'trip.write')
  applyCancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.applyCancellationCase(
      user.organizationId,
      user.sub,
      id,
    );
  }

  @Get('cancellations/:id/refund-status')
  @RequirePermissions('finance.cost.read', 'ops.read', 'trip.read')
  cancellationRefundStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.commerce.cancellationRefundStatus(user.organizationId, id);
  }

  @Post('cancellations/:id/settle-refund')
  @RequirePermissions('finance.refund.execute', 'finance.payment.manage')
  settleCancellationRefund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = SettleCancellationRefundSchema.parse(body ?? {});
    return this.commerce.settleCancellationRefund(
      user.organizationId,
      user.sub,
      id,
      parsed,
    );
  }

  @Post('trip-changes/:id/apply')
  @RequirePermissions('trip.write')
  applyChange(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.applyTripChangeCase(
      user.organizationId,
      user.sub,
      id,
    );
  }

  @Get('trips/:tripId/reconciliation')
  @RequirePermissions('ops.read', 'finance.cost.read')
  reconcile(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
  ) {
    return this.commerce.tripCommerceReconciliation(
      user.organizationId,
      tripId,
    );
  }

  @Get('service-requests/:id/fulfilment-payload')
  @RequirePermissions('ops.read', 'network.read')
  fulfilment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.commerce.fulfilmentPayloadForRequest(user.organizationId, id);
  }

  @Get('data-quality-issues')
  @RequirePermissions('ops.read')
  dq(@CurrentUser() user: AuthUser) {
    return this.commerce.detectDataQualityIssues(user.organizationId);
  }

  @Get('documents/:id/balance')
  @RequirePermissions('ops.read', 'finance.cost.read')
  documentBalance(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.documentBalance(user.organizationId, id);
  }

  @Get('payments/:id/balance')
  @RequirePermissions('ops.read', 'finance.cost.read')
  paymentBalance(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.paymentBalance(user.organizationId, id);
  }

  @Get('trips/:tripId/payable-rollup')
  @RequirePermissions('ops.read', 'finance.cost.read')
  tripPayable(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.finance.tripPayableRollup(user.organizationId, tripId);
  }

  @Get('workflow-recovery')
  @RequirePermissions('ops.read')
  listRecovery(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.commerce.listWorkflowRecovery(user.organizationId, status);
  }

  @Post('workflow-recovery/:id/retry')
  @RequirePermissions('ops.write')
  retryRecovery(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.retryWorkflowRecovery(
      user.organizationId,
      user.sub,
      id,
    );
  }

  @Post('workflow-recovery/:id/compensate')
  @RequirePermissions('ops.write')
  compensateRecovery(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commerce.compensateWorkflowRecovery(
      user.organizationId,
      user.sub,
      id,
    );
  }

  /** Phase B Care — open incidents + partner ratings. */
  @Get('care/board')
  @RequirePermissions('ops.read', 'incident.manage')
  careBoard(@CurrentUser() user: AuthUser) {
    return this.commerce.careBoard(user.organizationId);
  }

  /** Phase B Care — cross-vertical guest / party history. */
  @Get('care/history')
  @RequirePermissions('ops.read')
  careHistory(
    @CurrentUser() user: AuthUser,
    @Query('partyId') partyId?: string,
    @Query('guestPhone') guestPhone?: string,
    @Query('guestName') guestName?: string,
  ) {
    return this.commerce.careGuestHistory(user.organizationId, {
      partyId,
      guestPhone,
      guestName,
    });
  }
}
