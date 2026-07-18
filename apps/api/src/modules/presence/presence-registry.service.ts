import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClonePresenceThemeInput,
  CreatePresenceChildThemeInput,
  CreatePresenceMarketplaceListingInput,
  InstallPresenceMarketplaceListingInput,
  PublishPresenceAssetVersionInput,
  UpsertPresenceCatalogReviewInput,
  UpsertPresenceFormInput,
  UpsertPresenceChatWidgetInput,
  UpsertPresenceModuleDefinitionInput,
  UpsertPresencePageTemplateInput,
  UpsertPresenceSiteTemplateInput,
  UpsertPresenceThemeInput,
} from '@wayrune/contracts';
import {
  compileTargetRulesToPathLists,
  parsePresenceChatTargetRules,
} from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { OrgIdentityService } from '../organizations/org-identity.service';
import {
  ensureOrgPresenceFormPresets,
  ensureSystemPresenceFonts,
  ensureSystemPresenceModuleDefinitions,
  ensureSystemPresenceTemplates,
  ensureSystemPresenceThemes,
} from './presence-seed';
import { resolveEffectiveTheme, type PresenceThemeLike } from './presence-theme-resolve';

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type RematerializedFile = {
  path: string;
  documentId: string;
  mimeType: string;
  sizeBytes: number;
};

type CatalogReviewTargetType = 'theme' | 'module';

