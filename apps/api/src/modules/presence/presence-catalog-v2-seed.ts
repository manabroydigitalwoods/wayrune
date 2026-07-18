/**
 * Sprint 1 catalog skeleton: 8 theme families + core travel modules.
 * Visual production deepens in later sprints; keys and tokens are stable now.
 */

import { THEME_STYLE_PRESETS } from './presence-style-presets';

export const CATALOG_THEME_FAMILIES = [
  'horizon',
  'atelier',
  'altitude',
  'wildlands',
  'marigold',
  'coastline',
  'meridian',
  'localist',
] as const;

export type CatalogThemeFamily = (typeof CATALOG_THEME_FAMILIES)[number];

export const DESIGN_TOKEN_SCHEMA = {
  version: 2,
  groups: {
    brand: ['primary', 'secondary', 'accent', 'neutral', 'success', 'warning'],
    surfaces: ['background', 'foreground', 'muted', 'surface', 'surfaceMuted', 'border'],
    shape: ['radius'],
    hero: ['heroFrom', 'heroTo'],
    type: ['fontDisplay', 'fontHeading', 'fontBody', 'fontLabel'],
  },
  recipes: ['button.primary', 'card.package', 'header', 'hero', 'form', 'sectionHeading'],
};

export type CatalogThemeSeed = {
  key: string;
  name: string;
  status: string;
  family: CatalogThemeFamily;
  stylePresets: string[];
  tokensJson: Record<string, string>;
  schemaJson: Record<string, unknown>;
  layoutJson: Record<string, unknown>;
  regionsJson: Record<string, unknown>;
  previewAssetsJson: Record<string, unknown>;
  tokensSchemaJson: Record<string, unknown>;
};

const SHARED_TOKEN_SCHEMA = {
  fields: [
    { key: 'primary', label: 'Primary', type: 'color' },
    { key: 'secondary', label: 'Secondary', type: 'color' },
    { key: 'accent', label: 'Accent', type: 'color' },
    { key: 'background', label: 'Background', type: 'color' },
    { key: 'foreground', label: 'Text', type: 'color' },
    { key: 'muted', label: 'Muted text', type: 'color' },
    { key: 'surface', label: 'Surface', type: 'color' },
    { key: 'surfaceMuted', label: 'Surface muted', type: 'color' },
    { key: 'border', label: 'Border', type: 'text' },
    { key: 'radius', label: 'Radius', type: 'text' },
    { key: 'heroFrom', label: 'Hero from', type: 'color' },
    { key: 'heroTo', label: 'Hero to', type: 'color' },
    { key: 'fontDisplay', label: 'Display font', type: 'text' },
    { key: 'fontHeading', label: 'Heading font', type: 'text' },
    { key: 'fontBody', label: 'Body font', type: 'text' },
    { key: 'fontLabel', label: 'Label font', type: 'text' },
  ],
  designSystem: DESIGN_TOKEN_SCHEMA,
};

function familyTheme(
  family: CatalogThemeFamily,
  name: string,
  tokens: Record<string, string>,
  meta: {
    stylePresets: string[];
    segment: string;
    description: string;
    bestFor: string[];
    headerVariant?: string;
    footerVariant?: string;
    /** HTTPS catalog card thumbnail */
    thumbnail?: string;
  },
): CatalogThemeSeed {
  return {
    key: family,
    name,
    status: 'published',
    family,
    stylePresets: meta.stylePresets,
    tokensJson: tokens,
    tokensSchemaJson: SHARED_TOKEN_SCHEMA,
    schemaJson: {
      family,
      stylePresets: meta.stylePresets,
      stylePresetDeltas: THEME_STYLE_PRESETS[family] || {},
      supports: ['travel', 'marketing', 'landing'],
      regions: ['header', 'footer'],
      segment: meta.segment,
    },
    layoutJson: {
      menuLocations: [
        { key: 'primary', label: 'Primary', description: 'Header nav' },
        { key: 'footer', label: 'Footer', description: 'Footer links' },
      ],
      header: {
        showNav: true,
        ctaLabel: 'Enquire',
        variant: meta.headerVariant || 'solid',
        preset: 'standard',
      },
      footer: {
        showPoweredBy: true,
        variant: meta.footerVariant || 'columns',
        preset: 'multi-column',
      },
      presets: {
        style: meta.stylePresets[0],
        header: 'standard',
        footer: 'multi-column',
        hero: 'full-bleed',
        card: 'rounded',
        type: 'default',
      },
    },
    regionsJson: {
      header: { variant: meta.headerVariant || 'travel' },
      footer: { variant: meta.footerVariant || 'travel' },
    },
    previewAssetsJson: {
      mood: meta.segment,
      label: name,
      description: meta.description,
      bestFor: meta.bestFor,
      family,
      stylePresets: meta.stylePresets,
      incomplete: !THEME_STYLE_PRESETS[family],
      ...(meta.thumbnail
        ? { thumbnail: meta.thumbnail, thumbnailPublic: meta.thumbnail }
        : {}),
    },
  };
}

