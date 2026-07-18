#!/usr/bin/env node
/**
 * Wayrune catalog CLI — backup / reset / seed / validate / smoke.
 *
 * Default reset: purge ALL org Presence trees, wipe system catalog, reseed v2 skeleton.
 *
 * Usage:
 *   pnpm wr:catalog:backup
 *   pnpm wr:catalog:reset -- --dry-run
 *   pnpm wr:catalog:reset -- --yes
 *   pnpm wr:catalog:seed
 *   pnpm wr:catalog:validate
 *   pnpm wr:catalog:smoke
 *
 * Legacy aliases: pnpm presence:catalog:*
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { bootstrapEnv } from '@wayrune/config';
import {
  ensureOrgPresenceFormPresets,
  ensureSystemPresenceModuleDefinitions,
  ensureSystemPresenceTemplates,
  ensureSystemPresenceThemes,
} from '../../apps/api/src/modules/presence/presence-seed';
import {
  CATALOG_THEME_FAMILIES,
  CATALOG_V2_MODULE_KEYS,
} from '../../apps/api/src/modules/presence/presence-catalog-v2-seed';
import { MODULE_KEY_MAP, THEME_KEY_MAP } from '../../apps/api/src/modules/presence/presence-catalog-compat';

bootstrapEnv();

const prisma = new PrismaClient();

type Flags = {
  dryRun: boolean;
  yes: boolean;
  orgIds: string[];
  purgeOrgPresence: boolean;
  replaceSystemOnly: boolean;
  preserveLegacy: boolean;
  seedDemoSites: boolean;
  command: string;
};

function parseArgs(argv: string[]): Flags {
  const args = argv.slice(2).filter((a) => a !== '--');
  const command = args.find((a) => !a.startsWith('-')) || 'help';
  const has = (f: string) => args.includes(f);
  const orgIds = args
    .filter((a) => a.startsWith('--org='))
    .map((a) => a.slice('--org='.length))
    .filter(Boolean);
  return {
    command,
    dryRun: has('--dry-run'),
    yes: has('--yes'),
    orgIds,
    purgeOrgPresence: !has('--replace-system-only') && !has('--no-purge-org-presence'),
    replaceSystemOnly: has('--replace-system-only'),
    preserveLegacy: has('--preserve-legacy'),
    seedDemoSites: has('--seed-demo-sites'),
  };
}

function log(msg: string) {
  console.log(`[presence-catalog] ${msg}`);
}

async function countPresence() {
  const [
    sites,
    themes,
    modules,
    siteTemplates,
    pageTemplates,
    forms,
    reviews,
    assetVersions,
    listings,
  ] = await Promise.all([
    prisma.presenceSite.count(),
    prisma.presenceTheme.count(),
    prisma.presenceModuleDefinition.count(),
    prisma.presenceSiteTemplate.count(),
    prisma.presencePageTemplate.count(),
    prisma.presenceFormDefinition.count(),
    prisma.presenceCatalogReview.count(),
    prisma.presenceAssetVersion.count(),
    prisma.presenceMarketplaceListing.count(),
  ]);
  return {
    sites,
    themes,
    modules,
    siteTemplates,
    pageTemplates,
    forms,
    reviews,
    assetVersions,
    listings,
  };
}

async function backup(flags: Flags) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(process.cwd(), 'tmp', 'presence-catalog-backups', stamp);
  if (flags.dryRun) {
    log(`dry-run: would write backup to ${dir}`);
    log(JSON.stringify(await countPresence(), null, 2));
    return;
  }
  mkdirSync(dir, { recursive: true });

  const [
    themes,
    modules,
    siteTemplates,
    pageTemplates,
    sites,
    forms,
    reviews,
  ] = await Promise.all([
    prisma.presenceTheme.findMany(),
    prisma.presenceModuleDefinition.findMany(),
    prisma.presenceSiteTemplate.findMany(),
    prisma.presencePageTemplate.findMany(),
    prisma.presenceSite.findMany({
      include: {
        pages: { include: { sections: true } },
        globalSections: true,
        collections: { include: { entries: true } },
        publishVersions: true,
        analyticsEvents: true,
      },
    }),
    prisma.presenceFormDefinition.findMany(),
    prisma.presenceCatalogReview.findMany(),
  ]);

  const payload = {
    createdAt: new Date().toISOString(),
    counts: await countPresence(),
    themes,
    modules,
    siteTemplates,
    pageTemplates,
    sites,
    forms,
    reviews,
    themeKeyMap: THEME_KEY_MAP,
    moduleKeyMap: MODULE_KEY_MAP,
  };
  const file = join(dir, 'presence-catalog-backup.json');
  writeFileSync(file, JSON.stringify(payload, null, 2));
  log(`backup written: ${file}`);
}

/**
 * Ordered purge: clear circular FKs, delete org trees, then system catalog.
 */
