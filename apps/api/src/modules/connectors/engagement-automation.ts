import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

type AutomationEvent = {
  trigger: 'interaction.ingested' | 'conversation.waiting' | 'conversation.unread_sla';
  channel?: string;
  conversationId: string;
};

type PrismaLike = Pick<
  PrismaClient,
  'engagementAutomationRule' | 'engagementConversation'
>;

/**
 * Run active EngagementAutomationRule rows for an org against a conversation event.
 * Actions supported: assignUserId, setStatus, tag (stored on subject prefix).
 */
export async function runEngagementAutomation(
  prisma: PrismaLike,
  organizationId: string,
  event: AutomationEvent,
) {
  const rules = await prisma.engagementAutomationRule.findMany({
    where: {
      organizationId,
      isActive: true,
      trigger: event.trigger,
      ...(event.channel
        ? { OR: [{ channel: null }, { channel: event.channel }] }
        : {}),
    },
    orderBy: { position: 'asc' },
    take: 20,
  });

  for (const rule of rules) {
    const action = (rule.actionJson ?? {}) as Record<string, unknown>;
    const data: Prisma.EngagementConversationUpdateInput = {};
    if (typeof action.assignUserId === 'string' && action.assignUserId.trim()) {
      data.assignedUserId = action.assignUserId.trim();
    }
    if (
      typeof action.setStatus === 'string' &&
      ['open', 'waiting', 'closed'].includes(action.setStatus)
    ) {
      data.status = action.setStatus;
    }
    if (typeof action.tag === 'string' && action.tag.trim()) {
      const conv = await prisma.engagementConversation.findFirst({
        where: { id: event.conversationId, organizationId },
        select: { subject: true },
      });
      const tag = `[${action.tag.trim()}]`;
      if (conv && !conv.subject?.includes(tag)) {
        data.subject = conv.subject ? `${tag} ${conv.subject}` : tag;
      }
    }
    if (Object.keys(data).length) {
      await prisma.engagementConversation.update({
        where: { id: event.conversationId },
        data,
      });
    }
  }
}
