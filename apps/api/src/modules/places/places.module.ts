import { Module } from '@nestjs/common';
import { VehicleTypesModule } from '../vehicle-types/vehicle-types.module';
import { PlacesController } from './places.controller';
import { PlatformCatalogController } from './platform-catalog.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [VehicleTypesModule],
  controllers: [PlacesController, PlatformCatalogController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
