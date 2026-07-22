import { readFileSync } from 'node:fs';
import {
  isAllowedPlaceKind,
  type ParsedPlaceRow,
  type PlaceProfileJson,
} from './types';

/** Minimal RFC4180-ish CSV parse (handles quotes and commas). */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, '');

  while (i < input.length) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      if (ch === '\r' && input[i + 1] === '\n') i += 2;
      else i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function cell(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function parseBool(raw: string, fallback: boolean): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return fallback;
  if (t === 'true' || t === '1' || t === 'yes') return true;
  if (t === 'false' || t === '0' || t === 'no') return false;
  return fallback;
}

function parseNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function splitSuitabilityTags(raw: string): string[] | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const tags = t
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

export function buildProfileJson(row: Record<string, string>): PlaceProfileJson {
  const profile: PlaceProfileJson = {};
  const description = cell(row, 'description');
  if (description) profile.description = description;
  const lat = parseNumber(cell(row, 'latitude'));
  if (lat != null) profile.latitude = lat;
  const lng = parseNumber(cell(row, 'longitude'));
  if (lng != null) profile.longitude = lng;
  const openingHours = cell(row, 'openingHours');
  if (openingHours) profile.openingHours = openingHours;
  const durationMin = parseNumber(cell(row, 'durationMin'));
  if (durationMin != null) profile.durationMin = durationMin;
  const bestTime = cell(row, 'bestTime');
  if (bestTime) profile.bestTime = bestTime;
  const entryFee = cell(row, 'entryFee');
  if (entryFee) profile.entryFee = entryFee;
  const tags = splitSuitabilityTags(cell(row, 'suitabilityTags'));
  if (tags) profile.suitabilityTags = tags;
  const googleMapsUrl = cell(row, 'googleMapsUrl');
  if (googleMapsUrl) profile.googleMapsUrl = googleMapsUrl;
  const iataCode = cell(row, 'iataCode');
  if (iataCode) profile.iataCode = iataCode.toUpperCase();
  const icaoCode = cell(row, 'icaoCode');
  if (icaoCode) profile.icaoCode = icaoCode.toUpperCase();
  const stationCode = cell(row, 'stationCode');
  if (stationCode) profile.stationCode = stationCode.toUpperCase();
  const officialName = cell(row, 'officialName');
  if (officialName) profile.officialName = officialName;
  const shortName = cell(row, 'shortName');
  if (shortName) profile.shortName = shortName;
  const sourceUrl = cell(row, 'sourceUrl');
  if (sourceUrl) profile.sourceUrl = sourceUrl;
  return profile;
}

export type ParsePlacesCsvResult = {
  rows: ParsedPlaceRow[];
  invalid: Array<{ sourceFile: string; reason: string; rawKey?: string }>;
};

/**
 * Parse a places catalog CSV file into typed rows.
 * Invalid kinds / blank keys are collected in `invalid` (not thrown).
 */
export function parsePlacesCsv(
  filePath: string,
  sourceFile: string,
): ParsePlacesCsvResult {
  const text = readFileSync(filePath, 'utf8');
  const table = parseCsvText(text);
  if (table.length < 2) return { rows: [], invalid: [] };

  const header = table[0]!.map((h) => h.trim());
  const rows: ParsedPlaceRow[] = [];
  const invalid: ParsePlacesCsvResult['invalid'] = [];

  for (let r = 1; r < table.length; r++) {
    const cols = table[r]!;
    const map: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      map[header[c]!] = cols[c] ?? '';
    }

    const name = cell(map, 'name');
    const key = cell(map, 'key');
    const kindRaw = cell(map, 'kind');
    if (!key) {
      invalid.push({ sourceFile, reason: 'blank_key' });
      continue;
    }
    if (!name) {
      invalid.push({ sourceFile, reason: 'blank_name', rawKey: key });
      continue;
    }
    if (!isAllowedPlaceKind(kindRaw)) {
      invalid.push({ sourceFile, reason: `invalid_kind:${kindRaw}`, rawKey: key });
      continue;
    }
    const parentKeyRaw = cell(map, 'parentKey');
    if (parentKeyRaw && parentKeyRaw === key) {
      invalid.push({ sourceFile, reason: 'self_parent', rawKey: key });
      continue;
    }

    const domesticRaw = cell(map, 'domesticOrIntl').toLowerCase();
    const domesticOrIntl =
      domesticRaw === 'international' ? 'international' : 'domestic';

    rows.push({
      name,
      key,
      kind: kindRaw,
      parentKey: parentKeyRaw || null,
      country: cell(map, 'country') || 'India',
      region: cell(map, 'region') || null,
      domesticOrIntl,
      isSystem: parseBool(cell(map, 'isSystem'), true),
      isActive: parseBool(cell(map, 'isActive'), true),
      profile: buildProfileJson(map),
      sourceFile,
    });
  }

  return { rows, invalid };
}

/**
 * Layer A: first-wins dedupe by key across a batch of rows.
 */
export function dedupePlaceRowsByKey(rows: ParsedPlaceRow[]): {
  unique: ParsedPlaceRow[];
  duplicateKeys: string[];
} {
  const byKey = new Map<string, ParsedPlaceRow>();
  const duplicateKeys: string[] = [];
  for (const row of rows) {
    if (byKey.has(row.key)) {
      duplicateKeys.push(row.key);
      continue;
    }
    byKey.set(row.key, row);
  }
  return { unique: [...byKey.values()], duplicateKeys };
}
