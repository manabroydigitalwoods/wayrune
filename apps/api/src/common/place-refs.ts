import type { PlaceRef } from '@wayrune/contracts';
import { PrismaService } from '../prisma/prisma.service';

export type PlaceRefLike = string | PlaceRef | null | undefined;

export function coercePlaceRef(raw: PlaceRefLike): PlaceRef | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { placeId: null, name } : null;
  }
  if (typeof raw === 'object' && typeof raw.name === 'string' && raw.name.trim()) {
    return {
      placeId: raw.placeId ?? null,
      name: raw.name.trim(),
      kind: raw.kind,
    };
  }
  return null;
}

export function placeRefDisplayName(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'name' in raw) {
    const name = (raw as { name?: unknown }).name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }
  return null;
}

export function placeRefsFromJson(raw: unknown): PlaceRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => coercePlaceRef(item as PlaceRefLike)).filter(Boolean) as PlaceRef[];
}

/** Resolve place IDs to authoritative name/kind snapshots for persistence. */
export async function resolvePlaceRefs(
  prisma: PrismaService,
  organizationId: string,
  refs: PlaceRefLike[] | undefined,
): Promise<PlaceRef[]> {
  if (!refs?.length) return [];
  const coerced = refs.map(coercePlaceRef).filter(Boolean) as PlaceRef[];
  const ids = coerced.map((r) => r.placeId).filter(Boolean) as string[];
  const places = ids.length
    ? await prisma.place.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          OR: [{ isSystem: true, organizationId: null }, { organizationId }],
        },
        select: { id: true, name: true, kind: true },
      })
    : [];
  const byId = new Map(places.map((p) => [p.id, p]));
  return coerced.map((ref) => {
    const hit = ref.placeId ? byId.get(ref.placeId) : undefined;
    return {
      placeId: hit?.id ?? ref.placeId ?? null,
      name: hit?.name ?? ref.name,
      kind: hit?.kind ?? ref.kind,
    };
  });
}

export async function resolveOnePlaceRef(
  prisma: PrismaService,
  organizationId: string,
  raw: PlaceRefLike,
): Promise<PlaceRef | null> {
  const list = await resolvePlaceRefs(prisma, organizationId, raw == null ? [] : [raw]);
  return list[0] ?? null;
}

/**
 * Labels for destination → POS infer: each destination's display name, then
 * parent-chain names (root → leaf). Free-text destinations contribute name only.
 */
export async function placeAncestorLabelsForRefs(
  prisma: PrismaService,
  organizationId: string,
  destinationsJson: unknown,
): Promise<string[]> {
  const refs = placeRefsFromJson(destinationsJson);
  if (!refs.length) return [];
  const labels: string[] = [];
  for (const ref of refs) {
    if (ref.name?.trim()) labels.push(ref.name.trim());
    if (!ref.placeId) continue;
    const chain: string[] = [];
    let currentId: string | null = ref.placeId;
    const guard = new Set<string>();
    while (currentId && !guard.has(currentId)) {
      guard.add(currentId);
      const place = await prisma.place.findFirst({
        where: {
          id: currentId,
          deletedAt: null,
          OR: [{ isSystem: true, organizationId: null }, { organizationId }],
        },
        select: { name: true, parentId: true },
      });
      if (!place) break;
      chain.unshift(place.name);
      currentId = place.parentId;
    }
    for (const name of chain) {
      if (name?.trim()) labels.push(name.trim());
    }
  }
  return labels;
}
