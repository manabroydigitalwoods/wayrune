import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateItineraryBlockInput } from '@travel/contracts';
import { PrismaService } from '../../prisma/prisma.service';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asProfile(raw: unknown): Record<string, unknown> {
  return asRecord(raw);
}

/** Normalize legacy itinerary item type `activity` → `sightseeing`. */
function normalizeItemType(type: unknown): string {
  if (type === 'activity') return 'sightseeing';
  return typeof type === 'string' ? type : 'sightseeing';
}

function snapshotFromPlace(place: {
  id: string;
  name: string;
  profileJson?: unknown;
}) {
  const profile = asProfile(place.profileJson);
  const imageUrls = Array.isArray(profile.imageUrls)
    ? profile.imageUrls.filter((u): u is string => typeof u === 'string' && Boolean(u.trim()))
    : [];
  return {
    catalogPlaceId: place.id,
    catalogProvenance: 'destination_guide' as const,
    title: place.name,
    description:
      typeof profile.description === 'string' && profile.description.trim()
        ? profile.description.trim()
        : undefined,
    imageUrl: imageUrls[0],
    imageUrls: imageUrls.length ? imageUrls : undefined,
    bestVisitTime:
      typeof profile.bestTime === 'string' && profile.bestTime.trim()
        ? profile.bestTime.trim()
        : undefined,
    googleMapsUrl:
      typeof profile.googleMapsUrl === 'string' && profile.googleMapsUrl.trim()
        ? profile.googleMapsUrl.trim()
        : undefined,
    googleRating:
      typeof profile.googleRating === 'number' ? profile.googleRating : undefined,
    googleReviewCount:
      typeof profile.googleReviewCount === 'number' ? profile.googleReviewCount : undefined,
    reviewSnippet:
      typeof profile.reviewSnippet === 'string' && profile.reviewSnippet.trim()
        ? profile.reviewSnippet.trim()
        : undefined,
    openingHours:
      typeof profile.openingHours === 'string' && profile.openingHours.trim()
        ? profile.openingHours.trim()
        : undefined,
    durationMin:
      typeof profile.durationMin === 'number' ? profile.durationMin : undefined,
    entryFee:
      typeof profile.entryFee === 'string' && profile.entryFee.trim()
        ? profile.entryFee.trim()
        : undefined,
    suitabilityTags: Array.isArray(profile.suitabilityTags)
      ? profile.suitabilityTags.filter(
          (t): t is string => typeof t === 'string' && Boolean(t.trim()),
        )
      : undefined,
  };
}

@Injectable()
export class ItineraryBlocksService {
  constructor(private prisma: PrismaService) {}

  async list(organizationId: string) {
    const items = await this.prisma.itineraryBlock.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return { items };
  }

  async get(organizationId: string, id: string) {
    const block = await this.prisma.itineraryBlock.findFirst({
      where: { id, organizationId },
    });
    if (!block) throw new NotFoundException('Template not found');
    return block;
  }

  async create(organizationId: string, input: CreateItineraryBlockInput) {
    return this.prisma.itineraryBlock.create({
      data: {
        organizationId,
        name: input.name.trim(),
        itemType: input.itemType,
        contentJson: input.contentJson as Prisma.InputJsonValue,
      },
    });
  }

