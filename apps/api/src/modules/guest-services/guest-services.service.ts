import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes, randomInt } from 'crypto';
import type {
  CreateGuestServiceRequestInput,
  CreateServiceLocationInput,
  CreateServiceOfferingInput,
  GuestBookExperienceInput,
  GuestOfferingRatingInput,
  GuestPublicPayIntentInput,
  GuestQrFeedbackInput,
  OpenTableSessionInput,
  PlaceGuestServiceOrderInput,
  PutGuestMenuCategoriesInput,
  PutGuestMenuConfigInput,
  RenameGuestMenuCategoryInput,
  UpdateServiceLocationInput,
  UpdateServiceOfferingInput,
  UpdateServiceOrderStatusInput,
  UpdateGuestServiceRequestStatusInput,
} from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { OutboxService } from '../outbox/outbox.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../files/files.service';
import type { AuthUser } from '../../common/helpers';
import { buildGuestCheckPdf } from './guest-check-pdf';
import { createEInvoiceProvider } from './e-invoice.provider';

type GsSettings = {
  qrEnabled: boolean;
  acceptingOrders: boolean;
  walkInQrEnabled: boolean;
  requireRoomPin: boolean;
  businessHoursFrom?: string | null;
  businessHoursUntil?: string | null;
  eInvoiceEnabled: boolean;
};

type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: Array<{ id: string; name: string; priceDelta: number }>;
};

function newPublicToken() {
  return randomBytes(24).toString('base64url');
}

function newRoomPin() {
  return String(randomInt(1000, 10000));
}

