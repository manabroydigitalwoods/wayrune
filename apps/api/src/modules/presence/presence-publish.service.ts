import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class PresencePublishService {
  constructor(private prisma: PrismaService) {}

  async publishSite(
    organizationId: string,
    siteId: string,
    publish: boolean,
    createdByUserId?: string | null,
  ) {
    const site = await this.prisma.presenceSite.findFirst({
      where: { id: siteId, organizationId },
      include: { pages: { include: { sections: { orderBy: { position: 'asc' } } } } },
    });
    if (!site) throw new NotFoundException('Site not found');

    const status = publish ? 'published' : 'draft';
    if (!publish) {
      return this.prisma.presenceSite.update({
        where: { id: siteId },
        data: { status, publishedSnapshotJson: Prisma.JsonNull },
      });
    }

    if (site.pages.length === 0) {
      throw new BadRequestException('Site must have at least one page before publishing');
    }
    const hasHome =
      Boolean(site.homePageId) || site.pages.some((page) => page.path === '/');
    if (!hasHome) {
      throw new BadRequestException(
        'Site must have a home page (homePageId or a page at path "/") before publishing',
      );
    }

    const pagesSnapshot = site.pages.map((page) => ({
      id: page.id,
      title: page.title,
      path: page.path,
      layoutKey: page.layoutKey,
      sections: page.sections.map((section) => ({
        type: section.type,
        propsJson: asRecord(section.propsJson),
        position: section.position,
        slotKey: section.slotKey,
        parentId: section.parentId,
        moduleDefinitionId: section.moduleDefinitionId,
      })),
    }));

    const snapshotJson = {
      navigation: site.navigationJson,
      menus: site.menusJson,
      menuAssignments: site.menuAssignmentsJson,
      globalRegions: site.globalRegionsJson,
      pages: pagesSnapshot,
    } as Prisma.InputJsonValue;

    const lastVersion = await this.prisma.presencePublishVersion.findFirst({
      where: { siteId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (lastVersion?.version ?? 0) + 1;

    await this.prisma.$transaction([
      this.prisma.presenceSite.update({
        where: { id: siteId },
        data: {
          status,
          publishedSnapshotJson: snapshotJson,
        },
      }),
      this.prisma.presencePublishVersion.create({
        data: {
          siteId,
          version: nextVersion,
          snapshotJson,
          createdByUserId: createdByUserId ?? null,
        },
      }),
      this.prisma.presencePage.updateMany({
        where: { siteId },
        data: { status: 'published', publishedAt: new Date() },
      }),
      ...site.pages.map((page) =>
        this.prisma.presencePage.update({
          where: { id: page.id },
          data: {
            publishedSnapshotJson: {
              title: page.title,
              path: page.path,
              layoutKey: page.layoutKey,
              sections: page.sections.map((section) => ({
                type: section.type,
                propsJson: asRecord(section.propsJson),
                position: section.position,
                slotKey: section.slotKey,
                parentId: section.parentId,
                moduleDefinitionId: section.moduleDefinitionId,
              })),
            } as Prisma.InputJsonValue,
          },
        }),
      ),
    ]);

    return this.prisma.presenceSite.findUniqueOrThrow({
      where: { id: siteId },
      include: { pages: true, theme: true },
    });
  }

  async listPublishVersions(organizationId: string, siteId: string) {
    const site = await this.prisma.presenceSite.findFirst({
      where: { id: siteId, organizationId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    return this.prisma.presencePublishVersion.findMany({
      where: { siteId },
      orderBy: [{ version: 'desc' }],
    });
  }

  async rollbackToVersion(organizationId: string, siteId: string, versionId: string) {
    const site = await this.prisma.presenceSite.findFirst({
      where: { id: siteId, organizationId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const version = await this.prisma.presencePublishVersion.findFirst({
      where: { id: versionId, siteId },
    });
    if (!version) throw new NotFoundException('Publish version not found');

    const snapshot = asRecord(version.snapshotJson);
    const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.presenceSite.update({
        where: { id: siteId },
        data: {
          status: 'published',
          publishedSnapshotJson: version.snapshotJson as Prisma.InputJsonValue,
        },
      });

      for (const pageSnap of pages) {
        const page = asRecord(pageSnap);
        const pageId = typeof page.id === 'string' ? page.id : null;
        if (!pageId) continue;
        await tx.presencePage.updateMany({
          where: { id: pageId, siteId },
          data: {
            status: 'published',
            publishedAt: new Date(),
            publishedSnapshotJson: {
              title: page.title,
              path: page.path,
              layoutKey: page.layoutKey ?? null,
              sections: Array.isArray(page.sections) ? page.sections : [],
            } as Prisma.InputJsonValue,
          },
        });
      }
    });

    return this.prisma.presenceSite.findUniqueOrThrow({
      where: { id: siteId },
      include: { pages: true, theme: true },
    });
  }

  async publishPage(organizationId: string, pageId: string, publish: boolean) {
    const page = await this.prisma.presencePage.findFirst({
      where: { id: pageId, site: { organizationId } },
      include: { sections: { orderBy: { position: 'asc' } } },
    });
    if (!page) throw new NotFoundException('Page not found');
    return this.prisma.presencePage.update({
      where: { id: page.id },
      data: {
        status: publish ? 'published' : 'draft',
        publishedAt: publish ? new Date() : null,
        publishedSnapshotJson: publish
          ? ({
              title: page.title,
              path: page.path,
              layoutKey: page.layoutKey,
              sections: page.sections.map((section) => ({
                type: section.type,
                propsJson: asRecord(section.propsJson),
                position: section.position,
                slotKey: section.slotKey,
                parentId: section.parentId,
                moduleDefinitionId: section.moduleDefinitionId,
              })),
            } as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }
}
