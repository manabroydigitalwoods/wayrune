import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PresenceComponentPackageManifestSchema,
  PresenceThemePackageManifestSchema,
  type PresenceThemePackageManifest,
} from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import JSZip from 'jszip';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import {
  resolveEffectiveTheme,
  type PresenceThemeLike,
} from './presence-theme-resolve';
import { materializeSections, serializeSectionsForTemplate } from './presence-structure-materialize';
import { menusFromStructure, resolveSiteMenus } from './presence-menus';
import { buildPageSuggest, buildSiteSuggest, suggestFromJson } from './presence-suggest-stamp';


export type PackageConflictPolicy = 'overwrite' | 'suffix';

function conflictKeySuffix(): string {
  return randomBytes(3).toString('hex');
}

function isThemeBundleExtraPath(path: string): boolean {
  return (
    path === 'components' ||
    path.startsWith('components/') ||
    path === 'site' ||
    path.startsWith('site/')
  );
}

const MAX_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
const MAX_FILE_COUNT = 100;

const ALLOWED_EXTENSIONS = new Set([
  '.json',
  '.css',
  '.js',
  '.mjs',
  '.map',
  '.woff2',
  '.woff',
  '.ttf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.md',
  '.html',
]);

/** Reject source / nested archives — upload built artifacts only. */
const BLOCKED_EXTENSIONS = new Set(['.ts', '.tsx', '.jsx', '.zip', '.cjs']);

const PARENT_TOKEN_KEYS = [
  'primary',
  'accent',
  'background',
  'foreground',
  'muted',
  'fontDisplay',
  'fontBody',
] as const;

type PackageFileEntry = {
  path: string;
  buffer: Buffer;
};

type StoredPackageFile = {
  path: string;
  documentId: string;
  mimeType: string;
  sizeBytes: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i >= 0 ? path.slice(i).toLowerCase() : '';
}

function mimeForPath(path: string): string {
  switch (extOf(path)) {
    case '.json':
      return 'application/json';
    case '.css':
      return 'text/css';
    case '.js':
    case '.mjs':
      return 'text/javascript';
    case '.map':
      return 'application/json';
    case '.html':
      return 'text/html';
    case '.md':
      return 'text/markdown';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.woff2':
      return 'font/woff2';
    case '.woff':
      return 'font/woff';
    case '.ttf':
      return 'font/ttf';
    default:
      return 'application/octet-stream';
  }
}

function normalizeZipPath(raw: string): string | null {
  const cleaned = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.endsWith('/')) return null;
  if (cleaned.includes('..') || cleaned.includes('\0')) return null;
  if (cleaned.startsWith('__MACOSX/') || cleaned.split('/').some((p) => p.startsWith('.'))) {
    return null;
  }
  return cleaned;
}

/**
 * Strip remote @import, dangerous CSS, and remote url() references.
 * Relative urls under assets/ are left for later rewrite.
 */
