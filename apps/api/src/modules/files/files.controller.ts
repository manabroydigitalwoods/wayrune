import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions, type AuthUser } from '../../common/helpers';
import { parseFileListEntityIds } from './files-list-query';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private files: FilesService) {}

  @Post('upload')
  @RequirePermissions('document.write')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.files.upload({
      organizationId: user.organizationId,
      userId: user.sub,
      entityType,
      entityId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
  }

  @Post('reassociate')
  @RequirePermissions('document.write')
  reassociate(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      documentIds: string[];
      fromEntityType: string;
      fromEntityId: string;
      toEntityType: string;
      toEntityId: string;
    },
  ) {
    return this.files.reassociate(user.organizationId, user.sub, body);
  }

  @Get(':id/content')
  @RequirePermissions('document.read')
  async content(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.files.contentStream(user.organizationId, id, user.sub);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, max-age=60',
    });
    return new StreamableFile(file.stream);
  }

  @Get(':id/signed-url')
  @RequirePermissions('document.read')
  async signedUrl(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const url = await this.files.signedUrl(user.organizationId, id, user.sub);
    return { url };
  }

  @Get()
  @RequirePermissions('document.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId?: string | string[],
    @Query('entityIds') entityIdsCsv?: string,
    @Query('documentType') documentType?: string,
  ) {
    const ids = parseFileListEntityIds(entityId, entityIdsCsv);
    const typeFilter = { documentType: documentType?.trim() || undefined };
    if (ids.length === 0) {
      return [];
    }
    if (ids.length === 1) {
      return this.files.listForEntity(user.organizationId, entityType, ids[0]!, typeFilter);
    }
    return this.files.listForEntities(user.organizationId, entityType, ids, typeFilter);
  }
}
