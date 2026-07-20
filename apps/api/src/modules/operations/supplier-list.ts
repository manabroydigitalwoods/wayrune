/** Suppliers list enrichment — room products, active rates, and contracts. */

export function isStaySupplierType(type?: string | null): boolean {
  return type === 'hotel' || type === 'homestay' || type === 'farmstay';
}

export function isTransportSupplierType(type?: string | null): boolean {
  return (
    type === 'car_rental' ||
    type === 'driver' ||
    type === 'transfer' ||
    type === 'transport'
  );
}

export function supplierHasRateCatalog(type?: string | null): boolean {
  return (
    isStaySupplierType(type) ||
    type === 'activity' ||
    isTransportSupplierType(type)
  );
}

const activeRateWhere = { isActive: true, deletedAt: null } as const;
const activeRoomProductWhere = { isActive: true, deletedAt: null } as const;
const activeContractWhere = { status: 'active', deletedAt: null } as const;

export const supplierListInclude = {
  linkedOrganization: {
    select: { id: true, name: true, kind: true, slug: true },
  },
  linkedAsset: {
    select: {
      id: true,
      name: true,
      assetKind: true,
      _count: { select: { roomProducts: { where: activeRoomProductWhere } } },
    },
  },
  place: { select: { id: true, name: true, kind: true } },
  _count: {
    select: {
      hotelRates: { where: activeRateWhere },
      activityRates: { where: activeRateWhere },
      transferFares: { where: activeRateWhere },
      contracts: { where: activeContractWhere },
    },
  },
} as const;

export function supplierActiveRateCount(
  type: string | null | undefined,
  counts: {
    hotelRates: number;
    activityRates: number;
    transferFares: number;
  },
): number | null {
  if (isStaySupplierType(type)) return counts.hotelRates;
  if (type === 'activity') return counts.activityRates;
  if (isTransportSupplierType(type)) return counts.transferFares;
  return null;
}

type SupplierListRowInput = {
  _count?: {
    hotelRates: number;
    activityRates: number;
    transferFares: number;
    contracts: number;
  };
  linkedAsset?: {
    id: string;
    name: string;
    assetKind: string;
    _count?: { roomProducts: number };
  } | null;
  [key: string]: unknown;
};

export function mapSupplierListRow<T extends SupplierListRowInput>(row: T) {
  const counts = row._count ?? {
    hotelRates: 0,
    activityRates: 0,
    transferFares: 0,
    contracts: 0,
  };
  const roomProductCount = isStaySupplierType(row.type as string | undefined)
    ? (row.linkedAsset?._count?.roomProducts ?? 0)
    : 0;
  const activeRateCount = supplierActiveRateCount(
    row.type as string | undefined,
    counts,
  );
  const activeContractCount = counts.contracts;

  const { _count, linkedAsset, ...rest } = row;
  const linkedAssetOut = linkedAsset
    ? {
        id: linkedAsset.id,
        name: linkedAsset.name,
        assetKind: linkedAsset.assetKind,
      }
    : linkedAsset ?? null;

  return {
    ...rest,
    linkedAsset: linkedAssetOut,
    roomProductCount,
    activeRateCount,
    activeContractCount,
  };
}
