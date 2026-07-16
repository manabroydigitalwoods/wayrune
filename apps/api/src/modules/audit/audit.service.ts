import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async record(input: {
    organizationId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    correlationId?: string;
  }) {
    return this.prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadataJson: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        correlationId: input.correlationId,
      },
    });
  }

  async list(organizationId: string, entityType?: string, entityId?: string) {
    return this.prisma.auditEvent.findMany({
      where: {
        organizationId,
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
