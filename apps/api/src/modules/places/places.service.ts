import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreatePlaceCategoryInput,
  CreatePlaceContributionInput,
  CreatePlaceInput,
  CreatePlaceSubcategoryInput,
  ReviewPlaceContributionInput,
  UpdatePlaceInput,
} from '@wayrune/contracts';
import {
  clampPlaceSearchLimit,
  looksLikeTransportCode,
  parsePlaceKinds,
  parsePlaceSearchPurpose,
  placeSuggestionPoolStems,
  rankPlacesForPurpose,
  resolvePurposeKinds,
  salesPlaceSecondaryLabel,
  suggestPlaceCorrections,
  PLACE_SUGGEST_CANDIDATE_POOL_LIMIT,
  PLACE_SUGGEST_MAX_RESULTS,
  type PlaceSearchPurpose,
} from '@wayrune/contracts';
import { loadEnv } from '@wayrune/config';
import { PrismaService } from '../../prisma/prisma.service';

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function asProfile(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

type ListFilters = {
  q?: string;
  domesticOrIntl?: string;
  kind?: string;
  kinds?: string;
  purpose?: string;
  limit?: string | number;
  parentId?: string | null;
  categoryId?: string;
  subcategoryId?: string;
  includeDescendants?: boolean;
  includeInactive?: boolean;
};

@Injectable()
export class PlacesService {
  constructor(private prisma: PrismaService) {}

  private orgScope(
    organizationId: string,
    opts?: { includeInactive?: boolean },
  ): Prisma.PlaceWhereInput {
    return {
      deletedAt: null,
      ...(opts?.includeInactive ? {} : { isActive: true }),
      OR: [{ isSystem: true, organizationId: null }, { organizationId }],
    };
  }

  private formatPlace(
    place: {
      id: string;
      name: string;
      key: string;
      kind: string;
      parentId: string | null;
      country: string;
      region: string | null;
      domesticOrIntl: string;
      isSystem: boolean;
      isActive?: boolean;
      profileJson?: unknown;
      parent?: { id: string; name: string; kind: string } | null;
      subcategoryLinks?: Array<{
        subcategory: {
          id: string;
          name: string;
          key: string;
          category: { id: string; name: string; key: string };
        };
      }>;
    },
    ancestors: Array<{ id: string; name: string; kind: string }> = [],
  ) {
    const breadcrumb = [...ancestors.map((a) => a.name), place.name];
    return {
      id: place.id,
      name: place.name,
      key: place.key,
      kind: place.kind,
      parentId: place.parentId,
      country: place.country,
      region: place.region,
      domesticOrIntl: place.domesticOrIntl,
      isSystem: place.isSystem,
      isActive: place.isActive !== false,
      profile: asProfile(place.profileJson),
      parent: place.parent
        ? { id: place.parent.id, name: place.parent.name, kind: place.parent.kind }
        : null,
      breadcrumb,
      breadcrumbLabel: breadcrumb.join(' › '),
      subcategories: (place.subcategoryLinks || []).map((l) => ({
        id: l.subcategory.id,
        name: l.subcategory.name,
        key: l.subcategory.key,
        category: l.subcategory.category,
      })),
    };
  }

  private async ancestorsOf(placeId: string | null | undefined) {
    const chain: Array<{ id: string; name: string; kind: string }> = [];
    let currentId = placeId ?? null;
    const guard = new Set<string>();
    while (currentId && !guard.has(currentId)) {
      guard.add(currentId);
      const p = await this.prisma.place.findFirst({
        where: { id: currentId, deletedAt: null },
        select: { id: true, name: true, kind: true, parentId: true },
      });
      if (!p) break;
      chain.unshift({ id: p.id, name: p.name, kind: p.kind });
      currentId = p.parentId;
    }
    return chain;
  }

  private async collectDescendantIds(rootIds: string[]): Promise<string[]> {
    const all = new Set<string>(rootIds);
    let frontier = [...rootIds];
    while (frontier.length) {
      const children = await this.prisma.place.findMany({
        where: { parentId: { in: frontier }, deletedAt: null, isActive: true },
        select: { id: true },
      });
      frontier = [];
      for (const child of children) {
        if (!all.has(child.id)) {
          all.add(child.id);
          frontier.push(child.id);
        }
      }
    }
    return [...all];
  }

  async list(organizationId: string, filters: ListFilters = {}) {
    const {
      q,
      domesticOrIntl,
      kind,
      kinds: kindsRaw,
      purpose: purposeRaw,
      limit: limitRaw,
      parentId,
      categoryId,
      subcategoryId,
      includeDescendants,
      includeInactive,
    } = filters;

    const purpose = parsePlaceSearchPurpose(purposeRaw);
    const kindsOverride = parsePlaceKinds(kindsRaw);
    const resolvedKinds = resolvePurposeKinds(purpose, kindsOverride, kind);
    const purposeMode = Boolean(purpose || kindsOverride.length || limitRaw != null);
    const limit = purposeMode ? clampPlaceSearchLimit(limitRaw) : 500;

    const hasStructuralFilter =
      Boolean(parentId) ||
      parentId === 'null' ||
      parentId === '' ||
      Boolean(categoryId) ||
      Boolean(subcategoryId);
    // Purpose pickers: no uncontrolled catalog dump before the user types.
    if (purpose && !(q && q.trim()) && !hasStructuralFilter) {
      return { items: [], purpose, limit };
    }

    let parentFilter: Prisma.PlaceWhereInput = {};
    if (parentId === 'null' || parentId === '') {
      parentFilter = { parentId: null };
    } else if (parentId) {
      if (includeDescendants) {
        const ids = await this.collectDescendantIds([parentId]);
        parentFilter = { id: { in: ids.filter((id) => id !== parentId) } };
      } else {
        parentFilter = { parentId };
      }
    }

    const codeQ = q?.trim() || '';
    const codeSearch = looksLikeTransportCode(codeQ);
    const codeUpper = codeQ.toUpperCase();

    const textOr: Prisma.PlaceWhereInput[] = q
      ? [
          { name: { contains: q } },
          { country: { contains: q } },
          { region: { contains: q } },
          { key: { contains: q } },
        ]
      : [];

    // Do not use Prisma JSON path filters here — MySQL rejects paths without `$`
    // and short text queries were incorrectly treated as codes. Match codes in memory.

    const scoped: Prisma.PlaceWhereInput = {
      ...this.orgScope(organizationId, { includeInactive }),
      ...parentFilter,
      ...(resolvedKinds?.length === 1
        ? { kind: resolvedKinds[0] }
        : resolvedKinds && resolvedKinds.length > 1
          ? { kind: { in: resolvedKinds } }
          : kind
            ? { kind }
            : {}),
      ...(domesticOrIntl ? { domesticOrIntl } : {}),
      ...(subcategoryId
        ? { subcategoryLinks: { some: { subcategoryId } } }
        : categoryId
          ? { subcategoryLinks: { some: { subcategory: { categoryId } } } }
          : {}),
      ...(textOr.length ? { OR: textOr } : {}),
    };

    const fetchTake = purposeMode ? Math.min(200, Math.max(limit * 5, limit)) : 500;

    const items = await this.prisma.place.findMany({
      where: scoped,
      include: {
        parent: { select: { id: true, name: true, kind: true } },
        subcategoryLinks: {
          include: {
            subcategory: {
              include: { category: { select: { id: true, name: true, key: true } } },
            },
          },
        },
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      take: fetchTake,
    });

    // When query looks like a transport code, also pull airports/stations and match profile codes in memory.
    let codeHits: typeof items = [];
    if (codeSearch) {
      const transportKinds =
        resolvedKinds?.filter((k) => k === 'airport' || k === 'railway_station') ??
        ['airport', 'railway_station'];
      if (transportKinds.length) {
        const transportRows = await this.prisma.place.findMany({
          where: {
            ...this.orgScope(organizationId, { includeInactive }),
            ...parentFilter,
            kind: { in: transportKinds },
            ...(domesticOrIntl ? { domesticOrIntl } : {}),
          },
          include: {
            parent: { select: { id: true, name: true, kind: true } },
            subcategoryLinks: {
              include: {
                subcategory: {
                  include: { category: { select: { id: true, name: true, key: true } } },
                },
              },
            },
          },
          take: 200,
        });
        codeHits = transportRows.filter((p) => {
          const profile = asProfile(p.profileJson);
          const iata = String(profile?.iataCode || '').toUpperCase();
          const station = String(profile?.stationCode || '').toUpperCase();
          return iata === codeUpper || station === codeUpper;
        });
      }
    }

    const mergedRows = [...items];
    const seenIds = new Set(items.map((i) => i.id));
    for (const hit of codeHits) {
      if (!seenIds.has(hit.id)) {
        seenIds.add(hit.id);
        mergedRows.push(hit);
      }
    }

    const byKey = new Map<string, (typeof mergedRows)[0]>();
    for (const item of mergedRows) {
      const existing = byKey.get(item.key);
      if (!existing || (!item.isSystem && existing.isSystem)) {
        byKey.set(item.key, item);
      }
    }

    const deduped = [...byKey.values()];
    const ranked = purposeMode
      ? rankPlacesForPurpose(
          deduped.map((p) => ({
            ...p,
            profile: asProfile(p.profileJson) as {
              iataCode?: string | null;
              stationCode?: string | null;
            } | null,
          })),
          { q: q || '', purpose: (purpose || 'all') as PlaceSearchPurpose },
        )
      : deduped
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => ({ ...p, matchType: 'normal' as const }));

    const sliced = purposeMode ? ranked.slice(0, limit) : ranked;

    const formatRows = async (rows: typeof sliced) => {
      const formatted = [];
      for (const place of rows) {
        const ancestors = await this.ancestorsOf(place.parentId);
        const base = this.formatPlace(place, ancestors);
        const salesDescription = salesPlaceSecondaryLabel({
          name: base.name,
          kind: base.kind,
          country: base.country,
          region: base.region,
          parent: base.parent,
          profile: base.profile as {
            iataCode?: string | null;
            stationCode?: string | null;
          } | null,
          breadcrumb: base.breadcrumb,
        });
        formatted.push({
          ...base,
          salesDescription,
          matchType: 'matchType' in place ? place.matchType : undefined,
        });
      }
      return formatted;
    };

    const formatted = await formatRows(sliced);

    // Zero-result typo assistance over existing Places (bounded pool — not full catalog scan).
    let suggestions: Awaited<ReturnType<typeof formatRows>> | undefined;
    if (purposeMode && formatted.length === 0 && q?.trim()) {
      const stems = placeSuggestionPoolStems(q);
      if (stems) {
        const poolBase: Prisma.PlaceWhereInput = {
          ...this.orgScope(organizationId, { includeInactive }),
          ...parentFilter,
          ...(resolvedKinds?.length === 1
            ? { kind: resolvedKinds[0] }
            : resolvedKinds && resolvedKinds.length > 1
              ? { kind: { in: resolvedKinds } }
              : kind
                ? { kind }
                : {}),
          ...(domesticOrIntl ? { domesticOrIntl } : {}),
        };
        const poolRows = await this.prisma.place.findMany({
          where: {
            ...poolBase,
            OR: [
              { name: { startsWith: stems.prefix } },
              { name: { contains: stems.stem } },
              { key: { contains: stems.stem } },
            ],
          },
          include: {
            parent: { select: { id: true, name: true, kind: true } },
            subcategoryLinks: {
              include: {
                subcategory: {
                  include: { category: { select: { id: true, name: true, key: true } } },
                },
              },
            },
          },
          orderBy: [{ kind: 'asc' }, { name: 'asc' }],
          take: PLACE_SUGGEST_CANDIDATE_POOL_LIMIT,
        });
        const corrected = suggestPlaceCorrections(
          poolRows.map((p) => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
            key: p.key,
          })),
          q,
          { max: PLACE_SUGGEST_MAX_RESULTS },
        );
        if (corrected.length) {
          const byId = new Map(poolRows.map((p) => [p.id, p]));
          const suggestionRows = corrected
            .map((c) => byId.get(c.id))
            .filter((p): p is (typeof poolRows)[number] => Boolean(p))
            .map((p) => ({ ...p, matchType: 'normal' as const }));
          suggestions = await formatRows(suggestionRows);
        }
      }
    }

    return {
      items: formatted,
      ...(suggestions?.length ? { suggestions } : {}),
      ...(purposeMode ? { purpose: purpose || null, limit } : {}),
    };
  }

  async getById(organizationId: string, id: string) {
    const place = await this.prisma.place.findFirst({
      where: { id, ...this.orgScope(organizationId) },
      include: {
        parent: { select: { id: true, name: true, kind: true } },
        children: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true, kind: true, key: true },
          orderBy: { name: 'asc' },
          take: 100,
        },
        subcategoryLinks: {
          include: {
            subcategory: {
              include: { category: { select: { id: true, name: true, key: true } } },
            },
          },
        },
        knowledge: {
          orderBy: [{ season: 'asc' }, { kind: 'asc' }],
          take: 40,
        },
        edgesFrom: {
          include: { toPlace: { select: { id: true, name: true, key: true } } },
          take: 20,
        },
      },
    });
    if (!place) throw new NotFoundException('Place not found');
    const ancestors = await this.ancestorsOf(place.parentId);
    return {
      ...this.formatPlace(place, ancestors),
      children: place.children,
      knowledge: place.knowledge.map((k) => ({
        id: k.id,
        season: k.season,
        kind: k.kind,
        title: k.title,
        body: k.body,
        meta: k.metaJson,
      })),
      edges: place.edgesFrom.map((e) => ({
        id: e.id,
        toPlaceId: e.toPlaceId,
        toPlace: e.toPlace,
        mode: e.mode,
        distanceKm: e.distanceKm,
        durationMin: e.durationMin,
        roadHint: e.roadHint,
      })),
    };
  }

  async listKnowledge(organizationId: string, placeId: string) {
    await this.getById(organizationId, placeId);
    const items = await this.prisma.placeKnowledge.findMany({
      where: { placeId },
      orderBy: [{ season: 'asc' }, { kind: 'asc' }],
    });
    return {
      items: items.map((k) => ({
        id: k.id,
        placeId: k.placeId,
        season: k.season,
        kind: k.kind,
        title: k.title,
        body: k.body,
        meta: k.metaJson,
      })),
    };
  }

  async listEdges(organizationId: string, fromPlaceId?: string, toPlaceId?: string) {
    const scopePlace = async (id: string) => {
      const p = await this.prisma.place.findFirst({
        where: { id, ...this.orgScope(organizationId) },
        select: { id: true },
      });
      if (!p) throw new NotFoundException('Place not found');
    };
    if (fromPlaceId) await scopePlace(fromPlaceId);
    if (toPlaceId) await scopePlace(toPlaceId);

    const items = await this.prisma.placeEdge.findMany({
      where: {
        ...(fromPlaceId ? { fromPlaceId } : {}),
        ...(toPlaceId ? { toPlaceId } : {}),
        OR: [{ isSystem: true }, { organizationId }],
      },
      include: {
        fromPlace: { select: { id: true, name: true, key: true } },
        toPlace: { select: { id: true, name: true, key: true } },
      },
      take: 200,
    });
    return { items };
  }

  /**
   * Resolve driving distance/duration between two places.
   * Prefer cached PlaceEdge; otherwise Geocode + Distance Matrix and upsert the edge.
   */
  async resolveRoute(
    organizationId: string,
    fromPlaceId?: string,
    toPlaceId?: string,
  ): Promise<{
    distanceKm: number | null;
    durationMin: number | null;
    source: 'edge' | 'google' | 'unavailable';
    roadHint?: string | null;
  }> {
    if (!fromPlaceId?.trim() || !toPlaceId?.trim()) {
      throw new BadRequestException('fromPlaceId and toPlaceId are required');
    }
    if (fromPlaceId === toPlaceId) {
      return { distanceKm: 0, durationMin: 0, source: 'edge' };
    }

    const fromPlace = await this.prisma.place.findFirst({
      where: { id: fromPlaceId, ...this.orgScope(organizationId) },
      select: {
        id: true,
        name: true,
        country: true,
        region: true,
        profileJson: true,
      },
    });
    const toPlace = await this.prisma.place.findFirst({
      where: { id: toPlaceId, ...this.orgScope(organizationId) },
      select: {
        id: true,
        name: true,
        country: true,
        region: true,
        profileJson: true,
      },
    });
    if (!fromPlace || !toPlace) throw new NotFoundException('Place not found');

    const existing = await this.prisma.placeEdge.findFirst({
      where: {
        fromPlaceId,
        toPlaceId,
        mode: 'drive',
        OR: [{ isSystem: true }, { organizationId }],
      },
    });
    if (existing && (existing.durationMin != null || existing.distanceKm != null)) {
      return {
        distanceKm: existing.distanceKm,
        durationMin: existing.durationMin,
        source: 'edge',
        roadHint: existing.roadHint,
      };
    }

    const apiKey = loadEnv().googleMapsApiKey;
    if (!apiKey) {
      return {
        distanceKm: existing?.distanceKm ?? null,
        durationMin: existing?.durationMin ?? null,
        source: 'unavailable',
        roadHint: existing?.roadHint ?? null,
      };
    }

    try {
      const fromCoords = await this.ensurePlaceCoords(fromPlace, apiKey);
      const toCoords = await this.ensurePlaceCoords(toPlace, apiKey);
      const matrix = await this.fetchDrivingMatrix(fromCoords, toCoords, apiKey);

      const upserted = await this.prisma.placeEdge.upsert({
        where: {
          fromPlaceId_toPlaceId_mode: {
            fromPlaceId,
            toPlaceId,
            mode: 'drive',
          },
        },
        create: {
          fromPlaceId,
          toPlaceId,
          mode: 'drive',
          distanceKm: matrix.distanceKm,
          durationMin: matrix.durationMin,
          roadHint: matrix.roadHint,
          isSystem: false,
          organizationId,
        },
        update: {
          distanceKm: matrix.distanceKm,
          durationMin: matrix.durationMin,
          roadHint: matrix.roadHint ?? undefined,
        },
      });

      return {
        distanceKm: upserted.distanceKm,
        durationMin: upserted.durationMin,
        source: 'google',
        roadHint: upserted.roadHint,
      };
    } catch {
      // Routes/Places may be disabled or quota-limited — keep the form usable.
      return {
        distanceKm: existing?.distanceKm ?? null,
        durationMin: existing?.durationMin ?? null,
        source: 'unavailable',
        roadHint: existing?.roadHint ?? null,
      };
    }
  }

  private async ensurePlaceCoords(
    place: {
      id: string;
      name: string;
      country: string;
      region: string | null;
      profileJson: unknown;
    },
    apiKey: string,
  ): Promise<{ lat: number; lng: number }> {
    const profile = asProfile(place.profileJson) || {};
    const lat = typeof profile.latitude === 'number' ? profile.latitude : Number(profile.latitude);
    const lng =
      typeof profile.longitude === 'number' ? profile.longitude : Number(profile.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }

    const queryParts = [place.name, place.region, place.country].filter(
      (p): p is string => Boolean(p?.trim()),
    );
    const textQuery = queryParts.join(', ');

    // Places API (New) — replaces legacy Geocoding for projects where legacy APIs are off.
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.location',
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 1,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        this.googleMapsErrorMessage(errBody, 'Places geocode request failed'),
      );
    }
    const data = (await res.json()) as {
      places?: Array<{ location?: { latitude?: number; longitude?: number } }>;
      error?: { message?: string };
    };
    const location = data.places?.[0]?.location;
    const nextLat = Number(location?.latitude);
    const nextLng = Number(location?.longitude);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
      throw new BadRequestException(
        data.error?.message || `Could not geocode "${place.name}"`,
      );
    }

    await this.prisma.place.update({
      where: { id: place.id },
      data: {
        profileJson: {
          ...profile,
          latitude: nextLat,
          longitude: nextLng,
        } as Prisma.InputJsonValue,
      },
    });

    return { lat: nextLat, lng: nextLng };
  }

  /** Routes API (New) — replaces legacy Distance Matrix. */
  private async fetchDrivingMatrix(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    apiKey: string,
  ): Promise<{ distanceKm: number; durationMin: number; roadHint: string | null }> {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: {
          location: { latLng: { latitude: from.lat, longitude: from.lng } },
        },
        destination: {
          location: { latLng: { latitude: to.lat, longitude: to.lng } },
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        this.googleMapsErrorMessage(errBody, 'Routes API request failed'),
      );
    }
    const data = (await res.json()) as {
      routes?: Array<{ distanceMeters?: number; duration?: string }>;
      error?: { message?: string };
    };
    const route = data.routes?.[0];
    if (!route) {
      throw new BadRequestException(data.error?.message || 'No driving route found');
    }
    const meters = Number(route.distanceMeters);
    const seconds = this.parseDurationSeconds(route.duration);
    const distanceKm = Number.isFinite(meters) ? Math.round((meters / 1000) * 10) / 10 : 0;
    const durationMin = Number.isFinite(seconds) ? Math.max(1, Math.round(seconds / 60)) : 0;
    return {
      distanceKm,
      durationMin,
      roadHint: durationMin ? `~${distanceKm} km · ${durationMin} min` : null,
    };
  }

  private parseDurationSeconds(duration?: string): number {
    if (!duration?.trim()) return NaN;
    // Protobuf duration style: "1234s" or "1234.5s"
    const match = duration.trim().match(/^(\d+(?:\.\d+)?)s$/i);
    if (!match) return NaN;
    return Number(match[1]);
  }

  private googleMapsErrorMessage(body: string, fallback: string): string {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string; status?: string };
        message?: string;
      };
      const msg = parsed.error?.message || parsed.message;
      if (msg?.trim()) return msg.trim();
    } catch {
      /* ignore */
    }
    if (body.trim()) return body.trim().slice(0, 400);
    return fallback;
  }

  async listCategories(organizationId: string) {
    const categories = await this.prisma.placeCategory.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ isSystem: true, organizationId: null }, { organizationId }],
      },
      include: {
        subcategories: {
          where: { deletedAt: null, isActive: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return { items: categories };
  }

  async createCategory(organizationId: string, input: CreatePlaceCategoryInput) {
    const key = slugify(input.name);
    if (!key) throw new ConflictException('Invalid category name');
    const duplicate = await this.prisma.placeCategory.findFirst({
      where: {
        deletedAt: null,
        key,
        OR: [{ organizationId }, { isSystem: true, organizationId: null }],
      },
    });
    if (duplicate) throw new ConflictException('Category already exists');
    return this.prisma.placeCategory.create({
      data: {
        organizationId,
        name: input.name.trim(),
        key,
        isSystem: false,
        isActive: true,
      },
    });
  }

  async createSubcategory(organizationId: string, input: CreatePlaceSubcategoryInput) {
    const category = await this.prisma.placeCategory.findFirst({
      where: {
        id: input.categoryId,
        deletedAt: null,
        OR: [{ organizationId }, { isSystem: true, organizationId: null }],
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    const key = slugify(input.name);
    if (!key) throw new ConflictException('Invalid subcategory name');
    return this.prisma.placeSubcategory.create({
      data: {
        categoryId: category.id,
        organizationId,
        name: input.name.trim(),
        key,
        isSystem: false,
        isActive: true,
      },
    });
  }

  async create(organizationId: string, userId: string, input: CreatePlaceInput) {
    const key = slugify(input.name);
    if (!key) throw new ConflictException('Invalid place name');

    const duplicate = await this.prisma.place.findFirst({
      where: {
        deletedAt: null,
        key,
        OR: [{ organizationId }, { isSystem: true, organizationId: null }],
      },
    });
    if (duplicate) {
      throw new ConflictException(
        duplicate.isSystem
          ? 'This place already exists in the system catalog'
          : 'Your agency already has this place',
      );
    }

    let country = input.country?.trim() || 'India';
    let region = input.region?.trim() || null;
    let domesticOrIntl: 'domestic' | 'international' = input.domesticOrIntl;
    if (input.parentId) {
      const parent = await this.prisma.place.findFirst({
        where: { id: input.parentId, ...this.orgScope(organizationId) },
      });
      if (!parent) throw new NotFoundException('Parent place not found');
      country = parent.country || country;
      region = parent.region || region;
      if (parent.domesticOrIntl === 'domestic' || parent.domesticOrIntl === 'international') {
        domesticOrIntl = parent.domesticOrIntl;
      }
    }

    const place = await this.prisma.place.create({
      data: {
        organizationId,
        name: input.name.trim(),
        key,
        kind: input.kind,
        parentId: input.parentId || null,
        country,
        region,
        domesticOrIntl,
        isSystem: false,
        isActive: true,
        createdBy: userId,
        profileJson: input.profile ? (input.profile as Prisma.InputJsonValue) : undefined,
        subcategoryLinks: input.subcategoryIds?.length
          ? {
              create: input.subcategoryIds.map((subcategoryId) => ({ subcategoryId })),
            }
          : undefined,
      },
      include: {
        parent: { select: { id: true, name: true, kind: true } },
        subcategoryLinks: {
          include: {
            subcategory: {
              include: { category: { select: { id: true, name: true, key: true } } },
            },
          },
        },
      },
    });
    const ancestors = await this.ancestorsOf(place.parentId);
    return this.formatPlace(place, ancestors);
  }

  async update(organizationId: string, id: string, input: UpdatePlaceInput) {
    const existing = await this.prisma.place.findFirst({
      where: {
        id,
        deletedAt: null,
        organizationId,
        isSystem: false,
      },
    });
    if (!existing) throw new NotFoundException('Place not found or not editable');

    if (input.parentId) {
      const parent = await this.prisma.place.findFirst({
        where: { id: input.parentId, ...this.orgScope(organizationId) },
      });
      if (!parent) throw new NotFoundException('Parent place not found');
      if (parent.id === id) throw new ConflictException('Place cannot be its own parent');
    }

    if (input.subcategoryIds) {
      await this.prisma.placeSubcategoryLink.deleteMany({ where: { placeId: id } });
      if (input.subcategoryIds.length) {
        await this.prisma.placeSubcategoryLink.createMany({
          data: input.subcategoryIds.map((subcategoryId) => ({
            placeId: id,
            subcategoryId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const place = await this.prisma.place.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        kind: input.kind,
        parentId: input.parentId === undefined ? undefined : input.parentId,
        country: input.country === undefined ? undefined : input.country?.trim() || 'India',
        region: input.region === undefined ? undefined : input.region?.trim() || null,
        domesticOrIntl: input.domesticOrIntl,
        isActive: input.isActive,
        profileJson:
          input.profile === undefined
            ? undefined
            : (input.profile as Prisma.InputJsonValue),
      },
      include: {
        parent: { select: { id: true, name: true, kind: true } },
        subcategoryLinks: {
          include: {
            subcategory: {
              include: { category: { select: { id: true, name: true, key: true } } },
            },
          },
        },
      },
    });
    const ancestors = await this.ancestorsOf(place.parentId);
    return this.formatPlace(place, ancestors);
  }

  async listContributions(
    organizationId: string,
    status?: string,
    opts?: { allOrgs?: boolean },
  ) {
    const items = await this.prisma.placeContribution.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(opts?.allOrgs ? {} : { organizationId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const orgIds = [...new Set(items.map((i) => i.organizationId))];
    const orgs =
      orgIds.length === 0
        ? []
        : await this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true, slug: true },
          });
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    return {
      items: items.map((item) => ({
        ...item,
        organization: orgById.get(item.organizationId) ?? null,
      })),
    };
  }

  async createContribution(
    organizationId: string,
    userId: string,
    input: CreatePlaceContributionInput,
  ) {
    if (input.kind === 'edit' && !input.placeId) {
      throw new BadRequestException('placeId is required for edit suggestions');
    }
    if (input.placeId) {
      await this.getById(organizationId, input.placeId);
    }
    return this.prisma.placeContribution.create({
      data: {
        organizationId,
        submittedByUserId: userId,
        placeId: input.placeId || null,
        kind: input.kind,
        status: 'pending',
        payloadJson: input.payloadJson as Prisma.InputJsonValue,
      },
    });
  }

  async reviewContribution(
    organizationId: string,
    userId: string,
    id: string,
    input: ReviewPlaceContributionInput,
  ) {
    const row = await this.prisma.placeContribution.findFirst({
      where: { id, status: 'pending' },
    });
    if (!row) throw new NotFoundException('Contribution not found');

    if (input.status === 'rejected') {
      return this.prisma.placeContribution.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewNote: input.reviewNote || null,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
        },
      });
    }

    const payload = asProfile(row.payloadJson) || {};
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (row.kind === 'create') {
      if (!name) throw new BadRequestException('Contribution payload missing name');
      const key = slugify(name);
      const kind =
        typeof payload.kind === 'string' && payload.kind.trim()
          ? payload.kind.trim()
          : 'landmark';
      const country =
        typeof payload.country === 'string' && payload.country.trim()
          ? payload.country.trim()
          : 'India';
      const parentId =
        typeof payload.parentId === 'string' && payload.parentId.trim()
          ? payload.parentId.trim()
          : null;
      const description =
        typeof payload.description === 'string' ? payload.description.trim() : undefined;
      const profile = {
        ...(asProfile(payload.profile) || {}),
        ...(description ? { description } : {}),
      };
      const created = await this.prisma.place.create({
        data: {
          organizationId: null,
          name,
          key: `${key}-${Date.now().toString(36)}`,
          kind,
          parentId,
          country,
          domesticOrIntl: 'domestic',
          isSystem: true,
          isActive: true,
          createdBy: userId,
          profileJson: Object.keys(profile).length
            ? (profile as Prisma.InputJsonValue)
            : undefined,
        },
      });
      return this.prisma.placeContribution.update({
        where: { id },
        data: {
          status: 'approved',
          placeId: created.id,
          reviewNote: input.reviewNote || null,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
          payloadJson: {
            ...payload,
            mergedPlaceId: created.id,
            creditedOrganizationId: row.organizationId,
          } as Prisma.InputJsonValue,
        },
      });
    }

    if (!row.placeId) throw new BadRequestException('Edit contribution missing placeId');
    const existing = await this.prisma.place.findFirst({
      where: { id: row.placeId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Place not found');
    const nextProfile = {
      ...(asProfile(existing.profileJson) || {}),
      ...(asProfile(payload.profile) || {}),
      ...(typeof payload.description === 'string'
        ? { description: payload.description.trim() }
        : {}),
    };
    await this.prisma.place.update({
      where: { id: existing.id },
      data: {
        name: name || undefined,
        profileJson: nextProfile as Prisma.InputJsonValue,
      },
    });
    return this.prisma.placeContribution.update({
      where: { id },
      data: {
        status: 'approved',
        reviewNote: input.reviewNote || null,
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        payloadJson: {
          ...payload,
          creditedOrganizationId: row.organizationId,
        } as Prisma.InputJsonValue,
      },
    });
  }

  /** Platform: create a system-owned place (organizationId null). */
  async platformCreateSystemPlace(userId: string, input: CreatePlaceInput) {
    const key = slugify(input.name);
    if (!key) throw new ConflictException('Invalid place name');
    const duplicate = await this.prisma.place.findFirst({
      where: { deletedAt: null, key, isSystem: true, organizationId: null },
    });
    if (duplicate) throw new ConflictException('System place already exists with this key');

    let country = input.country?.trim() || 'India';
    let region = input.region?.trim() || null;
    let domesticOrIntl: 'domestic' | 'international' = input.domesticOrIntl;
    if (input.parentId) {
      const parent = await this.prisma.place.findFirst({
        where: { id: input.parentId, deletedAt: null, isActive: true },
      });
      if (!parent) throw new NotFoundException('Parent place not found');
      country = parent.country || country;
      region = parent.region || region;
      if (parent.domesticOrIntl === 'domestic' || parent.domesticOrIntl === 'international') {
        domesticOrIntl = parent.domesticOrIntl;
      }
    }

    const place = await this.prisma.place.create({
      data: {
        organizationId: null,
        name: input.name.trim(),
        key,
        kind: input.kind,
        parentId: input.parentId || null,
        country,
        region,
        domesticOrIntl,
        isSystem: true,
        isActive: true,
        createdBy: userId,
        profileJson: input.profile ? (input.profile as Prisma.InputJsonValue) : undefined,
        subcategoryLinks: input.subcategoryIds?.length
          ? {
              create: input.subcategoryIds.map((subcategoryId) => ({ subcategoryId })),
            }
          : undefined,
      },
      include: {
        parent: { select: { id: true, name: true, kind: true } },
        subcategoryLinks: {
          include: {
            subcategory: {
              include: { category: { select: { id: true, name: true, key: true } } },
            },
          },
        },
      },
    });
    const ancestors = await this.ancestorsOf(place.parentId);
    return this.formatPlace(place, ancestors);
  }

  /** Platform: update any system place. */
  async platformUpdateSystemPlace(id: string, input: UpdatePlaceInput) {
    const existing = await this.prisma.place.findFirst({
      where: { id, deletedAt: null, isSystem: true, organizationId: null },
    });
    if (!existing) throw new NotFoundException('System place not found');

    if (input.parentId) {
      const parent = await this.prisma.place.findFirst({
        where: { id: input.parentId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException('Parent place not found');
      if (parent.id === id) throw new ConflictException('Place cannot be its own parent');
    }

    if (input.subcategoryIds) {
      await this.prisma.placeSubcategoryLink.deleteMany({ where: { placeId: id } });
      if (input.subcategoryIds.length) {
        await this.prisma.placeSubcategoryLink.createMany({
          data: input.subcategoryIds.map((subcategoryId) => ({
            placeId: id,
            subcategoryId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const mergedProfile =
      input.profile === undefined
        ? undefined
        : ({
            ...(asProfile(existing.profileJson) || {}),
            ...(input.profile as Record<string, unknown>),
          } as Prisma.InputJsonValue);

    const place = await this.prisma.place.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        kind: input.kind,
        parentId: input.parentId === undefined ? undefined : input.parentId,
        country: input.country === undefined ? undefined : input.country?.trim() || 'India',
        region: input.region === undefined ? undefined : input.region?.trim() || null,
        domesticOrIntl: input.domesticOrIntl,
        isActive: input.isActive,
        profileJson: mergedProfile,
      },
      include: {
        parent: { select: { id: true, name: true, kind: true } },
        subcategoryLinks: {
          include: {
            subcategory: {
              include: { category: { select: { id: true, name: true, key: true } } },
            },
          },
        },
      },
    });
    const ancestors = await this.ancestorsOf(place.parentId);
    return this.formatPlace(place, ancestors);
  }

  async platformCreateKnowledge(
    placeId: string,
    input: {
      season?: string;
      kind: string;
      title?: string | null;
      body: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, deletedAt: null, isSystem: true, organizationId: null },
    });
    if (!place) throw new NotFoundException('System place not found');
    const body = input.body?.trim();
    if (!body) throw new BadRequestException('Knowledge body is required');
    const kind = input.kind?.trim();
    if (!kind) throw new BadRequestException('Knowledge kind is required');

    const row = await this.prisma.placeKnowledge.create({
      data: {
        placeId,
        season: input.season?.trim() || 'all',
        kind,
        title: input.title?.trim() || null,
        body,
        metaJson: input.meta ? (input.meta as Prisma.InputJsonValue) : undefined,
        isSystem: true,
      },
    });
    return {
      id: row.id,
      placeId: row.placeId,
      season: row.season,
      kind: row.kind,
      title: row.title,
      body: row.body,
      meta: row.metaJson,
    };
  }

  async platformUpdateKnowledge(
    knowledgeId: string,
    input: {
      season?: string;
      kind?: string;
      title?: string | null;
      body?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const existing = await this.prisma.placeKnowledge.findFirst({
      where: { id: knowledgeId },
      include: { place: { select: { id: true, isSystem: true, organizationId: true } } },
    });
    if (!existing || !existing.place.isSystem || existing.place.organizationId != null) {
      throw new NotFoundException('Knowledge not found');
    }

    const row = await this.prisma.placeKnowledge.update({
      where: { id: knowledgeId },
      data: {
        ...(input.season !== undefined ? { season: input.season.trim() || 'all' } : {}),
        ...(input.kind !== undefined ? { kind: input.kind.trim() } : {}),
        ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
        ...(input.body !== undefined
          ? {
              body: (() => {
                const b = input.body.trim();
                if (!b) throw new BadRequestException('Knowledge body is required');
                return b;
              })(),
            }
          : {}),
        ...(input.meta !== undefined
          ? { metaJson: input.meta as Prisma.InputJsonValue }
          : {}),
      },
    });
    return {
      id: row.id,
      placeId: row.placeId,
      season: row.season,
      kind: row.kind,
      title: row.title,
      body: row.body,
      meta: row.metaJson,
    };
  }

  async platformDeleteKnowledge(knowledgeId: string) {
    const existing = await this.prisma.placeKnowledge.findFirst({
      where: { id: knowledgeId },
      include: { place: { select: { isSystem: true, organizationId: true } } },
    });
    if (!existing || !existing.place.isSystem || existing.place.organizationId != null) {
      throw new NotFoundException('Knowledge not found');
    }
    await this.prisma.placeKnowledge.delete({ where: { id: knowledgeId } });
    return { ok: true };
  }

  async platformListEdges(opts?: {
    fromPlaceId?: string;
    toPlaceId?: string;
    q?: string;
  }) {
    const items = await this.prisma.placeEdge.findMany({
      where: {
        isSystem: true,
        ...(opts?.fromPlaceId ? { fromPlaceId: opts.fromPlaceId } : {}),
        ...(opts?.toPlaceId ? { toPlaceId: opts.toPlaceId } : {}),
        ...(opts?.q
          ? {
              OR: [
                { fromPlace: { name: { contains: opts.q } } },
                { toPlace: { name: { contains: opts.q } } },
                { roadHint: { contains: opts.q } },
              ],
            }
          : {}),
      },
      include: {
        fromPlace: { select: { id: true, name: true, key: true, kind: true } },
        toPlace: { select: { id: true, name: true, key: true, kind: true } },
      },
      orderBy: [{ fromPlace: { name: 'asc' } }, { toPlace: { name: 'asc' } }],
      take: 300,
    });
    return { items };
  }

  async platformUpsertEdge(input: {
    fromPlaceId: string;
    toPlaceId: string;
    mode?: string;
    distanceKm?: number | null;
    durationMin?: number | null;
    roadHint?: string | null;
    stops?: Array<{ name: string; hint?: string }> | null;
  }) {
    if (input.fromPlaceId === input.toPlaceId) {
      throw new BadRequestException('From and to places must differ');
    }
    const [from, to] = await Promise.all([
      this.prisma.place.findFirst({
        where: {
          id: input.fromPlaceId,
          deletedAt: null,
          isSystem: true,
          organizationId: null,
        },
      }),
      this.prisma.place.findFirst({
        where: {
          id: input.toPlaceId,
          deletedAt: null,
          isSystem: true,
          organizationId: null,
        },
      }),
    ]);
    if (!from || !to) throw new NotFoundException('Place not found');
    const mode = input.mode || 'drive';
    const edge = await this.prisma.placeEdge.upsert({
      where: {
        fromPlaceId_toPlaceId_mode: {
          fromPlaceId: input.fromPlaceId,
          toPlaceId: input.toPlaceId,
          mode,
        },
      },
      create: {
        fromPlaceId: input.fromPlaceId,
        toPlaceId: input.toPlaceId,
        mode,
        distanceKm: input.distanceKm ?? null,
        durationMin: input.durationMin ?? null,
        roadHint: input.roadHint?.trim() || null,
        stopsJson: input.stops
          ? (input.stops as Prisma.InputJsonValue)
          : undefined,
        isSystem: true,
      },
      update: {
        distanceKm: input.distanceKm ?? null,
        durationMin: input.durationMin ?? null,
        roadHint: input.roadHint?.trim() || null,
        stopsJson: input.stops
          ? (input.stops as Prisma.InputJsonValue)
          : undefined,
      },
      include: {
        fromPlace: { select: { id: true, name: true, key: true } },
        toPlace: { select: { id: true, name: true, key: true } },
      },
    });
    return edge;
  }

  async platformUpdateEdge(
    id: string,
    input: {
      distanceKm?: number | null;
      durationMin?: number | null;
      roadHint?: string | null;
      mode?: string;
      stops?: Array<{ name: string; hint?: string }> | null;
    },
  ) {
    const existing = await this.prisma.placeEdge.findFirst({
      where: { id, isSystem: true },
    });
    if (!existing) throw new NotFoundException('Edge not found');
    return this.prisma.placeEdge.update({
      where: { id },
      data: {
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.distanceKm !== undefined
          ? { distanceKm: input.distanceKm }
          : {}),
        ...(input.durationMin !== undefined
          ? { durationMin: input.durationMin }
          : {}),
        ...(input.roadHint !== undefined
          ? { roadHint: input.roadHint?.trim() || null }
          : {}),
        ...(input.stops !== undefined
          ? {
              stopsJson: input.stops
                ? (input.stops as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            }
          : {}),
      },
      include: {
        fromPlace: { select: { id: true, name: true, key: true } },
        toPlace: { select: { id: true, name: true, key: true } },
      },
    });
  }

  async platformDeleteEdge(id: string) {
    const existing = await this.prisma.placeEdge.findFirst({
      where: { id, isSystem: true },
    });
    if (!existing) throw new NotFoundException('Edge not found');
    await this.prisma.placeEdge.delete({ where: { id } });
    return { ok: true };
  }

  async listSystemSubcategories() {
    const categories = await this.prisma.placeCategory.findMany({
      where: { isSystem: true, deletedAt: null, isActive: true },
      include: {
        subcategories: {
          where: { deletedAt: null, isActive: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return { items: categories };
  }
}
