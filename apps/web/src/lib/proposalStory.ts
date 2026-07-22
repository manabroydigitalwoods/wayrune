import {
  destinationRefFromDay,
  locationRefFromItem,
  pickSeasonalKnowledgeBody,
  tripClimateSeason,
  tripWindowHeadline,
} from '@wayrune/contracts';
import { loadPlace, type PlaceApiItem } from '../components/places/PlacePicker';
import { placeName, toPlaceRef } from './placeRefs';

/** Minimal shapes so this helper stays free of a cycle with ItineraryBuilder. */
export type StoryPackingCategories = {
  clothing?: string[];
  electronics?: string[];
  documents?: string[];
  medicine?: string[];
};

export type StorySeedInput = {
  heroImageUrl?: string;
  headline?: string;
  tagline?: string;
  highlights?: string[];
  bestTime?: string;
  weatherNote?: string;
  packingTips?: string[];
  packingCategories?: StoryPackingCategories;
  faqs?: Array<{ question: string; answer: string }>;
  consultantNote?: string;
  cancellationNote?: string;
  paymentSchedule?: Array<{ label: string; percent?: number; amountHint?: string }>;
};

type DayLike = {
  destinationRef?: unknown;
  destination?: unknown;
  items?: Array<{
    title?: string;
    type?: string;
    customerVisible?: boolean;
    locationRef?: unknown;
    location?: unknown;
    details?: {
      catalogPlaceId?: string;
      imageUrl?: string;
      imageUrls?: string[];
    };
  }>;
};

export type PlaceKnowledgeItem = {
  id: string;
  season: string;
  kind: string;
  title?: string | null;
  body: string;
  meta?: unknown;
};

export type PlaceWithKnowledge = PlaceApiItem & {
  knowledge?: PlaceKnowledgeItem[];
};

const ESSENTIAL_KEYS = ['hero', 'headline', 'highlight', 'bestTime'] as const;

export function storyEssentialsScore(story: StorySeedInput): {
  score: number;
  max: number;
  checks: Record<(typeof ESSENTIAL_KEYS)[number], boolean>;
} {
  const checks = {
    hero: Boolean(story.heroImageUrl?.trim()),
    headline: Boolean(story.headline?.trim()),
    highlight: (story.highlights || []).some((h) => h.trim()),
    bestTime: Boolean(story.bestTime?.trim()),
  };
  return {
    score: Object.values(checks).filter(Boolean).length,
    max: ESSENTIAL_KEYS.length,
    checks,
  };
}

/** True when fill would overwrite user-entered story fields. */
export function storyHasContent(story: StorySeedInput): boolean {
  if (story.heroImageUrl?.trim()) return true;
  if (story.headline?.trim()) return true;
  if (story.tagline?.trim()) return true;
  if (story.bestTime?.trim()) return true;
  if (story.weatherNote?.trim()) return true;
  if (story.consultantNote?.trim()) return true;
  if (story.cancellationNote?.trim()) return true;
  if ((story.highlights || []).some((h) => h.trim())) return true;
  if ((story.packingTips || []).some((t) => t.trim())) return true;
  if ((story.faqs || []).some((f) => f.question.trim() || f.answer.trim())) return true;
  if ((story.paymentSchedule || []).some((s) => s.label.trim() || s.percent != null))
    return true;
  const cats = story.packingCategories || {};
  for (const list of Object.values(cats)) {
    if ((list || []).some((t) => t.trim())) return true;
  }
  return false;
}

function uniquePlaceIds(days: DayLike[]): string[] {
  const ids = new Set<string>();
  for (const day of days) {
    const dest = destinationRefFromDay(day) || toPlaceRef(day.destination);
    if (dest?.placeId) ids.add(dest.placeId);
    for (const item of day.items || []) {
      const catalogId = item.details?.catalogPlaceId;
      if (catalogId) ids.add(catalogId);
      const loc = locationRefFromItem(item) || toPlaceRef(item.location);
      if (loc?.placeId) ids.add(loc.placeId);
    }
  }
  return [...ids];
}

function knowledgeBody(
  places: PlaceWithKnowledge[],
  kind: string,
  season: ReturnType<typeof tripClimateSeason> = null,
): string | undefined {
  const flat = places.flatMap((p) => p.knowledge || []);
  return (
    pickSeasonalKnowledgeBody(flat, kind, season) ||
    pickSeasonalKnowledgeBody(flat, kind, null)
  );
}

function splitTipList(body: string): string[] {
  return body
    .split(/[\n;]+|(?<=\.)\s+|(?:,\s+)/)
    .map((s) => s.replace(/^[-•\s]+/, '').trim())
    .filter((s) => s.length > 2)
    .slice(0, 12);
}

function destinationNames(days: DayLike[], places: PlaceWithKnowledge[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const day of days) {
    const dest = destinationRefFromDay(day) || toPlaceRef(day.destination);
    const name = dest ? placeName(dest) : null;
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }
  if (names.length === 0) {
    for (const p of places) {
      if (p.name && !seen.has(p.name.toLowerCase())) {
        seen.add(p.name.toLowerCase());
        names.push(p.name);
      }
    }
  }
  return names;
}