async function purgeOrgPresence(orgFilter: string[] | null, dryRun: boolean) {
  const siteWhere = orgFilter?.length
    ? { organizationId: { in: orgFilter } }
    : undefined;
  const sites = await prisma.presenceSite.findMany({
    where: siteWhere,
    select: { id: true, organizationId: true, homePageId: true },
  });
  log(`org sites to purge: ${sites.length}`);
  if (dryRun) return sites.length;

  const siteIds = sites.map((s) => s.id);
  if (siteIds.length) {
    await prisma.presenceSite.updateMany({
      where: { id: { in: siteIds } },
      data: { homePageId: null, templateId: null },
    });
    await prisma.presenceAnalyticsEvent.deleteMany({ where: { siteId: { in: siteIds } } });
    await prisma.presencePublishVersion.deleteMany({ where: { siteId: { in: siteIds } } });
    await prisma.presenceGlobalSection.deleteMany({ where: { siteId: { in: siteIds } } });
    const collections = await prisma.presenceCollection.findMany({
      where: { siteId: { in: siteIds } },
      select: { id: true },
    });
    const collectionIds = collections.map((c) => c.id);
    if (collectionIds.length) {
      await prisma.presenceCollectionEntry.deleteMany({
        where: { collectionId: { in: collectionIds } },
      });
      await prisma.presenceCollection.deleteMany({ where: { id: { in: collectionIds } } });
    }
    const pages = await prisma.presencePage.findMany({
      where: { siteId: { in: siteIds } },
      select: { id: true },
    });
    const pageIds = pages.map((p) => p.id);
    if (pageIds.length) {
      await prisma.presenceSection.deleteMany({ where: { pageId: { in: pageIds } } });
      await prisma.presencePage.deleteMany({ where: { id: { in: pageIds } } });
    }
    await prisma.presenceSite.deleteMany({ where: { id: { in: siteIds } } });
  }

  const orgScoped = orgFilter?.length
    ? { organizationId: { in: orgFilter } }
    : undefined;
  const orgOnlyNullable = orgFilter?.length
    ? { organizationId: { in: orgFilter } }
    : { NOT: { organizationId: null } };

  await prisma.presenceCatalogReview.deleteMany({ where: orgScoped });
  await prisma.presenceFormDefinition.deleteMany({ where: orgScoped });
  await prisma.presenceTheme.deleteMany({ where: orgOnlyNullable });
  await prisma.presenceModuleDefinition.deleteMany({ where: orgOnlyNullable });
  await prisma.presenceSiteTemplate.deleteMany({ where: orgOnlyNullable });
  await prisma.presencePageTemplate.deleteMany({ where: orgOnlyNullable });
  await prisma.presenceMarketplaceListing.deleteMany({ where: orgOnlyNullable });
  await prisma.presenceAssetVersion.deleteMany({ where: orgOnlyNullable });

  return sites.length;
}

