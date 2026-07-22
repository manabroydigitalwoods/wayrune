import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { hasPermission } from '@wayrune/auth';
import { parseInboxChatSettings, isInboxChatWithinHours } from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartiesService } from '../parties/parties.service';
import { InteractionsService } from '../interactions/interactions.service';
import { OutboxService } from '../outbox/outbox.service';
import { MetaCloudMessagingProvider } from '../messaging/meta-cloud.messaging';
import {
  mapMetaMessageTemplate,
  matchExistingWhatsAppTemplate,
} from './whatsapp-template-sync';
import {
  evaluateWhatsappCustomerSession,
  WHATSAPP_CUSTOMER_SESSION_MS,
} from '../messaging/whatsapp-customer-session';
import { OrgIdentityService } from '../organizations/org-identity.service';
import {
  pickRoundRobinSlot,
  resolveActivePool,
} from './round-robin-assign';
import {
  parseFollowUpAtDate,
  shouldSyncTaskDueFromLeadFollowUp,
} from '../tasks/lead-follow-up-sync';
import type { AuthUser } from '../../common/helpers';
import type {
  CreateCampaignInput,
  CreateCustomFieldDefinitionInput,
  CreateLeadInput,
  CreateLeadActivityInput,
  CreateLeadSourceInput,
  CreatePipelineInput,
  CreatePipelineStageInput,
  CreateWhatsAppTemplateInput,
  ReplyEmailInput,
  ReplyInstagramInput,
  ReplyWebsiteInput,
  ReplyWhatsappInput,
  ReplyWhatsappTemplateInput,
  UpdateCampaignInput,
  UpdateCustomFieldDefinitionInput,
  UpdateLeadActivityInput,
  UpdateLeadInput,
  UpdateLeadSourceInput,
  UpdatePipelineInput,
  UpdateWhatsAppTemplateInput,
  WebhookLeadInput,
} from '@wayrune/contracts';
import {
  mapAcquisitionFromIngest,
  resolveIngestChannelKey,
} from '@wayrune/contracts';
import {
  emptyLeadFacets,
  filtersOmittingFacet,
  type LeadFacetsResult,
  type LeadListFilters,
} from './lead-facets';

