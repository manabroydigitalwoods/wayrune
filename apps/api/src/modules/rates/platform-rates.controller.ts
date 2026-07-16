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
  GenerateTransferFareMatrixSchema,
  SuggestTransferFareSchema,
  UpdateSupplierHotelRateSchema,
  UpdateTransferFareSchema,
} from '@travel/contracts';
import {
  CurrentUser,
  RequirePermissions,
  RequirePlatformOrg,
  type AuthUser,
} from '../../common/helpers';
import { RatesService } from './rates.service';

@Controller('platform')
@RequirePlatformOrg()
export class PlatformRatesController {
  constructor(private rates: RatesService) {}

  @Get('transfer-fares')
  @RequirePermissions('platform.catalog.read')
  listFares(
    @Query('fromPlaceId') fromPlaceId?: string,
    @Query('toPlaceId') toPlaceId?: string,
    @Query('vehicleTypeId') vehicleTypeId?: string,
    @Query('q') q?: string,
  ) {
    return this.rates.listTransferFares(null, {
      fromPlaceId,
      toPlaceId,
      vehicleTypeId,
      q,
      systemOnly: true,
    });
  }

  @Post('transfer-fares')
  @RequirePermissions('platform.catalog.write')
  createFare(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.createTransferFare(
      null,
      user.sub,
      CreateTransferFareSchema.parse(body),
      { asSystem: true },
    );
  }

  @Patch('transfer-fares/:id')
  @RequirePermissions('platform.catalog.write')
  updateFare(@Param('id') id: string, @Body() body: unknown) {
    return this.rates.updateTransferFare(
      null,
      id,
      UpdateTransferFareSchema.parse(body),
      { systemOnly: true },
    );
  }

  @Delete('transfer-fares/:id')
  @RequirePermissions('platform.catalog.write')
  deleteFare(@Param('id') id: string) {
    return this.rates.deleteTransferFare(null, id, { systemOnly: true });
  }

  @Post('transfer-fares/suggest')
  @RequirePermissions('platform.catalog.write', 'platform.catalog.read')
  suggest(@Body() body: unknown) {
    return this.rates.suggestTransferFare(
      null,
      SuggestTransferFareSchema.parse(body),
    );
  }

  @Post('transfer-fares/generate-matrix')
  @RequirePermissions('platform.catalog.write')
  generateMatrix(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.generateMatrix(
      user.sub,
      GenerateTransferFareMatrixSchema.parse(body),
    );
  }

  @Get('hotel-rates')
  @RequirePermissions('platform.catalog.read')
  listHotel(
    @Query('placeId') placeId?: string,
    @Query('q') q?: string,
  ) {
    return this.rates.listHotelRates(null, {
      placeId,
      q,
      systemOnly: true,
    });
  }

  @Post('hotel-rates')
  @RequirePermissions('platform.catalog.write')
  createHotel(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.rates.createHotelRate(
      null,
      user.sub,
      CreateSupplierHotelRateSchema.parse(body),
      { asSystem: true },
    );
  }

  @Patch('hotel-rates/:id')
  @RequirePermissions('platform.catalog.write')
  updateHotel(@Param('id') id: string, @Body() body: unknown) {
    return this.rates.updateHotelRate(
      null,
      id,
      UpdateSupplierHotelRateSchema.parse(body),
      { systemOnly: true },
    );
  }

  @Delete('hotel-rates/:id')
  @RequirePermissions('platform.catalog.write')
  deleteHotel(@Param('id') id: string) {
    return this.rates.deleteHotelRate(null, id, { systemOnly: true });
  }
}
