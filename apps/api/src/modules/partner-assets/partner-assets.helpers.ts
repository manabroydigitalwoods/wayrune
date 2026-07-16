import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** Map Organization.kind → default PartnerAsset.assetKind */
export function orgKindToAssetKind(orgKind: string): string {
  switch (orgKind) {
    case 'hotel':
      return 'hotel';
    case 'homestay':
      return 'homestay';
    case 'farmstay':
      return 'farmstay';
    case 'car_rental':
      return 'vehicle';
    case 'driver':
      return 'driver';
    case 'restaurant':
      return 'restaurant';
    default:
      return 'other';
  }
}

/** Buyer / operator workspaces that reuse the Agency spine (CRM, trips, quotes). */
export function isAgencyWorkspaceKind(kind: string): boolean {
  return kind === 'travel_agency' || kind === 'dmc';
}

/** Fulfilment partner OSes (stay, fleet, driver, restaurant, other) — not Agency/DMC/platform. */
export function isPartnerOrgKind(kind: string): boolean {
  return !isAgencyWorkspaceKind(kind) && kind !== 'platform';
}

/** Ensure at least one active PartnerAsset exists for a partner org. */
export async function ensureDefaultPartnerAsset(
  prisma: Db,
  organizationId: string,
  assetKind: string,
  name: string,
  createdBy?: string | null,
) {
  const existing = await prisma.partnerAsset.findFirst({
    where: { organizationId, deletedAt: null, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  return prisma.partnerAsset.create({
    data: {
      organizationId,
      assetKind,
      name: name.trim() || 'Default asset',
      isActive: true,
      createdBy: createdBy || null,
    },
  });
}

/** Backfill PartnerAsset for partner orgs that have none (seed / migration safety). */
export async function backfillPartnerDefaultAssets(prisma: PrismaClient) {
  const orgs = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      kind: { notIn: ['travel_agency', 'platform'] },
    },
    select: { id: true, name: true, kind: true },
  });

  let created = 0;
  for (const org of orgs) {
    const count = await prisma.partnerAsset.count({
      where: { organizationId: org.id, deletedAt: null },
    });
    if (count > 0) continue;
    await ensureDefaultPartnerAsset(
      prisma,
      org.id,
      orgKindToAssetKind(org.kind),
      org.name,
    );
    created += 1;
  }
  return created;
}

const STAY_ASSET_KINDS = new Set(['hotel', 'homestay', 'farmstay']);

/**
 * Idempotent starter inventory for a stay PartnerAsset:
 * room products, labeled units, a 90-day allotment window, BAR rate.
 * Skips when any room product already exists on the asset.
 */
export async function ensureStayStarterInventory(
  prisma: Db,
  asset: { id: string; assetKind: string; name: string },
) {
  if (!STAY_ASSET_KINDS.has(asset.assetKind)) return null;

  const existing = await prisma.assetRoomProduct.count({
    where: { assetId: asset.id, deletedAt: null },
  });
  if (existing > 0) return null;

  const productDefs =
    asset.assetKind === 'hotel'
      ? [
          {
            name: 'Deluxe Double',
            roomTypeKey: 'deluxe',
            maxOccupancy: 2,
            bedConfig: '1 king',
            baseQuantity: 4,
            rateHint: 6500,
            units: ['101', '102', '201', '202'],
          },
          {
            name: 'Family Suite',
            roomTypeKey: 'suite',
            maxOccupancy: 4,
            bedConfig: '1 king + 1 twin',
            baseQuantity: 2,
            rateHint: 9800,
            units: ['301', '302'],
          },
        ]
      : [
          {
            name: asset.assetKind === 'farmstay' ? 'Cottage' : 'Private room',
            roomTypeKey: 'standard',
            maxOccupancy: 2,
            bedConfig: '1 double',
            baseQuantity: 3,
            rateHint: 3500,
            units: ['A1', 'A2', 'B1'],
          },
        ];

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 90);

  const createdProducts = [];
  for (const def of productDefs) {
    const product = await prisma.assetRoomProduct.create({
      data: {
        assetId: asset.id,
        name: def.name,
        roomTypeKey: def.roomTypeKey,
        maxOccupancy: def.maxOccupancy,
        bedConfig: def.bedConfig,
        baseQuantity: def.baseQuantity,
        rateHint: def.rateHint,
        isActive: true,
      },
    });
    await prisma.assetAllotment.create({
      data: {
        roomProductId: product.id,
        startDate: today,
        endDate: end,
        availableCount: def.baseQuantity,
        stopSell: false,
      },
    });
    await prisma.assetRatePlan.create({
      data: {
        roomProductId: product.id,
        name: 'BAR',
        amount: def.rateHint,
        currency: 'INR',
        startDate: today,
        endDate: end,
        isActive: true,
      },
    });
    for (let i = 0; i < def.units.length; i++) {
      await prisma.assetRoomUnit.create({
        data: {
          roomProductId: product.id,
          name: def.units[i],
          floor: String(Math.floor(i / 2) + 1),
          status: 'vacant_clean',
          isActive: true,
        },
      });
    }
    createdProducts.push(product);
  }

  return { assetId: asset.id, products: createdProducts.length };
}

/** Ensure every stay PartnerAsset without room products gets starter inventory. */
export async function backfillStayStarterInventory(prisma: PrismaClient) {
  const assets = await prisma.partnerAsset.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      assetKind: { in: [...STAY_ASSET_KINDS] },
    },
    select: { id: true, assetKind: true, name: true },
  });
  let seeded = 0;
  for (const asset of assets) {
    const result = await ensureStayStarterInventory(prisma, asset);
    if (result) seeded += 1;
  }
  return seeded;
}
