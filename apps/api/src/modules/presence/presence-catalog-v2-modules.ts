/**
 * Sprint 1 canonical module definitions (~26 keys).
 * rendererKey points at existing HTML renderers; section type uses the catalog key
 * and presence-catalog-compat aliases bridge at runtime.
 */
import { MODULE_RENDERER_ALIASES } from './presence-catalog-compat';
import { EXTRA_SYSTEM_MODULES } from './presence-seed-modules-extra';

type ModuleSeed = {
  key: string;
  name: string;
  category: string;
  rendererKey: string;
  schemaJson: unknown;
  defaultPropsJson: Record<string, unknown>;
  previewJson: Record<string, unknown>;
  assetsJson?: Record<string, unknown>;
  styleSchemaJson?: unknown;
  defaultStyleJson?: unknown;
  templateSource?: string;
  moduleSource?: string;
};

const EXTRA_BY_KEY: Map<string, ModuleSeed> = new Map(
  EXTRA_SYSTEM_MODULES.map((m) => [String(m.key), m as unknown as ModuleSeed]),
);

function fromExtra(
  catalogKey: string,
  sourceKey: string,
  name: string,
  category: string,
): ModuleSeed {
  const source = EXTRA_BY_KEY.get(String(sourceKey));
  if (!source) {
    throw new Error(`Missing extra module source: ${sourceKey}`);
  }
  const rendererKey =
    MODULE_RENDERER_ALIASES[String(catalogKey)] ?? String(source.rendererKey);
  return {
    key: catalogKey,
    name,
    category,
    rendererKey,
    schemaJson: source.schemaJson,
    defaultPropsJson: { ...source.defaultPropsJson },
    previewJson: { ...source.previewJson, catalogKey, sourceKey },
  };
}

const LAYOUT_STYLE = [
  { key: 'padding', label: 'Padding', type: 'text' },
  { key: 'background', label: 'Background', type: 'color' },
  { key: 'cssClass', label: 'CSS class', type: 'text' },
];

