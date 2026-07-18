import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { nestPinoParams } from '@wayrune/observability';
import { bootstrapEnv, loadEnv } from '@wayrune/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AccessModule } from './modules/access/access.module';
import { AuditModule } from './modules/audit/audit.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { PartiesModule } from './modules/parties/parties.module';
import { PlacesModule } from './modules/places/places.module';
import { RoomTypesModule } from './modules/room-types/room-types.module';
import { VehicleTypesModule } from './modules/vehicle-types/vehicle-types.module';
import { LeadsModule } from './modules/leads/leads.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { TravelRequestsModule } from './modules/travel-requests/travel-requests.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TripsModule } from './modules/trips/trips.module';
import { ItinerariesModule } from './modules/itineraries/itineraries.module';
import { ItineraryBlocksModule } from './modules/itinerary-blocks/itinerary-blocks.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { RatesModule } from './modules/rates/rates.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SearchModule } from './modules/search/search.module';
import { OperationsModule } from './modules/operations/operations.module';
import { NetworkModule } from './modules/network/network.module';
import { PartnerAssetsModule } from './modules/partner-assets/partner-assets.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { StayModule } from './modules/stay/stay.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { RestaurantModule } from './modules/restaurant/restaurant.module';
import { ExperienceModule } from './modules/experience/experience.module';
import { MobilityModule } from './modules/mobility/mobility.module';
import { DriverModule } from './modules/driver/driver.module';
import { GuestServicesModule } from './modules/guest-services/guest-services.module';
import { AiModule } from './modules/ai/ai.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { GoogleModule } from './modules/google/google.module';
import { PresenceModule } from './modules/presence/presence.module';
import { HealthController } from './health.controller';
import { CorrelationMiddleware } from './common/correlation.middleware';
import { ZodExceptionFilter } from './common/zod-exception.filter';

bootstrapEnv();
const env = loadEnv(true);

@Module({
  imports: [
    LoggerModule.forRoot(
      nestPinoParams({
        service: env.logServiceName,
        appEnv: env.appEnv,
        level: env.logLevel,
        pretty: env.logPretty,
      }) as never,
    ),
    PrismaModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    AccessModule,
    FilesModule,
    NotificationsModule,
    OutboxModule,
    PartiesModule,
    PlacesModule,
    RoomTypesModule,
    VehicleTypesModule,
    LeadsModule,
    InquiriesModule,
    InteractionsModule,
    TravelRequestsModule,
    TasksModule,
    TripsModule,
    ItinerariesModule,
    ItineraryBlocksModule,
    QuotationsModule,
    RatesModule,
    OperationsModule,
    NetworkModule,
    PartnerAssetsModule,
    InventoryModule,
    StayModule,
    CommerceModule,
    RestaurantModule,
    ExperienceModule,
    MobilityModule,
    DriverModule,
    GuestServicesModule,
    AiModule,
    ConnectorsModule,
    GoogleModule,
    PresenceModule,
    DashboardModule,
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ZodExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
