import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type {
  CreateInteractionInput,
  ResolveInteractionInput,
  UpdateEngagementConversationInput,
  UpdateInteractionInput,
} from '@wayrune/contracts';
import { CONNECTOR_CAPABILITIES } from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import type { AuthUser } from '../../common/helpers';
import { runEngagementAutomation } from '../connectors/engagement-automation';

@Injectable()
export class InteractionsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TasksService)) private tasks: TasksService,
  ) {}

  /**
   * Resolve an open EngagementConversation for a party (or create one).
   * Orphan interactions (no party) get a dedicated conversation each.
   */
  async resolveOrCreateConversation(
    organizationId: string,
    opts: {
      partyId?: string | null;
      conversationId?: string | null;
      channel?: string;
      subject?: string | null;
      assignedUserId?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    if (opts.conversationId) {
      const existing = await db.engagementConversation.findFirst({
        where: { id: opts.conversationId, organizationId },
      });
      if (existing) return existing;
    }
    if (opts.partyId) {
      const open = await db.engagementConversation.findFirst({
        where: {
          organizationId,
          partyId: opts.partyId,
          status: { in: ['open', 'waiting'] },
        },
        orderBy: { lastInteractionAt: 'desc' },
      });
      if (open) return open;
    }
    return db.engagementConversation.create({
      data: {
        organizationId,
        partyId: opts.partyId ?? null,
        status: 'open',
        assignedUserId: opts.assignedUserId ?? null,
        subject: opts.subject ?? null,
        lastInteractionAt: new Date(),
        unreadCount: 0,
        journeyPathJson: opts.channel ? [opts.channel] : [],
      },
    });
  }

  private async bumpConversation(
    conversationId: string,
    opts: {
      channel: string;
      unreadDelta: number;
      occurredAt: Date;
      summary?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const conv = await db.engagementConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) return;
    const path = Array.isArray(conv.journeyPathJson)
      ? ([...conv.journeyPathJson] as string[])
      : [];
    if (opts.channel && path[path.length - 1] !== opts.channel) {
      path.push(opts.channel);
    }
    await db.engagementConversation.update({
      where: { id: conversationId },
      data: {
        lastInteractionAt: opts.occurredAt,
        unreadCount: Math.max(0, conv.unreadCount + opts.unreadDelta),
        journeyPathJson: path.slice(-20),
        ...(opts.summary && !conv.subject ? { subject: opts.summary.slice(0, 120) } : {}),
        status: conv.status === 'closed' ? 'open' : conv.status,
      },
    });
  }

  /** Lazy backfill: attach Interactions missing conversationId. */
  async backfillConversations(organizationId: string) {
    const orphans = await this.prisma.interaction.findMany({
      where: { organizationId, conversationId: null },
      orderBy: { occurredAt: 'asc' },
      take: 500,
    });
    if (!orphans.length) return { attached: 0 };

    const byParty = new Map<string, typeof orphans>();
    const noParty: typeof orphans = [];
    for (const row of orphans) {
      if (row.partyId) {
        const list = byParty.get(row.partyId) ?? [];
        list.push(row);
        byParty.set(row.partyId, list);
      } else {
        noParty.push(row);
      }
    }

    let attached = 0;
    for (const [partyId, rows] of byParty) {
      const conv = await this.resolveOrCreateConversation(organizationId, {
        partyId,
        channel: rows[0]?.channel,
        subject: rows[0]?.summary,
      });
      for (const row of rows) {
        await this.prisma.interaction.update({
          where: { id: row.id },
          data: { conversationId: conv.id },
        });
        attached += 1;
      }
      const unread = rows.filter((r) => r.unread).length;
      const last = rows[rows.length - 1]!;
      const path = [...new Set(rows.map((r) => r.channel))];
      await this.prisma.engagementConversation.update({
        where: { id: conv.id },
        data: {
          lastInteractionAt: last.occurredAt,
          unreadCount: unread,
          journeyPathJson: path,
        },
      });
    }
    for (const row of noParty) {
      const conv = await this.resolveOrCreateConversation(organizationId, {
        partyId: null,
        channel: row.channel,
        subject: row.summary,
      });
      await this.prisma.interaction.update({
        where: { id: row.id },
        data: { conversationId: conv.id },
      });
      await this.prisma.engagementConversation.update({
        where: { id: conv.id },
        data: {
          lastInteractionAt: row.occurredAt,
          unreadCount: row.unread ? 1 : 0,
          journeyPathJson: [row.channel],
        },
      });
      attached += 1;
    }

    // Link inquiries that have an interaction with a conversation
    const linked = await this.prisma.interaction.findMany({
      where: {
        organizationId,
        inquiryId: { not: null },
        conversationId: { not: null },
      },
      select: { inquiryId: true, conversationId: true },
      take: 500,
    });
    for (const row of linked) {
      if (!row.inquiryId || !row.conversationId) continue;
      await this.prisma.inquiry.updateMany({
        where: {
          id: row.inquiryId,
          organizationId,
          engagementConversationId: null,
        },
        data: { engagementConversationId: row.conversationId },
      });
    }

    return { attached };
  }

  async create(
    user: AuthUser,
    input: CreateInteractionInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    const unread = input.unread ?? true;
    const conversation = await this.resolveOrCreateConversation(
      user.organizationId,
      {
        partyId: input.partyId,
        conversationId: input.conversationId,
        channel: input.channel,
        subject: input.summary,
        assignedUserId: input.staffUserId !== undefined ? input.staffUserId : user.sub,
      },
      db,
    );

    const row = await db.interaction.create({
      data: {
        organizationId: user.organizationId,
        conversationId: conversation.id,
        channel: input.channel,
        acquisitionSourceKey: input.acquisitionSourceKey ?? null,
        partyId: input.partyId ?? null,
        leadId: input.leadId ?? null,
        inquiryId: input.inquiryId ?? null,
        outcome: input.outcome ?? 'pending',
        summary: input.summary ?? null,
        unread,
        staffUserId:
          input.staffUserId !== undefined ? input.staffUserId : user.sub,
        occurredAt,
        idempotencyKey: input.idempotencyKey ?? null,
        rawPayloadJson: input.rawPayloadJson
          ? (input.rawPayloadJson as Prisma.InputJsonValue)
          : undefined,
      },
    });

    await this.bumpConversation(
      conversation.id,
      {
        channel: input.channel,
        unreadDelta: unread ? 1 : 0,
        occurredAt,
        summary: input.summary,
      },
      db,
    );

    if (!tx) {
      await runEngagementAutomation(this.prisma, user.organizationId, {
        trigger: 'interaction.ingested',
        channel: input.channel,
        conversationId: conversation.id,
      }).catch(() => undefined);
    }

    return row;
  }

  async findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.interaction.findFirst({
      where: { organizationId, idempotencyKey },
      include: {
        party: { select: { id: true, displayName: true, phone: true, email: true } },
      },
    });
  }

  async list(
    user: AuthUser,
    opts: {
      page?: number;
      pageSize?: number;
      channel?: string;
      unread?: boolean;
      outcome?: string;
      q?: string;
      ownership?: 'mine' | 'unassigned' | 'all';
    } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 40));
    const ownership = opts.ownership || 'all';
    const where: Prisma.InteractionWhereInput = {
      organizationId: user.organizationId,
      ...(opts.channel ? { channel: opts.channel } : {}),
      ...(opts.unread === true ? { unread: true } : {}),
      ...(opts.outcome ? { outcome: opts.outcome } : {}),
      ...(ownership === 'mine' ? { staffUserId: user.sub } : {}),
      ...(ownership === 'unassigned' ? { staffUserId: null } : {}),
      ...(opts.q?.trim()
        ? {
            OR: [
              { summary: { contains: opts.q.trim() } },
              { acquisitionSourceKey: { contains: opts.q.trim() } },
              { party: { displayName: { contains: opts.q.trim() } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.interaction.findMany({
        where,
        include: {
          party: { select: { id: true, displayName: true, phone: true, email: true } },
          lead: {
            select: {
              id: true,
              title: true,
              source: { select: { key: true, name: true } },
              channel: true,
            },
          },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.interaction.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(user: AuthUser, id: string) {
    const row = await this.prisma.interaction.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        party: true,
        lead: { include: { source: true } },
      },
    });
    if (!row) throw new NotFoundException('Interaction not found');
    return row;
  }

  async update(user: AuthUser, id: string, input: UpdateInteractionInput) {
    await this.get(user, id);
    return this.prisma.interaction.update({
      where: { id },
      data: {
        ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
        ...(input.unread !== undefined ? { unread: input.unread } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.partyId !== undefined ? { partyId: input.partyId } : {}),
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
        ...(input.inquiryId !== undefined ? { inquiryId: input.inquiryId } : {}),
        ...(input.staffUserId !== undefined ? { staffUserId: input.staffUserId } : {}),
      },
    });
  }

  async claim(user: AuthUser, id: string) {
    const row = await this.get(user, id);
    if (row.staffUserId && row.staffUserId !== user.sub) {
      throw new BadRequestException('Already claimed by another teammate');
    }
    return this.prisma.interaction.update({
      where: { id },
      data: { staffUserId: user.sub },
    });
  }

  async assign(user: AuthUser, id: string, staffUserId: string) {
    await this.get(user, id);
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: user.organizationId,
        userId: staffUserId,
        isActive: true,
      },
    });
    if (!membership) throw new BadRequestException('Staff member not found in this organization');
    return this.prisma.interaction.update({
      where: { id },
      data: { staffUserId },
    });
  }

  async markRead(user: AuthUser, id: string) {
    return this.update(user, id, { unread: false });
  }

  /**
   * Dispose a pending Interaction: attach to inquiry, schedule follow-up (+ Task),
   * or dismiss as spam / no interest.
   */
  async resolve(user: AuthUser, id: string, input: ResolveInteractionInput) {
    const row = await this.get(user, id);
    if (row.outcome !== 'pending') {
      throw new BadRequestException('Only pending interactions can be resolved this way');
    }

    let partyId = row.partyId;
    let leadId = row.leadId;
    let inquiryId = row.inquiryId;

    if (input.outcome === 'attached_existing') {
      const inquiry = await this.prisma.inquiry.findFirst({
        where: {
          id: input.inquiryId!,
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          partyId: true,
          leadId: true,
          inquiryNumber: true,
          engagementConversationId: true,
        },
      });
      if (!inquiry) throw new BadRequestException('Inquiry was not found');
      inquiryId = inquiry.id;
      partyId = inquiry.partyId ?? partyId;
      leadId = inquiry.leadId ?? leadId;
      if (row.conversationId && !inquiry.engagementConversationId) {
        await this.prisma.inquiry.update({
          where: { id: inquiry.id },
          data: { engagementConversationId: row.conversationId },
        });
      }
    }

    const summary =
      input.summary?.trim() ||
      row.summary ||
      (input.outcome === 'attached_existing'
        ? 'Attached to existing request'
        : input.outcome === 'follow_up'
          ? 'Follow-up scheduled'
          : input.outcome === 'spam'
            ? 'Marked spam'
            : 'No interest');

    const updated = await this.prisma.interaction.update({
      where: { id },
      data: {
        outcome: input.outcome,
        unread: false,
        summary,
        partyId,
        leadId,
        inquiryId,
      },
    });

    if (input.outcome === 'follow_up') {
      const entityType = inquiryId ? 'inquiry' : leadId ? 'lead' : partyId ? 'party' : null;
      const entityId = inquiryId || leadId || partyId || null;
      const titleBits = [
        'Follow up',
        row.party?.displayName || row.lead?.title || row.channel,
      ].filter(Boolean);
      await this.tasks.create(user.organizationId, user.sub, {
        title: titleBits.join(' — '),
        description: summary,
        priority: 'normal',
        dueAt: input.followUpAt ?? null,
        entityType,
        entityId,
      });
    }

    return updated;
  }

  async journeyForParty(organizationId: string, partyId: string) {
    const [interactions, leads] = await Promise.all([
      this.prisma.interaction.findMany({
        where: { organizationId, partyId },
        orderBy: { occurredAt: 'asc' },
        take: 50,
      }),
      this.prisma.lead.findMany({
        where: { organizationId, partyId, deletedAt: null },
        include: { source: { select: { key: true, name: true } } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
    ]);

    const firstLead = leads[0];
    return {
      acquisition: firstLead?.source
        ? { key: firstLead.source.key, name: firstLead.source.name }
        : interactions.find((i) => i.acquisitionSourceKey)
          ? {
              key: interactions.find((i) => i.acquisitionSourceKey)!.acquisitionSourceKey!,
              name: interactions.find((i) => i.acquisitionSourceKey)!.acquisitionSourceKey!,
            }
          : null,
      firstChannel: firstLead?.channel || interactions[0]?.channel || null,
      interactions: interactions.map((i) => ({
        id: i.id,
        channel: i.channel,
        acquisitionSourceKey: i.acquisitionSourceKey,
        outcome: i.outcome,
        summary: i.summary,
        occurredAt: i.occurredAt,
      })),
    };
  }

  /** Owner analytics: interaction counts by channel + acquisition + outcome. */
  async analyticsSummary(user: AuthUser) {
    const orgId = user.organizationId;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [byChannel, byAcquisition, byOutcome, total, unread] = await Promise.all([
      this.prisma.interaction.groupBy({
        by: ['channel'],
        where: { organizationId: orgId, occurredAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.interaction.groupBy({
        by: ['acquisitionSourceKey'],
        where: {
          organizationId: orgId,
          occurredAt: { gte: since },
          acquisitionSourceKey: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.interaction.groupBy({
        by: ['outcome'],
        where: { organizationId: orgId, occurredAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.interaction.count({
        where: { organizationId: orgId, occurredAt: { gte: since } },
      }),
      this.prisma.interaction.count({
        where: { organizationId: orgId, unread: true },
      }),
    ]);

    return {
      windowDays: 30,
      total,
      unread,
      byChannel: byChannel.map((r) => ({ channel: r.channel, count: r._count._all })),
      byAcquisition: byAcquisition
        .filter((r) => r.acquisitionSourceKey)
        .map((r) => ({ sourceKey: r.acquisitionSourceKey!, count: r._count._all })),
      byOutcome: byOutcome.map((r) => ({ outcome: r.outcome, count: r._count._all })),
    };
  }

  async listThreads(
    user: AuthUser,
    opts: {
      page?: number;
      pageSize?: number;
      channel?: string;
      unread?: boolean;
      ownership?: 'mine' | 'unassigned' | 'all';
      queue?: 'assigned' | 'waiting' | 'follow_up' | 'all';
    } = {},
  ) {
    await this.backfillConversations(user.organizationId);
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 30));
    const ownership = opts.ownership || 'all';
    const queue = opts.queue || 'all';

    const where: Prisma.EngagementConversationWhereInput = {
      organizationId: user.organizationId,
      // Hide empty shells left by older reply paths that created then moved messages
      interactions: { some: {} },
      ...(ownership === 'mine' ? { assignedUserId: user.sub } : {}),
      ...(ownership === 'unassigned' ? { assignedUserId: null } : {}),
      ...(opts.unread === true ? { unreadCount: { gt: 0 } } : {}),
      ...(queue === 'waiting' ? { status: 'waiting' } : {}),
      ...(queue === 'assigned' ? { assignedUserId: user.sub, status: { not: 'closed' } } : {}),
      ...(opts.channel
        ? { interactions: { some: { channel: opts.channel } } }
        : {}),
      ...(queue === 'follow_up'
        ? {
            interactions: {
              some: { outcome: 'follow_up' },
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.engagementConversation.findMany({
        where,
        include: {
          party: { select: { id: true, displayName: true, phone: true, email: true } },
          interactions: {
            orderBy: { occurredAt: 'desc' },
            take: 1,
            select: {
              id: true,
              channel: true,
              summary: true,
              occurredAt: true,
              outcome: true,
            },
          },
          _count: {
            select: {
              interactions: true,
              inquiries: true,
            },
          },
        },
        orderBy: { lastInteractionAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.engagementConversation.count({ where }),
    ]);

    const items = rows.map((row) => {
      const last = row.interactions[0];
      return {
        key: `conversation:${row.id}`,
        conversationId: row.id,
        partyId: row.partyId,
        label: row.party?.displayName || row.subject || last?.summary || 'Conversation',
        channel: last?.channel || 'website',
        lastSummary: last?.summary ?? row.subject,
        lastAt: (last?.occurredAt ?? row.lastInteractionAt).toISOString(),
        unreadCount: row.unreadCount,
        pendingCount: 0,
        messageCount: row._count.interactions,
        travelRequestCount: row._count.inquiries,
        status: row.status,
        assignedUserId: row.assignedUserId,
        journeyPath: Array.isArray(row.journeyPathJson)
          ? (row.journeyPathJson as string[])
          : [],
      };
    });

    // Fill pending counts cheaply for the page
    for (const item of items) {
      item.pendingCount = await this.prisma.interaction.count({
        where: {
          organizationId: user.organizationId,
          conversationId: item.conversationId,
          outcome: 'pending',
        },
      });
    }

    return { items, total, page, pageSize };
  }

  async listThreadMessages(
    user: AuthUser,
    threadKey: string,
    opts?: { limit?: number; before?: string; beforeId?: string },
  ) {
    let conversationId: string | null = null;
    let where: Prisma.InteractionWhereInput = { organizationId: user.organizationId };

    if (threadKey.startsWith('conversation:')) {
      conversationId = threadKey.slice('conversation:'.length);
      where = { ...where, conversationId };
    } else if (threadKey.startsWith('party:')) {
      where = { ...where, partyId: threadKey.slice('party:'.length) };
    } else if (threadKey.startsWith('orphan:')) {
      const id = threadKey.split(':').pop();
      where = { ...where, id: id || '__none__' };
    } else {
      conversationId = threadKey;
      where = { ...where, conversationId };
    }

    const limit = Math.min(100, Math.max(1, opts?.limit ?? 40));
    const beforeAt = opts?.before ? new Date(opts.before) : null;
    const beforeId = opts?.beforeId?.trim() || null;
    if (beforeAt && !Number.isNaN(beforeAt.getTime())) {
      where = {
        ...where,
        OR: beforeId
          ? [
              { occurredAt: { lt: beforeAt } },
              { occurredAt: beforeAt, id: { lt: beforeId } },
            ]
          : [{ occurredAt: { lt: beforeAt } }],
      };
    }

    // Newest page first, then reverse for chat order (oldest → newest)
    const rows = await this.prisma.interaction.findMany({
      where,
      include: {
        party: { select: { id: true, displayName: true, phone: true, email: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = [...page].reverse();

    // Mark conversation read on the initial (latest) page only
    if (conversationId && !beforeAt) {
      await this.prisma.interaction.updateMany({
        where: { organizationId: user.organizationId, conversationId, unread: true },
        data: { unread: false },
      });
      await this.prisma.engagementConversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
    }

    return {
      threadKey,
      conversationId: conversationId || items[0]?.conversationId || null,
      hasMore,
      limit,
      items: items.map((row) => {
        const raw = (row.rawPayloadJson ?? {}) as Record<string, unknown>;
        return {
          ...row,
          direction: raw.direction === 'outbound' ? 'outbound' : 'inbound',
        };
      }),
    };
  }

  async getConversation(user: AuthUser, conversationId: string) {
    const row = await this.prisma.engagementConversation.findFirst({
      where: { id: conversationId, organizationId: user.organizationId },
      include: {
        party: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            email: true,
            whatsappOptIn: true,
            emailOptIn: true,
            marketingOptIn: true,
          },
        },
        inquiries: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            inquiryNumber: true,
            status: true,
            destinationsJson: true,
            startDate: true,
            endDate: true,
            createdAt: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Conversation not found');
    return {
      ...row,
      journeyPath: Array.isArray(row.journeyPathJson)
        ? (row.journeyPathJson as string[])
        : [],
      capabilities: CONNECTOR_CAPABILITIES,
    };
  }

  async updateConversation(
    user: AuthUser,
    conversationId: string,
    input: UpdateEngagementConversationInput,
  ) {
    await this.getConversation(user, conversationId);
    return this.prisma.engagementConversation.update({
      where: { id: conversationId },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assignedUserId !== undefined
          ? { assignedUserId: input.assignedUserId }
          : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
      },
    });
  }

  async claimConversation(user: AuthUser, conversationId: string) {
    const row = await this.getConversation(user, conversationId);
    if (row.assignedUserId && row.assignedUserId !== user.sub) {
      throw new BadRequestException('Already claimed by another teammate');
    }
    const updated = await this.prisma.engagementConversation.update({
      where: { id: conversationId },
      data: { assignedUserId: user.sub },
    });
    await this.prisma.interaction.updateMany({
      where: {
        organizationId: user.organizationId,
        conversationId,
        staffUserId: null,
      },
      data: { staffUserId: user.sub },
    });
    return updated;
  }

  async markConversationRead(user: AuthUser, conversationId: string) {
    await this.getConversation(user, conversationId);
    await this.prisma.interaction.updateMany({
      where: { organizationId: user.organizationId, conversationId, unread: true },
      data: { unread: false },
    });
    return this.prisma.engagementConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });
  }

  async markConversationUnread(user: AuthUser, conversationId: string) {
    await this.getConversation(user, conversationId);
    const latest = await this.prisma.interaction.findFirst({
      where: { organizationId: user.organizationId, conversationId },
      orderBy: { occurredAt: 'desc' },
    });
    if (latest) {
      await this.prisma.interaction.update({
        where: { id: latest.id },
        data: { unread: true },
      });
    }
    return this.prisma.engagementConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 1 },
    });
  }

  async assignConversation(user: AuthUser, conversationId: string, staffUserId: string) {
    await this.getConversation(user, conversationId);
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: user.organizationId,
        userId: staffUserId,
        isActive: true,
      },
    });
    if (!membership) throw new BadRequestException('Staff member not found in this organization');
    const updated = await this.prisma.engagementConversation.update({
      where: { id: conversationId },
      data: { assignedUserId: staffUserId },
    });
    await this.prisma.interaction.updateMany({
      where: { organizationId: user.organizationId, conversationId },
      data: { staffUserId },
    });
    return updated;
  }

  async channelUnreadSummary(user: AuthUser) {
    await this.backfillConversations(user.organizationId);
    const rows = await this.prisma.interaction.groupBy({
      by: ['channel'],
      where: { organizationId: user.organizationId, unread: true },
      _count: { _all: true },
    });
    return {
      channels: rows.map((r) => ({ channel: r.channel, unread: r._count._all })),
      totalUnread: rows.reduce((s, r) => s + r._count._all, 0),
    };
  }

  /** Multi-touch journey analytics over EngagementConversation.journeyPathJson. */
  async journeyAnalytics(user: AuthUser) {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const rows = await this.prisma.engagementConversation.findMany({
      where: {
        organizationId: user.organizationId,
        lastInteractionAt: { gte: since },
      },
      select: {
        id: true,
        journeyPathJson: true,
        inquiries: {
          where: { deletedAt: null, status: { in: ['converted', 'qualified'] } },
          select: { id: true, status: true },
          take: 1,
        },
      },
      take: 2000,
    });

    const pathCounts = new Map<string, { count: number; converted: number }>();
    for (const row of rows) {
      const path = Array.isArray(row.journeyPathJson)
        ? (row.journeyPathJson as string[])
        : [];
      if (!path.length) continue;
      const key = path.join(' → ');
      const cur = pathCounts.get(key) ?? { count: 0, converted: 0 };
      cur.count += 1;
      if (row.inquiries.length) cur.converted += 1;
      pathCounts.set(key, cur);
    }

    const journeys = [...pathCounts.entries()]
      .map(([path, v]) => ({ path, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40);

    return { windowDays: 90, journeys, totalConversations: rows.length };
  }

  connectorCapabilities() {
    return CONNECTOR_CAPABILITIES;
  }

  /** Phone Interaction shell — notes land on Conversation; never creates Lead directly. */
  async logPhoneCall(
    user: AuthUser,
    input: {
      partyId?: string | null;
      contactName?: string | null;
      phone?: string | null;
      summary: string;
      direction?: 'inbound' | 'outbound' | 'missed';
      conversationId?: string | null;
    },
  ) {
    let partyId = input.partyId ?? null;
    if (!partyId && (input.phone || input.contactName)) {
      if (input.phone) {
        const byPhone = await this.prisma.party.findFirst({
          where: {
            organizationId: user.organizationId,
            phone: input.phone,
            deletedAt: null,
          },
        });
        if (byPhone) partyId = byPhone.id;
      }
      if (!partyId) {
        const org = await this.prisma.organization.findUnique({
          where: { id: user.organizationId },
          select: { settingsJson: true },
        });
        const settings = (org?.settingsJson ?? {}) as Record<string, unknown>;
        const privacy = (settings.privacy ?? {}) as Record<string, unknown>;
        const marketingDefault = privacy.marketingConsentDefault === true;
        const party = await this.prisma.party.create({
          data: {
            organizationId: user.organizationId,
            type: 'individual',
            displayName: input.contactName?.trim() || input.phone || 'Phone caller',
            phone: input.phone ?? null,
            marketingOptIn: marketingDefault,
            createdBy: user.sub,
          },
        });
        partyId = party.id;
      }
    }

    const direction = input.direction ?? 'inbound';
    return this.create(user, {
      channel: 'phone',
      partyId,
      conversationId: input.conversationId ?? null,
      outcome: 'pending',
      unread: direction !== 'outbound',
      summary: input.summary,
      staffUserId: user.sub,
      rawPayloadJson: {
        direction: direction === 'outbound' ? 'outbound' : 'inbound',
        phoneDirection: direction,
        phone: input.phone ?? null,
        contactName: input.contactName ?? null,
      },
    });
  }
}
