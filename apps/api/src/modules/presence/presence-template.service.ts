import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePresencePageFromTemplateInput,
  CreatePresenceSiteFromTemplateInput,
  CreatePresenceSiteFromThemeInput,
} from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { materializeSections } from './presence-structure-materialize';
import { menusFromStructure } from './presence-menus';
import { allocatePlatformSlug } from './presence-site-platform-host';
import {
  buildPageSuggest,
  buildSiteSuggest,
  suggestFromJson,
} from './presence-suggest-stamp';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class PresenceTemplateService {
  constructor(private prisma: PrismaService) {}

  async createSiteFromTemplate(
    organizationId: string,
    input: CreatePresenceSiteFromTemplateInput,
  ) {
    const [theme, template, org] = await Promise.all([
      this.prisma.presenceTheme.findFirst({
        where: { id: input.themeId, OR: [{ isSystem: true }, { organizationId }] },
      }),
      this.prisma.presenceSiteTemplate.findFirst({
        where: { id: input.siteTemplateId, OR: [{ isSystem: true }, { organizationId }] },
      }),
      this.prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { kind: true },
      }),
    ]);
    if (!theme) throw new BadRequestException('Theme not found');
    if (!template) throw new BadRequestException('Site template not found');

    return this.materializeSiteFromStructure({
      organizationId,
      theme,
      name: input.name,
      kind: input.kind,
      isPrimary: input.isPrimary,
      structure: asRecord(template.structureJson),
      settings: {
        themeKey: theme.key,
        siteTemplateKey: template.key,
      },
      templateId: template.id,
      orgKind: org?.kind,
      starterSuggest: suggestFromJson(template.suggestJson),
      overrides: input.suggestJson ?? undefined,
    });
  }

  /** Create a site from the theme's embedded defaultSiteStructure (full-site themes). */
  async createSiteFromTheme(organizationId: string, input: CreatePresenceSiteFromThemeInput) {
    const [theme, org] = await Promise.all([
      this.prisma.presenceTheme.findFirst({
        where: { id: input.themeId, OR: [{ isSystem: true }, { organizationId }] },
      }),
      this.prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { kind: true },
      }),
    ]);
    if (!theme) throw new BadRequestException('Theme not found');
    const manifest = asRecord(theme.manifestJson);
    const structure = asRecord(manifest.defaultSiteStructure);
    if (!Array.isArray(structure.pages) || structure.pages.length === 0) {
      throw new BadRequestException(
        'This theme has no built-in site pages. Pick a starter template, or upload a theme ZIP with site/structure.json.',
      );
    }
    return this.materializeSiteFromStructure({
      organizationId,
      theme,
      name: input.name,
      kind: input.kind,
      isPrimary: input.isPrimary,
      structure,
      settings: {
        themeKey: theme.key,
        fromThemeDefaultSite: true,
        defaultSiteTemplateKey: manifest.defaultSiteTemplateKey || null,
      },
      templateId: null,
      orgKind: org?.kind,
      overrides: input.suggestJson ?? undefined,
    });
  }

  private async materializeSiteFromStructure(input: {
    organizationId: string;
    theme: { id: string; key: string; suggestJson?: unknown };
    name: string;
    kind: string;
    isPrimary?: boolean;
    structure: Record<string, unknown>;
    settings: Record<string, unknown>;
    templateId: string | null;
    orgKind?: string | null;
    starterSuggest?: ReturnType<typeof suggestFromJson>;
    overrides?: ReturnType<typeof suggestFromJson>;
  }) {
    const pages = Array.isArray(input.structure.pages) ? input.structure.pages : [];
    const menus = menusFromStructure(input.structure);
    const globalRegions = asRecord(input.structure.globalRegions);
    const siteSuggest = buildSiteSuggest({
      orgKind: input.orgKind,
      siteKind: input.kind,
      themeSuggest: suggestFromJson(input.theme.suggestJson),
      starterSuggest: input.starterSuggest,
      overrides: input.overrides ?? undefined,
    });

    const count = await this.prisma.presenceSite.count({
      where: { organizationId: input.organizationId },
    });
    const isPrimary = input.isPrimary ?? count === 0;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.presenceSite.updateMany({
          where: { organizationId: input.organizationId },
          data: { isPrimary: false },
        });
      }
      const platformSlug = isPrimary ? null : await allocatePlatformSlug(tx);
      const createdSite = await tx.presenceSite.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          kind: input.kind,
          themeId: input.theme.id,
          templateId: input.templateId,
          isPrimary,
          platformSlug,
          status: 'draft',
          navigationJson: menus.navigationJson as Prisma.InputJsonValue,
          menusJson: menus.menusJson as Prisma.InputJsonValue,
          menuAssignmentsJson: menus.menuAssignmentsJson as Prisma.InputJsonValue,
          globalRegionsJson: globalRegions as Prisma.InputJsonValue,
          settingsJson: input.settings as Prisma.InputJsonValue,
          suggestJson: siteSuggest as Prisma.InputJsonValue,
        },
      });

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
            siteId: createdSite.id,
            path: pagePath,
            title: String(pageDef.title || `Page ${i + 1}`),
            layoutKey:
              typeof pageDef.layoutKey === 'string' ? pageDef.layoutKey : 'default',
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

        const sectionDefs = Array.isArray(pageDef.sections) ? pageDef.sections : [];
        await materializeSections({
          tx,
          pageId: createdPage.id,
          organizationId: input.organizationId,
          rawSections: sectionDefs,
        });
      }

      return tx.presenceSite.update({
        where: { id: createdSite.id },
        data: { homePageId },
        include: {
          theme: true,
          template: true,
          pages: { orderBy: { position: 'asc' } },
        },
      });
    });
  }

  async createPageFromTemplate(
    organizationId: string,
    input: CreatePresencePageFromTemplateInput,
  ) {
    const [site, template] = await Promise.all([
      this.prisma.presenceSite.findFirst({
        where: { id: input.siteId, organizationId },
      }),
      this.prisma.presencePageTemplate.findFirst({
        where: { id: input.pageTemplateId, OR: [{ isSystem: true }, { organizationId }] },
      }),
    ]);
    if (!site) throw new NotFoundException('Site not found');
    if (!template) throw new BadRequestException('Page template not found');

    const structure = asRecord(template.structureJson);
    const sections = Array.isArray(structure.sections) ? structure.sections : [];
    const layoutMode =
      structure.layoutMode === 'freeform' || structure.layoutMode === 'flow'
        ? structure.layoutMode
        : 'flow';
    const pageSuggest = buildPageSuggest({
      path: input.path,
      templateSuggest: suggestFromJson(template.suggestJson),
      overrides: input.suggestJson ?? undefined,
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const page = await tx.presencePage.create({
          data: {
            siteId: site.id,
            templateId: template.id,
            path: input.path,
            title: input.title,
            layoutKey: template.layoutKey ?? null,
            layoutMode,
            draftJson: structure as Prisma.InputJsonValue,
            suggestJson: pageSuggest as Prisma.InputJsonValue,
            position: input.position ?? 0,
            status: 'draft',
          },
        });
        await materializeSections({
          tx,
          pageId: page.id,
          organizationId,
          rawSections: sections,
        });
        return tx.presencePage.findUniqueOrThrow({
          where: { id: page.id },
          include: { sections: { orderBy: { position: 'asc' } }, site: true, template: true },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('A page with this path already exists');
      }
      throw e;
    }
  }
}
