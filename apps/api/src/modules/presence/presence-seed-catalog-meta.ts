/**
 * Catalog metadata for system themes/modules: categories, variations, AI suggestJson.
 * Used by ensureSystemPresence* upserts.
 */

export type SuggestMeta = {
  orgKinds?: string[];
  pageRoles?: string[];
  siteKinds?: string[];
  useCases?: string[];
  moods?: string[];
  keywords?: string[];
  priority?: number;
  bestFor?: string[];
};

export type ModuleVariation = {
  key: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  defaultPropsJson?: Record<string, unknown>;
  previewJson?: Record<string, unknown>;
  suggestJson?: SuggestMeta;
};

/** Remap legacy seed categories onto the expanded taxonomy. */
const MODULE_CATEGORY_BY_KEY: Record<string, string> = {
  hero: 'hero',
  logo_header_strip: 'navigation',
  footer_columns: 'navigation',
  gallery: 'media',
  gallery_masonry: 'media',
  video_feature: 'media',
  embed: 'media',
  map_block: 'media',
  route_map: 'media',
  destination_grid: 'travel',
  destination_showcase: 'travel',
  package_grid: 'travel',
  featured_package: 'travel',
  itinerary_timeline: 'travel',
  hero_search: 'hero',
  split_content: 'content',
  section_heading: 'content',
  newsletter_form: 'conversion',
  offer_banner: 'conversion',
  team_profiles: 'social_proof',
  trip_inquiry: 'conversion',
  whatsapp_cta: 'conversion',
  inclusions: 'travel',
  trip_facts: 'travel',
  package_cards: 'travel',
  itinerary: 'travel',
  hotel_highlight: 'travel',
  trip_search_cta: 'travel',
  season_promo: 'travel',
  trust_badges: 'travel',
  enquiry_split: 'travel',
  feature_grid: 'content',
  feature_split: 'content',
  page_header: 'content',
  rich_text: 'content',
  faq: 'content',
  accordion: 'content',
  tabs_content: 'content',
  timeline: 'content',
  comparison_table: 'content',
  image_text_list: 'content',
  blog_cards: 'content',
  team: 'content',
  cards_carousel: 'content',
  legal_text: 'content',
  banner_slim: 'content',
  logo_cloud: 'social_proof',
  stats: 'social_proof',
  testimonials: 'social_proof',
  form: 'conversion',
  cta: 'conversion',
  widget_cta: 'conversion',
  pricing: 'conversion',
  contact_block: 'conversion',
  newsletter: 'conversion',
  container: 'layout',
  two_column: 'layout',
  columns: 'layout',
  divider: 'layout',
  liquid_banner: 'custom',
  js_stat_strip: 'custom',
};

const MODULE_SUGGEST_BY_KEY: Record<string, SuggestMeta> = {
  hero: {
    pageRoles: ['home', 'landing'],
    useCases: ['discovery', 'branding'],
    keywords: ['hero', 'banner', 'headline'],
    priority: 100,
  },
  cta: {
    pageRoles: ['home', 'contact', 'tours'],
    useCases: ['convert'],
    keywords: ['cta', 'call-to-action'],
    priority: 80,
  },
  destination_grid: {
    pageRoles: ['home', 'destinations'],
    useCases: ['discovery'],
    orgKinds: ['travel_agency', 'dmc'],
    keywords: ['destinations', 'places'],
    priority: 90,
  },
  package_cards: {
    pageRoles: ['home', 'tours', 'trips'],
    useCases: ['discovery', 'convert'],
    orgKinds: ['travel_agency', 'dmc'],
    keywords: ['packages', 'tours', 'trips'],
    priority: 90,
  },
  feature_grid: {
    pageRoles: ['home', 'about'],
    useCases: ['trust', 'branding'],
    keywords: ['features', 'benefits'],
    priority: 70,
  },
  form: {
    pageRoles: ['contact'],
    useCases: ['convert'],
    priority: 85,
  },
  testimonials: {
    pageRoles: ['home', 'about'],
    useCases: ['trust'],
    priority: 75,
  },
};

const CATEGORY_SUGGEST_DEFAULTS: Record<string, SuggestMeta> = {
  navigation: { useCases: ['branding'], priority: 40 },
  hero: { pageRoles: ['home'], useCases: ['discovery'], priority: 90 },
  layout: { useCases: ['branding'], priority: 20 },
  content: { useCases: ['discovery'], priority: 50 },
  media: { useCases: ['discovery', 'branding'], priority: 55 },
  travel: { orgKinds: ['travel_agency', 'dmc'], useCases: ['discovery'], priority: 70 },
  social_proof: { useCases: ['trust'], priority: 65 },
  conversion: { useCases: ['convert'], priority: 80 },
  custom: { priority: 30 },
};