/** Sprint 1: Horizon + Atelier fully tokenized; other families are directional shells. */
export const CATALOG_V2_THEMES: CatalogThemeSeed[] = [
  familyTheme(
    'horizon',
    'Horizon',
    {
      primary: '#0f766e',
      secondary: '#134e4a',
      accent: '#0ea5a4',
      neutral: '#64748b',
      success: '#15803d',
      warning: '#b45309',
      background: '#f4faf9',
      foreground: '#0b1f1c',
      muted: '#5b736e',
      surface: '#ffffff',
      surfaceMuted: '#e7f3f1',
      border: 'rgba(15, 118, 110, 0.14)',
      radius: '14px',
      heroFrom: '#0f766e',
      heroTo: '#134e4a',
      fontDisplay: 'Fraunces, Georgia, serif',
      fontHeading: 'Fraunces, Georgia, serif',
      fontBody: '"DM Sans", system-ui, sans-serif',
      fontLabel: '"DM Sans", system-ui, sans-serif',
    },
    {
      stylePresets: ['ocean', 'sunset', 'forest', 'urban'],
      segment: 'general_agency',
      description:
        'Modern universal travel agency — bright destination imagery, rounded cards, clear inquiry actions.',
      bestFor: ['agency_marketing', 'tour_operator', 'family_holidays'],
      thumbnail:
        'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80',
    },
  ),
  familyTheme(
    'atelier',
    'Atelier',
    {
      primary: '#1c1917',
      secondary: '#44403c',
      accent: '#a8a29e',
      neutral: '#78716c',
      success: '#3f6212',
      warning: '#92400e',
      background: '#faf9f6',
      foreground: '#1c1917',
      muted: '#78716c',
      surface: '#ffffff',
      surfaceMuted: '#f0ebe3',
      border: 'rgba(28, 25, 23, 0.1)',
      radius: '8px',
      heroFrom: '#1c1917',
      heroTo: '#44403c',
      fontDisplay: '"Cormorant Garamond", Georgia, serif',
      fontHeading: '"Cormorant Garamond", Georgia, serif',
      fontBody: 'Outfit, system-ui, sans-serif',
      fontLabel: 'Outfit, system-ui, sans-serif',
    },
    {
      stylePresets: ['ivory', 'ink', 'champagne', 'slate'],
      segment: 'luxury',
      description:
        'Luxury tailor-made travel — editorial serif, generous whitespace, concierge-style inquiry.',
      bestFor: ['luxury', 'bespoke', 'honeymoon_premium'],
      thumbnail:
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
      headerVariant: 'transparent',
      footerVariant: 'editorial',
    },
  ),
  familyTheme(
    'altitude',
    'Altitude',
    {
      primary: '#3f6212',
      secondary: '#365314',
      accent: '#ca8a04',
      neutral: '#6b7280',
      success: '#15803d',
      warning: '#b45309',
      background: '#f7f6f2',
      foreground: '#1a1a18',
      muted: '#6b7280',
      surface: '#ffffff',
      surfaceMuted: '#eceae4',
      border: 'rgba(63, 98, 18, 0.18)',
      radius: '10px',
      heroFrom: '#365314',
      heroTo: '#1c1917',
      fontDisplay: '"Barlow Condensed", system-ui, sans-serif',
      fontHeading: '"Barlow Condensed", system-ui, sans-serif',
      fontBody: 'Inter, system-ui, sans-serif',
      fontLabel: 'Inter, system-ui, sans-serif',
    },
    {
      stylePresets: ['trail', 'summit', 'camp'],
      segment: 'adventure',
      description: 'Adventure and trekking — bold type, earth tones, strong action hierarchy.',
      bestFor: ['trekking', 'expeditions', 'outdoor'],
      thumbnail:
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
    },
  ),
  familyTheme(
    'wildlands',
    'Wildlands',
    {
      primary: '#14532d',
      secondary: '#052e16',
      accent: '#b45309',
      neutral: '#a8a29e',
      success: '#166534',
      warning: '#c2410c',
      background: '#0c0a09',
      foreground: '#fafaf9',
      muted: '#a8a29e',
      surface: '#1c1917',
      surfaceMuted: '#292524',
      border: 'rgba(250, 250, 249, 0.12)',
      radius: '6px',
      heroFrom: '#052e16',
      heroTo: '#1c1917',
      fontDisplay: '"Libre Baskerville", Georgia, serif',
      fontHeading: '"Libre Baskerville", Georgia, serif',
      fontBody: 'Source Sans 3, system-ui, sans-serif',
      fontLabel: 'Source Sans 3, system-ui, sans-serif',
    },
    {
      stylePresets: ['savanna', 'dusk', 'reserve'],
      segment: 'safari',
      description: 'Safari and wildlife — immersive media, dark natural palette, editorial trip cards.',
      bestFor: ['safari', 'wildlife', 'eco'],
      thumbnail:
        'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80',
    },
  ),
  familyTheme(
    'marigold',
    'Marigold',
    {
      primary: '#c2410c',
      secondary: '#9a3412',
      accent: '#ca8a04',
      neutral: '#78716c',
      success: '#15803d',
      warning: '#b45309',
      background: '#fffbeb',
      foreground: '#1c1917',
      muted: '#78716c',
      surface: '#ffffff',
      surfaceMuted: '#fef3c7',
      border: 'rgba(194, 65, 12, 0.16)',
      radius: '12px',
      heroFrom: '#9a3412',
      heroTo: '#78350f',
      fontDisplay: '"Playfair Display", Georgia, serif',
      fontHeading: '"Playfair Display", Georgia, serif',
      fontBody: '"Nunito Sans", system-ui, sans-serif',
      fontLabel: '"Nunito Sans", system-ui, sans-serif',
    },
    {
      stylePresets: ['spice', 'lotus', 'heritage'],
      segment: 'india_cultural',
      description: 'India and cultural travel — warm modern palette, regional storytelling, WhatsApp-first.',
      bestFor: ['india_dmc', 'cultural', 'pilgrimage'],
      thumbnail:
        'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?auto=format&fit=crop&w=1200&q=80',
    },
  ),
  familyTheme(
    'coastline',
    'Coastline',
    {
      primary: '#0369a1',
      secondary: '#0c4a6e',
      accent: '#f472b6',
      neutral: '#64748b',
      success: '#0f766e',
      warning: '#c2410c',
      background: '#f0f9ff',
      foreground: '#0c4a6e',
      muted: '#64748b',
      surface: '#ffffff',
      surfaceMuted: '#e0f2fe',
      border: 'rgba(3, 105, 161, 0.14)',
      radius: '16px',
      heroFrom: '#0ea5e9',
      heroTo: '#0369a1',
      fontDisplay: '"Libre Franklin", system-ui, sans-serif',
      fontHeading: '"Libre Franklin", system-ui, sans-serif',
      fontBody: '"Libre Franklin", system-ui, sans-serif',
      fontLabel: '"Libre Franklin", system-ui, sans-serif',
    },
    {
      stylePresets: ['lagoon', 'coral', 'breeze'],
      segment: 'leisure',
      description: 'Beach and honeymoon — soft palette, airy layouts, romantic media.',
      bestFor: ['beach', 'honeymoon', 'islands'],
      thumbnail:
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    },
  ),
  familyTheme(
    'meridian',
    'Meridian',
    {
      primary: '#1e3a8a',
      secondary: '#1e293b',
      accent: '#0f766e',
      neutral: '#64748b',
      success: '#15803d',
      warning: '#b45309',
      background: '#f8fafc',
      foreground: '#0f172a',
      muted: '#64748b',
      surface: '#ffffff',
      surfaceMuted: '#e2e8f0',
      border: 'rgba(15, 23, 42, 0.12)',
      radius: '6px',
      heroFrom: '#1e3a8a',
      heroTo: '#0f172a',
      fontDisplay: 'Inter, system-ui, sans-serif',
      fontHeading: 'Inter, system-ui, sans-serif',
      fontBody: 'Inter, system-ui, sans-serif',
      fontLabel: 'Inter, system-ui, sans-serif',
    },
    {
      stylePresets: ['boardroom', 'incentive', 'congress'],
      segment: 'corporate_mice',
      description: 'Corporate and MICE — structured grid, metrics, lead qualification forms.',
      bestFor: ['corporate', 'mice', 'groups'],
      thumbnail:
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    },
  ),
  familyTheme(
    'localist',
    'Localist',
    {
      primary: '#0f766e',
      secondary: '#115e59',
      accent: '#ea580c',
      neutral: '#57534e',
      success: '#15803d',
      warning: '#c2410c',
      background: '#fafaf9',
      foreground: '#1c1917',
      muted: '#57534e',
      surface: '#ffffff',
      surfaceMuted: '#f5f5f4',
      border: 'rgba(28, 25, 23, 0.1)',
      radius: '12px',
      heroFrom: '#115e59',
      heroTo: '#292524',
      fontDisplay: '"Source Serif 4", Georgia, serif',
      fontHeading: '"Source Serif 4", Georgia, serif',
      fontBody: '"Source Sans 3", system-ui, sans-serif',
      fontLabel: '"Source Sans 3", system-ui, sans-serif',
    },
    {
      stylePresets: ['harbor', 'highland', 'market'],
      segment: 'dmc_local',
      description: 'DMC and destination specialist — maps, local expertise, experience grids.',
      bestFor: ['inbound_dmc', 'local_experiences', 'guides'],
      thumbnail:
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=80',
    },
  ),
];

