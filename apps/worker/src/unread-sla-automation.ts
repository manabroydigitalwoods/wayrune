/**
 * Hourly unread-SLA automation tick (worker).
 * Mirrors apps/api connectors/unread-sla-fire — keep markers in sync if changed.
 */
import type { PrismaClient } from '@prisma/client';

const INBOX_AGING_HOURS_DEFAULT = 4;

function inboxAgingHoursFromSettings(settings: unknown): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return INBOX_AGING_HOURS_DEFAULT;
  }
  const raw = (settings as Record<string, unknown>).inboxAgingHours;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 72) return INBOX_AGING_HOURS_DEFAULT;
  return Math.floor(n);
}

function inboxAgingCutoff(now: Date, agingHours: number): Date {
  return new Date(now.getTime() - Math.max(0, agingHours) * 3_600_000);
}

function unreadSlaMarker(lastInteractionAt: Date): string {
  return `[unread_sla:${lastInteractionAt.toISOString()}]`;
}

function unreadSlaAlreadyFired(
  subject: string | null | undefined,
  lastInteractionAt: Date,
): boolean {
  return Boolean(subject?.includes(unreadSlaMarker(lastInteractionAt)));
}

function stampUnreadSlaMarker(
  subject: string | null | undefined,
  lastInteractionAt: Date,
): string {
  const marker = unreadSlaMarker(lastInteractionAt);
  if (subject?.includes(marker)) return subject;
  const cleaned = (subject || '')
    .replace(/\[unread_sla:[^\]]+\]\s*/g, '')
    .trim();
  return cleaned ? `${marker} ${cleaned}` : marker;
}

async function applyUnreadSlaRules(
  prisma: PrismaClient,
  organizationId: string,
  conversationId: string,
) {
  const rules = await prisma.engagementAutomationRule.findMany({
    where: {
      organizationId,
      isActive: true,
      trigger: 'conversation.unread_sla',
    },
    orderBy: { position: 'asc' },
    take: 20,
  });
  for (const rule of rules) {
    const action = (rule.actionJson ?? {}) as Record<string, unknown>;
    const data: {
      assignedUserId?: string;
      status?: string;
      subject?: string;
    } = {};
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
        where: { id: conversationId, organizationId },
        select: { subject: true },
      });
      const tag = `[${action.tag.trim()}]`;
      if (conv && !conv.subject?.includes(tag)) {
        data.subject = conv.subject ? `${tag} ${conv.subject}` : tag;
      }
    }
    if (Object.keys(data).length) {
      await prisma.engagementConversation.update({
        where: { id: conversationId },
        data,
      });
    }
  }
}

export async function runUnreadSlaAutomations(opts: {
  prisma: PrismaClient;
  now?: Date;
  log?: { info: (msg: string, meta?: Record<string, unknown>) => void };
}): Promise<{ orgs: number; fired: number }> {
  const { prisma, log } = opts;
  const now = opts.now ?? new Date();

  const rules = await prisma.engagementAutomationRule.findMany({
    where: { isActive: true, trigger: 'conversation.unread_sla' },
    select: { organizationId: true },
    distinct: ['organizationId'],
    take: 100,
  });
  if (!rules.length) return { orgs: 0, fired: 0 };

  let fired = 0;
  for (const { organizationId } of rules) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    const cutoff = inboxAgingCutoff(
      now,
      inboxAgingHoursFromSettings(org?.settingsJson),
    );
    const rows = await prisma.engagementConversation.findMany({
      where: {
        organizationId,
        status: { not: 'closed' },
        unreadCount: { gt: 0 },
        lastInteractionAt: { lt: cutoff },
        interactions: { some: {} },
      },
      select: {
        id: true,
        subject: true,
        lastInteractionAt: true,
        unreadCount: true,
        status: true,
      },
      orderBy: { lastInteractionAt: 'asc' },
      take: 50,
    });

    for (const conv of rows) {
      if (conv.unreadCount <= 0 || conv.status === 'closed') continue;
      if (unreadSlaAlreadyFired(conv.subject, conv.lastInteractionAt)) continue;

      await applyUnreadSlaRules(prisma, organizationId, conv.id);
      const after = await prisma.engagementConversation.findFirst({
        where: { id: conv.id, organizationId },
        select: { subject: true, lastInteractionAt: true },
      });
      if (!after) continue;
      const nextSubject = stampUnreadSlaMarker(
        after.subject,
        after.lastInteractionAt,
      );
      if (nextSubject !== after.subject) {
        await prisma.engagementConversation.update({
          where: { id: conv.id },
          data: { subject: nextSubject },
        });
      }
      fired += 1;
    }
  }

  log?.info('Unread SLA automation tick', { orgs: rules.length, fired });
  return { orgs: rules.length, fired };
}
