import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { classifyPlaceResolve, mergeProfileJson } from './conflict';
import { dedupePlaceRowsByKey, parsePlacesCsv } from './parse';
import {
  emptyCounters,
  legacyLeafKey,
  type IngestCounters,
  type ParsedPlaceRow,
} from './types';

export type IngestOptions = {
  dir?: string;
  file?: string;
  dryRun: boolean;
};

function listCsvFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('_places_v1.csv'))
    .map((f) => join(dir, f))
    .sort();
}

export function loadBatch(options: IngestOptions): {
  counters: IngestCounters;
  unique: ParsedPlaceRow[];
  invalidNotes: string[];
} {
  const counters = emptyCounters();
  const invalidNotes: string[] = [];
  const files = options.file
    ? [options.file]
    : options.dir
      ? listCsvFiles(options.dir)
      : [];
  counters.files = files.length;

  const allRows: ParsedPlaceRow[] = [];
  for (const filePath of files) {
    const sourceFile = basename(filePath);
    const parsed = parsePlacesCsv(filePath, sourceFile);
    counters.rows_parsed += parsed.rows.length;
    allRows.push(...parsed.rows);
    for (const inv of parsed.invalid) {
      counters.skipped_invalid += 1;
      invalidNotes.push(`${inv.sourceFile}: ${inv.reason} ${inv.rawKey || ''}`.trim());
    }
  }

  const { unique, duplicateKeys } = dedupePlaceRowsByKey(allRows);
  counters.unique_keys = unique.length;
  counters.skipped_duplicate_key = duplicateKeys.length;
  return { counters, unique, invalidNotes };
}

type DbPlace = {
  id: string;
  key: string;
  name: string;
  kind: string;
  isSystem: boolean;
  profileJson: unknown;
};

async function loadSystemPlacesIndex(prisma: PrismaClient) {
  const places = await prisma.place.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      key: true,
      name: true,
      kind: true,
      isSystem: true,
      profileJson: true,
    },
  });
  const byKey = new Map<string, DbPlace>();
  const byLeaf = new Map<string, DbPlace[]>();
  const byIata = new Map<string, DbPlace[]>();
  const byStation = new Map<string, DbPlace[]>();

  for (const p of places) {
    byKey.set(p.key, p);
    const leaf = legacyLeafKey(p.key);
    const leafList = byLeaf.get(leaf) || [];
    leafList.push(p);
    byLeaf.set(leaf, leafList);

    const profile =
      p.profileJson && typeof p.profileJson === 'object' && !Array.isArray(p.profileJson)
        ? (p.profileJson as Record<string, unknown>)
        : {};
    if (typeof profile.iataCode === 'string' && profile.iataCode.trim()) {
      const code = profile.iataCode.trim().toUpperCase();
      const list = byIata.get(code) || [];
      list.push(p);
      byIata.set(code, list);
    }
    if (typeof profile.stationCode === 'string' && profile.stationCode.trim()) {
      const code = profile.stationCode.trim().toUpperCase();
      const list = byStation.get(code) || [];
      list.push(p);
      byStation.set(code, list);
    }
  }

  return { byKey, byLeaf, byIata, byStation };
}