const THEME_SUGGEST_BY_KEY: Record<string, SuggestMeta> = {
  horizon: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing', 'landing'],
    moods: ['travel', 'light'],
    bestFor: ['agency_marketing'],
    useCases: ['branding', 'discovery'],
    priority: 100,
  },
  atelier: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing'],
    moods: ['luxe', 'editorial'],
    bestFor: ['agency_marketing'],
    useCases: ['branding'],
    priority: 95,
  },
  altitude: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing', 'landing'],
    moods: ['adventure', 'outdoor'],
    bestFor: ['tour_operator'],
    useCases: ['discovery'],
    priority: 90,
  },
  wildlands: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing'],
    moods: ['safari', 'dark'],
    bestFor: ['tour_operator'],
    useCases: ['discovery'],
    priority: 85,
  },
  marigold: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing'],
    moods: ['cultural', 'warm'],
    bestFor: ['agency_marketing'],
    useCases: ['branding', 'discovery'],
    priority: 88,
  },
  coastline: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing', 'landing'],
    moods: ['beach', 'leisure'],
    bestFor: ['simple_landing', 'agency_marketing'],
    useCases: ['convert', 'branding'],
    priority: 92,
  },
  meridian: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing'],
    moods: ['corporate', 'structured'],
    bestFor: ['agency_marketing'],
    useCases: ['convert'],
    priority: 80,
  },
  localist: {
    orgKinds: ['dmc', 'homestay', 'farmstay'],
    siteKinds: ['marketing'],
    moods: ['local', 'warm'],
    bestFor: ['homestay_experience'],
    useCases: ['branding'],
    priority: 90,
  },
};

const HERO_VARIANTS: ModuleVariation[] = [
  {
    key: 'spotlight',
    name: 'Spotlight',
    description: 'Centered headline with dual CTAs on a gradient or image.',
    isDefault: true,
    defaultPropsJson: { variant: 'spotlight' },
    previewJson: { summary: 'Centered spotlight hero' },
    suggestJson: { moods: ['bold'], pageRoles: ['home'], priority: 100 },
  },
  {
    key: 'immersive',
    name: 'Immersive',
    description: 'Full-bleed photographic hero with overlay text.',
    defaultPropsJson: { variant: 'immersive' },
    previewJson: { summary: 'Immersive full-bleed hero' },
    suggestJson: { moods: ['cinematic'], pageRoles: ['home', 'landing'], priority: 90 },
  },
  {
    key: 'split',
    name: 'Split',
    description: 'Text and media side by side.',
    defaultPropsJson: { variant: 'split' },
    previewJson: { summary: 'Split text / media hero' },
    suggestJson: { moods: ['editorial'], pageRoles: ['home'], priority: 80 },
  },
  {
    key: 'minimal',
    name: 'Minimal',
    description: 'Quiet typography-first hero.',
    defaultPropsJson: { variant: 'minimal' },
    previewJson: { summary: 'Minimal typography hero' },
    suggestJson: { moods: ['minimal'], pageRoles: ['home', 'about'], priority: 70 },
  },
];

const CTA_VARIANTS: ModuleVariation[] = [
  {
    key: 'band',
    name: 'Band',
    description: 'Full-width conversion band.',
    isDefault: true,
    defaultPropsJson: { variant: 'band' },
    previewJson: { summary: 'Full-width CTA band' },
    suggestJson: { useCases: ['convert'], priority: 100 },
  },
  {
    key: 'card',
    name: 'Card',
    description: 'Contained card-style CTA.',
    defaultPropsJson: { variant: 'card' },
    previewJson: { summary: 'Card CTA' },
    suggestJson: { useCases: ['convert'], moods: ['soft'], priority: 80 },
  },
];

const FEATURE_GRID_VARIANTS: ModuleVariation[] = [
  {
    key: 'three_up',
    name: 'Three columns',
    isDefault: true,
    defaultPropsJson: { columns: '3' },
    previewJson: { summary: '3-column feature grid' },
    suggestJson: { priority: 100 },
  },
  {
    key: 'two_up',
    name: 'Two columns',
    defaultPropsJson: { columns: '2' },
    previewJson: { summary: '2-column feature grid' },
    suggestJson: { priority: 70 },
  },
  {
    key: 'four_up',
    name: 'Four columns',
    defaultPropsJson: { columns: '4' },
    previewJson: { summary: '4-column feature grid' },
    suggestJson: { priority: 60 },
  },
];

