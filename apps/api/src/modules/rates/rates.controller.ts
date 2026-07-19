import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateSupplierActivityRateSchema,
  CreateSupplierHotelRateSchema,
  CreateTransferFareSchema,
  ChartFreshnessSchema,
  ImportActivityRateCsvSchema,
  ImportHotelRateCsvSchema,
  ImportTransferFareCsvSchema,
  ResolveRatesSchema,
  SuggestTransferFareSchema,
  UpdateSupplierActivityRateSchema,
  UpdateSupplierHotelRateSchema,
  UpdateTransferFareSchema,
  RestoreHotelRateVersionSchema,
  RestoreTransferFareVersionSchema,
  RestoreActivityRateVersionSchema,
} from '@wayrune/contracts';
import {
  CurrentUser,
  RequireAgencyOrg,
  RequirePermissions,
  type AuthUser,
} from '../../common/helpers';
import { RatesService } from './rates.service';

@Controller()
@RequireAgencyOrg()
export class RatesController {
  constructor(private rates: RatesService) {}

  @Get('hotel-rates')
  @RequirePermissions('quote.read', 'quote.write')
  listHotel(
    @CurrentUser() user: AuthUser,
    @Query('supplierId') supplierId?: string,
    @Query('placeId') placeId?: string,
    @Query('q') q?: string,
  ) {
    return this.rates.listHotelRates(user.organizationId, {
      supplierId,
      placeId,
      q,
      includeSystem: true,
    });
  }

  @Post('hotel-rates')
  @RequirePermissions('quote.write')
  createHotel(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.createHotelRate(
      user.organizationId,
      user.sub,
      CreateSupplierHotelRateSchema.parse(body),
    );
  }

