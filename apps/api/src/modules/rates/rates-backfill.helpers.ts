import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

function roomTypeKeyFromName(name: string): string {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return key || 'room';
}

/**
 * For agency supplier hotel rates missing roomProductId:
 * match rate.roomType → AssetRoomProduct on supplier.linkedAssetId (case-insensitive),
 * create product when absent, then set rate.roomProductId.
 * Optionally attach orphan rates to the supplier's sole active contract.
 */
export async function backfillHotelRateRoomProducts(
  prisma: Db,
  organizationId?: string,
): Promise<number> {
  const rates = await prisma.supplierHotelRate.findMany({
    where: {
      deletedAt: null,
      isSystem: false,
      roomProductId: null,
      roomType: { not: null },
      ...(organizationId ? { organizationId } : {}),
      supplier: {
        deletedAt: null,
        linkedAssetId: { not: null },
        ...(organizationId ? { organizationId } : {}),
      },
    },
    select: {
      id: true,
      organizationId: true,
      supplierId: true,
      roomType: true,
      contractId: true,
      supplier: { select: { linkedAssetId: true } },
    },
  });

  let updated = 0;
  for (const rate of rates) {
    const assetId = rate.supplier?.linkedAssetId;
    const roomName = rate.roomType?.trim();
    if (!assetId || !roomName) continue;

    const roomNameLower = roomName.toLowerCase();
    const products = await prisma.assetRoomProduct.findMany({
      where: { assetId, deletedAt: null },
    });
    let product =
      products.find((p) => p.name.trim().toLowerCase() === roomNameLower) ??
      null;
    if (!product) {
      product = await prisma.assetRoomProduct.create({
        data: {
          assetId,
          name: roomName,
          roomTypeKey: roomTypeKeyFromName(roomName),
          maxOccupancy: 2,
          isActive: true,
        },
      });
    }

    const data: Prisma.SupplierHotelRateUpdateInput = {
      roomProduct: { connect: { id: product.id } },
    };

    if (!rate.contractId && rate.supplierId && rate.organizationId) {
      const activeContracts = await prisma.supplierContract.findMany({
        where: {
          organizationId: rate.organizationId,
          supplierId: rate.supplierId,
          status: 'active',
          deletedAt: null,
        },
        select: { id: true },
      });
      if (activeContracts.length === 1) {
        data.contract = { connect: { id: activeContracts[0]!.id } };
      }
    }

    await prisma.supplierHotelRate.update({
      where: { id: rate.id },
      data,
    });
    updated += 1;
  }

  return updated;
}

export type SupplierStayRoomProductDef = {
  name: string;
  roomTypeKey?: string;
  maxOccupancy?: number;
  baseQuantity?: number;
  allotmentStart?: string;
  allotmentEnd?: string;
};

/** Idempotent shadow stay asset + room products + allotment windows for agency suppliers. */
export async function ensureSupplierLinkedStayInventory(
  prisma: Db,
  opts: {
    organizationId: string;
    supplierId: string;
    supplierName: string;
    placeId?: string | null;
    profileJson?: Prisma.InputJsonValue;
    createdBy?: string | null;
    roomProducts: SupplierStayRoomProductDef[];
  },
) {
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: opts.supplierId,
      organizationId: opts.organizationId,
      deletedAt: null,
    },
    select: { id: true, linkedAssetId: true },
  });
  if (!supplier) throw new Error(`Supplier not found: ${opts.supplierId}`);

  let assetId = supplier.linkedAssetId;
  if (assetId) {
    const existingAsset = await prisma.partnerAsset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: { id: true },
    });
    if (!existingAsset) assetId = null;
  }

  if (!assetId) {
    const asset = await prisma.partnerAsset.create({
      data: {
        organizationId: opts.organizationId,
        name: opts.supplierName.trim() || 'Stay property',
        assetKind: 'hotel',
        placeId: opts.placeId ?? null,
        profileJson: opts.profileJson,
        isActive: true,
        createdBy: opts.createdBy ?? null,
      },
    });
    assetId = asset.id;
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { linkedAssetId: assetId },
    });
  }

  const productIds: Record<string, string> = {};
  for (const def of opts.roomProducts) {
    const name = def.name.trim();
    if (!name) continue;

    const nameLower = name.toLowerCase();
    const products = await prisma.assetRoomProduct.findMany({
      where: { assetId, deletedAt: null },
    });
    let product =
      products.find((p) => p.name.trim().toLowerCase() === nameLower) ?? null;
    if (product) {
      product = await prisma.assetRoomProduct.update({
        where: { id: product.id },
        data: {
          name,
          roomTypeKey: def.roomTypeKey ?? roomTypeKeyFromName(name),
          maxOccupancy: def.maxOccupancy ?? product.maxOccupancy,
          baseQuantity: def.baseQuantity ?? product.baseQuantity,
          isActive: true,
        },
      });
    } else {
      product = await prisma.assetRoomProduct.create({
        data: {
          assetId,
          name,
          roomTypeKey: def.roomTypeKey ?? roomTypeKeyFromName(name),
          maxOccupancy: def.maxOccupancy ?? 2,
          baseQuantity: def.baseQuantity ?? 1,
          isActive: true,
        },
      });
    }
    productIds[name.toLowerCase()] = product.id;

    if (def.allotmentStart && def.allotmentEnd) {
      const startDate = new Date(`${def.allotmentStart}T00:00:00.000Z`);
      const endDate = new Date(`${def.allotmentEnd}T00:00:00.000Z`);
      const existingAllotment = await prisma.assetAllotment.findFirst({
        where: {
          roomProductId: product.id,
          startDate,
          endDate,
        },
      });
      if (existingAllotment) {
        await prisma.assetAllotment.update({
          where: { id: existingAllotment.id },
          data: {
            availableCount: def.baseQuantity ?? existingAllotment.availableCount,
            stopSell: false,
          },
        });
      } else {
        await prisma.assetAllotment.create({
          data: {
            roomProductId: product.id,
            startDate,
            endDate,
            availableCount: def.baseQuantity ?? product.baseQuantity ?? 1,
            stopSell: false,
          },
        });
      }
    }
  }

  return { assetId, productIds };
}
