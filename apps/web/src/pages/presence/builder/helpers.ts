import type { CSSProperties } from 'react';
import type { FormDef, FreeformFrame, Identity, ListItemField, SchemaField, Section, DeviceMode } from './types';

export function newClientId() {
  return `sec_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function ensureSectionClientIds(
  sections: Array<Omit<Section, 'clientId'> & { clientId?: string; id?: string }>,
): Section[] {
  return sections.map((section, index) => ({
    ...section,
    clientId: section.clientId || section.id || newClientId(),
    position: section.position ?? index,
    propsJson: section.propsJson || {},
  }));
}

export function publicPageUrl(identity: Identity | null, path: string) {
  if (!identity?.subdomain) return null;
  const host = identity.customDomain
    ? identity.customDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    : `${identity.subdomain}.${identity.siteBaseDomain}`;
  return `${sitePublicOrigin(host)}${path === '/' ? '' : path}`;
}

export function normalizeSiteDomainInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

/** http(s) origin for a public site host (local uses http + Vite port). */
export function sitePublicOrigin(host: string): string {
  const h = normalizePublicHost(host);
  const isLocal =
    import.meta.env.VITE_APP_ENV === 'local' ||
    h.endsWith('.localhost') ||
    h === 'localhost';
  if (isLocal) {
    const port =
      (typeof window !== 'undefined' && window.location.port) ||
      import.meta.env.VITE_WEB_PORT ||
      '5173';
    const portPart = port && port !== '80' ? `:${port}` : '';
    return `http://${h}${portPart}`;
  }
  return `https://${h}`;
}

/**
 * In local, rewrite stale `*.codepoetry.app` hosts onto SITE_BASE_DOMAIN
 * (usually `codepoetry.localhost`) so links open without DNS.
 */
export function normalizePublicHost(host: string): string {
  const h = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  if (import.meta.env.VITE_APP_ENV !== 'local') return h;
  const localBase = (import.meta.env.VITE_SITE_BASE_DOMAIN || 'codepoetry.localhost')
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
  if (!localBase || h.endsWith(`.${localBase}`) || h === localBase) return h;
  // Common stale API default before restart
  if (h === 'codepoetry.app' || h.endsWith('.codepoetry.app')) {
    return `${h.slice(0, -'codepoetry.app'.length)}${localBase}`;
  }
  return h;
}

/** Default platform hostname before a custom domain is connected. */
export function sitePlatformHost(
  identity: Identity | null,
  site: { isPrimary?: boolean; platformSlug?: string | null; platformHost?: string | null },
): string | null {
  if (site.platformHost) return normalizePublicHost(site.platformHost);
  const base =
    import.meta.env.VITE_APP_ENV === 'local'
      ? import.meta.env.VITE_SITE_BASE_DOMAIN || identity?.siteBaseDomain
      : identity?.siteBaseDomain;
  if (!base) {
    if (site.isPrimary && identity?.subdomain) {
      return normalizePublicHost(`${identity.subdomain}.${identity.siteBaseDomain}`);
    }
    return null;
  }
  if (identity?.publicCode == null) {
    if (site.isPrimary && identity?.subdomain) {
      return normalizePublicHost(`${identity.subdomain}.${base}`);
    }
    return null;
  }
  if (site.isPrimary) return normalizePublicHost(`${identity.publicCode}.${base}`);
  if (site.platformSlug) {
    return normalizePublicHost(`${site.platformSlug}.${identity.publicCode}.${base}`);
  }
  return null;
}

/** Public URL for a website (custom domain, or platform host). */
export function sitePublicUrl(
  identity: Identity | null,
  site: {
    primaryDomain?: string | null;
    isPrimary?: boolean;
    platformSlug?: string | null;
    platformHost?: string | null;
  },
  path = '/',
): string | null {
  const custom = site.primaryDomain?.trim();
  if (custom) {
    const host = custom.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `${sitePublicOrigin(host)}${path === '/' ? '' : path}`;
  }
  const host = sitePlatformHost(identity, site);
  if (!host) return null;
  return `${sitePublicOrigin(host)}${path === '/' ? '' : path}`;
}

/** Host label shown in UI for a website. */
export function siteHostLabel(
  identity: Identity | null,
  site: {
    primaryDomain?: string | null;
    isPrimary?: boolean;
    platformSlug?: string | null;
    platformHost?: string | null;
  },
): string {
  const custom = site.primaryDomain?.trim();
  if (custom) return custom.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return sitePlatformHost(identity, site) || '';
}

function presenceApiAbsoluteBase() {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api/v1';
  return apiBase.startsWith('http')
    ? apiBase
    : `${window.location.origin}${apiBase.startsWith('/') ? '' : '/'}${apiBase}`;
}

export function previewRendererUrl(
  identity: Identity | null,
  path: string,
  cacheBust?: string | number | null,
  site?: {
    primaryDomain?: string | null;
    isPrimary?: boolean;
    platformSlug?: string | null;
    platformHost?: string | null;
  } | null,
) {
  const host = site ? siteHostLabel(identity, site) : null;
  const fallbackHost =
    identity?.customDomain ||
    (identity?.subdomain ? `${identity.subdomain}.${identity.siteBaseDomain}` : null);
  const resolvedHost = host || fallbackHost;
  if (!resolvedHost) return null;
  const abs = presenceApiAbsoluteBase();
  const v = cacheBust != null && cacheBust !== '' ? `&v=${encodeURIComponent(String(cacheBust))}` : '';
  return `${abs}/presence/public?host=${encodeURIComponent(resolvedHost)}&path=${encodeURIComponent(path)}&preview=1${v}`;
}

