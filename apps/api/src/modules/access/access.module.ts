import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

/**
 * Administration maturity (P2). Imports {@link AuthModule} for
 * `AuthService.invalidateMembershipSessions` (re-mint on role/scope change).
 * `PrismaService` and `AuditService` are provided globally.
 */
@Module({
  imports: [AuthModule],
  controllers: [AccessController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
