/**
 * Marketplace-style catalog detail for Presence themes & components.
 * Reads extended preview/schema fields when present; otherwise derives
 * useful defaults so the detail dialog is never sparse.
 */

import { asSuggestMeta, categoryLabel, type PresenceSuggestMeta } from './catalogMeta';

export type CatalogScreen = {
  id: string;
  label: string;
  device: 'desktop' | 'tablet' | 'mobile';
  caption?: string;
  /** Optional image URL; when absent, dialog renders a token/device mock. */
  imageUrl?: string | null;
};

export type CatalogReview = {
  id: string;
  author: string;
  role?: string;
  rating: number;
  body: string;
  dateLabel?: string;
};

export type CatalogDetail = {
  summary: string | null;
  longDescription: string | null;
  highlights: string[];
  includes: string[];
  idealFor: string[];
  notIdealFor: string[];
  screens: CatalogScreen[];
  rating: { average: number; count: number };
  reviews: CatalogReview[];
  complexity: 'simple' | 'standard' | 'advanced';
  fieldCount: number;
  variantCount: number;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Stable 0..1 hash from a key (for deterministic ratings without a backend). */
function keyUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function deriveRating(key: string, priority?: number | null): { average: number; count: number } {
  const u = keyUnit(key);
  const base = typeof priority === 'number' ? priority : 55;
  const average = Math.round((3.9 + (base / 100) * 0.9 + u * 0.15) * 10) / 10;
  const count = 8 + Math.floor(u * 90) + Math.floor((base / 100) * 40);
  return { average: Math.min(5, average), count };
}

function parseScreens(raw: unknown): CatalogScreen[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogScreen[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = asRecord(raw[i]);
    const label = typeof row.label === 'string' ? row.label : typeof row.name === 'string' ? row.name : null;
    if (!label) continue;
    const deviceRaw = typeof row.device === 'string' ? row.device : 'desktop';
    const device =
      deviceRaw === 'mobile' || deviceRaw === 'tablet' || deviceRaw === 'desktop'
        ? deviceRaw
        : 'desktop';
    out.push({
      id: typeof row.id === 'string' ? row.id : `screen_${i}`,
      label,
      device,
      caption: typeof row.caption === 'string' ? row.caption : undefined,
      imageUrl:
        typeof row.imageUrl === 'string'
          ? row.imageUrl
          : typeof row.url === 'string'
            ? row.url
            : typeof row.src === 'string'
              ? row.src
              : null,
    });
  }
  return out;
}

function parseReviews(raw: unknown): CatalogReview[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogReview[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = asRecord(raw[i]);
    const body = typeof row.body === 'string' ? row.body : typeof row.comment === 'string' ? row.comment : null;
    const author = typeof row.author === 'string' ? row.author : typeof row.name === 'string' ? row.name : null;
    if (!body || !author) continue;
    const rating = typeof row.rating === 'number' ? Math.min(5, Math.max(1, row.rating)) : 5;
    out.push({
      id: typeof row.id === 'string' ? row.id : `rev_${i}`,
      author,
      role: typeof row.role === 'string' ? row.role : typeof row.orgKind === 'string' ? row.orgKind : undefined,
      rating,
      body,
      dateLabel: typeof row.dateLabel === 'string' ? row.dateLabel : typeof row.at === 'string' ? row.at : undefined,
    });
  }
  return out;
}

function defaultThemeScreens(name: string): CatalogScreen[] {
  return [
    { id: 'home', label: 'Home', device: 'desktop', caption: `${name} homepage chrome` },
    { id: 'tablet', label: 'Tablet', device: 'tablet', caption: 'Mid-width layout' },
    { id: 'mobile', label: 'Mobile', device: 'mobile', caption: 'Phone viewport' },
  ];
}

function defaultComponentScreens(name: string, variantCount: number): CatalogScreen[] {
  const screens: CatalogScreen[] = [
    { id: 'default', label: 'Default', device: 'desktop', caption: `${name} default look` },
    { id: 'mobile', label: 'Mobile', device: 'mobile', caption: 'Stacked / narrow layout' },
  ];
  if (variantCount > 1) {
    screens.splice(1, 0, {
      id: 'variant',
      label: 'Alternate',
      device: 'tablet',
      caption: `${variantCount} layout variations available`,
    });
  }
  return screens;
}

const THEME_LONG: Record<string, { long: string; highlights: string[]; includes: string[]; notIdeal?: string[] }> = {
  coastal_light: {
    long: 'A bright, marketing-ready theme for travel agencies and DMCs. Teal accents and clean type keep packages and destinations easy to scan, while header/footer chrome stays conversion-focused without feeling sparse.',
    highlights: [
      'Coastal teal palette tuned for travel marketing',
      'Clear hierarchy for destinations, packages, and CTAs',
      'Works with agency and tour-operator starters',
    ],
    includes: ['Header & footer chrome', 'Responsive design tokens', 'Hero / CTA friendly contrast'],
    notIdeal: ['Ultra-dark luxury brands', 'Minimal portfolio-only sites'],
  },
  hospitality_luxe: {
    long: 'Warm metallic accents and editorial serif display type for hotels and resorts. Feels composed and premium—ideal when rooms, amenities, and reserve CTAs should feel intentional rather than loud.',
    highlights: [
      'Luxe hospitality palette (gold / stone)',
      'Serif display + modern body pairing',
      'Strong fit for property and stay pages',
    ],
    includes: ['Hotel-oriented header/footer variants', 'Soft surface tokens', 'Reserve-ready CTA contrast'],
    notIdeal: ['Budget backpacker brands', 'High-energy party hostels'],
  },
  homestay_hearth: {
    long: 'Earthy greens and soft cream for homestays and farmstays. Story-led presence that feels welcoming—host narrative first, then rooms, experiences, and enquiry.',
    highlights: [
      'Warm, story-first palette',
      'Best match for homestay / farmstay org kinds',
      'Soft surfaces for photo-heavy pages',
    ],
    includes: ['Warm token set', 'Homestay chrome variants', 'Readable body type for long stories'],
    notIdeal: ['Corporate DMC mega-sites', 'Nightlife / club brands'],
  },
  portfolio_ink: {
    long: 'Minimal ink-on-paper aesthetic for personal brands and creator portfolios. Lets photography and case studies lead; chrome stays quiet.',
    highlights: ['Minimal chrome', 'Portfolio-first hierarchy', 'Neutral ink palette'],
    includes: ['Sparse header/footer', 'Strong typography tokens'],
    notIdeal: ['Multi-destination tour catalogs'],
  },
  slate_editorial: {
    long: 'Editorial slate neutrals for agencies that want magazine energy—long reads, destination essays, and quiet luxury without hotel gold.',
    highlights: ['Editorial travel mood', 'Flexible across agency & hotel', 'Strong long-form readability'],
    includes: ['Editorial header/footer', 'Balanced token contrast'],
  },
  midnight_harbor: {
    long: 'Dark harbor palette with teal highlights for premium packages and night-sky hero imagery. High contrast CTAs keep conversion clear on dark surfaces.',
    highlights: ['Dark premium travel look', 'Teal accent on deep navy', 'Landing-page friendly'],
    includes: ['Dark theme tokens', 'High-contrast CTAs', 'Package landing chrome'],
    notIdeal: ['Print-style light catalogs'],
  },
  alpine_mist: {
    long: 'Cool misty neutrals with a teal accent—quiet luxury for trail, wellness, and soft adventure storytelling.',
    highlights: ['Misty editorial neutrals', 'Soft adventure mood', 'Landing + marketing dual use'],
    includes: ['Editorial tokens', 'Calm surface hierarchy'],
  },
};

const MODULE_LONG: Record<string, { long: string; highlights: string[]; includes: string[] }> = {
  footer_columns: {
    long: 'Multi-column footer for links, contact, and legal. Place once in global chrome so every page shares the same trust and navigation anchors.',
    highlights: [
      'Up to three content columns',
      'Ideal for global footer region',
      'Pairs with logo header and legal text',
    ],
    includes: ['Column titles & bodies', 'Editable rich text props', 'Navigation category placement'],
  },
  hero: {
    long: 'Primary above-the-fold section—headline, supporting copy, and CTAs. Variants cover spotlight, immersive photo, split media, and minimal type.',
    highlights: ['Multiple layout variants', 'Dual CTA support', 'Best on home & landing roles'],
    includes: ['Headline / subhead / CTAs', 'Optional media', 'Variant switcher in builder'],
  },
  form: {
    long: 'Renders a Presence form definition into the page. Submissions ingest into CRM inquiries—use on contact and enquire flows.',
    highlights: ['Tied to Forms library', 'CRM ingest modes', 'Conversion category'],
    includes: ['Form key picker', 'Intro copy props'],
  },
  destination_grid: {
    long: 'Card grid for destinations—ideal on home and destinations listing pages. Supports discovery browsing before package detail.',
    highlights: ['Travel-specific module', 'Grid + mosaic variants', 'Strong home-page fit'],
    includes: ['Card fields', 'Layout variants'],
  },
  package_cards: {
    long: 'Tour and package cards for trips you sell. Use on home, tours, and trips pages to move visitors toward enquiry.',
    highlights: ['Commerce-oriented travel cards', 'Grid and list variants'],
    includes: ['Price / duration fields', 'CTA per card'],
  },
  testimonials: {
    long: 'Social proof quote cards. Builds trust on home and about pages without leaving the page builder.',
    highlights: ['Trust / social-proof category', 'Quote card layout'],
    includes: ['Author, quote, optional photo'],
  },
};

const CATEGORY_FALLBACK_REVIEWS: Record<string, CatalogReview[]> = {
  navigation: [
    {
      id: 'n1',
      author: 'Priya S.',
      role: 'Agency marketer',
      rating: 5,
      body: 'Easy to drop into global chrome—guests always find contact and policies.',
      dateLabel: 'Mar 2026',
    },
    {
      id: 'n2',
      author: 'Marcus L.',
      role: 'Hotel brand lead',
      rating: 4,
      body: 'Clean columns; we keep legal links here and never touch page templates again.',
      dateLabel: 'Jan 2026',
    },
  ],
  hero: [
    {
      id: 'h1',
      author: 'Elena R.',
      role: 'DMC growth',
      rating: 5,
      body: 'Variants cover most campaigns without a custom module.',
      dateLabel: 'Feb 2026',
    },
  ],
  travel: [
    {
      id: 't1',
      author: 'Omar K.',
      role: 'Tour operator',
      rating: 5,
      body: 'Feels native to travel catalogs—less fighting with generic CMS blocks.',
      dateLabel: 'Apr 2026',
    },
  ],
  conversion: [
    {
      id: 'c1',
      author: 'Hannah W.',
      role: 'Homestay host',
      rating: 5,
      body: 'Form ingest into CRM saved us a Zapier hop.',
      dateLabel: 'Dec 2025',
    },
  ],
  content: [
    {
      id: 'co1',
      author: 'Diego M.',
      role: 'Content lead',
      rating: 4,
      body: 'Solid defaults; we tweak copy more than layout.',
      dateLabel: 'Feb 2026',
    },
  ],
  theme: [
    {
      id: 'th1',
      author: 'Sofia A.',
      role: 'Travel agency',
      rating: 5,
      body: 'Looked on-brand in an afternoon—tokens matched our print deck closely enough.',
      dateLabel: 'Mar 2026',
    },
    {
      id: 'th2',
      author: 'James P.',
      role: 'Property GM',
      rating: 4,
      body: 'Guests notice the polish. We still swap photos seasonally in the builder.',
      dateLabel: 'Jan 2026',
    },
  ],
};

function idealFromSuggest(suggest: PresenceSuggestMeta | null): string[] {
  if (!suggest) return [];
  const out: string[] = [];
  for (const k of suggest.orgKinds || []) out.push(k.replace(/_/g, ' '));
  for (const k of suggest.siteKinds || []) out.push(`${k} sites`);
  for (const k of suggest.pageRoles || []) out.push(`${k} pages`);
  for (const k of suggest.useCases || []) out.push(k);
  for (const k of suggest.bestFor || []) out.push(k.replace(/_/g, ' '));
  for (const k of suggest.moods || []) out.push(`${k} mood`);
  return [...new Set(out)].slice(0, 8);
}

function complexityFromFields(fieldCount: number, variantCount: number): CatalogDetail['complexity'] {
  if (fieldCount <= 4 && variantCount <= 1) return 'simple';
  if (fieldCount >= 10 || variantCount >= 3) return 'advanced';
  return 'standard';
}

export function buildThemeCatalogDetail(input: {
  key: string;
  name: string;
  description?: string | null;
  previewAssetsJson?: Record<string, unknown> | null;
  schemaJson?: Record<string, unknown> | null;
  suggestJson?: unknown;
  hasFullSite?: boolean;
  defaultSitePageCount?: number;
}): CatalogDetail {
  const assets = asRecord(input.previewAssetsJson);
  const schema = asRecord(input.schemaJson);
  const suggest = asSuggestMeta(input.suggestJson);
  const curated = THEME_LONG[input.key];

  const summary =
    (typeof assets.description === 'string' && assets.description.trim()) ||
    (typeof schema.description === 'string' && schema.description.trim()) ||
    input.description ||
    null;

  const longDescription =
    (typeof assets.longDescription === 'string' && assets.longDescription.trim()) ||
    (typeof assets.about === 'string' && assets.about.trim()) ||
    curated?.long ||
    (summary
      ? `${summary} Apply it to a website to restyle chrome, typography, and surfaces across every page.`
      : `${input.name} is a Presence theme. Apply it to restyle your public site chrome and design tokens.`);

  const highlights =
    asStringArray(assets.highlights).length > 0
      ? asStringArray(assets.highlights)
      : curated?.highlights ||
        [
          suggest?.moods?.[0] ? `${suggest.moods[0]} visual mood` : 'Brand-ready token set',
          input.hasFullSite ? 'Includes starter site structure' : 'Works with existing site structure',
          'Header & footer chrome included',
        ];

  const includes =
    asStringArray(assets.includes).length > 0
      ? asStringArray(assets.includes)
      : curated?.includes ||
        [
          'Design tokens (colors, type, radius)',
          'Header / footer regions',
          ...(input.defaultSitePageCount
            ? [`Starter pages (${input.defaultSitePageCount})`]
            : ['Compatible with site templates']),
        ];

  const idealFor =
    asStringArray(assets.idealFor).length > 0
      ? asStringArray(assets.idealFor)
      : idealFromSuggest(suggest).length
        ? idealFromSuggest(suggest)
        : asStringArray(assets.bestFor).map((s) => s.replace(/_/g, ' '));

  const notIdealFor =
    asStringArray(assets.notIdealFor).length > 0
      ? asStringArray(assets.notIdealFor)
      : curated?.notIdeal || [];

  const screens =
    parseScreens(assets.screens).length > 0
      ? parseScreens(assets.screens)
      : parseScreens(assets.screenshots).length > 0
        ? parseScreens(assets.screenshots)
        : defaultThemeScreens(input.name);

  const ratingRaw = asRecord(assets.rating);
  const rating =
    typeof ratingRaw.average === 'number'
      ? {
          average: Math.min(5, ratingRaw.average),
          count: typeof ratingRaw.count === 'number' ? ratingRaw.count : deriveRating(input.key, suggest?.priority).count,
        }
      : deriveRating(input.key, suggest?.priority);

  const reviews =
    parseReviews(assets.reviews).length > 0
      ? parseReviews(assets.reviews)
      : CATEGORY_FALLBACK_REVIEWS.theme || [];

  return {
    summary,
    longDescription,
    highlights,
    includes,
    idealFor,
    notIdealFor,
    screens,
    rating,
    reviews,
    complexity: 'standard',
    fieldCount: 0,
    variantCount: 0,
  };
}

export function buildComponentCatalogDetail(input: {
  key: string;
  name: string;
  category: string;
  description?: string | null;
  previewJson?: Record<string, unknown> | null;
  assetsJson?: Record<string, unknown> | null;
  schemaJson?: Array<Record<string, unknown>> | null;
  suggestJson?: unknown;
  variantCount?: number;
}): CatalogDetail {
  const preview = asRecord(input.previewJson);
  const assets = asRecord(input.assetsJson);
  const suggest = asSuggestMeta(input.suggestJson);
  const curated = MODULE_LONG[input.key];
  const fieldCount = Array.isArray(input.schemaJson) ? input.schemaJson.length : 0;
  const variantCount = input.variantCount || 0;

  const summary =
    input.description ||
    (typeof assets.description === 'string' && assets.description.trim()) ||
    (typeof preview.summary === 'string' && preview.summary.trim()) ||
    (typeof preview.description === 'string' && preview.description.trim()) ||
    null;

  const longDescription =
    (typeof preview.longDescription === 'string' && preview.longDescription.trim()) ||
    (typeof preview.about === 'string' && preview.about.trim()) ||
    (typeof assets.longDescription === 'string' && assets.longDescription.trim()) ||
    curated?.long ||
    (summary
      ? `${summary} Add it from the page builder library; props are editable in the inspector.`
      : `${input.name} is a ${categoryLabel(input.category)} module. Drop it onto a page and edit its fields in the builder.`);

  const highlights =
    asStringArray(preview.highlights).length > 0
      ? asStringArray(preview.highlights)
      : asStringArray(assets.highlights).length > 0
        ? asStringArray(assets.highlights)
        : curated?.highlights ||
          [
            `${categoryLabel(input.category)} category`,
            fieldCount ? `${fieldCount} editable fields` : 'Ready-made defaults',
            variantCount > 1 ? `${variantCount} layout variants` : 'Single focused layout',
          ];

  const includes =
    asStringArray(preview.includes).length > 0
      ? asStringArray(preview.includes)
      : curated?.includes ||
        [
          'Builder inspector fields',
          ...(variantCount > 1 ? [`${variantCount} variants`] : []),
          'Works with current theme tokens',
        ];

  const idealFor =
    asStringArray(preview.idealFor).length > 0
      ? asStringArray(preview.idealFor)
      : idealFromSuggest(suggest);

  const screens =
    parseScreens(preview.screens).length > 0
      ? parseScreens(preview.screens)
      : parseScreens(assets.screens).length > 0
        ? parseScreens(assets.screens)
        : defaultComponentScreens(input.name, variantCount);

  const ratingSource = asRecord(preview.rating).average != null ? preview : assets;
  const ratingRaw = asRecord(ratingSource.rating);
  const rating =
    typeof ratingRaw.average === 'number'
      ? {
          average: Math.min(5, ratingRaw.average),
          count: typeof ratingRaw.count === 'number' ? ratingRaw.count : deriveRating(input.key, suggest?.priority).count,
        }
      : deriveRating(input.key, suggest?.priority);

  const reviews =
    parseReviews(preview.reviews).length > 0
      ? parseReviews(preview.reviews)
      : parseReviews(assets.reviews).length > 0
        ? parseReviews(assets.reviews)
        : CATEGORY_FALLBACK_REVIEWS[input.category] ||
          CATEGORY_FALLBACK_REVIEWS.content ||
          [];

  return {
    summary,
    longDescription,
    highlights,
    includes,
    idealFor,
    notIdealFor: asStringArray(preview.notIdealFor),
    screens,
    rating,
    reviews,
    complexity: complexityFromFields(fieldCount, variantCount),
    fieldCount,
    variantCount,
  };
}

export function starLabels(average: number): { full: number; half: boolean; empty: number } {
  const full = Math.floor(average);
  const half = average - full >= 0.4 && average - full < 0.9;
  const empty = 5 - full - (half ? 1 : 0);
  return { full, half, empty: Math.max(0, empty) };
}