  @Patch('hotel-rates/:id')
  @RequirePermissions('quote.write')
  updateHotel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.rates.updateHotelRate(
      user.organizationId,
      id,
      UpdateSupplierHotelRateSchema.parse(body),
    );
  }

  @Post('hotel-rates/:id/new-version')
  @RequirePermissions('quote.write')
  newHotelVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.createHotelRateVersion(
      user.organizationId,
      user.sub,
      id,
    );
  }

  @Get('hotel-rates/:id/versions')
  @RequirePermissions('quote.read', 'quote.write')
  listHotelVersions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.listHotelRateVersions(user.organizationId, id);
  }

  @Post('hotel-rates/:id/restore-version')
  @RequirePermissions('quote.write')
  restoreHotelVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = RestoreHotelRateVersionSchema.parse(body);
    return this.rates.restoreHotelRateVersion(
      user.organizationId,
      user.sub,
      id,
      parsed.sourceVersionId,
    );
  }

  @Delete('hotel-rates/:id')
  @RequirePermissions('quote.write')
  deleteHotel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.deleteHotelRate(user.organizationId, id);
  }

  @Get('activity-rates')
  @RequirePermissions('quote.read', 'quote.write')
  listActivity(
    @CurrentUser() user: AuthUser,
    @Query('supplierId') supplierId?: string,
    @Query('placeId') placeId?: string,
    @Query('q') q?: string,
  ) {
    return this.rates.listActivityRates(user.organizationId, {
      supplierId,
      placeId,
      q,
    });
  }

  @Post('activity-rates')
  @RequirePermissions('quote.write')
  createActivity(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.createActivityRate(
      user.organizationId,
      user.sub,
      CreateSupplierActivityRateSchema.parse(body),
    );
  }

  @Patch('activity-rates/:id')
  @RequirePermissions('quote.write')
  updateActivity(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.rates.updateActivityRate(
      user.organizationId,
      id,
      UpdateSupplierActivityRateSchema.parse(body),
    );
  }

  @Delete('activity-rates/:id')
  @RequirePermissions('quote.write')
  deleteActivity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.deleteActivityRate(user.organizationId, id);
  }

  @Post('activity-rates/:id/new-version')
  @RequirePermissions('quote.write')
  newActivityVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.createActivityRateVersion(
      user.organizationId,
      user.sub,
      id,
    );
  }

  @Get('activity-rates/:id/versions')
  @RequirePermissions('quote.read', 'quote.write')
  listActivityVersions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.listActivityRateVersions(user.organizationId, id);
  }

  @Post('activity-rates/:id/restore-version')
  @RequirePermissions('quote.write')
  restoreActivityVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = RestoreActivityRateVersionSchema.parse(body);
    return this.rates.restoreActivityRateVersion(
      user.organizationId,
      user.sub,
      id,
      parsed.sourceVersionId,
    );
  }

  @Post('activity-rates/import/csv')
  @RequirePermissions('quote.write')
  importActivityCsv(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.importActivityRatesCsv(
      user.organizationId,
      user.sub,
      ImportActivityRateCsvSchema.parse(body),
    );
  }

  @Get('transfer-fares')
  @RequirePermissions('quote.read', 'quote.write')
  listTransfer(
    @CurrentUser() user: AuthUser,
    @Query('fromPlaceId') fromPlaceId?: string,
    @Query('toPlaceId') toPlaceId?: string,
    @Query('vehicleTypeId') vehicleTypeId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
  ) {
    return this.rates.listTransferFares(user.organizationId, {
      fromPlaceId,
      toPlaceId,
      vehicleTypeId,
      supplierId,
      q,
    });
  }

  @Post('transfer-fares')
  @RequirePermissions('quote.write')
  createTransfer(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.createTransferFare(
      user.organizationId,
      user.sub,
      CreateTransferFareSchema.parse(body),
    );
  }

  @Post('transfer-fares/:id/new-version')
  @RequirePermissions('quote.write')
  newTransferVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.createTransferFareVersion(
      user.organizationId,
      user.sub,
      id,
    );
  }

  @Get('transfer-fares/:id/versions')
  @RequirePermissions('quote.read', 'quote.write')
  listTransferVersions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.listTransferFareVersions(user.organizationId, id);
  }

  @Post('transfer-fares/:id/restore-version')
  @RequirePermissions('quote.write')
  restoreTransferVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = RestoreTransferFareVersionSchema.parse(body);
    return this.rates.restoreTransferFareVersion(
      user.organizationId,
      user.sub,
      id,
      parsed.sourceVersionId,
    );
  }

  @Post('transfer-fares/:id/override')
  @RequirePermissions('quote.write')
  overrideTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const patch = (body || {}) as Partial<{
      unitCost: number;
      childUnitCost: number | null;
      pricingMode: 'per_vehicle' | 'per_adult';
    }>;
    return this.rates.overrideTransferFare(
      user.organizationId,
      user.sub,
      id,
      patch,
    );
  }

  @Post('transfer-fares/suggest')
  @RequirePermissions('quote.write', 'quote.read')
  suggestTransfer(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.suggestTransferFare(
      user.organizationId,
      SuggestTransferFareSchema.parse(body),
    );
  }

  @Patch('transfer-fares/:id')
  @RequirePermissions('quote.write')
  updateTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.rates.updateTransferFare(
      user.organizationId,
      id,
      UpdateTransferFareSchema.parse(body),
    );
  }

  @Delete('transfer-fares/:id')
  @RequirePermissions('quote.write')
  deleteTransfer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.deleteTransferFare(user.organizationId, id);
  }

  @Post('hotel-rates/import/csv')
  @RequirePermissions('quote.write')
  importHotelCsv(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.importHotelRatesCsv(
      user.organizationId,
      user.sub,
      ImportHotelRateCsvSchema.parse(body),
    );
  }

  @Get('rates/import-batches')
  @RequirePermissions('quote.read', 'quote.write')
  listImportBatches(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedKind =
      kind === 'hotel' || kind === 'transfer' || kind === 'activity'
        ? kind
        : undefined;
    const n = limit ? Number(limit) : undefined;
    return this.rates.listRatesImportBatches(user.organizationId, {
      kind: parsedKind,
      limit: Number.isFinite(n) ? n : undefined,
    });
  }

  @Post('transfer-fares/import/csv')
  @RequirePermissions('quote.write')
  importTransferCsv(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.importTransferFaresCsv(
      user.organizationId,
      user.sub,
      ImportTransferFareCsvSchema.parse(body),
    );
  }

  @Post('rates/resolve')
  @RequirePermissions('quote.write', 'quote.read')
  resolve(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.resolve(
      user.organizationId,
      ResolveRatesSchema.parse(body),
    );
  }

  @Post('rates/chart-freshness')
  @RequirePermissions('quote.write', 'quote.read')
  chartFreshness(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = ChartFreshnessSchema.parse(body);
    return this.rates.chartFreshness(user.organizationId, input.items);
  }
}