/** Authenticated catalog preview of a theme’s built-in starter pages. */
export function themeStarterPreviewUrl(themeId: string, path = '/') {
  const abs = presenceApiAbsoluteBase();
  return `${abs}/presence/themes/${encodeURIComponent(themeId)}/preview?path=${encodeURIComponent(path)}`;
}

type SiteHostInput = {
  primaryDomain?: string | null;
  isPrimary?: boolean;
  platformSlug?: string | null;
  platformHost?: string | null;
};

/**
 * Auth-free public media URL on the website host (same subdomain/custom domain
 * as the live site). No ERP origin and no `?host=` query.
 */
export function presencePublicMediaUrl(
  identity: Identity | null,
  documentId: string,
  site?: SiteHostInput | null,
) {
  const host = site
    ? siteHostLabel(identity, site)
    : identity?.customDomain ||
      (identity?.subdomain ? `${identity.subdomain}.${identity.siteBaseDomain}` : null);
  if (!host) return null;
  return `${sitePublicOrigin(host)}/api/v1/presence/public/media/${encodeURIComponent(documentId)}`;
}

export function normalizePath(path: string) {
  const trimmed = path.trim() || '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function defaultModuleProps(key: string, forms: FormDef[]) {
  if (key === 'form') {
    return {
      eyebrow: 'Contact',
      title: forms[0]?.name || 'Contact us',
      body: 'Share a few details and we will get back to you shortly.',
      formKey: forms[0]?.key || 'contact',
    };
  }
  if (key === 'hero') {
    return {
      eyebrow: 'Welcome',
      headline: 'Your journey starts here',
      subhead: 'Craft memorable stays and trips with a site that feels like your brand.',
      ctaLabel: 'Get in touch',
      ctaHref: '/contact',
      secondaryCtaLabel: 'Learn more',
      secondaryCtaHref: '/about',
      variant: 'spotlight',
    };
  }
  if (key === 'rich_text') {
    return {
      eyebrow: 'Our story',
      title: 'Designed around people',
      body: 'Share the story behind your brand — destinations you love, rooms you host, or work you create.',
    };
  }
  if (key === 'faq') {
    return {
      eyebrow: 'Helpful answers',
      title: 'Frequently asked questions',
      items: [
        { q: 'How do I enquire?', a: 'Use the contact form or chat widget — we usually reply within a day.' },
        { q: 'Can you customise?', a: 'Yes. Tell us your preferences and we will shape an option around them.' },
      ],
    };
  }
  if (key === 'gallery') {
    return {
      eyebrow: 'Look inside',
      title: 'Gallery',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=900&q=80',
          alt: 'Gallery image',
        },
        {
          url: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=80',
          alt: 'Gallery image',
        },
        {
          url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
          alt: 'Gallery image',
        },
      ],
    };
  }
  if (key === 'testimonials') {
    return {
      eyebrow: 'Social proof',
      title: 'What people say',
      items: [
        { quote: 'Thoughtful planning and warm hospitality from start to finish.', author: 'A. Traveller' },
        { quote: 'Felt personal, never rushed — exactly what we hoped for.', author: 'Guest family' },
      ],
    };
  }
  if (key === 'widget_cta') {
    return {
      title: 'Prefer to chat?',
      body: 'Ask a quick question — our conversation widget is always a tap away.',
      label: 'Open chat',
      href: '#',
    };
  }
  if (key === 'container') {
    return {
      flexDirection: 'column',
      gap: '1rem',
      alignItems: 'stretch',
      justifyContent: 'flex-start',
      flexWrap: 'nowrap',
      padding: '1.5rem 0',
    };
  }
  if (key === 'two_column') {
    return { gap: '1.5rem' };
  }
  if (key === 'columns') {
    return { columnCount: '3', gap: '1.25rem' };
  }
  if (key === 'liquid') {
    return {
      templateSource: '<section class="prose-block">\n  <h2 class="section-title">{{ props.title }}</h2>\n  <p>{{ props.body }}</p>\n</section>',
    };
  }
  if (key === 'js_module') {
    return {
      moduleSource: 'function render({ props, theme }) {\n  return `<section class="prose-block"><h2 class="section-title">${props.title || \'Custom module\'}</h2></section>`;\n}',
    };
  }
  return {
    eyebrow: 'Next step',
    title: 'Ready when you are',
    body: 'Tell us a little about your plans and we will take it from there.',
    label: 'Get in touch',
    href: '/contact',
    variant: 'band',
  };
}

export function asSchemaFields(schema: Array<Record<string, unknown>> | null | undefined): SchemaField[] {
  if (!Array.isArray(schema)) return [];
  return schema
    .map((field) => ({
      key: String(field.key || ''),
      label: String(field.label || field.key || ''),
      type: String(field.type || 'text'),
      required: field.required === true,
      helpText: typeof field.helpText === 'string' ? field.helpText : null,
      options: Array.isArray(field.options)
        ? (field.options as Array<Record<string, unknown>>)
            .map((opt) => ({
              value: String(opt.value || ''),
              label: String(opt.label || opt.value || ''),
            }))
            .filter((opt) => opt.value)
        : undefined,
      defaultValue: field.defaultValue,
    }))
    .filter((field) => field.key);
}