/** Core modules defined inline (not in extras). */
const CORE_CATALOG_MODULES: ModuleSeed[] = [
  {
    key: 'hero',
    name: 'Hero',
    category: 'hero',
    rendererKey: 'hero',
    schemaJson: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'headline', label: 'Headline', type: 'text', required: true },
      { key: 'subhead', label: 'Subhead', type: 'textarea' },
      { key: 'imageUrl', label: 'Background image', type: 'url' },
      { key: 'ctaLabel', label: 'CTA label', type: 'text' },
      { key: 'ctaHref', label: 'CTA href', type: 'url' },
      { key: 'secondaryCtaLabel', label: 'Secondary CTA label', type: 'text' },
      { key: 'secondaryCtaHref', label: 'Secondary CTA href', type: 'url' },
      {
        key: 'variant',
        label: 'Variant',
        type: 'select',
        options: [
          { value: 'spotlight', label: 'Spotlight' },
          { value: 'immersive', label: 'Immersive' },
          { value: 'split', label: 'Split' },
          { value: 'minimal', label: 'Minimal' },
        ],
      },
    ],
    defaultPropsJson: {
      eyebrow: 'Welcome',
      headline: 'Your journey starts here',
      subhead: 'Craft memorable trips with a site that feels like your brand.',
      ctaLabel: 'Enquire',
      ctaHref: '/contact',
      secondaryCtaLabel: 'Browse trips',
      secondaryCtaHref: '/packages',
      variant: 'immersive',
    },
    previewJson: { summary: 'Full-bleed travel hero' },
  },
  {
    key: 'rich_text',
    name: 'Rich text',
    category: 'content',
    rendererKey: 'rich_text',
    schemaJson: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea', required: true },
    ],
    defaultPropsJson: {
      eyebrow: 'Our story',
      title: 'Travel, thoughtfully planned',
      body: 'Share the destinations you love, the trips you craft, and why travellers trust you.',
    },
    previewJson: { summary: 'Story / prose block' },
  },
  {
    key: 'faq',
    name: 'FAQ',
    category: 'content',
    rendererKey: 'faq',
    schemaJson: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'items', label: 'FAQ items', type: 'list', required: true },
    ],
    defaultPropsJson: {
      eyebrow: 'Helpful answers',
      title: 'Frequently asked questions',
      items: [
        { q: 'How do I enquire?', a: 'Use the form or WhatsApp — we usually reply within a day.' },
        { q: 'Can you customise dates?', a: 'Yes. Tell us your preferences and we will shape options.' },
      ],
    },
    previewJson: { summary: 'Question / answer cards' },
  },
  {
    key: 'form',
    name: 'Form',
    category: 'conversion',
    rendererKey: 'form',
    schemaJson: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Intro', type: 'textarea' },
      { key: 'formKey', label: 'Form key', type: 'select', required: true },
    ],
    defaultPropsJson: {
      eyebrow: 'Contact',
      title: 'Tell us what you need',
      body: 'Share a few details and we will get back to you shortly.',
      formKey: 'contact',
    },
    previewJson: { summary: 'Lead capture form' },
  },
  {
    key: 'testimonials',
    name: 'Testimonials',
    category: 'social_proof',
    rendererKey: 'testimonials',
    schemaJson: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'items', label: 'Testimonials', type: 'list' },
    ],
    defaultPropsJson: {
      eyebrow: 'Traveller stories',
      title: 'What people say',
      items: [
        { quote: 'Thoughtful planning from start to finish.', author: 'A. Traveller' },
        { quote: 'Felt personal, never rushed.', author: 'Guest family' },
      ],
    },
    previewJson: { summary: 'Quote cards' },
  },
  {
    key: 'cta',
    name: 'Call to action',
    category: 'conversion',
    rendererKey: 'cta',
    schemaJson: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'label', label: 'Button label', type: 'text' },
      { key: 'href', label: 'Button href', type: 'url' },
      {
        key: 'variant',
        label: 'Variant',
        type: 'select',
        options: [
          { value: 'band', label: 'Band' },
          { value: 'card', label: 'Card' },
        ],
      },
    ],
    defaultPropsJson: {
      eyebrow: 'Next step',
      title: 'Ready when you are',
      body: 'Tell us a little about your plans and we will take it from there.',
      label: 'Enquire now',
      href: '/contact',
      variant: 'band',
    },
    previewJson: { summary: 'Full-width CTA band' },
  },
  {
    key: 'whatsapp_cta',
    name: 'WhatsApp CTA',
    category: 'conversion',
    rendererKey: 'widget_cta',
    schemaJson: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'label', label: 'Button label', type: 'text' },
      { key: 'href', label: 'WhatsApp / chat link', type: 'url' },
    ],
    defaultPropsJson: {
      title: 'Prefer WhatsApp?',
      body: 'Send a quick message — we usually reply within a few hours.',
      label: 'Chat on WhatsApp',
      href: '#',
    },
    previewJson: { summary: 'WhatsApp / chat prompt' },
  },
  {
    key: 'gallery',
    name: 'Gallery',
    category: 'media',
    rendererKey: 'gallery',
    schemaJson: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'images', label: 'Images', type: 'list' },
    ],
    defaultPropsJson: {
      eyebrow: 'Look inside',
      title: 'Gallery',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=900&q=80',
          alt: 'Coastal overlook',
        },
        {
          url: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=80',
          alt: 'Resort pool',
        },
      ],
    },
    previewJson: { summary: 'Image mosaic' },
  },
  {
    key: 'container',
    name: 'Container',
    category: 'layout',
    rendererKey: 'container',
    schemaJson: [
      {
        key: 'flexDirection',
        label: 'Direction',
        type: 'select',
        options: [
          { value: 'column', label: 'Vertical' },
          { value: 'row', label: 'Horizontal' },
        ],
      },
      { key: 'gap', label: 'Gap', type: 'text' },
      { key: 'padding', label: 'Padding', type: 'text' },
    ],
    defaultPropsJson: {
      flexDirection: 'column',
      gap: '1rem',
      padding: '1.5rem 0',
    },
    styleSchemaJson: LAYOUT_STYLE,
    defaultStyleJson: {},
    previewJson: { summary: 'Flex stack for nested modules' },
  },
  {
    key: 'two_column',
    name: 'Two columns',
    category: 'layout',
    rendererKey: 'two_column',
    schemaJson: [{ key: 'gap', label: 'Gap', type: 'text' }],
    defaultPropsJson: { gap: '1.5rem' },
    styleSchemaJson: LAYOUT_STYLE,
    defaultStyleJson: {},
    previewJson: { summary: 'Left / right columns' },
  },
  {
    key: 'columns',
    name: 'Columns',
    category: 'layout',
    rendererKey: 'columns',
    schemaJson: [
      {
        key: 'columnCount',
        label: 'Columns',
        type: 'select',
        options: [
          { value: '2', label: '2' },
          { value: '3', label: '3' },
          { value: '4', label: '4' },
        ],
      },
      { key: 'gap', label: 'Gap', type: 'text' },
    ],
    defaultPropsJson: { columnCount: '3', gap: '1.25rem' },
    styleSchemaJson: LAYOUT_STYLE,
    defaultStyleJson: {},
    previewJson: { summary: 'Responsive multi-column grid' },
  },
];

