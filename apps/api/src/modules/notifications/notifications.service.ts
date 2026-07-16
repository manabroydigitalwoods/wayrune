import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
  ) {}

  /** Read org notifications settings from settingsJson. */
  async orgNotifyFlags(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true, name: true },
    });
    const settings =
      org?.settingsJson && typeof org.settingsJson === 'object'
        ? (org.settingsJson as Record<string, unknown>)
        : {};
    const n =
      settings.notifications && typeof settings.notifications === 'object'
        ? (settings.notifications as Record<string, unknown>)
        : {};
    return {
      emailFromName:
        typeof n.emailFromName === 'string' && n.emailFromName.trim()
          ? n.emailFromName.trim()
          : org?.name || 'Travel ERP',
      emailReplyTo:
        typeof n.emailReplyTo === 'string' && n.emailReplyTo.trim()
          ? n.emailReplyTo.trim()
          : null,
      notifyOnLead: n.notifyOnLead !== false,
      notifyOnQuoteAccept: n.notifyOnQuoteAccept !== false,
      notifyOnPayment: n.notifyOnPayment !== false,
      notifyOnIncident: n.notifyOnIncident !== false,
      notifyOnTask: n.notifyOnTask !== false,
      notifyOnQuoteApproval: n.notifyOnQuoteApproval !== false,
      digestEnabled: n.digestEnabled === true,
      digestCadence: n.digestCadence === 'weekly' ? ('weekly' as const) : ('daily' as const),
    };
  }

  async notify(input: {
    organizationId: string;
    userId: string;
    title: string;
    body: string;
    linkPath?: string;
    /** in_app (default) | email | both */
    channel?: 'in_app' | 'email' | 'both';
  }) {
    const channel = input.channel ?? 'in_app';
    const wantInApp = channel === 'in_app' || channel === 'both' || channel === 'email';
    const wantEmail = channel === 'email' || channel === 'both';

    // Always persist an in-app row so the bell UI works even when email is primary.
    const n = await this.prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        title: input.title,
        body: input.body,
        linkPath: input.linkPath,
        channel: wantEmail && !wantInApp ? 'email' : wantEmail ? 'both' : 'in_app',
      },
    });

    if (wantEmail) {
      const flags = await this.orgNotifyFlags(input.organizationId);
      await this.outbox.enqueue({
        organizationId: input.organizationId,
        eventType: 'notification.email',
        payload: {
          notificationId: n.id,
          userId: input.userId,
          title: input.title,
          body: input.body,
          linkPath: input.linkPath ?? null,
          fromName: flags.emailFromName,
          replyTo: flags.emailReplyTo,
        },
      });
    }
    return n;
  }

  list(organizationId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(organizationId: string, userId: string) {
    return this.prisma.notification.count({
      where: { organizationId, userId, readAt: null },
    });
  }

  async markRead(organizationId: string, userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, organizationId, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(organizationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