async function wipeSystemCatalog(dryRun: boolean, preserveLegacy: boolean) {
  const systemThemes = await prisma.presenceTheme.findMany({
    where: { organizationId: null },
    select: { id: true, key: true },
  });
  const systemModules = await prisma.presenceModuleDefinition.findMany({
    where: { organizationId: null },
    select: { id: true, key: true },
  });
  const systemSiteTemplates = await prisma.presenceSiteTemplate.findMany({
    where: { organizationId: null },
    select: { id: true, key: true },
  });
  const systemPageTemplates = await prisma.presencePageTemplate.findMany({
    where: { organizationId: null },
    select: { id: true, key: true },
  });

  log(
    `system wipe: themes=${systemThemes.length} modules=${systemModules.length} siteTpl=${systemSiteTemplates.length} pageTpl=${systemPageTemplates.length}`,
  );
  if (dryRun) return;

  // Sites may still reference system themes if purge was skipped
  const siteCount = await prisma.presenceSite.count();
  if (siteCount > 0) {
    throw new Error(
      `Cannot wipe system catalog: ${siteCount} site(s) still exist (theme FK RESTRICT). Purge org Presence first or pass --purge-org-presence.`,
    );
  }

  await prisma.presenceSite.updateMany({ data: { templateId: null } });
  await prisma.presencePage.updateMany({ data: { templateId: null } });

  if (preserveLegacy) {
    const keepTheme = new Set(CATALOG_THEME_FAMILIES as readonly string[]);
    const keepModule = new Set(CATALOG_V2_MODULE_KEYS as readonly string[]);
    const archiveThemes = systemThemes.filter((t) => !keepTheme.has(t.key));
    const archiveModules = systemModules.filter((m) => !keepModule.has(m.key));
    if (archiveThemes.length) {
      await prisma.presenceTheme.updateMany({
        where: { id: { in: archiveThemes.map((t) => t.id) } },
        data: { status: 'archived' },
      });
    }
    if (archiveModules.length) {
      await prisma.presenceModuleDefinition.updateMany({
        where: { id: { in: archiveModules.map((m) => m.id) } },
        data: { status: 'archived' },
      });
    }
    log(`preserve-legacy: archived ${archiveThemes.length} themes, ${archiveModules.length} modules`);
    return;
  }

  const themeIds = systemThemes.map((t) => t.id);
  const moduleIds = systemModules.map((m) => m.id);

  // Clear parent theme refs then delete
  await prisma.presenceTheme.updateMany({
    where: { organizationId: null },
    data: { parentThemeId: null },
  });

  await prisma.presenceMarketplaceListing.deleteMany({
    where: {
      OR: [{ organizationId: null }, { organizationId: { equals: null } }],
    },
  });
  await prisma.presenceAssetVersion.deleteMany({
    where: { organizationId: null },
  });

  if (moduleIds.length) {
    await prisma.presenceSection.updateMany({
      where: { moduleDefinitionId: { in: moduleIds } },
      data: { moduleDefinitionId: null },
    });
    await prisma.presenceModuleDefinition.deleteMany({
      where: { id: { in: moduleIds } },
    });
  }
  await prisma.presenceSiteTemplate.deleteMany({ where: { organizationId: null } });
  await prisma.presencePageTemplate.deleteMany({ where: { organizationId: null } });
  if (themeIds.length) {
    await prisma.presenceTheme.deleteMany({ where: { id: { in: themeIds } } });
  }
}

async function seedCatalog() {
  await ensureSystemPresenceThemes(prisma);
  await ensureSystemPresenceModuleDefinitions(prisma);
  await ensureSystemPresenceTemplates(prisma);
  log('seeded system themes, modules, and templates');

  const orgs = await prisma.organization.findMany({ select: { id: true, kind: true } });
  for (const org of orgs) {
    await ensureOrgPresenceFormPresets(prisma, org.id, org.kind);
  }
  log(`restored Presence form presets for ${orgs.length} org(s)`);
}