const DESTINATION_GRID_VARIANTS: ModuleVariation[] = [
  {
    key: 'grid',
    name: 'Equal grid',
    description: 'Even destination cards.',
    isDefault: true,
    defaultPropsJson: { variant: 'grid' },
    previewJson: { summary: 'Equal destination grid' },
    suggestJson: { pageRoles: ['home', 'destinations'], priority: 100 },
  },
  {
    key: 'featured',
    name: 'Featured lead',
    description: 'One large destination plus smaller cards.',
    defaultPropsJson: { variant: 'featured' },
    previewJson: { summary: 'Featured destination mosaic' },
    suggestJson: { pageRoles: ['home'], moods: ['bold'], priority: 85 },
  },
];

const PACKAGE_CARDS_VARIANTS: ModuleVariation[] = [
  {
    key: 'cards',
    name: 'Cards',
    isDefault: true,
    defaultPropsJson: { variant: 'cards' },
    previewJson: { summary: 'Package card grid' },
    suggestJson: { pageRoles: ['tours', 'trips'], priority: 100 },
  },
  {
    key: 'list',
    name: 'List',
    description: 'Compact list of packages.',
    defaultPropsJson: { variant: 'list' },
    previewJson: { summary: 'Package list' },
    suggestJson: { pageRoles: ['tours'], moods: ['minimal'], priority: 70 },
  },
];

const TRIP_INQUIRY_VARIANTS: ModuleVariation[] = [
  {
    key: 'split',
    name: 'Split form',
    description: 'Selling points beside the enquiry form.',
    isDefault: true,
    defaultPropsJson: {},
    previewJson: { summary: 'Enquiry split with form' },
    suggestJson: { pageRoles: ['contact'], useCases: ['convert'], priority: 100 },
  },
  {
    key: 'compact',
    name: 'Compact',
    description: 'Shorter copy, form-forward.',
    defaultPropsJson: {
      body: '• Reply within one business day\n• No obligation',
      formTitle: 'Quick enquiry',
    },
    previewJson: { summary: 'Compact trip enquiry' },
    suggestJson: { pageRoles: ['contact', 'tours'], priority: 80 },
  },
];

const WHATSAPP_CTA_VARIANTS: ModuleVariation[] = [
  {
    key: 'card',
    name: 'Card',
    isDefault: true,
    defaultPropsJson: {},
    previewJson: { summary: 'WhatsApp / chat card' },
    suggestJson: { useCases: ['convert'], priority: 100 },
  },
  {
    key: 'soft',
    name: 'Soft prompt',
    defaultPropsJson: {
      title: 'Questions before you enquire?',
      body: 'Message us on WhatsApp — a real person will reply.',
      label: 'Message us',
    },
    previewJson: { summary: 'Softer WhatsApp prompt' },
    suggestJson: { moods: ['soft'], priority: 80 },
  },
];

const MODULE_VARIANTS_BY_KEY: Record<string, ModuleVariation[]> = {
  hero: HERO_VARIANTS,
  cta: CTA_VARIANTS,
  feature_grid: FEATURE_GRID_VARIANTS,
  inclusions: FEATURE_GRID_VARIANTS,
  destination_grid: DESTINATION_GRID_VARIANTS,
  destination_showcase: DESTINATION_GRID_VARIANTS,
  package_cards: PACKAGE_CARDS_VARIANTS,
  package_grid: PACKAGE_CARDS_VARIANTS,
  featured_package: PACKAGE_CARDS_VARIANTS,
  trip_inquiry: TRIP_INQUIRY_VARIANTS,
  enquiry_split: TRIP_INQUIRY_VARIANTS,
  whatsapp_cta: WHATSAPP_CTA_VARIANTS,
  widget_cta: WHATSAPP_CTA_VARIANTS,
};

export function resolveModuleCategory(key: string, fallback: string): string {
  return MODULE_CATEGORY_BY_KEY[key] || fallback || 'content';
}

export function resolveModuleSuggest(
  key: string,
  category: string,
  preview?: Record<string, unknown> | null,
): SuggestMeta {
  const fromKey = MODULE_SUGGEST_BY_KEY[key] || {};
  const fromCat = CATEGORY_SUGGEST_DEFAULTS[category] || {};
  const summary = typeof preview?.summary === 'string' ? preview.summary : '';
  const keywords = summary
    ? [...(fromKey.keywords || fromCat.keywords || []), ...summary.toLowerCase().split(/\W+/).filter((w) => w.length > 3)].slice(0, 20)
    : fromKey.keywords || fromCat.keywords;
  return {
    ...fromCat,
    ...fromKey,
    ...(keywords?.length ? { keywords } : {}),
  };
}