export const CATALOG_V2_THEME_TOKEN_SCHEMA = SHARED_TOKEN_SCHEMA;

/** Canonical module keys for Sprint 1 (~25). Existing renderers kept via aliases where needed. */
export const CATALOG_V2_MODULE_KEYS = [
  'hero',
  'hero_search',
  'section_heading',
  'rich_text',
  'split_content',
  'destination_showcase',
  'destination_grid',
  'package_grid',
  'featured_package',
  'itinerary_timeline',
  'inclusions',
  'trip_facts',
  'gallery',
  'stats',
  'testimonials',
  'faq',
  'form',
  'trip_inquiry',
  'cta',
  'whatsapp_cta',
  'newsletter_form',
  'offer_banner',
  'team_profiles',
  'container',
  'two_column',
  'columns',
] as const;

export type CatalogV2ModuleKey = (typeof CATALOG_V2_MODULE_KEYS)[number];

/** Default site starter per theme family (existing template keys). */
export const CATALOG_THEME_DEFAULT_SITE_TEMPLATE: Record<string, string> = {
  horizon: 'agency_marketing',
  atelier: 'agency_marketing',
  altitude: 'tour_operator',
  wildlands: 'tour_operator',
  marigold: 'agency_marketing',
  coastline: 'simple_landing',
  meridian: 'agency_marketing',
  localist: 'homestay_experience',
};