async function validateCatalog() {
  const themes = await prisma.presenceTheme.findMany({
    where: { organizationId: null, status: 'published' },
    select: { key: true, schemaJson: true, manifestJson: true },
  });
  const modules = await prisma.presenceModuleDefinition.findMany({
    where: { organizationId: null, status: 'published' },
    select: { key: true },
  });
  const themeKeys = new Set(themes.map((t) => t.key));
  const moduleKeys = new Set(modules.map((m) => m.key));

  const missingThemes = CATALOG_THEME_FAMILIES.filter((k) => !themeKeys.has(k));
  const missingModules = CATALOG_V2_MODULE_KEYS.filter((k) => !moduleKeys.has(k));
  const legacyThemes = [...themeKeys].filter(
    (k) => !(CATALOG_THEME_FAMILIES as readonly string[]).includes(k),
  );

  const horizon = themes.find((t) => t.key === 'horizon');
  const schema = horizon?.schemaJson && typeof horizon.schemaJson === 'object'
    ? (horizon.schemaJson as Record<string, unknown>)
    : {};
  const presets = Array.isArray(schema.stylePresets) ? schema.stylePresets : [];
  const deltas =
    schema.stylePresetDeltas && typeof schema.stylePresetDeltas === 'object'
      ? Object.keys(schema.stylePresetDeltas as Record<string, unknown>)
      : [];

  const manifest =
    horizon?.manifestJson && typeof horizon.manifestJson === 'object'
      ? (horizon.manifestJson as Record<string, unknown>)
      : {};
  const structure =
    manifest.defaultSiteStructure && typeof manifest.defaultSiteStructure === 'object'
      ? (manifest.defaultSiteStructure as Record<string, unknown>)
      : {};
  const pages = Array.isArray(structure.pages) ? structure.pages : [];
  const sectionTypes = new Set<string>();
  for (const page of pages) {
    const row = page && typeof page === 'object' ? (page as Record<string, unknown>) : {};
    const sections = Array.isArray(row.sections) ? row.sections : [];
    for (const section of sections) {
      const s = section && typeof section === 'object' ? (section as Record<string, unknown>) : {};
      if (typeof s.type === 'string') sectionTypes.add(s.type);
    }
  }
  const nonCatalogSections = [...sectionTypes].filter(
    (t) => !(CATALOG_V2_MODULE_KEYS as readonly string[]).includes(t as (typeof CATALOG_V2_MODULE_KEYS)[number]),
  );

  const report = {
    publishedThemes: themes.length,
    publishedModules: modules.length,
    missingThemes,
    missingModules,
    legacyPublishedThemes: legacyThemes,
    horizonPresets: presets,
    horizonPresetDeltas: deltas,
    horizonDefaultPages: pages.length,
    nonCatalogSectionsInHorizonDefault: nonCatalogSections,
    ok:
      missingThemes.length === 0 &&
      missingModules.length === 0 &&
      presets.length >= 4 &&
      deltas.length >= 4 &&
      pages.length >= 5 &&
      nonCatalogSections.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

async function smokeCatalog() {
  const theme = await prisma.presenceTheme.findFirst({
    where: { organizationId: null, key: 'horizon' },
  });
  const atelier = await prisma.presenceTheme.findFirst({
    where: { organizationId: null, key: 'atelier' },
  });
  const hero = await prisma.presenceModuleDefinition.findFirst({
    where: { organizationId: null, key: 'hero' },
  });
  const packageGrid = await prisma.presenceModuleDefinition.findFirst({
    where: { organizationId: null, key: 'package_grid' },
  });
  const siteTpl = await prisma.presenceSiteTemplate.findFirst({
    where: { organizationId: null, key: 'agency_marketing' },
  });

  const checks = [
    ['horizon theme', !!theme],
    ['atelier theme', !!atelier],
    ['hero module', !!hero],
    ['package_grid module', !!packageGrid],
    ['agency_marketing template', !!siteTpl],
    ['horizon has tokens', !!(theme?.tokensJson && typeof theme.tokensJson === 'object')],
  ] as const;

  for (const [label, ok] of checks) {
    log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
    if (!ok) process.exitCode = 1;
  }
}

async function reset(flags: Flags) {
  if (!flags.yes && !flags.dryRun) {
    console.error(
      'Refusing to reset without --yes (destructive). Use --dry-run to preview, or --yes to proceed.',
    );
    process.exitCode = 1;
    return;
  }

  const before = await countPresence();
  log(`before: ${JSON.stringify(before)}`);

  if (flags.replaceSystemOnly) {
    log('mode: replace-system-only (org Presence kept; may fail if sites pin old themes)');
  } else if (flags.purgeOrgPresence) {
    const filter = flags.orgIds.length ? flags.orgIds : null;
    await purgeOrgPresence(filter, flags.dryRun);
  }

  await wipeSystemCatalog(flags.dryRun, flags.preserveLegacy);

  if (!flags.dryRun) {
    await seedCatalog();
    if (flags.seedDemoSites) {
      log('--seed-demo-sites: not implemented in Sprint 1 (skip)');
    }
  } else {
    log('dry-run: skipping seed');
  }

  const after = flags.dryRun ? before : await countPresence();
  log(`after: ${JSON.stringify(after)}`);
}

async function main() {
  const flags = parseArgs(process.argv);
  try {
    switch (flags.command) {
      case 'backup':
        await backup(flags);
        break;
      case 'reset':
        await reset(flags);
        break;
      case 'seed':
        if (flags.dryRun) {
          log('dry-run: would seed catalog');
        } else {
          await seedCatalog();
        }
        break;
      case 'validate':
        await validateCatalog();
        break;
      case 'smoke':
        await smokeCatalog();
        break;
      default:
        console.log(`Usage:
  presence-catalog backup [--dry-run]
  presence-catalog reset --yes [--dry-run] [--org=ID] [--replace-system-only] [--preserve-legacy] [--no-purge-org-presence] [--seed-demo-sites]
  presence-catalog seed [--dry-run]
  presence-catalog validate
  presence-catalog smoke`);
        if (flags.command !== 'help') process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
  void prisma.$disconnect();
});
