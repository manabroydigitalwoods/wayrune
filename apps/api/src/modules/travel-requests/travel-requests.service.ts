import { BadRequestException, Injectable } from '@nestjs/common';
import type { CreateTravelRequestInput } from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PartiesService } from '../parties/parties.service';
import { LeadsService } from '../leads/leads.service';
import { InquiriesService } from '../inquiries/inquiries.service';
import { InteractionsService } from '../interactions/interactions.service';
import { OrganizationsService } from '../organizations/organizations.service';
import type { AuthUser } from '../../common/helpers';

/**
 * Experience layer: a single "Travel Request" intake that atomically resolves
 * (or creates) the Party and creates the Lead + Inquiry the sales user would
 * otherwise assemble by hand. Pure orchestration over existing services.
 */
@Injectable()
export class TravelRequestsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private parties: PartiesService,
    private leads: LeadsService,
    private inquiries: InquiriesService,
    private interactions: InteractionsService,
    private organizations: OrganizationsService,
  ) {}

  async create(user: AuthUser, input: CreateTravelRequestInput) {
    await this.organizations.ensureDefaultLeadSources(user.organizationId);
    const {
      partyId,
      contact,
      sourceKey,
      channelKey,
      priority,
      interactionId,
      conversationId,
      campaignId,
      ...travel
    } = input;
    const channel = (channelKey?.trim() || 'phone') as
      | 'phone'
      | 'whatsapp'
      | 'website'
      | 'email'
      | 'walk_in'
      | 'import'
      | 'api'
      | 'facebook'
      | 'instagram';
    const acquisition =
      sourceKey?.trim() && sourceKey !== 'skip' ? sourceKey.trim() : undefined;

    if (!partyId && !contact?.name?.trim()) {
      throw new BadRequestException('Select an existing customer or enter a name');
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      let resolvedPartyId: string | null = partyId ?? null;
      let partyCreated = false;
      let partyName: string | null = null;
      let partyEmail: string | null = null;
      let partyPhone: string | null = null;

      if (partyId) {
        const party = await tx.party.findFirst({
          where: { id: partyId, organizationId: user.organizationId, deletedAt: null },
        });
        if (!party) throw new BadRequestException('Selected customer was not found');
        partyName = party.displayName;
        partyEmail = party.email;
        partyPhone = party.phone;
      } else {
        const { party, created } = await this.parties.matchOrCreate(
          user.organizationId,
          user.sub,
          { name: contact!.name!.trim(), email: contact?.email, phone: contact?.phone },
          tx,
        );
        resolvedPartyId = party.id;
        partyCreated = created;
        partyName = party.displayName;
        partyEmail = party.email;
        partyPhone = party.phone;
      }

      let resolvedConversationId = conversationId ?? null;
      if (!resolvedConversationId && interactionId) {
        const ix = await tx.interaction.findFirst({
          where: { id: interactionId, organizationId: user.organizationId },
          select: { conversationId: true },
        });
        resolvedConversationId = ix?.conversationId ?? null;
      }
      if (!resolvedConversationId) {
        const conv = await this.interactions.resolveOrCreateConversation(
          user.organizationId,
          {
            partyId: resolvedPartyId,
            channel,
            subject: this.buildTitle(travel.destinations, partyName),
            assignedUserId: user.sub,
          },
          tx,
        );
        resolvedConversationId = conv.id;
      }

      const { lead } = await this.leads.create(
        user,
        {
          title: this.buildTitle(travel.destinations, partyName),
          contactName: contact?.name?.trim() ?? partyName ?? undefined,
          email: contact?.email ?? partyEmail ?? null,
          phone: contact?.phone ?? partyPhone ?? null,
          partyId: resolvedPartyId,
          sourceKey: acquisition,
          channel,
          campaignId: campaignId ?? null,
          priority: priority ?? 'normal',
        },
        tx,
      );

      const inquiry = await this.inquiries.create(
        user,
        { ...travel, partyId: resolvedPartyId, leadId: lead.id },
        tx,
      );

      await tx.inquiry.update({
        where: { id: inquiry.id },
        data: { engagementConversationId: resolvedConversationId },
      });

      let resolvedInteractionId: string;
      if (interactionId) {
        const existing = await tx.interaction.findFirst({
          where: { id: interactionId, organizationId: user.organizationId },
        });
        if (!existing) throw new BadRequestException('Interaction was not found');
        const updated = await tx.interaction.update({
          where: { id: existing.id },
          data: {
            channel,
            acquisitionSourceKey: acquisition ?? existing.acquisitionSourceKey,
            partyId: resolvedPartyId,
            leadId: lead.id,
            inquiryId: inquiry.id,
            conversationId: resolvedConversationId,
            outcome: 'created_travel_request',
            unread: false,
            summary: this.buildTitle(travel.destinations, partyName),
            staffUserId: user.sub,
          },
        });
        resolvedInteractionId = updated.id;
      } else {
        const interaction = await this.interactions.create(
          user,
          {
            channel,
            acquisitionSourceKey: acquisition ?? null,
            partyId: resolvedPartyId,
            leadId: lead.id,
            inquiryId: inquiry.id,
            conversationId: resolvedConversationId,
            outcome: 'created_travel_request',
            unread: false,
            summary: this.buildTitle(travel.destinations, partyName),
          },
          tx,
        );
        resolvedInteractionId = interaction.id;
      }

      return {
        resolvedPartyId,
        partyCreated,
        leadId: lead.id,
        inquiry,
        interactionId: resolvedInteractionId,
        conversationId: resolvedConversationId,
      };
    });

    if (outcome.partyCreated && outcome.resolvedPartyId) {
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.sub,
        action: 'party.create',
        entityType: 'party',
        entityId: outcome.resolvedPartyId,
        metadata: { via: 'travel_request' },
      });
    }
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'lead.create',
      entityType: 'lead',
      entityId: outcome.leadId,
      metadata: { via: 'travel_request' },
    });
    await this.leads.syncLeadToHubspot(user.organizationId, outcome.leadId);
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'inquiry.create',
      entityType: 'inquiry',
      entityId: outcome.inquiry.id,
      metadata: { via: 'travel_request' },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'travel_request.create',
      entityType: 'inquiry',
      entityId: outcome.inquiry.id,
      metadata: {
        partyId: outcome.resolvedPartyId,
        leadId: outcome.leadId,
        partyCreated: outcome.partyCreated,
        interactionId: outcome.interactionId,
        conversationId: outcome.conversationId,
        channel,
        sourceKey: acquisition ?? null,
      },
    });

    return {
      partyId: outcome.resolvedPartyId,
      leadId: outcome.leadId,
      inquiryId: outcome.inquiry.id,
      inquiryNumber: outcome.inquiry.inquiryNumber,
      missingFields: outcome.inquiry.missingFieldsJson,
      interactionId: outcome.interactionId,
      conversationId: outcome.conversationId,
    };
  }

  private buildTitle(
    destinations: CreateTravelRequestInput['destinations'],
    partyName: string | null,
  ): string {
    const names = (destinations ?? [])
      .map((d) => (typeof d === 'string' ? d : d?.name))
      .filter((n): n is string => Boolean(n));
    const where = names.length ? names.join(', ') : 'Travel';
    return partyName ? `${where} — ${partyName}` : `${where} enquiry`;
  }
}
