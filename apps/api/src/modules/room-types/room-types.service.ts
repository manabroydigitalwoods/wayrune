import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateRoomTypeInput } from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class RoomTypesService {
  constructor(private prisma: PrismaService) {}

  async list(organizationId: string, q?: string) {
    const scoped: Prisma.RoomTypeWhereInput = {
      deletedAt: null,
      isActive: true,
      AND: [
        {
          OR: [{ isSystem: true, organizationId: null }, { organizationId }],
        },
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q } },
                  { key: { contains: q } },
                  { description: { contains: q } },
                ],
              },
            ]
          : []),
      ],
    };

    const items = await this.prisma.roomType.findMany({
      where: scoped,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      take: 100,
    });

    const byKey = new Map<string, (typeof items)[0]>();
    for (const item of items) {
      const existing = byKey.get(item.key);
      if (!existing || (!item.isSystem && existing.isSystem)) {
        byKey.set(item.key, item);
      }
    }

    return {
      items: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async create(organizationId: string, userId: string, input: CreateRoomTypeInput) {
    const key = slugify(input.name);
    if (!key) throw new ConflictException('Invalid room type name');

    const duplicate = await this.prisma.roomType.findFirst({
      where: {
        deletedAt: null,
        key,
        OR: [{ organizationId }, { isSystem: true, organizationId: null }],
      },
    });
    if (duplicate) {
      throw new ConflictException(
        duplicate.isSystem
          ? 'This room type already exists in the system catalog'
          : 'Your agency already has this room type',
      );
    }

    return this.prisma.roomType.create({
      data: {
        organizationId,
        name: input.name.trim(),
        key,
        description: input.description?.trim() || null,
        isSystem: false,
        isActive: true,
        createdBy: userId,
      },
    });
  }
}