  /** Expand template day skeletons into a draft itinerary with fresh place snapshots. */
  async expand(organizationId: string, id: string) {
    const block = await this.get(organizationId, id);
    const content = asRecord(block.contentJson);
    const rawDays = Array.isArray(content.days) ? content.days : [];

    const placeKeys = new Set<string>();
    const placeIds = new Set<string>();
    for (const day of rawDays) {
      const d = asRecord(day);
      if (typeof d.destinationKey === 'string') placeKeys.add(d.destinationKey);
      if (typeof d.destinationPlaceId === 'string') placeIds.add(d.destinationPlaceId);
      const dest = asRecord(d.destination);
      if (typeof dest.placeId === 'string') placeIds.add(dest.placeId);
      for (const item of Array.isArray(d.items) ? d.items : []) {
        const it = asRecord(item);
        if (typeof it.catalogPlaceKey === 'string') placeKeys.add(it.catalogPlaceKey);
        if (typeof it.catalogPlaceId === 'string') placeIds.add(it.catalogPlaceId);
        const details = asRecord(it.details);
        if (typeof details.catalogPlaceId === 'string') placeIds.add(details.catalogPlaceId);
      }
    }

    const places = await this.prisma.place.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [
          { id: { in: [...placeIds] } },
          { key: { in: [...placeKeys] }, isSystem: true },
          { key: { in: [...placeKeys] }, organizationId },
        ],
      },
    });
    const byId = new Map(places.map((p) => [p.id, p]));
    const byKey = new Map(places.map((p) => [p.key, p]));

    const resolvePlace = (keyOrId?: string | null) => {
      if (!keyOrId) return null;
      return byId.get(keyOrId) || byKey.get(keyOrId) || null;
    };

    const days = rawDays.map((day, dayIndex) => {
      const d = asRecord(day);
      const destPlace =
        resolvePlace(
          typeof d.destinationPlaceId === 'string'
            ? d.destinationPlaceId
            : typeof d.destinationKey === 'string'
              ? d.destinationKey
              : typeof asRecord(d.destination).placeId === 'string'
                ? (asRecord(d.destination).placeId as string)
                : null,
        ) || null;
      const items = (Array.isArray(d.items) ? d.items : []).map((item, itemIndex) => {
        const it = asRecord(item);
        const catalog =
          resolvePlace(
            typeof it.catalogPlaceId === 'string'
              ? it.catalogPlaceId
              : typeof it.catalogPlaceKey === 'string'
                ? it.catalogPlaceKey
                : typeof asRecord(it.details).catalogPlaceId === 'string'
                  ? (asRecord(it.details).catalogPlaceId as string)
                  : null,
          ) || null;
        const snap = catalog ? snapshotFromPlace(catalog) : null;
        const details = {
          ...asRecord(it.details),
          ...(snap
            ? {
                catalogPlaceId: snap.catalogPlaceId,
                catalogProvenance: snap.catalogProvenance,
                imageUrl: snap.imageUrl,
                imageUrls: snap.imageUrls,
                bestVisitTime: snap.bestVisitTime,
                googleMapsUrl: snap.googleMapsUrl,
                googleRating: snap.googleRating,
                googleReviewCount: snap.googleReviewCount,
                reviewSnippet: snap.reviewSnippet,
                openingHours: snap.openingHours,
                durationMin: snap.durationMin,
                entryFee: snap.entryFee,
                suitabilityTags: snap.suitabilityTags,
              }
            : {}),
        };
        return {
          id: `tpl-${dayIndex + 1}-${itemIndex + 1}-${Date.now().toString(36)}`,
          type: normalizeItemType(it.type),
          title:
            (typeof it.title === 'string' && it.title.trim()) ||
            snap?.title ||
            'Sightseeing',
          description:
            (typeof it.description === 'string' && it.description.trim()) ||
            snap?.description ||
            null,
          startTime: typeof it.startTime === 'string' ? it.startTime : null,
          endTime: typeof it.endTime === 'string' ? it.endTime : null,
          location: catalog
            ? { placeId: catalog.id, name: catalog.name, kind: catalog.kind }
            : destPlace
              ? { placeId: destPlace.id, name: destPlace.name, kind: destPlace.kind }
              : null,
          notes: typeof it.notes === 'string' ? it.notes : null,
          customerVisible: it.customerVisible !== false,
          details,
        };
      });

      return {
        id: `tpl-day-${dayIndex + 1}-${Date.now().toString(36)}`,
        dayNumber:
          typeof d.dayNumber === 'number' && Number.isFinite(d.dayNumber)
            ? d.dayNumber
            : dayIndex + 1,
        title:
          (typeof d.title === 'string' && d.title.trim()) ||
          (destPlace ? destPlace.name : `Day ${dayIndex + 1}`),
        date: typeof d.date === 'string' ? d.date : null,
        destination: destPlace
          ? { placeId: destPlace.id, name: destPlace.name, kind: destPlace.kind }
          : null,
        items,
      };
    });

    return { days, block: { id: block.id, name: block.name, itemType: block.itemType } };
  }
}