function formatReviewDate(value: Date): string {
  return value.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

@Injectable()
export class PresenceRegistryService {
  constructor(
    private prisma: PrismaService,
    private orgIdentity: OrgIdentityService,
    private files: FilesService,
  ) {}

  async bootstrapOrg(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found');
    await ensureSystemPresenceThemes(this.prisma);
    await ensureSystemPresenceFonts(this.prisma);
    await ensureSystemPresenceModuleDefinitions(this.prisma);
    await ensureSystemPresenceTemplates(this.prisma);
    await ensureOrgPresenceFormPresets(this.prisma, org.id, org.kind);
    return { ok: true };
  }

  async listFonts(role?: string) {
    await ensureSystemPresenceFonts(this.prisma);
    const fonts = await this.prisma.presenceFont.findMany({
      where: {
        isActive: true,
        ...(role === 'display' || role === 'body'
          ? { OR: [{ role }, { role: 'both' }] }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return fonts.map((font) => ({
      key: font.key,
      label: font.label,
      stack: font.stack,
      role: font.role,
      source: font.source,
      sortOrder: font.sortOrder,
    }));
  }

  async identity(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      publicCode: org.publicCode,
      subdomain: org.subdomain,
      customDomain: org.customDomain,
      siteBaseDomain: this.orgIdentity.siteBaseDomain(),
      publicSiteUrl: this.orgIdentity.publicSiteUrl(org),
      slug: org.slug,
    };
  }

  async listThemes(organizationId: string) {
    await ensureSystemPresenceThemes(this.prisma);
    const themes = await this.prisma.presenceTheme.findMany({
      where: {
        OR: [{ isSystem: true }, { organizationId }],
        status: { not: 'archived' },
      },
      include: {
        parentTheme: { select: { id: true, key: true, name: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    const ratingById = await this.ratingAggregates(
      'theme',
      themes.map((theme) => theme.id),
    );
    return themes.map((theme) => {
      const byId = new Map(themes.map((t) => [t.id, t as PresenceThemeLike]));
      const effective = resolveEffectiveTheme(theme as PresenceThemeLike, (id) => byId.get(id));
      const manifest =
        theme.manifestJson && typeof theme.manifestJson === 'object' && !Array.isArray(theme.manifestJson)
          ? (theme.manifestJson as Record<string, unknown>)
          : {};
      const defaultSiteStructure = asRecord(manifest.defaultSiteStructure);
      const pageCount = Array.isArray(defaultSiteStructure.pages)
        ? defaultSiteStructure.pages.length
        : 0;
      const rating = ratingById.get(theme.id) ?? { average: 0, count: 0 };
      return {
        ...theme,
        effectiveTokensJson: effective.tokensJson,
        packageCss: String(manifest.packageCss || ''),
        parentKey: theme.parentTheme?.key ?? null,
        parentName: theme.parentTheme?.name ?? null,
        hasFullSite: pageCount > 0,
        defaultSiteTemplateKey:
          typeof manifest.defaultSiteTemplateKey === 'string'
            ? manifest.defaultSiteTemplateKey
            : null,
        defaultSitePageCount: pageCount,
        ratingAverage: rating.average,
        ratingCount: rating.count,
      };
    });
  }

  async getThemeMeta(organizationId: string, themeId: string) {
    return this.prisma.presenceTheme.findFirst({
      where: {
        id: themeId,
        OR: [{ isSystem: true }, { organizationId }],
      },
      select: { id: true, key: true, name: true },
    });
  }

  async upsertTheme(organizationId: string, input: UpsertPresenceThemeInput) {
    return this.prisma.presenceTheme.upsert({
      where: { organizationId_key: { organizationId, key: input.key } },
      create: {
        organizationId,
        key: input.key,
        name: input.name,
        previewUrl: input.previewUrl ?? null,
        isSystem: false,
        status: input.status,
        packageFormat: 'legacy_json',
        tokensJson: asJson(input.tokensJson),
        tokensSchemaJson: input.tokensSchemaJson ? asJson(input.tokensSchemaJson) : Prisma.JsonNull,
        schemaJson: input.schemaJson ? asJson(input.schemaJson) : Prisma.JsonNull,
        layoutJson: input.layoutJson ? asJson(input.layoutJson) : Prisma.JsonNull,
        regionsJson: input.regionsJson ? asJson(input.regionsJson) : Prisma.JsonNull,
        previewAssetsJson: input.previewAssetsJson
          ? asJson(input.previewAssetsJson)
          : Prisma.JsonNull,
        suggestJson: input.suggestJson ? asJson(input.suggestJson) : Prisma.JsonNull,
      },
      update: {
        name: input.name,
        previewUrl: input.previewUrl ?? null,
        status: input.status,
        tokensJson: asJson(input.tokensJson),
        tokensSchemaJson: input.tokensSchemaJson ? asJson(input.tokensSchemaJson) : Prisma.JsonNull,
        schemaJson: input.schemaJson ? asJson(input.schemaJson) : Prisma.JsonNull,
        layoutJson: input.layoutJson ? asJson(input.layoutJson) : Prisma.JsonNull,
        regionsJson: input.regionsJson ? asJson(input.regionsJson) : Prisma.JsonNull,
        previewAssetsJson: input.previewAssetsJson
          ? asJson(input.previewAssetsJson)
          : Prisma.JsonNull,
        suggestJson: input.suggestJson ? asJson(input.suggestJson) : Prisma.JsonNull,
      },
    });
  }

  async cloneTheme(
    organizationId: string,
    themeId: string,
    input: ClonePresenceThemeInput = {},
  ) {
    const source = await this.prisma.presenceTheme.findFirst({
      where: {
        id: themeId,
        OR: [{ isSystem: true }, { organizationId }],
      },
    });
    if (!source) throw new NotFoundException('Theme not found');
    const key =
      (input.key && input.key.trim()) ||
      `${source.key}_copy_${Date.now().toString(36).slice(-4)}`;
    const name = (input.name && input.name.trim()) || `${source.name} (copy)`;
    try {
      return await this.prisma.presenceTheme.create({
        data: {
          organizationId,
          isSystem: false,
          key,
          name,
          previewUrl: source.previewUrl,
          status: 'published',
          packageFormat: source.packageFormat || 'legacy_json',
          parentThemeId: null,
          tokensJson: source.tokensJson as Prisma.InputJsonValue,
          tokensSchemaJson: source.tokensSchemaJson as Prisma.InputJsonValue,
          schemaJson: source.schemaJson as Prisma.InputJsonValue,
          layoutJson: source.layoutJson as Prisma.InputJsonValue,
          regionsJson: source.regionsJson as Prisma.InputJsonValue,
          previewAssetsJson: source.previewAssetsJson as Prisma.InputJsonValue,
          suggestJson: source.suggestJson as Prisma.InputJsonValue,
          packageRootKey: source.packageRootKey,
          manifestJson: source.manifestJson as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('A theme with this key already exists');
      }
      throw e;
    }
  }

  /**
   * Create a child theme that inherits from parent (WP child-theme pattern).
   * Unlike clone, parentThemeId is set and tokens are partial overrides.
   */
  async createChildTheme(
    organizationId: string,
    parentThemeId: string,
    input: CreatePresenceChildThemeInput = {},
  ) {
    const parent = await this.prisma.presenceTheme.findFirst({
      where: {
        id: parentThemeId,
        OR: [{ isSystem: true }, { organizationId }],
      },
    });
    if (!parent) throw new NotFoundException('Parent theme not found');
    if (parent.parentThemeId) {
      throw new BadRequestException('Child themes can only inherit from a parent theme (single level)');
    }
    const key =
      (input.key && input.key.trim()) ||
      `${parent.key}_child_${Date.now().toString(36).slice(-4)}`;
    const name = (input.name && input.name.trim()) || `${parent.name} (child)`;
    const tokensOverride = input.tokensJson && Object.keys(input.tokensJson).length
      ? input.tokensJson
      : {};
    try {
      return await this.prisma.presenceTheme.create({
        data: {
          organizationId,
          isSystem: false,
          key,
          name,
          previewUrl: parent.previewUrl,
          status: 'published',
          packageFormat: parent.packageFormat || 'legacy_json',
          parentThemeId: parent.id,
          tokensJson: asJson(tokensOverride),
          tokensSchemaJson: parent.tokensSchemaJson as Prisma.InputJsonValue,
          schemaJson: parent.schemaJson as Prisma.InputJsonValue,
          layoutJson: Prisma.JsonNull,
          regionsJson: Prisma.JsonNull,
          previewAssetsJson: parent.previewAssetsJson as Prisma.InputJsonValue,
          suggestJson: parent.suggestJson as Prisma.InputJsonValue,
          manifestJson: {
            parent: parent.key,
            version: '1.0.0',
            name,
            key,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('A theme with this key already exists');
      }
      throw e;
    }
  }

  /** Delete org-owned custom / child theme. System themes cannot be deleted. */
  async deleteTheme(organizationId: string, themeId: string) {
    const theme = await this.prisma.presenceTheme.findFirst({
      where: { id: themeId, organizationId, isSystem: false },
    });
    if (!theme) {
      const maybeSystem = await this.prisma.presenceTheme.findFirst({
        where: { id: themeId, OR: [{ isSystem: true }, { organizationId: null }] },
        select: { id: true },
      });
      if (maybeSystem) {
        throw new BadRequestException('System themes cannot be deleted');
      }
      throw new NotFoundException('Theme not found');
    }

    const sitesUsing = await this.prisma.presenceSite.count({
      where: { organizationId, themeId: theme.id },
    });
    if (sitesUsing > 0) {
      throw new BadRequestException(
        `Theme is used by ${sitesUsing} site${sitesUsing === 1 ? '' : 's'}. Set another active theme first.`,
      );
    }

    const childCount = await this.prisma.presenceTheme.count({
      where: { parentThemeId: theme.id },
    });
    if (childCount > 0) {
      // Detach children so they remain usable (become standalone custom themes).
      await this.prisma.presenceTheme.updateMany({
        where: { parentThemeId: theme.id },
        data: { parentThemeId: null },
      });
    }

    await this.prisma.document.updateMany({
      where: {
        organizationId,
        entityType: 'presence_theme',
        entityId: theme.id,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    await this.prisma.presenceTheme.delete({ where: { id: theme.id } });
    return { ok: true, id: theme.id };
  }

  /** Delete org-owned custom component. System components cannot be deleted. */
  async deleteModuleDefinition(organizationId: string, moduleId: string) {
    const moduleDef = await this.prisma.presenceModuleDefinition.findFirst({
      where: { id: moduleId, organizationId, isSystem: false },
    });
    if (!moduleDef) {
      const maybeSystem = await this.prisma.presenceModuleDefinition.findFirst({
        where: { id: moduleId, OR: [{ isSystem: true }, { organizationId: null }] },
        select: { id: true },
      });
      if (maybeSystem) {
        throw new BadRequestException('System components cannot be deleted');
      }
      throw new NotFoundException('Component not found');
    }

    const sectionCount = await this.prisma.presenceSection.count({
      where: { moduleDefinitionId: moduleDef.id },
    });
    if (sectionCount > 0) {
      await this.prisma.presenceSection.updateMany({
        where: { moduleDefinitionId: moduleDef.id },
        data: { moduleDefinitionId: null },
      });
    }

    await this.prisma.document.updateMany({
      where: {
        organizationId,
        entityType: 'presence_module',
        entityId: moduleDef.id,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    await this.prisma.presenceModuleDefinition.delete({ where: { id: moduleDef.id } });
    return { ok: true, id: moduleDef.id };
  }

  async resolveThemeForSite(organizationId: string, themeId: string) {
    const themes = await this.prisma.presenceTheme.findMany({
      where: { OR: [{ isSystem: true }, { organizationId }] },
    });
    const byId = new Map(themes.map((t) => [t.id, t as PresenceThemeLike]));
    const leaf = byId.get(themeId);
    if (!leaf) throw new NotFoundException('Theme not found');
    return resolveEffectiveTheme(leaf, (id) => byId.get(id));
  }

  async listModuleDefinitions(organizationId: string) {
    await ensureSystemPresenceModuleDefinitions(this.prisma);
    const modules = await this.prisma.presenceModuleDefinition.findMany({
      where: {
        OR: [{ isSystem: true }, { organizationId }],
        status: { not: 'archived' },
      },
      orderBy: [{ isSystem: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
    const ratingById = await this.ratingAggregates(
      'module',
      modules.map((mod) => mod.id),
    );
    return modules.map((mod) => {
      const rating = ratingById.get(mod.id) ?? { average: 0, count: 0 };
      return {
        ...mod,
        ratingAverage: rating.average,
        ratingCount: rating.count,
      };
    });
  }

  async upsertModuleDefinition(
    organizationId: string,
    input: UpsertPresenceModuleDefinitionInput,
  ) {
    return this.prisma.presenceModuleDefinition.upsert({
      where: { organizationId_key: { organizationId, key: input.key } },
      create: {
        organizationId,
        isSystem: false,
        status: input.status,
        key: input.key,
        name: input.name,
        category: input.category,
        rendererKey: input.rendererKey,
        schemaJson: asJson(input.schemaJson),
        defaultPropsJson: asJson(input.defaultPropsJson),
        previewJson: input.previewJson ? asJson(input.previewJson) : Prisma.JsonNull,
        assetsJson: input.assetsJson ? asJson(input.assetsJson) : Prisma.JsonNull,
        styleSchemaJson: input.styleSchemaJson ? asJson(input.styleSchemaJson) : Prisma.JsonNull,
        defaultStyleJson: input.defaultStyleJson
          ? asJson(input.defaultStyleJson)
          : Prisma.JsonNull,
        variantsJson: input.variantsJson ? asJson(input.variantsJson) : Prisma.JsonNull,
        suggestJson: input.suggestJson ? asJson(input.suggestJson) : Prisma.JsonNull,
        templateSource: input.templateSource ?? null,
        moduleSource: input.moduleSource ?? null,
      },
      update: {
        name: input.name,
        category: input.category,
        rendererKey: input.rendererKey,
        status: input.status,
        schemaJson: asJson(input.schemaJson),
        defaultPropsJson: asJson(input.defaultPropsJson),
        previewJson: input.previewJson ? asJson(input.previewJson) : Prisma.JsonNull,
        assetsJson: input.assetsJson ? asJson(input.assetsJson) : Prisma.JsonNull,
        styleSchemaJson: input.styleSchemaJson ? asJson(input.styleSchemaJson) : Prisma.JsonNull,
        defaultStyleJson: input.defaultStyleJson
          ? asJson(input.defaultStyleJson)
          : Prisma.JsonNull,
        variantsJson: input.variantsJson ? asJson(input.variantsJson) : Prisma.JsonNull,
        suggestJson: input.suggestJson ? asJson(input.suggestJson) : Prisma.JsonNull,
        templateSource: input.templateSource ?? null,
        moduleSource: input.moduleSource ?? null,
      },
    });
  }

  async listSiteTemplates(organizationId: string) {
    await ensureSystemPresenceTemplates(this.prisma);
    return this.prisma.presenceSiteTemplate.findMany({
      where: { OR: [{ isSystem: true }, { organizationId }] },
      orderBy: [{ isSystem: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async upsertSiteTemplate(organizationId: string, input: UpsertPresenceSiteTemplateInput) {
    return this.prisma.presenceSiteTemplate.upsert({
      where: { organizationId_key: { organizationId, key: input.key } },
      create: {
        organizationId,
        isSystem: false,
        status: input.status,
        key: input.key,
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        previewUrl: input.previewUrl ?? null,
        recommendedThemeKeysJson: input.recommendedThemeKeysJson
          ? asJson(input.recommendedThemeKeysJson)
          : Prisma.JsonNull,
        suggestJson: input.suggestJson ? asJson(input.suggestJson) : Prisma.JsonNull,
        structureJson: asJson(input.structureJson),
      },
      update: {
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        previewUrl: input.previewUrl ?? null,
        status: input.status,
        recommendedThemeKeysJson: input.recommendedThemeKeysJson
          ? asJson(input.recommendedThemeKeysJson)
          : Prisma.JsonNull,
        suggestJson:
          input.suggestJson === undefined
            ? undefined
            : input.suggestJson === null
              ? Prisma.JsonNull
              : asJson(input.suggestJson),
        structureJson: asJson(input.structureJson),
      },
    });
  }

  async listPageTemplates(organizationId: string) {
    await ensureSystemPresenceTemplates(this.prisma);
    return this.prisma.presencePageTemplate.findMany({
      where: { OR: [{ isSystem: true }, { organizationId }] },
      orderBy: [{ isSystem: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async upsertPageTemplate(organizationId: string, input: UpsertPresencePageTemplateInput) {
    return this.prisma.presencePageTemplate.upsert({
      where: { organizationId_key: { organizationId, key: input.key } },
      create: {
        organizationId,
        isSystem: false,
        status: input.status,
        key: input.key,
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        previewUrl: input.previewUrl ?? null,
        layoutKey: input.layoutKey ?? null,
        suggestJson: input.suggestJson ? asJson(input.suggestJson) : Prisma.JsonNull,
        structureJson: asJson(input.structureJson),
      },
      update: {
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        previewUrl: input.previewUrl ?? null,
        layoutKey: input.layoutKey ?? null,
        status: input.status,
        suggestJson:
          input.suggestJson === undefined
            ? undefined
            : input.suggestJson === null
              ? Prisma.JsonNull
              : asJson(input.suggestJson),
        structureJson: asJson(input.structureJson),
      },
    });
  }

  async listForms(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found');
    await ensureOrgPresenceFormPresets(this.prisma, org.id, org.kind);
    return this.prisma.presenceFormDefinition.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async upsertForm(organizationId: string, input: UpsertPresenceFormInput) {
    return this.prisma.presenceFormDefinition.upsert({
      where: { organizationId_key: { organizationId, key: input.key } },
      create: {
        organizationId,
        key: input.key,
        name: input.name,
        orgKindPreset: input.orgKindPreset ?? null,
        fieldsJson: asJson(input.fieldsJson),
        ingestMode: input.ingestMode,
        isActive: input.isActive ?? true,
      },
      update: {
        name: input.name,
        orgKindPreset: input.orgKindPreset ?? null,
        fieldsJson: asJson(input.fieldsJson),
        ingestMode: input.ingestMode,
        isActive: input.isActive,
      },
    });
  }

  async listChatWidgets(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return this.prisma.presenceChatWidget.findMany({
      where: { organizationId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upsertChatWidget(organizationId: string, input: UpsertPresenceChatWidgetInput) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const key = input.key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    if (!key) throw new BadRequestException('Widget key is required');

    const existing = await this.prisma.presenceChatWidget.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });

    const generateKey = () =>
      `cp_widget_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-4)}`;

    let publicKey =
      typeof input.publicKey === 'string' && input.publicKey.trim()
        ? input.publicKey.trim()
        : existing?.publicKey || generateKey();
    if (input.regeneratePublicKey) publicKey = generateKey();

    if (!existing) {
      const clash = await this.prisma.presenceChatWidget.findUnique({
        where: { publicKey },
      });
      if (clash) publicKey = generateKey();
    } else if (publicKey !== existing.publicKey) {
      const clash = await this.prisma.presenceChatWidget.findUnique({
        where: { publicKey },
      });
      if (clash && clash.id !== existing.id) {
        throw new BadRequestException('Public key already in use');
      }
    }

    let includePaths = input.includePaths ?? undefined;
    let excludePaths = input.excludePaths ?? undefined;
    let targetRulesJson: Prisma.InputJsonValue | undefined;
    if (input.targetRules !== undefined) {
      const rules = parsePresenceChatTargetRules(input.targetRules);
      targetRulesJson = asJson(rules);
      const compiled = compileTargetRulesToPathLists(rules);
      includePaths = compiled.includePaths;
      excludePaths = compiled.excludePaths;
    }

    return this.prisma.presenceChatWidget.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: {
        organizationId,
        key,
        name: input.name.trim(),
        publicKey,
        enabled: input.enabled ?? true,
        priority: input.priority ?? 100,
        brandName: input.brandName?.trim() || null,
        primaryColor: input.primaryColor?.trim() || null,
        whatsappNumber: input.whatsappNumber?.trim() || null,
        defaultGreeting: input.defaultGreeting?.trim() || null,
        position: input.position || 'bottom-right',
        includePathsJson: asJson(includePaths ?? []),
        excludePathsJson: asJson(excludePaths ?? []),
        targetRulesJson: targetRulesJson ?? asJson({ show: [], hide: [] }),
      },
      update: {
        name: input.name.trim(),
        publicKey,
        enabled: input.enabled,
        priority: input.priority === undefined ? undefined : input.priority,
        brandName: input.brandName === undefined ? undefined : input.brandName?.trim() || null,
        primaryColor:
          input.primaryColor === undefined ? undefined : input.primaryColor?.trim() || null,
        whatsappNumber:
          input.whatsappNumber === undefined ? undefined : input.whatsappNumber?.trim() || null,
        defaultGreeting:
          input.defaultGreeting === undefined ? undefined : input.defaultGreeting?.trim() || null,
        position: input.position === undefined ? undefined : input.position || 'bottom-right',
        includePathsJson:
          includePaths === undefined ? undefined : asJson(includePaths ?? []),
        excludePathsJson:
          excludePaths === undefined ? undefined : asJson(excludePaths ?? []),
        targetRulesJson: targetRulesJson === undefined ? undefined : targetRulesJson,
      },
    });
  }

  async deleteChatWidget(organizationId: string, widgetId: string) {
    const row = await this.prisma.presenceChatWidget.findFirst({
      where: { id: widgetId, organizationId },
    });
    if (!row) throw new NotFoundException('Widget not found');

    const sites = await this.prisma.presenceSite.findMany({
      where: { organizationId },
      select: { id: true, settingsJson: true },
    });
    for (const site of sites) {
      const settings = asRecord(site.settingsJson);
      const cw = asRecord(settings.conversationWidget);
      if (cw.widgetId === widgetId) {
        const nextCw = { ...cw };
        delete nextCw.widgetId;
        await this.prisma.presenceSite.update({
          where: { id: site.id },
          data: {
            settingsJson: asJson({
              ...settings,
              conversationWidget: nextCw,
            }),
          },
        });
      }
    }

    await this.prisma.presenceChatWidget.delete({ where: { id: widgetId } });
    return { ok: true };
  }

  async publishAssetVersion(
    organizationId: string,
    input: PublishPresenceAssetVersionInput,
  ) {
    const snapshot = await this.loadAssetSnapshot(organizationId, input.assetType, input.assetId);
    const latest = await this.prisma.presenceAssetVersion.findFirst({
      where: {
        organizationId,
        assetType: input.assetType,
        assetId: input.assetId,
      },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version || 0) + 1;
    return this.prisma.presenceAssetVersion.create({
      data: {
        organizationId,
        assetType: input.assetType,
        assetId: input.assetId,
        version,
        status: 'published',
        changelog: input.changelog ?? null,
        snapshotJson: asJson(snapshot),
      },
    });
  }

  async listAssetVersions(
    organizationId: string,
    assetType: string,
    assetId: string,
  ) {
    return this.prisma.presenceAssetVersion.findMany({
      where: { organizationId, assetType, assetId },
      orderBy: { version: 'desc' },
    });
  }

  async createMarketplaceListing(
    organizationId: string,
    input: CreatePresenceMarketplaceListingInput,
  ) {
    const version = await this.prisma.presenceAssetVersion.findFirst({
      where: {
        id: input.sourceAssetVersionId,
        organizationId,
        status: 'published',
      },
    });
    if (!version) throw new NotFoundException('Published asset version not found');
    try {
      return await this.prisma.presenceMarketplaceListing.create({
        data: {
          organizationId,
          sourceAssetVersionId: version.id,
          key: input.key,
          name: input.name,
          category: input.category,
          description: input.description ?? null,
          priceTier: input.priceTier,
          screenshotsJson: input.screenshotsJson
            ? asJson(input.screenshotsJson)
            : Prisma.JsonNull,
          status: input.status,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('A listing with this key already exists');
      }
      throw e;
    }
  }

  async listMarketplaceListings() {
    return this.prisma.presenceMarketplaceListing.findMany({
      where: { status: 'published' },
      include: { sourceAssetVersion: true },
      orderBy: { name: 'asc' },
    });
  }

  async installMarketplaceListing(
    organizationId: string,
    userId: string,
    input: InstallPresenceMarketplaceListingInput,
  ) {
    const listing = await this.prisma.presenceMarketplaceListing.findFirst({
      where: { id: input.listingId, status: 'published' },
      include: { sourceAssetVersion: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const snap = listing.sourceAssetVersion.snapshotJson as Record<string, unknown>;
    const assetType = listing.sourceAssetVersion.assetType;
    const sourceOrgId =
      listing.organizationId || listing.sourceAssetVersion.organizationId || null;
    if (!sourceOrgId) {
      throw new BadRequestException(
        'Marketplace listing has no publisher organization; cannot rematerialize package files',
      );
    }

    if (assetType === 'module') {
      const key =
        (input.key && input.key.trim()) ||
        `${String(snap.key || 'module')}_installed_${Date.now().toString(36).slice(-4)}`;
      const assets = asRecord(snap.assetsJson);
      const created = await this.prisma.presenceModuleDefinition.create({
        data: {
          organizationId,
          isSystem: false,
          key,
          name: (input.name && input.name.trim()) || String(snap.name || listing.name),
          category: String(snap.category || 'custom'),
          rendererKey: String(snap.rendererKey || 'liquid'),
          status: 'published',
          schemaJson: asJson(snap.schemaJson || []),
          defaultPropsJson: asJson(snap.defaultPropsJson || {}),
          previewJson: snap.previewJson ? asJson(snap.previewJson) : Prisma.JsonNull,
          assetsJson: Prisma.JsonNull,
          styleSchemaJson: snap.styleSchemaJson ? asJson(snap.styleSchemaJson) : Prisma.JsonNull,
          defaultStyleJson: snap.defaultStyleJson
            ? asJson(snap.defaultStyleJson)
            : Prisma.JsonNull,
          templateSource:
            typeof snap.templateSource === 'string' ? snap.templateSource : null,
          moduleSource: typeof snap.moduleSource === 'string' ? snap.moduleSource : null,
          installedFromListingId: listing.id,
        },
      });

      let assetsJson: Record<string, unknown> | null = snap.assetsJson
        ? { ...assets, installedFromListingId: listing.id }
        : null;

      if (assets.packageFormat === 'v1') {
        const rematerialized = await this.rematerializePackageFiles({
          sourceOrganizationId: sourceOrgId,
          targetOrganizationId: organizationId,
          userId,
          entityType: 'presence_module',
          entityId: created.id,
          files: Array.isArray(assets.files) ? assets.files : [],
        });
        const entry = asRecord(assets.entry);
        const jsPaths = Array.isArray(entry.js) ? entry.js.map(String) : [];
        const jsUrls = jsPaths
          .map((path) => rematerialized.find((f) => f.path === path)?.documentId)
          .filter((id): id is string => Boolean(id))
          .map((id) => `/api/v1/presence/public/media/${id}`);
        assetsJson = {
          ...assets,
          files: rematerialized,
          jsUrls,
          installedFromListingId: listing.id,
        };
      }

      return this.prisma.presenceModuleDefinition.update({
        where: { id: created.id },
        data: {
          assetsJson: assetsJson ? asJson(assetsJson) : Prisma.JsonNull,
        },
      });
    }

    if (assetType === 'theme') {
      const key =
        (input.key && input.key.trim()) ||
        `${String(snap.key || 'theme')}_installed_${Date.now().toString(36).slice(-4)}`;
      const packageFormat =
        typeof snap.packageFormat === 'string' ? snap.packageFormat : 'legacy_json';
      const created = await this.prisma.presenceTheme.create({
        data: {
          organizationId,
          isSystem: false,
          key,
          name: (input.name && input.name.trim()) || String(snap.name || listing.name),
          status: 'published',
          packageFormat,
          parentThemeId: null,
          packageRootKey: null,
          tokensJson: asJson(snap.tokensJson || {}),
          tokensSchemaJson: snap.tokensSchemaJson
            ? asJson(snap.tokensSchemaJson)
            : Prisma.JsonNull,
          schemaJson: snap.schemaJson ? asJson(snap.schemaJson) : Prisma.JsonNull,
          layoutJson: snap.layoutJson ? asJson(snap.layoutJson) : Prisma.JsonNull,
          regionsJson: snap.regionsJson ? asJson(snap.regionsJson) : Prisma.JsonNull,
          previewAssetsJson: snap.previewAssetsJson
            ? asJson(snap.previewAssetsJson)
            : Prisma.JsonNull,
          manifestJson: snap.manifestJson ? asJson(snap.manifestJson) : Prisma.JsonNull,
          previewUrl: typeof snap.previewUrl === 'string' ? snap.previewUrl : null,
        },
      });

      if (packageFormat === 'v1' && snap.manifestJson) {
        const manifest = asRecord(snap.manifestJson);
        const rematerialized = await this.rematerializePackageFiles({
          sourceOrganizationId: sourceOrgId,
          targetOrganizationId: organizationId,
          userId,
          entityType: 'presence_theme',
          entityId: created.id,
          files: Array.isArray(manifest.files) ? manifest.files : [],
        });
        const scripts = Array.isArray(manifest.scripts) ? manifest.scripts.map(String) : [];
        const scriptUrls = scripts
          .map((path) => rematerialized.find((f) => f.path === path)?.documentId)
          .filter((id): id is string => Boolean(id))
          .map((id) => `/api/v1/presence/public/media/${id}`);
        const sanitized = {
          ...manifest,
          files: rematerialized,
          scriptUrls,
          installedFromListingId: listing.id,
        };
        await this.prisma.presenceTheme.update({
          where: { id: created.id },
          data: {
            packageRootKey: `${organizationId}/presence_theme/${created.id}`,
            manifestJson: sanitized as Prisma.InputJsonValue,
          },
        });
      }
      return this.prisma.presenceTheme.findUniqueOrThrow({ where: { id: created.id } });
    }
    throw new BadRequestException(`Install not supported for asset type ${assetType}`);
  }

  /**
   * Copy package binaries from the publisher org into the installing org
   * so JS/CSS URLs stay valid after marketplace install.
   */
  private async rematerializePackageFiles(input: {
    sourceOrganizationId: string;
    targetOrganizationId: string;
    userId: string;
    entityType: string;
    entityId: string;
    files: unknown[];
  }): Promise<RematerializedFile[]> {
    const out: RematerializedFile[] = [];
    for (const raw of input.files) {
      const row = asRecord(raw);
      const path = typeof row.path === 'string' ? row.path : '';
      const documentId = typeof row.documentId === 'string' ? row.documentId : '';
      if (!path || !documentId) continue;
      try {
        const { buffer, mimeType } = await this.files.readBuffer(
          input.sourceOrganizationId,
          documentId,
        );
        const uploaded = await this.files.upload({
          organizationId: input.targetOrganizationId,
          userId: input.userId,
          entityType: input.entityType,
          entityId: input.entityId,
          fileName: path.replace(/\//g, '__'),
          mimeType: typeof row.mimeType === 'string' ? row.mimeType : mimeType,
          buffer,
          visibility: 'organization',
        });
        out.push({
          path,
          documentId: uploaded.id,
          mimeType: uploaded.mimeType,
          sizeBytes: buffer.length,
        });
      } catch {
        // Skip missing publisher files; HTML/CSS inlines may still work.
      }
    }
    return out;
  }

  private async loadAssetSnapshot(
    organizationId: string,
    assetType: string,
    assetId: string,
  ) {
    if (assetType === 'theme') {
      const theme = await this.prisma.presenceTheme.findFirst({
        where: { id: assetId, organizationId, isSystem: false },
      });
      if (!theme) throw new NotFoundException('Theme not found');
      return theme;
    }
    if (assetType === 'module') {
      const moduleDef = await this.prisma.presenceModuleDefinition.findFirst({
        where: { id: assetId, organizationId, isSystem: false },
      });
      if (!moduleDef) throw new NotFoundException('Module not found');
      return moduleDef;
    }
    if (assetType === 'site_template') {
      const template = await this.prisma.presenceSiteTemplate.findFirst({
        where: { id: assetId, organizationId, isSystem: false },
      });
      if (!template) throw new NotFoundException('Site template not found');
      return template;
    }
    if (assetType === 'page_template') {
      const template = await this.prisma.presencePageTemplate.findFirst({
        where: { id: assetId, organizationId, isSystem: false },
      });
      if (!template) throw new NotFoundException('Page template not found');
      return template;
    }
    throw new BadRequestException('Unknown asset type');
  }

  async listCatalogReviews(
    organizationId: string,
    userId: string,
    targetType: CatalogReviewTargetType,
    targetId: string,
  ) {
    await this.assertCatalogTargetVisible(organizationId, targetType, targetId);
    const [rows, aggregate] = await Promise.all([
      this.prisma.presenceCatalogReview.findMany({
        where: { targetType, targetId },
        include: {
          user: { select: { id: true, fullName: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.presenceCatalogReview.aggregate({
        where: { targetType, targetId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    const reviews = rows.map((row) => ({
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      rating: row.rating,
      body: row.body,
      author: row.user.fullName,
      organizationName: row.organization.name,
      userId: row.userId,
      organizationId: row.organizationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      dateLabel: formatReviewDate(row.createdAt),
      isMine: row.organizationId === organizationId && row.userId === userId,
    }));
    const mine = reviews.find((review) => review.isMine) ?? null;
    return {
      reviews,
      mine,
      rating: {
        average:
          aggregate._count._all > 0 && aggregate._avg.rating != null
            ? Math.round(aggregate._avg.rating * 10) / 10
            : 0,
        count: aggregate._count._all,
      },
    };
  }

  async upsertCatalogReview(
    organizationId: string,
    userId: string,
    input: UpsertPresenceCatalogReviewInput,
  ) {
    await this.assertCatalogTargetVisible(organizationId, input.targetType, input.targetId);
    const body =
      typeof input.body === 'string' && input.body.trim() ? input.body.trim() : null;
    const row = await this.prisma.presenceCatalogReview.upsert({
      where: {
        organizationId_userId_targetType_targetId: {
          organizationId,
          userId,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      create: {
        organizationId,
        userId,
        targetType: input.targetType,
        targetId: input.targetId,
        rating: input.rating,
        body,
      },
      update: {
        rating: input.rating,
        body,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      rating: row.rating,
      body: row.body,
      author: row.user.fullName,
      organizationName: row.organization.name,
      userId: row.userId,
      organizationId: row.organizationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      dateLabel: formatReviewDate(row.createdAt),
      isMine: true,
    };
  }

  async deleteCatalogReview(organizationId: string, userId: string, reviewId: string) {
    const row = await this.prisma.presenceCatalogReview.findFirst({
      where: { id: reviewId, organizationId, userId },
    });
    if (!row) throw new NotFoundException('Review not found');
    await this.prisma.presenceCatalogReview.delete({ where: { id: row.id } });
    return { ok: true };
  }

  private async ratingAggregates(targetType: CatalogReviewTargetType, targetIds: string[]) {
    const map = new Map<string, { average: number; count: number }>();
    if (!targetIds.length) return map;
    const rows = await this.prisma.presenceCatalogReview.groupBy({
      by: ['targetId'],
      where: { targetType, targetId: { in: targetIds } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const row of rows) {
      map.set(row.targetId, {
        average:
          row._count._all > 0 && row._avg.rating != null
            ? Math.round(row._avg.rating * 10) / 10
            : 0,
        count: row._count._all,
      });
    }
    return map;
  }

  private async assertCatalogTargetVisible(
    organizationId: string,
    targetType: CatalogReviewTargetType,
    targetId: string,
  ) {
    if (targetType === 'theme') {
      const theme = await this.prisma.presenceTheme.findFirst({
        where: {
          id: targetId,
          OR: [{ isSystem: true }, { organizationId }],
        },
        select: { id: true },
      });
      if (!theme) throw new NotFoundException('Theme not found');
      return;
    }
    const moduleDef = await this.prisma.presenceModuleDefinition.findFirst({
      where: {
        id: targetId,
        OR: [{ isSystem: true }, { organizationId }],
      },
      select: { id: true },
    });
    if (!moduleDef) throw new NotFoundException('Component not found');
  }
}