export function sanitizeThemePackageCss(css: string): string {
  let out = css.replace(/@import\s+[^;]+;/gi, '/* blocked @import */');
  out = out.replace(/expression\s*\(/gi, '/* blocked expression */(');
  out = out.replace(/behavior\s*:/gi, '/* blocked behavior */:');
  out = out.replace(/-moz-binding\s*:/gi, '/* blocked binding */:');
  out = out.replace(/javascript\s*:/gi, 'blocked:');
  out = out.replace(/data\s*:\s*text\/html/gi, 'blocked:');
  out = out.replace(/url\(\s*['"]?\s*https?:\/\//gi, 'url(/* blocked remote */');
  out = out.replace(/url\(\s*['"]?\s*\/\//gi, 'url(/* blocked protocol-relative */');
  return out;
}

/** Strip scripts and event handlers from package HTML (JS only via entry scripts). */
export function sanitizePackageHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}

const DEFAULT_PREVIEW_CANDIDATES = [
  'preview.png',
  'preview.jpg',
  'preview.jpeg',
  'preview.webp',
  'preview.svg',
  'thumbnail.png',
  'thumbnail.jpg',
  'thumbnail.webp',
  'thumbnail.svg',
  'assets/preview.png',
  'assets/preview.jpg',
  'assets/preview.webp',
  'assets/preview.svg',
  'assets/thumbnail.png',
  'assets/thumbnail.jpg',
  'assets/thumbnail.webp',
  'assets/thumbnail.svg',
] as const;

export type ResolvedPackageThumbnail = {
  /** Catalog / admin URL (authenticated file stream or https). */
  thumbnail: string;
  /** Public site media URL when hosted in-package (needs ?host= on public pages). */
  thumbnailPublic: string | null;
  thumbnailDocumentId: string | null;
  source: 'package' | 'url';
};

/**
 * Resolve card thumbnail from:
 * - `preview` HTTPS URL (secure external link), or
 * - `preview` path inside the ZIP, or
 * - common preview/thumbnail filenames at package root / assets/
 */
export function resolvePackageThumbnail(input: {
  preview?: string | null;
  filesByPath: Map<string, Buffer>;
  stored: StoredPackageFile[];
}): ResolvedPackageThumbnail | null {
  const preview = typeof input.preview === 'string' ? input.preview.trim() : '';

  if (/^https:\/\//i.test(preview)) {
    return {
      thumbnail: preview,
      thumbnailPublic: null,
      thumbnailDocumentId: null,
      source: 'url',
    };
  }
  if (/^http:\/\//i.test(preview)) {
    throw new BadRequestException('preview must be an https:// URL or a package-relative image path');
  }

  if (preview) {
    const path = preview.replace(/^\/+/, '');
    if (!input.filesByPath.has(path)) {
      throw new BadRequestException(`preview file missing from package: ${path}`);
    }
  }

  const candidates: string[] = [];
  if (preview) candidates.push(preview.replace(/^\/+/, ''));
  for (const name of DEFAULT_PREVIEW_CANDIDATES) {
    if (!candidates.includes(name)) candidates.push(name);
  }

  for (const path of candidates) {
    if (!input.filesByPath.has(path)) continue;
    const file = input.stored.find((f) => f.path === path);
    if (!file) continue;
    const publicUrl = `/api/v1/presence/public/media/${file.documentId}`;
    const secureUrl = `/api/v1/files/${file.documentId}/content`;
    return {
      thumbnail: secureUrl,
      thumbnailPublic: publicUrl,
      thumbnailDocumentId: file.documentId,
      source: 'package',
    };
  }

  return null;
}

function rewriteCssAssetUrls(
  css: string,
  pathToPublicUrl: Map<string, string>,
): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _q, rawUrl: string) => {
    const url = String(rawUrl).trim();
    if (!url || url.startsWith('data:') || url.startsWith('#')) return full;
    if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
      return 'url(/* blocked */)';
    }
    const normalized = url.replace(/^\.\//, '').replace(/^\/+/, '');
    const candidates = [normalized, `assets/${normalized}`, normalized.replace(/^assets\//, '')];
    for (const c of candidates) {
      const mapped = pathToPublicUrl.get(c);
      if (mapped) return `url("${mapped}")`;
    }
    // Also match paths relative to styles/
    for (const [path, mapped] of pathToPublicUrl) {
      if (path.endsWith(`/${normalized}`) || path === normalized) {
        return `url("${mapped}")`;
      }
    }
    return full;
  });
}

@Injectable()
export class PresenceThemePackageService {
  constructor(
    private prisma: PrismaService,
    private files: FilesService,
  ) {}

  async installFromZip(input: {
    organizationId: string;
    userId: string;
    buffer: Buffer;
    onConflict?: PackageConflictPolicy;
    confirmReplace?: boolean;
    siteName?: string;
  }) {
    const entries = await this.extractZip(input.buffer);
    const { manifest, tokens, filesByPath: allFiles } = this.parsePackageEntries(entries);
    const onConflict = input.onConflict || 'overwrite';

    // Look-and-feel files only (exclude bundled components/ + site/)
    const filesByPath = new Map<string, Buffer>();
    for (const [path, buf] of allFiles) {
      if (!isThemeBundleExtraPath(path)) filesByPath.set(path, buf);
    }

    const parentTheme = await this.resolveParentTheme(
      input.organizationId,
      manifest.parent,
    );
    if (!manifest.parent) {
      this.assertParentTokens(tokens);
    }

    const existing = await this.prisma.presenceTheme.findFirst({
      where: {
        organizationId: input.organizationId,
        key: manifest.key,
      },
    });

    let installKey = manifest.key;
    let theme =
      existing && onConflict === 'overwrite'
        ? existing
        : null;

    if (existing && onConflict === 'suffix') {
      installKey = `${manifest.key}-${conflictKeySuffix()}`;
    }

    if (!theme) {
      theme = await this.prisma.presenceTheme.create({
        data: {
          organizationId: input.organizationId,
          isSystem: false,
          key: installKey,
          name: manifest.name,
          status: 'published',
          packageFormat: 'v1',
          parentThemeId: parentTheme?.id ?? null,
          tokensJson: tokens as Prisma.InputJsonValue,
          schemaJson: {
            supports: manifest.supports || [],
            tags: manifest.tags || [],
            version: manifest.version,
            description: manifest.description || null,
            author: manifest.author || null,
          } as Prisma.InputJsonValue,
          manifestJson: {} as Prisma.InputJsonValue,
        },
      });
    }

    if (existing && onConflict === 'overwrite') {
      await this.softDeleteThemePackageFiles(input.organizationId, theme.id);
    }

    const packageRootKey = `${input.organizationId}/presence_theme/${theme.id}`;
    const stored: StoredPackageFile[] = [];
    const pathToPublicUrl = new Map<string, string>();

    for (const [path, buffer] of filesByPath) {
      const mimeType = mimeForPath(path);
      const uploaded = await this.files.upload({
        organizationId: input.organizationId,
        userId: input.userId,
        entityType: 'presence_theme',
        entityId: theme.id,
        fileName: path.replace(/\//g, '__'),
        mimeType,
        buffer,
        visibility: 'organization',
      });
      stored.push({
        path,
        documentId: uploaded.id,
        mimeType,
        sizeBytes: buffer.length,
      });
      pathToPublicUrl.set(path, `/api/v1/presence/public/media/${uploaded.id}`);
    }

    const stylesheetPaths =
      manifest.stylesheets?.length
        ? manifest.stylesheets
        : filesByPath.has('styles/theme.css')
          ? ['styles/theme.css']
          : [];

    const scriptPaths =
      manifest.scripts?.length
        ? manifest.scripts
        : filesByPath.has('scripts/theme.js')
          ? ['scripts/theme.js']
          : [];

    const cssParts: string[] = [];
    for (const sheet of stylesheetPaths) {
      const buf = filesByPath.get(sheet);
      if (!buf) {
        throw new BadRequestException(`stylesheet missing from package: ${sheet}`);
      }
      const sanitized = sanitizeThemePackageCss(buf.toString('utf8'));
      cssParts.push(rewriteCssAssetUrls(sanitized, pathToPublicUrl));
    }
    const packageCss = cssParts.join('\n\n');

    const scriptUrls: string[] = [];
    for (const script of scriptPaths) {
      const storedFile = stored.find((f) => f.path === script);
      if (!storedFile) {
        throw new BadRequestException(`script missing from package: ${script}`);
      }
      scriptUrls.push(`/api/v1/presence/public/media/${storedFile.documentId}`);
    }

    const chromeHtml: { header?: string; footer?: string } = {};
    const headerPath = manifest.chrome?.header || (filesByPath.has('chrome/header.html') ? 'chrome/header.html' : null);
    const footerPath = manifest.chrome?.footer || (filesByPath.has('chrome/footer.html') ? 'chrome/footer.html' : null);
    if (headerPath) {
      const buf = filesByPath.get(headerPath);
      if (!buf) throw new BadRequestException(`chrome header missing: ${headerPath}`);
      chromeHtml.header = sanitizePackageHtml(buf.toString('utf8'));
    }
    if (footerPath) {
      const buf = filesByPath.get(footerPath);
      if (!buf) throw new BadRequestException(`chrome footer missing: ${footerPath}`);
      chromeHtml.footer = sanitizePackageHtml(buf.toString('utf8'));
    }

    const previewResolved = resolvePackageThumbnail({
      preview: manifest.preview,
      filesByPath,
      stored,
    });
    const previewUrl = previewResolved?.thumbnail ?? null;

    const storedManifest = {
      ...manifest,
      key: installKey,
      stylesheets: stylesheetPaths,
      scripts: scriptPaths,
      scriptUrls,
      chromeHtml,
      files: stored,
      packageCss,
      installedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.presenceTheme.update({
      where: { id: theme.id },
      data: {
        name: manifest.name,
        status: 'published',
        packageFormat: 'v1',
        packageRootKey,
        parentThemeId: parentTheme?.id ?? null,
        tokensJson: tokens as Prisma.InputJsonValue,
        previewUrl,
        previewAssetsJson: previewResolved
          ? ({
              thumbnail: previewResolved.thumbnail,
              thumbnailPublic: previewResolved.thumbnailPublic,
              thumbnailDocumentId: previewResolved.thumbnailDocumentId,
              thumbnailSource: previewResolved.source,
              description: manifest.description || null,
            } as Prisma.InputJsonValue)
          : ({
              description: manifest.description || null,
            } as Prisma.InputJsonValue),
        suggestJson: manifest.suggest
          ? (manifest.suggest as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        schemaJson: {
          supports: manifest.supports || [],
          tags: manifest.tags || [],
          version: manifest.version,
          description: manifest.description || null,
          author: manifest.author || null,
        } as Prisma.InputJsonValue,
        manifestJson: storedManifest as unknown as Prisma.InputJsonValue,
      },
    });

    // Bundled components (optional)
    const componentEntries = this.discoverThemeComponentEntries(allFiles, manifest);
    const moduleKeyRemap = new Map<string, string>();
    const installedModules: Array<{ key: string; id: string; requestedKey?: string }> = [];
    for (const entry of componentEntries) {
      const dir = entry.path.replace(/\/+$/, '');
      const componentZip = await this.zipSubtreeFromMap(allFiles, dir);
      const requestedKey =
        entry.key || this.peekJsonKey(allFiles, `${dir}/component.json`) || undefined;
      const moduleRow = await this.installComponentFromZip({
        organizationId: input.organizationId,
        userId: input.userId,
        buffer: componentZip,
        onConflict,
      });
      installedModules.push({
        key: moduleRow.key,
        id: moduleRow.id,
        requestedKey,
      });
      if (requestedKey && requestedKey !== moduleRow.key) {
        moduleKeyRemap.set(requestedKey, moduleRow.key);
      }
      const packageKey = this.peekJsonKey(allFiles, `${dir}/component.json`);
      if (packageKey && packageKey !== moduleRow.key) {
        moduleKeyRemap.set(packageKey, moduleRow.key);
      }
    }

    // Optional site structure
    const structurePath = (manifest.site || 'site/structure.json').replace(/^\/+/, '');
    const hasStructure = allFiles.has(structurePath);
    let installSite = manifest.installSite;
    if (!installSite) installSite = hasStructure ? 'create_site' : 'none';
    if (!hasStructure) installSite = 'none';

    let site: {
      id: string;
      name: string;
      pages: unknown[];
    } | null = null;
    if (installSite !== 'none') {
      site = await this.materializeThemeSite({
        organizationId: input.organizationId,
        theme: updated,
        structureBuf: allFiles.get(structurePath)!,
        structurePath,
        installSite,
        confirmReplace: input.confirmReplace,
        siteName: input.siteName || manifest.name,
        moduleKeyRemap,
        onConflict,
      });
    }

    return {
      theme: updated,
      modules: installedModules,
      site,
      installSite,
    };
  }

  private discoverThemeComponentEntries(
    files: Map<string, Buffer>,
    manifest: PresenceThemePackageManifest,
  ): Array<{ path: string; key?: string }> {
    if (manifest.components?.length) {
      return manifest.components.map((c: { path: string; key?: string }) => ({
        path: c.path.replace(/\/+$/, ''),
        key: c.key,
      }));
    }
    const dirs = new Set<string>();
    for (const path of files.keys()) {
      const match = /^components\/([^/]+)\/component\.json$/.exec(path);
      if (match) dirs.add(`components/${match[1]}`);
    }
    return [...dirs].sort().map((path) => ({ path }));
  }

  private peekJsonKey(files: Map<string, Buffer>, path: string): string | null {
    const buf = files.get(path);
    if (!buf) return null;
    try {
      const raw = asRecord(JSON.parse(buf.toString('utf8')));
      return typeof raw.key === 'string' ? raw.key : null;
    } catch {
      return null;
    }
  }

  private async zipSubtreeFromMap(files: Map<string, Buffer>, prefix: string): Promise<Buffer> {
    const root = prefix.replace(/\/+$/, '');
    const zip = new JSZip();
    let count = 0;
    for (const [path, buf] of files) {
      if (path === root || path.startsWith(`${root}/`)) {
        const relative = path === root ? path.split('/').pop()! : path.slice(root.length + 1);
        if (!relative) continue;
        zip.file(relative, buf);
        count += 1;
      }
    }
    if (!count) throw new BadRequestException(`Theme component path missing or empty: ${prefix}`);
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }

  private async materializeThemeSite(input: {
    organizationId: string;
    theme: { id: string; key: string; suggestJson?: unknown };
    structureBuf: Buffer;
    structurePath: string;
    installSite: 'create_site' | 'update_primary';
    confirmReplace?: boolean;
    siteName: string;
    moduleKeyRemap: Map<string, string>;
    onConflict: PackageConflictPolicy;
  }) {
    let structureRaw: unknown;
    try {
      structureRaw = JSON.parse(input.structureBuf.toString('utf8'));
    } catch {
      throw new BadRequestException(`${input.structurePath} is not valid JSON`);
    }
    const structure = asRecord(structureRaw);
    const pages = Array.isArray(structure.pages) ? structure.pages : [];
    const menus = menusFromStructure(structure);
    const globalRegions = asRecord(structure.globalRegions);

    const [primary, org] = await Promise.all([
      this.prisma.presenceSite.findFirst({
        where: { organizationId: input.organizationId, isPrimary: true },
        select: { id: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: input.organizationId, deletedAt: null },
        select: { kind: true },
      }),
    ]);

    const siteSuggest = buildSiteSuggest({
      orgKind: org?.kind,
      siteKind: 'marketing',
      themeSuggest: suggestFromJson(input.theme.suggestJson),
    });

    const replacePrimary = input.installSite === 'update_primary' && Boolean(primary);
    if (replacePrimary && !input.confirmReplace) {
      throw new BadRequestException(
        'This theme uses installSite=update_primary and will replace all pages on the primary site. Pass confirmReplace=true to proceed.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let siteId: string;
      if (replacePrimary && primary) {
        await tx.presencePage.deleteMany({ where: { siteId: primary.id } });
        await tx.presenceSite.update({
          where: { id: primary.id },
          data: {
            themeId: input.theme.id,
            name: input.siteName,
            navigationJson: menus.navigationJson as Prisma.InputJsonValue,
            menusJson: menus.menusJson as Prisma.InputJsonValue,
            menuAssignmentsJson: menus.menuAssignmentsJson as Prisma.InputJsonValue,
            globalRegionsJson: globalRegions as Prisma.InputJsonValue,
            suggestJson: siteSuggest as Prisma.InputJsonValue,
            settingsJson: {
              themeKey: input.theme.key,
              themePackageVersion: true,
              onConflict: input.onConflict,
              installSite: input.installSite,
            } as Prisma.InputJsonValue,
            status: 'draft',
          },
        });
        siteId = primary.id;
      } else {
        await tx.presenceSite.updateMany({
          where: { organizationId: input.organizationId },
          data: { isPrimary: false },
        });
        const created = await tx.presenceSite.create({
          data: {
            organizationId: input.organizationId,
            name: input.siteName,
            kind: 'marketing',
            themeId: input.theme.id,
            isPrimary: true,
            status: 'draft',
            navigationJson: menus.navigationJson as Prisma.InputJsonValue,
            menusJson: menus.menusJson as Prisma.InputJsonValue,
            menuAssignmentsJson: menus.menuAssignmentsJson as Prisma.InputJsonValue,
            globalRegionsJson: globalRegions as Prisma.InputJsonValue,
            suggestJson: siteSuggest as Prisma.InputJsonValue,
            settingsJson: {
              themeKey: input.theme.key,
              onConflict: input.onConflict,
              installSite: input.installSite,
            } as Prisma.InputJsonValue,
          },
        });
        siteId = created.id;
      }

      let homePageId: string | null = null;
      for (let i = 0; i < pages.length; i += 1) {
        const pageDef = asRecord(pages[i]);
        const pagePath =
          typeof pageDef.path === 'string' && pageDef.path.trim()
            ? String(pageDef.path)
            : i === 0
              ? '/'
              : `/page-${i + 1}`;
        const layoutMode =
          pageDef.layoutMode === 'freeform' || pageDef.layoutMode === 'flow'
            ? pageDef.layoutMode
            : 'flow';
        const pageSuggest = buildPageSuggest({ path: pagePath });
        const createdPage = await tx.presencePage.create({
          data: {
            siteId,
            path: pagePath,
            title: String(pageDef.title || `Page ${i + 1}`),
            layoutKey: typeof pageDef.layoutKey === 'string' ? pageDef.layoutKey : 'default',
            layoutMode,
            seoJson: pageDef.seoJson
              ? (asRecord(pageDef.seoJson) as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            draftJson: pageDef as Prisma.InputJsonValue,
            suggestJson: pageSuggest as Prisma.InputJsonValue,
            position: i,
            status: 'draft',
          },
        });
        if (homePageId == null || createdPage.path === '/') homePageId = createdPage.id;
        await materializeSections({
          tx,
          pageId: createdPage.id,
          organizationId: input.organizationId,
          rawSections: Array.isArray(pageDef.sections) ? pageDef.sections : [],
          moduleKeyRemap: input.moduleKeyRemap,
        });
      }

      return tx.presenceSite.update({
        where: { id: siteId },
        data: { homePageId },
        include: {
          theme: true,
          pages: { orderBy: { position: 'asc' } },
        },
      });
    });
  }

  async exportToZip(organizationId: string, themeId: string): Promise<Buffer> {
    const theme = await this.prisma.presenceTheme.findFirst({
      where: {
        id: themeId,
        OR: [{ isSystem: true }, { organizationId }],
      },
    });
    if (!theme) throw new NotFoundException('Theme not found');

    const zip = new JSZip();
    const manifest = asRecord(theme.manifestJson);
    const files = Array.isArray(manifest.files) ? manifest.files : [];

    if (theme.packageFormat === 'v1' && files.length) {
      for (const raw of files) {
        const row = asRecord(raw);
        const path = typeof row.path === 'string' ? row.path : '';
        const documentId = typeof row.documentId === 'string' ? row.documentId : '';
        if (!path || !documentId) continue;
        const { buffer } = await this.files.readBuffer(organizationId, documentId);
        zip.file(path, buffer);
      }
      if (!files.some((f) => asRecord(f).path === 'theme.json')) {
        zip.file(
          'theme.json',
          JSON.stringify(
            {
              key: theme.key,
              name: theme.name,
              version: String(asRecord(theme.schemaJson).version || '1.0.0'),
              parent: theme.parentThemeId
                ? (
                    await this.prisma.presenceTheme.findFirst({
                      where: { id: theme.parentThemeId },
                      select: { key: true },
                    })
                  )?.key
                : undefined,
              stylesheets: Array.isArray(manifest.stylesheets)
                ? manifest.stylesheets
                : ['styles/theme.css'],
            },
            null,
            2,
          ),
        );
      }
      if (!files.some((f) => asRecord(f).path === 'tokens.json')) {
        zip.file('tokens.json', JSON.stringify(theme.tokensJson ?? {}, null, 2));
      }
    } else {
      // legacy_json → minimal ZIP for round-trip / authoring
      let parentKey: string | undefined;
      if (theme.parentThemeId) {
        const parent = await this.prisma.presenceTheme.findFirst({
          where: { id: theme.parentThemeId },
          select: { key: true },
        });
        parentKey = parent?.key;
      }
      zip.file(
        'theme.json',
        JSON.stringify(
          {
            key: theme.key,
            name: theme.name,
            version: '1.0.0',
            ...(parentKey ? { parent: parentKey } : {}),
            stylesheets: ['styles/theme.css'],
          },
          null,
          2,
        ),
      );
      zip.file('tokens.json', JSON.stringify(theme.tokensJson ?? {}, null, 2));
      zip.file(
        'styles/theme.css',
        `/* Exported from legacy theme ${theme.key} — add custom CSS as needed */\n`,
      );
      zip.file(
        'README.md',
        `# ${theme.name}\n\nExported Presence theme package (legacy_json → v1 layout).\n`,
      );
    }

    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return Buffer.from(out);
  }

  /**
   * Parent then child packageCss (WordPress cascade).
   */
  async resolvePackageCss(
    organizationId: string,
    leaf: PresenceThemeLike,
  ): Promise<string> {
    const chain: PresenceThemeLike[] = [];
    const seen = new Set<string>();
    let current: PresenceThemeLike | null | undefined = leaf;
    while (current) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      chain.unshift(current);
      if (!current.parentThemeId) break;
      current = (await this.prisma.presenceTheme.findFirst({
        where: { id: current.parentThemeId },
      })) as PresenceThemeLike | null;
    }

    const parts: string[] = [];
    for (const row of chain) {
      const css = String(asRecord(row.manifestJson).packageCss || '');
      if (css.trim()) parts.push(css);
    }
    void organizationId;
    return parts.join('\n\n');
  }

  async resolvePackageScripts(leaf: PresenceThemeLike): Promise<string[]> {
    const chain: PresenceThemeLike[] = [];
    const seen = new Set<string>();
    let current: PresenceThemeLike | null | undefined = leaf;
    while (current) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      chain.unshift(current);
      if (!current.parentThemeId) break;
      current = (await this.prisma.presenceTheme.findFirst({
        where: { id: current.parentThemeId },
      })) as PresenceThemeLike | null;
    }
    const urls: string[] = [];
    for (const row of chain) {
      const list = asRecord(row.manifestJson).scriptUrls;
      if (Array.isArray(list)) {
        for (const u of list) {
          if (typeof u === 'string' && u) urls.push(u);
        }
      }
    }
    return urls;
  }

  async resolvePackageChrome(leaf: PresenceThemeLike): Promise<{
    headerHtml: string | null;
    footerHtml: string | null;
  }> {
    let headerHtml: string | null = null;
    let footerHtml: string | null = null;
    const chain: PresenceThemeLike[] = [];
    const seen = new Set<string>();
    let current: PresenceThemeLike | null | undefined = leaf;
    while (current) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      chain.unshift(current);
      if (!current.parentThemeId) break;
      current = (await this.prisma.presenceTheme.findFirst({
        where: { id: current.parentThemeId },
      })) as PresenceThemeLike | null;
    }
    for (const row of chain) {
      const chrome = asRecord(asRecord(row.manifestJson).chromeHtml);
      if (typeof chrome.header === 'string' && chrome.header.trim()) headerHtml = chrome.header;
      if (typeof chrome.footer === 'string' && chrome.footer.trim()) footerHtml = chrome.footer;
    }
    return { headerHtml, footerHtml };
  }

  async installComponentFromZip(input: {
    organizationId: string;
    userId: string;
    buffer: Buffer;
    onConflict?: PackageConflictPolicy;
  }) {
    const entries = await this.extractZip(input.buffer);
    const filesByPath = new Map<string, Buffer>();
    for (const entry of entries) {
      const ext = extOf(entry.path);
      if (BLOCKED_EXTENSIONS.has(ext)) {
        throw new BadRequestException(`File type not allowed: ${entry.path}`);
      }
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new BadRequestException(`Unsupported file type: ${entry.path}`);
      }
      filesByPath.set(entry.path, entry.buffer);
    }

    const componentJsonBuf = filesByPath.get('component.json');
    if (!componentJsonBuf) {
      throw new BadRequestException('component.json is required at package root');
    }
    let manifestRaw: unknown;
    try {
      manifestRaw = JSON.parse(componentJsonBuf.toString('utf8'));
    } catch {
      throw new BadRequestException('component.json is not valid JSON');
    }
    const parsed = PresenceComponentPackageManifestSchema.safeParse(manifestRaw);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid component.json: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const manifest = parsed.data;
    const onConflict = input.onConflict || 'overwrite';
    const entry = manifest.entry || {};
    const htmlPath = entry.html || (filesByPath.has('index.html') ? 'index.html' : null);
    const cssPaths = entry.css?.length
      ? entry.css
      : filesByPath.has('styles.css')
        ? ['styles.css']
        : [];
    const jsPaths = entry.js?.length
      ? entry.js
      : filesByPath.has('index.js')
        ? ['index.js']
        : [];

    if (htmlPath) {
      const html = filesByPath.get(htmlPath)?.toString('utf8') || '';
      if (/<script[\s>]/i.test(html)) {
        throw new BadRequestException(`HTML must not contain <script>: ${htmlPath}`);
      }
    }

    const existing = await this.prisma.presenceModuleDefinition.findFirst({
      where: { organizationId: input.organizationId, key: manifest.key },
    });

    let installKey = manifest.key;
    let moduleRow =
      existing && onConflict === 'overwrite' ? existing : null;

    if (existing && onConflict === 'suffix') {
      installKey = `${manifest.key}-${conflictKeySuffix()}`;
    }

    if (!moduleRow) {
      moduleRow = await this.prisma.presenceModuleDefinition.create({
        data: {
          organizationId: input.organizationId,
          isSystem: false,
          key: installKey,
          name: manifest.name,
          category: manifest.category,
          rendererKey: 'package',
          status: 'published',
          schemaJson: manifest.schema as unknown as Prisma.InputJsonValue,
          defaultPropsJson: manifest.defaultProps as Prisma.InputJsonValue,
          variantsJson: manifest.variants
            ? (manifest.variants as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          suggestJson: manifest.suggest
            ? (manifest.suggest as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          assetsJson: {} as Prisma.InputJsonValue,
        },
      });
    }

    if (existing && onConflict === 'overwrite') {
      await this.prisma.document.updateMany({
        where: {
          organizationId: input.organizationId,
          entityType: 'presence_module',
          entityId: moduleRow.id,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
    }

    const stored: StoredPackageFile[] = [];
    const pathToPublicUrl = new Map<string, string>();
    for (const [path, buffer] of filesByPath) {
      const mimeType = mimeForPath(path);
      const uploaded = await this.files.upload({
        organizationId: input.organizationId,
        userId: input.userId,
        entityType: 'presence_module',
        entityId: moduleRow.id,
        fileName: path.replace(/\//g, '__'),
        mimeType,
        buffer,
        visibility: 'organization',
      });
      stored.push({
        path,
        documentId: uploaded.id,
        mimeType,
        sizeBytes: buffer.length,
      });
      pathToPublicUrl.set(path, `/api/v1/presence/public/media/${uploaded.id}`);
    }

    let packageHtml = '';
    if (htmlPath) {
      packageHtml = sanitizePackageHtml(filesByPath.get(htmlPath)!.toString('utf8'));
    }

    const cssParts: string[] = [];
    for (const sheet of cssPaths) {
      const buf = filesByPath.get(sheet);
      if (!buf) throw new BadRequestException(`stylesheet missing: ${sheet}`);
      cssParts.push(
        rewriteCssAssetUrls(sanitizeThemePackageCss(buf.toString('utf8')), pathToPublicUrl),
      );
    }

    const jsUrls: string[] = [];
    for (const script of jsPaths) {
      const file = stored.find((f) => f.path === script);
      if (!file) throw new BadRequestException(`script missing: ${script}`);
      jsUrls.push(`/api/v1/presence/public/media/${file.documentId}`);
    }

    const previewResolved = resolvePackageThumbnail({
      preview: manifest.preview,
      filesByPath,
      stored,
    });

    const assetsJson = {
      packageFormat: 'v1',
      version: manifest.version,
      description: manifest.description || null,
      entry: { html: htmlPath, css: cssPaths, js: jsPaths },
      files: stored,
      packageHtml,
      packageCss: cssParts.join('\n\n'),
      jsUrls,
      thumbnail: previewResolved?.thumbnail ?? null,
      thumbnailPublic: previewResolved?.thumbnailPublic ?? null,
      thumbnailDocumentId: previewResolved?.thumbnailDocumentId ?? null,
      thumbnailSource: previewResolved?.source ?? null,
      installedAt: new Date().toISOString(),
    };

    // Keep component.json in files aligned with install key (suffix / overwrite).
    const componentJsonIdx = stored.findIndex((f) => f.path === 'component.json');
    if (installKey !== manifest.key && componentJsonIdx >= 0) {
      const rewritten = {
        ...manifest,
        key: installKey,
        entry: { html: htmlPath, css: cssPaths, js: jsPaths },
      };
      const uploaded = await this.files.upload({
        organizationId: input.organizationId,
        userId: input.userId,
        entityType: 'presence_module',
        entityId: moduleRow.id,
        fileName: 'component.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(rewritten, null, 2), 'utf8'),
        visibility: 'organization',
      });
      stored[componentJsonIdx] = {
        path: 'component.json',
        documentId: uploaded.id,
        mimeType: 'application/json',
        sizeBytes: Buffer.byteLength(JSON.stringify(rewritten, null, 2)),
      };
      assetsJson.files = stored;
    }

    return this.prisma.presenceModuleDefinition.update({
      where: { id: moduleRow.id },
      data: {
        key: installKey,
        name: manifest.name,
        category: manifest.category,
        rendererKey: 'package',
        status: 'published',
        schemaJson: manifest.schema as unknown as Prisma.InputJsonValue,
        defaultPropsJson: manifest.defaultProps as Prisma.InputJsonValue,
        variantsJson: manifest.variants
          ? (manifest.variants as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        suggestJson: manifest.suggest
          ? (manifest.suggest as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        previewJson: {
          summary: manifest.description || null,
          thumbnail: previewResolved?.thumbnail ?? null,
        } as Prisma.InputJsonValue,
        assetsJson: assetsJson as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Export an installed component package with original hosted files (incl. JS). */
  async exportComponentToZip(organizationId: string, moduleId: string): Promise<Buffer> {
    const mod = await this.prisma.presenceModuleDefinition.findFirst({
      where: {
        id: moduleId,
        OR: [{ isSystem: true }, { organizationId }],
      },
    });
    if (!mod) throw new NotFoundException('Component not found');

    const zip = new JSZip();
    const assets = asRecord(mod.assetsJson);
    const files = Array.isArray(assets.files) ? assets.files : [];
    const entry = asRecord(assets.entry);
    const htmlPath = typeof entry.html === 'string' ? entry.html : 'index.html';
    const cssPaths = Array.isArray(entry.css) ? entry.css.map(String) : ['styles.css'];
    const jsPaths = Array.isArray(entry.js) ? entry.js.map(String) : ['index.js'];

    let wroteFromFiles = 0;
    for (const raw of files) {
      const row = asRecord(raw);
      const path = typeof row.path === 'string' ? row.path : '';
      const documentId = typeof row.documentId === 'string' ? row.documentId : '';
      if (!path || !documentId) continue;
      try {
        const { buffer } = await this.files.readBuffer(organizationId, documentId);
        zip.file(path, buffer);
        wroteFromFiles += 1;
      } catch {
        // Soft-skip missing docs; fall back below for core entry files.
      }
    }

    if (!zip.file('component.json')) {
      zip.file(
        'component.json',
        JSON.stringify(
          {
            key: mod.key,
            name: mod.name,
            version: typeof assets.version === 'string' ? assets.version : '1.0.0',
            description: typeof assets.description === 'string' ? assets.description : undefined,
            category: mod.category,
            rendererKind: 'package',
            entry: { html: htmlPath, css: cssPaths, js: jsPaths },
            schema: Array.isArray(mod.schemaJson) ? mod.schemaJson : [],
            defaultProps: asRecord(mod.defaultPropsJson),
          },
          null,
          2,
        ),
      );
    }

    if (wroteFromFiles === 0 || !zip.file(htmlPath)) {
      if (typeof assets.packageHtml === 'string') {
        zip.file(htmlPath, assets.packageHtml);
      } else if (!zip.file(htmlPath)) {
        zip.file(htmlPath, '<div id="root"></div>\n');
      }
    }
    if (wroteFromFiles === 0 || !cssPaths.every((p) => zip.file(p))) {
      if (typeof assets.packageCss === 'string' && cssPaths[0] && !zip.file(cssPaths[0])) {
        zip.file(cssPaths[0], assets.packageCss);
      }
    }
    for (const script of jsPaths) {
      if (zip.file(script)) continue;
      // Last resort: valid empty mount so re-install still validates.
      zip.file(
        script,
        `(function(){window.PresenceMount=function(el,props){el.innerHTML=el.innerHTML||'<div></div>';};})();\n`,
      );
    }

    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }

  /**
   * Export a site as a full theme ZIP: look + used org components + site/structure.json.
   */
  async exportSiteAsFullTheme(organizationId: string, siteId: string): Promise<Buffer> {
    const site = await this.prisma.presenceSite.findFirst({
      where: { id: siteId, organizationId },
      include: {
        theme: true,
        pages: {
          orderBy: { position: 'asc' },
          include: {
            sections: {
              orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
              include: {
                moduleDefinition: {
                  select: { key: true, id: true, isSystem: true, organizationId: true },
                },
              },
            },
          },
        },
      },
    });
    if (!site) throw new NotFoundException('Site not found');

    const zip = new JSZip();
    const themeZip = await this.exportToZip(organizationId, site.themeId);
    const themeFiles = await JSZip.loadAsync(themeZip);
    for (const name of Object.keys(themeFiles.files)) {
      const entry = themeFiles.files[name];
      if (!entry || entry.dir) continue;
      if (isThemeBundleExtraPath(name)) continue;
      zip.file(name, Buffer.from(await entry.async('uint8array')));
    }

    const usedModuleIds = new Set<string>();
    for (const page of site.pages) {
      for (const section of page.sections) {
        if (
          section.moduleDefinitionId &&
          section.moduleDefinition &&
          !section.moduleDefinition.isSystem &&
          section.moduleDefinition.organizationId === organizationId
        ) {
          usedModuleIds.add(section.moduleDefinitionId);
        }
      }
    }

    const componentEntries: Array<{ path: string; key: string }> = [];
    let i = 0;
    for (const moduleId of usedModuleIds) {
      const mod = await this.prisma.presenceModuleDefinition.findFirst({
        where: { id: moduleId, organizationId },
      });
      if (!mod) continue;
      const folder = `components/${mod.key || `component-${i}`}`;
      i += 1;
      const componentZip = await this.exportComponentToZip(organizationId, moduleId);
      const componentFiles = await JSZip.loadAsync(componentZip);
      for (const name of Object.keys(componentFiles.files)) {
        const entry = componentFiles.files[name];
        if (!entry || entry.dir) continue;
        zip.file(`${folder}/${name}`, Buffer.from(await entry.async('uint8array')));
      }
      componentEntries.push({ path: folder, key: mod.key });
    }

    const pages = site.pages.map((page) => ({
      path: page.path,
      title: page.title,
      layoutKey: page.layoutKey,
      layoutMode: page.layoutMode || 'flow',
      seoJson: page.seoJson,
      sections: serializeSectionsForTemplate(page.sections),
    }));

    const resolved = resolveSiteMenus(site);

    zip.file(
      'site/structure.json',
      JSON.stringify(
        {
          navigation: resolved.navigationJson,
          menus: resolved.menusJson,
          menuAssignments: resolved.menuAssignmentsJson,
          globalRegions: site.globalRegionsJson || {},
          pages,
        },
        null,
        2,
      ),
    );

    const themeJsonEntry = zip.file('theme.json');
    let themeManifest: Record<string, unknown> = {
      key: site.theme.key,
      name: site.theme.name,
      version: '1.0.0',
    };
    if (themeJsonEntry) {
      try {
        themeManifest = {
          ...asRecord(JSON.parse(await themeJsonEntry.async('string'))),
        };
      } catch {
        /* keep defaults */
      }
    }
    themeManifest.components = componentEntries;
    themeManifest.site = 'site/structure.json';
    themeManifest.installSite = 'create_site';
    const layoutLocations = asRecord(site.theme.layoutJson).menuLocations;
    if (Array.isArray(layoutLocations) && layoutLocations.length) {
      themeManifest.menuLocations = layoutLocations;
    } else if (!themeManifest.menuLocations) {
      themeManifest.menuLocations = [
        { key: 'primary', label: 'Primary', description: 'Header nav' },
        { key: 'footer', label: 'Footer', description: 'Footer links' },
      ];
    }
    zip.file('theme.json', JSON.stringify(themeManifest, null, 2));

    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }

  enrichThemeForClient(theme: PresenceThemeLike & { parentTheme?: { key: string; name: string } | null }) {
    const byId = new Map<string, PresenceThemeLike>();
    // single-theme enrich uses only leaf; listThemes already resolves parents
    const effective = resolveEffectiveTheme(theme, () => null);
    return {
      ...theme,
      effectiveTokensJson: effective.tokensJson,
      packageCss: String(asRecord(theme.manifestJson).packageCss || ''),
      parentKey: theme.parentTheme?.key ?? effective.parentKey,
      parentName: theme.parentTheme?.name ?? null,
    };
  }

  private async softDeleteThemePackageFiles(organizationId: string, themeId: string) {
    await this.prisma.document.updateMany({
      where: {
        organizationId,
        entityType: 'presence_theme',
        entityId: themeId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
  }

  private async resolveParentTheme(organizationId: string, parentKey?: string) {
    if (!parentKey) return null;
    const parent = await this.prisma.presenceTheme.findFirst({
      where: {
        key: parentKey,
        OR: [{ isSystem: true }, { organizationId }],
      },
    });
    if (!parent) {
      throw new BadRequestException(`Parent theme not found: ${parentKey}`);
    }
    if (parent.parentThemeId) {
      throw new BadRequestException('Child themes cannot be parents in v1 (single parent level)');
    }
    return parent;
  }

  private assertParentTokens(tokens: Record<string, unknown>) {
    const missing = PARENT_TOKEN_KEYS.filter((k) => {
      const v = tokens[k];
      return typeof v !== 'string' || !v.trim();
    });
    if (missing.length) {
      throw new BadRequestException(
        `Parent theme tokens.json missing required keys: ${missing.join(', ')}`,
      );
    }
  }

  private async extractZip(buffer: Buffer): Promise<PackageFileEntry[]> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new BadRequestException('Invalid ZIP file');
    }

    const rawEntries: PackageFileEntry[] = [];
    let total = 0;
    const names = Object.keys(zip.files);
    for (const name of names) {
      const entry = zip.files[name];
      if (!entry || entry.dir) continue;
      const path = normalizeZipPath(name);
      if (!path) continue;
      const data = await entry.async('nodebuffer');
      total += data.length;
      if (total > MAX_UNCOMPRESSED_BYTES) {
        throw new BadRequestException(`Package exceeds ${MAX_UNCOMPRESSED_BYTES} byte limit`);
      }
      rawEntries.push({ path, buffer: Buffer.from(data) });
    }

    if (!rawEntries.length) throw new BadRequestException('ZIP is empty');
    if (rawEntries.length > MAX_FILE_COUNT) {
      throw new BadRequestException(`Package exceeds ${MAX_FILE_COUNT} file limit`);
    }

    // Collapse single top-level folder
    const tops = new Set(rawEntries.map((e) => e.path.split('/')[0]));
    let stripPrefix = '';
    if (tops.size === 1) {
      const only = [...tops][0];
      const hasThemeAtRoot = rawEntries.some((e) => e.path === 'theme.json');
      if (!hasThemeAtRoot && only && rawEntries.every((e) => e.path.startsWith(`${only}/`))) {
        stripPrefix = `${only}/`;
      }
    }

    return rawEntries.map((e) => ({
      path: stripPrefix ? e.path.slice(stripPrefix.length) : e.path,
      buffer: e.buffer,
    }));
  }

  private parsePackageEntries(entries: PackageFileEntry[]): {
    manifest: PresenceThemePackageManifest;
    tokens: Record<string, unknown>;
    filesByPath: Map<string, Buffer>;
  } {
    const filesByPath = new Map<string, Buffer>();
    for (const entry of entries) {
      const ext = extOf(entry.path);
      if (BLOCKED_EXTENSIONS.has(ext)) {
        throw new BadRequestException(
          `File type not allowed in packages: ${entry.path} (upload built artifacts only)`,
        );
      }
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new BadRequestException(`Unsupported file type: ${entry.path}`);
      }
      filesByPath.set(entry.path, entry.buffer);
    }

    const themeJsonBuf = filesByPath.get('theme.json');
    if (!themeJsonBuf) throw new BadRequestException('theme.json is required at package root');

    let manifestRaw: unknown;
    try {
      manifestRaw = JSON.parse(themeJsonBuf.toString('utf8'));
    } catch {
      throw new BadRequestException('theme.json is not valid JSON');
    }
    const parsed = PresenceThemePackageManifestSchema.safeParse(manifestRaw);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid theme.json: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const manifest = parsed.data;

    if (manifest.parent && manifest.parent === manifest.key) {
      throw new BadRequestException('Theme cannot be its own parent');
    }

    let tokens: Record<string, unknown> = {};
    const tokensBuf = filesByPath.get('tokens.json');
    if (tokensBuf) {
      try {
        const raw = JSON.parse(tokensBuf.toString('utf8'));
        tokens = asRecord(raw);
      } catch {
        throw new BadRequestException('tokens.json is not valid JSON');
      }
    } else if (!manifest.parent) {
      throw new BadRequestException('tokens.json is required for parent themes');
    }

    // Drop raw HTML script tags if any html slipped in (chrome / theme only; components validated separately)
    for (const [path, buf] of filesByPath) {
      if (isThemeBundleExtraPath(path)) continue;
      if (extOf(path) === '.html') {
        const html = buf.toString('utf8');
        if (/<script[\s>]/i.test(html)) {
          throw new BadRequestException(`HTML must not contain <script>: ${path}`);
        }
      }
    }

    return { manifest, tokens, filesByPath };
  }
}