export function listItemFieldsFor(
  rendererKey: string,
  fieldKey: string,
): ListItemField[] {
  if (fieldKey === 'items' && rendererKey === 'faq') {
    return [
      { key: 'q', label: 'Question', type: 'text' },
      { key: 'a', label: 'Answer', type: 'textarea' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'testimonials') {
    return [
      { key: 'quote', label: 'Quote', type: 'textarea' },
      { key: 'author', label: 'Author', type: 'text' },
    ];
  }
  if (fieldKey === 'images' || (fieldKey === 'items' && rendererKey === 'gallery')) {
    return [
      { key: 'url', label: 'Image URL', type: 'url' },
      { key: 'alt', label: 'Alt text', type: 'text' },
    ];
  }
  if (fieldKey === 'images' && rendererKey === 'gallery_masonry') {
    return [
      { key: 'url', label: 'Image URL', type: 'url' },
      { key: 'alt', label: 'Alt text', type: 'text' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'logo_cloud') {
    return [
      { key: 'url', label: 'Logo URL', type: 'url' },
      { key: 'alt', label: 'Alt / name', type: 'text' },
      { key: 'href', label: 'Link', type: 'url' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'stats') {
    return [
      { key: 'value', label: 'Value', type: 'text' },
      { key: 'label', label: 'Label', type: 'text' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'feature_grid') {
    return [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'trust_badges') {
    return [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'pricing') {
    return [
      { key: 'name', label: 'Plan name', type: 'text' },
      { key: 'price', label: 'Price', type: 'text' },
      { key: 'features', label: 'Features (one per line)', type: 'textarea' },
      { key: 'ctaLabel', label: 'CTA label', type: 'text' },
      { key: 'ctaHref', label: 'CTA link', type: 'url' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'team') {
    return [
      { key: 'photo', label: 'Photo URL', type: 'url' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'bio', label: 'Bio', type: 'textarea' },
    ];
  }
  if (fieldKey === 'items' && (rendererKey === 'blog_cards' || rendererKey === 'cards_carousel')) {
    return [
      { key: 'image', label: 'Image', type: 'url' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'href', label: 'Link', type: 'url' },
    ];
  }
  if (fieldKey === 'items' && (rendererKey === 'tabs_content' || rendererKey === 'accordion')) {
    return [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ];
  }
  if (fieldKey === 'items' && (rendererKey === 'timeline' || rendererKey === 'route_map' || rendererKey === 'image_text_list')) {
    return [
      { key: 'image', label: 'Image', type: 'url' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ];
  }
  if (fieldKey === 'rows' && rendererKey === 'comparison_table') {
    return [{ key: 'cells', label: 'Cells (comma-separated)', type: 'text' }];
  }
  if (fieldKey === 'items' && rendererKey === 'destination_grid') {
    return [
      { key: 'image', label: 'Image', type: 'url' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'tagline', label: 'Tagline', type: 'text' },
      { key: 'href', label: 'Link', type: 'url' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'package_cards') {
    return [
      { key: 'image', label: 'Image', type: 'url' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'price', label: 'Price', type: 'text' },
      { key: 'nights', label: 'Nights', type: 'text' },
      { key: 'highlights', label: 'Highlights (one per line)', type: 'textarea' },
      { key: 'ctaLabel', label: 'CTA label', type: 'text' },
      { key: 'ctaHref', label: 'CTA link', type: 'url' },
    ];
  }
  if (fieldKey === 'items' && rendererKey === 'itinerary') {
    return [
      { key: 'day', label: 'Day', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ];
  }
  return [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'value', label: 'Value', type: 'text' },
  ];
}

export function emptyListItem(fields: ListItemField[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of fields) row[field.key] = '';
  return row;
}

export function snapshotPage(page: {
  title: string;
  path: string;
  layoutKey?: string | null;
  layoutMode?: 'flow' | 'freeform' | null;
  seoJson?: Record<string, unknown> | null;
  sections: Section[];
}) {
  return JSON.stringify({
    title: page.title,
    path: normalizePath(page.path),
    layoutKey: page.layoutKey || null,
    layoutMode: page.layoutMode || 'flow',
    seoJson: page.seoJson || {},
    sections: page.sections.map((section) => ({
      type: section.type,
      moduleDefinitionId: section.moduleDefinitionId || null,
      parentId: section.parentId || null,
      slotKey: section.slotKey || null,
      propsJson: section.propsJson,
      position: section.position,
    })),
  });
}

/** Renderer keys that host nested children instead of rendering leaf content directly. */
const LAYOUT_MODULE_TYPES = new Set(['container', 'two_column', 'columns']);

export function isLayoutModule(type: string) {
  return LAYOUT_MODULE_TYPES.has(type);
}

export function clampColumnCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.min(6, Math.max(2, Math.round(n)));
}

export function columnSlotKeys(columnCount: unknown): string[] {
  return Array.from({ length: clampColumnCount(columnCount) }, (_, i) => `col-${i}`);
}

export function defaultLayoutSlotKey(type: string, props?: Record<string, unknown> | null): string | null {
  if (type === 'two_column') return 'left';
  if (type === 'columns') return 'col-0';
  return null;
}

export function layoutSlotKeysForSection(section: { type: string; propsJson?: Record<string, unknown> | null }): Array<string | null> {
  if (section.type === 'two_column') return ['left', 'right'];
  if (section.type === 'columns') return columnSlotKeys(section.propsJson?.columnCount);
  if (section.type === 'container') return [null];
  return [];
}

/** Flex/grid layout styles mirrored from the public runtime. */
export function layoutBoxStyle(type: string, props: Record<string, unknown>): CSSProperties {
  const gap = typeof props.gap === 'string' && props.gap ? props.gap : undefined;
  if (type === 'container') {
    return {
      display: 'flex',
      flexDirection:
        props.flexDirection === 'row' ||
        props.flexDirection === 'row-reverse' ||
        props.flexDirection === 'column-reverse'
          ? (props.flexDirection as CSSProperties['flexDirection'])
          : 'column',
      gap: gap || '1rem',
      alignItems:
        typeof props.alignItems === 'string' && props.alignItems
          ? (props.alignItems as CSSProperties['alignItems'])
          : undefined,
      justifyContent:
        typeof props.justifyContent === 'string' && props.justifyContent
          ? (props.justifyContent as CSSProperties['justifyContent'])
          : undefined,
      flexWrap:
        props.flexWrap === 'wrap' || props.flexWrap === 'wrap-reverse'
          ? (props.flexWrap as CSSProperties['flexWrap'])
          : 'nowrap',
    };
  }
  if (type === 'two_column') {
    return {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: gap || '1.5rem',
    };
  }
  if (type === 'columns') {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${clampColumnCount(props.columnCount)}, minmax(0, 1fr))`,
      gap: gap || '1.25rem',
    };
  }
  return {};
}

export function rootSections(sections: Section[]): Section[] {
  return sections.filter((section) => !section.parentId);
}

export function childrenOf(
  sections: Section[],
  parentClientId: string,
  slotKey?: string | null,
): Section[] {
  return sections.filter((section) => {
    if (section.parentId !== parentClientId) return false;
    if (slotKey === undefined) return true;
    return (section.slotKey || null) === (slotKey || null);
  });
}

/** Ancestor chain from root → parent of `clientId` (does not include the section itself). */
export function ancestorChain(sections: Section[], clientId: string): Section[] {
  const byId = new Map(sections.map((section) => [section.clientId, section]));
  const chain: Section[] = [];
  let current = byId.get(clientId);
  while (current?.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

/** Collect a section and all of its descendants (for copy / duplicate). */
export function collectSubtree(sections: Section[], rootClientId: string): Section[] {
  const ids = new Set<string>([rootClientId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const section of sections) {
      if (section.parentId && ids.has(section.parentId) && !ids.has(section.clientId)) {
        ids.add(section.clientId);
        grew = true;
      }
    }
  }
  return sections.filter((section) => ids.has(section.clientId));
}

/** True if `candidateAncestorId` is `clientId` itself or one of its ancestors — used to block cycles when nesting. */
export function isDescendantOf(
  sections: Section[],
  clientId: string,
  candidateAncestorId: string,
): boolean {
  let current = sections.find((section) => section.clientId === candidateAncestorId);
  while (current) {
    if (current.clientId === clientId) return true;
    if (!current.parentId) break;
    current = sections.find((section) => section.clientId === current!.parentId);
  }
  return false;
}

/**
 * Moves (or reorders) a section within the flat sections array so that its relative order among
 * its new siblings (same parentId + slotKey) reflects `targetIndex`. Only the relative order within
 * that sibling group matters for the `position` field the backend persists.
 */
export function moveSectionInTree(
  sections: Section[],
  clientId: string,
  newParentId: string | null,
  newSlotKey: string | null,
  targetIndex: number,
): Section[] {
  const moving = sections.find((section) => section.clientId === clientId);
  if (!moving) return sections;
  const without = sections.filter((section) => section.clientId !== clientId);
  const updated: Section = { ...moving, parentId: newParentId, slotKey: newSlotKey };
  const siblingIndices: number[] = [];
  without.forEach((section, index) => {
    if ((section.parentId || null) === (newParentId || null) && (section.slotKey || null) === (newSlotKey || null)) {
      siblingIndices.push(index);
    }
  });
  let insertAt: number;
  if (!siblingIndices.length) {
    insertAt = without.length;
  } else if (targetIndex >= siblingIndices.length) {
    insertAt = siblingIndices[siblingIndices.length - 1]! + 1;
  } else {
    insertAt = siblingIndices[Math.max(0, targetIndex)]!;
  }
  without.splice(insertAt, 0, updated);
  return without.map((section, index) => ({ ...section, position: index }));
}

/** Style fields shared by every module — mirrors the backend's SHARED_STYLE_FIELDS. */
export const SHARED_STYLE_FIELDS: SchemaField[] = [
  {
    key: 'boxWidth',
    label: 'Box width',
    type: 'select',
    options: [
      { value: 'content', label: 'Content (narrow)' },
      { value: 'wide', label: 'Wide' },
      { value: 'full', label: 'Full width' },
    ],
    helpText: 'How wide the module sits in the page column',
  },
  {
    key: 'contentAlign',
    label: 'Content position',
    type: 'select',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ],
    helpText: 'Horizontal alignment when the box is narrower than the page',
  },
  { key: 'padding', label: 'Padding', type: 'text', helpText: 'CSS padding, e.g. 1rem or 12px 16px' },
  { key: 'margin', label: 'Margin', type: 'text', helpText: 'CSS margin, e.g. 0 auto' },
  { key: 'background', label: 'Background', type: 'color' },
  { key: 'textColor', label: 'Text color', type: 'color' },
  { key: 'borderRadius', label: 'Border radius', type: 'text', helpText: 'e.g. 12px' },
  { key: 'borderWidth', label: 'Border width', type: 'text', helpText: 'e.g. 1px' },
  {
    key: 'borderStyle',
    label: 'Border style',
    type: 'select',
    options: [
      { value: 'none', label: 'None' },
      { value: 'solid', label: 'Solid' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' },
    ],
  },
  { key: 'borderColor', label: 'Border color', type: 'color' },
  { key: 'boxShadow', label: 'Shadow', type: 'text', helpText: 'CSS box-shadow' },
  { key: 'fontSize', label: 'Font size', type: 'text', helpText: 'e.g. 1rem or 16px' },
  {
    key: 'fontWeight',
    label: 'Font weight',
    type: 'select',
    options: [
      { value: '400', label: 'Regular' },
      { value: '500', label: 'Medium' },
      { value: '600', label: 'Semibold' },
      { value: '700', label: 'Bold' },
    ],
  },
  { key: 'lineHeight', label: 'Line height', type: 'text', helpText: 'e.g. 1.5' },
  { key: 'letterSpacing', label: 'Letter spacing', type: 'text', helpText: 'e.g. 0.02em' },
  {
    key: 'textAlign',
    label: 'Text align',
    type: 'select',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
      { value: 'justify', label: 'Justify' },
    ],
  },
  { key: 'cssClass', label: 'CSS class', type: 'text', helpText: 'Extra class name(s) for advanced styling' },
];

export function styleInlineProps(props: Record<string, unknown>): CSSProperties {
  const style: CSSProperties = {};
  if (typeof props.padding === 'string' && props.padding) style.padding = props.padding;
  if (typeof props.margin === 'string' && props.margin) style.margin = props.margin;
  if (typeof props.background === 'string' && props.background) {
    style.background = props.background;
    // Modules like .hero set their own background; CSS vars let them opt into the override.
    (style as Record<string, string>)['--presence-section-bg'] = props.background;
  }
  if (typeof props.textColor === 'string' && props.textColor) {
    style.color = props.textColor;
    // Modules like .hero force color:#fff; var lets module CSS inherit the Styles panel value.
    (style as Record<string, string>)['--presence-section-color'] = props.textColor;
  }
  if (typeof props.borderRadius === 'string' && props.borderRadius) style.borderRadius = props.borderRadius;
  if (typeof props.borderWidth === 'string' && props.borderWidth) style.borderWidth = props.borderWidth;
  if (typeof props.borderStyle === 'string' && props.borderStyle) style.borderStyle = props.borderStyle as CSSProperties['borderStyle'];
  if (typeof props.borderColor === 'string' && props.borderColor) style.borderColor = props.borderColor;
  if (typeof props.boxShadow === 'string' && props.boxShadow) style.boxShadow = props.boxShadow;
  if (typeof props.fontSize === 'string' && props.fontSize) style.fontSize = props.fontSize;
  if (typeof props.fontWeight === 'string' && props.fontWeight) style.fontWeight = props.fontWeight;
  if (typeof props.lineHeight === 'string' && props.lineHeight) style.lineHeight = props.lineHeight;
  if (typeof props.letterSpacing === 'string' && props.letterSpacing) style.letterSpacing = props.letterSpacing;
  if (typeof props.textAlign === 'string' && props.textAlign) style.textAlign = props.textAlign as CSSProperties['textAlign'];
  if (props.hidden === true) style.display = 'none';
  return style;
}

/** Style keys that can vary per breakpoint (desktop = root props; tablet/mobile = props.responsive). */
export const RESPONSIVE_STYLE_KEYS = [
  'padding',
  'margin',
  'background',
  'textColor',
  'borderRadius',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'boxShadow',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'boxWidth',
  'contentAlign',
  'hidden',
] as const;

export type ResponsiveStyleKey = (typeof RESPONSIVE_STYLE_KEYS)[number];

export type CssBoxSides = { top: string; right: string; bottom: string; left: string };

/** Parse CSS padding/margin shorthand into four sides. */
export function parseCssBox(value: unknown): CssBoxSides {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { top: '', right: '', bottom: '', left: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const v = parts[0]!;
    return { top: v, right: v, bottom: v, left: v };
  }
  if (parts.length === 2) {
    return { top: parts[0]!, right: parts[1]!, bottom: parts[0]!, left: parts[1]! };
  }
  if (parts.length === 3) {
    return { top: parts[0]!, right: parts[1]!, bottom: parts[2]!, left: parts[1]! };
  }
  return {
    top: parts[0] || '',
    right: parts[1] || '',
    bottom: parts[2] || '',
    left: parts[3] || '',
  };
}

/** Compose four sides into the shortest valid CSS padding/margin shorthand. */
export function composeCssBox(sides: CssBoxSides): string {
  const t = sides.top.trim();
  const r = sides.right.trim();
  const b = sides.bottom.trim();
  const l = sides.left.trim();
  if (!t && !r && !b && !l) return '';
  const top = t || '0';
  const right = r || '0';
  const bottom = b || '0';
  const left = l || '0';
  if (top === right && right === bottom && bottom === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  if (right === left) return `${top} ${right} ${bottom}`;
  return `${top} ${right} ${bottom} ${left}`;
}

export type ThemeTokenSwatch = {
  key: string;
  label: string;
  /** CSS var usable in builder canvas (and mirrored public vars). */
  cssVar: string;
};

export const THEME_TOKEN_SWATCHES: ThemeTokenSwatch[] = [
  { key: 'primary', label: 'Primary', cssVar: 'var(--presence-primary)' },
  { key: 'accent', label: 'Accent', cssVar: 'var(--presence-accent)' },
  { key: 'background', label: 'Background', cssVar: 'var(--presence-bg)' },
  { key: 'foreground', label: 'Text', cssVar: 'var(--presence-fg)' },
  { key: 'muted', label: 'Muted', cssVar: 'var(--presence-muted)' },
  { key: 'surface', label: 'Surface', cssVar: 'var(--presence-surface)' },
  { key: 'heroFrom', label: 'Hero from', cssVar: 'var(--presence-hero-from)' },
  { key: 'heroTo', label: 'Hero to', cssVar: 'var(--presence-hero-to)' },
];

export function responsiveBucketOf(
  props: Record<string, unknown>,
  device: 'tablet' | 'mobile',
): Record<string, unknown> {
  const responsive =
    props.responsive && typeof props.responsive === 'object' && !Array.isArray(props.responsive)
      ? (props.responsive as Record<string, unknown>)
      : {};
  const bucket = responsive[device];
  return bucket && typeof bucket === 'object' && !Array.isArray(bucket)
    ? (bucket as Record<string, unknown>)
    : {};
}

/** Merge desktop style props with the active device override for canvas preview. */
export function effectiveStyleProps(
  props: Record<string, unknown>,
  device: DeviceMode = 'desktop',
): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const key of RESPONSIVE_STYLE_KEYS) {
    if (key in props) base[key] = props[key];
  }
  // Widescreen uses the same style bucket as desktop (viewport-only difference).
  if (device === 'desktop' || device === 'widescreen') return base;
  return { ...base, ...responsiveBucketOf(props, device) };
}

export function setStylePropForDevice(
  props: Record<string, unknown>,
  device: DeviceMode,
  key: string,
  value: unknown,
): Record<string, unknown> {
  if (device === 'desktop' || device === 'widescreen') {
    return { ...props, [key]: value };
  }
  const responsive =
    props.responsive && typeof props.responsive === 'object' && !Array.isArray(props.responsive)
      ? { ...(props.responsive as Record<string, unknown>) }
      : {};
  const bucket = {
    ...(responsive[device] && typeof responsive[device] === 'object' && !Array.isArray(responsive[device])
      ? (responsive[device] as Record<string, unknown>)
      : {}),
    [key]: value,
  };
  return { ...props, responsive: { ...responsive, [device]: bucket } };
}

export function clearResponsiveDevice(
  props: Record<string, unknown>,
  device: 'tablet' | 'mobile',
): Record<string, unknown> {
  const responsive =
    props.responsive && typeof props.responsive === 'object' && !Array.isArray(props.responsive)
      ? { ...(props.responsive as Record<string, unknown>) }
      : {};
  delete responsive[device];
  const next = { ...props };
  if (Object.keys(responsive).length) next.responsive = responsive;
  else delete next.responsive;
  return next;
}

export type ComponentRef = {
  templateId: string;
  key: string;
  name?: string;
  version?: string;
};

export function componentRefOf(props: Record<string, unknown>): ComponentRef | null {
  const raw = props.componentRef;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.templateId !== 'string' || typeof row.key !== 'string') return null;
  return {
    templateId: row.templateId,
    key: row.key,
    name: typeof row.name === 'string' ? row.name : undefined,
    version: typeof row.version === 'string' ? row.version : undefined,
  };
}

/** Remap a section subtree to new clientIds with a null parent on the root (for component insert). */
export function remapSubtreeForInsert(
  subtree: Section[],
  rootClientId: string,
  parentId: string | null,
  slotKey: string | null,
): Section[] {
  const idMap = new Map<string, string>();
  for (const row of subtree) idMap.set(row.clientId, newClientId());
  return subtree.map((row) => ({
    ...row,
    id: undefined,
    clientId: idMap.get(row.clientId)!,
    parentId:
      row.clientId === rootClientId
        ? parentId
        : row.parentId
          ? idMap.get(row.parentId) || null
          : null,
    slotKey: row.clientId === rootClientId ? slotKey : row.slotKey || null,
    propsJson: JSON.parse(JSON.stringify(row.propsJson || {})),
  }));
}

/** Serialize subtree with stable local ids (root parentId null) for component templates. */
export function serializeSubtreeForComponent(sections: Section[], rootClientId: string): Section[] {
  const subtree = collectSubtree(sections, rootClientId);
  const idMap = new Map<string, string>();
  let i = 0;
  for (const row of subtree) {
    idMap.set(row.clientId, `c${i++}`);
  }
  return subtree.map((row) => ({
    ...row,
    id: undefined,
    clientId: idMap.get(row.clientId)!,
    parentId:
      row.clientId === rootClientId
        ? null
        : row.parentId
          ? idMap.get(row.parentId) || null
          : null,
    propsJson: JSON.parse(JSON.stringify(row.propsJson || {})),
  }));
}

/** Default box width for modules that look wrong when left-stuck at content size. */
export function defaultBoxWidth(type: string): 'content' | 'wide' | 'full' {
  if (type === 'form' || type === 'liquid' || type === 'js_module') return 'content';
  return 'full';
}

export function defaultContentAlign(type: string): 'left' | 'center' | 'right' {
  if (type === 'form' || type === 'cta' || type === 'widget_cta') return 'center';
  return 'left';
}

export function sectionLayoutClass(
  type: string,
  props: Record<string, unknown>,
): string {
  const width =
    props.boxWidth === 'content' || props.boxWidth === 'wide' || props.boxWidth === 'full'
      ? props.boxWidth
      : defaultBoxWidth(type);
  const align =
    props.contentAlign === 'left' || props.contentAlign === 'center' || props.contentAlign === 'right'
      ? props.contentAlign
      : defaultContentAlign(type);
  return `presence-section-shell presence-section-shell--${width} presence-section-shell--align-${align}`;
}

/** Prefixed sortable ids so structure panel and canvas can share one DndContext. */
export function canvasSortableId(clientId: string) {
  return `canvas:${clientId}`;
}

export function structureSortableId(clientId: string) {
  return `structure:${clientId}`;
}

export function parseSectionClientId(dndId: string | number | null | undefined): string | null {
  if (dndId == null) return null;
  const id = String(dndId);
  if (id.startsWith('canvas:')) return id.slice('canvas:'.length);
  if (id.startsWith('structure:')) return id.slice('structure:'.length);
  if (id.startsWith('module:') || id.startsWith('slot:') || id === 'canvas-drop') return null;
  // legacy / raw client ids
  if (id.startsWith('sec_') || id.startsWith('__')) return id;
  return id;
}


export const DEFAULT_FREEFORM_FRAME: FreeformFrame = { x: 20, y: 20, w: 360, h: 200, z: 1, unit: 'px' };

export const FREEFORM_SNAP_THRESHOLD = 8;

export type FreeformSnapGuide = { axis: 'x' | 'y'; value: number };

function asFramePartial(value: unknown): FreeformFrame['mobile'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const out: NonNullable<FreeformFrame['mobile']> = {};
  if (typeof row.x === 'number') out.x = row.x;
  if (typeof row.y === 'number') out.y = row.y;
  if (typeof row.w === 'number') out.w = row.w;
  if (typeof row.h === 'number') out.h = row.h;
  if (typeof row.z === 'number') out.z = row.z;
  if (row.unit === '%' || row.unit === 'px') out.unit = row.unit;
  return Object.keys(out).length ? out : undefined;
}

/** Full stored frame (includes optional tablet/mobile overrides). */
export function freeformFrameStored(props: Record<string, unknown>): FreeformFrame {
  const frame =
    props.frame && typeof props.frame === 'object' ? (props.frame as Record<string, unknown>) : {};
  return {
    x: Number(frame.x ?? DEFAULT_FREEFORM_FRAME.x),
    y: Number(frame.y ?? DEFAULT_FREEFORM_FRAME.y),
    w: Number(frame.w ?? DEFAULT_FREEFORM_FRAME.w),
    h: Number(frame.h ?? DEFAULT_FREEFORM_FRAME.h),
    z: Number(frame.z ?? DEFAULT_FREEFORM_FRAME.z ?? 1),
    unit: frame.unit === '%' ? '%' : 'px',
    tablet: asFramePartial(frame.tablet),
    mobile: asFramePartial(frame.mobile),
    mobileScale: typeof frame.mobileScale === 'number' ? frame.mobileScale : undefined,
  };
}

export function resolveFreeformFrame(
  frame: FreeformFrame,
  device: DeviceMode = 'desktop',
): FreeformFrame {
  if (device === 'desktop' || device === 'widescreen') return frame;
  const override = device === 'mobile' ? frame.mobile : frame.tablet;
  if (override) {
    return {
      ...frame,
      x: override.x ?? frame.x,
      y: override.y ?? frame.y,
      w: override.w ?? frame.w,
      h: override.h ?? frame.h,
      z: override.z ?? frame.z,
      unit: override.unit ?? frame.unit,
    };
  }
  if (device === 'mobile' && typeof frame.mobileScale === 'number' && frame.mobileScale > 0) {
    const s = frame.mobileScale;
    return {
      ...frame,
      x: Math.round(frame.x * s),
      y: Math.round(frame.y * s),
      w: Math.round(frame.w * s),
      h: Math.round(frame.h * s),
    };
  }
  return frame;
}

/** Resolved frame for the active device preview (chrome / inspector). */
export function freeformFrameOf(
  props: Record<string, unknown>,
  device: DeviceMode = 'desktop',
): FreeformFrame {
  return resolveFreeformFrame(freeformFrameStored(props), device);
}

/** Write drag/resize result back into the correct breakpoint slot. */
export function writeFreeformFrameForDevice(
  stored: FreeformFrame,
  device: DeviceMode,
  next: FreeformFrame,
): FreeformFrame {
  if (device === 'desktop' || device === 'widescreen') {
    return {
      x: next.x,
      y: next.y,
      w: next.w,
      h: next.h,
      z: next.z,
      unit: next.unit || 'px',
      tablet: stored.tablet,
      mobile: stored.mobile,
      mobileScale: stored.mobileScale,
    };
  }
  const partial = {
    x: next.x,
    y: next.y,
    w: next.w,
    h: next.h,
    z: next.z,
    unit: (next.unit || 'px') as 'px' | '%',
  };
  if (device === 'mobile') return { ...stored, mobile: partial };
  return { ...stored, tablet: partial };
}

/** Snap a moving/resizing frame to stage edges and sibling frames. */
export function snapFreeformFrame(
  frame: FreeformFrame,
  opts: {
    siblings: FreeformFrame[];
    stageWidth?: number;
    stageHeight?: number;
    threshold?: number;
  },
): { frame: FreeformFrame; guides: FreeformSnapGuide[] } {
  const threshold = opts.threshold ?? FREEFORM_SNAP_THRESHOLD;
  const stageW = opts.stageWidth ?? 960;
  const stageH = opts.stageHeight ?? 640;
  let { x, y, w, h } = frame;
  const guides: FreeformSnapGuide[] = [];

  const xTargets = [0, stageW / 2, stageW];
  const yTargets = [0, stageH / 2, stageH];
  for (const sib of opts.siblings) {
    xTargets.push(sib.x, sib.x + sib.w / 2, sib.x + sib.w);
    yTargets.push(sib.y, sib.y + sib.h / 2, sib.y + sib.h);
  }

  const edgesX = [
    { value: x, apply: (t: number) => { x = t; } },
    { value: x + w / 2, apply: (t: number) => { x = t - w / 2; } },
    { value: x + w, apply: (t: number) => { x = t - w; } },
  ];
  const edgesY = [
    { value: y, apply: (t: number) => { y = t; } },
    { value: y + h / 2, apply: (t: number) => { y = t - h / 2; } },
    { value: y + h, apply: (t: number) => { y = t - h; } },
  ];

  for (const edge of edgesX) {
    for (const target of xTargets) {
      if (Math.abs(edge.value - target) <= threshold) {
        edge.apply(target);
        guides.push({ axis: 'x', value: target });
        break;
      }
    }
  }
  for (const edge of edgesY) {
    for (const target of yTargets) {
      if (Math.abs(edge.value - target) <= threshold) {
        edge.apply(target);
        guides.push({ axis: 'y', value: target });
        break;
      }
    }
  }

  return {
    frame: { ...frame, x: Math.round(x), y: Math.round(y), w, h, unit: 'px' },
    guides,
  };
}

export function nudgeFreeformZ(frame: FreeformFrame, direction: 'forward' | 'back'): FreeformFrame {
  const z = frame.z ?? 1;
  return {
    ...frame,
    z: direction === 'forward' ? z + 1 : Math.max(0, z - 1),
  };
}

type ClientSectionLike = { clientId: string; id?: string | null; parentId?: string | null; slotKey?: string | null };
type ServerSectionLike = { id?: string | null; parentId?: string | null; slotKey?: string | null };

/**
 * After a save, the backend echoes sections with real server ids but no `clientId`. This walks both
 * trees level-by-level (root first, then each resolved parent's children) to rebuild a
 * serverId → clientId map, relying on the fact that relative sibling order within any
 * (parentId, slotKey) group is preserved between the request and the response.
 */
export function reconcileSectionClientIds(
  requestSections: ClientSectionLike[],
  responseSections: ServerSectionLike[],
): Map<string, string> {
  const result = new Map<string, string>();
  const groupKey = (parentRef: string | null, slot: string | null) => `${parentRef ?? ''}\u0000${slot ?? ''}`;
  const resolvedParentServerId = new Map<string | null, string | null>([[null, null]]);
  const processedGroups = new Set<string>();
  let frontier: Array<string | null> = [null];

  while (frontier.length) {
    const nextFrontier: Array<string | null> = [];
    for (const parentRef of frontier) {
      const parentServerId = resolvedParentServerId.get(parentRef) ?? null;
      const slots = new Set<string | null>();
      for (const section of requestSections) {
        if ((section.parentId || null) === parentRef) slots.add(section.slotKey || null);
      }
      for (const slot of slots) {
        const key = groupKey(parentRef, slot);
        if (processedGroups.has(key)) continue;
        processedGroups.add(key);
        const reqGroup = requestSections.filter(
          (section) => (section.parentId || null) === parentRef && (section.slotKey || null) === slot,
        );
        const resGroup = responseSections.filter(
          (section) => (section.parentId || null) === parentServerId && (section.slotKey || null) === slot,
        );
        const len = Math.min(reqGroup.length, resGroup.length);
        for (let i = 0; i < len; i += 1) {
          const reqRow = reqGroup[i]!;
          const resRow = resGroup[i]!;
          if (!resRow.id) continue;
          result.set(resRow.id, reqRow.clientId);
          resolvedParentServerId.set(reqRow.clientId, resRow.id);
          if (reqRow.id) resolvedParentServerId.set(reqRow.id, resRow.id);
          nextFrontier.push(reqRow.clientId);
        }
      }
    }
    frontier = nextFrontier;
  }
  return result;
}

export function freeformFrameStyle(frame: FreeformFrame | null | undefined): CSSProperties {
  if (!frame) return {};
  const unit = frame.unit || 'px';
  return {
    position: 'absolute',
    left: `${frame.x}${unit}`,
    top: `${frame.y}${unit}`,
    width: `${frame.w}${unit}`,
    minHeight: `${frame.h}${unit}`,
    height: 'auto',
    overflow: 'visible',
    zIndex: frame.z ?? 1,
  };
}
