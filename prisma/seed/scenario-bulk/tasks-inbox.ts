import type { SeedCtx } from './helpers';
import {
  INTERACTION_PREFIX,
  TASK_PREFIX,
  atHour,
  pad,
  pickRoundRobin,
  utcDate,
} from './helpers';

export async function seedTasks(
  ctx: SeedCtx,
  leadIds: string[],
  tripIds: string[],
): Promise<number> {
  const { prisma, organizationId, ownerId, salesIds, scale } = ctx;
  const dueOffsets = [-10, -5, -1, 0, 1, 3, 7, 14, 21] as const;

  for (let i = 1; i <= scale.tasks; i++) {
    const n = pad(i);
    const linkLead = i % 2 === 0 && leadIds.length;
    const dueOff = dueOffsets[i % dueOffsets.length]!;
    await prisma.task.create({
      data: {
        organizationId,
        title: `${TASK_PREFIX}Follow-up ${n}`,
        description: 'Scenario bulk task',
        status: i % 9 === 0 ? 'done' : 'open',
        priority: pickRoundRobin(['low', 'normal', 'high'], i),
        dueAt: utcDate(dueOff),
        assigneeId: pickRoundRobin(salesIds.length ? salesIds : [ownerId], i),
        entityType: linkLead ? 'lead' : tripIds.length ? 'trip' : null,
        entityId: linkLead
          ? pickRoundRobin(leadIds, i)
          : tripIds.length
            ? pickRoundRobin(tripIds, i)
            : null,
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: utcDate(-(i % 20)),
      },
    });
  }
  return scale.tasks;
}

export async function seedInbox(ctx: SeedCtx, partyIds: string[]): Promise<number> {
  const { prisma, organizationId, ownerId, salesIds, scale } = ctx;
  const channels = ['whatsapp', 'email', 'website', 'instagram', 'facebook'] as const;

  for (let i = 1; i <= scale.inboxThreads; i++) {
    const n = pad(i);
    const channel = channels[i % channels.length]!;
    const agingHours = i % 3 === 0 ? 72 : i % 3 === 1 ? 12 : 1;
    const lastAt = new Date(Date.now() - agingHours * 60 * 60 * 1000);
    const partyId = pickRoundRobin(partyIds, i);

    const conv = await prisma.engagementConversation.create({
      data: {
        organizationId,
        partyId,
        status: i % 7 === 0 ? 'closed' : 'open',
        assignedUserId: pickRoundRobin(salesIds.length ? salesIds : [ownerId], i),
        subject: `SCN ${channel} thread ${n}`,
        lastInteractionAt: lastAt,
        unreadCount: i % 7 === 0 ? 0 : 1 + (i % 3),
        journeyPathJson: [channel],
        createdAt: utcDate(-(i % 30)),
      },
    });

    await prisma.interaction.create({
      data: {
        organizationId,
        conversationId: conv.id,
        partyId,
        channel,
        staffUserId: null,
        occurredAt: lastAt,
        outcome: 'pending',
        unread: i % 7 !== 0,
        summary: `SCN inbound ${channel} message ${n}`,
        idempotencyKey: `${INTERACTION_PREFIX}${n}`,
        createdAt: lastAt,
      },
    });

    if (i % 2 === 0) {
      await prisma.interaction.create({
        data: {
          organizationId,
          conversationId: conv.id,
          partyId,
          channel,
          staffUserId: ownerId,
          occurredAt: atHour(utcDate(0), 12),
          outcome: 'follow_up',
          unread: false,
          summary: `SCN staff reply ${n}`,
          idempotencyKey: `${INTERACTION_PREFIX}${n}-out`,
        },
      });
    }
  }
  return scale.inboxThreads;
}
