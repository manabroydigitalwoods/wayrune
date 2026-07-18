import { Injectable } from '@nestjs/common';
import { loadEnv } from '@wayrune/config';
import type { PresenceVisitorContext } from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgIdentityService } from '../organizations/org-identity.service';
import { PresenceContentEngineService } from './content-engine/content-engine.service';
import { isWithinSchedule } from './content-engine/rules';
import { PresenceJsModuleService } from './presence-js-module.service';
import { PresenceLiquidService } from './presence-liquid.service';
import { extraModulesCss, parsePresenceConversationWidget, parsePresenceSiteLayout, pathsFromLegacyOrTarget, parseInboxChatSettings, placementSideToPosition, renderExtraModule, resolvePresenceWidgetPlacement } from '@wayrune/contracts';
import { resolveRenderableModuleType } from './presence-catalog-compat';
import { applyStylePreset } from './presence-style-presets';
import {
  classAttr,
  columnSlotKeys,
  freeformFrameStyle,
  freeformResponsiveCss,
  inlineStyleAttr,
  layoutBoxStyleFromProps,
  parseFreeformFrame,
  responsiveCssForSection,
  stylePropsFromRecord,
} from './presence-style';
import { PresenceThemePackageService } from './presence-theme-package.service';
import { resolveEffectiveTheme, type PresenceThemeLike } from './presence-theme-resolve';
import {
  menusFromStructure,
  renderFooterMenuHtml,
  renderMenuNavHtml,
  resolveMenuForLocation,
  resolveSiteMenus,
} from './presence-menus';
import { normalizeTemplateSections } from './presence-structure-materialize';
import { siteDomainLookupVariants } from './presence-site-domain';
import { parseSitePlatformHost } from './presence-site-platform-host';
import { scopePresenceCss } from './presence-css-scope';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fontFamilyName(stack: string) {
  const first = stack.split(',')[0]?.trim() || '';
  return first.replace(/^["']|["']$/g, '');
}

function googleFontsHref(fontDisplay: string, fontBody: string) {
  const families = [...new Set([fontFamilyName(fontDisplay), fontFamilyName(fontBody)])]
    .filter((name) => name && !/^(Georgia|system-ui|serif|sans-serif)$/i.test(name))
    .map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700`);
  if (!families.length) return '';
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

type ThemeTokens = {
  primary: string;
  accent: string;
  bg: string;
  fg: string;
  muted: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  radius: string;
  heroFrom: string;
  heroTo: string;
  fontDisplay: string;
  fontBody: string;
};

type SectionRow = {
  id: string;
  type: string;
  parentId: string | null;
  slotKey: string | null;
  propsJson: unknown;
  position: number;
  moduleDefinition?: {
    templateSource?: string | null;
    moduleSource?: string | null;
    rendererKey?: string;
    defaultPropsJson?: unknown;
    assetsJson?: unknown;
  } | null;
};

@Injectable()
export class PresenceRuntimeService {
  constructor(
    private prisma: PrismaService,
    private orgIdentity: OrgIdentityService,
    private liquid: PresenceLiquidService,
    private jsModule: PresenceJsModuleService,
    private themePackages: PresenceThemePackageService,
    private contentEngine: PresenceContentEngineService,
  ) {}

  async renderPublicHtml(opts: {
    host: string;
    path: string;
    preview?: boolean;
    visitor?: PresenceVisitorContext;
  }): Promise<{ html: string; status: number }> {
    const resolved = await this.resolveSiteContextFromHost(opts.host, opts.preview);
    if (!resolved) {
      return { status: 404, html: this.simpleHtml('Site not found', '<p>Unknown host.</p>') };
    }
    const { org, site } = resolved;
    if (!site) {
      return { status: 404, html: this.simpleHtml(org.name, '<p>No published site yet.</p>') };
    }

    const path = this.normalizePath(opts.path);
    const now = new Date();
    let page = await this.prisma.presencePage.findFirst({
      where: {
        siteId: site.id,
        path,
        ...(opts.preview ? {} : { status: 'published' }),
      },
      include: {
        sections: {
          orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
          include: { moduleDefinition: true },
        },
      },
    });

    if (
      page &&
      !opts.preview &&
      !isWithinSchedule(
        {
          publishAt: page.publishAt?.toISOString() ?? null,
          unpublishAt: page.unpublishAt?.toISOString() ?? null,
        },
        now,
      )
    ) {
      page = null;
    }

    if (!page) {
      const collectionHtml = await this.renderCollectionPath({
        org,
        site,
        path,
        preview: Boolean(opts.preview),
        apiUrl: '',
        brandName: org.name,
      });
      if (collectionHtml) return collectionHtml;
      return {
        status: 404,
        html: this.simpleHtml(org.name, `<p>Page not found: ${escapeHtml(path)}</p>`),
      };
    }

    const forms = await this.prisma.presenceFormDefinition.findMany({
      where: { organizationId: org.id, isActive: true },
    });
    const formByKey = new Map(forms.map((f) => [f.key, f]));
    const siteWidgetSettings = parsePresenceConversationWidget(site.settingsJson);
    const assignedWidget = siteWidgetSettings.widgetId
      ? await this.prisma.presenceChatWidget.findFirst({
          where: {
            id: siteWidgetSettings.widgetId,
            organizationId: org.id,
          },
        })
      : null;
    const widgetEnabled = Boolean(assignedWidget?.enabled);
    const publicKey = assignedWidget?.publicKey || '';
    const widgetId = assignedWidget?.id || '';
    const env = loadEnv();
    const apiUrl =
      process.env.PUBLIC_API_URL?.replace(/\/$/, '') || `http://localhost:${env.apiPort}/api/v1`;
    const webOrigin = env.webOrigin.replace(/\/$/, '');
    // Local Presence hosts (*.codepoetry.localhost:5173) are served by Vite — use same-origin
    // paths so widget.js + /api proxy work without cross-origin CORS friction.
    const sameOriginWidget = env.appEnv === 'local';
    const widgetScriptSrc = sameOriginWidget ? '/widget.js' : `${webOrigin}/widget.js`;
    const widgetApiBase = sameOriginWidget ? '/api/v1' : apiUrl;
    const orgRef = this.orgIdentity.publicOrgRef(org);

    const leafTheme = site.theme as PresenceThemeLike;
    let parentTheme: PresenceThemeLike | null = null;
    if (leafTheme.parentThemeId) {
      parentTheme = (await this.prisma.presenceTheme.findFirst({
        where: { id: leafTheme.parentThemeId },
      })) as PresenceThemeLike | null;
    }
    const effective = resolveEffectiveTheme(leafTheme, (id) =>
      parentTheme && parentTheme.id === id ? parentTheme : null,
    );
    const packageCss = await this.themePackages.resolvePackageCss(org.id, leafTheme);
    const packageScripts = await this.themePackages.resolvePackageScripts(leafTheme);
    const packageChrome = await this.themePackages.resolvePackageChrome(leafTheme);
    const siteSettings = asRecord(site.settingsJson);
    const designSystem = asRecord(siteSettings.designSystem);
    const stylePreset =
      typeof siteSettings.stylePreset === 'string' ? siteSettings.stylePreset : null;
    const themeKey = String(effective.key || 'horizon');
    const themeTokens = applyStylePreset(themeKey, {
      ...asRecord(effective.tokensJson),
      ...designSystem,
    }, stylePreset);
    const tokens = this.resolveTokens(themeTokens);
    const siteSeo = asRecord(siteSettings.seo);
    const analytics = asRecord(siteSettings.analytics);
    const pageSeo = asRecord(page.seoJson);
    const templateKey = String(siteSettings.siteTemplateKey || 'default');
    const layoutKey = String(page.layoutKey || 'default');
    const layoutMode = String(page.layoutMode || 'flow');
    const regions = effective.regionsJson;
    const headerVariant = String(asRecord(regions.header).variant || 'travel');
    const brandName =
      (typeof asRecord(org.brandingJson).companyName === 'string' &&
        String(asRecord(org.brandingJson).companyName)) ||
      org.name;

    const resolvedMenus = resolveSiteMenus(site);
    let primaryItems = resolveMenuForLocation(
      resolvedMenus.menusJson,
      resolvedMenus.menuAssignmentsJson,
      'primary',
    );
    if (!primaryItems.length) {
      const pageRows = await this.prisma.presencePage.findMany({
        where: { siteId: site.id, ...(opts.preview ? {} : { status: 'published' }) },
        orderBy: [{ position: 'asc' }, { path: 'asc' }],
        select: { path: true, title: true },
      });
      primaryItems = pageRows.map((row, i) => ({
        id: `page_${i}`,
        label: row.title,
        path: row.path,
        type: 'page' as const,
      }));
    }
    const footerItems = resolveMenuForLocation(
      resolvedMenus.menusJson,
      resolvedMenus.menuAssignmentsJson,
      'footer',
    );
    const navHtml = renderMenuNavHtml(
      primaryItems,
      path,
      escapeHtml,
      (p) => this.normalizePath(p),
    );
    const footerNavHtml = renderFooterMenuHtml(footerItems, escapeHtml);

    const ctx = {
      apiUrl,
      orgRef,
      publicKey,
      widgetId,
      siteId: site.id,
      path,
      theme: tokens as unknown as Record<string, unknown>,
      formByKey,
      preview: Boolean(opts.preview),
      layoutMode,
    };

    const tree = this.buildSectionTree(page.sections as SectionRow[]);
    const resolveCtx = {
      organizationId: org.id,
      org: {
        id: org.id,
        name: org.name,
        brandingJson: org.brandingJson,
        settingsJson: org.settingsJson,
      },
      site: {
        id: site.id,
        name: site.name,
        primaryDomain: site.primaryDomain,
        platformSlug: site.platformSlug,
        settingsJson: site.settingsJson,
      },
      page: { id: page.id, path: page.path, title: page.title },
      visitor: opts.visitor,
      now,
      preview: Boolean(opts.preview),
    };
    const vars = this.contentEngine.resolveVariables(resolveCtx);
    const sectionsHtmlParts: string[] = [];
    for (const section of tree) {
      const resolvedProps = await this.contentEngine.resolveSectionProps(
        resolveCtx,
        asRecord(section.propsJson),
      );
      if (!resolvedProps) continue;
      section.propsJson = resolvedProps;
      sectionsHtmlParts.push(await this.renderSectionNode(section, ctx));
    }
    const sectionsHtml =
      layoutMode === 'freeform'
        ? `<div class="freeform-stage">${sectionsHtmlParts.join('\n')}</div>`
        : sectionsHtmlParts.join('\n');

    const responsiveCss = this.collectResponsiveCss(page.sections as SectionRow[]);

    const globalRegions = asRecord(site.globalRegionsJson);
    const footerRegion = asRecord(globalRegions.footer);
    const headerRegion = asRecord(globalRegions.header);
    const announcementRegion = asRecord(globalRegions.announcement);
    const globalSectionRows = await this.prisma.presenceGlobalSection.findMany({
      where: { siteId: site.id, enabled: true },
    });
    const globalBySlot = new Map(globalSectionRows.map((row) => [row.slotKey, row]));
    const announcementFromGlobal = globalBySlot.get('announcement');
    const announcementProps = announcementFromGlobal
      ? asRecord(announcementFromGlobal.propsJson)
      : announcementRegion;
    const stickyCta = globalBySlot.get('sticky_cta');
    const stickyProps = stickyCta ? asRecord(stickyCta.propsJson) : {};
    const cookieBanner = globalBySlot.get('cookie');
    const cookieProps = cookieBanner ? asRecord(cookieBanner.propsJson) : {};
    const footerText = this.contentEngine.interpolate(
      String(footerRegion.note || brandName),
      vars,
    );
    const footerSecondary =
      typeof footerRegion.secondaryNote === 'string'
        ? this.contentEngine.interpolate(footerRegion.secondaryNote, vars)
        : '';
    const headerLogo = typeof headerRegion.logoUrl === 'string' ? headerRegion.logoUrl : '';
    const headerTagline =
      typeof headerRegion.tagline === 'string'
        ? this.contentEngine.interpolate(headerRegion.tagline, vars)
        : '';
    const headerCtaLabel =
      typeof headerRegion.ctaLabel === 'string'
        ? this.contentEngine.interpolate(headerRegion.ctaLabel, vars)
        : '';
    const headerCtaHref = typeof headerRegion.ctaHref === 'string' ? headerRegion.ctaHref : '/contact';
    const headerCtaAction =
      headerRegion.ctaAction === 'form_popup' || headerRegion.ctaAction === 'open_widget'
        ? headerRegion.ctaAction
        : 'link';
    const headerCtaFormKey =
      typeof headerRegion.ctaFormKey === 'string' && headerRegion.ctaFormKey.trim()
        ? headerRegion.ctaFormKey.trim()
        : 'contact';
    const showNav = headerRegion.showNav !== false;
    const announcementTextRaw =
      typeof announcementProps.text === 'string' ? announcementProps.text.trim() : '';
    const announcementText = announcementTextRaw
      ? this.contentEngine.interpolate(announcementTextRaw, vars)
      : '';
    const announcementHref =
      typeof announcementProps.href === 'string' ? announcementProps.href.trim() : '';
    const announcementHtml = announcementText
      ? `<div class="site-announcement">${
          announcementHref
            ? `<a class="site-announcement__link" href="${escapeHtml(announcementHref)}">${announcementText}</a>`
            : `<span class="site-announcement__text">${announcementText}</span>`
        }</div>`
      : '';
    const stickyLabelRaw =
      typeof stickyProps.label === 'string' ? stickyProps.label.trim() : '';
    const stickyLabel = stickyLabelRaw
      ? this.contentEngine.interpolate(stickyLabelRaw, vars)
      : '';
    const stickyHref =
      typeof stickyProps.href === 'string' ? stickyProps.href.trim() : '/contact';
    const stickyHtml = stickyLabel
      ? `<div class="site-sticky-cta"><a href="${escapeHtml(stickyHref)}">${stickyLabel}</a></div>`
      : '';
    const cookieTextRaw =
      typeof cookieProps.text === 'string' ? cookieProps.text.trim() : '';
    const cookieText = cookieTextRaw
      ? this.contentEngine.interpolate(cookieTextRaw, vars)
      : '';
    const cookieHtml = cookieText
      ? `<div class="site-cookie" role="dialog"><span>${cookieText}</span></div>`
      : '';
    const fontsHref = googleFontsHref(tokens.fontDisplay, tokens.fontBody);
    const orgChat = parseInboxChatSettings(org.settingsJson);
    const pathLists = pathsFromLegacyOrTarget({
      targetRulesJson: assignedWidget?.targetRulesJson,
      includePathsJson: assignedWidget?.includePathsJson,
      excludePathsJson: assignedWidget?.excludePathsJson,
    });
    const widgetPlacement = resolvePresenceWidgetPlacement({
      siteSettingsJson: siteSettings,
      pageSeoJson: page.seoJson,
      path,
      widget: assignedWidget
        ? {
            // Availability is enforced in widget.js (after-hours copy), not by hiding inject.
            // Placement/accent come from Inbox → Chat (org settings), not chatflow overrides.
            enabled: Boolean(assignedWidget.enabled && publicKey),
            position: placementSideToPosition(orgChat.placementSide),
            includePaths: pathLists.includePaths,
            excludePaths: pathLists.excludePaths,
          }
        : null,
    });
    const resolvedPosition = widgetPlacement.position;
    const widgetScript =
      widgetPlacement.show && publicKey && widgetId
        ? `<script src="${escapeHtml(widgetScriptSrc)}" data-org="${escapeHtml(orgRef)}" data-key="${escapeHtml(publicKey)}" data-api="${escapeHtml(widgetApiBase)}" data-widget="${escapeHtml(widgetId)}" data-site="${escapeHtml(site.id)}" data-path="${escapeHtml(path)}" data-source="presence" data-position="${escapeHtml(resolvedPosition)}" data-drag="${orgChat.allowDrag ? '1' : '0'}" data-color="${escapeHtml(orgChat.accentColor || '')}"></script>`
        : '';

    const headerInner = packageChrome.headerHtml
      ? `${packageChrome.headerHtml}${
          showNav
            ? `<!-- presence:site-nav — opaque package HTML cannot Liquid-bind menus yet; sibling nav injected for Primary -->
<nav class="site-nav site-nav--injected">${navHtml}</nav>`
            : ''
        }`
      : `<div class="site-header__inner">
      <a class="brand" href="/">${
        headerLogo
          ? `<img class="brand-logo" src="${escapeHtml(headerLogo)}" alt="${escapeHtml(brandName)}"/>`
          : ''
      }<span class="brand-text">${escapeHtml(brandName)}</span>${
        headerTagline ? `<span class="brand-tagline">${escapeHtml(headerTagline)}</span>` : ''
      }</a>
      ${showNav ? `<nav class="site-nav">${navHtml}</nav>` : ''}
      ${
        headerCtaLabel
          ? this.renderHeaderCtaHtml({
              label: headerCtaLabel,
              href: headerCtaHref,
              action: headerCtaAction,
              formKey: headerCtaFormKey,
            })
          : ''
      }
    </div>`;

    const formPopupHtml =
      headerCtaLabel && headerCtaAction === 'form_popup'
        ? this.renderFormPopupDialogHtml({
            formKey: headerCtaFormKey,
            formByKey,
            ctx: { apiUrl, orgRef, publicKey, widgetId, siteId: site.id, path },
            titleFallback: headerCtaLabel,
          })
        : '';
    const widgetOpenScript =
      headerCtaLabel && headerCtaAction === 'open_widget' ? this.renderWidgetOpenScript() : '';

    const footerInner = packageChrome.footerHtml
      ? `${packageChrome.footerHtml}${footerNavHtml}`
      : `<div class="site-footer__inner">
      <div>${escapeHtml(footerText)}</div>
      ${footerSecondary ? `<div class="site-footer__secondary">${escapeHtml(footerSecondary)}</div>` : ''}
      ${footerNavHtml}
    </div>`;

    const themeScriptTags = packageScripts
      .map((src) => `<script defer src="${escapeHtml(src)}"></script>`)
      .join('\n  ');

    const canonicalBase =
      typeof siteSeo.canonicalBase === 'string' ? siteSeo.canonicalBase : undefined;
    const headMeta = this.buildHeadMeta({
      pageTitle: page.title,
      brandName,
      pageSeo,
      siteSeo,
      pagePath: path,
      siteCanonicalBase: canonicalBase,
    });
    const analyticsScripts = this.buildAnalyticsScripts(analytics);
    const firstPartyAnalytics = this.buildFirstPartyAnalyticsScript({
      apiUrl,
      siteId: site.id,
      path,
      preview: Boolean(opts.preview),
    });

    const html = `<!DOCTYPE html>
<html lang="en" class="presence-public">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
${headMeta}
  ${analyticsScripts.head}
  ${fontsHref ? `<link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="${fontsHref}" rel="stylesheet"/>` : ''}
  <style>
${this.publicCss(tokens, parsePresenceSiteLayout(siteSettings))}
  .freeform-stage{position:relative;min-height:720px;width:100%;}
  .two-column,.presence-columns{display:grid;gap:1.5rem;}
  .two-column{grid-template-columns:1fr 1fr;}
  .container-slot{display:flex;flex-direction:column;gap:1rem;}
  @media (max-width:720px){.two-column,.presence-columns{grid-template-columns:1fr !important;}}
${responsiveCss}
${scopePresenceCss(packageCss, 'html.presence-public')}
  .presence-package-frame{width:100%;border:0;display:block;min-height:120px;background:transparent;}
  </style>
</head>
<body class="presence-public theme-${escapeHtml(themeKey)} template-${escapeHtml(templateKey)} layout-${escapeHtml(layoutKey)} layout-mode-${escapeHtml(layoutMode)} header-${escapeHtml(headerVariant)}">
  ${analyticsScripts.body}
  ${announcementHtml}
  <header class="site-header">
    ${headerInner}
  </header>
  <main class="site-main">${sectionsHtml}</main>
  <footer class="site-footer">
    ${footerInner}
  </footer>
  ${stickyHtml}
  ${cookieHtml}
  ${formPopupHtml}
  ${widgetScript}
  ${widgetOpenScript}
  ${themeScriptTags}
  ${firstPartyAnalytics}
</body>
</html>`;
    return { status: 200, html };
  }

  /**
   * Catalog “Preview site” for themes that are not yet applied to an org site.
   * Renders the theme’s embedded defaultSiteStructure home page with live modules.
   */
  async renderThemeStarterPreview(opts: {
    organizationId: string;
    themeId: string;
    path?: string;
  }): Promise<{ html: string; status: number }> {
    const theme = await this.prisma.presenceTheme.findFirst({
      where: {
        id: opts.themeId,
        OR: [{ isSystem: true }, { organizationId: opts.organizationId }],
      },
    });
    if (!theme) {
      return {
        status: 404,
        html: this.simpleHtml('Theme not found', '<p>Unknown theme.</p>'),
      };
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: opts.organizationId, deletedAt: null },
      select: { id: true, name: true, brandingJson: true, settingsJson: true },
    });
    if (!org) {
      return {
        status: 404,
        html: this.simpleHtml('Organization not found', '<p>Unknown workspace.</p>'),
      };
    }

    let parentTheme: PresenceThemeLike | null = null;
    if (theme.parentThemeId) {
      parentTheme = (await this.prisma.presenceTheme.findFirst({
        where: { id: theme.parentThemeId },
      })) as PresenceThemeLike | null;
    }
    const effective = resolveEffectiveTheme(theme as PresenceThemeLike, (id) =>
      parentTheme && parentTheme.id === id ? parentTheme : null,
    );

    const manifest = asRecord(theme.manifestJson);
    const structure = asRecord(manifest.defaultSiteStructure);
    const pages = Array.isArray(structure.pages) ? structure.pages : [];
    if (!pages.length) {
      return {
        status: 404,
        html: this.simpleHtml(
          theme.name,
          '<p>This theme has no starter site pages to preview. Create a website to try it.</p>',
        ),
      };
    }

    const path = this.normalizePath(opts.path || '/');
    const pageRows = pages.map((row) => asRecord(row));
    const pageDef =
      pageRows.find((row) => this.normalizePath(String(row.path || '/')) === path) ||
      pageRows.find((row) => this.normalizePath(String(row.path || '/')) === '/') ||
      pageRows[0]!;
    const pagePath = this.normalizePath(String(pageDef.path || '/'));
    const pageTitle = String(pageDef.title || theme.name);
    const layoutMode =
      pageDef.layoutMode === 'freeform' || pageDef.layoutMode === 'flow'
        ? pageDef.layoutMode
        : 'flow';
    const layoutKey = String(pageDef.layoutKey || 'default');
    const rawSections = Array.isArray(pageDef.sections) ? pageDef.sections : [];
    const sectionDefs = normalizeTemplateSections(rawSections);

    const moduleKeys = [
      ...new Set(sectionDefs.map((d) => d.moduleKey || d.type).filter(Boolean)),
    ];
    const modules = moduleKeys.length
      ? await this.prisma.presenceModuleDefinition.findMany({
          where: {
            key: { in: moduleKeys },
            OR: [{ isSystem: true }, { organizationId: opts.organizationId }],
          },
        })
      : [];
    const moduleByKey = new Map<string, (typeof modules)[number]>();
    for (const mod of modules) {
      const existing = moduleByKey.get(mod.key);
      if (
        !existing ||
        (!mod.isSystem && mod.organizationId === opts.organizationId)
      ) {
        moduleByKey.set(mod.key, mod);
      }
    }

    const refToId = new Map<string, string>();
    for (let i = 0; i < sectionDefs.length; i += 1) {
      refToId.set(sectionDefs[i]!.ref, `preview_${i}`);
    }
    const sectionRows: SectionRow[] = sectionDefs.map((def, i) => {
      const lookupKey = def.moduleKey || def.type;
      const mod = lookupKey ? moduleByKey.get(lookupKey) : undefined;
      return {
        id: refToId.get(def.ref) || `preview_${i}`,
        type: def.type,
        parentId: def.parentRef ? refToId.get(def.parentRef) ?? null : null,
        slotKey: def.slotKey,
        propsJson: def.propsJson,
        position: def.position,
        moduleDefinition: mod
          ? {
              templateSource: mod.templateSource,
              moduleSource: mod.moduleSource,
              rendererKey: mod.rendererKey,
              defaultPropsJson: mod.defaultPropsJson,
              assetsJson: mod.assetsJson,
            }
          : null,
      };
    });

    const packageCss = await this.themePackages.resolvePackageCss(opts.organizationId, theme);
    const packageScripts = await this.themePackages.resolvePackageScripts(theme);
    const packageChrome = await this.themePackages.resolvePackageChrome(theme);
    const themeKey = String(effective.key || theme.key || 'horizon');
    const themeTokens = applyStylePreset(themeKey, asRecord(effective.tokensJson), null);
    const tokens = this.resolveTokens(themeTokens);
    const regions = effective.regionsJson;
    const headerVariant = String(asRecord(regions.header).variant || 'travel');
    const brandName =
      (typeof asRecord(org.brandingJson).companyName === 'string' &&
        String(asRecord(org.brandingJson).companyName)) ||
      org.name;

    const menus = menusFromStructure(structure);
    let primaryItems = resolveMenuForLocation(
      menus.menusJson,
      menus.menuAssignmentsJson,
      'primary',
    );
    if (!primaryItems.length) {
      primaryItems = pageRows.map((row, i) => ({
        id: `page_${i}`,
        label: String(row.title || `Page ${i + 1}`),
        path: this.normalizePath(String(row.path || '/')),
        type: 'page' as const,
      }));
    }
    const footerItems = resolveMenuForLocation(
      menus.menusJson,
      menus.menuAssignmentsJson,
      'footer',
    );
    const navHtml = renderMenuNavHtml(
      primaryItems,
      pagePath,
      escapeHtml,
      (p) => this.normalizePath(p),
    );
    const footerNavHtml = renderFooterMenuHtml(footerItems, escapeHtml);

    const forms = await this.prisma.presenceFormDefinition.findMany({
      where: { organizationId: org.id, isActive: true },
    });
    const formByKey = new Map(forms.map((f) => [f.key, f]));
    const ctx = {
      apiUrl: '',
      orgRef: '',
      publicKey: '',
      widgetId: undefined as string | undefined,
      siteId: undefined as string | undefined,
      path: pagePath,
      theme: tokens as unknown as Record<string, unknown>,
      formByKey,
      preview: true,
      layoutMode,
    };

    const tree = this.buildSectionTree(sectionRows);
    const sectionsHtmlParts: string[] = [];
    for (const section of tree) {
      sectionsHtmlParts.push(await this.renderSectionNode(section, ctx));
    }
    const sectionsHtml =
      layoutMode === 'freeform'
        ? `<div class="freeform-stage">${sectionsHtmlParts.join('\n')}</div>`
        : sectionsHtmlParts.join('\n');
    const responsiveCss = this.collectResponsiveCss(sectionRows);

    const globalRegions = asRecord(structure.globalRegions);
    const footerRegion = asRecord(globalRegions.footer);
    const headerRegion = asRecord(globalRegions.header);
    const announcementRegion = asRecord(globalRegions.announcement);
    const footerText = String(footerRegion.note || brandName);
    const footerSecondary =
      typeof footerRegion.secondaryNote === 'string' ? footerRegion.secondaryNote : '';
    const headerLogo = typeof headerRegion.logoUrl === 'string' ? headerRegion.logoUrl : '';
    const headerTagline =
      typeof headerRegion.tagline === 'string' ? headerRegion.tagline : '';
    const headerCtaLabel =
      typeof headerRegion.ctaLabel === 'string' ? headerRegion.ctaLabel : '';
    const headerCtaHref =
      typeof headerRegion.ctaHref === 'string' ? headerRegion.ctaHref : '/contact';
    const headerCtaAction =
      headerRegion.ctaAction === 'form_popup' || headerRegion.ctaAction === 'open_widget'
        ? headerRegion.ctaAction
        : 'link';
    const headerCtaFormKey =
      typeof headerRegion.ctaFormKey === 'string' && headerRegion.ctaFormKey.trim()
        ? headerRegion.ctaFormKey.trim()
        : 'contact';
    const showNav = headerRegion.showNav !== false;
    const announcementText =
      typeof announcementRegion.text === 'string' ? announcementRegion.text.trim() : '';
    const announcementHref =
      typeof announcementRegion.href === 'string' ? announcementRegion.href.trim() : '';
    const announcementHtml = announcementText
      ? `<div class="site-announcement">${
          announcementHref
            ? `<a class="site-announcement__link" href="${escapeHtml(announcementHref)}">${escapeHtml(announcementText)}</a>`
            : `<span class="site-announcement__text">${escapeHtml(announcementText)}</span>`
        }</div>`
      : '';

    const fontsHref = googleFontsHref(tokens.fontDisplay, tokens.fontBody);
    const headerInner = packageChrome.headerHtml
      ? `${packageChrome.headerHtml}${
          showNav
            ? `<nav class="site-nav site-nav--injected">${navHtml}</nav>`
            : ''
        }`
      : `<div class="site-header__inner">
      <a class="brand" href="/">${
        headerLogo
          ? `<img class="brand-logo" src="${escapeHtml(headerLogo)}" alt="${escapeHtml(brandName)}"/>`
          : ''
      }<span class="brand-text">${escapeHtml(brandName)}</span>${
        headerTagline ? `<span class="brand-tagline">${escapeHtml(headerTagline)}</span>` : ''
      }</a>
      ${showNav ? `<nav class="site-nav">${navHtml}</nav>` : ''}
      ${
        headerCtaLabel
          ? this.renderHeaderCtaHtml({
              label: headerCtaLabel,
              href: headerCtaHref,
              action: headerCtaAction,
              formKey: headerCtaFormKey,
            })
          : ''
      }
    </div>`;
    const formPopupHtml =
      headerCtaLabel && headerCtaAction === 'form_popup'
        ? this.renderFormPopupDialogHtml({
            formKey: headerCtaFormKey,
            formByKey,
            ctx: {
              apiUrl: ctx.apiUrl,
              orgRef: ctx.orgRef,
              publicKey: ctx.publicKey,
              widgetId: ctx.widgetId,
              siteId: ctx.siteId,
              path: ctx.path,
            },
            titleFallback: headerCtaLabel,
          })
        : '';
    const widgetOpenScript =
      headerCtaLabel && headerCtaAction === 'open_widget' ? this.renderWidgetOpenScript() : '';
    const footerInner = packageChrome.footerHtml
      ? `${packageChrome.footerHtml}${footerNavHtml}`
      : `<div class="site-footer__inner">
      <div>${escapeHtml(footerText)}</div>
      ${footerSecondary ? `<div class="site-footer__secondary">${escapeHtml(footerSecondary)}</div>` : ''}
      ${footerNavHtml}
    </div>`;
    const themeScriptTags = packageScripts
      .map((src) => `<script defer src="${escapeHtml(src)}"></script>`)
      .join('\n  ');

    const templateKey = String(manifest.defaultSiteTemplateKey || 'default');
    const html = `<!DOCTYPE html>
<html lang="en" class="presence-public">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(pageTitle)} · ${escapeHtml(theme.name)} (preview)</title>
  <meta name="robots" content="noindex,nofollow"/>
  ${fontsHref ? `<link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="${fontsHref}" rel="stylesheet"/>` : ''}
  <style>
${this.publicCss(tokens, parsePresenceSiteLayout({}))}
  .freeform-stage{position:relative;min-height:720px;width:100%;}
  .two-column,.presence-columns{display:grid;gap:1.5rem;}
  .two-column{grid-template-columns:1fr 1fr;}
  .container-slot{display:flex;flex-direction:column;gap:1rem;}
  @media (max-width:720px){.two-column,.presence-columns{grid-template-columns:1fr !important;}}
${responsiveCss}
${scopePresenceCss(packageCss, 'html.presence-public')}
  .presence-package-frame{width:100%;border:0;display:block;min-height:120px;background:transparent;}
  .presence-theme-preview-banner{position:sticky;top:0;z-index:50;background:#0f172a;color:#f8fafc;font:500 12px/1.4 system-ui,sans-serif;padding:0.55rem 1rem;text-align:center;}
  </style>
</head>
<body class="presence-public theme-${escapeHtml(themeKey)} template-${escapeHtml(templateKey)} layout-${escapeHtml(layoutKey)} layout-mode-${escapeHtml(layoutMode)} header-${escapeHtml(headerVariant)}">
  <div class="presence-theme-preview-banner">Theme preview · ${escapeHtml(theme.name)} · starter site (not published)</div>
  ${announcementHtml}
  <header class="site-header">
    ${headerInner}
  </header>
  <main class="site-main">${sectionsHtml}</main>
  <footer class="site-footer">
    ${footerInner}
  </footer>
  ${formPopupHtml}
  ${widgetOpenScript}
  ${themeScriptTags}
</body>
</html>`;
    return { status: 200, html };
  }

  async renderModulePreview(input: {
    rendererKey: string;
    propsJson?: Record<string, unknown>;
    templateSource?: string | null;
    moduleSource?: string | null;
    themeTokens?: Record<string, unknown>;
  }) {
    const tokens = this.resolveTokens(input.themeTokens || {});
    const html = await this.renderSection(
      input.rendererKey,
      input.propsJson || {},
      new Map(),
      {
        apiUrl: '',
        orgRef: '',
        publicKey: '',
        theme: tokens as unknown as Record<string, unknown>,
      },
      {
        templateSource: input.templateSource,
        moduleSource: input.moduleSource,
      },
      [],
    );
    return { html };
  }

  private async renderCollectionPath(opts: {
    org: { id: string; name: string; brandingJson?: unknown; settingsJson?: unknown };
    site: {
      id: string;
      name: string;
      primaryDomain?: string | null;
      platformSlug?: string | null;
      settingsJson?: unknown;
    };
    path: string;
    preview: boolean;
    apiUrl: string;
    brandName: string;
  }): Promise<{ html: string; status: number } | null> {
    const collections = await this.prisma.presenceCollection.findMany({
      where: { siteId: opts.site.id },
    });
    for (const col of collections) {
      const listing = this.normalizePath(col.listingPath || `/${col.key}`);
      const detailPattern = (col.detailPathPattern || `${listing}/:slug`).replace(/\/$/, '');
      if (opts.path === listing) {
        const entries = await this.prisma.presenceCollectionEntry.findMany({
          where: {
            collectionId: col.id,
            ...(opts.preview ? {} : { status: 'published' }),
          },
          orderBy: { publishedAt: 'desc' },
          take: 50,
        });
        const items = entries
          .map(
            (e) =>
              `<li><a href="${escapeHtml(`${listing}/${e.slug}`)}">${escapeHtml(e.title)}</a></li>`,
          )
          .join('');
        return {
          status: 200,
          html: this.simpleHtml(
            `${col.name} · ${opts.brandName}`,
            `<h1>${escapeHtml(col.name)}</h1><ul>${items || '<li>No entries yet.</li>'}</ul><p><a href="/">Home</a></p>`,
          ),
        };
      }
      const prefix = detailPattern.replace(/:slug$/, '').replace(/\/$/, '');
      if (opts.path.startsWith(`${prefix}/`) && opts.path !== listing) {
        const slug = opts.path.slice(prefix.length + 1);
        if (slug && !slug.includes('/')) {
          const entry = await this.prisma.presenceCollectionEntry.findFirst({
            where: {
              collectionId: col.id,
              slug,
              ...(opts.preview ? {} : { status: 'published' }),
            },
          });
          if (!entry) continue;
          const data = asRecord(entry.dataJson);
          const body =
            typeof data.body === 'string'
              ? data.body
              : typeof data.content === 'string'
                ? data.content
                : '';
          return {
            status: 200,
            html: this.simpleHtml(
              `${entry.title} · ${opts.brandName}`,
              `<article><h1>${escapeHtml(entry.title)}</h1><div>${
                body ? escapeHtml(body).replace(/\n/g, '<br/>') : ''
              }</div><p><a href="${escapeHtml(listing)}">← ${escapeHtml(col.name)}</a></p></article>`,
            ),
          };
        }
      }
    }
    return null;
  }

  private buildFirstPartyAnalyticsScript(opts: {
    apiUrl: string;
    siteId: string;
    path: string;
    preview: boolean;
  }) {
    if (opts.preview || !opts.apiUrl) return '';
    const endpoint = `${opts.apiUrl}/presence/public/events`;
    return `<script>(function(){try{var k='presence_vid';var v=localStorage.getItem(k);if(!v){v=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem(k,v);}var payload={siteId:${JSON.stringify(opts.siteId)},eventType:'page_view',path:${JSON.stringify(opts.path)},visitorId:v,metaJson:{}};navigator.sendBeacon&&navigator.sendBeacon(${JSON.stringify(endpoint)},new Blob([JSON.stringify(payload)],{type:'application/json'}));document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a'):null;if(!a)return;var href=a.getAttribute('href')||'';var type=null;if(/wa\\.me|whatsapp/i.test(href))type='whatsapp_click';else if(a.classList&&(a.classList.contains('btn')||a.classList.contains('header-cta')))type='cta_click';if(!type)return;fetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteId:${JSON.stringify(opts.siteId)},eventType:type,path:${JSON.stringify(opts.path)},visitorId:v,metaJson:{href:href}}),keepalive:true});});}catch(e){}})();</script>`;
  }

  private buildSectionTree(sections: SectionRow[]) {
    type Node = SectionRow & { children: Node[] };
    const byId = new Map<string, Node>();
    for (const section of sections) {
      byId.set(section.id, { ...section, children: [] });
    }
    const roots: Node[] = [];
    for (const section of sections) {
      const node = byId.get(section.id)!;
      if (section.parentId && byId.has(section.parentId)) {
        byId.get(section.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortRec = (nodes: Node[]) => {
      nodes.sort((a, b) => a.position - b.position);
      for (const n of nodes) sortRec(n.children);
    };
    sortRec(roots);
    return roots;
  }

  private async renderSectionNode(
    section: SectionRow & { children?: Array<SectionRow & { children?: SectionRow[] }> },
    ctx: {
      apiUrl: string;
      orgRef: string;
      publicKey: string;
      widgetId?: string;
      siteId?: string;
      path?: string;
      theme: Record<string, unknown>;
      formByKey: Map<string, { key: string; name: string; fieldsJson: unknown; ingestMode: string }>;
      preview: boolean;
      layoutMode: string;
    },
  ): Promise<string> {
    const children = section.children || [];
    let childrenHtml: string[] = [];

    if (section.type === 'two_column') {
      const left: string[] = [];
      const right: string[] = [];
      for (const child of children) {
        const html = await this.renderSectionNode(child, ctx);
        if (child.slotKey === 'right') right.push(html);
        else left.push(html);
      }
      childrenHtml = [
        `<div class="container-slot" data-slot="left">${left.join('\n')}</div>`,
        `<div class="container-slot" data-slot="right">${right.join('\n')}</div>`,
      ];
    } else if (section.type === 'columns') {
      const props = asRecord(section.propsJson);
      const slots = columnSlotKeys(props.columnCount);
      const bySlot = new Map<string, string[]>();
      for (const slot of slots) bySlot.set(slot, []);
      for (const child of children) {
        const html = await this.renderSectionNode(child, ctx);
        const key =
          typeof child.slotKey === 'string' && bySlot.has(child.slotKey)
            ? child.slotKey
            : slots[0]!;
        bySlot.get(key)!.push(html);
      }
      childrenHtml = slots.map(
        (slot) =>
          `<div class="container-slot" data-slot="${slot}">${(bySlot.get(slot) || []).join('\n')}</div>`,
      );
    } else {
      for (const child of children) {
        childrenHtml.push(await this.renderSectionNode(child, ctx));
      }
    }

    const inner = await this.renderSection(
      section.type,
      asRecord(section.propsJson),
      ctx.formByKey,
      {
        apiUrl: ctx.apiUrl,
        orgRef: ctx.orgRef,
        publicKey: ctx.publicKey,
        widgetId: ctx.widgetId,
        siteId: ctx.siteId,
        path: ctx.path,
        theme: ctx.theme,
      },
      section.moduleDefinition,
      childrenHtml,
      section.slotKey,
    );

    const props = asRecord(section.propsJson);
    const frame = parseFreeformFrame(props.frame);
    const freeform =
      ctx.layoutMode === 'freeform' && !section.parentId && frame
        ? freeformFrameStyle(frame)
        : '';
    return this.wrapSection(section.id, inner, ctx.preview, freeform, props);
  }

  private resolveTokens(themeTokens: Record<string, unknown>): ThemeTokens {
    const primary = String(themeTokens.primary || '#0f766e');
    return {
      primary,
      accent: String(themeTokens.accent || primary),
      bg: String(themeTokens.background || '#f8fafc'),
      fg: String(themeTokens.foreground || '#0f172a'),
      muted: String(themeTokens.muted || '#64748b'),
      surface: String(themeTokens.surface || '#ffffff'),
      surfaceMuted: String(themeTokens.surfaceMuted || '#eef2f7'),
      border: String(themeTokens.border || 'rgba(15,23,42,.1)'),
      radius: String(themeTokens.radius || '14px'),
      heroFrom: String(themeTokens.heroFrom || primary),
      heroTo: String(themeTokens.heroTo || '#0f172a'),
      fontDisplay: String(
        themeTokens.fontDisplay || themeTokens.fontHeading || 'Georgia, serif',
      ),
      fontBody: String(themeTokens.fontBody || 'system-ui, sans-serif'),
    };
  }

  /**
   * Mount a built component package in a sandboxed iframe.
   * Bundle should set window.PresenceMount = (el, props, ctx) => … or
   * window.PresenceComponent = { mount, unmount? }.
   */
  private renderPackageSection(
    moduleDef: SectionRow['moduleDefinition'],
    props: Record<string, unknown>,
    theme: Record<string, unknown>,
  ): string {
    const assets = asRecord(moduleDef?.assetsJson);
    const packageHtml = String(assets.packageHtml || '');
    const packageCss = String(assets.packageCss || '');
    const jsUrls = Array.isArray(assets.jsUrls)
      ? assets.jsUrls.filter((u): u is string => typeof u === 'string')
      : [];
    const height = Number(props.minHeight || props.height || 240);
    const propsJson = JSON.stringify(props).replace(/</g, '\\u003c');
    const themeJson = JSON.stringify(theme).replace(/</g, '\\u003c');
    const scriptTags = jsUrls
      .map((src) => `<script src="${escapeHtml(src)}"></script>`)
      .join('\n');
    const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
html,body{margin:0;padding:0;background:transparent;}
${packageCss}
</style></head><body>
${packageHtml || '<div id="root"></div>'}
<script>window.__PRESENCE_PROPS__=${propsJson};window.__PRESENCE_CTX__={tokens:${themeJson},api:null};</script>
${scriptTags}
<script>
(function(){
  var root = document.getElementById('root') || document.body;
  var props = window.__PRESENCE_PROPS__ || {};
  var ctx = window.__PRESENCE_CTX__ || {};
  var mount = (window.PresenceMount)
    || (window.PresenceComponent && window.PresenceComponent.mount)
    || null;
  if (typeof mount === 'function') {
    try { mount(root, props, ctx); } catch (e) { root.textContent = 'Package mount error'; }
  }
  function postH(){
    try {
      var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, ${Math.max(80, height)});
      parent.postMessage({ type: 'presence-package-height', height: h }, '*');
    } catch (e) {}
  }
  postH();
  setTimeout(postH, 50);
  setTimeout(postH, 250);
})();
</script>
</body></html>`;
    const escaped = srcdoc
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
    return `<iframe class="presence-package-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Package component" srcdoc="${escaped}" style="min-height:${Math.max(80, height)}px"></iframe>`;
  }

  private publicCss(t: ThemeTokens, layout?: { contentMax: string; gutter: string; sectionGap: string }) {
    const contentMax = layout?.contentMax || '1100px';
    const gutter = layout?.gutter || '1rem';
    const sectionGap = layout?.sectionGap || '2.75rem';
    return `
    :root {
      --primary:${t.primary};
      --accent:${t.accent};
      --bg:${t.bg};
      --fg:${t.fg};
      --muted:${t.muted};
      --surface:${t.surface};
      --surface-muted:${t.surfaceMuted};
      --border:${t.border};
      --radius:${t.radius};
      --hero-from:${t.heroFrom};
      --hero-to:${t.heroTo};
      --font-display:${t.fontDisplay};
      --font-body:${t.fontBody};
      --shadow:0 18px 50px rgba(15,23,42,.08);
      --max:${contentMax};
      --gutter:${gutter};
      --section-gap:${sectionGap};
    }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body {
      margin:0;
      font-family:var(--font-body);
      background:
        radial-gradient(1200px 480px at 10% -10%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 60%),
        radial-gradient(900px 420px at 100% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 55%),
        var(--bg);
      color:var(--fg);
      line-height:1.6;
      -webkit-font-smoothing:antialiased;
      overflow-x:hidden;
    }
    a { color:inherit; }
    .site-announcement {
      background:var(--primary);
      color:#fff;
      text-align:center;
      font-size:.875rem;
      font-weight:600;
      padding:.55rem 1rem;
    }
    .site-announcement__link, .site-announcement__text {
      color:inherit;
      text-decoration:none;
    }
    .site-announcement__link:hover { text-decoration:underline; }
    .site-sticky-cta {
      position:fixed; right:1rem; bottom:1rem; z-index:40;
    }
    .site-sticky-cta a {
      display:inline-flex; padding:.7rem 1rem; border-radius:999px;
      background:var(--primary); color:#fff; font-weight:600; text-decoration:none;
      box-shadow:0 8px 24px rgba(0,0,0,.18);
    }
    .site-cookie {
      position:fixed; left:1rem; right:1rem; bottom:1rem; z-index:39;
      max-width:36rem; margin:0 auto; padding:.85rem 1rem; border-radius:.75rem;
      background:var(--surface); border:1px solid var(--border); color:var(--fg);
      font-size:.85rem; box-shadow:0 8px 24px rgba(0,0,0,.12);
    }
    .site-header {
      position:sticky; top:0; z-index:20;
      backdrop-filter:blur(12px);
      background:color-mix(in srgb, var(--surface) 86%, transparent);
      border-bottom:1px solid var(--border);
    }
    .site-header__inner, .site-footer__inner {
      width:min(var(--max), calc(100% - 2 * var(--gutter)));
      margin-inline:auto;
    }
    /*
      Site column is always centered (matches builder canvas).
      boxWidth + contentAlign only size/position the module *inside* that column —
      they must not pin the whole column to the left of a wide viewport.
    */
    .site-main > [data-presence-section-id] {
      display:flex;
      box-sizing:border-box;
      width:min(var(--max), calc(100% - 2 * var(--gutter)));
      margin-inline:auto;
      justify-content:flex-start;
    }
    .site-main > [data-presence-section-id][data-box-width="content"] { --box-max:480px; }
    .site-main > [data-presence-section-id][data-box-width="wide"] { --box-max:720px; }
    .site-main > [data-presence-section-id][data-box-width="full"] { --box-max:100%; }
    .site-main > [data-presence-section-id][data-content-align="left"] { justify-content:flex-start; }
    .site-main > [data-presence-section-id][data-content-align="right"] { justify-content:flex-end; }
    .site-main > [data-presence-section-id][data-content-align="center"] { justify-content:center; }
    .site-main > [data-presence-section-id] > * {
      box-sizing:border-box;
      width:min(var(--box-max, 100%), 100%);
      max-width:100%;
      min-width:0;
    }
    .site-header__inner {
      display:flex; align-items:center; justify-content:space-between; gap:1rem;
      padding:1rem 0;
    }
    .brand {
      font-family:var(--font-display);
      font-size:1.35rem; font-weight:700; letter-spacing:-0.03em;
      text-decoration:none; color:var(--fg);
      display:inline-flex; align-items:center; gap:.65rem; min-width:0;
    }
    .brand-logo { height:2rem; width:auto; object-fit:contain; border-radius:6px; }
    .brand-text { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .brand-tagline { display:none; font-size:.72rem; font-weight:560; color:var(--muted); letter-spacing:0; }
    @media (min-width:720px) { .brand-tagline { display:inline; } }
    .header-cta {
      display:inline-flex; align-items:center; justify-content:center;
      padding:.45rem .9rem; border-radius:calc(var(--radius) - 4px);
      background:var(--primary); color:#fff; text-decoration:none;
      font-size:.85rem; font-weight:650; white-space:nowrap;
      border:0; cursor:pointer; font-family:inherit; line-height:1.2;
    }
    .presence-form-dialog {
      border:0; padding:0; margin:auto;
      max-width:min(26rem, calc(100vw - 1.5rem));
      width:100%;
      background:transparent;
    }
    .presence-form-dialog::backdrop {
      background:rgba(15,23,42,.48);
    }
    .presence-form-dialog__panel {
      position:relative;
      background:var(--surface);
      color:var(--fg);
      border:1px solid var(--border);
      border-radius:calc(var(--radius) + 2px);
      padding:1.35rem 1.25rem 1.25rem;
      box-shadow:0 24px 60px rgba(15,23,42,.22);
    }
    .presence-form-dialog__close {
      position:absolute; top:.65rem; right:.65rem;
      width:2rem; height:2rem; border:0; border-radius:999px;
      background:color-mix(in srgb, var(--muted) 14%, transparent);
      color:var(--fg); cursor:pointer; font-size:1.15rem; line-height:1;
    }
    .presence-form-dialog__close:hover {
      background:color-mix(in srgb, var(--muted) 24%, transparent);
    }
    .presence-form-dialog .form-card { box-shadow:none; border:0; padding:0; background:transparent; }
    .presence-form-dialog .section-title { font-size:1.35rem; }
    .site-nav { display:flex; flex-wrap:wrap; gap:.25rem .85rem; align-items:center; }
    .site-nav--injected { margin-top:.5rem; }
    .nav-item { position:relative; display:inline-flex; align-items:center; }
    .nav-item.has-children:hover .nav-dropdown,
    .nav-item.has-children:focus-within .nav-dropdown { display:block; }
    .nav-dropdown {
      display:none; position:absolute; top:100%; left:0; z-index:20;
      min-width:10rem; margin:0; padding:.35rem 0; list-style:none;
      background:var(--surface); border:1px solid var(--border);
      border-radius:calc(var(--radius) - 4px);
      box-shadow:0 8px 24px rgba(0,0,0,.08);
    }
    .nav-dropdown .nav-link { display:block; padding:.35rem .85rem; border-bottom:none; white-space:nowrap; }
    .nav-link {
      display:inline-flex; align-items:center; gap:.35rem;
      text-decoration:none; color:var(--muted); font-size:.92rem; font-weight:560;
      padding:.25rem 0; border-bottom:2px solid transparent;
    }
    .nav-link:hover, .nav-link.is-active { color:var(--fg); border-bottom-color:var(--primary); }
    .nav-icon {
      display:inline-flex; width:1em; height:1em; flex-shrink:0;
      color:inherit;
    }
    .nav-icon__svg { width:100%; height:100%; display:block; }
    .site-footer-nav { display:flex; flex-wrap:wrap; gap:.5rem 1rem; margin-top:.75rem; }
    .footer-nav-link {
      display:inline-flex; align-items:center; gap:.3rem;
      color:inherit; text-decoration:none; font-size:.85rem; opacity:.9;
    }
    .footer-nav-link:hover { opacity:1; text-decoration:underline; }
    .site-footer__secondary { margin-top:.35rem; font-size:.8rem; opacity:.85; }
    .site-main {
      display:flex; flex-direction:column; gap:var(--section-gap);
      padding:1.25rem 0 4.5rem;
    }
    .layout-landing .site-main { padding-top:2rem; }
    .site-main > section,
    .site-main > [data-presence-section-id] > section { width:100%; margin:0; }
    .eyebrow {
      display:inline-flex; align-items:center; gap:.5rem;
      margin:0 0 .85rem; padding:.28rem .7rem;
      border-radius:999px; font-size:.72rem; font-weight:700;
      letter-spacing:.08em; text-transform:uppercase;
      color:var(--primary);
      background:color-mix(in srgb, var(--primary) 12%, var(--surface));
    }
    .section-title {
      font-family:var(--font-display);
      font-size:clamp(1.55rem, 3vw, 2.15rem);
      line-height:1.15; letter-spacing:-0.03em;
      margin:0 0 .75rem;
    }
    .section-lead { margin:0 0 1.5rem; color:var(--muted); max-width:42rem; font-size:1.05rem; }
    .btn {
      display:inline-flex; align-items:center; justify-content:center;
      background:var(--primary); color:#fff; padding:.78rem 1.25rem;
      border-radius:calc(var(--radius) - 4px); text-decoration:none; border:none;
      cursor:pointer; font:inherit; font-weight:650; letter-spacing:-0.01em;
      box-shadow:0 10px 24px color-mix(in srgb, var(--primary) 28%, transparent);
      transition:transform .15s ease, box-shadow .15s ease, background .15s ease;
    }
    .btn:hover { transform:translateY(-1px); }
    .btn-secondary {
      display:inline-flex; align-items:center; justify-content:center;
      background:transparent; color:var(--fg); padding:.78rem 1.15rem;
      border-radius:calc(var(--radius) - 4px); text-decoration:none;
      border:1px solid var(--border); font-weight:600;
    }
    .hero-actions { display:flex; flex-wrap:wrap; gap:.75rem; margin-top:1.5rem; }

    .hero {
      position:relative;
      overflow:hidden;
      padding:clamp(2.5rem, 6vw, 4.5rem) clamp(1.25rem, 4vw, 3rem);
      border-radius:calc(var(--radius) + 6px);
      color:var(--presence-section-color, #fff);
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--hero-from) 92%, #000) 0%, var(--hero-to) 100%);
      background:var(--presence-section-bg);
      box-shadow:var(--shadow);
      isolation:isolate;
    }
    .hero::after {
      content:""; position:absolute; inset:auto -20% -40% auto; width:55%; height:70%;
      background:radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent), transparent 70%);
      pointer-events:none; z-index:0;
    }
    .hero > * { position:relative; z-index:1; }
    .hero .eyebrow {
      color:var(--presence-section-color, #fff);
      background:color-mix(in srgb, var(--presence-section-color, #fff) 14%, transparent);
    }
    .hero h1 {
      font-family:var(--font-display);
      font-size:clamp(2.2rem, 6vw, 3.6rem);
      line-height:1.05; letter-spacing:-0.04em;
      margin:0 0 .9rem; max-width:14ch;
      color:inherit;
    }
    .hero p {
      margin:0; max-width:36rem; font-size:1.12rem;
      color:color-mix(in srgb, var(--presence-section-color, #fff) 86%, transparent);
    }
    .hero .btn { background:#fff; color:var(--hero-from); box-shadow:none; }
    .hero .btn-secondary {
      color:var(--presence-section-color, #fff);
      border-color:color-mix(in srgb, var(--presence-section-color, #fff) 35%, transparent);
    }

    .hero-variant-minimal {
      background:var(--presence-section-bg, var(--surface));
      color:var(--presence-section-color, var(--fg));
      border:1px solid var(--border);
      box-shadow:none;
    }
    .hero-variant-minimal::after { display:none; }
    .hero-variant-minimal .eyebrow {
      color:var(--presence-section-color, var(--primary));
      background:color-mix(in srgb, var(--presence-section-color, var(--primary)) 12%, var(--surface));
    }
    .hero-variant-minimal h1 { max-width:18ch; }
    .hero-variant-minimal p { color:var(--muted); }
    .hero-variant-minimal .btn { background:var(--primary); color:#fff; }
    .hero-variant-minimal .btn-secondary { color:var(--presence-section-color, var(--fg)); border-color:var(--border); }

    .hero-variant-split {
      display:grid; gap:1.5rem;
      background:
        linear-gradient(160deg, var(--surface) 0 48%, transparent 48%),
        linear-gradient(135deg, var(--hero-from), var(--hero-to));
      background:var(--presence-section-bg);
      color:var(--presence-section-color, var(--fg));
    }
    .hero-variant-split::after { display:none; }
    .hero-variant-split .hero-copy { padding-right:1rem; }
    .hero-variant-split .eyebrow { color:var(--primary); background:color-mix(in srgb, var(--primary) 12%, var(--surface)); }
    .hero-variant-split p { color:var(--muted); }
    .hero-variant-split .btn { background:var(--primary); color:#fff; }
    .hero-variant-split .btn-secondary { color:var(--fg); border-color:var(--border); }
    @media (min-width:820px) {
      .hero-variant-split { grid-template-columns:1.1fr .9fr; align-items:end; }
    }
    .hero-variant-immersive {
      min-height:min(72vh, 560px); display:flex; align-items:flex-end;
      padding:clamp(2rem, 5vw, 3.5rem) clamp(1.25rem, 3vw, 2rem);
      border-radius:calc(var(--radius) + 6px);
    }
    .hero-variant-immersive .hero-copy { max-width:38rem; }

    .prose-block {
      padding:1.75rem; border-radius:var(--radius);
      background:var(--surface); border:1px solid var(--border);
      box-shadow:0 1px 0 rgba(255,255,255,.5) inset;
    }
    .prose-block p { margin:0 0 1rem; color:color-mix(in srgb, var(--fg) 88%, var(--muted)); font-size:1.05rem; }
    .prose-block p:last-child { margin-bottom:0; }

    .gallery-grid {
      display:grid; gap:.85rem;
      grid-template-columns:repeat(2, minmax(0,1fr));
    }
    @media (min-width:760px) {
      .gallery-grid { grid-template-columns:repeat(4, minmax(0,1fr)); }
      .gallery-grid .gallery-item:first-child { grid-column:span 2; grid-row:span 2; }
    }
    .gallery-item {
      margin:0; overflow:hidden; border-radius:calc(var(--radius) - 2px);
      background:var(--surface-muted); border:1px solid var(--border);
      aspect-ratio:4/3;
    }
    .gallery-item:first-child { aspect-ratio:auto; min-height:220px; }
    .gallery-item img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .35s ease; }
    .gallery-item:hover img { transform:scale(1.04); }

    .quote-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); }
    .quote-card {
      margin:0; padding:1.35rem 1.4rem;
      border-radius:var(--radius); background:var(--surface);
      border:1px solid var(--border); box-shadow:var(--shadow);
    }
    .quote-card p {
      margin:0 0 1rem; font-family:var(--font-display);
      font-size:1.15rem; line-height:1.35; letter-spacing:-0.02em;
    }
    .quote-card cite { color:var(--muted); font-style:normal; font-size:.9rem; font-weight:600; }

    .faq-list { display:grid; gap:.75rem; }
    .faq-item {
      padding:1rem 1.15rem; border-radius:var(--radius);
      background:var(--surface); border:1px solid var(--border);
    }
    .faq-item dt { font-weight:700; margin:0 0 .35rem; }
    .faq-item dd { margin:0; color:var(--muted); }

    .cta-band {
      text-align:center; padding:clamp(2rem, 5vw, 3rem);
      border-radius:calc(var(--radius) + 4px);
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--primary) 92%, #000), var(--hero-to));
      color:#fff; box-shadow:var(--shadow);
    }
    .cta-band .eyebrow { color:#fff; background:rgba(255,255,255,.14); }
    .cta-band .section-title { color:#fff; }
    .cta-band .section-lead { color:rgba(255,255,255,.84); margin-inline:auto; }
    .cta-band .btn { background:#fff; color:var(--hero-from); box-shadow:none; }
    .cta-card {
      text-align:center; padding:2rem;
      border-radius:var(--radius); background:var(--surface);
      border:1px solid var(--border); box-shadow:var(--shadow);
    }

    .form-section { width:100%; display:flex; justify-content:center; }
    .form-section--align-left { justify-content:flex-start; }
    .form-section--align-right { justify-content:flex-end; }
    .form-section--full .form-card { max-width:none; }
    .form-section--wide .form-card { max-width:720px; }
    .form-card {
      width:100%;
      padding:clamp(1.35rem, 3vw, 2rem);
      border-radius:calc(var(--radius) + 2px);
      background:var(--surface); border:1px solid var(--border);
      box-shadow:var(--shadow); max-width:560px;
    }
    .form-card label { display:block; font-size:.86rem; font-weight:600; margin:1rem 0 .35rem; }
    .form-card label:first-of-type { margin-top:.35rem; }
    .form-card input, .form-card textarea {
      width:100%; padding:.72rem .85rem;
      border:1px solid color-mix(in srgb, var(--border) 80%, #94a3b8);
      border-radius:calc(var(--radius) - 4px);
      background:color-mix(in srgb, var(--surface) 92%, var(--bg));
      color:var(--fg); font:inherit;
    }
    .form-card input:focus, .form-card textarea:focus {
      outline:2px solid color-mix(in srgb, var(--primary) 35%, transparent);
      border-color:var(--primary);
    }
    .form-card .btn { margin-top:1.15rem; width:100%; }

    .site-footer {
      border-top:1px solid var(--border);
      background:color-mix(in srgb, var(--surface) 70%, var(--bg));
      color:var(--muted); font-size:.9rem;
    }
    .site-footer__inner { padding:2rem 0; text-align:center; }

    body.theme-portfolio_ink {
      background:var(--bg);
    }
    body.theme-portfolio_ink .hero-variant-minimal h1 { max-width:22ch; }
    body.theme-hospitality_luxe .brand { letter-spacing:0.04em; text-transform:uppercase; font-size:1.05rem; }
    body.theme-homestay_hearth .hero { border-radius:28px; }
    body.header-portfolio .site-header { border-bottom-color:transparent; }
    body.header-hotel .nav-link { letter-spacing:.04em; text-transform:uppercase; font-size:.75rem; }

    @media (max-width:640px) {
      .site-header__inner { flex-direction:column; align-items:flex-start; }
      .hero h1 { max-width:none; }
      .gallery-grid { grid-template-columns:1fr 1fr; }
    }
    ${extraModulesCss()}
`;
  }

  private async resolveSiteContextFromHost(host: string, preview?: boolean) {
    const h = host.split(':')[0]?.toLowerCase() || '';
    if (!h) return null;

    const domainVariants = siteDomainLookupVariants(h);
    if (domainVariants.length) {
      const siteByDomain = await this.prisma.presenceSite.findFirst({
        where: {
          primaryDomain: { in: domainVariants },
          ...(preview ? {} : { status: 'published' }),
        },
        include: { organization: true, theme: true },
      });
      if (siteByDomain) {
        return { org: siteByDomain.organization, site: siteByDomain };
      }
    }

    const platformHost = parseSitePlatformHost(h, this.orgIdentity.siteBaseDomain());
    if (platformHost) {
      const org = await this.prisma.organization.findFirst({
        where: { publicCode: platformHost.publicCode, deletedAt: null },
      });
      if (org) {
        if (platformHost.kind === 'site') {
          const site = await this.prisma.presenceSite.findFirst({
            where: {
              organizationId: org.id,
              platformSlug: platformHost.platformSlug,
              ...(preview ? {} : { status: 'published' }),
            },
            include: { theme: true },
          });
          if (site) return { org, site };
        } else {
          const site = await this.prisma.presenceSite.findFirst({
            where: {
              organizationId: org.id,
              ...(preview ? {} : { status: 'published' }),
            },
            include: { theme: true },
            orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
          });
          if (site) return { org, site };
        }
      }
    }

    const org = await this.resolveOrgFromHost(h);
    if (!org) return null;

    const site = await this.prisma.presenceSite.findFirst({
      where: {
        organizationId: org.id,
        ...(preview ? {} : { status: 'published' }),
      },
      include: { theme: true },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    });
    return { org, site };
  }

  private async resolveOrgFromHost(host: string) {
    const h = host.split(':')[0]?.toLowerCase() || '';
    const subdomain = this.orgIdentity.subdomainFromHost(h);
    if (subdomain) {
      try {
        return await this.orgIdentity.resolve({ subdomain });
      } catch {
        /* noop */
      }
    }
    try {
      return await this.orgIdentity.resolve({ customDomain: h });
    } catch {
      return null;
    }
  }

  /** Resolve org for public media/assets by Host (per-site domain or org subdomain/custom). */
  async resolveOrganizationIdForPublicHost(host: string): Promise<string | null> {
    const ctx = await this.resolveSiteContextFromHost(host, true);
    return ctx?.org.id ?? null;
  }

  private normalizePath(path: string) {
    let p = (path || '/').trim();
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  private buildHeadMeta(opts: {
    pageTitle: string;
    brandName: string;
    pageSeo: Record<string, unknown>;
    siteSeo: Record<string, unknown>;
    pagePath: string;
    siteCanonicalBase?: string;
    publicUrl?: string;
  }): string {
    const pageSeoTitle =
      typeof opts.pageSeo.title === 'string' && opts.pageSeo.title.trim()
        ? opts.pageSeo.title.trim()
        : '';
    const titleSuffix =
      typeof opts.siteSeo.titleSuffix === 'string' && opts.siteSeo.titleSuffix.trim()
        ? opts.siteSeo.titleSuffix.trim()
        : '';
    const title = pageSeoTitle
      ? pageSeoTitle
      : `${opts.pageTitle}${titleSuffix ? ` · ${titleSuffix}` : ` · ${opts.brandName}`}`;

    const description =
      (typeof opts.pageSeo.description === 'string' && opts.pageSeo.description.trim()) ||
      (typeof opts.siteSeo.defaultDescription === 'string' &&
        opts.siteSeo.defaultDescription.trim()) ||
      '';

    const noindex = opts.pageSeo.noindex === true || opts.siteSeo.noindex === true;
    const robotsExplicit =
      (typeof opts.pageSeo.robots === 'string' && opts.pageSeo.robots.trim()) ||
      (typeof opts.siteSeo.robots === 'string' && opts.siteSeo.robots.trim()) ||
      '';
    const robots = noindex ? 'noindex, nofollow' : robotsExplicit;

    const ogTitle =
      (typeof opts.pageSeo.ogTitle === 'string' && opts.pageSeo.ogTitle.trim()) || title;
    const ogDescription =
      (typeof opts.pageSeo.ogDescription === 'string' && opts.pageSeo.ogDescription.trim()) ||
      description;
    const ogImage =
      (typeof opts.pageSeo.ogImage === 'string' && opts.pageSeo.ogImage.trim()) ||
      (typeof opts.siteSeo.defaultOgImage === 'string' && opts.siteSeo.defaultOgImage.trim()) ||
      '';

    const canonicalFromPage =
      typeof opts.pageSeo.canonical === 'string' && opts.pageSeo.canonical.trim()
        ? opts.pageSeo.canonical.trim()
        : '';
    const base = (opts.siteCanonicalBase || opts.publicUrl || '').replace(/\/$/, '');
    const canonical =
      canonicalFromPage ||
      (base ? `${base}${opts.pagePath === '/' ? '/' : opts.pagePath}` : '');

    const lines = [`  <title>${escapeHtml(title)}</title>`];
    if (description) {
      lines.push(`  <meta name="description" content="${escapeHtml(description)}"/>`);
    }
    if (robots) {
      lines.push(`  <meta name="robots" content="${escapeHtml(robots)}"/>`);
    }
    lines.push(`  <meta property="og:title" content="${escapeHtml(ogTitle)}"/>`);
    if (ogDescription) {
      lines.push(`  <meta property="og:description" content="${escapeHtml(ogDescription)}"/>`);
    }
    if (ogImage) {
      lines.push(`  <meta property="og:image" content="${escapeHtml(ogImage)}"/>`);
    }
    if (canonical) {
      lines.push(`  <link rel="canonical" href="${escapeHtml(canonical)}"/>`);
    }
    return lines.join('\n');
  }

  private buildAnalyticsScripts(analytics: Record<string, unknown>): {
    head: string;
    body: string;
  } {
    const headParts: string[] = [];
    const bodyParts: string[] = [];

    const gtmId =
      typeof analytics.googleTagManagerId === 'string'
        ? analytics.googleTagManagerId.trim()
        : '';
    if (gtmId && /^GTM-[A-Z0-9]+$/i.test(gtmId)) {
      const id = escapeHtml(gtmId);
      headParts.push(`<!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${id}');</script>
  <!-- End Google Tag Manager -->`);
      bodyParts.push(`<!-- Google Tag Manager (noscript) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <!-- End Google Tag Manager (noscript) -->`);
    }

    const gaId =
      typeof analytics.googleAnalyticsId === 'string'
        ? analytics.googleAnalyticsId.trim()
        : '';
    if (gaId && /^G-[A-Z0-9]+$/i.test(gaId)) {
      const id = escapeHtml(gaId);
      headParts.push(`<!-- Google Analytics (GA4) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${id}');
  </script>`);
    }

    const pixelId =
      typeof analytics.metaPixelId === 'string' ? analytics.metaPixelId.trim() : '';
    if (pixelId && /^\d{5,20}$/.test(pixelId)) {
      const id = escapeHtml(pixelId);
      headParts.push(`<!-- Meta Pixel -->
  <script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window,document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '${id}');
  fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/></noscript>`);
    }

    const customHead =
      typeof analytics.customHeadHtml === 'string' ? analytics.customHeadHtml.trim() : '';
    if (customHead) {
      // Org-owned settings — inject raw (trusted tenant content).
      headParts.push(`<!-- presence:custom-head -->
  ${customHead}
  <!-- /presence:custom-head -->`);
    }

    return {
      head: headParts.join('\n  '),
      body: bodyParts.join('\n  '),
    };
  }

  private simpleHtml(title: string, body: string) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui;padding:2rem">${body}</body></html>`;
  }

  private wrapSection(
    sectionId: string,
    html: string,
    preview: boolean,
    extraStyle = '',
    props: Record<string, unknown> = {},
  ) {
    const style = extraStyle ? ` style="${extraStyle}"` : '';
    const boxWidth =
      props.boxWidth === 'content' || props.boxWidth === 'wide' || props.boxWidth === 'full'
        ? props.boxWidth
        : 'full';
    // Default left = left *within* the centered site column (see publicCss).
    // Never use align margins to pin the column to the viewport edge.
    const contentAlign =
      props.contentAlign === 'left' ||
      props.contentAlign === 'center' ||
      props.contentAlign === 'right'
        ? props.contentAlign
        : 'left';
    // Always stamp an id so responsive media queries and preview selection can target the node.
    return `<div data-presence-section-id="${escapeHtml(sectionId)}" data-box-width="${boxWidth}" data-content-align="${contentAlign}"${style}>${html}</div>`;
  }

  private collectResponsiveCss(sections: SectionRow[]) {
    return sections
      .map((section) => {
        const props = asRecord(section.propsJson);
        const styleCss = responsiveCssForSection(section.id, props);
        const frameCss =
          !section.parentId && props.frame
            ? freeformResponsiveCss(section.id, parseFreeformFrame(props.frame))
            : '';
        return [styleCss, frameCss].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n');
  }

  private eyebrowHtml(value: unknown) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? `<div class="eyebrow">${escapeHtml(text)}</div>` : '';
  }

  private renderHeaderCtaHtml(opts: {
    label: string;
    href: string;
    action: 'link' | 'form_popup' | 'open_widget';
    formKey: string;
  }) {
    if (opts.action === 'form_popup') {
      return `<button type="button" class="header-cta" data-presence-form-popup="${escapeHtml(opts.formKey)}" aria-haspopup="dialog">${escapeHtml(opts.label)}</button>`;
    }
    if (opts.action === 'open_widget') {
      return `<button type="button" class="header-cta" data-presence-open-widget aria-haspopup="dialog">${escapeHtml(opts.label)}</button>`;
    }
    return `<a class="header-cta" href="${escapeHtml(opts.href || '/contact')}">${escapeHtml(opts.label)}</a>`;
  }

  private renderWidgetOpenScript() {
    return `<script>(function(){document.querySelectorAll('[data-presence-open-widget]').forEach(function(btn){btn.addEventListener('click',function(e){e.preventDefault();window.__wrWidgetPendingOpen=true;window.__cpWidgetPendingOpen=true;var w=window.WayruneWidget||window.CodePoetryWidget;if(w&&typeof w.open==='function'){w.open();return;}window.dispatchEvent(new CustomEvent('wr-widget:open'));window.dispatchEvent(new CustomEvent('cp-widget:open'));setTimeout(function(){var ready=window.WayruneWidget||window.CodePoetryWidget;if(!ready||!ready.isReady||!ready.isReady()){alert('Chat is not available. Assign an enabled widget in Digital Presence → Widgets and Website settings.');}},800);});});})();</script>`;
  }

  private resolveFormFields(
    form: { fieldsJson: unknown; name: string; ingestMode: string } | undefined,
  ) {
    const fields = Array.isArray(form?.fieldsJson)
      ? (form!.fieldsJson as Array<Record<string, unknown>>)
      : [
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'message', label: 'Message', type: 'textarea', required: true },
        ];
    return {
      fields,
      mode: form?.ingestMode || 'contact',
      name: form?.name || 'Contact',
    };
  }

  private renderIngestFormInnerHtml(opts: {
    formKey: string;
    title: string;
    introHtml?: string;
    eyebrowHtml?: string;
    formId: string;
    fields: Array<Record<string, unknown>>;
    mode: string;
    ctx: {
      apiUrl: string;
      orgRef: string;
      publicKey: string;
      widgetId?: string;
      siteId?: string;
      path?: string;
    };
  }) {
    const fieldHtml = opts.fields
      .map((f) => {
        const name = String(f.name || '');
        const label = String(f.label || name);
        const required = f.required === true ? 'required' : '';
        const inputType = String(f.type || 'text');
        return inputType === 'textarea'
          ? `<label>${escapeHtml(label)}<textarea name="${escapeHtml(name)}" ${required} rows="4"></textarea></label>`
          : `<label>${escapeHtml(label)}<input type="${escapeHtml(inputType)}" name="${escapeHtml(name)}" ${required}/></label>`;
      })
      .join('');
    return `${opts.eyebrowHtml || ''}<h2 class="section-title">${escapeHtml(opts.title)}</h2>${opts.introHtml || ''}<form id="${escapeHtml(opts.formId)}">${fieldHtml}<button class="btn" type="submit">Send</button><p class="form-status" style="color:var(--muted);font-size:.875rem;min-height:1.2em"></p></form><script>(function(){var form=document.getElementById(${JSON.stringify(opts.formId)});if(!form)return;form.addEventListener('submit',function(e){e.preventDefault();var fd=new FormData(form);var status=form.querySelector('.form-status');var body={organizationId:${JSON.stringify(opts.ctx.orgRef)},publicKey:${JSON.stringify(opts.ctx.publicKey)},mode:${JSON.stringify(opts.mode)},formKey:${JSON.stringify(opts.formKey)},contactName:fd.get('name')||null,email:fd.get('email')||null,phone:fd.get('phone')||null,destinations:fd.get('destinations')||null,message:fd.get('message')||null,widgetId:${JSON.stringify(opts.ctx.widgetId || null)},siteId:${JSON.stringify(opts.ctx.siteId || null)},path:${JSON.stringify(opts.ctx.path || null)},pageUrl:typeof location!=='undefined'?location.href:null,source:'presence',idempotencyKey:'form_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)};if(!body.publicKey){if(status)status.textContent='Chat widget not configured. Assign a widget in Digital Presence → Widgets / Website settings.';return;}fetch(${JSON.stringify(`${opts.ctx.apiUrl}/leads/widget/ingest`)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw new Error('failed');if(status)status.textContent='Thanks — we received your message.';form.reset();}).catch(function(){if(status)status.textContent='Could not send. Please try again.';});});})();</script>`;
  }

  private renderFormPopupDialogHtml(opts: {
    formKey: string;
    formByKey: Map<string, { key: string; name: string; fieldsJson: unknown; ingestMode: string }>;
    ctx: {
      apiUrl: string;
      orgRef: string;
      publicKey: string;
      widgetId?: string;
      siteId?: string;
      path?: string;
    };
    titleFallback: string;
  }) {
    const form = opts.formByKey.get(opts.formKey);
    const resolved = this.resolveFormFields(form);
    const formId = `pf_popup_${opts.formKey.replace(/[^a-z0-9_]/gi, '_')}`;
    const inner = this.renderIngestFormInnerHtml({
      formKey: opts.formKey,
      title: resolved.name || opts.titleFallback || 'Get in touch',
      formId,
      fields: resolved.fields,
      mode: resolved.mode,
      ctx: opts.ctx,
    });
    return `<dialog class="presence-form-dialog" id="presence-form-popup" aria-label="${escapeHtml(resolved.name || opts.titleFallback)}"><div class="presence-form-dialog__panel"><button type="button" class="presence-form-dialog__close" data-presence-form-close aria-label="Close">×</button><section class="form-card">${inner}</section></div></dialog><script>(function(){var dlg=document.getElementById('presence-form-popup');if(!dlg||typeof dlg.showModal!=='function')return;function openDlg(){try{dlg.showModal();}catch(e){}}document.querySelectorAll('[data-presence-form-popup]').forEach(function(btn){btn.addEventListener('click',function(e){e.preventDefault();openDlg();});});var closeBtn=dlg.querySelector('[data-presence-form-close]');if(closeBtn)closeBtn.addEventListener('click',function(){dlg.close();});dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close();});})();</script>`;
  }

  private applyStyleShell(html: string, props: Record<string, unknown>) {
    const style = stylePropsFromRecord(props);
    const cls = classAttr(style);
    const inline = inlineStyleAttr(style);
    if (!cls && !inline) return html;
    return `<div${cls}${inline}>${html}</div>`;
  }

  private layoutSectionHtml(
    type: 'container' | 'two_column' | 'columns',
    props: Record<string, unknown>,
    childrenHtml: string[],
  ) {
    const style = {
      ...stylePropsFromRecord(props),
      ...layoutBoxStyleFromProps(type, props),
    };
    const cls =
      type === 'container'
        ? classAttr(style, 'container-slot')
        : type === 'two_column'
          ? classAttr(style, 'two-column')
          : classAttr(style, 'presence-columns');
    const inline = inlineStyleAttr(style);
    const empty =
      type === 'container'
        ? '<p class="section-lead">Empty container</p>'
        : '<p class="section-lead">Empty columns</p>';
    if (type === 'two_column' && childrenHtml.length < 2) {
      return `<section${cls}${inline}><div class="container-slot">${childrenHtml[0] || ''}</div><div class="container-slot"></div></section>`;
    }
    return `<section${cls}${inline}>${childrenHtml.join(type === 'container' ? '\n' : '') || empty}</section>`;
  }

  private async renderSection(
    type: string,
    props: Record<string, unknown>,
    formByKey: Map<string, { key: string; name: string; ingestMode: string; fieldsJson: unknown }>,
    ctx: {
      apiUrl: string;
      orgRef: string;
      publicKey: string;
      widgetId?: string;
      siteId?: string;
      path?: string;
      theme?: Record<string, unknown>;
    },
    moduleDef?: {
      templateSource?: string | null;
      moduleSource?: string | null;
      rendererKey?: string;
      defaultPropsJson?: unknown;
    } | null,
    childrenHtml: string[] = [],
    _slotKey?: string | null,
  ): Promise<string> {
    const withStyle = (html: string) => this.applyStyleShell(html, props);

    if (type === 'hero') {
      const variant = String(props.variant || 'spotlight');
      const variantClass =
        variant === 'minimal'
          ? ' hero-variant-minimal'
          : variant === 'split'
            ? ' hero-variant-split'
            : variant === 'immersive'
              ? ' hero-variant-immersive'
              : '';
      const secondary =
        props.secondaryCtaLabel
          ? `<a class="btn-secondary" href="${escapeHtml(String(props.secondaryCtaHref || '#'))}">${escapeHtml(
              String(props.secondaryCtaLabel),
            )}</a>`
          : '';
      const primaryCta = props.ctaLabel
        ? `<a class="btn" href="${escapeHtml(String(props.ctaHref || '#'))}">${escapeHtml(
            String(props.ctaLabel),
          )}</a>`
        : '';
      const imageUrl = typeof props.imageUrl === 'string' ? props.imageUrl.trim() : '';
      const heroBg = imageUrl
        ? ` style="background-image:linear-gradient(135deg,color-mix(in srgb,var(--hero-from) 72%,transparent),color-mix(in srgb,var(--hero-to) 78%,transparent)),url('${escapeHtml(imageUrl)}');background-size:cover;background-position:center"`
        : '';
      return withStyle(`<section class="hero${variantClass}"${heroBg}><div class="hero-copy">${this.eyebrowHtml(props.eyebrow)}<h1>${escapeHtml(
        String(props.headline || ''),
      )}</h1>${
        props.subhead ? `<p>${escapeHtml(String(props.subhead))}</p>` : ''
      }${
        primaryCta || secondary ? `<div class="hero-actions">${primaryCta}${secondary}</div>` : ''
      }</div></section>`);
    }

    if (type === 'rich_text') {
      const body = String(props.body || props.html || '');
      const paragraphs = body
        .split(/\n{2,}/)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
        .join('');
      return withStyle(`<section class="prose-block">${this.eyebrowHtml(props.eyebrow)}${
        props.title ? `<h2 class="section-title">${escapeHtml(String(props.title))}</h2>` : ''
      }${paragraphs}</section>`);
    }

    if (type === 'faq') {
      const items = Array.isArray(props.items) ? props.items : [];
      return withStyle(`<section><div class="section-head">${this.eyebrowHtml(props.eyebrow)}<h2 class="section-title">${escapeHtml(
        String(props.title || 'FAQ'),
      )}</h2></div><dl class="faq-list">${items
        .map((item) => {
          const row = asRecord(item);
          return `<div class="faq-item"><dt>${escapeHtml(String(row.q || row.question || ''))}</dt><dd>${escapeHtml(
            String(row.a || row.answer || ''),
          )}</dd></div>`;
        })
        .join('')}</dl></section>`);
    }

    if (type === 'testimonials') {
      const items = Array.isArray(props.items) ? props.items : [];
      return withStyle(`<section><div class="section-head">${this.eyebrowHtml(props.eyebrow)}<h2 class="section-title">${escapeHtml(
        String(props.title || 'Testimonials'),
      )}</h2></div><div class="quote-grid">${items
        .map((item) => {
          const row = asRecord(item);
          return `<blockquote class="quote-card"><p>${escapeHtml(
            String(row.quote || ''),
          )}</p><cite>${escapeHtml(String(row.author || ''))}</cite></blockquote>`;
        })
        .join('')}</div></section>`);
    }

    if (type === 'cta' || type === 'widget_cta' || type === 'whatsapp_cta') {
      const chatStyle = type === 'widget_cta' || type === 'whatsapp_cta';
      const variant = chatStyle ? 'card' : String(props.variant || 'band');
      const note =
        chatStyle
          ? '<p class="section-lead">Or use the chat button in the corner.</p>'
          : props.body
            ? `<p class="section-lead">${escapeHtml(String(props.body))}</p>`
            : '';
      const className = variant === 'card' || chatStyle ? 'cta-card' : 'cta-band';
      return withStyle(`<section class="${className}">${this.eyebrowHtml(props.eyebrow)}<h2 class="section-title">${escapeHtml(
        String(props.title || 'Ready to talk?'),
      )}</h2>${note}<a class="btn" href="${escapeHtml(String(props.href || '#'))}">${escapeHtml(
        String(props.label || props.ctaLabel || 'Chat with us'),
      )}</a></section>`);
    }

    if (type === 'gallery') {
      const images = Array.isArray(props.images) ? props.images : [];
      return withStyle(`<section><div class="section-head">${this.eyebrowHtml(props.eyebrow)}<h2 class="section-title">${escapeHtml(
        String(props.title || 'Gallery'),
      )}</h2></div><div class="gallery-grid">${images
        .map((img) => {
          const row = typeof img === 'string' ? { url: img } : asRecord(img);
          const url = String(row.url || '');
          return url
            ? `<figure class="gallery-item"><img src="${escapeHtml(url)}" alt="${escapeHtml(
                String(row.alt || ''),
              )}" loading="lazy"/></figure>`
            : '';
        })
        .join('')}</div></section>`);
    }

    if (type === 'container') {
      return this.layoutSectionHtml('container', props, childrenHtml);
    }

    if (type === 'two_column') {
      return this.layoutSectionHtml('two_column', props, childrenHtml);
    }

    if (type === 'columns') {
      return this.layoutSectionHtml('columns', props, childrenHtml);
    }

    if (type === 'liquid') {
      const source =
        moduleDef?.templateSource ||
        (typeof props.templateSource === 'string' ? props.templateSource : '');
      try {
        const html = await this.liquid.render(source, {
          props,
          theme: ctx.theme || {},
          children: childrenHtml.join('\n'),
        });
        return withStyle(html);
      } catch (e) {
        return `<section><!-- liquid error: ${escapeHtml(e instanceof Error ? e.message : 'failed')} --></section>`;
      }
    }

    if (type === 'js_module') {
      const source =
        moduleDef?.moduleSource ||
        (typeof props.moduleSource === 'string' ? props.moduleSource : '');
      try {
        const html = this.jsModule.render(source, {
          props,
          theme: ctx.theme || {},
        });
        return withStyle(html);
      } catch (e) {
        return `<section><!-- js_module error: ${escapeHtml(e instanceof Error ? e.message : 'failed')} --></section>`;
      }
    }

    if (type === 'package') {
      return withStyle(this.renderPackageSection(moduleDef, props, ctx.theme || {}));
    }

    if (type === 'form') {
      const formKey = String(props.formKey || 'contact');
      const form = formByKey.get(formKey);
      const resolved = this.resolveFormFields(form);
      const title = String(props.title || resolved.name || 'Contact');
      const formId = `pf_${formKey.replace(/[^a-z0-9_]/gi, '_')}`;
      const intro = props.body
        ? `<p class="section-lead">${escapeHtml(String(props.body))}</p>`
        : '';
      const align = props.contentAlign === 'left' || props.contentAlign === 'right' ? props.contentAlign : 'center';
      const width = props.boxWidth === 'wide' || props.boxWidth === 'full' ? props.boxWidth : 'content';
      const inner = this.renderIngestFormInnerHtml({
        formKey,
        title,
        introHtml: intro,
        eyebrowHtml: this.eyebrowHtml(props.eyebrow),
        formId,
        fields: resolved.fields,
        mode: resolved.mode,
        ctx: {
          apiUrl: ctx.apiUrl,
          orgRef: ctx.orgRef,
          publicKey: ctx.publicKey,
          widgetId: ctx.widgetId,
          siteId: ctx.siteId,
          path: ctx.path,
        },
      });
      return withStyle(
        `<div class="form-section form-section--align-${align} form-section--${width}"><section class="form-card" id="form">${inner}</section></div>`,
      );
    }

    const extra = renderExtraModule(resolveRenderableModuleType(type), props, formByKey, {
      apiUrl: ctx.apiUrl,
      orgRef: ctx.orgRef,
      publicKey: ctx.publicKey,
    });
    if (extra) return withStyle(extra);

    return `<section><!-- unknown section ${escapeHtml(type)} --></section>`;
  }
}