const FROM_EXTRA: ModuleSeed[] = [
  fromExtra('stats', 'stats', 'Stats strip', 'social_proof'),
  fromExtra('destination_grid', 'destination_grid', 'Destination grid', 'travel'),
  fromExtra('destination_showcase', 'destination_grid', 'Destination showcase', 'travel'),
  fromExtra('package_grid', 'package_cards', 'Package grid', 'travel'),
  fromExtra('featured_package', 'package_cards', 'Featured package', 'travel'),
  fromExtra('itinerary_timeline', 'itinerary', 'Itinerary timeline', 'travel'),
  fromExtra('hero_search', 'trip_search_cta', 'Hero search', 'hero'),
  fromExtra('split_content', 'feature_split', 'Split content', 'content'),
  fromExtra('section_heading', 'page_header', 'Section heading', 'content'),
  fromExtra('newsletter_form', 'newsletter', 'Newsletter form', 'conversion'),
  fromExtra('offer_banner', 'season_promo', 'Offer banner', 'conversion'),
  fromExtra('team_profiles', 'team', 'Team profiles', 'social_proof'),
  fromExtra('trip_inquiry', 'enquiry_split', 'Trip inquiry', 'conversion'),
  fromExtra('inclusions', 'feature_grid', 'Inclusions', 'travel'),
  fromExtra('trip_facts', 'stats', 'Trip facts', 'travel'),
];

/** Catalog card thumbnails — every system module key gets one. */
const MODULE_THUMBNAILS: Record<string, string> = {
  hero: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=80',
  hero_search:
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80',
  section_heading:
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80',
  rich_text:
    'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80',
  split_content:
    'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?auto=format&fit=crop&w=900&q=80',
  destination_showcase:
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
  destination_grid:
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=900&q=80',
  package_grid:
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=900&q=80',
  featured_package:
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
  itinerary_timeline:
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80',
  inclusions:
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
  trip_facts:
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80',
  gallery:
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=80',
  stats:
    'https://images.unsplash.com/photo-1551281049-2b9c8d5f0b5a?auto=format&fit=crop&w=900&q=80',
  testimonials:
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80',
  faq: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
  form: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80',
  trip_inquiry:
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80',
  cta: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80',
  whatsapp_cta:
    'https://images.unsplash.com/photo-1611746872915-64382b5c76da?auto=format&fit=crop&w=900&q=80',
  newsletter_form:
    'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=900&q=80',
  offer_banner:
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=80',
  team_profiles:
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80',
  container:
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80',
  two_column:
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
  columns:
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=900&q=80',
};

export const CATALOG_V2_MODULES: ModuleSeed[] = [...CORE_CATALOG_MODULES, ...FROM_EXTRA].map(
  (mod) => {
    const thumb = MODULE_THUMBNAILS[mod.key];
    if (!thumb) return mod;
    return {
      ...mod,
      previewJson: {
        ...mod.previewJson,
        thumbnail: thumb,
        image: thumb,
      },
      assetsJson: {
        ...(mod.assetsJson || {}),
        thumbnail: thumb,
      },
    };
  },
);
