import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateVehicleTypeInput } from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class VehicleTypesService {
  constructor(private prisma: PrismaService) {}

  async list(organizationId: string, q?: string) {
    const scoped: Prisma.VehicleTypeWhereInput = {
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

    const items = await this.prisma.vehicleType.findMany({
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

  async create(organizationId: string, userId: string, input: CreateVehicleTypeInput) {
    const key = slugify(input.name);
    if (!key) throw new ConflictException('Invalid vehicle type name');

    const duplicate = await this.prisma.vehicleType.findFirst({
      where: {
        deletedAt: null,
        key,
        OR: [{ organizationId }, { isSystem: true, organizationId: null }],
      },
    });
    if (duplicate) {
      throw new ConflictException(
        duplicate.isSystem
          ? 'This vehicle type already exists in the system catalog'
          : 'Your agency already has this vehicle type',
      );
    }

    return this.prisma.vehicleType.create({
      data: {
        organizationId,
        name: input.name.trim(),
        key,
        description: input.description?.trim() || null,
        seats: input.seats ?? null,
        profileJson: input.profile
          ? (input.profile as Prisma.InputJsonValue)
          : undefined,
        isSystem: false,
        isActive: true,
        createdBy: userId,
      },
    });
  }

  /** Platform: list all system vehicle types (including inactive). */
  async listSystem(q?: string) {
    return {
      items: await this.prisma.vehicleType.findMany({
        where: {
          isSystem: true,
          organizationId: null,
          deletedAt: null,
          ...(q
            ? {
                OR: [
                  { name: { contains: q } },
                  { key: { contains: q } },
                  { description: { contains: q } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    };
  }

  async platformCreate(userId: string, input: CreateVehicleTypeInput) {
    const key = slugify(input.name);
    if (!key) throw new ConflictException('Invalid vehicle type name');
    const duplicate = await this.prisma.vehicleType.findFirst({
      where: { deletedAt: null, key, isSystem: true, organizationId: null },
    });
    if (duplicate) throw new ConflictException('Vehicle type already exists');
    return this.prisma.vehicleType.create({
      data: {
        organizationId: null,
        name: input.name.trim(),
        key,
        description: input.description?.trim() || null,
        seats: input.seats ?? null,
        profileJson: input.profile
          ? (input.profile as Prisma.InputJsonValue)
          : undefined,
        isSystem: true,
        isActive: true,
        createdBy: userId,
      },
    });
  }

  async platformUpdate(
    id: string,
    input: Partial<CreateVehicleTypeInput> & { isActive?: boolean },
  ) {
    const row = await this.prisma.vehicleType.findFirst({
      where: { id, isSystem: true, deletedAt: null },
    });
    if (!row) throw new ConflictException('Vehicle type not found');
    return this.prisma.vehicleType.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim(), key: slugify(input.name) } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.seats !== undefined ? { seats: input.seats ?? null } : {}),
        ...(input.profile !== undefined
          ? { profileJson: input.profile as Prisma.InputJsonValue }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }
}
