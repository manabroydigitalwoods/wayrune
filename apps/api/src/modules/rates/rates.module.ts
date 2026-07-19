import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlacesModule } from '../places/places.module';
import { PlatformRatesController } from './platform-rates.controller';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';

@Module({
  imports: [PlacesModule, AuditModule],
  controllers: [RatesController, PlatformRatesController],
  providers: [RatesService],
  exports: [RatesService],
})
export class RatesModule {}
