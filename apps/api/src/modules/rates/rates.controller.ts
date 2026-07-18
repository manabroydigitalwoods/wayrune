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
  CreateSupplierHotelRateSchema,
  CreateTransferFareSchema,
  ResolveRatesSchema,
  SuggestTransferFareSchema,
  UpdateSupplierHotelRateSchema,
  UpdateTransferFareSchema,
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

  @Delete('hotel-rates/:id')
  @RequirePermissions('quote.write')
  deleteHotel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rates.deleteHotelRate(user.organizationId, id);
  }

  @Get('transfer-fares')
  @RequirePermissions('quote.read', 'quote.write')
  listTransfer(
    @CurrentUser() user: AuthUser,
    @Query('fromPlaceId') fromPlaceId?: string,
    @Query('toPlaceId') toPlaceId?: string,
    @Query('vehicleTypeId') vehicleTypeId?: string,
    @Query('q') q?: string,
  ) {
    return this.rates.listTransferFares(user.organizationId, {
      fromPlaceId,
      toPlaceId,
      vehicleTypeId,
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

  @Post('rates/resolve')
  @RequirePermissions('quote.write', 'quote.read')
  resolve(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.resolve(
      user.organizationId,
      ResolveRatesSchema.parse(body),
    );
  }
}
