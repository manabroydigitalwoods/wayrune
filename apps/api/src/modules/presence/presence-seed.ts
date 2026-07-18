import { Prisma, type PrismaClient } from '@prisma/client';
import { PRESENCE_FONT_CATALOG } from '@wayrune/contracts';
import { CATALOG_V2_MODULES } from './presence-catalog-v2-modules';
import {
  CATALOG_THEME_DEFAULT_SITE_TEMPLATE,
  CATALOG_V2_THEMES,
} from './presence-catalog-v2-seed';
import { SYSTEM_SITE_TEMPLATES } from './presence-seed-site-templates';
import { EXTRA_SYSTEM_PAGE_TEMPLATES } from './presence-seed-templates-extra';
import { menusFromStructure } from './presence-menus';
import {
  resolveModuleCategory,
  resolveModuleSuggest,
  resolveModuleVariants,
  resolvePageTemplateSuggest,
  resolveSiteTemplateSuggest,
  resolveThemeSuggest,
} from './presence-seed-catalog-meta';

type Db = PrismaClient | Prisma.TransactionClient;

/** Upsert curated typography options for Display / Body dropdowns. */
export async function ensureSystemPresenceFonts(db: Db) {
  for (const font of PRESENCE_FONT_CATALOG) {
    await db.presenceFont.upsert({
      where: { key: font.key },
      create: {
        key: font.key,
        label: font.label,
        stack: font.stack,
        role: font.role,
        source: font.source,
        sortOrder: font.sortOrder,
        isActive: true,
        isSystem: true,
      },
      update: {
        label: font.label,
        stack: font.stack,
        role: font.role,
        source: font.source,
        sortOrder: font.sortOrder,
        isActive: true,
        isSystem: true,
      },
    });
  }
}

/** Each system theme ships a full default site (pages/nav) from a matching starter. */
const THEME_DEFAULT_SITE_TEMPLATE: Record<string, string> = {
  ...CATALOG_THEME_DEFAULT_SITE_TEMPLATE,
};

