import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { mkdir, rename, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';
import { findMonorepoRoot, loadEnv } from '@wayrune/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GoogleService } from '../google/google.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadRoot: string;
  private readonly storageMode: 'local' | 's3';

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Optional()
    @Inject(forwardRef(() => GoogleService))
    private google?: GoogleService,
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

    let driveFileId: string | null = null;
    let driveWebViewLink: string | null = null;
    let storageProvider = 'local';

    if (this.google) {
      try {
        const useDrive = await this.google.isDriveFileStorageEnabled(input.organizationId);
        if (useDrive) {
          const uploaded = await this.google.uploadBufferToDrive(input.organizationId, {
            fileName: input.fileName,
            mimeType: input.mimeType,
            buffer: input.buffer,
          });
          driveFileId = uploaded.id;
          driveWebViewLink = uploaded.webViewLink ?? null;
          storageProvider = 'drive';
        }
      } catch (err) {
        this.logger.warn(
          `Drive file storage upload failed; kept local copy: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
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
        storageProvider,
        driveFileId,
        driveWebViewLink,
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
      metadata: {
        checksum: createHash('sha256').update(input.buffer).digest('hex'),
        storageProvider,
        driveFileId,
      },
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

    return this.openDocumentStream(doc);
  }

  /**
   * Auth-free stream for presence public pages:
   * - presence_site image/* (page media)
   * - presence_theme image/* | font/* | application/font-* (theme package assets)
   */
  async publicPresenceMedia(organizationId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        deletedAt: null,
        OR: [
          {
            entityType: 'presence_site',
            mimeType: { startsWith: 'image/' },
          },
          {
            entityType: 'presence_theme',
            OR: [
              { mimeType: { startsWith: 'image/' } },
              { mimeType: { startsWith: 'font/' } },
              { mimeType: { startsWith: 'application/font-' } },
              { mimeType: { in: ['text/javascript', 'application/javascript', 'text/css'] } },
            ],
          },
          {
            entityType: 'presence_module',
            OR: [
              { mimeType: { startsWith: 'image/' } },
              { mimeType: { startsWith: 'font/' } },
              { mimeType: { in: ['text/javascript', 'application/javascript', 'text/css'] } },
            ],
          },
        ],
      },
    });
    if (!doc) throw new NotFoundException('Media not found');
    return this.openDocumentStream(doc);
  }

  private async openDocumentStream(doc: {
    id: string;
    storageKey: string;
    mimeType: string;
    name: string;
    sizeBytes: number;
    driveFileId: string | null;
    organizationId: string;
  }) {
    const full = this.absolutePath(doc.storageKey);
    if (existsSync(full)) {
      return {
        stream: createReadStream(full),
        mimeType: doc.mimeType,
        fileName: doc.name,
        sizeBytes: doc.sizeBytes,
      };
    }

    if (doc.driveFileId && this.google) {
      const buffer = await this.google.downloadDriveFile(doc.organizationId, doc.driveFileId);
      return {
        stream: Readable.from(buffer),
        mimeType: doc.mimeType,
        fileName: doc.name,
        sizeBytes: buffer.length,
      };
    }

    throw new NotFoundException('File missing on disk');
  }

  async readBuffer(organizationId: string, documentId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  }> {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const full = this.absolutePath(doc.storageKey);
    if (existsSync(full)) {
      const { readFile } = await import('fs/promises');
      const buffer = await readFile(full);
      return { buffer, mimeType: doc.mimeType, fileName: doc.name };
    }
    if (doc.driveFileId && this.google) {
      const buffer = await this.google.downloadDriveFile(organizationId, doc.driveFileId);
      return { buffer, mimeType: doc.mimeType, fileName: doc.name };
    }
    throw new NotFoundException('File missing on disk');
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