function hmNow(tz = 'Asia/Kolkata') {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function inWindow(nowHm: string, from?: string | null, until?: string | null) {
  if (!from && !until) return true;
  const n = nowHm;
  if (from && until) {
    if (from <= until) return n >= from && n <= until;
    return n >= from || n <= until; // overnight
  }
  if (from) return n >= from;
  if (until) return n <= until;
  return true;
}

@Injectable()
export class GuestServicesService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private outbox: OutboxService,
    private notifications: NotificationsService,
    private files: FilesService,
  ) {}

  private async gsSettings(organizationId: string): Promise<GsSettings> {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    const raw =
      org?.settingsJson && typeof org.settingsJson === 'object'
        ? ((org.settingsJson as Record<string, unknown>).guestServices as
            | Record<string, unknown>
            | undefined)
        : undefined;
    return {
      qrEnabled: raw?.qrEnabled !== false,
      acceptingOrders: raw?.acceptingOrders !== false,
      walkInQrEnabled: Boolean(raw?.walkInQrEnabled),
      requireRoomPin: raw?.requireRoomPin !== false,
      businessHoursFrom:
        typeof raw?.businessHoursFrom === 'string' ? raw.businessHoursFrom : null,
      businessHoursUntil:
        typeof raw?.businessHoursUntil === 'string' ? raw.businessHoursUntil : null,
      eInvoiceEnabled: Boolean(raw?.eInvoiceEnabled),
    };
  }

  private async timeline(
    organizationId: string,
    eventType: string,
    entityType: string,
    entityId: string,
    summary: string,
    actorUserId?: string | null,
  ) {
    await this.prisma.businessTimelineEvent.create({
      data: {
        organizationId,
        eventType,
        entityType,
        entityId,
        summary,
        actorUserId: actorUserId || null,
      },
    });
    await this.outbox.enqueue({
      organizationId,
      eventType,
      payload: { entityType, entityId, summary },
    });
  }

  private async notifyOps(organizationId: string, title: string, body: string, linkPath: string) {
    const members = await this.prisma.organizationMembership.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      select: { userId: true },
      take: 12,
    });
    await Promise.all(
      members.map((m) =>
        this.notifications.notify({
          organizationId,
          userId: m.userId,
          title,
          body,
          linkPath,
          channel: 'in_app',
        }),
      ),
    );
  }

  // ── Staff: locations ────────────────────────────────────────────────

  async listLocations(user: AuthUser, assetId: string) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const locations = await this.prisma.serviceLocation.findMany({
      where: { assetId, organizationId: user.organizationId },
      orderBy: { label: 'asc' },
    });
    const ordersToday = await this.prisma.serviceOrder.groupBy({
      by: ['serviceLocationId'],
      where: {
        assetId,
        organizationId: user.organizationId,
        placedAt: { gte: start },
        status: { notIn: ['cancelled', 'rejected'] },
      },
      _count: { _all: true },
      _sum: { total: true },
    });
    const countMap = new Map(ordersToday.map((o) => [o.serviceLocationId, o._count._all]));
    const salesMap = new Map(
      ordersToday.map((o) => [o.serviceLocationId, Number(o._sum.total || 0)]),
    );
    const openSessions = await this.prisma.tableSession.findMany({
      where: {
        assetId,
        organizationId: user.organizationId,
        status: { in: ['open', 'bill_requested', 'billed'] },
      },
      select: {
        id: true,
        status: true,
        guestCount: true,
        serviceLocationId: true,
        openedAt: true,
      },
    });
    const sessionByLoc = new Map(openSessions.map((s) => [s.serviceLocationId, s]));
    const recentOrders = await this.prisma.serviceOrder.findMany({
      where: {
        assetId,
        organizationId: user.organizationId,
        status: { notIn: ['cancelled', 'rejected'] },
      },
      select: { serviceLocationId: true, placedAt: true },
      orderBy: { placedAt: 'desc' },
      take: 200,
    });
    const lastOrderAt = new Map<string, Date>();
    for (const o of recentOrders) {
      if (!lastOrderAt.has(o.serviceLocationId)) {
        lastOrderAt.set(o.serviceLocationId, o.placedAt);
      }
    }
    return locations.map((l) => {
      const sess = sessionByLoc.get(l.id);
      const lastOrder = lastOrderAt.get(l.id);
      const lastScan = l.lastScannedAt;
      let lastActivityAt: Date | null = null;
      for (const d of [lastOrder, lastScan, sess?.openedAt]) {
        if (!d) continue;
        if (!lastActivityAt || d > lastActivityAt) lastActivityAt = d;
      }
      return {
        ...l,
        ordersToday: countMap.get(l.id) || 0,
        salesToday: salesMap.get(l.id) || 0,
        openSession: sess
          ? {
              id: sess.id,
              status: sess.status,
              guestCount: sess.guestCount,
            }
          : null,
        lastActivityAt: lastActivityAt?.toISOString() || null,
        publicPath: `/o/${l.publicToken}`,
      };
    });
  }

  async createLocation(user: AuthUser, input: CreateServiceLocationInput) {
    const { asset } = await this.inventory.resolveAssetAccess(user, input.assetId, true);
    return this.prisma.serviceLocation.create({
      data: {
        organizationId: asset.organizationId,
        assetId: asset.id,
        locationType: input.locationType,
        label: input.label.trim(),
        locationRef: input.locationRef || null,
        publicToken: newPublicToken(),
        createdBy: user.sub,
      },
    });
  }

  async updateLocation(user: AuthUser, id: string, input: UpdateServiceLocationInput) {
    const loc = await this.prisma.serviceLocation.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!loc) throw new NotFoundException('Location not found');
    await this.inventory.resolveAssetAccess(user, loc.assetId, true);
    return this.prisma.serviceLocation.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.locationRef !== undefined ? { locationRef: input.locationRef } : {}),
      },
    });
  }

  async regenerateToken(user: AuthUser, id: string) {
    const loc = await this.prisma.serviceLocation.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!loc) throw new NotFoundException('Location not found');
    await this.inventory.resolveAssetAccess(user, loc.assetId, true);
    return this.prisma.serviceLocation.update({
      where: { id },
      data: { publicToken: newPublicToken() },
    });
  }

  // ── Staff: catalog ──────────────────────────────────────────────────

  private slugCategoryKey(raw: string) {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'other';
  }

  private readGuestMenuCategories(
    profileJson: unknown,
  ): Array<{ key: string; label: string; emoji?: string | null }> {
    if (!profileJson || typeof profileJson !== 'object' || Array.isArray(profileJson)) {
      return [];
    }
    const guestMenu = (profileJson as Record<string, unknown>).guestMenu;
    if (!guestMenu || typeof guestMenu !== 'object' || Array.isArray(guestMenu)) return [];
    const cats = (guestMenu as Record<string, unknown>).categories;
    if (!Array.isArray(cats)) return [];
    const out: Array<{ key: string; label: string; emoji: string | null }> = [];
    for (const c of cats) {
      if (!c || typeof c !== 'object') continue;
      const key = String((c as { key?: string }).key || '').trim();
      const label = String((c as { label?: string }).label || '').trim();
      const emojiRaw = (c as { emoji?: string | null }).emoji;
      const emoji =
        typeof emojiRaw === 'string' && emojiRaw.trim() ? emojiRaw.trim().slice(0, 8) : null;
      if (!key || !label) continue;
      out.push({ key, label, emoji });
    }
    return out;
  }

  private readFeaturedOfferingIds(profileJson: unknown): string[] {
    if (!profileJson || typeof profileJson !== 'object' || Array.isArray(profileJson)) {
      return [];
    }
    const guestMenu = (profileJson as Record<string, unknown>).guestMenu;
    if (!guestMenu || typeof guestMenu !== 'object' || Array.isArray(guestMenu)) return [];
    const ids = (guestMenu as Record<string, unknown>).featuredOfferingIds;
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => String(id)).filter(Boolean);
  }

  private readGuestMenuBlob(profileJson: unknown): Record<string, unknown> {
    if (!profileJson || typeof profileJson !== 'object' || Array.isArray(profileJson)) {
      return {};
    }
    const guestMenu = (profileJson as Record<string, unknown>).guestMenu;
    if (!guestMenu || typeof guestMenu !== 'object' || Array.isArray(guestMenu)) return {};
    return { ...(guestMenu as Record<string, unknown>) };
  }

  private readGuestMenuCommerce(profileJson: unknown) {
    const blob = this.readGuestMenuBlob(profileJson);
    const specialsRaw = Array.isArray(blob.specials) ? blob.specials : [];
    const combosRaw = Array.isArray(blob.combos) ? blob.combos : [];
    const upsellRaw =
      blob.upsellPairs && typeof blob.upsellPairs === 'object' && !Array.isArray(blob.upsellPairs)
        ? (blob.upsellPairs as Record<string, unknown>)
        : {};
    const specials = specialsRaw
      .map((s) => {
        if (!s || typeof s !== 'object') return null;
        const row = s as Record<string, unknown>;
        const offeringId = String(row.offeringId || '');
        const title = String(row.title || '').trim();
        const type = String(row.type || 'today');
        if (!offeringId || !title) return null;
        return {
          type,
          title,
          offeringId,
          blurb: row.blurb != null ? String(row.blurb) : null,
          until: row.until != null ? String(row.until) : null,
        };
      })
      .filter(Boolean) as Array<{
      type: string;
      title: string;
      offeringId: string;
      blurb: string | null;
      until: string | null;
    }>;
    const combos = combosRaw
      .map((c) => {
        if (!c || typeof c !== 'object') return null;
        const row = c as Record<string, unknown>;
        const id = String(row.id || '');
        const name = String(row.name || '').trim();
        const offeringIds = Array.isArray(row.offeringIds)
          ? row.offeringIds.map((x) => String(x)).filter(Boolean)
          : [];
        const price = Number(row.price);
        if (!id || !name || offeringIds.length < 2 || Number.isNaN(price)) return null;
        return {
          id,
          name,
          offeringIds,
          price,
          currency: String(row.currency || 'INR'),
          saveAmount: row.saveAmount != null ? Number(row.saveAmount) : null,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      offeringIds: string[];
      price: number;
      currency: string;
      saveAmount: number | null;
    }>;
    const upsellPairs: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(upsellRaw)) {
      if (!Array.isArray(v)) continue;
      upsellPairs[k] = v.map((x) => String(x)).filter(Boolean).slice(0, 8);
    }
    return { specials, combos, upsellPairs };
  }

  async putGuestMenuConfig(user: AuthUser, assetId: string, input: PutGuestMenuConfigInput) {
    const { asset } = await this.inventory.resolveAssetAccess(user, assetId, true);
    const prev =
      asset.profileJson && typeof asset.profileJson === 'object' && !Array.isArray(asset.profileJson)
        ? (asset.profileJson as Record<string, unknown>)
        : {};
    const prevMenu = this.readGuestMenuBlob(asset.profileJson);
    const nextMenu: Record<string, unknown> = { ...prevMenu };
    if (input.categories) {
      const keys = new Set<string>();
      nextMenu.categories = input.categories.map((c) => {
        const key = this.slugCategoryKey(c.key);
        if (keys.has(key)) throw new BadRequestException(`Duplicate category key: ${key}`);
        keys.add(key);
        const emoji =
          typeof c.emoji === 'string' && c.emoji.trim() ? c.emoji.trim().slice(0, 8) : null;
        return { key, label: c.label.trim(), emoji };
      });
    }
    if (input.featuredOfferingIds) nextMenu.featuredOfferingIds = input.featuredOfferingIds;
    if (input.specials) nextMenu.specials = input.specials;
    if (input.combos) nextMenu.combos = input.combos;
    if (input.upsellPairs) nextMenu.upsellPairs = input.upsellPairs;
    const updated = await this.prisma.partnerAsset.update({
      where: { id: assetId },
      data: {
        profileJson: { ...prev, guestMenu: nextMenu } as Prisma.InputJsonValue,
      },
    });
    return this.readGuestMenuCommerce(updated.profileJson);
  }

  async getGuestMenuConfig(user: AuthUser, assetId: string) {
    const { asset } = await this.inventory.resolveAssetAccess(user, assetId, false);
    const cats = this.readGuestMenuCategories(asset.profileJson);
    const commerce = this.readGuestMenuCommerce(asset.profileJson);
    return {
      categories: cats,
      featuredOfferingIds: this.readFeaturedOfferingIds(asset.profileJson),
      ...commerce,
    };
  }

  async listMenuCategories(user: AuthUser, assetId: string) {
    const { asset } = await this.inventory.resolveAssetAccess(user, assetId, false);
    const offerings = await this.prisma.serviceOffering.findMany({
      where: { assetId, organizationId: user.organizationId },
      select: { category: true },
    });
    const counts = new Map<string, number>();
    for (const o of offerings) {
      const k = o.category || 'other';
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let managed = this.readGuestMenuCategories(asset.profileJson);
    if (!managed.length) {
      managed = [...counts.keys()]
        .sort()
        .map((key) => ({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        }));
      if (managed.length) {
        await this.putMenuCategories(user, assetId, { categories: managed });
      }
    }
    const known = new Set(managed.map((c) => c.key));
    for (const key of counts.keys()) {
      if (!known.has(key)) {
        managed.push({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        });
      }
    }
    return {
      categories: managed.map((c) => ({
        ...c,
        itemCount: counts.get(c.key) || 0,
      })),
    };
  }

  async putMenuCategories(
    user: AuthUser,
    assetId: string,
    input: PutGuestMenuCategoriesInput,
  ) {
    const { asset } = await this.inventory.resolveAssetAccess(user, assetId, true);
    const keys = new Set<string>();
    const categories = input.categories.map((c) => {
      const key = this.slugCategoryKey(c.key);
      if (keys.has(key)) {
        throw new BadRequestException(`Duplicate category key: ${key}`);
      }
      keys.add(key);
      const emoji =
        typeof c.emoji === 'string' && c.emoji.trim() ? c.emoji.trim().slice(0, 8) : null;
      return { key, label: c.label.trim(), emoji };
    });
    const prev =
      asset.profileJson && typeof asset.profileJson === 'object' && !Array.isArray(asset.profileJson)
        ? (asset.profileJson as Record<string, unknown>)
        : {};
    const prevMenu = this.readGuestMenuBlob(asset.profileJson);
    const updated = await this.prisma.partnerAsset.update({
      where: { id: assetId },
      data: {
        profileJson: {
          ...prev,
          guestMenu: {
            ...prevMenu,
            categories,
          },
        } as Prisma.InputJsonValue,
      },
    });
    return {
      categories: this.readGuestMenuCategories(updated.profileJson).map((c) => ({
        ...c,
        itemCount: 0,
      })),
    };
  }

  async renameMenuCategory(
    user: AuthUser,
    assetId: string,
    input: RenameGuestMenuCategoryInput,
  ) {
    await this.inventory.resolveAssetAccess(user, assetId, true);
    const fromKey = input.fromKey.trim();
    const toKey = this.slugCategoryKey(input.toKey);
    const label = input.label.trim();
    if (fromKey !== toKey) {
      await this.prisma.serviceOffering.updateMany({
        where: {
          assetId,
          organizationId: user.organizationId,
          category: fromKey,
        },
        data: { category: toKey },
      });
    }
    const listed = await this.listMenuCategories(user, assetId);
    const emojiOverride =
      typeof input.emoji === 'string' && input.emoji.trim()
        ? input.emoji.trim().slice(0, 8)
        : undefined;
    const next = listed.categories
      .filter((c) => c.key !== fromKey || fromKey === toKey)
      .map((c) =>
        c.key === fromKey || c.key === toKey
          ? {
              key: toKey,
              label,
              emoji: emojiOverride ?? c.emoji ?? null,
            }
          : { key: c.key, label: c.label, emoji: c.emoji ?? null },
      );
    if (!next.some((c) => c.key === toKey)) {
      next.push({ key: toKey, label, emoji: emojiOverride ?? null });
    }
    // de-dupe
    const seen = new Set<string>();
    const unique = next.filter((c) => {
      if (seen.has(c.key)) return false;
      seen.add(c.key);
      return true;
    });
    await this.putMenuCategories(user, assetId, { categories: unique });
    return this.listMenuCategories(user, assetId);
  }

  async listOfferings(user: AuthUser, assetId: string) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    return this.prisma.serviceOffering.findMany({
      where: { assetId, organizationId: user.organizationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  private assertOfferingImage(imageUrl?: string | null) {
    if (!imageUrl) return;
    if (imageUrl.startsWith('data:')) {
      if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageUrl)) {
        throw new BadRequestException('Dish photo must be JPEG, PNG, or WebP');
      }
      // ~1.2MB base64 ceiling after studio compress
      if (imageUrl.length > 1_600_000) {
        throw new BadRequestException('Dish photo is too large — re-crop under 800px');
      }
    }
  }

  async createOffering(user: AuthUser, input: CreateServiceOfferingInput) {
    const { asset } = await this.inventory.resolveAssetAccess(user, input.assetId, true);
    this.assertOfferingImage(input.imageUrl);
    return this.prisma.serviceOffering.create({
      data: {
        organizationId: asset.organizationId,
        assetId: asset.id,
        name: input.name.trim(),
        description: input.description || null,
        category: input.category || 'other',
        kind: input.kind || 'food',
        unitPrice: new Prisma.Decimal(input.unitPrice),
        taxPercent: new Prisma.Decimal(input.taxPercent ?? 0),
        currency: input.currency || 'INR',
        dietaryLabels: input.dietaryLabels || undefined,
        imageUrl: input.imageUrl || null,
        sortOrder: input.sortOrder ?? 0,
        maxQuantity: input.maxQuantity ?? null,
        prepMinutes: input.prepMinutes ?? null,
        availableFrom: input.availableFrom || null,
        availableUntil: input.availableUntil || null,
        modifiersJson: input.modifiers
          ? (input.modifiers as unknown as Prisma.InputJsonValue)
          : undefined,
        createdBy: user.sub,
      },
    });
  }

  async updateOffering(user: AuthUser, id: string, input: UpdateServiceOfferingInput) {
    const row = await this.prisma.serviceOffering.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Offering not found');
    await this.inventory.resolveAssetAccess(user, row.assetId, true);
    if (input.imageUrl !== undefined) this.assertOfferingImage(input.imageUrl);
    return this.prisma.serviceOffering.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.unitPrice !== undefined
          ? { unitPrice: new Prisma.Decimal(input.unitPrice) }
          : {}),
        ...(input.taxPercent !== undefined
          ? { taxPercent: new Prisma.Decimal(input.taxPercent) }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.dietaryLabels !== undefined ? { dietaryLabels: input.dietaryLabels } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.maxQuantity !== undefined ? { maxQuantity: input.maxQuantity } : {}),
        ...(input.prepMinutes !== undefined ? { prepMinutes: input.prepMinutes } : {}),
        ...(input.availableFrom !== undefined ? { availableFrom: input.availableFrom } : {}),
        ...(input.availableUntil !== undefined ? { availableUntil: input.availableUntil } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.stopSell !== undefined ? { stopSell: input.stopSell } : {}),
        ...(input.modifiers !== undefined
          ? { modifiersJson: input.modifiers as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  // ── Staff: table sessions ───────────────────────────────────────────

  async openTableSession(user: AuthUser, input: OpenTableSessionInput) {
    const loc = await this.prisma.serviceLocation.findFirst({
      where: { id: input.serviceLocationId, organizationId: user.organizationId },
    });
    if (!loc) throw new NotFoundException('Location not found');
    if (loc.locationType !== 'RESTAURANT_TABLE' && loc.locationType !== 'DINING_ZONE') {
      throw new BadRequestException('Table sessions are for restaurant tables/zones');
    }
    await this.inventory.resolveAssetAccess(user, loc.assetId, true);
    const open = await this.prisma.tableSession.findFirst({
      where: { serviceLocationId: loc.id, status: 'open' },
    });
    if (open) throw new BadRequestException('Table already has an open session');
    return this.prisma.tableSession.create({
      data: {
        organizationId: loc.organizationId,
        assetId: loc.assetId,
        serviceLocationId: loc.id,
        guestCount: input.guestCount ?? 1,
        openedBy: user.sub,
      },
    });
  }

  async closeTableSession(user: AuthUser, id: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.inventory.resolveAssetAccess(user, session.assetId, true);
    return this.prisma.tableSession.update({
      where: { id },
      data: { status: 'closed', closedAt: new Date() },
    });
  }

  async listOpenSessions(user: AuthUser, assetId: string) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    return this.prisma.tableSession.findMany({
      where: { assetId, organizationId: user.organizationId, status: 'open' },
      include: { serviceLocation: { select: { id: true, label: true } } },
      orderBy: { openedAt: 'desc' },
    });
  }

  // ── Staff: orders board ─────────────────────────────────────────────

  async listOrders(
    user: AuthUser,
    assetId: string,
    opts?: { status?: string; board?: string },
  ) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    const statusFilter = opts?.status
      ? { status: opts.status }
      : opts?.board === 'kitchen'
        ? { status: { in: ['placed', 'accepted', 'preparing', 'ready'] } }
        : opts?.board === 'host'
          ? { status: { in: ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery'] } }
          : {};
    return this.prisma.serviceOrder.findMany({
      where: {
        assetId,
        organizationId: user.organizationId,
        ...statusFilter,
      },
      include: {
        items: true,
        serviceLocation: { select: { id: true, label: true, locationType: true } },
        tableSession: { select: { id: true, status: true, guestCount: true } },
        stayReservation: {
          select: { id: true, guestName: true, roomUnit: { select: { name: true } } },
        },
      },
      orderBy: { placedAt: 'desc' },
      take: 100,
    });
  }

  async updateOrderStatus(
    user: AuthUser,
    id: string,
    input: UpdateServiceOrderStatusInput,
  ) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    await this.inventory.resolveAssetAccess(user, order.assetId, true);

    const data: Prisma.ServiceOrderUpdateInput = { status: input.status };
    if (
      input.status === 'accepted' ||
      (input.status === 'preparing' && !order.acceptedAt)
    ) {
      data.acceptedAt = new Date();
    }
    if (input.status === 'completed' || input.status === 'served') {
      data.completedAt = new Date();
    }

    const updated = await this.prisma.serviceOrder.update({
      where: { id },
      data,
      include: { items: true, serviceLocation: true },
    });

    if (
      (input.status === 'accepted' ||
        input.status === 'preparing' ||
        input.status === 'served' ||
        input.status === 'completed') &&
      !order.folioPostedAt
    ) {
      await this.postOrderToFolio(order.id, user.sub);
    }

    await this.timeline(
      user.organizationId,
      'ServiceOrderStatusChanged',
      'service_order',
      id,
      `Order ${input.status} · ${updated.serviceLocation.label}`,
      user.sub,
    );
    return this.prisma.serviceOrder.findFirst({
      where: { id },
      include: { items: true, serviceLocation: true },
    });
  }

  async sessionBill(user: AuthUser, sessionId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, organizationId: user.organizationId },
      include: {
        folioCharges: true,
        serviceLocation: true,
        serviceOrders: { include: { items: true }, orderBy: { placedAt: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.inventory.resolveAssetAccess(user, session.assetId, false);
    const charges = session.folioCharges.reduce(
      (s, c) => s + Number(c.amount) + Number(c.taxAmount),
      0,
    );
    return {
      session,
      charges,
      paid: Number(session.amountPaid),
      outstanding: Math.max(0, charges - Number(session.amountPaid)),
    };
  }

  private async postOrderToFolio(orderId: string, actorUserId?: string | null) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.folioPostedAt) return;
    if (order.tableSessionId) {
      for (const item of order.items) {
        const mods = (item.modifiersSnapshotJson as Array<{ name: string }> | null) || [];
        const modNote = mods.length ? ` (${mods.map((m) => m.name).join(', ')})` : '';
        await this.prisma.folioCharge.create({
          data: {
            tableSessionId: order.tableSessionId,
            description: `${item.nameSnapshot} × ${item.quantity}${modNote}`,
            category: 'meal',
            amount: new Prisma.Decimal(
              Number(item.lineTotal) - Number(item.taxSnapshot),
            ),
            taxAmount: item.taxSnapshot,
            currency: order.currency,
            createdBy: actorUserId || null,
          },
        });
      }
    } else if (order.stayReservationId) {
      for (const item of order.items) {
        const mods = (item.modifiersSnapshotJson as Array<{ name: string }> | null) || [];
        const modNote = mods.length ? ` (${mods.map((m) => m.name).join(', ')})` : '';
        await this.prisma.folioCharge.create({
          data: {
            stayReservationId: order.stayReservationId,
            description: `Room service · ${item.nameSnapshot} × ${item.quantity}${modNote}`,
            category: 'meal',
            amount: new Prisma.Decimal(
              Number(item.lineTotal) - Number(item.taxSnapshot),
            ),
            taxAmount: item.taxSnapshot,
            currency: order.currency,
            createdBy: actorUserId || null,
          },
        });
      }
    }
    await this.prisma.serviceOrder.update({
      where: { id: orderId },
      data: { folioPostedAt: new Date() },
    });
  }

  // ── Public guest API ────────────────────────────────────────────────

  private publicMenuCategories(
    profileJson: unknown,
    offerings: Array<{ category: string | null }>,
  ) {
    const managed = this.readGuestMenuCategories(profileJson);
    const present = new Set(
      offerings.map((o) => o.category || 'other').filter(Boolean),
    );
    const ordered: Array<{ key: string; label: string; emoji?: string | null }> = [];
    const seen = new Set<string>();
    for (const c of managed) {
      if (!present.has(c.key) || seen.has(c.key)) continue;
      ordered.push(c);
      seen.add(c.key);
    }
    for (const key of present) {
      if (seen.has(key)) continue;
      ordered.push({
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()),
        emoji: null,
      });
      seen.add(key);
    }
    return ordered;
  }

  private async popularOfferingCounts(assetId: string, organizationId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const items = await this.prisma.serviceOrderItem.findMany({
      where: {
        offeringId: { not: null },
        order: {
          assetId,
          organizationId,
          placedAt: { gte: start },
          status: { notIn: ['cancelled', 'rejected'] },
        },
      },
      select: { offeringId: true, quantity: true },
    });
    const counts = new Map<string, number>();
    for (const row of items) {
      if (!row.offeringId) continue;
      counts.set(row.offeringId, (counts.get(row.offeringId) || 0) + row.quantity);
    }
    return counts;
  }

  private async ratingAggregates(assetId: string, organizationId: string) {
    const groups = await this.prisma.serviceOfferingRating.groupBy({
      by: ['offeringId'],
      where: { assetId, organizationId },
      _avg: { stars: true },
      _count: { stars: true },
    });
    const byOffering = new Map<string, { ratingAvg: number; ratingCount: number }>();
    let sum = 0;
    let count = 0;
    for (const g of groups) {
      const avg = Number(g._avg.stars || 0);
      const n = g._count.stars;
      byOffering.set(g.offeringId, {
        ratingAvg: Math.round(avg * 10) / 10,
        ratingCount: n,
      });
      sum += avg * n;
      count += n;
    }
    return {
      byOffering,
      venue:
        count >= 3
          ? { ratingAvg: Math.round((sum / count) * 10) / 10, ratingCount: count }
          : { ratingAvg: null as number | null, ratingCount: count },
    };
  }

  private async kitchenStatus(assetId: string, organizationId: string, offerings: Array<{ prepMinutes?: number | null }>) {
    const openTickets = await this.prisma.serviceOrder.count({
      where: {
        assetId,
        organizationId,
        status: { in: ['placed', 'accepted', 'preparing'] },
      },
    });
    const prepValues = offerings
      .map((o) => o.prepMinutes)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    const avgPrepMinutes = prepValues.length
      ? Math.round(prepValues.reduce((a, b) => a + b, 0) / prepValues.length)
      : 18;
    const busy = openTickets >= 8;
    const load = Math.min(2.2, 1 + openTickets / 10);
    return {
      accepting: true as boolean,
      busy,
      openTickets,
      avgPrepMinutes,
      estimatedWaitMinutes: Math.round(avgPrepMinutes * load),
    };
  }

  async publicResolve(token: string) {
    const loc = await this.prisma.serviceLocation.findFirst({
      where: { publicToken: token, status: 'active' },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            assetKind: true,
            organizationId: true,
            profileJson: true,
          },
        },
        organization: {
          select: { id: true, name: true, brandingJson: true, timezone: true, settingsJson: true },
        },
      },
    });
    if (!loc) throw new NotFoundException('Invalid or disabled QR link');

    await this.prisma.serviceLocation.update({
      where: { id: loc.id },
      data: { lastScannedAt: new Date() },
    });

    const settings = await this.gsSettings(loc.organizationId);
    const tz = loc.organization.timezone || 'Asia/Kolkata';
    const nowHm = hmNow(tz);
    const inHours = inWindow(
      nowHm,
      settings.businessHoursFrom,
      settings.businessHoursUntil,
    );
    const accepting =
      settings.qrEnabled && settings.acceptingOrders && inHours;

    const isRestaurant =
      loc.locationType === 'RESTAURANT_TABLE' || loc.locationType === 'DINING_ZONE';
    const isStay =
      loc.locationType === 'HOTEL_ROOM' ||
      loc.locationType === 'HOMESTAY_ROOM' ||
      loc.locationType === 'FARMSTAY_UNIT';

    let tableSession: { id: string; status: string; guestCount: number } | null = null;
    let stayContext: { requiresPin: boolean; roomLabel: string; stayReservationId?: string } | null =
      null;

    if (isRestaurant) {
      const open = await this.prisma.tableSession.findFirst({
        where: {
          serviceLocationId: loc.id,
          status: { in: ['open', 'bill_requested', 'billed'] },
        },
        select: { id: true, status: true, guestCount: true },
        orderBy: { openedAt: 'desc' },
      });
      tableSession = open;
    }

    if (isStay) {
      const stay = await this.findActiveStayForLocation(loc);
      stayContext = {
        requiresPin:
          settings.requireRoomPin &&
          (loc.locationType === 'HOTEL_ROOM' || loc.asset.assetKind === 'hotel'),
        roomLabel: loc.label,
        stayReservationId: stay?.id,
      };
      if (!stay) {
        return {
          location: {
            label: loc.label,
            locationType: loc.locationType,
            assetName: loc.asset.name,
            assetKind: loc.asset.assetKind,
          },
          businessName: loc.organization.name,
          branding: loc.organization.brandingJson,
          acceptingOrders: false,
          reason: 'NO_ACTIVE_STAY',
          message: 'Ordering unavailable. Please contact reception.',
          offerings: [] as unknown[],
          menuCategories: [] as Array<{ key: string; label: string; emoji?: string | null }>,
          popularToday: [] as unknown[],
          featuredOfferingIds: [] as string[],
          kitchen: null,
          venueRating: { ratingAvg: null, ratingCount: 0 },
          companion: {
            canRequestBill: false,
            canCallWaiter: false,
            canPay: false,
            tableSessionId: null,
          },
          allergenDisclaimer:
            'Dietary labels are informational. Ask staff about allergies — we cannot guarantee allergen-free preparation.',
          tableSession: null,
          stayContext,
          payment: { enabled: false, tableSessionId: null },
        };
      }
    }

    if (isRestaurant && !tableSession && !settings.walkInQrEnabled) {
      return {
        location: {
          label: loc.label,
          locationType: loc.locationType,
          assetName: loc.asset.name,
          assetKind: loc.asset.assetKind,
        },
        businessName: loc.organization.name,
        branding: loc.organization.brandingJson,
        acceptingOrders: false,
        reason: 'NO_OPEN_SESSION',
        message: 'This table is not open yet. Please ask a waiter to seat you.',
        offerings: [] as unknown[],
        menuCategories: [] as Array<{ key: string; label: string; emoji?: string | null }>,
        popularToday: [] as unknown[],
        featuredOfferingIds: [] as string[],
        kitchen: null,
        venueRating: { ratingAvg: null, ratingCount: 0 },
        companion: {
          canRequestBill: false,
          canCallWaiter: true,
          canPay: false,
          tableSessionId: null,
        },
        allergenDisclaimer:
          'Dietary labels are informational. Ask staff about allergies — we cannot guarantee allergen-free preparation.',
        tableSession: null,
        stayContext: null,
        payment: { enabled: false, tableSessionId: null },
      };
    }

    const baseOfferings = accepting
      ? await this.availableOfferings(loc.assetId, loc.organizationId, nowHm)
      : [];
    const [popularCounts, ratings, kitchen] = await Promise.all([
      this.popularOfferingCounts(loc.assetId, loc.organizationId),
      this.ratingAggregates(loc.assetId, loc.organizationId),
      this.kitchenStatus(loc.assetId, loc.organizationId, baseOfferings),
    ]);
    kitchen.accepting = accepting;

    const featuredOfferingIds = this.readFeaturedOfferingIds(loc.asset.profileJson).filter((id) =>
      baseOfferings.some((o) => o.id === id),
    );

    const offerings = baseOfferings.map((o) => ({
      ...o,
      ordersToday: popularCounts.get(o.id) || 0,
      ratingAvg: ratings.byOffering.get(o.id)?.ratingAvg ?? null,
      ratingCount: ratings.byOffering.get(o.id)?.ratingCount ?? 0,
      featured: featuredOfferingIds.includes(o.id),
    }));

    const popularToday = [...popularCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => {
        const o = offerings.find((x) => x.id === id);
        return o ? { ...o, ordersToday: count } : null;
      })
      .filter(Boolean);

    const payEnabled =
      Boolean(process.env.RAZORPAY_KEY_ID) || process.env.APP_ENV === 'local';

    const menuCats = this.publicMenuCategories(loc.asset.profileJson, offerings);
    const commerce = this.readGuestMenuCommerce(loc.asset.profileJson);
    const offeringIds = new Set(offerings.map((o) => o.id));
    const specials = commerce.specials
      .filter((s) => offeringIds.has(s.offeringId))
      .map((s) => ({
        ...s,
        offering: offerings.find((o) => o.id === s.offeringId) || null,
      }));
    const combos = commerce.combos.filter((c) =>
      c.offeringIds.every((id) => offeringIds.has(id)),
    );
    const suggestedSearchTokens = [
      ...new Set([
        ...menuCats.map((c) => c.label.split(/\s+/)[0]!).filter(Boolean),
        ...offerings
          .slice(0, 12)
          .flatMap((o) => o.name.split(/\s+/).filter((w) => w.length > 3))
          .slice(0, 16),
        'Paneer',
        'Tea',
        'Sweet',
        'Spicy',
        'Veg',
      ]),
    ].slice(0, 12);

    return {
      location: {
        label: loc.label,
        locationType: loc.locationType,
        assetName: loc.asset.name,
        assetKind: loc.asset.assetKind,
      },
      businessName: loc.organization.name,
      branding: loc.organization.brandingJson,
      acceptingOrders: accepting,
      reason: accepting
        ? null
        : !settings.qrEnabled
          ? 'QR_DISABLED'
          : !settings.acceptingOrders
            ? 'PAUSED'
            : !inHours
              ? 'OUTSIDE_HOURS'
              : 'UNAVAILABLE',
      message: accepting
        ? null
        : !settings.qrEnabled
          ? 'Guest ordering links are turned off for this property.'
          : !settings.acceptingOrders
            ? 'The kitchen has paused QR orders. Please ask staff.'
            : !inHours
              ? `Ordering hours are ${settings.businessHoursFrom || '—'}–${settings.businessHoursUntil || '—'}.`
              : 'Ordering is not available right now. Please ask staff for help.',
      offerings,
      menuCategories: menuCats,
      popularToday,
      featuredOfferingIds,
      specials,
      combos,
      upsellPairs: commerce.upsellPairs,
      suggestedSearchTokens,
      kitchen,
      venueRating: ratings.venue,
      companion: {
        canRequestBill: Boolean(
          tableSession && ['open', 'bill_requested'].includes(tableSession.status),
        ),
        canCallWaiter: isRestaurant,
        canPay: payEnabled && Boolean(tableSession && tableSession.status !== 'paid'),
        tableSessionId: tableSession?.id ?? null,
      },
      allergenDisclaimer:
        'Dietary labels are informational. Ask staff about allergies — we cannot guarantee allergen-free preparation.',
      tableSession,
      stayContext,
      payment: {
        enabled: payEnabled,
        tableSessionId: tableSession?.id ?? null,
      },
    };
  }

  private async findActiveStayForLocation(loc: {
    assetId: string;
    locationRef: string | null;
    label: string;
  }) {
    const unitFilter = loc.locationRef
      ? { roomUnitId: loc.locationRef }
      : {
          roomUnit: {
            name: { equals: loc.label.replace(/^Room\s+/i, '').trim() },
          },
        };
    return this.prisma.stayReservation.findFirst({
      where: {
        assetId: loc.assetId,
        status: 'checked_in',
        ...unitFilter,
      },
      include: { roomUnit: { select: { id: true, name: true } } },
      orderBy: { checkIn: 'desc' },
    });
  }

  private async availableOfferings(
    assetId: string,
    organizationId: string,
    nowHm: string,
  ) {
    const rows = await this.prisma.serviceOffering.findMany({
      where: {
        assetId,
        organizationId,
        isActive: true,
        stopSell: false,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows
      .filter((o) => inWindow(nowHm, o.availableFrom, o.availableUntil))
      .map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        category: o.category,
        kind: o.kind,
        unitPrice: Number(o.unitPrice),
        taxPercent: Number(o.taxPercent),
        currency: o.currency,
        dietaryLabels: o.dietaryLabels,
        imageUrl: o.imageUrl,
        maxQuantity: o.maxQuantity,
        prepMinutes: o.prepMinutes,
        sortOrder: o.sortOrder,
        modifiers: (o.modifiersJson as ModifierGroup[] | null) || [],
      }));
  }

  async publicPlaceOrder(
    token: string,
    input: PlaceGuestServiceOrderInput,
    clientIp?: string,
  ) {
    const loc = await this.prisma.serviceLocation.findFirst({
      where: { publicToken: token, status: 'active' },
      include: { organization: { select: { timezone: true } }, asset: true },
    });
    if (!loc) throw new NotFoundException('Invalid or disabled QR link');

    const existing = await this.prisma.serviceOrder.findFirst({
      where: {
        organizationId: loc.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
      include: { items: true, serviceLocation: true },
    });
    if (existing) return existing;

    const settings = await this.gsSettings(loc.organizationId);
    const nowHm = hmNow(loc.organization.timezone || 'Asia/Kolkata');
    if (
      !settings.qrEnabled ||
      !settings.acceptingOrders ||
      !inWindow(nowHm, settings.businessHoursFrom, settings.businessHoursUntil)
    ) {
      throw new BadRequestException('Ordering is not available right now');
    }

    let tableSessionId: string | null = null;
    let stayReservationId: string | null = null;

    if (
      loc.locationType === 'RESTAURANT_TABLE' ||
      loc.locationType === 'DINING_ZONE'
    ) {
      let session = await this.prisma.tableSession.findFirst({
        where: { serviceLocationId: loc.id, status: 'open' },
      });
      if (!session && settings.walkInQrEnabled) {
        session = await this.prisma.tableSession.create({
          data: {
            organizationId: loc.organizationId,
            assetId: loc.assetId,
            serviceLocationId: loc.id,
            guestCount: 1,
            openedBy: null,
          },
        });
      }
      if (!session) {
        throw new BadRequestException('Table session is not open. Ask a waiter to seat you.');
      }
      tableSessionId = session.id;
    } else if (
      loc.locationType === 'HOTEL_ROOM' ||
      loc.locationType === 'HOMESTAY_ROOM' ||
      loc.locationType === 'FARMSTAY_UNIT'
    ) {
      const stay = await this.findActiveStayForLocation(loc);
      if (!stay) {
        throw new BadRequestException('No active stay for this room. Contact reception.');
      }
      const needPin =
        settings.requireRoomPin &&
        (loc.locationType === 'HOTEL_ROOM' || loc.asset.assetKind === 'hotel');
      if (needPin) {
        if (!input.roomPin || input.roomPin !== stay.roomServicePin) {
          throw new BadRequestException('Invalid room service PIN');
        }
      }
      stayReservationId = stay.id;
    }

    const offeringIds = input.items.map((i) => i.offeringId);
    const offerings = await this.prisma.serviceOffering.findMany({
      where: {
        id: { in: offeringIds },
        assetId: loc.assetId,
        organizationId: loc.organizationId,
        isActive: true,
        stopSell: false,
      },
    });
    if (offerings.length !== new Set(offeringIds).size) {
      throw new BadRequestException('One or more items are unavailable');
    }
    const byId = new Map(offerings.map((o) => [o.id, o]));

    let subtotal = 0;
    let taxTotal = 0;
    const lineData: Prisma.ServiceOrderItemCreateWithoutOrderInput[] = [];
    for (const line of input.items) {
      const off = byId.get(line.offeringId)!;
      if (!inWindow(nowHm, off.availableFrom, off.availableUntil)) {
        throw new BadRequestException(`${off.name} is not available at this time`);
      }
      if (off.maxQuantity && line.quantity > off.maxQuantity) {
        throw new BadRequestException(`${off.name}: max quantity is ${off.maxQuantity}`);
      }
      const groups = (off.modifiersJson as ModifierGroup[] | null) || [];
      const mods = line.modifiers || [];
      this.assertModifiers(groups, mods, off.name);
      const modDelta = mods.reduce((s, m) => s + Number(m.priceDelta || 0), 0);
      const unit = Number(off.unitPrice) + modDelta;
      const taxPct = Number(off.taxPercent);
      const lineSub = unit * line.quantity;
      const lineTax = (lineSub * taxPct) / 100;
      subtotal += lineSub;
      taxTotal += lineTax;
      lineData.push({
        offering: { connect: { id: off.id } },
        nameSnapshot: off.name,
        quantity: line.quantity,
        unitPriceSnapshot: new Prisma.Decimal(unit),
        taxSnapshot: new Prisma.Decimal(lineTax),
        lineTotal: new Prisma.Decimal(lineSub + lineTax),
        instructions: line.instructions || null,
        modifiersSnapshotJson: mods.length
          ? (mods as unknown as Prisma.InputJsonValue)
          : undefined,
      });
    }

    const order = await this.prisma.serviceOrder.create({
      data: {
        organizationId: loc.organizationId,
        assetId: loc.assetId,
        serviceLocationId: loc.id,
        tableSessionId,
        stayReservationId,
        sourceType: 'QR',
        status: 'placed',
        currency: offerings[0]?.currency || 'INR',
        subtotal: new Prisma.Decimal(subtotal),
        taxTotal: new Prisma.Decimal(taxTotal),
        total: new Prisma.Decimal(subtotal + taxTotal),
        customerNote: input.customerNote || null,
        idempotencyKey: input.idempotencyKey,
        items: { create: lineData },
      },
      include: { items: true, serviceLocation: true },
    });

    await this.timeline(
      loc.organizationId,
      'ServiceOrderPlaced',
      'service_order',
      order.id,
      `QR order at ${loc.label} · ${clientIp || 'unknown'}`,
      null,
    );
    await this.notifyOps(
      loc.organizationId,
      'New QR order',
      `${loc.label}: ${order.items.length} item(s) · ${order.currency} ${Number(order.total).toFixed(0)}`,
      '/live-tickets',
    );

    return order;
  }

  async publicOrderStatus(token: string, orderId: string) {
    const loc = await this.prisma.serviceLocation.findFirst({
      where: { publicToken: token, status: 'active' },
    });
    if (!loc) throw new NotFoundException('Invalid QR link');
    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id: orderId,
        serviceLocationId: loc.id,
        organizationId: loc.organizationId,
      },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      id: order.id,
      status: order.status,
      total: Number(order.total),
      currency: order.currency,
      placedAt: order.placedAt,
      items: order.items.map((i) => ({
        offeringId: i.offeringId,
        name: i.nameSnapshot,
        quantity: i.quantity,
        lineTotal: Number(i.lineTotal),
        status: i.status,
        modifiers: Array.isArray(i.modifiersSnapshotJson)
          ? (i.modifiersSnapshotJson as Array<{ name?: string; priceDelta?: number }>)
              .map((m) => ({
                name: String(m.name || ''),
                priceDelta: Number(m.priceDelta) || 0,
              }))
              .filter((m) => m.name)
          : [],
      })),
    };
  }

  async publicCreateRequest(
    token: string,
    input: CreateGuestServiceRequestInput,
  ) {
    const loc = await this.prisma.serviceLocation.findFirst({
      where: { publicToken: token, status: 'active' },
      include: { asset: true },
    });
    if (!loc) throw new NotFoundException('Invalid QR link');
    const settings = await this.gsSettings(loc.organizationId);
    if (!settings.qrEnabled) throw new BadRequestException('QR services disabled');

    let stayReservationId: string | null = null;
    if (
      loc.locationType === 'HOTEL_ROOM' ||
      loc.locationType === 'HOMESTAY_ROOM' ||
      loc.locationType === 'FARMSTAY_UNIT'
    ) {
      const stay = await this.findActiveStayForLocation(loc);
      if (!stay) throw new BadRequestException('No active stay');
      const needPin =
        settings.requireRoomPin &&
        (loc.locationType === 'HOTEL_ROOM' || loc.asset.assetKind === 'hotel');
      if (needPin && (!input.roomPin || input.roomPin !== stay.roomServicePin)) {
        throw new BadRequestException('Invalid room service PIN');
      }
      stayReservationId = stay.id;
    }

    const req = await this.prisma.guestServiceRequest.create({
      data: {
        organizationId: loc.organizationId,
        assetId: loc.assetId,
        serviceLocationId: loc.id,
        stayReservationId,
        category: input.category || 'housekeeping',
        title: input.title.trim(),
        notes: input.notes || null,
      },
    });
    await this.notifyOps(
      loc.organizationId,
      'Guest service request',
      `${loc.label}: ${req.title}`,
      '/guest-services',
    );
    return req;
  }

  private assertModifiers(
    groups: ModifierGroup[],
    picks: Array<{ groupId: string; optionId: string; name: string; priceDelta: number }>,
    offeringName?: string,
  ) {
    const dish = offeringName ? ` for ${offeringName}` : '';
    for (const g of groups) {
      const selected = picks.filter((p) => p.groupId === g.id);
      if (selected.length < (g.minSelect || 0)) {
        throw new BadRequestException(
          `Choose ${g.name}${dish} — pick at least ${g.minSelect}`,
        );
      }
      if (selected.length > (g.maxSelect || 1)) {
        throw new BadRequestException(
          `Choose at most ${g.maxSelect} for ${g.name}${dish}`,
        );
      }
      for (const s of selected) {
        const opt = g.options.find((o) => o.id === s.optionId);
        if (!opt) throw new BadRequestException(`Invalid option for ${g.name}${dish}`);
      }
    }
  }

  async requestBill(user: AuthUser, sessionId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, organizationId: user.organizationId },
      include: { serviceLocation: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.inventory.resolveAssetAccess(user, session.assetId, true);
    const updated = await this.prisma.tableSession.update({
      where: { id: sessionId },
      data: { status: session.status === 'open' ? 'bill_requested' : session.status },
    });
    await this.notifyOps(
      session.organizationId,
      'Bill requested',
      `${session.serviceLocation.label} requested the bill`,
      '/live-tickets',
    );
    return updated;
  }

  /** Staff saw the bill ping — remove from Live tickets Service chips. */
  async acknowledgeBillRequest(user: AuthUser, sessionId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, organizationId: user.organizationId },
      include: { serviceLocation: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.inventory.resolveAssetAccess(user, session.assetId, true);
    if (session.status !== 'bill_requested') {
      return session;
    }
    const updated = await this.prisma.tableSession.update({
      where: { id: sessionId },
      data: { status: 'billed' },
    });
    await this.timeline(
      user.organizationId,
      'TableSessionBillAcknowledged',
      'table_session',
      sessionId,
      `Bill acknowledged · ${session.serviceLocation.label}`,
      user.sub,
    );
    return updated;
  }

  async updateGuestRequestStatus(
    user: AuthUser,
    id: string,
    input: UpdateGuestServiceRequestStatusInput,
  ) {
    const row = await this.prisma.guestServiceRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { serviceLocation: { select: { label: true } } },
    });
    if (!row) throw new NotFoundException('Request not found');
    await this.inventory.resolveAssetAccess(user, row.assetId, true);
    const updated = await this.prisma.guestServiceRequest.update({
      where: { id },
      data: {
        status: input.status,
        completedAt:
          input.status === 'done' || input.status === 'cancelled'
            ? new Date()
            : row.completedAt,
      },
    });
    await this.timeline(
      user.organizationId,
      'GuestServiceRequestStatusChanged',
      'guest_service_request',
      id,
      `${row.title} → ${input.status} · ${row.serviceLocation.label}`,
      user.sub,
    );
    return updated;
  }

  async createGuestCheck(user: AuthUser, sessionId: string) {
    const bill = await this.sessionBill(user, sessionId);
    const session = bill.session;
    const docNumber = `GC-${session.id.slice(-8).toUpperCase()}`;
    const commercial = await this.prisma.commercialDocument.create({
      data: {
        organizationId: session.organizationId,
        docType: 'guest_check',
        direction: 'receivable',
        linkedEntityType: 'table_session',
        linkedEntityId: session.id,
        documentNumber: docNumber,
        label: `Guest check · ${session.serviceLocation.label}`,
        amount: new Prisma.Decimal(bill.charges),
        taxAmount: new Prisma.Decimal(
          session.folioCharges.reduce((s, c) => s + Number(c.taxAmount), 0),
        ),
        amountPaid: new Prisma.Decimal(bill.paid),
        currency: session.currency || 'INR',
        status: bill.outstanding <= 0 ? 'paid' : 'open',
        createdBy: user.sub,
        lines: {
          create: session.folioCharges.map((c) => ({
            description: c.description,
            quantity: new Prisma.Decimal(1),
            unitAmount: c.amount,
            taxAmount: c.taxAmount,
          })),
        },
      },
    });

    const settings = await this.gsSettings(session.organizationId);
    if (settings.eInvoiceEnabled) {
      const ack = await createEInvoiceProvider().submit({
        organizationId: session.organizationId,
        documentId: commercial.id,
        documentNumber: docNumber,
        amount: Number(commercial.amount),
        taxAmount: Number(commercial.taxAmount),
        currency: commercial.currency,
        buyerLabel: session.serviceLocation.label,
      });
      await this.prisma.commercialDocument.update({
        where: { id: commercial.id },
        data: { eInvoiceJson: ack as unknown as Prisma.InputJsonValue },
      });
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: session.organizationId },
      select: { name: true },
    });
    const pdfBuffer = await buildGuestCheckPdf({
      businessName: org?.name || 'Restaurant',
      locationLabel: session.serviceLocation.label,
      documentNumber: docNumber,
      currency: session.currency || 'INR',
      lines: session.folioCharges.map((c) => ({
        description: c.description,
        amount: Number(c.amount),
        taxAmount: Number(c.taxAmount),
      })),
      subtotal: bill.charges - session.folioCharges.reduce((s, c) => s + Number(c.taxAmount), 0),
      taxTotal: session.folioCharges.reduce((s, c) => s + Number(c.taxAmount), 0),
      total: bill.charges,
      amountPaid: bill.paid,
    });

    const file = await this.files.upload({
      organizationId: session.organizationId,
      userId: user.sub,
      entityType: 'guest_check',
      entityId: commercial.id,
      fileName: `${docNumber}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    return {
      documentId: commercial.id,
      downloadUrl: file.contentUrl,
      eInvoice: settings.eInvoiceEnabled,
    };
  }

  async createPayIntent(user: AuthUser, sessionId: string) {
    const bill = await this.sessionBill(user, sessionId);
    if (bill.outstanding <= 0) {
      throw new BadRequestException('Nothing outstanding on this session');
    }
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return {
        mode: 'mock' as const,
        amount: bill.outstanding,
        currency: bill.session.currency || 'INR',
        sessionId,
        message: 'Razorpay keys not set — use mock confirm',
      };
    }
    // Minimal Razorpay Orders API (no SDK) — amount in paise
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(bill.outstanding * 100),
        currency: (bill.session.currency || 'INR').toUpperCase(),
        receipt: `gs_${sessionId.slice(-12)}`,
        notes: { tableSessionId: sessionId },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Razorpay order failed: ${text.slice(0, 200)}`);
    }
    const order = (await res.json()) as { id: string; amount: number; currency: string };
    return {
      mode: 'razorpay' as const,
      keyId,
      razorpayOrderId: order.id,
      amount: bill.outstanding,
      currency: order.currency,
      sessionId,
    };
  }

  async confirmSessionPayment(
    user: AuthUser | null,
    sessionId: string,
    input: {
      mock?: boolean;
      tipAmount?: number;
      razorpayPaymentId?: string | null;
      razorpayOrderId?: string | null;
      razorpaySignature?: string | null;
    },
  ) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId },
      include: { folioCharges: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (user) {
      await this.inventory.resolveAssetAccess(user, session.assetId, true);
    }

    const tipAmount = Math.max(0, Number(input.tipAmount) || 0);
    if (tipAmount > 0) {
      const alreadyTipped = session.folioCharges.some(
        (c) => c.category === 'tip' && Number(c.amount) === tipAmount,
      );
      if (!alreadyTipped) {
        await this.prisma.folioCharge.create({
          data: {
            tableSessionId: sessionId,
            description: 'Tip',
            category: 'tip',
            amount: new Prisma.Decimal(tipAmount),
            taxAmount: new Prisma.Decimal(0),
            currency: session.currency || 'INR',
            createdBy: user?.sub || null,
          },
        });
      }
    }

    const refreshed = await this.prisma.tableSession.findFirst({
      where: { id: sessionId },
      include: { folioCharges: true },
    });
    if (!refreshed) throw new NotFoundException('Session not found');

    const charges = refreshed.folioCharges.reduce(
      (s, c) => s + Number(c.amount) + Number(c.taxAmount),
      0,
    );
    const outstanding = Math.max(0, charges - Number(refreshed.amountPaid));
    if (outstanding <= 0) {
      return this.prisma.tableSession.update({
        where: { id: sessionId },
        data: { status: 'paid' },
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!input.mock) {
      if (!keySecret || !input.razorpayPaymentId || !input.razorpayOrderId || !input.razorpaySignature) {
        throw new BadRequestException('Payment confirmation incomplete');
      }
      const expected = createHmac('sha256', keySecret)
        .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
        .digest('hex');
      if (expected !== input.razorpaySignature) {
        throw new BadRequestException('Invalid payment signature');
      }
    }

    const updated = await this.prisma.tableSession.update({
      where: { id: sessionId },
      data: {
        amountPaid: new Prisma.Decimal(Number(refreshed.amountPaid) + outstanding),
        status: 'paid',
      },
    });
    await this.prisma.paymentRecord.create({
      data: {
        organizationId: refreshed.organizationId,
        direction: 'inbound',
        amount: new Prisma.Decimal(outstanding),
        currency: refreshed.currency || 'INR',
        method: input.mock ? 'mock' : 'razorpay',
        reference: input.razorpayPaymentId || `mock_${sessionId}`,
        paidAt: new Date(),
        linkedEntityType: 'table_session',
        linkedEntityId: sessionId,
        notes: tipAmount > 0 ? `Guest Services online pay (+ tip ${tipAmount})` : 'Guest Services online pay',
        createdBy: user?.sub || null,
      },
    });
    await this.outbox.enqueue({
      organizationId: refreshed.organizationId,
      eventType: 'guest_services.payment',
      payload: {
        tableSessionId: sessionId,
        amount: outstanding,
        tipAmount,
        mock: Boolean(input.mock),
      },
    });
    return updated;
  }

  private async resolvePublicLocation(token: string) {
    const loc = await this.prisma.serviceLocation.findFirst({
      where: { publicToken: token, status: 'active' },
      include: { asset: true, organization: { select: { id: true, name: true, timezone: true } } },
    });
    if (!loc) throw new NotFoundException('Invalid or disabled QR link');
    return loc;
  }

  async publicRequestBill(token: string) {
    const loc = await this.resolvePublicLocation(token);
    const session = await this.prisma.tableSession.findFirst({
      where: {
        serviceLocationId: loc.id,
        status: { in: ['open', 'bill_requested'] },
      },
      include: { serviceLocation: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) throw new BadRequestException('No open table session for this QR');
    const updated = await this.prisma.tableSession.update({
      where: { id: session.id },
      data: { status: 'bill_requested' },
    });
    await this.notifyOps(
      loc.organizationId,
      'Bill requested',
      `${loc.label} requested the bill (guest QR)`,
      '/guest-services?gs=board',
    );
    return updated;
  }

  async publicSessionBill(token: string) {
    const loc = await this.resolvePublicLocation(token);
    const session = await this.prisma.tableSession.findFirst({
      where: {
        serviceLocationId: loc.id,
        status: { in: ['open', 'bill_requested', 'billed', 'paid'] },
      },
      include: { folioCharges: true, serviceLocation: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) throw new BadRequestException('No session bill for this QR');
    const lines = session.folioCharges.map((c) => ({
      id: c.id,
      description: c.description,
      category: c.category,
      amount: Number(c.amount),
      taxAmount: Number(c.taxAmount),
    }));
    const itemsSubtotal = lines
      .filter((l) => l.category !== 'tip' && l.category !== 'discount')
      .reduce((s, l) => s + l.amount, 0);
    const taxTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
    const tipTotal = lines
      .filter((l) => l.category === 'tip')
      .reduce((s, l) => s + l.amount, 0);
    const discountTotal = lines
      .filter((l) => l.category === 'discount')
      .reduce((s, l) => s + l.amount, 0);
    const charges = lines.reduce((s, c) => s + c.amount + c.taxAmount, 0);
    const paid = Number(session.amountPaid);
    return {
      sessionId: session.id,
      status: session.status,
      currency: session.currency || 'INR',
      guestCount: session.guestCount,
      locationLabel: session.serviceLocation.label,
      charges,
      itemsSubtotal,
      taxTotal,
      tipTotal,
      discountTotal,
      paid,
      outstanding: Math.max(0, charges - paid),
      lines,
    };
  }

  async publicPayIntent(token: string, input: GuestPublicPayIntentInput) {
    const bill = await this.publicSessionBill(token);
    const tipAmount = Math.max(0, Number(input.tipAmount) || 0);
    const amount = bill.outstanding + tipAmount;
    if (amount <= 0) throw new BadRequestException('Nothing outstanding on this session');
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return {
        mode: 'mock' as const,
        amount,
        tipAmount,
        currency: bill.currency,
        sessionId: bill.sessionId,
        name: bill.locationLabel || 'Guest bill',
        description: tipAmount
          ? `Table bill + tip · ${bill.locationLabel || 'session'}`
          : `Table bill · ${bill.locationLabel || 'session'}`,
        message: 'Razorpay keys not set — use mock confirm',
      };
    }
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: bill.currency.toUpperCase(),
        receipt: `gs_${bill.sessionId.slice(-12)}`,
        notes: { tableSessionId: bill.sessionId, tipAmount: String(tipAmount) },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Razorpay order failed: ${text.slice(0, 200)}`);
    }
    const order = (await res.json()) as { id: string; amount: number; currency: string };
    return {
      mode: 'razorpay' as const,
      keyId,
      razorpayOrderId: order.id,
      amount,
      tipAmount,
      currency: order.currency,
      sessionId: bill.sessionId,
      name: bill.locationLabel || 'Guest bill',
      description: tipAmount
        ? `Table bill + tip · ${bill.locationLabel || 'session'}`
        : `Table bill · ${bill.locationLabel || 'session'}`,
    };
  }

  async publicRateOffering(
    token: string,
    input: GuestOfferingRatingInput,
    fingerprint?: string,
  ) {
    const loc = await this.resolvePublicLocation(token);
    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id: input.serviceOrderId,
        serviceLocationId: loc.id,
        organizationId: loc.organizationId,
        status: { notIn: ['cancelled', 'rejected'] },
      },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found for this QR');
    const onOrder = order.items.some((i) => i.offeringId === input.offeringId);
    if (!onOrder) throw new BadRequestException('That dish was not on this order');
    try {
      return await this.prisma.serviceOfferingRating.create({
        data: {
          organizationId: loc.organizationId,
          assetId: loc.assetId,
          offeringId: input.offeringId,
          serviceOrderId: order.id,
          stars: input.stars,
          comment: input.comment || null,
          fingerprint: fingerprint?.slice(0, 64) || null,
        },
      });
    } catch {
      throw new BadRequestException('You already rated this dish for that order');
    }
  }

  async publicSubmitFeedback(token: string, input: GuestQrFeedbackInput) {
    const loc = await this.resolvePublicLocation(token);
    const session = await this.prisma.tableSession.findFirst({
      where: { serviceLocationId: loc.id },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });
    let stayReservationId: string | null = null;
    if (
      loc.locationType === 'HOTEL_ROOM' ||
      loc.locationType === 'HOMESTAY_ROOM' ||
      loc.locationType === 'FARMSTAY_UNIT'
    ) {
      const stay = await this.findActiveStayForLocation(loc);
      stayReservationId = stay?.id ?? null;
    }
    const row = await this.prisma.guestQrFeedback.create({
      data: {
        organizationId: loc.organizationId,
        assetId: loc.assetId,
        serviceLocationId: loc.id,
        tableSessionId: session?.id ?? null,
        stayReservationId,
        nps: input.nps,
        stars: input.stars ?? null,
        tagsJson: (input.tags || []) as Prisma.InputJsonValue,
        comment: input.comment || null,
      },
    });
    await this.notifyOps(
      loc.organizationId,
      'Guest feedback',
      `${loc.label}: NPS ${input.nps}${input.stars ? ` · ★${input.stars}` : ''}`,
      '/guest-services?gs=board',
    );
    return { id: row.id, ok: true };
  }

  async publicListExperiences(token: string) {
    const loc = await this.resolvePublicLocation(token);
    const now = new Date();
    const products = await this.prisma.experienceProduct.findMany({
      where: { assetId: loc.assetId, isActive: true, deletedAt: null },
      include: {
        slots: {
          where: {
            startAt: { gte: now },
            status: 'available',
          },
          orderBy: { startAt: 'asc' },
          take: 12,
        },
      },
      orderBy: { title: 'asc' },
    });
    return products
      .map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        price: p.price != null ? Number(p.price) : null,
        currency: p.currency,
        durationMinutes: p.durationMinutes,
        slots: p.slots
          .map((s) => ({
            id: s.id,
            startAt: s.startAt,
            endAt: s.endAt,
            capacity: s.capacity,
            reserved: s.reserved,
            held: s.held,
            seatsLeft: Math.max(0, s.capacity - s.reserved - s.held),
          }))
          .filter((s) => s.seatsLeft > 0),
      }))
      .filter((p) => p.slots.length > 0);
  }

  async publicBookExperience(token: string, input: GuestBookExperienceInput) {
    const loc = await this.resolvePublicLocation(token);
    const slot = await this.prisma.experienceSlot.findFirst({
      where: { id: input.experienceSlotId },
      include: { experienceProduct: true },
    });
    if (!slot || slot.experienceProduct.assetId !== loc.assetId) {
      throw new NotFoundException('Experience slot not found');
    }
    if (slot.experienceProduct.deletedAt || !slot.experienceProduct.isActive) {
      throw new BadRequestException('Experience unavailable');
    }
    const seatsLeft = Math.max(0, slot.capacity - slot.reserved - slot.held);
    if (seatsLeft < input.guestCount) {
      throw new BadRequestException(`Only ${seatsLeft} seat(s) left`);
    }
    const rate =
      slot.experienceProduct.price != null
        ? Number(slot.experienceProduct.price) * input.guestCount
        : null;
    const reservation = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.experienceSlot.findUnique({ where: { id: slot.id } });
      if (!locked) throw new NotFoundException('Slot gone');
      const left = Math.max(0, locked.capacity - locked.reserved - locked.held);
      if (left < input.guestCount) {
        throw new BadRequestException(`Only ${left} seat(s) left`);
      }
      await tx.experienceSlot.update({
        where: { id: slot.id },
        data: { reserved: { increment: input.guestCount } },
      });
      return tx.experienceReservation.create({
        data: {
          assetId: loc.assetId,
          experienceProductId: slot.experienceProductId,
          experienceSlotId: slot.id,
          bookerName: input.bookerName.trim(),
          bookerPhone: input.bookerPhone || null,
          guestCount: input.guestCount,
          status: 'confirmed',
          rateAmount: rate != null ? new Prisma.Decimal(rate) : null,
          currency: slot.experienceProduct.currency || 'INR',
          waiverAckAt: input.waiverAck ? new Date() : null,
          notes: `Booked via QR ${loc.label}`,
        },
      });
    });
    await this.notifyOps(
      loc.organizationId,
      'Experience booked (QR)',
      `${input.bookerName} · ${slot.experienceProduct.title} · ${input.guestCount} pax`,
      '/guest-services?gs=board',
    );
    return reservation;
  }

  async listRecentFeedback(user: AuthUser, assetId: string) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    return this.prisma.guestQrFeedback.findMany({
      where: { assetId, organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        serviceLocation: { select: { id: true, label: true } },
      },
    });
  }

  async listCompanionPings(user: AuthUser, assetId: string) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    const [waiterRequests, billSessions, feedbackCount] = await Promise.all([
      this.prisma.guestServiceRequest.findMany({
        where: {
          assetId,
          organizationId: user.organizationId,
          status: 'requested',
          category: 'front_desk',
        },
        include: { serviceLocation: { select: { label: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.tableSession.findMany({
        where: {
          assetId,
          organizationId: user.organizationId,
          status: 'bill_requested',
        },
        include: { serviceLocation: { select: { label: true } } },
        take: 10,
      }),
      this.prisma.guestQrFeedback.count({
        where: {
          assetId,
          organizationId: user.organizationId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    return { waiterRequests, billSessions, feedbackCount };
  }

  /** Called from Stay check-in — export for stay module reuse via duplication of PIN helper. */
  static generateRoomServicePin() {
    return newRoomPin();
  }
}