/** Prefer E.164-ish storage; fall back to last 10 digits for India mobiles. */
function normalizeWhatsappPhone(waId: string): string | null {
  const digits = waId.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return `+${digits}`;
  return digits;
}

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    @Inject(forwardRef(() => PartiesService)) private parties: PartiesService,
    @Inject(forwardRef(() => InteractionsService))
    private interactions: InteractionsService,
    private outbox: OutboxService,
    private messaging: MetaCloudMessagingProvider,
    private orgIdentity: OrgIdentityService,
  ) {}

  private async defaultPipeline(
    organizationId: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const pipeline = await db.pipeline.findFirst({
      where: { organizationId, isDefault: true },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    if (!pipeline || !pipeline.stages.length) {
      throw new BadRequestException('Default pipeline not configured');
    }
    return pipeline;
  }

  async findDuplicates(organizationId: string, email?: string | null, phone?: string | null) {
    if (!email && !phone) return [];
    return this.prisma.lead.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      take: 10,
    });
  }

  async create(user: AuthUser, input: CreateLeadInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    if (input.idempotencyKey) {
      const existing = await db.lead.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: user.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return { lead: existing, duplicates: [], idempotent: true };
    }

    const pipeline = await this.defaultPipeline(user.organizationId, db);
    const stage = pipeline.stages[0];
    let sourceId: string | undefined;
    if (input.sourceKey) {
      const source = await db.leadSource.upsert({
        where: {
          organizationId_key: { organizationId: user.organizationId, key: input.sourceKey },
        },
        create: {
          organizationId: user.organizationId,
          key: input.sourceKey,
          name: input.sourceKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        },
        update: {},
      });
      sourceId = source.id;
    }

    const duplicates = await this.findDuplicates(user.organizationId, input.email, input.phone);

    let ownerId = input.ownerId ?? user.sub;
    if (!input.ownerId) {
      const autoOwner = await this.resolveRoundRobinOwner(user.organizationId, db, {
        channel: input.channel ?? undefined,
        acquisitionKey: input.sourceKey,
      });
      if (autoOwner) ownerId = autoOwner;
    }

    const sourceLabel = input.sourceKey
      ? input.sourceKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    const followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
    const createdBodyLines = ['Lead created'];
    if (sourceLabel) createdBodyLines.push(`Source: ${sourceLabel}`);
    if (followUpAt) {
      createdBodyLines.push(
        `Follow-up scheduled for ${followUpAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`,
      );
    }

    const lead = await db.lead.create({
      data: {
        organizationId: user.organizationId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        partyId: input.partyId ?? null,
        sourceId: sourceId ?? null,
        campaignId: input.campaignId ?? null,
        channel: input.channel ?? null,
        ownerId,
        title: input.title,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        priority: input.priority,
        tagsJson: input.tags ?? [],
        followUpAt,
        idempotencyKey: input.idempotencyKey ?? null,
        customFieldsJson: input.customFields
          ? (input.customFields as Prisma.InputJsonValue)
          : undefined,
        createdBy: user.sub,
        updatedBy: user.sub,
        stageHistory: {
          create: { stageId: stage.id, changedBy: user.sub, note: 'Created' },
        },
        activities: {
          create: {
            organizationId: user.organizationId,
            type: 'system',
            body: createdBodyLines.join('\n'),
            createdBy: user.sub,
          },
        },
      },
      include: {
        owner: { select: { id: true, fullName: true } },
      },
    });

    // Skip the audit (and downstream sync) when composed inside a caller's
    // transaction; the caller records it after the whole unit of work commits.
    if (!tx) {
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.sub,
        action: 'lead.create',
        entityType: 'lead',
        entityId: lead.id,
      });
    }

    return { lead, duplicates, idempotent: false };
  }

  async list(
    user: AuthUser,
    page = 1,
    pageSize = 20,
    stageKey?: string,
    q?: string,
    priority?: string,
    followUp?: string,
    owner?: string,
    followUpFrom?: string | null,
    followUpTo?: string | null,
    sourceKey?: string,
    campaignId?: string,
  ) {
    const where = this.leadListWhere(user, {
      stageKey,
      q,
      priority,
      followUp,
      owner,
      followUpFrom,
      followUpTo,
      sourceKey,
      campaignId,
    });

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          stage: true,
          source: true,
          party: { select: { id: true, displayName: true } },
          owner: { select: { id: true, fullName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * Cross-filtered facet counts for the Filter menu.
   * Each dimension is counted with every active filter except that dimension’s own selection.
   */
  async facets(user: AuthUser, filters: LeadListFilters): Promise<LeadFacetsResult> {
    const result = emptyLeadFacets();

    const [
      sourceRows,
      stageRows,
      priorityRows,
      ownerRows,
      overdueCount,
      noneCount,
      campaignRows,
      sources,
      stages,
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['sourceId'],
        where: this.leadListWhere(user, filtersOmittingFacet(filters, 'source')),
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['stageId'],
        where: this.leadListWhere(user, filtersOmittingFacet(filters, 'stage')),
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['priority'],
        where: this.leadListWhere(user, filtersOmittingFacet(filters, 'priority')),
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['ownerId'],
        where: this.leadListWhere(user, filtersOmittingFacet(filters, 'owner')),
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: this.leadListWhere(user, {
          ...filtersOmittingFacet(filters, 'followUp'),
          followUp: 'overdue',
        }),
      }),
      this.prisma.lead.count({
        where: this.leadListWhere(user, {
          ...filtersOmittingFacet(filters, 'followUp'),
          followUp: 'none',
        }),
      }),
      this.prisma.lead.groupBy({
        by: ['campaignId'],
        where: this.leadListWhere(user, filtersOmittingFacet(filters, 'campaign')),
        _count: { _all: true },
      }),
      this.prisma.leadSource.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, key: true },
      }),
      this.prisma.pipelineStage.findMany({
        where: { pipeline: { organizationId: user.organizationId } },
        select: { id: true, key: true },
      }),
    ]);

    const sourceKeyById = new Map(sources.map((s) => [s.id, s.key]));
    for (const row of sourceRows) {
      const key = row.sourceId ? sourceKeyById.get(row.sourceId) ?? 'unknown' : 'unknown';
      result.source[key] = (result.source[key] ?? 0) + row._count._all;
    }

    const stageKeyById = new Map(stages.map((s) => [s.id, s.key]));
    for (const row of stageRows) {
      const key = stageKeyById.get(row.stageId) ?? 'unknown';
      result.stage[key] = (result.stage[key] ?? 0) + row._count._all;
    }

    for (const row of priorityRows) {
      result.priority[row.priority] = row._count._all;
    }

    for (const row of ownerRows) {
      if (!row.ownerId) {
        result.owner.unassigned = (result.owner.unassigned ?? 0) + row._count._all;
        continue;
      }
      result.owner[row.ownerId] = row._count._all;
      if (row.ownerId === user.sub) {
        result.owner.me = row._count._all;
      }
    }

    if (overdueCount > 0) result.followUp.overdue = overdueCount;
    if (noneCount > 0) result.followUp.none = noneCount;

    for (const row of campaignRows) {
      if (!row.campaignId) continue;
      result.campaign[row.campaignId] = row._count._all;
    }

    return result;
  }

  /** Shared list/board filter where — keep Queue Standard filters in sync. */
  private leadListWhere(
    user: AuthUser,
    input: LeadListFilters & {
      /** When set, board columns already scope by stageId — skip stageKey. */
      stageId?: string;
      pipelineId?: string;
    },
  ): Prisma.LeadWhereInput {
    const ownOnly =
      hasPermission(user.permissions, 'lead.read.own') &&
      !hasPermission(user.permissions, 'lead.read');

    const openStagesOnly =
      input.followUp === 'overdue' ||
      input.followUp === 'none' ||
      (input.followUp !== 'overdue' &&
        input.followUp !== 'none' &&
        Boolean(input.followUpFrom || input.followUpTo));

    const followUpAtFilter =
      input.followUp === 'overdue'
        ? { lt: new Date() }
        : input.followUp === 'none'
          ? null
          : input.followUpFrom || input.followUpTo
            ? {
                ...(input.followUpFrom && /^\d{4}-\d{2}-\d{2}$/.test(input.followUpFrom)
                  ? { gte: new Date(`${input.followUpFrom}T00:00:00.000Z`) }
                  : {}),
                ...(input.followUpTo && /^\d{4}-\d{2}-\d{2}$/.test(input.followUpTo)
                  ? { lte: new Date(`${input.followUpTo}T23:59:59.999Z`) }
                  : {}),
              }
            : undefined;

    const stageFilter = (() => {
      const key = input.stageKey && !input.stageId ? input.stageKey : undefined;
      if (!key && !openStagesOnly) return undefined;
      return {
        ...(key ? { key } : {}),
        ...(openStagesOnly ? { isWon: false, isLost: false } : {}),
      };
    })();

    const ownerFilter = (() => {
      if (ownOnly) return { ownerId: user.sub };
      if (!input.owner) return undefined;
      if (input.owner === 'me') return { ownerId: user.sub };
      if (input.owner === 'unassigned') return { ownerId: null };
      return { ownerId: input.owner };
    })();

    return {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(input.pipelineId ? { pipelineId: input.pipelineId } : {}),
      ...(input.stageId ? { stageId: input.stageId } : {}),
      ...(ownerFilter ?? {}),
      ...(stageFilter ? { stage: stageFilter } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(followUpAtFilter === null
        ? { followUpAt: null }
        : followUpAtFilter
          ? { followUpAt: followUpAtFilter }
          : {}),
      ...(input.sourceKey ? { source: { key: input.sourceKey } } : {}),
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      ...(input.q
        ? {
            OR: [
              { title: { contains: input.q } },
              { contactName: { contains: input.q } },
              { email: { contains: input.q } },
              { phone: { contains: input.q } },
            ],
          }
        : {}),
    };
  }

  async get(user: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: {
        stage: true,
        source: true,
        campaign: true,
        party: true,
        owner: { select: { id: true, fullName: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
        stageHistory: { include: { stage: true }, orderBy: { createdAt: 'desc' } },
        inquiries: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            inquiryNumber: true,
            status: true,
            travelType: true,
            domesticOrIntl: true,
            origin: true,
            originPlaceId: true,
            originJson: true,
            destinationsJson: true,
            startDate: true,
            endDate: true,
            nights: true,
            adults: true,
            children: true,
            infants: true,
            budgetAmount: true,
            budgetCurrency: true,
            hotelCategory: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const ownOnly =
      hasPermission(user.permissions, 'lead.read.own') &&
      !hasPermission(user.permissions, 'lead.read');
    if (ownOnly && lead.ownerId !== user.sub) {
      throw new ForbiddenException('Cannot view this lead');
    }

    const actorIds = [
      ...new Set(
        lead.activities.map((a) => a.createdBy).filter((v): v is string => Boolean(v)),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const actorById = new Map(actors.map((u) => [u.id, u]));

    const activityIds = lead.activities.map((a) => a.id);
    const documents = activityIds.length
      ? await this.prisma.document.findMany({
          where: {
            organizationId: user.organizationId,
            entityType: 'activity',
            entityId: { in: activityIds },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const docsByActivity = new Map<string, typeof documents>();
    for (const doc of documents) {
      const list = docsByActivity.get(doc.entityId) ?? [];
      list.push(doc);
      docsByActivity.set(doc.entityId, list);
    }

    return {
      ...lead,
      activities: lead.activities.map((activity) => ({
        ...activity,
        actor: activity.createdBy ? actorById.get(activity.createdBy) ?? null : null,
        documents: (docsByActivity.get(activity.id) ?? []).map((doc) => ({
          ...doc,
          contentUrl: `/api/v1/files/${doc.id}/content`,
        })),
      })),
    };
  }

  async updateStage(user: AuthUser, id: string, stageKey: string, note?: string | null, lostReason?: string | null) {
    const lead = await this.get(user, id);
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { pipelineId: lead.pipelineId, key: stageKey },
    });
    if (!stage) throw new BadRequestException('Unknown stage');

    if (stage.isLost && !lostReason?.trim()) {
      throw new BadRequestException('Lost reason is required');
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        stageId: stage.id,
        lostReason: stage.isLost ? lostReason ?? null : null,
        updatedBy: user.sub,
        stageHistory: {
          create: { stageId: stage.id, changedBy: user.sub, note: note ?? null },
        },
        activities: {
          create: {
            organizationId: user.organizationId,
            type: 'status_change',
            body: stage.isLost
              ? `Stage changed to ${stage.name}: ${lostReason}`
              : `Stage changed to ${stage.name}`,
            createdBy: user.sub,
          },
        },
      },
      include: { stage: true },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.stage_change',
      entityType: 'lead',
      entityId: id,
      metadata: { stageKey, lostReason: stage.isLost ? lostReason : undefined },
    });

    return updated;
  }

  /**
   * Move lead to Won if it is still open (not already Won/Lost).
   * Used when inquiry converts to trip or a quote is accepted.
   */
  async markWonIfEligible(
    user: AuthUser,
    leadId: string | null | undefined,
    reason: string,
  ): Promise<{ markedWon: boolean; skippedReason?: string }> {
    if (!leadId) return { markedWon: false, skippedReason: 'no_lead' };

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId: user.organizationId, deletedAt: null },
      include: { stage: true },
    });
    if (!lead) return { markedWon: false, skippedReason: 'lead_not_found' };
    if (lead.stage?.isWon) return { markedWon: false, skippedReason: 'already_won' };
    if (lead.stage?.isLost) return { markedWon: false, skippedReason: 'already_lost' };

    const wonStage = await this.prisma.pipelineStage.findFirst({
      where: { pipelineId: lead.pipelineId, isWon: true },
    });
    if (!wonStage) return { markedWon: false, skippedReason: 'no_won_stage' };

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        stageId: wonStage.id,
        lostReason: null,
        updatedBy: user.sub,
        stageHistory: {
          create: { stageId: wonStage.id, changedBy: user.sub, note: reason },
        },
        activities: {
          create: {
            organizationId: user.organizationId,
            type: 'status_change',
            body: `Marked Won (${reason})`,
            createdBy: user.sub,
          },
        },
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.auto_won',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { reason, stageKey: wonStage.key },
    });

    return { markedWon: true };
  }

  /**
   * Keeps the linked lead pipeline aligned with inquiry lifecycle. Only advances
   * early stages or marks lost — never pulls a lead back from proposal_sent or
   * negotiation unless reopening from lost.
   */
  async syncFromInquiry(
    user: AuthUser,
    leadId: string | null | undefined,
    inquiryStatus: 'open' | 'qualified' | 'lost',
    options?: { reason?: string; note?: string; tx?: Prisma.TransactionClient },
  ): Promise<{ synced: boolean; stageKey?: string }> {
    if (!leadId) return { synced: false };

    const db = options?.tx ?? this.prisma;
    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: user.organizationId, deletedAt: null },
      include: { stage: true },
    });
    if (!lead?.stage) return { synced: false };
    if (lead.stage.isWon) return { synced: false, stageKey: lead.stage.key };

    const targetKey =
      inquiryStatus === 'qualified'
        ? 'qualified'
        : inquiryStatus === 'lost'
          ? 'lost'
          : 'requirements_pending';

    const targetStage = await db.pipelineStage.findFirst({
      where: { pipelineId: lead.pipelineId, key: targetKey },
    });
    if (!targetStage) return { synced: false };

    if (lead.stageId === targetStage.id) {
      return { synced: false, stageKey: targetKey };
    }

    if (inquiryStatus === 'lost') {
      await this.applyLeadStage(db, user, lead, targetStage, {
        lostReason: options?.reason ?? null,
        note: options?.note ?? options?.reason ?? 'Inquiry marked lost',
        audit: !options?.tx,
      });
      return { synced: true, stageKey: targetKey };
    }

    const advancedStages = new Set(['proposal_sent', 'negotiation']);
    if (advancedStages.has(lead.stage.key)) {
      return { synced: false, stageKey: lead.stage.key };
    }

    if (inquiryStatus === 'qualified') {
      const eligible = new Set([
        'new',
        'attempted_contact',
        'contacted',
        'requirements_pending',
        'qualified',
        'lost',
      ]);
      if (!eligible.has(lead.stage.key)) {
        return { synced: false, stageKey: lead.stage.key };
      }
    }

    if (inquiryStatus === 'open') {
      if (lead.stage.isLost) {
        // Reopening a lost inquiry pulls the lead back to requirements capture.
      } else {
        const early = new Set(['new', 'attempted_contact', 'contacted']);
        if (!early.has(lead.stage.key)) {
          return { synced: false, stageKey: lead.stage.key };
        }
      }
    }

    await this.applyLeadStage(db, user, lead, targetStage, {
      lostReason: null,
      note: options?.note ?? `Synced from inquiry (${inquiryStatus})`,
      audit: !options?.tx,
    });
    return { synced: true, stageKey: targetKey };
  }

  private async applyLeadStage(
    db: PrismaService | Prisma.TransactionClient,
    user: AuthUser,
    lead: { id: string; organizationId: string; stage?: { name: string; isLost?: boolean } | null },
    stage: { id: string; key: string; name: string; isLost: boolean },
    options: { lostReason: string | null; note: string; audit: boolean },
  ) {
    await db.lead.update({
      where: { id: lead.id },
      data: {
        stageId: stage.id,
        lostReason: stage.isLost ? options.lostReason : null,
        updatedBy: user.sub,
        stageHistory: {
          create: { stageId: stage.id, changedBy: user.sub, note: options.note },
        },
        activities: {
          create: {
            organizationId: user.organizationId,
            type: 'status_change',
            body: stage.isLost
              ? `Stage changed to ${stage.name}: ${options.lostReason}`
              : `Stage changed to ${stage.name}`,
            createdBy: user.sub,
          },
        },
      },
    });

    if (options.audit) {
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.sub,
        action: 'lead.stage_change',
        entityType: 'lead',
        entityId: lead.id,
        metadata: { stageKey: stage.key, via: 'inquiry_sync', lostReason: options.lostReason },
      });
    }
  }

  async assign(user: AuthUser, id: string, ownerId: string) {
    await this.get(user, id);
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { ownerId, updatedBy: user.sub },
    });
    const flags = await this.notifications.orgNotifyFlags(user.organizationId);
    await this.notifications.notify({
      organizationId: user.organizationId,
      userId: ownerId,
      title: 'Lead assigned',
      body: `You were assigned lead: ${updated.title}`,
      linkPath: `/leads/${id}`,
      channel: flags.notifyOnLead ? 'both' : 'in_app',
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.assign',
      entityType: 'lead',
      entityId: id,
      metadata: { ownerId },
    });
    return updated;
  }

  async update(user: AuthUser, id: string, input: UpdateLeadInput) {
    await this.get(user, id);
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.partyId !== undefined ? { partyId: input.partyId } : {}),
        ...(input.campaignId !== undefined ? { campaignId: input.campaignId } : {}),
        ...(input.tags !== undefined ? { tagsJson: input.tags } : {}),
        ...(input.followUpAt !== undefined
          ? { followUpAt: input.followUpAt ? new Date(input.followUpAt) : null }
          : {}),
        ...(input.customFields !== undefined
          ? { customFieldsJson: input.customFields as Prisma.InputJsonValue }
          : {}),
        updatedBy: user.sub,
      },
      include: {
        stage: true,
        source: true,
        party: true,
        owner: { select: { id: true, fullName: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    await this.syncOpenLeadTaskDueFromFollowUp(user.organizationId, id, {
      followUpAtProvided: input.followUpAt !== undefined,
      followUpAt: input.followUpAt,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.update',
      entityType: 'lead',
      entityId: id,
    });
    return updated;
  }

  /** Push Lead.followUpAt onto the newest open lead-linked task (reverse of task→lead). */
  private async syncOpenLeadTaskDueFromFollowUp(
    organizationId: string,
    leadId: string,
    input: { followUpAtProvided: boolean; followUpAt?: string | null },
  ) {
    if (
      !shouldSyncTaskDueFromLeadFollowUp({
        followUpAtProvided: input.followUpAtProvided,
        followUpAt: input.followUpAt,
      })
    ) {
      return;
    }
    const dueAt = parseFollowUpAtDate(input.followUpAt);
    if (!dueAt) return;

    const openTask = await this.prisma.task.findFirst({
      where: {
        organizationId,
        entityType: 'lead',
        entityId: leadId,
        deletedAt: null,
        status: { not: 'done' },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    if (!openTask) return;

    await this.prisma.task.update({
      where: { id: openTask.id },
      data: { dueAt },
    });
  }

  /**
   * One-click: link lead to an existing client (email/phone match) or create a new client.
   */
  async convertToClient(user: AuthUser, id: string) {
    const lead = await this.get(user, id);

    if (lead.partyId && lead.party) {
      return {
        lead,
        party: lead.party,
        created: false,
        alreadyLinked: true,
      };
    }

    const email = lead.email?.trim().toLowerCase() || null;
    const phone = lead.phone?.trim() || null;
    const displayName = (lead.contactName?.trim() || lead.title?.trim() || '').trim();

    if (!displayName) {
      throw new BadRequestException('Add a contact name or title before converting to a client');
    }
    if (!email && !phone) {
      throw new BadRequestException('Add an email or phone so we can create or match a client');
    }

    const { party, created } = await this.parties.matchOrCreate(
      user.organizationId,
      user.sub,
      { name: displayName, email, phone },
    );

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { partyId: party.id, updatedBy: user.sub },
      include: {
        stage: true,
        source: true,
        party: true,
        owner: { select: { id: true, fullName: true } },
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        type: 'note',
        body: created
          ? `Converted to new client: ${party.displayName}`
          : `Linked to existing client: ${party.displayName}`,
        createdBy: user.sub,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.convert_to_client',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { partyId: party.id, created },
    });

    return {
      lead: updated,
      party,
      created,
      alreadyLinked: false,
    };
  }

  async addActivity(user: AuthUser, id: string, input: CreateLeadActivityInput) {
    await this.get(user, id);
    const activity = await this.prisma.activity.create({
      data: {
        organizationId: user.organizationId,
        leadId: id,
        type: input.type,
        body: input.body,
        createdBy: user.sub,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.activity',
      entityType: 'lead',
      entityId: id,
      metadata: { type: input.type },
    });
    return activity;
  }

  async updateActivity(
    user: AuthUser,
    leadId: string,
    activityId: string,
    input: UpdateLeadActivityInput,
  ) {
    await this.get(user, leadId);
    const existing = await this.prisma.activity.findFirst({
      where: {
        id: activityId,
        leadId,
        organizationId: user.organizationId,
      },
    });
    if (!existing) throw new NotFoundException('Activity not found');
    if (existing.type !== 'note' && existing.type !== 'email') {
      throw new BadRequestException('Only notes and emails can be edited');
    }
    const activity = await this.prisma.activity.update({
      where: { id: activityId },
      data: { body: input.body },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.activity.update',
      entityType: 'activity',
      entityId: activityId,
      metadata: { leadId, type: existing.type },
    });
    return activity;
  }

  async pipelineBoard(
    user: AuthUser,
    pageSize = 10,
    filters?: {
      stageKey?: string;
      q?: string;
      priority?: string;
      followUp?: string;
      owner?: string;
      followUpFrom?: string | null;
      followUpTo?: string | null;
      sourceKey?: string;
      campaignId?: string;
    },
  ) {
    const pipeline = await this.defaultPipeline(user.organizationId);
    const stages = filters?.stageKey
      ? pipeline.stages.filter((s) => s.key === filters.stageKey)
      : pipeline.stages;

    const columns = await Promise.all(
      stages.map(async (stage) => {
        const where = this.leadListWhere(user, {
          ...filters,
          stageId: stage.id,
          pipelineId: pipeline.id,
          // Column already scopes stage — don't also apply stageKey
          stageKey: undefined,
        });
        const [leads, total] = await Promise.all([
          this.prisma.lead.findMany({
            where,
            include: { stage: true, owner: { select: { id: true, fullName: true } } },
            orderBy: { updatedAt: 'desc' },
            take: pageSize,
          }),
          this.prisma.lead.count({ where }),
        ]);
        return {
          stage,
          leads,
          total,
          page: 1,
          pageSize,
          hasMore: total > leads.length,
        };
      }),
    );

    return {
      pipeline: { id: pipeline.id, name: pipeline.name, stages: pipeline.stages },
      columns,
    };
  }

  /**
   * Shared Interaction-first ingest (website webhook, WhatsApp, Facebook, email).
   * Does not create Lead/Inquiry until sales disposes via Inbox.
   */
  async ingestInboundTouch(
    organizationId: string,
    input: {
      channel: 'website' | 'whatsapp' | 'facebook' | 'email' | 'api' | 'instagram' | 'phone' | 'walk_in' | 'import' | 'google_business';
      summary: string;
      contactName?: string | null;
      phone?: string | null;
      email?: string | null;
      acquisitionKey?: string | null;
      idempotencyKey: string;
      rawPayload?: Record<string, unknown>;
    },
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, isOwner: true, isActive: true },
    });
    if (!membership) throw new BadRequestException('Organization has no owner');

    const fakeUser: AuthUser = {
      sub: membership.userId,
      email: '',
      organizationId,
      membershipId: membership.id,
      permissions: ['lead.write', 'lead.read', 'inquiry.write', 'party.write'],
    };

    const existing = await this.interactions.findByIdempotencyKey(
      organizationId,
      input.idempotencyKey,
    );
    if (existing) {
      return { interaction: existing, idempotent: true, partyId: existing.partyId };
    }

    const displayName =
      input.contactName?.trim() || input.summary?.trim() || 'Inbound visitor';

    let partyId: string | null = null;
    if (input.email || input.phone || input.contactName) {
      const { party } = await this.parties.matchOrCreate(
        organizationId,
        membership.userId,
        {
          name: displayName,
          email: input.email ?? null,
          phone: input.phone ?? null,
        },
      );
      partyId = party.id;
    }

    const interaction = await this.interactions.create(fakeUser, {
      channel: input.channel,
      acquisitionSourceKey: input.acquisitionKey ?? null,
      partyId,
      outcome: 'pending',
      unread: true,
      summary: input.summary,
      staffUserId: null,
      idempotencyKey: input.idempotencyKey,
      rawPayloadJson: input.rawPayload,
    });

    await this.audit.record({
      organizationId,
      actorUserId: membership.userId,
      action: 'interaction.ingest',
      entityType: 'interaction',
      entityId: interaction.id,
      metadata: {
        channel: input.channel,
        acquisition: input.acquisitionKey,
        idempotencyKey: input.idempotencyKey,
      },
    });

    try {
      await this.outbox.enqueue({
        organizationId,
        eventType: 'outbound.webhook',
        payload: {
          event: 'interaction.ingested',
          organizationId,
          interactionId: interaction.id,
          channel: input.channel,
          summary: input.summary,
          partyId: partyId ?? undefined,
        },
      });
    } catch {
      // Never fail ingest because outbound webhook enqueue failed
    }

    return { interaction, idempotent: false, partyId };
  }

  /**
   * Public website / Facebook / API ingest — Interaction-first into Inbox.
   */
  async ingestWebhook(
    organizationId: string,
    input: WebhookLeadInput,
    opts?: { sharedSecretHeader?: string },
  ) {
    const cfg = await this.websiteIngestConfig(organizationId);
    if (cfg.sharedSecret) {
      const provided = (opts?.sharedSecretHeader || '').trim();
      if (!provided || provided !== cfg.sharedSecret) {
        throw new ForbiddenException('Invalid webhook ingest secret');
      }
    }

    const channel = resolveIngestChannelKey({
      channelKey: input.channelKey,
      sourceKey: input.sourceKey,
    });
    const acquisition = mapAcquisitionFromIngest({
      acquisitionKey: input.acquisitionKey,
      utm: input.utm,
      sourceKey: input.sourceKey,
    });

    return this.ingestInboundTouch(organizationId, {
      channel,
      summary: input.title,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      acquisitionKey: acquisition,
      idempotencyKey: input.idempotencyKey,
      rawPayload: {
        ...(input.customFields ?? {}),
        title: input.title,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone,
        sourceKey: input.sourceKey,
        channelKey: channel,
        acquisitionKey: acquisition,
        utm: input.utm,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  private async websiteIngestConfig(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
    const integrations = (settings.integrations ?? {}) as Record<string, unknown>;
    const website = (integrations.websiteIngest ?? {}) as Record<string, unknown>;
    return {
      sharedSecret: typeof website.sharedSecret === 'string' ? website.sharedSecret : '',
    };
  }

  private async whatsappConfig(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
    const integrations = (settings.integrations ?? {}) as Record<string, unknown>;
    const wa = (integrations.whatsapp ?? {}) as Record<string, unknown>;
    return {
      enabled: Boolean(wa.enabled),
      phoneNumberId: typeof wa.phoneNumberId === 'string' ? wa.phoneNumberId : '',
      accessToken: typeof wa.accessToken === 'string' ? wa.accessToken : '',
      verifyToken: typeof wa.verifyToken === 'string' ? wa.verifyToken : '',
      appSecret: typeof wa.appSecret === 'string' ? wa.appSecret : '',
    };
  }

  /** Meta webhook verification challenge. */
  async verifyWhatsappWebhook(
    organizationId: string,
    query: { mode?: string; verify_token?: string; challenge?: string },
  ) {
    const cfg = await this.whatsappConfig(organizationId);
    if (!cfg.enabled || !cfg.verifyToken) {
      throw new ForbiddenException('WhatsApp ingest is not enabled');
    }
    if (query.mode !== 'subscribe' || query.verify_token !== cfg.verifyToken) {
      throw new ForbiddenException('WhatsApp verify token mismatch');
    }
    return query.challenge ?? '';
  }

  /**
   * Meta Cloud API inbound messages → pending WhatsApp Interactions.
   * Always ack success for non-message payloads so Meta does not retry forever.
   */
  async ingestWhatsappWebhook(
    organizationId: string,
    body: unknown,
    opts?: { signatureHeader?: string; rawBody?: Buffer },
  ) {
    const cfg = await this.whatsappConfig(organizationId);
    if (!cfg.enabled) {
      throw new ForbiddenException('WhatsApp ingest is not enabled');
    }

    if (cfg.appSecret && !cfg.accessToken.startsWith('seed-demo-')) {
      if (!opts?.rawBody?.length || !opts.signatureHeader?.startsWith('sha256=')) {
        throw new ForbiddenException('Missing WhatsApp signature');
      }
      const expected = createHmac('sha256', cfg.appSecret)
        .update(opts.rawBody)
        .digest('hex');
      const provided = opts.signatureHeader.slice('sha256='.length);
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(provided, 'utf8');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ForbiddenException('Invalid WhatsApp signature');
      }
    }

    const payload = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            metadata?: { phone_number_id?: string };
            contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
            messages?: Array<{
              id?: string;
              from?: string;
              type?: string;
              text?: { body?: string };
              image?: { id?: string; mime_type?: string; caption?: string };
              document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
            }>;
          };
        }>;
      }>;
    };

    const results: Array<{ interactionId: string; idempotent: boolean }> = [];

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages?.length) continue;

        if (
          cfg.phoneNumberId &&
          value.metadata?.phone_number_id &&
          value.metadata.phone_number_id !== cfg.phoneNumberId
        ) {
          continue;
        }

        const contactName = value.contacts?.[0]?.profile?.name ?? null;

        for (const msg of value.messages) {
          if (!msg.id) continue;

          let summary: string | null = null;
          let rawExtra: Record<string, unknown> = {};
          let isOptOut = false;

          if (msg.type === 'text') {
            const text = msg.text?.body?.trim();
            if (!text) continue;
            summary = text.length > 280 ? `${text.slice(0, 277)}…` : text;
            rawExtra = { text };
            const normalized = text.toUpperCase();
            isOptOut = normalized === 'STOP' || normalized === 'UNSUBSCRIBE';
          } else if (msg.type === 'image') {
            const caption = msg.image?.caption?.trim();
            summary = caption || 'WhatsApp image';
            rawExtra = {
              text: caption || null,
              mediaType: 'image',
              mediaId: msg.image?.id,
              mimeType: msg.image?.mime_type,
              caption: caption || null,
            };
          } else if (msg.type === 'document') {
            const caption = msg.document?.caption?.trim();
            summary =
              caption ||
              `WhatsApp document${msg.document?.filename ? `: ${msg.document.filename}` : ''}`;
            rawExtra = {
              text: caption || null,
              mediaType: 'document',
              mediaId: msg.document?.id,
              mimeType: msg.document?.mime_type,
              filename: msg.document?.filename,
              caption: caption || null,
            };
          } else {
            continue;
          }

          const waId = msg.from || value.contacts?.[0]?.wa_id || '';
          const phone = normalizeWhatsappPhone(waId);

          const ingested = await this.ingestInboundTouch(organizationId, {
            channel: 'whatsapp',
            summary,
            contactName,
            phone,
            acquisitionKey: null,
            idempotencyKey: `wa:${msg.id}`,
            rawPayload: {
              messageId: msg.id,
              from: msg.from,
              waId,
              contactName,
              phoneNumberId: value.metadata?.phone_number_id,
              ...rawExtra,
            },
          });
          results.push({
            interactionId: ingested.interaction.id,
            idempotent: ingested.idempotent,
          });

          if (isOptOut && ingested.partyId) {
            await this.prisma.party.update({
              where: { id: ingested.partyId },
              data: {
                optedOutAt: new Date(),
                marketingOptIn: false,
                whatsappOptIn: false,
              },
            });
          }
        }
      }
    }

    return { ok: true, processed: results.length, results };
  }

  private async facebookConfig(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
    const integrations = (settings.integrations ?? {}) as Record<string, unknown>;
    const fb = (integrations.facebook ?? {}) as Record<string, unknown>;
    return {
      enabled: Boolean(fb.enabled),
      pageId: typeof fb.pageId === 'string' ? fb.pageId : '',
      accessToken: typeof fb.accessToken === 'string' ? fb.accessToken : '',
      verifyToken: typeof fb.verifyToken === 'string' ? fb.verifyToken : '',
      appSecret: typeof fb.appSecret === 'string' ? fb.appSecret : '',
    };
  }

  private async emailIngestConfig(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
    const integrations = (settings.integrations ?? {}) as Record<string, unknown>;
    const email = (integrations.emailIngest ?? {}) as Record<string, unknown>;
    return {
      enabled: Boolean(email.enabled),
      sharedSecret: typeof email.sharedSecret === 'string' ? email.sharedSecret : '',
    };
  }

  async verifyFacebookWebhook(
    organizationId: string,
    query: { mode?: string; verify_token?: string; challenge?: string },
  ) {
    const cfg = await this.facebookConfig(organizationId);
    if (!cfg.enabled || !cfg.verifyToken) {
      throw new ForbiddenException('Facebook Lead Ads ingest is not enabled');
    }
    if (query.mode !== 'subscribe' || query.verify_token !== cfg.verifyToken) {
      throw new ForbiddenException('Facebook verify token mismatch');
    }
    return query.challenge ?? '';
  }

  /**
   * Meta Lead Ads webhook (leadgen) or legacy manual JSON payload.
   * leadgen notifications fetch field data from Graph API when accessToken is set.
   */
  async ingestFacebookWebhook(
    organizationId: string,
    body: unknown,
    opts?: { signatureHeader?: string; rawBody?: Buffer },
  ) {
    const cfg = await this.facebookConfig(organizationId);
    if (!cfg.enabled) {
      throw new ForbiddenException('Facebook Lead Ads ingest is not enabled');
    }
    if (cfg.appSecret && !cfg.accessToken.startsWith('seed-demo-')) {
      this.assertHubSignature(cfg.appSecret, opts);
    }

    const payload = (body ?? {}) as Record<string, unknown>;

    // Legacy / test JSON (no Meta envelope)
    if (
      !payload.entry &&
      (payload.full_name || payload.email || payload.phone_number || payload.leadgen_id)
    ) {
      return this.ingestFacebookLeadFields(organizationId, payload);
    }

    const envelope = body as {
      entry?: Array<{
        id?: string;
        changes?: Array<{
          field?: string;
          value?: {
            leadgen_id?: string;
            page_id?: string;
            form_id?: string;
            ad_id?: string;
            adgroup_id?: string;
            created_time?: number;
          };
        }>;
      }>;
    };

    const results: Array<{ interactionId: string; idempotent: boolean }> = [];

    for (const entry of envelope.entry ?? []) {
      if (cfg.pageId && entry.id && entry.id !== cfg.pageId) continue;
      for (const change of entry.changes ?? []) {
        if (change.field && change.field !== 'leadgen') continue;
        const leadgenId = change.value?.leadgen_id;
        if (!leadgenId) continue;

        let fields: Record<string, unknown> = {
          leadgen_id: leadgenId,
          page_id: change.value?.page_id,
          form_id: change.value?.form_id,
          ad_id: change.value?.ad_id,
        };

        if (cfg.accessToken && !cfg.accessToken.startsWith('seed-demo-')) {
          try {
            const fetched = await this.fetchFacebookLead(leadgenId, cfg.accessToken);
            fields = { ...fields, ...fetched };
          } catch {
            // Still create a pending touch with leadgen id so sales can follow up
            fields.title = fields.title || 'Facebook Lead (details pending)';
          }
        } else if (cfg.accessToken.startsWith('seed-demo-')) {
          fields.full_name = fields.full_name || 'Demo Facebook Lead';
          fields.email = fields.email || 'fb.lead@example.com';
          fields.phone_number = fields.phone_number || '+919988776655';
          fields.title = fields.title || 'Facebook Lead Ads — demo form';
        } else {
          fields.title = 'Facebook Lead (configure access token to pull fields)';
        }

        const ingested = await this.ingestFacebookLeadFields(organizationId, fields);
        results.push({
          interactionId: ingested.interaction.id,
          idempotent: ingested.idempotent,
        });
      }
    }

    return { ok: true, processed: results.length, results };
  }

  private assertHubSignature(
    appSecret: string,
    opts?: { signatureHeader?: string; rawBody?: Buffer },
  ) {
    if (!opts?.rawBody?.length || !opts.signatureHeader?.startsWith('sha256=')) {
      throw new ForbiddenException('Missing Facebook signature');
    }
    const expected = createHmac('sha256', appSecret).update(opts.rawBody).digest('hex');
    const provided = opts.signatureHeader.slice('sha256='.length);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid Facebook signature');
    }
  }

  private async fetchFacebookLead(leadgenId: string, accessToken: string) {
    const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}`);
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      throw new Error(`Graph lead fetch failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      id?: string;
      field_data?: Array<{ name?: string; values?: string[] }>;
      created_time?: string;
    };
    const mapped: Record<string, unknown> = { leadgen_id: data.id || leadgenId };
    for (const field of data.field_data ?? []) {
      const name = (field.name || '').toLowerCase();
      const value = field.values?.[0];
      if (!name || value == null) continue;
      mapped[name] = value;
      if (name.includes('full_name') || name === 'name' || name === 'full name') {
        mapped.full_name = value;
      }
      if (name.includes('email')) mapped.email = value;
      if (name.includes('phone')) mapped.phone_number = value;
    }
    return mapped;
  }

  private async ingestFacebookLeadFields(organizationId: string, fields: Record<string, unknown>) {
    const contactName =
      (typeof fields.full_name === 'string' && fields.full_name) ||
      (typeof fields.name === 'string' && fields.name) ||
      null;
    const email = typeof fields.email === 'string' ? fields.email : null;
    const phone =
      typeof fields.phone_number === 'string'
        ? fields.phone_number
        : typeof fields.phone === 'string'
          ? fields.phone
          : null;
    const isInstagram = this.isInstagramLeadFields(fields);
    const title =
      (typeof fields.title === 'string' && fields.title) ||
      contactName ||
      (isInstagram ? 'Instagram Lead' : 'Facebook Lead');
    const leadgenId =
      typeof fields.leadgen_id === 'string'
        ? fields.leadgen_id
        : typeof fields.id === 'string'
          ? fields.id
          : `fb-${Date.now()}`;
    const campaignName =
      typeof fields.campaign_name === 'string'
        ? fields.campaign_name
        : typeof fields.ad_name === 'string'
          ? fields.ad_name
          : undefined;
    const campaignExternalId =
      typeof fields.campaign_id === 'string'
        ? fields.campaign_id
        : typeof fields.ad_id === 'string'
          ? String(fields.ad_id)
          : undefined;

    let campaignId: string | undefined;
    if (campaignName || campaignExternalId) {
      const campaign = await this.upsertCampaignFromIngest(
        organizationId,
        campaignName || campaignExternalId || 'Meta campaign',
        campaignExternalId,
      );
      campaignId = campaign.id;
    }

    const channel = isInstagram ? 'instagram' : 'facebook';
    const acquisitionKey = isInstagram ? 'instagram' : 'facebook';

    return this.ingestInboundTouch(organizationId, {
      channel,
      summary: title,
      contactName,
      email,
      phone,
      acquisitionKey,
      idempotencyKey: `fb:${leadgenId}`,
      rawPayload: {
        ...fields,
        title,
        campaignId,
        utm: {
          source: acquisitionKey,
          ...(campaignName || campaignExternalId
            ? { campaign: campaignName || campaignExternalId }
            : {}),
        },
      },
    });
  }

  private isInstagramLeadFields(fields: Record<string, unknown>) {
    const platform = String(fields.platform || fields.graph_source || fields.channel || '')
      .toLowerCase();
    if (platform.includes('instagram') || platform === 'ig') return true;
    const pageId = String(fields.page_id || '');
    if (pageId.toLowerCase().startsWith('ig_')) return true;
    const formId = String(fields.form_id || fields.form_name || '').toLowerCase();
    if (formId.includes('instagram') || formId.includes('_ig_')) return true;
    return false;
  }

  /** Forwarding / middleware webhook: email → Inbox as channel email. */
  async ingestEmailWebhook(
    organizationId: string,
    body: unknown,
    opts?: { sharedSecretHeader?: string },
  ) {
    const cfg = await this.emailIngestConfig(organizationId);
    if (!cfg.enabled) {
      throw new ForbiddenException('Email ingest is not enabled');
    }
    if (cfg.sharedSecret) {
      const provided = (opts?.sharedSecretHeader || '').trim();
      if (!provided || provided !== cfg.sharedSecret) {
        throw new ForbiddenException('Invalid email ingest secret');
      }
    }

    const payload = (body ?? {}) as Record<string, unknown>;
    const from =
      typeof payload.from === 'string'
        ? payload.from
        : typeof payload.fromEmail === 'string'
          ? payload.fromEmail
          : '';
    const fromName =
      typeof payload.fromName === 'string'
        ? payload.fromName
        : typeof payload.senderName === 'string'
          ? payload.senderName
          : null;
    const subject =
      typeof payload.subject === 'string' && payload.subject.trim()
        ? payload.subject.trim()
        : 'Email enquiry';
    const text =
      typeof payload.text === 'string'
        ? payload.text
        : typeof payload.body === 'string'
          ? payload.body
          : typeof payload.html === 'string'
            ? payload.html.replace(/<[^>]+>/g, ' ').trim()
            : '';
    const messageId =
      typeof payload.messageId === 'string'
        ? payload.messageId
        : typeof payload['message-id'] === 'string'
          ? payload['message-id']
          : `email-${Date.now()}`;

    if (!from && !text) {
      throw new BadRequestException('Email payload needs from and/or text');
    }

    const emailMatch = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = emailMatch?.[0] ?? (from.includes('@') ? from : null);
    const summary = text
      ? `${subject}: ${text.length > 240 ? `${text.slice(0, 237)}…` : text}`
      : subject;

    return this.ingestInboundTouch(organizationId, {
      channel: 'email',
      summary,
      contactName: fromName || email,
      email,
      phone: null,
      acquisitionKey: null,
      idempotencyKey: `email:${messageId}`,
      rawPayload: {
        from,
        fromName,
        subject,
        text,
        messageId,
        html: typeof payload.html === 'string' ? payload.html : undefined,
      },
    });
  }

  async importCsv(user: AuthUser, rows: Array<{ title: string; email?: string; phone?: string; contactName?: string }>) {
    const results = [];
    for (const row of rows) {
      const created = await this.create(user, {
        title: row.title,
        email: row.email ?? null,
        phone: row.phone ?? null,
        contactName: row.contactName ?? null,
        sourceKey: 'csv',
        channel: 'import',
        priority: 'normal',
        idempotencyKey: `csv:${user.organizationId}:${row.email ?? ''}:${row.phone ?? ''}:${row.title}`,
      });
      if (!created.idempotent) {
        await this.interactions.create(user, {
          channel: 'import',
          acquisitionSourceKey: 'csv',
          leadId: created.lead.id,
          partyId: created.lead.partyId,
          outcome: 'pending',
          unread: true,
          summary: row.title,
          idempotencyKey: `csv-interaction:${user.organizationId}:${created.lead.id}`,
        });
      }
      results.push(created);
    }
    return { imported: results.length, results };
  }

  async merge(user: AuthUser, primaryId: string, secondaryId: string) {
    if (primaryId === secondaryId) throw new ConflictException('Cannot merge lead into itself');
    const primary = await this.get(user, primaryId);
    const secondary = await this.get(user, secondaryId);

    await this.prisma.$transaction(async (tx) => {
      await tx.activity.updateMany({
        where: { leadId: secondary.id },
        data: { leadId: primary.id },
      });
      await tx.inquiry.updateMany({
        where: { leadId: secondary.id },
        data: { leadId: primary.id },
      });
      await tx.lead.update({
        where: { id: secondary.id },
        data: { deletedAt: new Date(), updatedBy: user.sub },
      });
      await tx.activity.create({
        data: {
          organizationId: user.organizationId,
          leadId: primary.id,
          type: 'system',
          body: `Merged lead ${secondary.title} into this lead`,
          createdBy: user.sub,
        },
      });
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.merge',
      entityType: 'lead',
      entityId: primaryId,
      metadata: { secondaryId },
    });

    return this.get(user, primaryId);
  }

  async reportBySource(user: AuthUser) {
    const leads = await this.prisma.lead.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      include: { source: true, owner: { select: { id: true, fullName: true } } },
    });
    const bySource: Record<string, number> = {};
    const byOwner: Record<string, number> = {};
    for (const lead of leads) {
      const sk = lead.source?.key ?? 'unknown';
      bySource[sk] = (bySource[sk] ?? 0) + 1;
      const ok = lead.owner?.fullName ?? 'Unassigned';
      byOwner[ok] = (byOwner[ok] ?? 0) + 1;
    }
    return { bySource, byOwner, total: leads.length };
  }

  async listLeadSources(user: AuthUser, includeInactive = false) {
    return this.prisma.leadSource.findMany({
      where: {
        organizationId: user.organizationId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createLeadSource(user: AuthUser, input: CreateLeadSourceInput) {
    try {
      return await this.prisma.leadSource.create({
        data: {
          organizationId: user.organizationId,
          name: input.name.trim(),
          key: input.key,
          isActive: true,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A source with this key already exists');
      }
      throw err;
    }
  }

  async updateLeadSource(user: AuthUser, id: string, input: UpdateLeadSourceInput) {
    const existing = await this.prisma.leadSource.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Lead source not found');
    return this.prisma.leadSource.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async listCampaigns(user: AuthUser) {
    return this.prisma.campaign.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createCampaign(user: AuthUser, input: CreateCampaignInput) {
    return this.prisma.campaign.create({
      data: {
        organizationId: user.organizationId,
        name: input.name.trim(),
        externalId: input.externalId ?? null,
      },
    });
  }

  async updateCampaign(user: AuthUser, id: string, input: UpdateCampaignInput) {
    const existing = await this.prisma.campaign.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Campaign not found');
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
      },
    });
  }

  async upsertCampaignFromIngest(
    organizationId: string,
    name: string,
    externalId?: string,
  ) {
    if (externalId) {
      const existing = await this.prisma.campaign.findFirst({
        where: { organizationId, externalId },
      });
      if (existing) {
        if (existing.name !== name) {
          return this.prisma.campaign.update({
            where: { id: existing.id },
            data: { name },
          });
        }
        return existing;
      }
    }
    const byName = await this.prisma.campaign.findFirst({
      where: { organizationId, name },
    });
    if (byName) {
      if (externalId && !byName.externalId) {
        return this.prisma.campaign.update({
          where: { id: byName.id },
          data: { externalId },
        });
      }
      return byName;
    }
    return this.prisma.campaign.create({
      data: { organizationId, name, externalId: externalId ?? null },
    });
  }

  private async resolveRoundRobinOwner(
    organizationId: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
    context?: { channel?: string; acquisitionKey?: string | null },
  ): Promise<string | null> {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    if (!org) return null;
    const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
    const leadsCfg = (settings.leads ?? {}) as Record<string, unknown>;
    const auto = (leadsCfg.autoAssign ?? {}) as Record<string, unknown>;
    if (auto.mode !== 'round_robin' && auto.mode !== 'rules') return null;

    if (auto.mode === 'rules') {
      return this.resolveRulesOwner(db, organizationId, settings, leadsCfg, auto, context);
    }

    const configuredIds = Array.isArray(auto.memberIds)
      ? auto.memberIds.filter((id): id is string => typeof id === 'string')
      : [];

    const memberships = await db.organizationMembership.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    const activeUserIds = memberships.map((m) => m.userId);
    const memberIds = resolveActivePool(configuredIds, activeUserIds);
    if (!memberIds.length) return null;

    const cursor = typeof auto.cursor === 'number' && auto.cursor >= 0 ? auto.cursor : 0;
    const pick = pickRoundRobinSlot({ memberIds, cursor });
    if (!pick) return null;

    await db.organization.update({
      where: { id: organizationId },
      data: {
        settingsJson: {
          ...settings,
          leads: {
            ...leadsCfg,
            autoAssign: {
              ...auto,
              mode: 'round_robin',
              memberIds: configuredIds.length ? configuredIds : undefined,
              cursor: pick.nextCursor,
              lastAssignedUserId: pick.ownerId,
            },
          },
        } as Prisma.InputJsonValue,
      },
    });

    return pick.ownerId;
  }

  /**
   * `rules` mode: pick the first rule matching this touch's channel/acquisitionKey
   * (rules with no channel/acquisitionKey match everything), then round-robin
   * within that rule's own memberIds/cursor.
   */
  private async resolveRulesOwner(
    db: PrismaService | Prisma.TransactionClient,
    organizationId: string,
    settings: Record<string, unknown>,
    leadsCfg: Record<string, unknown>,
    auto: Record<string, unknown>,
    context?: { channel?: string; acquisitionKey?: string | null },
  ): Promise<string | null> {
    const rules = Array.isArray(auto.rules) ? (auto.rules as Record<string, unknown>[]) : [];
    if (!rules.length) return null;

    const ruleIndex = rules.findIndex((rule) => {
      const ruleChannel = typeof rule.channel === 'string' ? rule.channel : undefined;
      const ruleAcquisition =
        typeof rule.acquisitionKey === 'string' ? rule.acquisitionKey : undefined;
      if (ruleChannel && ruleChannel !== context?.channel) return false;
      if (ruleAcquisition && ruleAcquisition !== context?.acquisitionKey) return false;
      return true;
    });
    if (ruleIndex === -1) return null;

    const rule = rules[ruleIndex]!;
    const configuredIds = Array.isArray(rule.memberIds)
      ? rule.memberIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (!configuredIds.length) return null;

    const memberships = await db.organizationMembership.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    const activeUserIds = memberships.map((m) => m.userId);
    const memberIds = resolveActivePool(configuredIds, activeUserIds);
    if (!memberIds.length) return null;

    const cursor = typeof rule.cursor === 'number' && rule.cursor >= 0 ? rule.cursor : 0;
    const pick = pickRoundRobinSlot({ memberIds, cursor });
    if (!pick) return null;

    const nextRules = rules.map((r, i) =>
      i === ruleIndex
        ? { ...r, cursor: pick.nextCursor, lastAssignedUserId: pick.ownerId }
        : r,
    );

    await db.organization.update({
      where: { id: organizationId },
      data: {
        settingsJson: {
          ...settings,
          leads: {
            ...leadsCfg,
            autoAssign: {
              ...auto,
              mode: 'rules',
              rules: nextRules,
            },
          },
        } as Prisma.InputJsonValue,
      },
    });

    return pick.ownerId;
  }

  async replyWhatsapp(user: AuthUser, interactionId: string, input: ReplyWhatsappInput) {
    const interaction = await this.interactions.get(user, interactionId);
    if (interaction.channel !== 'whatsapp') {
      throw new BadRequestException('Reply is only supported for WhatsApp touches');
    }

    const cfg = await this.whatsappConfig(user.organizationId);
    if (!cfg.enabled || !cfg.accessToken || !cfg.phoneNumberId) {
      throw new BadRequestException('WhatsApp Cloud API is not configured');
    }

    const toRaw =
      input.to?.trim() ||
      interaction.party?.phone ||
      (typeof (interaction.rawPayloadJson as Record<string, unknown> | null)?.from === 'string'
        ? String((interaction.rawPayloadJson as Record<string, unknown>).from)
        : '');
    const to = normalizeWhatsappPhone(toRaw);
    if (!to) throw new BadRequestException('No WhatsApp recipient phone on this touch');

    const digits = to.replace(/\D/g, '');
    const demo = cfg.accessToken.startsWith('seed-demo-');
    if (!demo) {
      const session = await this.resolveWhatsappCustomerSession(
        user.organizationId,
        interaction.partyId,
        digits,
      );
      if (!session.open) {
        throw new BadRequestException(
          'WhatsApp free-text replies need an open 24h customer session — send an approved template, or wait for the customer to message you.',
        );
      }
      await this.messaging.sendText({
        to: digits,
        text: input.text.trim(),
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
      });
    }

    await this.interactions.markRead(user, interactionId);

    const outbound = await this.interactions.create(user, {
      channel: 'whatsapp',
      acquisitionSourceKey: interaction.acquisitionSourceKey,
      partyId: interaction.partyId,
      leadId: interaction.leadId,
      inquiryId: interaction.inquiryId,
      conversationId: interaction.conversationId,
      outcome: 'pending',
      unread: false,
      summary: `Outbound: ${input.text.trim().slice(0, 240)}`,
      staffUserId: user.sub,
      rawPayloadJson: {
        direction: 'outbound',
        to: digits,
        text: input.text.trim(),
        inReplyTo: interactionId,
        demo,
      },
    });

    return { ok: true, outbound, demo, interactionId };
  }

  /** 24h Meta customer-service window for Inbox clock + fail-closed text reply. */
  async whatsappCustomerSession(user: AuthUser, interactionId: string) {
    const interaction = await this.interactions.get(user, interactionId);
    if (interaction.channel !== 'whatsapp') {
      throw new BadRequestException('Session applies only to WhatsApp touches');
    }

    const cfg = await this.whatsappConfig(user.organizationId);
    const demo = Boolean(
      cfg.enabled && cfg.accessToken?.startsWith('seed-demo-'),
    );

    const toRaw =
      interaction.party?.phone ||
      (typeof (interaction.rawPayloadJson as Record<string, unknown> | null)?.from === 'string'
        ? String((interaction.rawPayloadJson as Record<string, unknown>).from)
        : '') ||
      (typeof (interaction.rawPayloadJson as Record<string, unknown> | null)?.to === 'string'
        ? String((interaction.rawPayloadJson as Record<string, unknown>).to)
        : '');
    const to = normalizeWhatsappPhone(toRaw);
    if (!to) {
      return {
        open: demo,
        remainingMs: demo ? WHATSAPP_CUSTOMER_SESSION_MS : 0,
        expiresAt: null as string | null,
        lastInboundAt: null as string | null,
        digits: null as string | null,
        demo,
      };
    }
    const digits = to.replace(/\D/g, '');
    const session = await this.resolveWhatsappCustomerSession(
      user.organizationId,
      interaction.partyId,
      digits,
    );
    if (demo) {
      return {
        open: true,
        remainingMs: Math.max(session.remainingMs, WHATSAPP_CUSTOMER_SESSION_MS),
        expiresAt: session.expiresAt?.toISOString() ?? null,
        lastInboundAt: session.lastInboundAt?.toISOString() ?? null,
        digits,
        demo: true,
      };
    }
    return {
      open: session.open,
      remainingMs: session.remainingMs,
      expiresAt: session.expiresAt?.toISOString() ?? null,
      lastInboundAt: session.lastInboundAt?.toISOString() ?? null,
      digits,
      demo: false,
    };
  }

  private async resolveWhatsappCustomerSession(
    organizationId: string,
    partyId: string | null | undefined,
    digits: string,
    now: Date = new Date(),
  ) {
    const since = new Date(now.getTime() - WHATSAPP_CUSTOMER_SESSION_MS);
    const rows = await this.prisma.interaction.findMany({
      where: {
        organizationId,
        channel: 'whatsapp',
        createdAt: { gte: since },
        ...(partyId ? { partyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { createdAt: true, rawPayloadJson: true },
    });
    return evaluateWhatsappCustomerSession(rows, digits, now);
  }

  /**
   * Send an approved Meta template — required for the first outbound message,
   * or once the 24h customer-session window has lapsed. Marketing/utility
   * templates require the party to still be opted in.
   */
  async replyWhatsappTemplate(
    user: AuthUser,
    interactionId: string,
    input: ReplyWhatsappTemplateInput,
  ) {
    const interaction = await this.interactions.get(user, interactionId);
    if (interaction.channel !== 'whatsapp') {
      throw new BadRequestException('Reply is only supported for WhatsApp touches');
    }
    if (interaction.party && interaction.party.marketingOptIn === false) {
      throw new ForbiddenException('This contact has not opted in to WhatsApp marketing messages');
    }
    if (interaction.party?.optedOutAt) {
      throw new ForbiddenException('This contact has opted out of WhatsApp messages');
    }

    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: input.templateId, organizationId: user.organizationId, isActive: true },
    });
    if (!template) throw new NotFoundException('Template not found');

    const cfg = await this.whatsappConfig(user.organizationId);
    if (!cfg.enabled || !cfg.accessToken || !cfg.phoneNumberId) {
      throw new BadRequestException('WhatsApp Cloud API is not configured');
    }

    const toRaw =
      input.to?.trim() ||
      interaction.party?.phone ||
      (typeof (interaction.rawPayloadJson as Record<string, unknown> | null)?.from === 'string'
        ? String((interaction.rawPayloadJson as Record<string, unknown>).from)
        : '');
    const to = normalizeWhatsappPhone(toRaw);
    if (!to) throw new BadRequestException('No WhatsApp recipient phone on this touch');

    const digits = to.replace(/\D/g, '');
    await this.messaging.sendTemplate({
      to: digits,
      phoneNumberId: cfg.phoneNumberId,
      accessToken: cfg.accessToken,
      templateName: template.metaTemplateName,
      languageCode: template.languageCode,
      bodyParameters: input.bodyParameters,
    });

    await this.interactions.markRead(user, interactionId);

    const outbound = await this.interactions.create(user, {
      channel: 'whatsapp',
      acquisitionSourceKey: interaction.acquisitionSourceKey,
      partyId: interaction.partyId,
      leadId: interaction.leadId,
      inquiryId: interaction.inquiryId,
      outcome: 'pending',
      unread: false,
      summary: `Outbound template: ${template.name}`,
      staffUserId: user.sub,
      rawPayloadJson: {
        direction: 'outbound',
        to: digits,
        text: `[Template: ${template.name}]`,
        templateId: template.id,
        inReplyTo: interactionId,
      },
    });

    return { ok: true, outbound, interactionId };
  }

  async listWhatsAppTemplates(user: AuthUser, includeInactive = false) {
    return this.prisma.whatsAppTemplate.findMany({
      where: {
        organizationId: user.organizationId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createWhatsAppTemplate(user: AuthUser, input: CreateWhatsAppTemplateInput) {
    try {
      return await this.prisma.whatsAppTemplate.create({
        data: {
          organizationId: user.organizationId,
          name: input.name.trim(),
          metaTemplateName: input.metaTemplateName.trim(),
          languageCode: input.languageCode.trim(),
          bodyPreview: input.bodyPreview ?? null,
          variableCount: input.variableCount,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A template with this name already exists');
      }
      throw err;
    }
  }

  async updateWhatsAppTemplate(user: AuthUser, id: string, input: UpdateWhatsAppTemplateInput) {
    const existing = await this.prisma.whatsAppTemplate.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Template not found');
    return this.prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.metaTemplateName !== undefined
          ? { metaTemplateName: input.metaTemplateName.trim() }
          : {}),
        ...(input.languageCode !== undefined ? { languageCode: input.languageCode.trim() } : {}),
        ...(input.bodyPreview !== undefined ? { bodyPreview: input.bodyPreview } : {}),
        ...(input.variableCount !== undefined ? { variableCount: input.variableCount } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  /** Pull Meta WABA message_templates into local WhatsAppTemplate rows. */
  async syncWhatsAppTemplatesFromMeta(user: AuthUser) {
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    const settings =
      org?.settingsJson &&
      typeof org.settingsJson === 'object' &&
      !Array.isArray(org.settingsJson)
        ? (org.settingsJson as Record<string, unknown>)
        : {};
    const integrations =
      settings.integrations &&
      typeof settings.integrations === 'object' &&
      !Array.isArray(settings.integrations)
        ? (settings.integrations as Record<string, unknown>)
        : {};
    const wa =
      integrations.whatsapp &&
      typeof integrations.whatsapp === 'object' &&
      !Array.isArray(integrations.whatsapp)
        ? (integrations.whatsapp as Record<string, unknown>)
        : {};
    const accessToken =
      typeof wa.accessToken === 'string' ? wa.accessToken.trim() : '';
    const wabaId =
      typeof wa.whatsappBusinessAccountId === 'string'
        ? wa.whatsappBusinessAccountId.trim()
        : typeof wa.wabaId === 'string'
          ? wa.wabaId.trim()
          : '';
    if (!accessToken) {
      throw new BadRequestException(
        'WhatsApp access token is required — save it under Integrations → WhatsApp',
      );
    }
    if (!wabaId) {
      throw new BadRequestException(
        'WhatsApp Business Account ID is required to sync templates from Meta',
      );
    }

    const remote = await this.messaging.listMessageTemplates({
      wabaId,
      accessToken,
    });
    const existing = await this.prisma.whatsAppTemplate.findMany({
      where: { organizationId: user.organizationId },
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of remote) {
      const mapped = mapMetaMessageTemplate(row);
      if (!mapped) {
        skipped += 1;
        continue;
      }
      const hit = matchExistingWhatsAppTemplate(
        existing,
        mapped.metaTemplateName,
        mapped.languageCode,
      );
      if (hit) {
        await this.prisma.whatsAppTemplate.update({
          where: { id: hit.id },
          data: {
            bodyPreview: mapped.bodyPreview,
            variableCount: mapped.variableCount,
            isActive: mapped.isActive,
            metaTemplateName: mapped.metaTemplateName,
            languageCode: mapped.languageCode,
          },
        });
        updated += 1;
      } else {
        let name = mapped.name;
        const nameTaken = existing.some(
          (e) => e.name.trim().toLowerCase() === name.toLowerCase(),
        );
        if (nameTaken) {
          name = `${mapped.metaTemplateName}_${mapped.languageCode}_${Date.now().toString(36)}`;
        }
        const createdRow = await this.prisma.whatsAppTemplate.create({
          data: {
            organizationId: user.organizationId,
            name,
            metaTemplateName: mapped.metaTemplateName,
            languageCode: mapped.languageCode,
            bodyPreview: mapped.bodyPreview,
            variableCount: mapped.variableCount,
            isActive: mapped.isActive,
          },
        });
        existing.push(createdRow);
        created += 1;
      }
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'whatsapp.templates.sync',
      entityType: 'organization',
      entityId: user.organizationId,
      metadata: { created, updated, skipped, remote: remote.length },
    });

    return {
      created,
      updated,
      skipped,
      remote: remote.length,
      templates: await this.listWhatsAppTemplates(user, true),
    };
  }

  /**
   * Reply to an inbound email touch over SMTP (via outbox worker), threading
   * onto the original message using its Message-ID.
   */
  async replyEmail(user: AuthUser, interactionId: string, input: ReplyEmailInput) {
    const interaction = await this.interactions.get(user, interactionId);
    if (interaction.channel !== 'email') {
      throw new BadRequestException('Reply is only supported for email touches');
    }

    const raw = (interaction.rawPayloadJson as Record<string, unknown> | null) ?? {};
    const to =
      (typeof raw.from === 'string' && raw.from) ||
      interaction.party?.email ||
      '';
    if (!to) throw new BadRequestException('No email recipient on this touch');

    const inReplyTo = typeof raw.messageId === 'string' ? raw.messageId : undefined;
    const subject =
      typeof raw.subject === 'string' && raw.subject.trim()
        ? `Re: ${raw.subject.trim().replace(/^Re:\s*/i, '')}`
        : 'Re: Your enquiry';

    await this.outbox.enqueue({
      organizationId: user.organizationId,
      eventType: 'outbound.email.reply',
      payload: {
        to,
        subject,
        text: input.text.trim(),
        html: input.html ?? undefined,
        inReplyTo,
      },
    });

    await this.interactions.markRead(user, interactionId);

    const outbound = await this.interactions.create(user, {
      channel: 'email',
      acquisitionSourceKey: interaction.acquisitionSourceKey,
      partyId: interaction.partyId,
      leadId: interaction.leadId,
      inquiryId: interaction.inquiryId,
      conversationId: interaction.conversationId,
      outcome: 'pending',
      unread: false,
      summary: `Outbound: ${input.text.trim().slice(0, 240)}`,
      staffUserId: user.sub,
      rawPayloadJson: {
        direction: 'outbound',
        to,
        text: input.text.trim(),
        subject,
        inReplyTo: interactionId,
      },
    });

    return { ok: true, outbound, interactionId };
  }

  private async instagramConfig(organizationId: string) {
    const cfg = await this.facebookConfig(organizationId);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    const settings = (org?.settingsJson ?? {}) as Record<string, unknown>;
    const integrations = (settings.integrations ?? {}) as Record<string, unknown>;
    const fb = (integrations.facebook ?? {}) as Record<string, unknown>;
    return {
      ...cfg,
      instagramBusinessAccountId:
        typeof fb.instagramBusinessAccountId === 'string' ? fb.instagramBusinessAccountId : '',
    };
  }

  async verifyInstagramWebhook(
    organizationId: string,
    query: { mode?: string; verify_token?: string; challenge?: string },
  ) {
    const cfg = await this.instagramConfig(organizationId);
    if (!cfg.enabled || !cfg.verifyToken) {
      throw new ForbiddenException('Instagram ingest is not enabled');
    }
    if (query.mode !== 'subscribe' || query.verify_token !== cfg.verifyToken) {
      throw new ForbiddenException('Instagram verify token mismatch');
    }
    return query.challenge ?? '';
  }

  /**
   * Instagram DM webhook — same Graph subscription surface as Facebook
   * Messenger, keyed by `object: "instagram"` (or a messaging entry keyed by
   * the linked IG business account id).
   */
  async ingestInstagramWebhook(
    organizationId: string,
    body: unknown,
    opts?: { signatureHeader?: string; rawBody?: Buffer },
  ) {
    const cfg = await this.instagramConfig(organizationId);
    if (!cfg.enabled) {
      throw new ForbiddenException('Instagram ingest is not enabled');
    }
    if (cfg.appSecret && !cfg.accessToken.startsWith('seed-demo-')) {
      this.assertHubSignature(cfg.appSecret, opts);
    }

    const envelope = body as {
      object?: string;
      entry?: Array<{
        id?: string;
        messaging?: Array<{
          sender?: { id?: string };
          recipient?: { id?: string };
          timestamp?: number;
          message?: { mid?: string; text?: string; is_echo?: boolean };
        }>;
      }>;
    };

    const results: Array<{ interactionId: string; idempotent: boolean }> = [];

    for (const entry of envelope.entry ?? []) {
      if (
        cfg.instagramBusinessAccountId &&
        entry.id &&
        entry.id !== cfg.instagramBusinessAccountId
      ) {
        continue;
      }
      for (const event of entry.messaging ?? []) {
        if (event.message?.is_echo) continue;
        const mid = event.message?.mid;
        const text = event.message?.text?.trim();
        if (!mid || !text) continue;

        const ingested = await this.ingestInboundTouch(organizationId, {
          channel: 'instagram',
          summary: text.length > 280 ? `${text.slice(0, 277)}…` : text,
          acquisitionKey: 'instagram',
          idempotencyKey: `ig:${mid}`,
          rawPayload: {
            messageId: mid,
            senderId: event.sender?.id,
            text,
          },
        });
        results.push({
          interactionId: ingested.interaction.id,
          idempotent: ingested.idempotent,
        });
      }
    }

    return { ok: true, processed: results.length, results };
  }

  /** Reply on an Instagram DM via the Meta Graph send API (shared page token). */
  async replyInstagram(user: AuthUser, interactionId: string, input: ReplyInstagramInput) {
    const interaction = await this.interactions.get(user, interactionId);
    if (interaction.channel !== 'instagram') {
      throw new BadRequestException('Reply is only supported for Instagram touches');
    }

    const cfg = await this.instagramConfig(user.organizationId);
    if (!cfg.enabled || !cfg.accessToken) {
      throw new BadRequestException('Instagram ingest is not configured');
    }

    const raw = (interaction.rawPayloadJson as Record<string, unknown> | null) ?? {};
    const senderId = typeof raw.senderId === 'string' ? raw.senderId : '';
    if (!senderId) throw new BadRequestException('No Instagram sender on this touch');

    const demo = cfg.accessToken.startsWith('seed-demo-');
    if (!demo) {
      const url = new URL('https://graph.facebook.com/v21.0/me/messages');
      url.searchParams.set('access_token', cfg.accessToken);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: input.text.trim() },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new BadRequestException(
          `Instagram send failed (${res.status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
        );
      }
    }

    await this.interactions.markRead(user, interactionId);

    const outbound = await this.interactions.create(user, {
      channel: 'instagram',
      acquisitionSourceKey: interaction.acquisitionSourceKey,
      partyId: interaction.partyId,
      leadId: interaction.leadId,
      inquiryId: interaction.inquiryId,
      conversationId: interaction.conversationId,
      outcome: 'pending',
      unread: false,
      summary: `Outbound: ${input.text.trim().slice(0, 240)}`,
      staffUserId: user.sub,
      rawPayloadJson: {
        direction: 'outbound',
        senderId,
        text: input.text.trim(),
        inReplyTo: interactionId,
        demo,
      },
    });

    return { ok: true, outbound, demo, interactionId };
  }

  /**
   * Reply on a Website chat touch. Message is stored as an outbound Interaction;
   * the public widget polls and shows it to the visitor.
   */
  async replyWebsite(user: AuthUser, interactionId: string, input: ReplyWebsiteInput) {
    const interaction = await this.interactions.get(user, interactionId);
    if (interaction.channel !== 'website') {
      throw new BadRequestException('Reply is only supported for Website chat touches');
    }

    const text = input.text.trim();
    if (!text) throw new BadRequestException('Message is required');

    const raw = (interaction.rawPayloadJson as Record<string, unknown> | null) ?? {};
    await this.interactions.markRead(user, interactionId);

    const outbound = await this.interactions.create(user, {
      channel: 'website',
      acquisitionSourceKey: interaction.acquisitionSourceKey,
      partyId: interaction.partyId,
      leadId: interaction.leadId,
      inquiryId: interaction.inquiryId,
      conversationId: interaction.conversationId,
      outcome: 'pending',
      unread: false,
      summary: `Outbound: ${text.slice(0, 240)}`,
      staffUserId: user.sub,
      rawPayloadJson: {
        direction: 'outbound',
        text,
        inReplyTo: interactionId,
        widgetId: typeof raw.widgetId === 'string' ? raw.widgetId : null,
        siteId: typeof raw.siteId === 'string' ? raw.siteId : null,
        source: typeof raw.source === 'string' ? raw.source : 'embed',
      },
    });

    return {
      ok: true,
      outbound,
      interactionId,
      conversationId: outbound.conversationId ?? interaction.conversationId,
    };
  }

  /**
   * Public: visitor widget polls for agent outbound replies on their conversation.
   */
  async widgetMessages(
    organizationId: string,
    opts: {
      publicKey: string;
      conversationId?: string | null;
      email?: string | null;
      phone?: string | null;
      after?: string | null;
    },
  ) {
    await this.widgetConfig(organizationId, opts.publicKey);

    let conversationId =
      typeof opts.conversationId === 'string' && opts.conversationId.trim()
        ? opts.conversationId.trim()
        : null;

    if (!conversationId && (opts.email || opts.phone)) {
      const email = opts.email?.trim() || '';
      const phoneRaw = opts.phone?.trim() || '';
      const digits = phoneRaw.replace(/\D/g, '');
      const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
      const phoneOr: Array<{ phone: string } | { phone: { endsWith: string } }> = [];
      if (phoneRaw) phoneOr.push({ phone: phoneRaw });
      if (digits) phoneOr.push({ phone: digits });
      if (last10) {
        phoneOr.push({ phone: last10 });
        phoneOr.push({ phone: { endsWith: last10 } });
        if (last10.length === 10) phoneOr.push({ phone: `91${last10}` });
      }

      const party = await this.prisma.party.findFirst({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            ...(email ? [{ email }] : []),
            ...phoneOr,
          ],
        },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (party) {
        const recent = await this.prisma.interaction.findFirst({
          where: {
            organizationId,
            partyId: party.id,
            channel: 'website',
            conversationId: { not: null },
          },
          orderBy: { occurredAt: 'desc' },
          select: { conversationId: true },
        });
        conversationId = recent?.conversationId ?? null;
      }
    }

    if (!conversationId) {
      return {
        conversationId: null as string | null,
        messages: [] as Array<{
          id: string;
          text: string;
          at: string;
          direction: 'inbound' | 'outbound';
        }>,
      };
    }

    const conv = await this.prisma.engagementConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true },
    });
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    // Full thread for the widget (visitor inbound + agent outbound). Client dedupes by id.
    const rows = await this.prisma.interaction.findMany({
      where: {
        organizationId,
        conversationId,
        channel: 'website',
      },
      orderBy: { occurredAt: 'desc' },
      take: 80,
      select: {
        id: true,
        occurredAt: true,
        summary: true,
        rawPayloadJson: true,
      },
    });

    const messages = rows
      .map((row) => {
        const raw = (row.rawPayloadJson as Record<string, unknown> | null) ?? {};
        const direction =
          raw.direction === 'outbound'
            ? ('outbound' as const)
            : raw.direction === 'inbound'
              ? ('inbound' as const)
              : null;
        if (!direction) return null;
        const text =
          (typeof raw.text === 'string' && raw.text.trim()) ||
          (typeof raw.message === 'string' && raw.message.trim()) ||
          (typeof row.summary === 'string' &&
            row.summary
              .replace(/^Outbound:\s*/i, '')
              .replace(/^Website chat[^\n—]*[—–-]\s*/i, '')
              .trim()) ||
          '';
        if (!text) return null;
        return {
          id: row.id,
          text,
          at: row.occurredAt.toISOString(),
          direction,
        };
      })
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .reverse();

    return { conversationId, messages };
  }

  async listPipelines(user: AuthUser) {
    return this.prisma.pipeline.findMany({
      where: { organizationId: user.organizationId },
      include: { stages: { orderBy: { position: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createPipeline(user: AuthUser, input: CreatePipelineInput) {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.pipeline.updateMany({
          where: { organizationId: user.organizationId },
          data: { isDefault: false },
        });
      }
      return tx.pipeline.create({
        data: {
          organizationId: user.organizationId,
          name: input.name.trim(),
          isDefault: input.isDefault ?? false,
        },
        include: { stages: true },
      });
    });
  }

  async updatePipeline(user: AuthUser, id: string, input: UpdatePipelineInput) {
    const existing = await this.prisma.pipeline.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Pipeline not found');
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.pipeline.updateMany({
          where: { organizationId: user.organizationId },
          data: { isDefault: false },
        });
      }
      return tx.pipeline.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        },
        include: { stages: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async addPipelineStage(user: AuthUser, pipelineId: string, input: CreatePipelineStageInput) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, organizationId: user.organizationId },
      include: { stages: true },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    const position = input.position ?? pipeline.stages.length;
    try {
      return await this.prisma.pipelineStage.create({
        data: {
          pipelineId,
          name: input.name.trim(),
          key: input.key,
          position,
          isWon: input.isWon ?? false,
          isLost: input.isLost ?? false,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A stage with this key already exists on this pipeline');
      }
      throw err;
    }
  }

  async listCustomFieldDefinitions(user: AuthUser, entity?: 'lead' | 'party') {
    return this.prisma.customFieldDefinition.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        ...(entity ? { entity } : {}),
      },
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
    });
  }

  async createCustomFieldDefinition(user: AuthUser, input: CreateCustomFieldDefinitionInput) {
    try {
      return await this.prisma.customFieldDefinition.create({
        data: {
          organizationId: user.organizationId,
          entity: input.entity,
          key: input.key,
          label: input.label.trim(),
          fieldType: input.fieldType,
          optionsJson: input.optionsJson ?? undefined,
          required: input.required ?? false,
          position: input.position ?? 0,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A custom field with this key already exists for this entity');
      }
      throw err;
    }
  }

  async updateCustomFieldDefinition(
    user: AuthUser,
    id: string,
    input: UpdateCustomFieldDefinitionInput,
  ) {
    const existing = await this.prisma.customFieldDefinition.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Custom field not found');
    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.fieldType !== undefined ? { fieldType: input.fieldType } : {}),
        ...(input.optionsJson !== undefined ? { optionsJson: input.optionsJson } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async widgetConfig(organizationId: string, publicKey?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, settingsJson: true, brandingJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const branding = (org.brandingJson ?? {}) as Record<string, unknown>;
    const orgChat = parseInboxChatSettings(org.settingsJson);

    // Prefer PresenceChatWidget registry; fall back to legacy Integrations blob once.
    if (publicKey) {
      const row = await this.prisma.presenceChatWidget.findFirst({
        where: { organizationId: org.id, publicKey },
      });
      if (row) {
        if (!row.enabled) {
          throw new ForbiddenException('Conversation widget is not enabled');
        }
        return {
          organizationId: org.id,
          widgetId: row.id,
          widgetName: row.name,
          brandName: row.brandName?.trim() || org.name,
          // Accent lives under Inbox → Chat (org settings); chatflow override is ignored.
          primaryColor:
            orgChat.accentColor ||
            (typeof branding.primaryColor === 'string' && branding.primaryColor) ||
            row.primaryColor?.trim() ||
            '#0f766e',
          whatsappNumber: row.whatsappNumber?.trim() || null,
          defaultGreeting:
            row.defaultGreeting?.trim() || 'Need help planning your trip?',
          replyTimeHint: orgChat.availableReplyTime,
          allowDrag: orgChat.allowDrag,
          fontFamily: orgChat.fontFamily,
          placementSide: orgChat.placementSide,
          withinHours: isInboxChatWithinHours(orgChat),
          afterHoursMessage: orgChat.afterHoursMessage,
          modes: ['chat', 'contact', 'travel_enquiry', 'callback', 'whatsapp'] as const,
        };
      }
    }

    const settings = (org.settingsJson ?? {}) as Record<string, unknown>;
    const integrations = (settings.integrations ?? {}) as Record<string, unknown>;
    const widget = (integrations.conversationWidget ?? {}) as Record<string, unknown>;
    if (widget.enabled !== true) {
      throw new ForbiddenException('Conversation widget is not enabled');
    }
    const expected = typeof widget.publicKey === 'string' ? widget.publicKey : '';
    if (!expected || !publicKey || publicKey !== expected) {
      throw new ForbiddenException('Invalid widget public key');
    }
    return {
      organizationId: org.id,
      widgetId: null as string | null,
      widgetName: 'Default',
      brandName: (typeof widget.brandName === 'string' && widget.brandName) || org.name,
      primaryColor:
        orgChat.accentColor ||
        (typeof branding.primaryColor === 'string' && branding.primaryColor) ||
        (typeof widget.primaryColor === 'string' && widget.primaryColor) ||
        '#0f766e',
      whatsappNumber:
        typeof widget.whatsappNumber === 'string' ? widget.whatsappNumber : null,
      defaultGreeting:
        (typeof widget.defaultGreeting === 'string' && widget.defaultGreeting) ||
        'Need help planning your trip?',
      replyTimeHint: orgChat.availableReplyTime,
      allowDrag: orgChat.allowDrag,
      fontFamily: orgChat.fontFamily,
      placementSide: orgChat.placementSide,
      withinHours: isInboxChatWithinHours(orgChat),
      afterHoursMessage: orgChat.afterHoursMessage,
      modes: ['chat', 'contact', 'travel_enquiry', 'callback', 'whatsapp'] as const,
    };
  }

  /**
   * Public conversation widget ingest.
   * Invariant: creates Interaction only (never Lead/Inquiry/Trip).
   */
  async ingestWidget(input: {
    organizationId: string;
    publicKey: string;
    mode: 'chat' | 'contact' | 'travel_enquiry' | 'callback' | 'whatsapp';
    message?: string | null;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    destinations?: string | null;
    idempotencyKey: string;
    formKey?: string | null;
    widgetId?: string | null;
    siteId?: string | null;
    path?: string | null;
    pageUrl?: string | null;
    referrer?: string | null;
    source?: 'presence' | 'embed';
  }) {
    const org = await this.orgIdentity.resolveRef(input.organizationId);
    const config = await this.widgetConfig(org.id, input.publicKey);

    let widgetRow =
      config.widgetId != null
        ? await this.prisma.presenceChatWidget.findFirst({
            where: { id: config.widgetId, organizationId: org.id },
          })
        : null;
    if (!widgetRow && input.widgetId) {
      widgetRow = await this.prisma.presenceChatWidget.findFirst({
        where: { id: input.widgetId, organizationId: org.id, publicKey: input.publicKey },
      });
    }

    let siteName: string | null = null;
    if (input.siteId) {
      const site = await this.prisma.presenceSite.findFirst({
        where: { id: input.siteId, organizationId: org.id },
        select: { name: true },
      });
      siteName = site?.name ?? null;
    }

    const widgetName = widgetRow?.name || config.widgetName || 'Widget';
    const modeLabel: Record<string, string> = {
      chat: 'Website chat',
      contact: 'Contact form',
      travel_enquiry: 'Travel enquiry',
      callback: 'Callback request',
      whatsapp: 'WhatsApp handoff',
    };
    const visitorText = input.message?.trim() || '';
    const summary =
      visitorText ||
      [
        `${modeLabel[input.mode] || input.mode} · ${widgetName}`,
        siteName ? `Site: ${siteName}` : null,
        input.path?.trim() ? `Path: ${input.path.trim()}` : null,
        input.formKey ? `Form: ${input.formKey}` : null,
        input.destinations?.trim() ? `Destination: ${input.destinations.trim()}` : null,
      ]
        .filter(Boolean)
        .join(' — ');
    return this.ingestInboundTouch(org.id, {
      channel: 'website',
      summary,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      acquisitionKey: 'website_widget',
      idempotencyKey: input.idempotencyKey,
      rawPayload: {
        direction: 'inbound',
        widgetMode: input.mode,
        formKey: input.formKey ?? null,
        message: input.message,
        destinations: input.destinations,
        text: input.message,
        widgetId: widgetRow?.id || config.widgetId || input.widgetId || null,
        widgetName,
        siteId: input.siteId ?? null,
        siteName,
        path: input.path ?? null,
        pageUrl: input.pageUrl ?? null,
        referrer: input.referrer ?? null,
        source: input.source || (input.siteId ? 'presence' : 'embed'),
      },
    });
  }
}
