import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AddNetworkSupplierInput,
  ConfirmInboundBookingInput,
  CreateOrgRelationshipInput,
  CreateSupplierInviteInput,
  UpdateOrgRelationshipInput,
  UpdatePartnerProfileInput,
} from '@wayrune/contracts';
import { generateRefreshToken, hashToken } from '@wayrune/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { InventoryService } from '../inventory/inventory.service';
import { OperationsService } from '../operations/operations.service';
import { PartnerAssetsService } from '../partner-assets/partner-assets.service';
import { StayService } from '../stay/stay.service';
import type { AuthUser } from '../../common/helpers';
import {
  isAllowedPartnerConfirmationMime,
  MAX_PARTNER_CONFIRMATION_BYTES,
  partnerConfirmationDocumentBinding,
} from './inbound-booking-document';
import { inboundPartnerConfirmCueFromBooking } from './inbound-partner-confirm-cue';

export const ORG_KIND_TO_SUPPLIER_TYPE: Record<string, string> = {
  travel_agency: 'other',
  hotel: 'hotel',
  homestay: 'homestay',
  farmstay: 'farmstay',
  car_rental: 'car_rental',
  driver: 'driver',
  restaurant: 'restaurant',
  dmc: 'dmc',
  other: 'other',
};

@Injectable()
export class NetworkService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private partnerAssets: PartnerAssetsService,
    private inventory: InventoryService,
    private stay: StayService,
    private operations: OperationsService,
    private files: FilesService,
  ) {}

  async discoverPartners(
    user: AuthUser,
    query: { q?: string; kind?: string; city?: string },
  ) {
    const q = query.q?.trim();
    const partners = await this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        id: { not: user.organizationId },
        partnerProfile: { discoverable: true },
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.city
          ? { partnerProfile: { is: { discoverable: true, city: { contains: query.city } } } }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { slug: { contains: q } },
                { partnerProfile: { is: { city: { contains: q } } } },
              ],
            }
          : {}),
      },
      take: 50,
      orderBy: { name: 'asc' },
      include: {
        partnerProfile: true,
      },
    });

    const relationships = await this.prisma.orgRelationship.findMany({
      where: {
        fromOrganizationId: user.organizationId,
        toOrganizationId: { in: partners.map((p) => p.id) },
      },
    });
    const relByTo = Object.fromEntries(relationships.map((r) => [r.toOrganizationId, r]));

    const linked = await this.prisma.supplier.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        linkedOrganizationId: { in: partners.map((p) => p.id) },
      },
      select: { id: true, linkedOrganizationId: true },
    });
    const supplierByPartner = Object.fromEntries(
      linked.filter((s) => s.linkedOrganizationId).map((s) => [s.linkedOrganizationId!, s.id]),
    );

    return partners.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      kind: p.kind,
      profile: p.partnerProfile,
      relationship: relByTo[p.id] || null,
      localSupplierId: supplierByPartner[p.id] || null,
    }));
  }

  async listMyRelationships(user: AuthUser) {
    const items = await this.prisma.orgRelationship.findMany({
      where: { fromOrganizationId: user.organizationId },
      orderBy: { updatedAt: 'desc' },
      include: {
        toOrganization: {
          include: { partnerProfile: true },
        },
      },
    });
    const partnerIds = items.map((i) => i.toOrganizationId);
    const linked = await this.prisma.supplier.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        linkedOrganizationId: { in: partnerIds },
      },
      select: { id: true, linkedOrganizationId: true },
    });
    const supplierByPartner = Object.fromEntries(
      linked.filter((s) => s.linkedOrganizationId).map((s) => [s.linkedOrganizationId!, s.id]),
    );
    return items.map((r) => ({
      id: r.id,
      status: r.status,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      partner: {
        id: r.toOrganization.id,
        name: r.toOrganization.name,
        slug: r.toOrganization.slug,
        kind: r.toOrganization.kind,
        profile: r.toOrganization.partnerProfile,
      },
      localSupplierId: supplierByPartner[r.toOrganizationId] || null,
    }));
  }

  async listFollowers(user: AuthUser) {
    const items = await this.prisma.orgRelationship.findMany({
      where: {
        toOrganizationId: user.organizationId,
        status: { in: ['following', 'preferred', 'contracted'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        fromOrganization: {
          select: { id: true, name: true, slug: true, kind: true },
        },
      },
    });
    return items.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      organization: r.fromOrganization,
    }));
  }

  async follow(user: AuthUser, input: CreateOrgRelationshipInput) {
    if (input.toOrganizationId === user.organizationId) {
      throw new BadRequestException('Cannot follow your own organization');
    }
    const partner = await this.prisma.organization.findFirst({
      where: { id: input.toOrganizationId, deletedAt: null },
      include: { partnerProfile: true },
    });
    if (!partner) throw new NotFoundException('Partner organization not found');

    const relationship = await this.prisma.orgRelationship.upsert({
      where: {
        fromOrganizationId_toOrganizationId: {
          fromOrganizationId: user.organizationId,
          toOrganizationId: input.toOrganizationId,
        },
      },
      create: {
        fromOrganizationId: user.organizationId,
        toOrganizationId: input.toOrganizationId,
        status: input.status || 'following',
        notes: input.notes || null,
        createdBy: user.sub,
        updatedBy: user.sub,
      },
      update: {
        status: input.status || 'following',
        notes: input.notes !== undefined ? input.notes : undefined,
        updatedBy: user.sub,
      },
    });

    let supplier = null;
    if (input.addToMySuppliers !== false) {
      supplier = await this.ensureLocalSupplier(user, partner);
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'network.follow',
      entityType: 'org_relationship',
      entityId: relationship.id,
      metadata: { toOrganizationId: partner.id, status: relationship.status },
    });

    return { relationship, localSupplier: supplier };
  }

  async updateRelationship(
    user: AuthUser,
    relationshipId: string,
    input: UpdateOrgRelationshipInput,
  ) {
    const existing = await this.prisma.orgRelationship.findFirst({
      where: { id: relationshipId, fromOrganizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Relationship not found');
    const updated = await this.prisma.orgRelationship.update({
      where: { id: relationshipId },
      data: {
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedBy: user.sub,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'network.relationship_update',
      entityType: 'org_relationship',
      entityId: updated.id,
      metadata: { status: updated.status },
    });
    return updated;
  }

  async unfollow(user: AuthUser, relationshipId: string) {
    const existing = await this.prisma.orgRelationship.findFirst({
      where: { id: relationshipId, fromOrganizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Relationship not found');
    await this.prisma.orgRelationship.delete({ where: { id: relationshipId } });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'network.unfollow',
      entityType: 'org_relationship',
      entityId: relationshipId,
      metadata: { toOrganizationId: existing.toOrganizationId },
    });
    return { ok: true };
  }

  async addToMySuppliers(user: AuthUser, input: AddNetworkSupplierInput) {
    const partner = await this.prisma.organization.findFirst({
      where: { id: input.partnerOrganizationId, deletedAt: null },
      include: { partnerProfile: true },
    });
    if (!partner) throw new NotFoundException('Partner organization not found');
    const supplier = await this.ensureLocalSupplier(user, partner);
    return supplier;
  }

  async ensureLocalSupplier(
    user: AuthUser,
    partner: {
      id: string;
      name: string;
      kind: string;
      partnerProfile?: { contactEmail?: string | null; contactPhone?: string | null } | null;
    },
  ) {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        organizationId: user.organizationId,
        linkedOrganizationId: partner.id,
        deletedAt: null,
      },
    });
    if (existing) return existing;

    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId: user.organizationId,
        name: partner.name,
        type: ORG_KIND_TO_SUPPLIER_TYPE[partner.kind] || 'other',
        email: partner.partnerProfile?.contactEmail || null,
        phone: partner.partnerProfile?.contactPhone || null,
        notes: `Network partner (${partner.kind})`,
        linkedOrganizationId: partner.id,
      },
      include: {
        linkedOrganization: {
          select: { id: true, name: true, kind: true, slug: true },
        },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'network.add_supplier',
      entityType: 'supplier',
      entityId: supplier.id,
      metadata: { linkedOrganizationId: partner.id },
    });
    return supplier;
  }

  async getMyPartnerProfile(user: AuthUser) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      include: { partnerProfile: true },
    });
    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        kind: org.kind,
      },
      profile: org.partnerProfile,
    };
  }

  async updateMyPartnerProfile(user: AuthUser, input: UpdatePartnerProfileInput) {
    const data = {
      ...(input.discoverable !== undefined ? { discoverable: input.discoverable } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.region !== undefined ? { region: input.region } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.serviceTags !== undefined ? { serviceTagsJson: input.serviceTags } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.capacityHint !== undefined ? { capacityHint: input.capacityHint } : {}),
    };
    const profile = await this.prisma.organizationPartnerProfile.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        discoverable: input.discoverable ?? false,
        city: input.city ?? null,
        region: input.region ?? null,
        country: input.country ?? 'India',
        bio: input.bio ?? null,
        serviceTagsJson: input.serviceTags ?? [],
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        capacityHint: input.capacityHint ?? null,
      },
      update: data,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'network.profile_update',
      entityType: 'organization_partner_profile',
      entityId: profile.id,
      metadata: { discoverable: profile.discoverable },
    });
    return profile;
  }

  /** Bookings at other agencies that used a local supplier linked to this org. */
  async listInboundBookings(user: AuthUser) {
    const mirrors = await this.prisma.supplier.findMany({
      where: { linkedOrganizationId: user.organizationId, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!mirrors.length) return [];

    const bookings = await this.prisma.bookingComponent.findMany({
      where: { supplierId: { in: mirrors.map((m) => m.id) } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        trip: {
          select: {
            id: true,
            tripNumber: true,
            title: true,
            startDate: true,
            endDate: true,
            status: true,
            organization: { select: { id: true, name: true, kind: true } },
            inquiry: { select: { adults: true, children: true } },
          },
        },
        supplier: { select: { id: true, name: true } },
      },
    });

    const vehicleTypeIds = new Set<string>();
    for (const b of bookings) {
      if (b.type !== 'transfer') continue;
      const req =
        b.travellerRequirementsJson &&
        typeof b.travellerRequirementsJson === 'object' &&
        !Array.isArray(b.travellerRequirementsJson)
          ? (b.travellerRequirementsJson as Record<string, unknown>)
          : {};
      const hasSeats =
        (typeof req.vehicleSeats === 'number' && req.vehicleSeats > 0) ||
        (typeof req.seats === 'number' && req.seats > 0);
      const vtId =
        typeof req.vehicleTypeId === 'string' ? req.vehicleTypeId.trim() : '';
      if (!hasSeats && vtId) vehicleTypeIds.add(vtId);
    }

    const seatsByVehicleTypeId = new Map<string, number>();
    if (vehicleTypeIds.size) {
      const types = await this.prisma.vehicleType.findMany({
        where: { id: { in: [...vehicleTypeIds] }, deletedAt: null },
        select: { id: true, seats: true },
      });
      for (const t of types) {
        if (t.seats != null && t.seats > 0) seatsByVehicleTypeId.set(t.id, t.seats);
      }
    }

    return bookings.map((b) => {
      const req =
        b.travellerRequirementsJson &&
        typeof b.travellerRequirementsJson === 'object' &&
        !Array.isArray(b.travellerRequirementsJson)
          ? (b.travellerRequirementsJson as Record<string, unknown>)
          : {};
      const vtId =
        typeof req.vehicleTypeId === 'string' ? req.vehicleTypeId.trim() : '';
      const inquiryParty =
        (b.trip.inquiry?.adults ?? 0) + (b.trip.inquiry?.children ?? 0);
      const confirmCue = inboundPartnerConfirmCueFromBooking(b, {
        party: inquiryParty > 0 ? inquiryParty : null,
        seatsPerVehicle: vtId ? seatsByVehicleTypeId.get(vtId) ?? null : null,
      });
      return {
        id: b.id,
        title: b.title,
        type: b.type,
        status: b.status,
        confirmationRef: b.confirmationRef,
        createdAt: b.createdAt,
        startAt: b.startAt,
        endAt: b.endAt,
        confirmCue,
        agency: b.trip.organization,
        trip: {
          id: b.trip.id,
          tripNumber: b.trip.tripNumber,
          title: b.trip.title,
          startDate: b.trip.startDate,
          endDate: b.trip.endDate,
          status: b.trip.status,
        },
      };
    });
  }

  async listFollowedPartnersForPicker(user: AuthUser) {
    const relationships = await this.prisma.orgRelationship.findMany({
      where: {
        fromOrganizationId: user.organizationId,
        status: { in: ['following', 'preferred', 'contracted'] },
      },
      include: {
        toOrganization: { include: { partnerProfile: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const partnerIds = relationships.map((r) => r.toOrganizationId);
    const linked = await this.prisma.supplier.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        linkedOrganizationId: { in: partnerIds },
      },
    });
    const byPartner = Object.fromEntries(
      linked.filter((s) => s.linkedOrganizationId).map((s) => [s.linkedOrganizationId!, s]),
    );

    return relationships.map((r) => ({
      organizationId: r.toOrganization.id,
      name: r.toOrganization.name,
      kind: r.toOrganization.kind,
      status: r.status,
      city: r.toOrganization.partnerProfile?.city || null,
      localSupplierId: byPartner[r.toOrganizationId]?.id || null,
      localSupplier: byPartner[r.toOrganizationId] || null,
    }));
  }

  async createSupplierInvite(
    user: AuthUser,
    supplierId: string,
    input: CreateSupplierInviteInput,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.linkedOrganizationId) {
      throw new BadRequestException('Supplier is already linked to a network partner');
    }

    await this.prisma.supplierInvite.updateMany({
      where: { supplierId, invitingOrganizationId: user.organizationId, status: 'pending' },
      data: { status: 'revoked' },
    });

    const rawToken = generateRefreshToken();
    const invite = await this.prisma.supplierInvite.create({
      data: {
        invitingOrganizationId: user.organizationId,
        supplierId,
        email: input.email || supplier.email || null,
        tokenHash: hashToken(rawToken),
        suggestedKind: input.suggestedKind || null,
        status: 'pending',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdBy: user.sub,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'network.supplier_invite_create',
      entityType: 'supplier_invite',
      entityId: invite.id,
      metadata: { supplierId, email: invite.email },
    });

    return {
      id: invite.id,
      status: invite.status,
      email: invite.email,
      expiresAt: invite.expiresAt,
      claimPath: `/claim/${rawToken}`,
      claimToken: rawToken,
    };
  }

  async peekInvite(rawToken: string) {
    const invite = await this.prisma.supplierInvite.findFirst({
      where: { tokenHash: hashToken(rawToken) },
      include: {
        invitingOrganization: { select: { id: true, name: true, kind: true } },
        supplier: { select: { id: true, name: true, type: true, email: true } },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending' || invite.expiresAt < new Date()) {
      return {
        status: invite.status === 'pending' ? 'expired' : invite.status,
        agency: invite.invitingOrganization,
        supplier: invite.supplier,
        suggestedKind: invite.suggestedKind,
        email: invite.email,
        claimable: false,
      };
    }
    return {
      status: invite.status,
      agency: invite.invitingOrganization,
      supplier: invite.supplier,
      suggestedKind: invite.suggestedKind,
      email: invite.email,
      claimable: true,
    };
  }

  async claimInvite(user: AuthUser, rawToken: string, assetId?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, kind: true, name: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.kind === 'travel_agency' || org.kind === 'platform') {
      throw new BadRequestException('Claim invites with a partner organization account');
    }

    const invite = await this.prisma.supplierInvite.findFirst({
      where: { tokenHash: hashToken(rawToken), status: 'pending' },
      include: { supplier: true },
    });
    if (!invite) throw new NotFoundException('Invite not found or already used');
    if (invite.expiresAt < new Date()) {
      await this.prisma.supplierInvite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('Invite has expired');
    }
    if (invite.supplier.linkedOrganizationId) {
      throw new BadRequestException('Supplier was already claimed');
    }

    const duplicate = await this.prisma.supplier.findFirst({
      where: {
        organizationId: invite.invitingOrganizationId,
        linkedOrganizationId: user.organizationId,
        deletedAt: null,
      },
    });
    if (duplicate && duplicate.id !== invite.supplierId) {
      throw new BadRequestException(
        'Your organization is already linked to another supplier in this agency',
      );
    }

    const asset = await this.partnerAssets.resolveAssetForOrg(
      org.id,
      org.kind,
      org.name,
      assetId,
      user.sub,
    );

    const assetTaken = await this.prisma.supplier.findFirst({
      where: {
        organizationId: invite.invitingOrganizationId,
        linkedAssetId: asset.id,
        deletedAt: null,
        NOT: { id: invite.supplierId },
      },
    });
    if (assetTaken) {
      throw new ConflictException(
        'This partner asset is already linked to another supplier in this agency',
      );
    }

    let linked;
    try {
      linked = await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.update({
          where: { id: invite.supplierId },
          data: {
            linkedOrganizationId: user.organizationId,
            linkedAssetId: asset.id,
          },
        });
        await tx.supplierInvite.update({
          where: { id: invite.id },
          data: {
            status: 'accepted',
            claimedOrganizationId: user.organizationId,
            claimedByUserId: user.sub,
            acceptedAt: new Date(),
          },
        });
        const existingRel = await tx.orgRelationship.findFirst({
          where: {
            fromOrganizationId: invite.invitingOrganizationId,
            toOrganizationId: user.organizationId,
          },
        });
        if (!existingRel) {
          await tx.orgRelationship.create({
            data: {
              fromOrganizationId: invite.invitingOrganizationId,
              toOrganizationId: user.organizationId,
              status: 'following',
              notes: 'Created via supplier claim invite',
            },
          });
        }
        return supplier;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'This partner asset is already linked to another supplier in this agency',
        );
      }
      throw err;
    }

    await this.audit.record({
      organizationId: invite.invitingOrganizationId,
      actorUserId: user.sub,
      action: 'network.supplier_invite_claim',
      entityType: 'supplier',
      entityId: linked.id,
      metadata: {
        inviteId: invite.id,
        claimedOrganizationId: user.organizationId,
        linkedAssetId: asset.id,
      },
    });

    return {
      supplierId: linked.id,
      linkedOrganizationId: user.organizationId,
      linkedAssetId: asset.id,
      agencyOrganizationId: invite.invitingOrganizationId,
    };
  }

  /** Resolve an inbound booking owned via supplier mirrors for this partner org. */
  private async resolveInboundBooking(user: AuthUser, bookingId: string) {
    const mirrors = await this.prisma.supplier.findMany({
      where: { linkedOrganizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!mirrors.length) throw new NotFoundException('Booking not found');

    const booking = await this.prisma.bookingComponent.findFirst({
      where: {
        id: bookingId,
        supplierId: { in: mirrors.map((m) => m.id) },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /**
   * Partner uploads a confirmation file onto the agency booking Document store
   * (agency organizationId — not partner org storage).
   */
  async uploadInboundConfirmationDocument(
    user: AuthUser,
    bookingId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ) {
    const booking = await this.resolveInboundBooking(user, bookingId);
    if (booking.status === 'cancelled') {
      throw new BadRequestException('Cancelled bookings cannot accept confirmation files');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose a confirmation file');
    }
    if (file.size > MAX_PARTNER_CONFIRMATION_BYTES) {
      throw new BadRequestException('File must be 8 MB or smaller');
    }
    if (!isAllowedPartnerConfirmationMime(file.mimetype)) {
      throw new BadRequestException('Upload a PDF or image (JPEG, PNG, WebP)');
    }

    const binding = partnerConfirmationDocumentBinding(booking.id);
    const doc = await this.files.upload({
      organizationId: booking.organizationId,
      userId: user.sub,
      entityType: binding.entityType,
      entityId: binding.entityId,
      documentType: binding.documentType,
      fileName: file.originalname || 'confirmation.pdf',
      mimeType: file.mimetype,
      buffer: file.buffer,
      visibility: 'internal',
    });

    await this.audit.record({
      organizationId: booking.organizationId,
      actorUserId: user.sub,
      action: 'network.inbound_confirmation_upload',
      entityType: 'document',
      entityId: doc.id,
      metadata: {
        bookingComponentId: booking.id,
        partnerOrganizationId: user.organizationId,
        documentType: binding.documentType,
      },
    });

    return {
      documentId: doc.id,
      contentUrl: doc.contentUrl,
      fileName: doc.name,
      mimeType: doc.mimeType,
      documentType: binding.documentType,
      bookingId: booking.id,
      agencyOrganizationId: booking.organizationId,
    };
  }

  async confirmInboundBooking(
    user: AuthUser,
    bookingId: string,
    input: ConfirmInboundBookingInput,
  ) {
    const booking = await this.resolveInboundBooking(user, bookingId);
    if (booking.status === 'cancelled') {
      throw new BadRequestException('Cancelled bookings cannot be confirmed');
    }

    let partnerAssetId: string | null = null;
    if (input.assetId) {
      const asset = await this.partnerAssets.resolveAssetForOrg(
        user.organizationId,
        'other',
        'asset',
        input.assetId,
        user.sub,
      );
      partnerAssetId = asset.id;
    }

    const becomingConfirmed =
      input.status === 'confirmed' && booking.status !== 'confirmed';

    const updated = await this.prisma.bookingComponent.update({
      where: { id: bookingId },
      data: {
        status: input.status,
        confirmationRef:
          input.confirmationRef !== undefined
            ? input.confirmationRef
            : booking.confirmationRef,
        ...(partnerAssetId ? { partnerAssetId } : {}),
        updatedBy: user.sub,
      },
      include: {
        trip: {
          select: {
            id: true,
            tripNumber: true,
            title: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });

    await this.audit.record({
      organizationId: booking.organizationId,
      actorUserId: user.sub,
      action: 'network.inbound_confirm',
      entityType: 'booking_component',
      entityId: booking.id,
      metadata: {
        status: updated.status,
        confirmationRef: updated.confirmationRef,
        partnerOrganizationId: user.organizationId,
        ...(partnerAssetId ? { partnerAssetId } : {}),
      },
    });

    const inventorySync = await this.inventory.syncBookingInventory(user, updated);
    await this.stay.syncFromInboundBooking(user, {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      confirmationRef: updated.confirmationRef,
      partnerAssetId: updated.partnerAssetId,
      startAt: updated.startAt,
      endAt: updated.endAt,
    });

    let payableResult: {
      created: boolean;
      invoiceId: string | null;
      reason: string | null;
    } | null = null;
    if (becomingConfirmed) {
      // Payable lives on the agency org — act as agency for finance writes.
      const agencyActor: AuthUser = {
        ...user,
        organizationId: booking.organizationId,
      };
      try {
        const invoice = await this.operations.ensurePayableOnBookingConfirm(
          agencyActor,
          updated.trip.id,
          bookingId,
        );
        if (invoice) {
          payableResult = {
            created: true,
            invoiceId: invoice.id,
            reason: null,
          };
        } else {
          const amount = Number(
            updated.confirmedAmount ?? updated.costAmount ?? updated.quotedAmount ?? 0,
          );
          const reason = !updated.supplierId
            ? 'No supplier on booking — agency can create payable in Finance'
            : !Number.isFinite(amount) || amount <= 0
              ? 'No buy/confirmed amount — agency can set cost and create payable in Finance'
              : 'Payable was not created';
          payableResult = { created: false, invoiceId: null, reason };
          await this.audit.record({
            organizationId: booking.organizationId,
            actorUserId: user.sub,
            action: 'booking.confirm_payable_skipped',
            entityType: 'booking_component',
            entityId: booking.id,
            metadata: {
              tripId: updated.trip.id,
              reason,
              via: 'partner_inbound',
            },
          });
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Payable creation failed';
        payableResult = { created: false, invoiceId: null, reason };
        await this.audit.record({
          organizationId: booking.organizationId,
          actorUserId: user.sub,
          action: 'booking.confirm_payable_failed',
          entityType: 'booking_component',
          entityId: booking.id,
          metadata: {
            tripId: updated.trip.id,
            reason,
            via: 'partner_inbound',
          },
        });
      }
    }

    let capacityCue: {
      capacityNote: string | null;
      capacityWarn: boolean;
    } | null = null;
    if (booking.type === 'transfer') {
      const req =
        booking.travellerRequirementsJson &&
        typeof booking.travellerRequirementsJson === 'object' &&
        !Array.isArray(booking.travellerRequirementsJson)
          ? (booking.travellerRequirementsJson as Record<string, unknown>)
          : {};
      let seatsFallback: number | null = null;
      const vtId =
        typeof req.vehicleTypeId === 'string' ? req.vehicleTypeId.trim() : '';
      const hasSeats =
        (typeof req.vehicleSeats === 'number' && req.vehicleSeats > 0) ||
        (typeof req.seats === 'number' && req.seats > 0);
      if (!hasSeats && vtId) {
        const vt = await this.prisma.vehicleType.findFirst({
          where: { id: vtId, deletedAt: null },
          select: { seats: true },
        });
        if (vt?.seats != null && vt.seats > 0) seatsFallback = vt.seats;
      }
      let partyFallback: number | null = null;
      const adults = Number(req.adults);
      const children = Number(req.children);
      if (
        !(
          (Number.isFinite(adults) && adults > 0) ||
          (Number.isFinite(children) && children > 0)
        )
      ) {
        const trip = await this.prisma.trip.findFirst({
          where: { id: booking.tripId },
          select: { inquiry: { select: { adults: true, children: true } } },
        });
        const inquiryParty =
          (trip?.inquiry?.adults ?? 0) + (trip?.inquiry?.children ?? 0);
        if (inquiryParty > 0) partyFallback = inquiryParty;
      }
      const cue = inboundPartnerConfirmCueFromBooking(booking, {
        party: partyFallback,
        seatsPerVehicle: seatsFallback,
      });
      capacityCue = {
        capacityNote: cue.capacityNote,
        capacityWarn: cue.capacityWarn,
      };
    }

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      confirmationRef: updated.confirmationRef,
      partnerAssetId,
      agency: updated.trip.organization,
      trip: {
        id: updated.trip.id,
        tripNumber: updated.trip.tripNumber,
        title: updated.trip.title,
      },
      ...(payableResult ? { payable: payableResult } : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.upgraded
        ? { allotmentUpgraded: true as const, allocationId: inventorySync.allocationId }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.quantityResynced
        ? { allotmentQuantityResynced: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.datesResynced
        ? { allotmentDatesResynced: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.assetRebound
        ? { allotmentAssetRebound: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.roomProductRematched
        ? { allotmentRoomProductRematched: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.fleetWindowResynced
        ? { allotmentFleetWindowResynced: true as const }
        : {}),
      ...(inventorySync && inventorySync.ok && inventorySync.orphanReleased
        ? { allotmentOrphanReleased: true as const }
        : {}),
      ...(inventorySync && !inventorySync.ok && inventorySync.failed
        ? { allotmentSyncFailed: inventorySync.failed }
        : {}),
      ...(capacityCue?.capacityNote
        ? {
            capacityNote: capacityCue.capacityNote,
            capacityWarn: capacityCue.capacityWarn,
          }
        : {}),
    };
  }
}
