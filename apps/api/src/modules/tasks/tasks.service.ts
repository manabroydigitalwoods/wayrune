import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateTaskSchema } from '@wayrune/contracts';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GoogleService } from '../google/google.service';
import {
  shouldResolveLeadFromInquiryTask,
  shouldSyncLeadFollowUpAt,
} from './lead-follow-up-sync';

type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    @Optional()
    @Inject(forwardRef(() => GoogleService))
    private google?: GoogleService,
  ) {}

  async create(organizationId: string, userId: string, input: CreateTaskInput) {
    const assigneeId = input.assigneeId ?? userId;
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    const task = await this.prisma.task.create({
      data: {
        organizationId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        dueAt,
        assigneeId,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await this.audit.record({
      organizationId,
      actorUserId: userId,
      action: 'task.create',
      entityType: 'task',
      entityId: task.id,
    });

    await this.syncLeadFollowUpFromTask(organizationId, {
      entityType: input.entityType,
      entityId: input.entityId,
      dueAt,
    });

    if (assigneeId && assigneeId !== userId) {
      try {
        const flags = await this.notifications.orgNotifyFlags(organizationId);
        await this.notifications.notify({
          organizationId,
          userId: assigneeId,
          title: 'Task assigned',
          body: task.title,
          linkPath: '/tasks',
          channel: flags.notifyOnTask === false ? 'in_app' : 'both',
        });
      } catch {
        /* non-blocking */
      }
    }

    if (this.google && task.dueAt) {
      try {
        await this.google.syncTaskToCalendar(organizationId, {
          id: task.id,
          title: task.title,
          description: task.description,
          dueAt: task.dueAt,
        });
      } catch {
        /* Calendar sync is best-effort */
      }
    }

    return task;
  }

  /** Stamp Lead.followUpAt so sales overdue strip matches Log Activity / inbox follow-up. */
  private async syncLeadFollowUpFromTask(
    organizationId: string,
    input: {
      entityType?: string | null;
      entityId?: string | null;
      dueAt: Date | null;
    },
  ) {
    if (!input.dueAt) return;

    let leadId: string | null = null;
    if (
      shouldSyncLeadFollowUpAt({
        entityType: input.entityType,
        entityId: input.entityId,
        dueAt: input.dueAt,
      })
    ) {
      leadId = input.entityId!;
    } else if (
      shouldResolveLeadFromInquiryTask({
        entityType: input.entityType,
        entityId: input.entityId,
        dueAt: input.dueAt,
      })
    ) {
      const inquiry = await this.prisma.inquiry.findFirst({
        where: {
          id: input.entityId!,
          organizationId,
          deletedAt: null,
        },
        select: { leadId: true },
      });
      leadId = inquiry?.leadId ?? null;
    }

    if (!leadId) return;

    await this.prisma.lead.updateMany({
      where: { id: leadId, organizationId, deletedAt: null },
      data: { followUpAt: input.dueAt },
    });
  }

  async list(
    organizationId: string,
    status?: string,
    q?: string,
    due?: string,
    entityType?: string,
    entityId?: string,
  ) {
    const now = new Date();
    const where: Prisma.TaskWhereInput = {
      organizationId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(due === 'overdue'
        ? { dueAt: { lt: now }, status: { not: 'done' } }
        : due === 'today'
          ? {
              dueAt: {
                gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
              },
            }
          : {}),
      ...(q ? { title: { contains: q } } : {}),
    };
    return this.prisma.task.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async complete(organizationId: string, userId: string, id: string) {
    return this.prisma.task.updateMany({
      where: { id, organizationId },
      data: { status: 'done', updatedBy: userId },
    });
  }
}