const DEFAULT_MENU_LOCATIONS = [
  { key: 'primary', label: 'Primary', description: 'Header nav' },
  { key: 'footer', label: 'Footer', description: 'Footer links' },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function structureWithMenus(structure: Record<string, unknown>): Record<string, unknown> {
  const menus = menusFromStructure(structure);
  return {
    ...structure,
    navigation: menus.navigationJson,
    menus: menus.menusJson,
    menuAssignments: menus.menuAssignmentsJson,
  };
}

function defaultSiteManifestForTheme(themeKey: string): Record<string, unknown> | null {
  const templateKey = THEME_DEFAULT_SITE_TEMPLATE[themeKey];
  if (!templateKey) return null;
  const template = SYSTEM_SITE_TEMPLATES.find((row) => row.key === templateKey);
  if (!template) return null;
  return {
    installSite: 'create_site',
    defaultSiteTemplateKey: templateKey,
    defaultSiteStructure: structureWithMenus(asRecord(template.structureJson)),
    menuLocations: DEFAULT_MENU_LOCATIONS,
  };
}

const SYSTEM_THEMES = CATALOG_V2_THEMES.map((theme) => {
  const assets = theme.previewAssetsJson || {};
  const thumb =
    typeof assets.thumbnail === 'string'
      ? assets.thumbnail
      : typeof assets.thumbnailPublic === 'string'
        ? assets.thumbnailPublic
        : null;
  return {
    key: theme.key,
    name: theme.name,
    status: theme.status,
    previewUrl: thumb,
    tokensJson: theme.tokensJson,
    tokensSchemaJson: theme.tokensSchemaJson,
    schemaJson: theme.schemaJson,
    layoutJson: theme.layoutJson,
    regionsJson: theme.regionsJson,
    previewAssetsJson: theme.previewAssetsJson,
  };
});

const SYSTEM_MODULES = CATALOG_V2_MODULES;


const SYSTEM_PAGE_TEMPLATES = [
  {
    key: 'home_default',
    name: 'Homepage',
    category: 'page',
    layoutKey: 'default',
    description: 'Marketing homepage using catalog modules. Pairs with Horizon or Coastline.',
    structureJson: {
      sections: [
        {
          type: 'offer_banner',
          propsJson: {
            eyebrow: 'Limited seats',
            title: 'Limited autumn departures',
            body: 'Enquire for early-bird rates.',
            ctaLabel: 'Enquire',
            ctaHref: '/contact',
          },
        },
        {
          type: 'hero',
          propsJson: {
            eyebrow: 'Welcome',
            headline: 'Introduce your brand',
            subhead: 'A clear promise, a warm tone, and one next step.',
            ctaLabel: 'Contact',
            ctaHref: '/contact',
            variant: 'immersive',
            imageUrl:
              'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=1600&q=80',
          },
        },
        {
          type: 'trip_facts',
          propsJson: {
            eyebrow: 'By the numbers',
            title: '',
            items: [
              { value: '12+', label: 'Years planning' },
              { value: '400+', label: 'Trips crafted' },
              { value: '98%', label: 'Would recommend' },
              { value: '24h', label: 'Typical reply' },
            ],
          },
        },
        {
          type: 'inclusions',
          propsJson: {
            eyebrow: 'Why us',
            title: 'What you can expect',
            body: 'Clear planning and support when it matters.',
            columns: '3',
            items: [
              { icon: '✦', title: 'Local expertise', body: 'On-ground partners who know the places you will love.' },
              { icon: '◈', title: 'Tailored plans', body: 'Itineraries shaped around your pace and budget.' },
              { icon: '◎', title: 'Calm support', body: 'A real team on call before and during your trip.' },
            ],
          },
        },
        {
          type: 'stats',
          propsJson: {
            eyebrow: 'By the numbers',
            items: [
              { value: '12+', label: 'Years planning' },
              { value: '400+', label: 'Trips crafted' },
              { value: '98%', label: 'Would recommend' },
            ],
          },
        },
        {
          type: 'gallery',
          propsJson: {
            eyebrow: 'Highlights',
            title: 'Show your world',
            images: [
              {
                url: 'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=900&q=80',
                alt: 'Highlight one',
              },
              {
                url: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=80',
                alt: 'Highlight two',
              },
            ],
          },
        },
        {
          type: 'testimonials',
          propsJson: {
            eyebrow: 'Proof',
            title: 'What clients say',
            items: [{ quote: 'Wonderful experience from enquiry to arrival.', author: 'Happy guest' }],
          },
        },
        {
          type: 'newsletter_form',
          propsJson: {
            eyebrow: 'Stay close',
            title: 'Notes in your inbox',
            body: 'Occasional ideas, never spam.',
            placeholder: 'you@email.com',
            buttonLabel: 'Subscribe',
            formKey: 'contact',
          },
        },
        {
          type: 'cta',
          propsJson: {
            title: 'Ready to begin?',
            body: 'Send a short note and we will take it from there.',
            label: 'Get in touch',
            href: '/contact',
            variant: 'band',
          },
        },
      ],
    },
  },
  {
    key: 'contact_default',
    name: 'Contact page',
    category: 'page',
    layoutKey: 'default',
    description: 'Intro plus form module.',
    structureJson: {
      sections: [
        {
          type: 'rich_text',
          propsJson: {
            eyebrow: 'Contact',
            title: 'We would love to hear from you',
            body: 'Tell us what you need — trips, rooms, or a collaboration — and the best way to reach you.',
          },
        },
        {
          type: 'form',
          propsJson: {
            title: 'Contact us',
            body: 'We typically reply within one business day.',
            formKey: 'contact',
          },
        },
      ],
    },
  },
  ...EXTRA_SYSTEM_PAGE_TEMPLATES,
] as const;

type FormPreset = {
  key: string;
  name: string;
  orgKindPreset: string;
  ingestMode: string;
  fieldsJson: Array<Record<string, unknown>>;
};

function presetsForKind(kind: string): FormPreset[] {
  const contact: FormPreset = {
    key: 'contact',
    name: 'Contact us',
    orgKindPreset: 'contact',
    ingestMode: 'contact',
    fieldsJson: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'tel', required: false },
      { name: 'message', label: 'Message', type: 'textarea', required: true },
    ],
  };

  if (kind === 'travel_agency' || kind === 'dmc') {
    return [
      {
        key: 'travel_request',
        name: 'Travel request',
        orgKindPreset: 'travel_request',
        ingestMode: 'travel_enquiry',
        fieldsJson: [
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'phone', label: 'Phone', type: 'tel', required: false },
          { name: 'destinations', label: 'Destinations', type: 'text', required: true },
          { name: 'message', label: 'Tell us about your trip', type: 'textarea', required: true },
        ],
      },
      {
        key: 'honeymoon',
        name: 'Honeymoon enquiry',
        orgKindPreset: 'honeymoon',
        ingestMode: 'travel_enquiry',
        fieldsJson: [
          { name: 'name', label: 'Couple names', type: 'text', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'phone', label: 'Phone', type: 'tel', required: false },
          { name: 'destinations', label: 'Preferred destinations', type: 'text', required: false },
          { name: 'message', label: 'Dates & preferences', type: 'textarea', required: true },
        ],
      },
      contact,
    ];
  }

  if (kind === 'hotel' || kind === 'homestay' || kind === 'farmstay') {
    return [
      {
        key: 'room_booking',
        name: 'Room booking request',
        orgKindPreset: 'room_booking',
        ingestMode: 'contact',
        fieldsJson: [
          { name: 'name', label: 'Guest name', type: 'text', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'phone', label: 'Phone', type: 'tel', required: true },
          { name: 'message', label: 'Check-in / check-out & room preference', type: 'textarea', required: true },
        ],
      },
      contact,
    ];
  }

  if (kind === 'restaurant') {
    return [
      {
        key: 'table_reservation',
        name: 'Table reservation',
        orgKindPreset: 'table_reservation',
        ingestMode: 'contact',
        fieldsJson: [
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'email', label: 'Email', type: 'email', required: false },
          { name: 'phone', label: 'Phone', type: 'tel', required: true },
          { name: 'message', label: 'Party size, date & time', type: 'textarea', required: true },
        ],
      },
      contact,
    ];
  }

  if (kind === 'car_rental' || kind === 'driver') {
    return [
      {
        key: 'vehicle_enquiry',
        name: 'Vehicle enquiry',
        orgKindPreset: 'vehicle_enquiry',
        ingestMode: 'contact',
        fieldsJson: [
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'phone', label: 'Phone', type: 'tel', required: true },
          { name: 'email', label: 'Email', type: 'email', required: false },
          { name: 'message', label: 'Route, dates & vehicle type', type: 'textarea', required: true },
        ],
      },
      contact,
    ];
  }

  return [contact];
}