function firstHeroImage(
  places: PlaceWithKnowledge[],
  days: DayLike[],
): string | undefined {
  for (const p of places) {
    const url = p.profile?.imageUrls?.find((u) => u.trim());
    if (url) return url.trim();
  }
  for (const day of days) {
    for (const item of day.items || []) {
      const url =
        item.details?.imageUrl?.trim() ||
        item.details?.imageUrls?.find((u) => u.trim());
      if (url) return url;
    }
  }
  return undefined;
}

function collectHighlights(days: DayLike[], cap = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const day of days) {
    for (const item of day.items || []) {
      if (item.customerVisible === false) continue;
      const title = item.title?.trim();
      if (!title || title === 'Activity' || title.toLowerCase() === item.type) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(title);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

function packingFromKnowledge(places: PlaceWithKnowledge[]): {
  packingTips?: string[];
  packingCategories?: StoryPackingCategories;
} {
  const packingBody = knowledgeBody(places, 'packing');
  if (!packingBody) return {};
  const tips = splitTipList(packingBody);
  if (!tips.length) return { packingTips: [packingBody] };
  return {
    packingTips: tips,
    packingCategories: { clothing: tips.slice(0, 8) },
  };
}

/**
 * Assemble proposal story from catalog places (+ optional day highlights).
 * Knowledge-first — no LLM. Safe draft for consultants to edit.
 */
export async function seedStoryFromPlaceIds(
  placeIds: string[],
  opts?: {
    days?: DayLike[];
    /** Preserve picker order for headlines when ids alone would scramble. */
    placeNames?: string[];
    startDate?: string | null;
    endDate?: string | null;
  },
  load: (id: string) => Promise<PlaceWithKnowledge> = loadPlace,
): Promise<Partial<StorySeedInput>> {
  const ids = [...new Set(placeIds.filter(Boolean))];
  const places: PlaceWithKnowledge[] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        places.push(await load(id));
      } catch {
        /* skip missing places */
      }
    }),
  );

  const days = opts?.days || [];
  const namesFromOpts = (opts?.placeNames || []).map((n) => n.trim()).filter(Boolean);
  const names =
    namesFromOpts.length > 0
      ? [...new Set(namesFromOpts)]
      : destinationNames(days, places);
  const lead = names[0];
  const others = names.slice(1);
  const leadPlace =
    places.find((p) => p.name.toLowerCase() === lead?.toLowerCase()) || places[0];
  const description = leadPlace?.profile?.description?.trim();
  const season = tripClimateSeason(opts?.startDate, opts?.endDate);

  // Travel window for this trip — never seed catalog "October–May" ideal seasons.
  const bestTime = tripWindowHeadline(opts?.startDate, opts?.endDate, lead || null);

  const weatherNote =
    knowledgeBody(places, 'weather', season) ||
    knowledgeBody(places, 'tip', season)?.slice(0, 180);

  const headline = lead
    ? others.length
      ? `Discover ${lead}${others.length === 1 ? ` & ${others[0]}` : ' and beyond'}`
      : `Escape to ${lead}`
    : undefined;

  const tagline =
    description ||
    (names.length > 1
      ? `${names.join(' · ')} — curated days for your travellers`
      : lead
        ? `A thoughtfully paced stay in ${lead}`
        : undefined);

  let highlights = collectHighlights(days);
  if (highlights.length < 2) {
    const tipBits = knowledgeBody(places, 'tip');
    if (tipBits) {
      for (const tip of splitTipList(tipBits).slice(0, 4)) {
        if (!highlights.some((h) => h.toLowerCase() === tip.toLowerCase())) {
          highlights.push(tip);
        }
      }
    }
  }
  if (highlights.length < 2 && description) {
    highlights.push(description.length > 90 ? `${description.slice(0, 87)}…` : description);
  }
  if (highlights.length < 2) {
    for (const name of names.slice(0, 4)) {
      const line = `Explore ${name}`;
      if (!highlights.some((h) => h.toLowerCase() === line.toLowerCase())) {
        highlights.push(line);
      }
    }
  }
  highlights = highlights.slice(0, 6);

  const packing = packingFromKnowledge(places);

  return {
    heroImageUrl: firstHeroImage(places, days),
    headline,
    tagline,
    bestTime: bestTime || undefined,
    weatherNote: weatherNote || undefined,
    highlights: highlights.length ? highlights : undefined,
    ...packing,
  };
}

/**
 * Assemble essential proposal story (and light packing) from day destinations
 * and loaded place profiles / PlaceKnowledge.
 */
export async function seedStoryFromDays(
  days: DayLike[],
  opts?: { startDate?: string | null; endDate?: string | null },
  load: (id: string) => Promise<PlaceWithKnowledge> = loadPlace,
): Promise<Partial<StorySeedInput>> {
  return seedStoryFromPlaceIds(
    uniquePlaceIds(days),
    { days, startDate: opts?.startDate, endDate: opts?.endDate },
    load,
  );
}