export function resolveModuleVariants(key: string): ModuleVariation[] | null {
  return MODULE_VARIANTS_BY_KEY[key] || null;
}

export function resolveThemeSuggest(
  key: string,
  previewAssets?: Record<string, unknown> | null,
): SuggestMeta {
  const base = THEME_SUGGEST_BY_KEY[key] || {};
  const mood = typeof previewAssets?.mood === 'string' ? previewAssets.mood : null;
  const bestFor = Array.isArray(previewAssets?.bestFor)
    ? previewAssets!.bestFor.filter((x): x is string => typeof x === 'string')
    : undefined;
  const description =
    typeof previewAssets?.description === 'string' ? previewAssets.description : '';
  const keywords = description
    ? description
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4)
        .slice(0, 12)
    : undefined;
  return {
    ...base,
    moods: base.moods || (mood ? [mood] : undefined),
    bestFor: base.bestFor || bestFor,
    keywords: base.keywords || keywords,
    siteKinds: base.siteKinds || ['marketing'],
    priority: base.priority ?? 50,
  };
}

const SITE_TEMPLATE_SUGGEST_BY_KEY: Record<string, SuggestMeta> = {
  agency_marketing: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing'],
    useCases: ['branding', 'discovery'],
    bestFor: ['horizon', 'coastline', 'altitude', 'atelier'],
    keywords: ['agency', 'travel', 'destinations'],
    priority: 100,
  },
  hotel_property: {
    orgKinds: ['hotel'],
    siteKinds: ['marketing'],
    useCases: ['branding'],
    bestFor: ['atelier', 'horizon', 'localist'],
    keywords: ['hotel', 'rooms', 'hospitality'],
    priority: 95,
  },
  homestay_experience: {
    orgKinds: ['homestay', 'farmstay'],
    siteKinds: ['marketing'],
    useCases: ['branding'],
    bestFor: ['localist', 'horizon'],
    keywords: ['homestay', 'stay'],
    priority: 90,
  },
  personal_portfolio: {
    orgKinds: ['other'],
    siteKinds: ['marketing', 'landing'],
    useCases: ['branding'],
    bestFor: ['meridian', 'atelier'],
    keywords: ['portfolio', 'personal'],
    priority: 70,
  },
  simple_landing: {
    orgKinds: ['travel_agency', 'dmc', 'hotel', 'homestay'],
    siteKinds: ['landing'],
    useCases: ['convert', 'branding'],
    bestFor: ['coastline', 'horizon'],
    keywords: ['landing', 'campaign'],
    priority: 85,
  },
  tour_operator: {
    orgKinds: ['travel_agency', 'dmc'],
    siteKinds: ['marketing'],
    useCases: ['discovery', 'convert'],
    bestFor: ['altitude', 'wildlands', 'horizon'],
    keywords: ['tours', 'packages', 'operator'],
    priority: 95,
  },
};

const PAGE_TEMPLATE_SUGGEST_BY_KEY: Record<string, SuggestMeta> = {
  home_default: { pageRoles: ['home'], priority: 90 },
  home_marketing: { pageRoles: ['home', 'landing'], priority: 95 },
  contact_default: { pageRoles: ['contact'], priority: 80 },
  contact_full: { pageRoles: ['contact'], priority: 85 },
  about_page: { pageRoles: ['about', 'content'], priority: 70 },
  pricing_page: { pageRoles: ['content'], useCases: ['convert'], priority: 65 },
  blog_index: { pageRoles: ['content'], priority: 55 },
  privacy_legal: { pageRoles: ['content'], priority: 40 },
  tour_package: { pageRoles: ['tours'], priority: 85 },
  destination_page: { pageRoles: ['destinations'], priority: 85 },
};

export function resolveSiteTemplateSuggest(key: string): SuggestMeta {
  return (
    SITE_TEMPLATE_SUGGEST_BY_KEY[key] || {
      siteKinds: ['marketing'],
      priority: 50,
    }
  );
}

export function resolvePageTemplateSuggest(key: string): SuggestMeta {
  if (PAGE_TEMPLATE_SUGGEST_BY_KEY[key]) return PAGE_TEMPLATE_SUGGEST_BY_KEY[key];
  if (key.includes('home')) return { pageRoles: ['home'], priority: 70 };
  if (key.includes('contact')) return { pageRoles: ['contact'], priority: 70 };
  if (key.includes('destination')) return { pageRoles: ['destinations'], priority: 70 };
  if (key.includes('tour') || key.includes('trip') || key.includes('package')) {
    return { pageRoles: ['tours'], priority: 70 };
  }
  if (key.includes('about')) return { pageRoles: ['about'], priority: 60 };
  return { pageRoles: ['content'], priority: 40 };
}
