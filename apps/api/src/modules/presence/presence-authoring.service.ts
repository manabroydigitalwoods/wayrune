import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PresenceGlobalSlotKeySchema,
  type CreatePresencePageInput,
  type CreatePresenceSiteInput,
  type SavePresenceBuilderInput,
  type UpdatePresencePageInput,
  type UpdatePresenceSiteInput,
  type UpsertPresenceGlobalSectionInput,
  type UpsertPresenceSectionInput,
} from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveEffectiveTheme,
  type PresenceThemeLike,
} from './presence-theme-resolve';
import { serializeSectionsForTemplate } from './presence-structure-materialize';
import { resolveSiteMenus } from './presence-menus';
import {
  assertValidSitePrimaryDomain,
  normalizeSitePrimaryDomain,
  siteDomainLookupVariants,
} from './presence-site-domain';
import {
  allocatePlatformSlug,
  buildSitePlatformHost,
} from './presence-site-platform-host';
import { OrgIdentityService } from '../organizations/org-identity.service';
import {
  asModuleVariations,
  buildPageSuggest,
  buildSiteSuggest,
  defaultVariation,
  mergeVariationProps,
  suggestFromJson,
} from './presence-suggest-stamp';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function enrichSiteMenus<T extends {
  navigationJson?: unknown;
  menusJson?: unknown;
  menuAssignmentsJson?: unknown;
}>(site: T): T {
  const resolved = resolveSiteMenus(site);
  return {
    ...site,
    menusJson: resolved.menusJson,
    menuAssignmentsJson: resolved.menuAssignmentsJson,
    navigationJson: resolved.navigationJson,
  };
}

function enrichSitePlatform<T extends {
  isPrimary?: boolean;
  platformSlug?: string | null;
}>(
  org: { publicCode: number },
  site: T,
  baseDomain: string,
): T & { platformHost: string } {
  return {
    ...site,
    platformHost: buildSitePlatformHost(org.publicCode, baseDomain, site),
  };
}

@Injectable()
export class PresenceAuthoringService {
  constructor(
    private prisma: PrismaService,
    private orgIdentity: OrgIdentityService,
  ) {}

  private async withEffectiveTheme<T extends { site?: { theme?: unknown } | null }>(page: T): Promise<T> {
    const theme = page.site?.theme as PresenceThemeLike | null | undefined;
    if (!theme?.id) return page;
    let parent: PresenceThemeLike | null = null;
    if (theme.parentThemeId) {
      parent = (await this.prisma.presenceTheme.findFirst({
        where: { id: theme.parentThemeId },
      })) as PresenceThemeLike | null;
    }
    const effective = resolveEffectiveTheme(theme, (id) =>
      parent && parent.id === id ? parent : null,
    );
    const packageCssParts = [String(asRecord(parent?.manifestJson).packageCss || '')];
    packageCssParts.push(String(asRecord(theme.manifestJson).packageCss || ''));
    const packageCss = packageCssParts.filter(Boolean).join('\n\n');
    return {
      ...page,
      site: {
        ...page.site,
        theme: {
          ...theme,
          effectiveTokensJson: effective.tokensJson,
          packageCss,
          tokensJson: effective.tokensJson,
        },
      },
    };
  }