export async function ensureSystemPresenceThemes(db: Db) {
  for (const theme of SYSTEM_THEMES) {
    const siteManifest = defaultSiteManifestForTheme(theme.key);
    const existing = await db.presenceTheme.findFirst({
      where: { organizationId: null, key: theme.key },
      select: { id: true },
    });
    if (existing) {
      await db.presenceTheme.update({
        where: { id: existing.id },
        data: {
          name: theme.name,
          status: theme.status,
          packageFormat: 'legacy_json',
          previewUrl: 'previewUrl' in theme ? (theme.previewUrl as string | null) : null,
          tokensJson: theme.tokensJson as Prisma.InputJsonValue,
          tokensSchemaJson: theme.tokensSchemaJson as Prisma.InputJsonValue,
          schemaJson: theme.schemaJson as Prisma.InputJsonValue,
          layoutJson: {
            menuLocations: DEFAULT_MENU_LOCATIONS,
            ...asRecord(theme.layoutJson),
          } as Prisma.InputJsonValue,
          regionsJson: theme.regionsJson as Prisma.InputJsonValue,
          previewAssetsJson: theme.previewAssetsJson as Prisma.InputJsonValue,
          suggestJson: resolveThemeSuggest(
            theme.key,
            asRecord(theme.previewAssetsJson),
          ) as Prisma.InputJsonValue,
          manifestJson: siteManifest
            ? (siteManifest as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          isSystem: true,
        },
      });
    } else {
      await db.presenceTheme.create({
        data: {
          key: theme.key,
          name: theme.name,
          isSystem: true,
          organizationId: null,
          status: theme.status,
          packageFormat: 'legacy_json',
          previewUrl: 'previewUrl' in theme ? (theme.previewUrl as string | null) : null,
          tokensJson: theme.tokensJson as Prisma.InputJsonValue,
          tokensSchemaJson: theme.tokensSchemaJson as Prisma.InputJsonValue,
          schemaJson: theme.schemaJson as Prisma.InputJsonValue,
          layoutJson: {
            menuLocations: DEFAULT_MENU_LOCATIONS,
            ...asRecord(theme.layoutJson),
          } as Prisma.InputJsonValue,
          regionsJson: theme.regionsJson as Prisma.InputJsonValue,
          previewAssetsJson: theme.previewAssetsJson as Prisma.InputJsonValue,
          suggestJson: resolveThemeSuggest(
            theme.key,
            asRecord(theme.previewAssetsJson),
          ) as Prisma.InputJsonValue,
          manifestJson: siteManifest
            ? (siteManifest as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
    }
  }
}

export async function ensureSystemPresenceModuleDefinitions(db: Db) {
  for (const moduleDef of SYSTEM_MODULES) {
    const category = resolveModuleCategory(moduleDef.key, moduleDef.category);
    const suggestJson = resolveModuleSuggest(
      moduleDef.key,
      category,
      asRecord(moduleDef.previewJson),
    );
    const variantsJson = resolveModuleVariants(moduleDef.key);
    const existing = await db.presenceModuleDefinition.findFirst({
      where: { organizationId: null, key: moduleDef.key },
      select: { id: true },
    });
    const data = {
      name: moduleDef.name,
      category,
      rendererKey: moduleDef.rendererKey,
      schemaJson: moduleDef.schemaJson as Prisma.InputJsonValue,
      defaultPropsJson: moduleDef.defaultPropsJson as Prisma.InputJsonValue,
      previewJson: moduleDef.previewJson as Prisma.InputJsonValue,
      assetsJson:
        'assetsJson' in moduleDef && moduleDef.assetsJson
          ? (moduleDef.assetsJson as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      suggestJson: suggestJson as Prisma.InputJsonValue,
      variantsJson: variantsJson
        ? (variantsJson as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      styleSchemaJson:
        'styleSchemaJson' in moduleDef && moduleDef.styleSchemaJson
          ? (moduleDef.styleSchemaJson as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      defaultStyleJson:
        'defaultStyleJson' in moduleDef && moduleDef.defaultStyleJson
          ? (moduleDef.defaultStyleJson as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      templateSource:
        'templateSource' in moduleDef && typeof moduleDef.templateSource === 'string'
          ? moduleDef.templateSource
          : null,
      moduleSource:
        'moduleSource' in moduleDef && typeof moduleDef.moduleSource === 'string'
          ? moduleDef.moduleSource
          : null,
      status: 'published' as const,
      isSystem: true,
    };
    if (existing) {
      await db.presenceModuleDefinition.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await db.presenceModuleDefinition.create({
        data: {
          organizationId: null,
          key: moduleDef.key,
          ...data,
          styleSchemaJson:
            'styleSchemaJson' in moduleDef && moduleDef.styleSchemaJson
              ? (moduleDef.styleSchemaJson as Prisma.InputJsonValue)
              : undefined,
          defaultStyleJson:
            'defaultStyleJson' in moduleDef && moduleDef.defaultStyleJson
              ? (moduleDef.defaultStyleJson as Prisma.InputJsonValue)
              : undefined,
          templateSource:
            'templateSource' in moduleDef && typeof moduleDef.templateSource === 'string'
              ? moduleDef.templateSource
              : undefined,
          moduleSource:
            'moduleSource' in moduleDef && typeof moduleDef.moduleSource === 'string'
              ? moduleDef.moduleSource
              : undefined,
          variantsJson: variantsJson
            ? (variantsJson as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
    }
  }
}

export async function ensureSystemPresenceTemplates(db: Db) {
  for (const template of SYSTEM_SITE_TEMPLATES) {
    const existing = await db.presenceSiteTemplate.findMany({
      where: { organizationId: null, key: template.key },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    const data = {
      name: template.name,
      category: template.category,
      description: template.description,
      recommendedThemeKeysJson: template.recommendedThemeKeysJson as Prisma.InputJsonValue,
      suggestJson: resolveSiteTemplateSuggest(template.key) as Prisma.InputJsonValue,
      structureJson: structureWithMenus(asRecord(template.structureJson)) as Prisma.InputJsonValue,
      status: 'published' as const,
      isSystem: true,
    };
    if (existing.length) {
      const [primary, ...dupes] = existing;
      await db.presenceSiteTemplate.update({ where: { id: primary.id }, data });
      if (dupes.length) {
        await db.presenceSiteTemplate.deleteMany({ where: { id: { in: dupes.map((row) => row.id) } } });
      }
    } else {
      await db.presenceSiteTemplate.create({
        data: {
          organizationId: null,
          key: template.key,
          ...data,
        },
      });
    }
  }

  for (const template of SYSTEM_PAGE_TEMPLATES) {
    const existing = await db.presencePageTemplate.findMany({
      where: { organizationId: null, key: template.key },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    const data = {
      name: template.name,
      category: template.category,
      description: template.description,
      layoutKey: template.layoutKey,
      suggestJson: resolvePageTemplateSuggest(template.key) as Prisma.InputJsonValue,
      structureJson: structureWithMenus(asRecord(template.structureJson)) as Prisma.InputJsonValue,
      status: 'published' as const,
      isSystem: true,
    };
    if (existing.length) {
      const [primary, ...dupes] = existing;
      await db.presencePageTemplate.update({ where: { id: primary.id }, data });
      if (dupes.length) {
        await db.presencePageTemplate.deleteMany({ where: { id: { in: dupes.map((row) => row.id) } } });
      }
    } else {
      await db.presencePageTemplate.create({
        data: {
          organizationId: null,
          key: template.key,
          ...data,
        },
      });
    }
  }
}

export async function ensureOrgPresenceFormPresets(
  db: Db,
  organizationId: string,
  kind: string,
) {
  const presets = presetsForKind(kind);
  for (const preset of presets) {
    await db.presenceFormDefinition.upsert({
      where: {
        organizationId_key: { organizationId, key: preset.key },
      },
      create: {
        organizationId,
        key: preset.key,
        name: preset.name,
        orgKindPreset: preset.orgKindPreset,
        fieldsJson: preset.fieldsJson as Prisma.InputJsonValue,
        ingestMode: preset.ingestMode,
        isActive: true,
      },
      update: {
        name: preset.name,
        orgKindPreset: preset.orgKindPreset,
        fieldsJson: preset.fieldsJson as Prisma.InputJsonValue,
        ingestMode: preset.ingestMode,
      },
    });
  }
}
