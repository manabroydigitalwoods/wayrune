import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreatePartnerAssetInput, UpdatePartnerAssetInput } from '@travel/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/helpers';
import {
  ensureDefaultPartnerAsset,
  ensureStayStarterInventory,
  orgKindToAssetKind,
} from './partner-assets.helpers';

@Injectable()
export class PartnerAssetsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  orgKindToAssetKind = orgKindToAssetKind;

  async ensureDefaultAsset(
    organizationId: string,
    assetKind: string,
    name: string,
    createdBy?: string | null,
  ) {
    return ensureDefaultPartnerAsset(
      this.prisma,
      organizationId,
      assetKind,
      name,
      createdBy,
    );
  }

  async ensureStayStarterInventory(asset: {
    id: string;
    assetKind: string;
    name: string;
  }) {
    return ensureStayStarterInventory(this.prisma, asset);
  }

  async list(user: AuthUser) {
    return this.prisma.partnerAsset.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        place: { select: { id: true, name: true, kind: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async get(user: AuthUser, id: string) {
    const asset = await this.prisma.partnerAsset.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        place: { select: { id: true, name: true, kind: true } },
      },
    });
    if (!asset) throw new NotFoundException('Partner asset not found');
    return asset;
  }

  async create(user: AuthUser, input: CreatePartnerAssetInput) {
    const asset = await this.prisma.partnerAsset.create({
      data: {
        organizationId: user.organizationId,
        name: input.name.trim(),
        assetKind: input.assetKind,
        placeId: input.placeId || null,
        profileJson: input.profileJson
          ? (input.profileJson as Prisma.InputJsonValue)
          : undefined,
        isActive: input.isActive ?? true,
        createdBy: user.sub,
      },
      include: {
        place: { select: { id: true, name: true, kind: true } },
      },
    });
    await ensureStayStarterInventory(this.prisma, asset);
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'partner_asset.create',
      entityType: 'partner_asset',
      entityId: asset.id,
      metadata: { assetKind: asset.assetKind },
    });
    return asset;
  }

  async update(user: AuthUser, id: string, input: UpdatePartnerAssetInput) {
    await this.get(user, id);
    const asset = await this.prisma.partnerAsset.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.assetKind !== undefined ? { assetKind: input.assetKind } : {}),
        ...(input.placeId !== undefined ? { placeId: input.placeId } : {}),
        ...(input.profileJson !== undefined
          ? { profileJson: input.profileJson as Prisma.InputJsonValue }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: {
        place: { select: { id: true, name: true, kind: true } },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'partner_asset.update',
      entityType: 'partner_asset',
      entityId: asset.id,
    });
    return asset;
  }

  async softDelete(user: AuthUser, id: string) {
    await this.get(user, id);
    const asset = await this.prisma.partnerAsset.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'partner_asset.delete',
      entityType: 'partner_asset',
      entityId: asset.id,
    });
    return { ok: true };
  }

  /** Resolve asset for claim/confirm: explicit id owned by org, else default/first. */
  async resolveAssetForOrg(
    organizationId: string,
    orgKind: string,
    orgName: string,
    assetId?: string | null,
    userId?: string | null,
  ) {
    if (assetId) {
      const owned = await this.prisma.partnerAsset.findFirst({
        where: {
          id: assetId,
          organizationId,
          deletedAt: null,
          isActive: true,
        },
      });
      if (!owned) throw new NotFoundException('Partner asset not found');
      return owned;
    }
    return this.ensureDefaultAsset(
      organizationId,
      orgKindToAssetKind(orgKind),
      orgName,
      userId,
    );
  }
}
