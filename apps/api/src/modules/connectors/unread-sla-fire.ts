import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  inboxAgingCutoff,
  inboxAgingHoursFromSettings,
} from '../dashboard/inbox-sla-metrics';
import { runEngagementAutomation } from './engagement-automation';

/** Subject marker so we fire once per aging episode (keyed to lastInteractionAt). */
export function unreadSlaMarker(lastInteractionAt: Date): string {
  return `[unread_sla:${lastInteractionAt.toISOString()}]`;
}

export function unreadSlaAlreadyFired(
  subject: string | null | undefined,
  lastInteractionAt: Date,
): boolean {
  return Boolean(subject?.includes(unreadSlaMarker(lastInteractionAt)));
}

export function stampUnreadSlaMarker(
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

export type UnreadSlaCandidate = {
  id: string;
  organizationId: string;
  subject: string | null;
  lastInteractionAt: Date;
  unreadCount: number;
  status: string;
};

/** Aging unread open/waiting threads that have not yet been stamped for this episode. */
export function selectUnreadSlaCandidates(
  rows: UnreadSlaCandidate[],
  cutoff: Date,
): UnreadSlaCandidate[] {
  return rows.filter(
    (row) =>
      row.unreadCount > 0 &&
      row.status !== 'closed' &&
      row.lastInteractionAt.getTime() < cutoff.getTime() &&
      !unreadSlaAlreadyFired(row.subject, row.lastInteractionAt),
  );
}

type PrismaLike = Pick<
  PrismaClient,
  'engagementAutomationRule' | 'engagementConversation' | 'organization'
>;

/**
 * For orgs with active `conversation.unread_sla` rules, fire once per aging
 * unread thread (subject marker prevents re-fire until lastInteractionAt changes).
 */
export async function fireUnreadSlaAutomations(
  prisma: PrismaLike,
  opts?: { organizationId?: string; now?: Date; limitPerOrg?: number },
): Promise<{ orgs: number; fired: number }> {
  const now = opts?.now ?? new Date();
  const limitPerOrg = Math.max(1, Math.min(50, opts?.limitPerOrg ?? 25));

  const rules = await prisma.engagementAutomationRule.findMany({
    where: {
      isActive: true,
      trigger: 'conversation.unread_sla',
      ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
    },
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
    const hours = inboxAgingHoursFromSettings(org?.settingsJson);
    const cutoff = inboxAgingCutoff(now, hours);

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
        organizationId: true,
        subject: true,
        lastInteractionAt: true,
        unreadCount: true,
        status: true,
      },
      orderBy: { lastInteractionAt: 'asc' },
      take: limitPerOrg * 2,
    });

    const candidates = selectUnreadSlaCandidates(rows, cutoff).slice(
      0,
      limitPerOrg,
    );
    for (const conv of candidates) {
      await runEngagementAutomation(prisma, organizationId, {
        trigger: 'conversation.unread_sla',
        conversationId: conv.id,
      });
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
          data: { subject: nextSubject } satisfies Prisma.EngagementConversationUpdateInput,
        });
      }
      fired += 1;
    }
  }

  return { orgs: rules.length, fired };
}
