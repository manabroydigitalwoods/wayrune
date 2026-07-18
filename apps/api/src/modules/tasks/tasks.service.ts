import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateTaskSchema } from '@wayrune/contracts';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GoogleService } from '../google/google.service';

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
    const task = await this.prisma.task.create({
      data: {
        organizationId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
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
