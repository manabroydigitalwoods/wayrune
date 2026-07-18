import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateEngagementAutomationRuleInput,
  UpdateEngagementAutomationRuleInput,
} from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/helpers';

@Injectable()
export class EngagementAutomationService {
  constructor(private prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.engagementAutomationRule.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(user: AuthUser, input: CreateEngagementAutomationRuleInput) {
    return this.prisma.engagementAutomationRule.create({
      data: {
        organizationId: user.organizationId,
        name: input.name,
        trigger: input.trigger,
        channel: input.channel ?? null,
        actionJson: input.actionJson as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
        position: input.position ?? 0,
      },
    });
  }

  async update(user: AuthUser, id: string, input: UpdateEngagementAutomationRuleInput) {
    const row = await this.prisma.engagementAutomationRule.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Automation rule not found');
    return this.prisma.engagementAutomationRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.actionJson !== undefined
          ? { actionJson: input.actionJson as Prisma.InputJsonValue }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
    });
  }
}
