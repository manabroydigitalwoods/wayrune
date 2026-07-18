import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import { hashPassword, verifyPassword } from '@wayrune/auth';
import type {
  CreateItineraryShareInput,
  ProposalFamilyAgencyReplyInput,
  ProposalFamilyJoinInput,
  ProposalFamilyMessageInput,
  ProposalFamilyReactInput,
  SaveItineraryVersionInput,
} from '@wayrune/contracts';
import { tripClimateSeason } from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QuotationsService } from '../quotations/quotations.service';
import { assertRateLimit } from '../../common/rate-limit';
import type { AuthUser } from '../../common/helpers';
import {
  collectContentPlaceIds,
  computePackageSummary,
  customerItineraryDays,
  customerQuoteStatuses,
  hydrateStoryFromKnowledge,
  orgDisplayPrefs,
  parseBusinessContact,
  parseItineraryStory,
  parseOrgBranding,
  parseOrgTrust,
  presentCustomerQuote,
} from '../../common/customer-proposal';

function generateFamilyPin() {
  return String(randomInt(100000, 1000000));
}

@Injectable()
export class ItinerariesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private quotations: QuotationsService,
  ) {}

  private async ensureItineraryForTrip(organizationId: string, tripId: string, createdBy?: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId, deletedAt: null },
      include: { itineraries: { include: { versions: { orderBy: { versionNumber: 'desc' } } } } },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const existing = trip.itineraries[0];
    if (existing) {
      if (existing.versions.length > 0) return existing;
      const version = await this.prisma.itineraryVersion.create({
        data: {
          itineraryId: existing.id,
          versionNumber: 1,
          label: 'Draft',
          status: 'draft',
          contentJson: { days: [] },
          createdBy: createdBy ?? null,
        },
      });
      return { ...existing, versions: [version] };
    }

    const itinerary = await this.prisma.itinerary.create({
      data: {
        organizationId,
        tripId,
        title: 'Main itinerary',
        versions: {
          create: {
            versionNumber: 1,
            label: 'Draft',
            status: 'draft',
            contentJson: { days: [] },
            createdBy: createdBy ?? null,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    return itinerary;
  }

  private async getItineraryForTrip(organizationId: string, tripId: string, createdBy?: string) {
    return this.ensureItineraryForTrip(organizationId, tripId, createdBy);
  }

  private async customerQuotationForTrip(
    organizationId: string,
    tripId: string,
    allowDraft: boolean,
  ) {
    for (const status of customerQuoteStatuses(allowDraft)) {
      const version = await this.prisma.quotationVersion.findFirst({
        where: {
          status,
          quotation: { tripId, organizationId },
        },
        include: { quotation: { select: { quoteNumber: true } } },
        orderBy: [{ acceptedAt: 'desc' }, { versionNumber: 'desc' }, { updatedAt: 'desc' }],
      });
      if (version) return presentCustomerQuote(version);
    }
    return null;
  }

  private async buildPreviewPayload(
    tripId: string,
    organizationId: string,
    versionId?: string,
    createdBy?: string,
    opts?: { allowDraftQuote?: boolean },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId, deletedAt: null },
      include: {
        organization: {
          select: { name: true, slug: true, settingsJson: true, brandingJson: true },
        },
        party: { select: { displayName: true } },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const itinerary = await this.ensureItineraryForTrip(organizationId, tripId, createdBy);
    const version = versionId
      ? itinerary.versions.find((v) => v.id === versionId)
      : itinerary.versions[0];
    if (!version) throw new NotFoundException('Itinerary version not found');

    const destinations = Array.isArray(trip.destinationsJson)
      ? (trip.destinationsJson as unknown[])
          .map((d) => {
            if (typeof d === 'string') return d;
            if (d && typeof d === 'object' && 'name' in d) {
              const name = (d as { name?: unknown }).name;
              return typeof name === 'string' ? name : null;
            }
            return null;
          })
          .filter((d): d is string => Boolean(d))
      : [];

    const quotation = await this.customerQuotationForTrip(
      organizationId,
      tripId,
      opts?.allowDraftQuote ?? false,
    );
    const days = customerItineraryDays(version.contentJson);
    let story = parseItineraryStory(version.contentJson);

    const placeIds = collectContentPlaceIds(version.contentJson);
    // Also resolve destination names from trip + day labels so edges connect city-level stays.
    const namedPlaces = [
      ...new Set(
        [
          ...days.map((d) => d.destination).filter(Boolean),
          ...days.flatMap((d) => d.items.map((i) => i.location).filter(Boolean)),
        ].filter((x): x is string => Boolean(x)),
      ),
    ];
    const namedRows =
      namedPlaces.length > 0
        ? await this.prisma.place.findMany({
            where: {
              deletedAt: null,
              isActive: true,
              name: { in: namedPlaces },
              OR: [{ isSystem: true }, { organizationId }],
            },
            select: { id: true, name: true },
            take: 50,
          })
        : [];
    for (const row of namedRows) placeIds.push(row.id);
    const uniquePlaceIds = [...new Set(placeIds)];

    const edges =
      uniquePlaceIds.length > 0
        ? await this.prisma.placeEdge.findMany({
            where: {
              fromPlaceId: { in: uniquePlaceIds },
              toPlaceId: { in: uniquePlaceIds },
            },
            select: {
              fromPlaceId: true,
              toPlaceId: true,
              durationMin: true,
              roadHint: true,
            },
          })
        : [];

    if (uniquePlaceIds.length) {
      const startIso = trip.startDate
        ? trip.startDate.toISOString().slice(0, 10)
        : null;
      const endIso = trip.endDate ? trip.endDate.toISOString().slice(0, 10) : null;
      const tripSeason = tripClimateSeason(startIso, endIso);
      const seasonFilter = [
        'all',
        ...(tripSeason
          ? [tripSeason]
          : (['winter', 'summer', 'monsoon', 'autumn'] as const)),
      ];
      const knowledge = await this.prisma.placeKnowledge.findMany({
        where: {
          placeId: { in: uniquePlaceIds },
          season: { in: [...seasonFilter] },
        },
        select: { kind: true, title: true, body: true, season: true },
        take: 40,
      });
      story = hydrateStoryFromKnowledge(story, knowledge, {
        startDate: startIso,
        endDate: endIso,
        placeName: destinations[0] || null,
      });
    }

    const packageSummary = computePackageSummary(days, quotation, story, { edges });
    if (packageSummary.destinations.length === 0 && destinations.length) {
      packageSummary.destinations = destinations;
    }

    return {
      trip: {
        id: trip.id,
        title: trip.title,
        tripNumber: trip.tripNumber,
        startDate: trip.startDate,
        endDate: trip.endDate,
        destinations:
          packageSummary.destinations.length > 0 ? packageSummary.destinations : destinations,
        clientName: trip.party?.displayName ?? null,
      },
      agency: {
        name: trip.organization.name,
        slug: trip.organization.slug,
      },
      branding: parseOrgBranding(trip.organization.brandingJson, trip.organization.name),
      contact: parseBusinessContact(trip.organization.settingsJson),
      trust: parseOrgTrust(trip.organization.settingsJson),
      display: orgDisplayPrefs(trip.organization.settingsJson),
      story,
      packageSummary,
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        label: version.label,
        status: version.status,
        createdAt: version.createdAt,
      },
      days,
      quotation,
      canAcceptQuote:
        quotation != null &&
        (quotation.status === 'sent' || quotation.status === 'approved'),
    };
  }

  async listVersions(organizationId: string, tripId: string) {
    const itinerary = await this.getItineraryForTrip(organizationId, tripId);
    return itinerary.versions;
  }

  async getStaffPreview(user: AuthUser, tripId: string, versionId?: string) {
    return this.buildPreviewPayload(tripId, user.organizationId, versionId, user.sub, {
      allowDraftQuote: true,
    });
  }

  async createShare(user: AuthUser, tripId: string, input: CreateItineraryShareInput) {
    const itinerary = await this.getItineraryForTrip(user.organizationId, tripId, user.sub);
    const version = input.versionId
      ? itinerary.versions.find((v) => v.id === input.versionId)
      : itinerary.versions[0];
    if (!version) throw new NotFoundException('Itinerary version not found');

    const token = randomBytes(24).toString('base64url');
    const expiresAt =
      input.expiresInDays != null
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const familyPin = input.familyPin || generateFamilyPin();
    const familyPinHash = await hashPassword(familyPin);

    const link = await this.prisma.itineraryShareLink.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        itineraryVersionId: version.id,
        token,
        familyPinHash,
        expiresAt,
        createdBy: user.sub,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'itinerary.share_create',
      entityType: 'trip',
      entityId: tripId,
      metadata: { shareId: link.id, versionId: version.id, familyPinSet: true },
    });

    return {
      id: link.id,
      token: link.token,
      path: `/p/itinerary/${link.token}`,
      expiresAt: link.expiresAt,
      /** Plain PIN shown once — send separately from the link (WhatsApp/SMS). */
      familyPin,
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        label: version.label,
      },
      createdAt: link.createdAt,
    };
  }

  async getPublicPreview(token: string) {
    const link = await this.requireActiveShareByToken(token);
    return this.buildPreviewPayload(link.tripId, link.organizationId, link.itineraryVersionId);
  }

  async acceptPublicQuote(token: string) {
    const link = await this.requireActiveShareByToken(token);
    assertRateLimit(`quote-accept:${link.token}`, 8, 15 * 60 * 1000);
    const result = await this.quotations.acceptFromPublicShare(
      link.organizationId,
      link.tripId,
      link.createdBy,
    );
    return {
      ...result,
      canAcceptQuote: false,
      message: result.alreadyAccepted
        ? 'This proposal was already accepted.'
        : 'Thank you — your proposal is accepted. We will follow up shortly.',
    };
  }

  /** Update the current draft in place (auto-save). Creates itinerary + v1 if none exists. */
  async autosave(user: AuthUser, tripId: string, input: SaveItineraryVersionInput) {
    const itinerary = await this.getItineraryForTrip(user.organizationId, tripId, user.sub);
    const latest = itinerary.versions[0];

    if (latest && latest.status === 'draft') {
      if (input.expectedLock != null && latest.versionLock !== input.expectedLock) {
        throw new ConflictException('Itinerary was modified by another user');
      }

      const existing = (latest.contentJson || {}) as { story?: unknown };
      const contentJson = {
        days: input.days,
        story: input.story !== undefined ? input.story : existing.story,
      };

      return this.prisma.itineraryVersion.update({
        where: { id: latest.id },
        data: {
          contentJson: contentJson as Prisma.InputJsonValue,
          versionLock: latest.versionLock + 1,
          label: input.label ?? latest.label ?? 'Draft',
        },
      });
    }

    return this.saveVersion(user, tripId, {
      ...input,
      label: input.label ?? 'Draft',
    });
  }

  async saveVersion(user: AuthUser, tripId: string, input: SaveItineraryVersionInput) {
    const itinerary = await this.getItineraryForTrip(user.organizationId, tripId, user.sub);
    const latest = itinerary.versions[0];
    if (input.expectedLock != null && latest && latest.versionLock !== input.expectedLock) {
      throw new ConflictException('Itinerary was modified by another user');
    }

    const existingStory =
      latest && latest.contentJson && typeof latest.contentJson === 'object'
        ? (latest.contentJson as { story?: unknown }).story
        : undefined;

    const version = await this.prisma.itineraryVersion.create({
      data: {
        itineraryId: itinerary.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        label: input.label ?? `v${(latest?.versionNumber ?? 0) + 1}`,
        status: 'draft',
        contentJson: {
          days: input.days,
          story: input.story !== undefined ? input.story : existingStory,
        } as Prisma.InputJsonValue,
        versionLock: 1,
        createdBy: user.sub,
      },
    });

    if (latest) {
      await this.prisma.itineraryVersion.update({
        where: { id: latest.id },
        data: { status: 'archived' },
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'itinerary.version_create',
      entityType: 'itinerary',
      entityId: itinerary.id,
      metadata: { versionId: version.id, versionNumber: version.versionNumber },
    });

    return version;
  }

  async restore(user: AuthUser, tripId: string, versionId: string) {
    const itinerary = await this.getItineraryForTrip(user.organizationId, tripId, user.sub);
    const source = await this.prisma.itineraryVersion.findFirst({
      where: { id: versionId, itineraryId: itinerary.id },
    });
    if (!source) throw new NotFoundException('Version not found');

    const latest = itinerary.versions[0];
    const restored = await this.prisma.itineraryVersion.create({
      data: {
        itineraryId: itinerary.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        label: `Restore of v${source.versionNumber}`,
        status: 'draft',
        contentJson: source.contentJson as Prisma.InputJsonValue,
        createdBy: user.sub,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'itinerary.version_restore',
      entityType: 'itinerary',
      entityId: itinerary.id,
      metadata: { fromVersionId: versionId, newVersionId: restored.id },
    });

    return restored;
  }

  async compare(organizationId: string, tripId: string, aId: string, bId: string) {
    const itinerary = await this.getItineraryForTrip(organizationId, tripId);
    const versions = await this.prisma.itineraryVersion.findMany({
      where: { itineraryId: itinerary.id, id: { in: [aId, bId] } },
    });
    return { versions };
  }

  private async requireActiveShareByToken(token: string) {
    const link = await this.prisma.itineraryShareLink.findUnique({ where: { token } });
    if (!link) throw new NotFoundException('Share link not found');
    if (link.revokedAt) throw new GoneException('This share link was revoked');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new GoneException('This share link has expired');
    }
    return link;
  }

  private async assertFamilyPin(
    link: { id: string; token: string; familyPinHash: string | null },
    pin: string | undefined,
    clientId: string,
  ) {
    if (!link.familyPinHash) return;
    assertRateLimit(`family-pin:${link.token}:${clientId}`, 12, 15 * 60 * 1000);
    if (!pin) {
      throw new UnauthorizedException('Family PIN required to join or post');
    }
    const ok = await verifyPassword(pin, link.familyPinHash);
    if (!ok) {
      throw new ForbiddenException('Incorrect family PIN');
    }
  }

  private presentFamilyThread(
    link: { id: string; token: string; tripId: string; familyPinHash?: string | null },
    viewerKey?: string | null,
    opts?: { unlocked?: boolean },
  ) {
    const pinRequired = Boolean(link.familyPinHash);
    const unlocked = opts?.unlocked ?? !pinRequired;
    return this.buildFamilyThread(link.id, link.token, link.tripId, viewerKey, {
      pinRequired,
      unlocked,
    });
  }

  private async buildFamilyThread(
    shareLinkId: string,
    token: string,
    tripId: string,
    viewerKey?: string | null,
    meta?: { pinRequired: boolean; unlocked: boolean },
  ) {
    const pinRequired = meta?.pinRequired ?? false;
    const unlocked = meta?.unlocked ?? true;

    if (!unlocked) {
      return {
        shareLinkId,
        token,
        path: `/p/itinerary/${token}`,
        tripId,
        pinRequired: true,
        unlocked: false,
        me: null,
        participants: [],
        loveCount: 0,
        lovedByMe: false,
        messages: [],
      };
    }

    const [participants, reactions, messages, me] = await Promise.all([
      this.prisma.proposalParticipant.findMany({
        where: { shareLinkId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.proposalReaction.findMany({
        where: { shareLinkId, kind: 'love' },
        select: { participantId: true },
      }),
      this.prisma.proposalMessage.findMany({
        where: { shareLinkId },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      viewerKey
        ? this.prisma.proposalParticipant.findUnique({
            where: { shareLinkId_viewerKey: { shareLinkId, viewerKey } },
          })
        : Promise.resolve(null),
    ]);

    const lovedByMe = Boolean(me && reactions.some((r) => r.participantId === me.id));

    return {
      shareLinkId,
      token,
      tripId,
      path: `/p/itinerary/${token}`,
      pinRequired,
      unlocked: true,
      me: me
        ? {
            viewerKey: me.viewerKey,
            displayName: me.displayName,
            relationHint: me.relationHint,
          }
        : null,
      participants: participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        relationHint: p.relationHint,
        lastSeenAt: p.lastSeenAt,
      })),
      loveCount: reactions.length,
      lovedByMe,
      messages: messages.map((m) => ({
        id: m.id,
        authorRole: m.authorRole,
        authorName: m.authorName,
        kind: m.kind,
        body: m.body,
        createdAt: m.createdAt,
      })),
    };
  }

  async getPublicFamily(token: string, viewerKey?: string, pin?: string, clientId = 'unknown') {
    const link = await this.requireActiveShareByToken(token);
    if (!link.familyPinHash) {
      return this.presentFamilyThread(link, viewerKey, { unlocked: true });
    }
    if (!pin) {
      return this.presentFamilyThread(link, viewerKey, { unlocked: false });
    }
    try {
      await this.assertFamilyPin(link, pin, clientId);
    } catch {
      return this.presentFamilyThread(link, viewerKey, { unlocked: false });
    }
    return this.presentFamilyThread(link, viewerKey, { unlocked: true });
  }

  async joinPublicFamily(
    token: string,
    input: ProposalFamilyJoinInput,
    clientId = 'unknown',
  ) {
    const link = await this.requireActiveShareByToken(token);
    assertRateLimit(`family-join:${link.token}:${clientId}`, 10, 60 * 60 * 1000);
    await this.assertFamilyPin(link, input.pin, clientId);

    const displayName = input.displayName.trim().slice(0, 80);
    const relationHint = input.relationHint?.trim().slice(0, 40) || null;
    if (!displayName) throw new BadRequestException('Name is required');

    await this.prisma.proposalParticipant.upsert({
      where: {
        shareLinkId_viewerKey: { shareLinkId: link.id, viewerKey: input.viewerKey },
      },
      create: {
        shareLinkId: link.id,
        viewerKey: input.viewerKey,
        displayName,
        relationHint,
      },
      update: {
        displayName,
        relationHint,
        lastSeenAt: new Date(),
      },
    });

    return this.presentFamilyThread(link, input.viewerKey, { unlocked: true });
  }

  async reactPublicFamily(
    token: string,
    input: ProposalFamilyReactInput,
    clientId = 'unknown',
  ) {
    const link = await this.requireActiveShareByToken(token);
    assertRateLimit(`family-react:${link.token}:${clientId}`, 60, 60 * 60 * 1000);
    await this.assertFamilyPin(link, input.pin, clientId);

    const participant = await this.prisma.proposalParticipant.findUnique({
      where: {
        shareLinkId_viewerKey: { shareLinkId: link.id, viewerKey: input.viewerKey },
      },
    });
    if (!participant) {
      throw new BadRequestException('Join with your name before reacting');
    }

    const kind = input.kind || 'love';
    const existing = await this.prisma.proposalReaction.findUnique({
      where: {
        shareLinkId_participantId_kind: {
          shareLinkId: link.id,
          participantId: participant.id,
          kind,
        },
      },
    });
    if (existing) {
      await this.prisma.proposalReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.proposalReaction.create({
        data: {
          shareLinkId: link.id,
          participantId: participant.id,
          kind,
        },
      });
    }
    await this.prisma.proposalParticipant.update({
      where: { id: participant.id },
      data: { lastSeenAt: new Date() },
    });
    return this.presentFamilyThread(link, input.viewerKey, { unlocked: true });
  }

  async postPublicFamilyMessage(
    token: string,
    input: ProposalFamilyMessageInput,
    clientId = 'unknown',
  ) {
    const link = await this.requireActiveShareByToken(token);
    assertRateLimit(`family-msg:${link.token}:${clientId}`, 30, 60 * 60 * 1000);
    assertRateLimit(`family-msg:${link.token}:${input.viewerKey}`, 20, 60 * 60 * 1000);
    await this.assertFamilyPin(link, input.pin, clientId);

    const body = input.body.trim().slice(0, 1000);
    if (!body) throw new BadRequestException('Message is required');

    const participant = await this.prisma.proposalParticipant.findUnique({
      where: {
        shareLinkId_viewerKey: { shareLinkId: link.id, viewerKey: input.viewerKey },
      },
    });
    if (!participant) {
      throw new BadRequestException('Join with your name before commenting');
    }

    const kind = input.kind === 'question' ? 'question' : 'comment';
    await this.prisma.proposalMessage.create({
      data: {
        shareLinkId: link.id,
        participantId: participant.id,
        authorRole: 'family',
        authorName: participant.displayName,
        kind,
        body,
      },
    });
    await this.prisma.proposalParticipant.update({
      where: { id: participant.id },
      data: { lastSeenAt: new Date() },
    });

    const notifyUserId = link.createdBy;
    if (notifyUserId) {
      try {
        await this.notifications.notify({
          organizationId: link.organizationId,
          userId: notifyUserId,
          title: kind === 'question' ? 'Family question on proposal' : 'New family comment',
          body: `${participant.displayName}: ${body.slice(0, 140)}`,
          linkPath: `/trips/${link.tripId}/itinerary/preview`,
        });
      } catch {
        // Non-blocking
      }
    }

    return this.presentFamilyThread(link, input.viewerKey, { unlocked: true });
  }

  private async latestActiveShare(organizationId: string, tripId: string) {
    return this.prisma.itineraryShareLink.findFirst({
      where: {
        organizationId,
        tripId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStaffFamily(user: AuthUser, tripId: string) {
    await this.getItineraryForTrip(user.organizationId, tripId);
    const link = await this.latestActiveShare(user.organizationId, tripId);
    if (!link) {
      return {
        shareLinkId: null,
        token: null,
        path: null,
        participants: [],
        loveCount: 0,
        lovedByMe: false,
        messages: [],
        me: null,
        tripId,
        pinRequired: false,
        unlocked: true,
        familyPinSet: false,
      };
    }
    const thread = await this.presentFamilyThread(link, null, { unlocked: true });
    return { ...thread, familyPinSet: Boolean(link.familyPinHash) };
  }

  async replyStaffFamily(user: AuthUser, tripId: string, input: ProposalFamilyAgencyReplyInput) {
    await this.getItineraryForTrip(user.organizationId, tripId);
    const body = input.body.trim().slice(0, 2000);
    if (!body) throw new BadRequestException('Reply is required');

    const link = input.shareLinkId
      ? await this.prisma.itineraryShareLink.findFirst({
          where: { id: input.shareLinkId, organizationId: user.organizationId, tripId },
        })
      : await this.latestActiveShare(user.organizationId, tripId);
    if (!link || link.revokedAt) throw new NotFoundException('No active share link for this trip');

    const agencyName =
      (
        await this.prisma.organization.findUnique({
          where: { id: user.organizationId },
          select: { name: true, brandingJson: true },
        })
      )?.name || 'Agency';

    await this.prisma.proposalMessage.create({
      data: {
        shareLinkId: link.id,
        participantId: null,
        authorRole: 'agency',
        authorName: agencyName,
        kind: 'answer',
        body,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'proposal.family_reply',
      entityType: 'trip',
      entityId: tripId,
      metadata: { shareLinkId: link.id },
    });

    return this.presentFamilyThread(link, null, { unlocked: true });
  }
}
