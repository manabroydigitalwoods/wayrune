import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreatePresenceCollection,
  PresenceAnalyticsEvent,
  UpsertPresenceCollectionEntry,
} from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PresenceContentService {
  constructor(private prisma: PrismaService) {}

  private async assertSite(organizationId: string, siteId: string) {
    const site = await this.prisma.presenceSite.findFirst({
      where: { id: siteId, organizationId },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  listCollections(organizationId: string, siteId: string) {
    return this.assertSite(organizationId, siteId).then(() =>
      this.prisma.presenceCollection.findMany({
        where: { siteId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { entries: true } } },
      }),
    );
  }

  async createCollection(
    organizationId: string,
    siteId: string,
    input: CreatePresenceCollection,
  ) {
    await this.assertSite(organizationId, siteId);
    const listingPath = input.listingPath || `/${input.key}`;
    const detailPathPattern = input.detailPathPattern || `${listingPath}/:slug`;
    try {
      return await this.prisma.presenceCollection.create({
        data: {
          siteId,
          key: input.key,
          name: input.name,
          fieldsJson: (input.fieldsJson ?? []) as Prisma.InputJsonValue,
          listingPath,
          detailPathPattern,
        },
      });
    } catch {
      throw new BadRequestException('Collection key already exists on this site');
    }
  }

  async deleteCollection(organizationId: string, siteId: string, collectionId: string) {
    await this.assertSite(organizationId, siteId);
    const row = await this.prisma.presenceCollection.findFirst({
      where: { id: collectionId, siteId },
    });
    if (!row) throw new NotFoundException('Collection not found');
    await this.prisma.presenceCollection.delete({ where: { id: collectionId } });
    return { ok: true };
  }

  listEntries(organizationId: string, siteId: string, collectionId: string) {
    return this.assertSite(organizationId, siteId).then(async () => {
      const col = await this.prisma.presenceCollection.findFirst({
        where: { id: collectionId, siteId },
      });
      if (!col) throw new NotFoundException('Collection not found');
      return this.prisma.presenceCollectionEntry.findMany({
        where: { collectionId },
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      });
    });
  }

  async upsertEntry(
    organizationId: string,
    siteId: string,
    collectionId: string,
    input: UpsertPresenceCollectionEntry,
    entryId?: string,
  ) {
    await this.assertSite(organizationId, siteId);
    const col = await this.prisma.presenceCollection.findFirst({
      where: { id: collectionId, siteId },
    });
    if (!col) throw new NotFoundException('Collection not found');

    const status = input.status ?? 'draft';
    const publishedAt =
      input.publishedAt === null
        ? null
        : input.publishedAt
          ? new Date(input.publishedAt)
          : status === 'published'
            ? new Date()
            : undefined;

    if (entryId) {
      const existing = await this.prisma.presenceCollectionEntry.findFirst({
        where: { id: entryId, collectionId },
      });
      if (!existing) throw new NotFoundException('Entry not found');
      return this.prisma.presenceCollectionEntry.update({
        where: { id: entryId },
        data: {
          slug: input.slug,
          title: input.title,
          dataJson: (input.dataJson ?? {}) as Prisma.InputJsonValue,
          status,
          ...(publishedAt !== undefined ? { publishedAt } : {}),
        },
      });
    }

    return this.prisma.presenceCollectionEntry.create({
      data: {
        collectionId,
        slug: input.slug,
        title: input.title,
        dataJson: (input.dataJson ?? {}) as Prisma.InputJsonValue,
        status,
        publishedAt: publishedAt ?? (status === 'published' ? new Date() : null),
      },
    });
  }

  async deleteEntry(
    organizationId: string,
    siteId: string,
    collectionId: string,
    entryId: string,
  ) {
    await this.assertSite(organizationId, siteId);
    const existing = await this.prisma.presenceCollectionEntry.findFirst({
      where: { id: entryId, collectionId, collection: { siteId } },
    });
    if (!existing) throw new NotFoundException('Entry not found');
    await this.prisma.presenceCollectionEntry.delete({ where: { id: entryId } });
    return { ok: true };
  }

  async adminSearch(organizationId: string, q: string, limit = 20) {
    const query = q.trim();
    if (!query) return { results: [] as Array<Record<string, unknown>> };
    const take = Math.min(Math.max(limit, 1), 50);

    const [pages, themes, modules, forms, collections, assets] = await Promise.all([
      this.prisma.presencePage.findMany({
        where: {
          site: { organizationId },
          OR: [
            { title: { contains: query } },
            { path: { contains: query } },
          ],
        },
        take,
        select: { id: true, title: true, path: true, siteId: true, status: true },
      }),
      this.prisma.presenceTheme.findMany({
        where: {
          OR: [
            { organizationId, name: { contains: query } },
            { organizationId, key: { contains: query } },
            { isSystem: true, name: { contains: query } },
          ],
        },
        take,
        select: { id: true, name: true, key: true },
      }),
      this.prisma.presenceModuleDefinition.findMany({
        where: {
          OR: [
            { organizationId, name: { contains: query } },
            { organizationId, key: { contains: query } },
            { isSystem: true, name: { contains: query } },
          ],
        },
        take,
        select: { id: true, name: true, key: true, category: true },
      }),
      this.prisma.presenceFormDefinition.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: query } },
            { key: { contains: query } },
          ],
        },
        take,
        select: { id: true, name: true, key: true },
      }),
      this.prisma.presenceCollection.findMany({
        where: {
          site: { organizationId },
          OR: [
            { name: { contains: query } },
            { key: { contains: query } },
          ],
        },
        take,
        select: { id: true, name: true, key: true, siteId: true },
      }),
      this.prisma.presenceAssetVersion.findMany({
        where: {
          organizationId,
          OR: [{ changelog: { contains: query } }],
        },
        take,
        select: { id: true, assetType: true, assetId: true, version: true },
      }),
    ]);

    const results: Array<Record<string, unknown>> = [
      ...pages.map((p) => ({
        kind: 'page',
        id: p.id,
        label: p.title,
        meta: p.path,
        siteId: p.siteId,
        href: `/presence/pages?site=${p.siteId}`,
      })),
      ...themes.map((t) => ({
        kind: 'theme',
        id: t.id,
        label: t.name,
        meta: t.key,
        href: `/presence/themes`,
      })),
      ...modules.map((m) => ({
        kind: 'component',
        id: m.id,
        label: m.name,
        meta: m.key,
        href: `/presence/modules`,
      })),
      ...forms.map((f) => ({
        kind: 'form',
        id: f.id,
        label: f.name,
        meta: f.key,
        href: `/presence/forms`,
      })),
      ...collections.map((c) => ({
        kind: 'collection',
        id: c.id,
        label: c.name,
        meta: c.key,
        siteId: c.siteId,
        href: `/presence/collections?site=${c.siteId}`,
      })),
      ...assets.map((a) => ({
        kind: 'asset',
        id: a.id,
        label: `${a.assetType} v${a.version}`,
        meta: a.assetId,
        href: `/presence/assets`,
      })),
    ].slice(0, take);

    return { results };
  }

  async publicSearch(siteId: string, q: string, limit = 20) {
    const query = q.trim();
    if (!query) return { results: [] as Array<Record<string, unknown>> };
    const take = Math.min(Math.max(limit, 1), 50);

    const [pages, entries] = await Promise.all([
      this.prisma.presencePage.findMany({
        where: {
          siteId,
          status: 'published',
          OR: [
            { title: { contains: query } },
            { path: { contains: query } },
          ],
        },
        take,
        select: { title: true, path: true },
      }),
      this.prisma.presenceCollectionEntry.findMany({
        where: {
          status: 'published',
          collection: { siteId },
          OR: [
            { title: { contains: query } },
            { slug: { contains: query } },
          ],
        },
        take,
        include: { collection: { select: { listingPath: true, key: true } } },
      }),
    ]);

    return {
      results: [
        ...pages.map((p) => ({
          kind: 'page',
          title: p.title,
          href: p.path,
        })),
        ...entries.map((e) => ({
          kind: 'entry',
          title: e.title,
          href: `${(e.collection.listingPath || `/${e.collection.key}`).replace(/\/$/, '')}/${e.slug}`,
        })),
      ].slice(0, take),
    };
  }

  async trackEvent(organizationId: string, input: PresenceAnalyticsEvent) {
    const site = await this.prisma.presenceSite.findFirst({
      where: { id: input.siteId, organizationId },
    });
    if (!site) throw new NotFoundException('Site not found');
    return this.prisma.presenceAnalyticsEvent.create({
      data: {
        organizationId,
        siteId: input.siteId,
        eventType: input.eventType,
        path: input.path,
        visitorId: input.visitorId,
        metaJson: (input.metaJson ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /** Public track without auth — validates site belongs to host org. */
  async trackPublicEvent(siteId: string, organizationId: string, input: PresenceAnalyticsEvent) {
    return this.trackEvent(organizationId, { ...input, siteId });
  }

  async analyticsSummary(organizationId: string, siteId: string, days = 30) {
    await this.assertSite(organizationId, siteId);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await this.prisma.presenceAnalyticsEvent.findMany({
      where: { siteId, organizationId, createdAt: { gte: since } },
      select: { eventType: true, path: true, metaJson: true, createdAt: true },
    });

    const byType: Record<string, number> = {};
    const byPath: Record<string, number> = {};
    const ab: Record<string, { impressions: number; conversions: number }> = {};

    for (const e of events) {
      byType[e.eventType] = (byType[e.eventType] || 0) + 1;
      if (e.path) byPath[e.path] = (byPath[e.path] || 0) + 1;
      if (e.eventType === 'ab_impression' || e.eventType === 'ab_conversion') {
        const meta = (e.metaJson && typeof e.metaJson === 'object'
          ? e.metaJson
          : {}) as Record<string, unknown>;
        const key = String(meta.variant ?? 'A');
        if (!ab[key]) ab[key] = { impressions: 0, conversions: 0 };
        if (e.eventType === 'ab_impression') ab[key].impressions += 1;
        else ab[key].conversions += 1;
      }
    }

    const topPaths = Object.entries(byPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    return {
      days,
      totals: byType,
      pageViews: byType.page_view || 0,
      ctaClicks: byType.cta_click || 0,
      formSubmits: byType.form_submit || 0,
      whatsappClicks: byType.whatsapp_click || 0,
      topPaths,
      ab,
    };
  }

  listDataSources(organizationId: string, siteId: string) {
    return this.assertSite(organizationId, siteId).then(async () => {
      const collections = await this.prisma.presenceCollection.findMany({
        where: { siteId },
        select: { key: true, name: true },
      });
      return {
        sources: [
          {
            id: 'trips',
            label: 'Trips',
            description: 'Live trips from Travel OS',
          },
          {
            id: 'quotations',
            label: 'Quotations',
            description: 'Published / sent quotations',
          },
          ...collections.map((c) => ({
            id: `collection:${c.key}`,
            label: c.name,
            description: `CMS collection “${c.key}”`,
          })),
        ],
      };
    });
  }
}