  async listSites(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { publicCode: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const sites = await this.prisma.presenceSite.findMany({
      where: { organizationId },
      include: {
        theme: { select: { id: true, key: true, name: true } },
        template: { select: { id: true, key: true, name: true } },
        homePage: { select: { id: true, path: true, title: true } },
        _count: { select: { pages: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const baseDomain = this.orgIdentity.siteBaseDomain();
    const enriched = await Promise.all(
      sites.map(async (site) => {
        let row = site;
        if (!site.isPrimary && !site.platformSlug) {
          const platformSlug = await allocatePlatformSlug(this.prisma);
          row = await this.prisma.presenceSite.update({
            where: { id: site.id },
            data: { platformSlug },
            include: {
              theme: { select: { id: true, key: true, name: true } },
              template: { select: { id: true, key: true, name: true } },
              homePage: { select: { id: true, path: true, title: true } },
              _count: { select: { pages: true } },
            },
          });
        }
        return enrichSitePlatform(org, enrichSiteMenus(row), baseDomain);
      }),
    );
    return enriched;
  }

  async listPages(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { publicCode: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const baseDomain = this.orgIdentity.siteBaseDomain();

    const pages = await this.prisma.presencePage.findMany({
      where: { site: { organizationId } },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            status: true,
            isPrimary: true,
            primaryDomain: true,
            platformSlug: true,
            theme: { select: { id: true, key: true, name: true } },
          },
        },
        template: { select: { id: true, key: true, name: true } },
        _count: { select: { sections: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return pages.map((page) => ({
      ...page,
      site: enrichSitePlatform(org, page.site, baseDomain),
    }));
  }

  async getSite(organizationId: string, siteId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { publicCode: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    let site = await this.prisma.presenceSite.findFirst({
      where: { id: siteId, organizationId },
      include: {
        theme: true,
        template: true,
        homePage: true,
        pages: {
          orderBy: [{ position: 'asc' }, { path: 'asc' }],
          include: {
            template: { select: { id: true, key: true, name: true } },
            _count: { select: { sections: true } },
          },
        },
      },
    });
    if (!site) throw new NotFoundException('Site not found');

    if (!site.isPrimary && !site.platformSlug) {
      const platformSlug = await allocatePlatformSlug(this.prisma);
      site = await this.prisma.presenceSite.update({
        where: { id: site.id },
        data: { platformSlug },
        include: {
          theme: true,
          template: true,
          homePage: true,
          pages: {
            orderBy: [{ position: 'asc' }, { path: 'asc' }],
            include: {
              template: { select: { id: true, key: true, name: true } },
              _count: { select: { sections: true } },
            },
          },
        },
      });
    }

    return enrichSitePlatform(
      org,
      enrichSiteMenus(site),
      this.orgIdentity.siteBaseDomain(),
    );
  }

  async createSite(organizationId: string, input: CreatePresenceSiteInput) {
    const [theme, org, heroModule] = await Promise.all([
      this.prisma.presenceTheme.findFirst({
        where: { id: input.themeId, OR: [{ isSystem: true }, { organizationId }] },
      }),
      this.prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { kind: true },
      }),
      this.prisma.presenceModuleDefinition.findFirst({
        where: { key: 'hero', OR: [{ isSystem: true }, { organizationId }] },
        orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }],
        select: { variantsJson: true },
      }),
    ]);
    if (!theme) throw new BadRequestException('Theme not found');

    const existingCount = await this.prisma.presenceSite.count({ where: { organizationId } });
    const isPrimary = input.isPrimary ?? existingCount === 0;
    const seeded = resolveSiteMenus({
      navigationJson: input.navigationJson ?? [{ label: 'Home', path: '/' }],
      menusJson: input.menusJson,
      menuAssignmentsJson: input.menuAssignmentsJson,
    });

    const siteSuggest = buildSiteSuggest({
      orgKind: org?.kind,
      siteKind: input.kind,
      themeSuggest: suggestFromJson(theme.suggestJson),
      overrides: input.suggestJson ?? undefined,
    });
    const pageSuggest = buildPageSuggest({ path: '/' });
    const heroBase = {
      headline: input.name,
      subhead: 'Welcome — tell us how we can help.',
      ctaLabel: 'Get in touch',
      ctaHref: '/contact',
    };
    const heroProps = mergeVariationProps(
      heroBase,
      defaultVariation(asModuleVariations(heroModule?.variantsJson)),
    );

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.presenceSite.updateMany({
          where: { organizationId },
          data: { isPrimary: false },
        });
      }
      const platformSlug = isPrimary ? null : await allocatePlatformSlug(tx);
      const site = await tx.presenceSite.create({
        data: {
          organizationId,
          themeId: theme.id,
          templateId: input.templateId ?? null,
          name: input.name,
          kind: input.kind,
          isPrimary,
          platformSlug,
          status: 'draft',
          settingsJson: (input.settingsJson ?? {}) as Prisma.InputJsonValue,
          suggestJson: siteSuggest as Prisma.InputJsonValue,
          navigationJson: seeded.navigationJson as Prisma.InputJsonValue,
          menusJson: seeded.menusJson as Prisma.InputJsonValue,
          menuAssignmentsJson: seeded.menuAssignmentsJson as Prisma.InputJsonValue,
          globalRegionsJson:
            (input.globalRegionsJson ?? { header: {}, footer: {} }) as Prisma.InputJsonValue,
        },
      });
      const home = await tx.presencePage.create({
        data: {
          siteId: site.id,
          path: '/',
          title: 'Home',
          layoutKey: 'default',
          position: 0,
          status: 'draft',
          suggestJson: pageSuggest as Prisma.InputJsonValue,
          draftJson: {
            source: 'manual_site_create',
            sections: [
              {
                type: 'hero',
                propsJson: heroProps,
              },
            ],
          } as Prisma.InputJsonValue,
        },
      });
      await tx.presenceSection.create({
        data: {
          pageId: home.id,
          type: 'hero',
          propsJson: heroProps as Prisma.InputJsonValue,
          position: 0,
        },
      });
      return enrichSiteMenus(
        await tx.presenceSite.update({
          where: { id: site.id },
          data: { homePageId: home.id },
          include: { theme: true, homePage: true, pages: true },
        }),
      );
    });
  }

  async updateSite(organizationId: string, siteId: string, input: UpdatePresenceSiteInput) {
    const existing = await this.prisma.presenceSite.findFirst({
      where: { id: siteId, organizationId },
    });
    if (!existing) throw new NotFoundException('Site not found');

    let normalizedPrimaryDomain: string | null | undefined;
    if (input.primaryDomain !== undefined) {
      normalizedPrimaryDomain =
        input.primaryDomain === null
          ? null
          : normalizeSitePrimaryDomain(String(input.primaryDomain));
      if (normalizedPrimaryDomain) {
        try {
          assertValidSitePrimaryDomain(normalizedPrimaryDomain);
        } catch (e) {
          throw new BadRequestException(e instanceof Error ? e.message : 'Invalid domain');
        }
        const taken = await this.prisma.presenceSite.findFirst({
          where: { primaryDomain: normalizedPrimaryDomain, id: { not: siteId } },
          select: { id: true, name: true },
        });
        if (taken) {
          throw new BadRequestException(
            `Domain is already used by website "${taken.name}"`,
          );
        }
      }
    }

    let navigationJson: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined =
      input.navigationJson === undefined
        ? undefined
        : input.navigationJson === null
          ? Prisma.JsonNull
          : (input.navigationJson as Prisma.InputJsonValue);
    let menusJson: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined =
      input.menusJson === undefined
        ? undefined
        : input.menusJson === null
          ? Prisma.JsonNull
          : (input.menusJson as Prisma.InputJsonValue);
    let menuAssignmentsJson: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined =
      input.menuAssignmentsJson === undefined
        ? undefined
        : input.menuAssignmentsJson === null
          ? Prisma.JsonNull
          : (input.menuAssignmentsJson as Prisma.InputJsonValue);

    if (
      input.menusJson !== undefined ||
      input.menuAssignmentsJson !== undefined ||
      input.navigationJson !== undefined
    ) {
      const current = resolveSiteMenus(existing);

      if (input.menusJson != null) {
        const next = resolveSiteMenus({
          navigationJson: input.navigationJson ?? existing.navigationJson,
          menusJson: input.menusJson,
          menuAssignmentsJson:
            input.menuAssignmentsJson !== undefined
              ? input.menuAssignmentsJson
              : current.menuAssignmentsJson,
        });
        menusJson = next.menusJson as Prisma.InputJsonValue;
        navigationJson = next.navigationJson as Prisma.InputJsonValue;
        menuAssignmentsJson = next.menuAssignmentsJson as Prisma.InputJsonValue;
      } else if (input.navigationJson != null) {
        const fromNav = resolveSiteMenus({
          navigationJson: input.navigationJson,
          menusJson: null,
          menuAssignmentsJson: current.menuAssignmentsJson,
        });
        menusJson = {
          ...current.menusJson,
          primary: fromNav.menusJson.primary,
        } as Prisma.InputJsonValue;
        navigationJson = fromNav.navigationJson as Prisma.InputJsonValue;
        if (input.menuAssignmentsJson != null) {
          menuAssignmentsJson = resolveSiteMenus({
            ...current,
            menuAssignmentsJson: input.menuAssignmentsJson,
          }).menuAssignmentsJson as Prisma.InputJsonValue;
        } else if (input.menuAssignmentsJson === undefined) {
          menuAssignmentsJson = current.menuAssignmentsJson as Prisma.InputJsonValue;
        }
      } else if (input.menuAssignmentsJson != null) {
        menuAssignmentsJson = {
          ...current.menuAssignmentsJson,
          ...input.menuAssignmentsJson,
        } as Prisma.InputJsonValue;
        menusJson = current.menusJson as Prisma.InputJsonValue;
        navigationJson = current.navigationJson as Prisma.InputJsonValue;
      }
    }

    return enrichSiteMenus(
      await this.prisma.presenceSite.update({
        where: { id: siteId },
        data: {
          name: input.name,
          kind: input.kind,
          themeId: input.themeId,
          templateId: input.templateId ?? undefined,
          isPrimary: input.isPrimary,
          status: input.status,
          settingsJson:
            input.settingsJson === undefined
              ? undefined
              : input.settingsJson === null
                ? Prisma.JsonNull
                : (input.settingsJson as Prisma.InputJsonValue),
          suggestJson:
            input.suggestJson === undefined
              ? undefined
              : input.suggestJson === null
                ? Prisma.JsonNull
                : (input.suggestJson as Prisma.InputJsonValue),
          navigationJson,
          menusJson,
          menuAssignmentsJson,
          globalRegionsJson:
            input.globalRegionsJson === undefined
              ? undefined
              : input.globalRegionsJson === null
                ? Prisma.JsonNull
                : (input.globalRegionsJson as Prisma.InputJsonValue),
          primaryDomain:
            normalizedPrimaryDomain !== undefined
              ? normalizedPrimaryDomain
              : input.primaryDomain ?? undefined,
          homePageId: input.homePageId ?? undefined,
        },
        include: { theme: true, template: true, homePage: true },
      }),
    );
  }

  async deleteSite(organizationId: string, siteId: string) {
    await this.getSite(organizationId, siteId);
    await this.prisma.presenceSite.delete({ where: { id: siteId } });
    return { ok: true };
  }

  async createPage(organizationId: string, siteId: string, input: CreatePresencePageInput) {
    await this.getSite(organizationId, siteId);
    const pageSuggest = buildPageSuggest({
      path: input.path,
      overrides: input.suggestJson ?? undefined,
    });
    try {
      return await this.prisma.presencePage.create({
        data: {
          siteId,
          path: input.path,
          title: input.title,
          templateId: input.templateId ?? null,
          layoutKey: input.layoutKey ?? null,
          seoJson: input.seoJson ? (input.seoJson as Prisma.InputJsonValue) : undefined,
          draftJson: input.draftJson ? (input.draftJson as Prisma.InputJsonValue) : undefined,
          suggestJson: pageSuggest as Prisma.InputJsonValue,
          position: input.position ?? 0,
          status: 'draft',
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('A page with this path already exists');
      }
      throw e;
    }
  }

  async getPage(organizationId: string, pageId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { publicCode: true, name: true, brandingJson: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const page = await this.prisma.presencePage.findFirst({
      where: { id: pageId, site: { organizationId } },
      include: {
        sections: {
          orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
          include: { moduleDefinition: true, children: { orderBy: { position: 'asc' } } },
        },
        site: { include: { theme: true, template: true, homePage: true } },
        template: true,
      },
    });
    if (!page) throw new NotFoundException('Page not found');

    let site = enrichSiteMenus(page.site);
    if (!site.isPrimary && !site.platformSlug) {
      const platformSlug = await allocatePlatformSlug(this.prisma);
      site = enrichSiteMenus(
        await this.prisma.presenceSite.update({
          where: { id: site.id },
          data: { platformSlug },
          include: { theme: true, template: true, homePage: true },
        }),
      );
    }
    site = enrichSitePlatform(org, site, this.orgIdentity.siteBaseDomain());
    const branding =
      org.brandingJson && typeof org.brandingJson === 'object' && !Array.isArray(org.brandingJson)
        ? (org.brandingJson as Record<string, unknown>)
        : {};
    const brandName =
      (typeof branding.companyName === 'string' && branding.companyName.trim()) || org.name;

    return this.withEffectiveTheme({
      ...page,
      site: { ...site, brandName },
    });
  }

  async updatePage(organizationId: string, pageId: string, input: UpdatePresencePageInput) {
    await this.getPage(organizationId, pageId);
    try {
      return await this.prisma.presencePage.update({
        where: { id: pageId },
        data: {
          path: input.path,
          title: input.title,
          templateId: input.templateId ?? undefined,
          layoutKey: input.layoutKey ?? undefined,
          seoJson:
            input.seoJson === undefined
              ? undefined
              : input.seoJson === null
                ? Prisma.JsonNull
                : (input.seoJson as Prisma.InputJsonValue),
          draftJson:
            input.draftJson === undefined
              ? undefined
              : input.draftJson === null
                ? Prisma.JsonNull
                : (input.draftJson as Prisma.InputJsonValue),
          suggestJson:
            input.suggestJson === undefined
              ? undefined
              : input.suggestJson === null
                ? Prisma.JsonNull
                : (input.suggestJson as Prisma.InputJsonValue),
          publishedSnapshotJson:
            input.publishedSnapshotJson === undefined
              ? undefined
              : input.publishedSnapshotJson === null
                ? Prisma.JsonNull
                : (input.publishedSnapshotJson as Prisma.InputJsonValue),
          position: input.position,
          status: input.status,
          publishedAt:
            input.status === 'published'
              ? new Date()
              : input.status === 'draft'
                ? null
                : undefined,
          publishAt:
            input.publishAt === undefined
              ? undefined
              : input.publishAt === null
                ? null
                : new Date(input.publishAt),
          unpublishAt:
            input.unpublishAt === undefined
              ? undefined
              : input.unpublishAt === null
                ? null
                : new Date(input.unpublishAt),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('A page with this path already exists');
      }
      throw e;
    }
  }

  async deletePage(organizationId: string, pageId: string) {
    const page = await this.getPage(organizationId, pageId);
    const site = await this.prisma.presenceSite.findFirst({
      where: { id: page.siteId, organizationId },
      select: { homePageId: true, _count: { select: { pages: true } } },
    });
    if (!site) throw new NotFoundException('Site not found');
    if (site.homePageId === pageId) {
      throw new BadRequestException('The home page cannot be removed');
    }
    if (site._count.pages <= 1) {
      throw new BadRequestException('A site must have at least one page');
    }
    await this.prisma.presencePage.delete({ where: { id: pageId } });
    return { ok: true };
  }

  async duplicatePage(organizationId: string, pageId: string) {
    const page = await this.getPage(organizationId, pageId);
    const clonePath =
      page.path === '/' ? '/copy-home' : `${page.path.replace(/\/$/, '')}-copy`;
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presencePage.create({
        data: {
          siteId: page.siteId,
          title: `${page.title} copy`,
          path: clonePath,
          templateId: page.templateId,
          layoutKey: page.layoutKey,
          layoutMode: (page as { layoutMode?: string }).layoutMode || 'flow',
          seoJson: page.seoJson as Prisma.InputJsonValue,
          draftJson: page.draftJson as Prisma.InputJsonValue,
          position: page.position + 1,
          status: 'draft',
        },
      });
      const idMap = new Map<string, string>();
      const ordered = [...page.sections].sort((a, b) => {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return a.position - b.position;
      });
      // Roots first, then children (multiple passes until all created)
      const remaining = [...ordered];
      while (remaining.length) {
        let progressed = false;
        for (let i = 0; i < remaining.length; i += 1) {
          const section = remaining[i]!;
          if (section.parentId && !idMap.has(section.parentId)) continue;
          const createdSection = await tx.presenceSection.create({
            data: {
              pageId: created.id,
              type: section.type,
              moduleDefinitionId: section.moduleDefinitionId,
              propsJson: section.propsJson as Prisma.InputJsonValue,
              position: section.position,
              slotKey: section.slotKey,
              parentId: section.parentId ? idMap.get(section.parentId)! : null,
            },
          });
          idMap.set(section.id, createdSection.id);
          remaining.splice(i, 1);
          progressed = true;
          break;
        }
        if (!progressed) {
          // Cycle or missing parent — flatten remaining
          for (const section of remaining) {
            const createdSection = await tx.presenceSection.create({
              data: {
                pageId: created.id,
                type: section.type,
                moduleDefinitionId: section.moduleDefinitionId,
                propsJson: section.propsJson as Prisma.InputJsonValue,
                position: section.position,
                slotKey: section.slotKey,
                parentId: null,
              },
            });
            idMap.set(section.id, createdSection.id);
          }
          break;
        }
      }
      return tx.presencePage.findUniqueOrThrow({
        where: { id: created.id },
        include: { sections: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async addSection(organizationId: string, pageId: string, input: UpsertPresenceSectionInput) {
    await this.getPage(organizationId, pageId);
    const max = await this.prisma.presenceSection.aggregate({
      where: { pageId, parentId: input.parentId ?? null },
      _max: { position: true },
    });
    return this.prisma.presenceSection.create({
      data: {
        pageId,
        parentId: input.parentId ?? null,
        slotKey: input.slotKey ?? null,
        moduleDefinitionId: input.moduleDefinitionId ?? null,
        type: input.type,
        propsJson: input.propsJson as Prisma.InputJsonValue,
        position: input.position ?? (max._max.position ?? -1) + 1,
      },
    });
  }

  async updateSection(
    organizationId: string,
    sectionId: string,
    input: UpsertPresenceSectionInput,
  ) {
    const section = await this.requireSection(organizationId, sectionId);
    return this.prisma.presenceSection.update({
      where: { id: section.id },
      data: {
        parentId: input.parentId ?? undefined,
        slotKey: input.slotKey ?? undefined,
        moduleDefinitionId: input.moduleDefinitionId ?? undefined,
        type: input.type,
        propsJson: input.propsJson as Prisma.InputJsonValue,
        position: input.position,
      },
    });
  }

  async deleteSection(organizationId: string, sectionId: string) {
    const section = await this.requireSection(organizationId, sectionId);
    await this.prisma.presenceSection.delete({ where: { id: section.id } });
    return { ok: true };
  }

  async reorderSections(organizationId: string, pageId: string, orderedIds: string[]) {
    await this.getPage(organizationId, pageId);
    const sections = await this.prisma.presenceSection.findMany({
      where: { pageId },
      select: { id: true },
    });
    const known = new Set(sections.map((s) => s.id));
    if (orderedIds.length !== known.size || orderedIds.some((id) => !known.has(id))) {
      throw new BadRequestException('orderedIds must list every section exactly once');
    }
    await this.prisma.$transaction(
      orderedIds.map((id, position) =>
        this.prisma.presenceSection.update({ where: { id }, data: { position } }),
      ),
    );
    return this.getPage(organizationId, pageId);
  }

  async saveBuilder(organizationId: string, pageId: string, input: SavePresenceBuilderInput) {
    await this.getPage(organizationId, pageId);
    const page = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.presenceSection.findMany({
        where: { pageId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((row) => row.id));
      const refToServerId = new Map<string, string>();
      const keepIds = new Set<string>();
      const created: Array<{
        serverId: string;
        parentRef: string | null;
        slotKey: string | null;
        position: number;
      }> = [];

      for (const section of input.sections) {
        const data = {
          type: section.type,
          moduleDefinitionId: section.moduleDefinitionId ?? null,
          parentId: null as string | null,
          slotKey: section.slotKey ?? null,
          propsJson: section.propsJson as Prisma.InputJsonValue,
          position: section.position,
        };
        const requestedId = section.id && existingIds.has(section.id) ? section.id : null;
        let serverId: string;
        if (requestedId) {
          await tx.presenceSection.update({ where: { id: requestedId }, data });
          serverId = requestedId;
        } else {
          const row = await tx.presenceSection.create({
            data: { pageId, ...data },
          });
          serverId = row.id;
        }
        keepIds.add(serverId);
        refToServerId.set(serverId, serverId);
        if (section.id) refToServerId.set(section.id, serverId);
        if (section.clientId) refToServerId.set(section.clientId, serverId);
        created.push({
          serverId,
          parentRef: section.parentId ?? null,
          slotKey: section.slotKey ?? null,
          position: section.position,
        });
      }

      for (const row of created) {
        const parentId =
          row.parentRef && refToServerId.has(row.parentRef)
            ? refToServerId.get(row.parentRef)!
            : row.parentRef && existingIds.has(row.parentRef)
              ? row.parentRef
              : null;
        await tx.presenceSection.update({
          where: { id: row.serverId },
          data: {
            parentId: parentId && parentId !== row.serverId ? parentId : null,
            slotKey: row.slotKey,
            position: row.position,
          },
        });
      }

      const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
      if (toDelete.length) {
        await tx.presenceSection.deleteMany({ where: { id: { in: toDelete } } });
      }

      await tx.presencePage.update({
        where: { id: pageId },
        data: {
          title: input.title,
          path: input.path,
          layoutKey: input.layoutKey ?? null,
          layoutMode: input.layoutMode ?? undefined,
          seoJson: input.seoJson ? (input.seoJson as Prisma.InputJsonValue) : Prisma.JsonNull,
          draftJson: input.draftJson as Prisma.InputJsonValue,
        },
      });
      return tx.presencePage.findUniqueOrThrow({
        where: { id: pageId },
        include: {
          sections: { orderBy: [{ parentId: 'asc' }, { position: 'asc' }] },
          site: { include: { theme: true, template: true, homePage: true } },
          template: true,
        },
      });
    });
    return this.withEffectiveTheme(page);
  }

  async savePageAsTemplate(
    organizationId: string,
    pageId: string,
    input: { key: string; name: string; category?: string; description?: string | null },
  ) {
    const page = await this.prisma.presencePage.findFirst({
      where: { id: pageId, site: { organizationId } },
      include: {
        sections: {
          orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
          include: { moduleDefinition: { select: { key: true } } },
        },
      },
    });
    if (!page) throw new NotFoundException('Page not found');
    const sections = serializeSectionsForTemplate(page.sections);
    return this.prisma.presencePageTemplate.upsert({
      where: { organizationId_key: { organizationId, key: input.key } },
      create: {
        organizationId,
        isSystem: false,
        status: 'published',
        key: input.key,
        name: input.name,
        category: input.category || 'page',
        description: input.description ?? null,
        layoutKey: page.layoutKey,
        structureJson: {
          layoutMode: page.layoutMode || 'flow',
          sections,
        } as Prisma.InputJsonValue,
      },
      update: {
        name: input.name,
        category: input.category || 'page',
        description: input.description ?? null,
        layoutKey: page.layoutKey,
        structureJson: {
          layoutMode: page.layoutMode || 'flow',
          sections,
        } as Prisma.InputJsonValue,
        status: 'published',
      },
    });
  }

  async listGlobalSections(organizationId: string, siteId: string) {
    await this.requireSite(organizationId, siteId);
    return this.prisma.presenceGlobalSection.findMany({
      where: { siteId },
      orderBy: [{ position: 'asc' }, { slotKey: 'asc' }],
    });
  }

  async upsertGlobalSection(
    organizationId: string,
    siteId: string,
    slotKey: string,
    input: UpsertPresenceGlobalSectionInput,
  ) {
    await this.requireSite(organizationId, siteId);
    const parsedSlot = PresenceGlobalSlotKeySchema.safeParse(slotKey);
    if (!parsedSlot.success) {
      throw new BadRequestException(
        `Invalid slotKey "${slotKey}". Expected one of: announcement, header, footer, cookie, sticky_cta`,
      );
    }
    return this.prisma.presenceGlobalSection.upsert({
      where: { siteId_slotKey: { siteId, slotKey: parsedSlot.data } },
      create: {
        siteId,
        slotKey: parsedSlot.data,
        name: input.name,
        moduleDefinitionId: input.moduleDefinitionId ?? null,
        type: input.type,
        propsJson: input.propsJson as Prisma.InputJsonValue,
        enabled: input.enabled ?? true,
        position: input.position ?? 0,
      },
      update: {
        name: input.name,
        moduleDefinitionId:
          input.moduleDefinitionId === undefined ? undefined : input.moduleDefinitionId,
        type: input.type,
        propsJson: input.propsJson as Prisma.InputJsonValue,
        enabled: input.enabled === undefined ? undefined : input.enabled,
        position: input.position === undefined ? undefined : input.position,
      },
    });
  }

  async deleteGlobalSection(organizationId: string, siteId: string, slotKey: string) {
    await this.requireSite(organizationId, siteId);
    const existing = await this.prisma.presenceGlobalSection.findFirst({
      where: { siteId, slotKey },
    });
    if (!existing) throw new NotFoundException('Global section not found');
    await this.prisma.presenceGlobalSection.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private async requireSite(organizationId: string, siteId: string) {
    const site = await this.prisma.presenceSite.findFirst({
      where: { id: siteId, organizationId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  private async requireSection(organizationId: string, sectionId: string) {
    const section = await this.prisma.presenceSection.findFirst({
      where: { id: sectionId, page: { site: { organizationId } } },
    });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }
}
