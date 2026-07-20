/** Labeled demo hotel / transfer / activity suppliers for Operate-ready walkthrough. */

export const DEMO_OPERATE_MARKER = 'demo_operate_v1' as const;

export const DEMO_OPERATE_NOTES = 'Demo data — not for live booking' as const;

/** Display names — `[Demo]` prefix is the human-visible badge. */
export const DEMO_OPERATE_SUPPLIER_NAMES = {
  hotel: '[Demo] Heritage boutique hotel',
  car_rental: '[Demo] Transfer fleet',
  activity: '[Demo] Local sightseeing',
} as const;

export type DemoOperateSupplierType = keyof typeof DEMO_OPERATE_SUPPLIER_NAMES;

export type DemoOperateSupplierIds = {
  hotelId: string;
  transferId: string;
  activityId: string;
};

export type DemoOperatePackSettings = {
  marker: typeof DEMO_OPERATE_MARKER;
  installedAt: string;
  supplierIds: string[];
};

export const DEMO_OPERATE_PROFILE = {
  demoOperate: true,
  liveBooking: false,
  marker: DEMO_OPERATE_MARKER,
} as const;

export function buildDemoOperatePackSettings(
  supplierIds: DemoOperateSupplierIds,
  installedAt = new Date().toISOString(),
): DemoOperatePackSettings {
  return {
    marker: DEMO_OPERATE_MARKER,
    installedAt,
    supplierIds: [
      supplierIds.hotelId,
      supplierIds.transferId,
      supplierIds.activityId,
    ],
  };
}

/** True when name has [Demo] badge or profileJson marks demo operate. */
export function isDemoOperateSupplier(
  nameOrProfile: string | Record<string, unknown> | null | undefined,
): boolean {
  if (nameOrProfile == null) return false;
  if (typeof nameOrProfile === 'string') {
    const name = nameOrProfile.trim();
    if (!name) return false;
    if (name.includes('[Demo]')) return true;
    if (name.includes(DEMO_OPERATE_MARKER)) return true;
    return Object.values(DEMO_OPERATE_SUPPLIER_NAMES).includes(
      name as (typeof DEMO_OPERATE_SUPPLIER_NAMES)[DemoOperateSupplierType],
    );
  }
  if (typeof nameOrProfile !== 'object' || Array.isArray(nameOrProfile)) {
    return false;
  }
  if (nameOrProfile.demoOperate === true) return true;
  if (nameOrProfile.marker === DEMO_OPERATE_MARKER) return true;
  return false;
}

function asDetails(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

/**
 * Stamp supplierIds onto quote template / draft items by serviceType.
 * Clears `priceSource: 'manual'` (keeps `'sell'` and other values).
 */
export function stampDemoSupplierIdsOntoItems(
  items: unknown[],
  ids: DemoOperateSupplierIds,
): Record<string, unknown>[] {
  return items.map((row) => {
    const item =
      row && typeof row === 'object' && !Array.isArray(row)
        ? { ...(row as Record<string, unknown>) }
        : {};
    const serviceType =
      typeof item.serviceType === 'string' ? item.serviceType.toLowerCase() : '';
    let supplierId: string | null = null;
    if (serviceType === 'hotel') supplierId = ids.hotelId;
    else if (
      serviceType === 'transfer' ||
      serviceType === 'car_rental' ||
      serviceType === 'transport'
    ) {
      supplierId = ids.transferId;
    } else if (serviceType === 'activity' || serviceType === 'sightseeing') {
      supplierId = ids.activityId;
    }
    if (!supplierId) return item;

    const details = asDetails(item.details);
    details.supplierId = supplierId;
    details.demoOperate = true;
    if (details.priceSource === 'manual') {
      delete details.priceSource;
    }
    return { ...item, details };
  });
}

/** Remove demo-stamped supplierIds from items (replace-demo cleanup). */
export function stripDemoOperateSupplierIdsFromItems(
  items: unknown[],
): Record<string, unknown>[] {
  return items.map((row) => {
    const item =
      row && typeof row === 'object' && !Array.isArray(row)
        ? { ...(row as Record<string, unknown>) }
        : {};
    const details = asDetails(item.details);
    if (details.demoOperate !== true) return item;
    delete details.supplierId;
    delete details.demoOperate;
    return { ...item, details };
  });
}

export function stampDemoOperateOntoContentJson(
  contentJson: Record<string, unknown>,
  ids: DemoOperateSupplierIds,
): Record<string, unknown> {
  const rawItems = Array.isArray(contentJson.items) ? contentJson.items : [];
  return {
    ...contentJson,
    items: stampDemoSupplierIdsOntoItems(rawItems, ids),
  };
}

export function stripDemoOperateFromContentJson(
  contentJson: Record<string, unknown>,
): Record<string, unknown> {
  const rawItems = Array.isArray(contentJson.items) ? contentJson.items : [];
  return {
    ...contentJson,
    items: stripDemoOperateSupplierIdsFromItems(rawItems),
  };
}