function transportCandidates(
  row: ParsedPlaceRow,
  index: Awaited<ReturnType<typeof loadSystemPlacesIndex>>,
): DbPlace[] {
  const out: DbPlace[] = [];
  const seen = new Set<string>();
  const push = (list?: DbPlace[]) => {
    for (const p of list || []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  };
  if (row.profile.iataCode) push(index.byIata.get(row.profile.iataCode.toUpperCase()));
  if (row.profile.stationCode) {
    push(index.byStation.get(row.profile.stationCode.toUpperCase()));
  }
  return out;
}

export async function ingestPlacesCatalog(
  prisma: PrismaClient,
  options: IngestOptions,
): Promise<{ counters: IngestCounters; notes: string[] }> {
  const { counters, unique, invalidNotes } = loadBatch(options);
  const notes = [...invalidNotes];
  const index = await loadSystemPlacesIndex(prisma);
  const idByKey = new Map<string, string>();

  // Seed idByKey from current DB keys so parent pass can resolve mixed short/path keys.
  for (const [key, place] of index.byKey) {
    idByKey.set(key, place.id);
  }

  for (const row of unique) {
    const leaf = legacyLeafKey(row.key);
    const decision = classifyPlaceResolve({
      row,
      byExactKey: index.byKey.get(row.key) || null,
      byLegacyLeaf: index.byLeaf.get(leaf) || [],
      byTransportCode: transportCandidates(row, index),
    });

    if (
      decision.action === 'conflict_kind' ||
      decision.action === 'conflict_name' ||
      decision.action === 'conflict_transport' ||
      decision.action === 'conflict_org_scoped'
    ) {
      counters[decision.action] += 1;
      notes.push(
        `${decision.action}: ${row.key} (${row.sourceFile})${
          decision.detail ? ` — ${decision.detail}` : ''
        }`,
      );
      continue;
    }

    if (decision.action === 'create') {
      counters.created += 1;
      if (!options.dryRun) {
        const created = await prisma.place.create({
          data: {
            organizationId: null,
            name: row.name,
            key: row.key,
            kind: row.kind,
            country: row.country,
            region: row.region,
            domesticOrIntl: row.domesticOrIntl,
            isSystem: true,
            isActive: row.isActive,
            profileJson: row.profile as Prisma.InputJsonValue,
          },
        });
        idByKey.set(row.key, created.id);
        index.byKey.set(row.key, {
          id: created.id,
          key: row.key,
          name: row.name,
          kind: row.kind,
          isSystem: true,
          profileJson: row.profile,
        });
      } else {
        idByKey.set(row.key, `dry:${row.key}`);
      }
      continue;
    }

    const existing = decision.existing;
    const previousKey =
      decision.action === 'merged_legacy' ? decision.previousKey : undefined;
    if (decision.action === 'merged_legacy') counters.merged_legacy += 1;
    else counters.updated += 1;

    const profile = mergeProfileJson(
      existing.profileJson,
      row.profile,
      previousKey && previousKey !== row.key ? previousKey : undefined,
    );

    if (!options.dryRun) {
      await prisma.place.update({
        where: { id: existing.id },
        data: {
          name: row.name,
          key: row.key,
          kind: row.kind,
          country: row.country,
          region: row.region,
          domesticOrIntl: row.domesticOrIntl,
          isSystem: true,
          isActive: row.isActive,
          profileJson: profile as Prisma.InputJsonValue,
        },
      });
    }

    idByKey.set(row.key, existing.id);
    if (previousKey) idByKey.set(previousKey, existing.id);
    index.byKey.set(row.key, {
      id: existing.id,
      key: row.key,
      name: row.name,
      kind: row.kind,
      isSystem: true,
      profileJson: profile,
    });
    if (previousKey && previousKey !== row.key) {
      index.byKey.delete(previousKey);
    }
  }

  // Pass 2 — parent links
  for (const row of unique) {
    if (!row.parentKey) continue;
    const childId = idByKey.get(row.key);
    const parentId = idByKey.get(row.parentKey) || index.byKey.get(row.parentKey)?.id;
    if (!childId || childId.startsWith('dry:')) {
      if (!parentId) {
        counters.warn_orphan_parent += 1;
        notes.push(`warn_orphan_parent: ${row.key} → ${row.parentKey}`);
      }
      continue;
    }
    if (!parentId) {
      counters.warn_orphan_parent += 1;
      notes.push(`warn_orphan_parent: ${row.key} → ${row.parentKey}`);
      continue;
    }
    if (options.dryRun) continue;
    await prisma.place.update({
      where: { id: childId },
      data: { parentId },
    });
  }

  return { counters, notes };
}

export function formatIngestReport(
  counters: IngestCounters,
  notes: string[],
  dryRun: boolean,
): string {
  const lines = [
    dryRun ? 'Places ingest (dry-run)' : 'Places ingest',
    `files: ${counters.files}`,
    `rows_parsed: ${counters.rows_parsed}`,
    `unique_keys: ${counters.unique_keys}`,
    `created: ${counters.created}`,
    `updated: ${counters.updated}`,
    `merged_legacy: ${counters.merged_legacy}`,
    `skipped_duplicate_key: ${counters.skipped_duplicate_key}`,
    `skipped_invalid: ${counters.skipped_invalid}`,
    `conflict_kind: ${counters.conflict_kind}`,
    `conflict_name: ${counters.conflict_name}`,
    `conflict_transport: ${counters.conflict_transport}`,
    `conflict_org_scoped: ${counters.conflict_org_scoped}`,
    `warn_orphan_parent: ${counters.warn_orphan_parent}`,
  ];
  if (notes.length) {
    lines.push('', 'notes (first 40):');
    for (const n of notes.slice(0, 40)) lines.push(`  - ${n}`);
    if (notes.length > 40) lines.push(`  … +${notes.length - 40} more`);
  }
  return lines.join('\n');
}
