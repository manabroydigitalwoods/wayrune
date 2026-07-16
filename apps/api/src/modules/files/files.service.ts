import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { mkdir, rename, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { createHash, randomUUID } from 'crypto';
import { findMonorepoRoot, loadEnv } from '@travel/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FilesService {
  private readonly uploadRoot: string;
  private readonly storageMode: 'local' | 's3';

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {
    const env = loadEnv();
    this.storageMode = env.fileStorage;
    this.uploadRoot = resolve(findMonorepoRoot(), env.uploadDir);
  }

  private absolutePath(storageKey: string) {
    return join(this.uploadRoot, storageKey);
  }

  async upload(input: {
    organizationId: string;
    userId: string;
    entityType: string;
    entityId: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    visibility?: string;
  }) {
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${input.organizationId}/${input.entityType}/${input.entityId}/${randomUUID()}-${safeName}`;

    if (this.storageMode === 'local') {
      const full = this.absolutePath(storageKey);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, input.buffer);
    }

    const doc = await this.prisma.document.create({
      data: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        name: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        storageKey,
        visibility: input.visibility ?? 'internal',
        createdBy: input.userId,
        updatedBy: input.userId,
      },
    });

    await this.audit.record({
      organizationId: input.organizationId,
      actorUserId: input.userId,
      action: 'document.upload',
      entityType: 'document',
      entityId: doc.id,
      metadata: { checksum: createHash('sha256').update(input.buffer).digest('hex') },
    });

    return {
      ...doc,
      contentUrl: `/api/v1/files/${doc.id}/content`,
    };
  }

  async contentStream(organizationId: string, documentId: string, userId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Document not found');

    await this.audit.record({
      organizationId,
      actorUserId: userId,
      action: 'document.access',
      entityType: 'document',
      entityId: doc.id,
    });

    const full = this.absolutePath(doc.storageKey);
    if (!existsSync(full)) {
      throw new NotFoundException('File missing on disk');
    }

    return {
      stream: createReadStream(full),
      mimeType: doc.mimeType,
      fileName: doc.name,
      sizeBytes: doc.sizeBytes,
    };
  }

  /** @deprecated Prefer contentUrl; kept for older clients */
  async signedUrl(organizationId: string, documentId: string, userId: string) {
    await this.contentStream(organizationId, documentId, userId);
    return `/api/v1/files/${documentId}/content`;
  }

  async listForEntity(organizationId: string, entityType: string, entityId: string) {
    const items = await this.prisma.document.findMany({
      where: { organizationId, entityType, entityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((doc) => ({
      ...doc,
      contentUrl: `/api/v1/files/${doc.id}/content`,
    }));
  }

  async listForEntities(organizationId: string, entityType: string, entityIds: string[]) {
    if (!entityIds.length) return [];
    const items = await this.prisma.document.findMany({
      where: {
        organizationId,
        entityType,
        entityId: { in: entityIds },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((doc) => ({
      ...doc,
      contentUrl: `/api/v1/files/${doc.id}/content`,
    }));
  }

  async reassociate(
    organizationId: string,
    userId: string,
    input: {
      documentIds: string[];
      fromEntityType: string;
      fromEntityId: string;
      toEntityType: string;
      toEntityId: string;
    },
  ) {
    const docs = await this.prisma.document.findMany({
      where: {
        organizationId,
        id: { in: input.documentIds },
        entityType: input.fromEntityType,
        entityId: input.fromEntityId,
        deletedAt: null,
      },
    });

    const updated = [];
    for (const doc of docs) {
      const nextKey = doc.storageKey.replace(
        `/${input.fromEntityType}/${input.fromEntityId}/`,
        `/${input.toEntityType}/${input.toEntityId}/`,
      );
      if (this.storageMode === 'local' && nextKey !== doc.storageKey) {
        const from = this.absolutePath(doc.storageKey);
        const to = this.absolutePath(nextKey);
        if (existsSync(from)) {
          await mkdir(dirname(to), { recursive: true });
          await rename(from, to);
        }
      }
      const row = await this.prisma.document.update({
        where: { id: doc.id },
        data: {
          entityType: input.toEntityType,
          entityId: input.toEntityId,
          storageKey: nextKey,
          updatedBy: userId,
        },
      });
      updated.push({ ...row, contentUrl: `/api/v1/files/${row.id}/content` });
    }
    return updated;
  }
}
