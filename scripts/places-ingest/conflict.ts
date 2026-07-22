import {
  legacyLeafKey,
  normalizePlaceName,
  type ParsedPlaceRow,
  type PlaceProfileJson,
} from './types';

export type ExistingPlaceCandidate = {
  id: string;
  key: string;
  name: string;
  kind: string;
  isSystem: boolean;
  profileJson?: unknown;
};

export type ResolveAction =
  | { action: 'update'; existing: ExistingPlaceCandidate }
  | { action: 'merged_legacy'; existing: ExistingPlaceCandidate; previousKey: string }
  | { action: 'create' }
  | {
      action:
        | 'conflict_kind'
        | 'conflict_name'
        | 'conflict_transport'
        | 'conflict_org_scoped';
      existing?: ExistingPlaceCandidate;
      detail?: string;
    };

function profileCodes(profile: unknown): { iata?: string; station?: string } {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return {};
  const p = profile as Record<string, unknown>;
  const iata =
    typeof p.iataCode === 'string' ? p.iataCode.trim().toUpperCase() : undefined;
  const station =
    typeof p.stationCode === 'string'
      ? p.stationCode.trim().toUpperCase()
      : undefined;
  return { iata: iata || undefined, station: station || undefined };
}

/**
 * Layer B/C: classify how a CSV row should apply against DB candidates.
 *
 * @param byExactKey — system place with key === csv.key
 * @param byLegacyLeaf — system places whose key === leaf(csv.key)
 * @param byTransportCode — system places matching iata/station (airports/stations)
 */
export function classifyPlaceResolve(input: {
  row: ParsedPlaceRow;
  byExactKey: ExistingPlaceCandidate | null;
  byLegacyLeaf: ExistingPlaceCandidate[];
  byTransportCode: ExistingPlaceCandidate[];
}): ResolveAction {
  const { row, byExactKey, byLegacyLeaf, byTransportCode } = input;

  if (byExactKey) {
    if (!byExactKey.isSystem) {
      return { action: 'conflict_org_scoped', existing: byExactKey };
    }
    if (byExactKey.kind !== row.kind) {
      return {
        action: 'conflict_kind',
        existing: byExactKey,
        detail: `db=${byExactKey.kind} csv=${row.kind}`,
      };
    }
    return { action: 'update', existing: byExactKey };
  }

  const leaf = legacyLeafKey(row.key);
  if (leaf && leaf !== row.key) {
    const leafHits = byLegacyLeaf.filter((c) => c.key === leaf);
    if (leafHits.length) {
      const orgScoped = leafHits.find((c) => !c.isSystem);
      if (orgScoped && leafHits.every((c) => !c.isSystem)) {
        return { action: 'conflict_org_scoped', existing: orgScoped };
      }
      const systemHits = leafHits.filter((c) => c.isSystem);
      const kindMatch = systemHits.filter((c) => c.kind === row.kind);
      if (kindMatch.length === 0 && systemHits.length > 0) {
        // Transport rows may still match by IATA/station below.
        if (row.kind !== 'airport' && row.kind !== 'railway_station') {
          return {
            action: 'conflict_kind',
            existing: systemHits[0],
            detail: `legacy leaf ${leaf}`,
          };
        }
      } else {
        const nameMatch = kindMatch.filter(
          (c) => normalizePlaceName(c.name) === normalizePlaceName(row.name),
        );
        if (kindMatch.length > 0 && nameMatch.length === 0) {
          // Airports/stations often differ in display name; try transport codes next.
          if (row.kind !== 'airport' && row.kind !== 'railway_station') {
            return {
              action: 'conflict_name',
              existing: kindMatch[0],
              detail: `legacy leaf ${leaf} name mismatch`,
            };
          }
        } else if (nameMatch.length === 1) {
          return {
            action: 'merged_legacy',
            existing: nameMatch[0]!,
            previousKey: leaf,
          };
        } else if (nameMatch.length > 1) {
          return {
            action: 'conflict_name',
            existing: nameMatch[0],
            detail: `ambiguous legacy leaf ${leaf}`,
          };
        }
      }
    }
  }

  if (row.kind === 'airport' || row.kind === 'railway_station') {
    const wantIata = row.profile.iataCode?.toUpperCase();
    const wantStation = row.profile.stationCode?.toUpperCase();
    if (wantIata || wantStation) {
      const hits = byTransportCode.filter((c) => {
        if (!c.isSystem) return false;
        const codes = profileCodes(c.profileJson);
        if (wantIata && codes.iata === wantIata) return true;
        if (wantStation && codes.station === wantStation) return true;
        return false;
      });
      if (hits.length === 1) {
        const hit = hits[0]!;
        if (hit.kind !== row.kind) {
          return {
            action: 'conflict_transport',
            existing: hit,
            detail: 'kind mismatch on transport code',
          };
        }
        if (normalizePlaceName(hit.name) !== normalizePlaceName(row.name)) {
          // Same code, different display name — still merge if kind matches (official rename).
          // Plan: ambiguous if different kind/name in conflicting way. Name drift alone → merge.
        }
        return {
          action: 'merged_legacy',
          existing: hit,
          previousKey: hit.key,
        };
      }
      if (hits.length > 1) {
        return {
          action: 'conflict_transport',
          existing: hits[0],
          detail: 'ambiguous transport code',
        };
      }
      const orgHit = byTransportCode.find((c) => !c.isSystem);
      if (orgHit) {
        return { action: 'conflict_org_scoped', existing: orgHit };
      }
    }
  }

  return { action: 'create' };
}

export function mergeProfileJson(
  existing: unknown,
  next: PlaceProfileJson & { legacyKeys?: string[] },
  previousKey?: string,
): PlaceProfileJson {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as PlaceProfileJson) }
      : {};
  const merged: PlaceProfileJson = { ...base, ...next };
  const legacy = new Set<string>([
    ...(Array.isArray(base.legacyKeys)
      ? base.legacyKeys.filter((k): k is string => typeof k === 'string')
      : []),
    ...(Array.isArray(next.legacyKeys)
      ? next.legacyKeys.filter((k): k is string => typeof k === 'string')
      : []),
  ]);
  if (previousKey?.trim()) legacy.add(previousKey.trim());
  if (legacy.size) merged.legacyKeys = [...legacy];
  return merged;
}
