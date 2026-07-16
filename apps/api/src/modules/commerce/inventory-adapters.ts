import type { Prisma, PrismaClient } from '@prisma/client';

export type TxClient = Prisma.TransactionClient | PrismaClient;

export type HoldMode = 'hold' | 'release' | 'confirm' | 'expire';

export type InventoryResourceRef = {
  organizationId: string;
  resourceType: string;
  resourceId: string;
  quantity: number;
  windowStart?: Date | null;
  windowEnd?: Date | null;
};

/**
 * Common inventory lifecycle for all resource adapters.
 * @see docs/commerce-integrity/03-reservation-and-inventory-contract.md
 */
export interface InventoryAdapter {
  readonly resourceType: string;
  getAvailability(tx: TxClient, ref: InventoryResourceRef): Promise<number>;
  createHold(tx: TxClient, ref: InventoryResourceRef): Promise<void>;
  extendHold?(tx: TxClient, ref: InventoryResourceRef): Promise<void>;
  consumeHold(tx: TxClient, ref: InventoryResourceRef): Promise<void>;
  releaseHold(tx: TxClient, ref: InventoryResourceRef): Promise<void>;
  expireHold(tx: TxClient, ref: InventoryResourceRef): Promise<void>;
}

async function lockDining(tx: TxClient, id: string) {
  await tx.$queryRaw`SELECT id FROM dining_capacities WHERE id = ${id} FOR UPDATE`;
}

async function lockExperienceSlot(tx: TxClient, id: string) {
  await tx.$queryRaw`SELECT id FROM experience_slots WHERE id = ${id} FOR UPDATE`;
}

export class DiningCapacityAdapter implements InventoryAdapter {
  readonly resourceType = 'dining_capacity';

  async getAvailability(tx: TxClient, ref: InventoryResourceRef) {
    const cap = await tx.diningCapacity.findUnique({ where: { id: ref.resourceId } });
    if (!cap) return 0;
    return Math.max(0, cap.totalCapacity - cap.reserved - cap.held);
  }

  async createHold(tx: TxClient, ref: InventoryResourceRef) {
    await lockDining(tx, ref.resourceId);
    const avail = await this.getAvailability(tx, ref);
    if (avail < ref.quantity) {
      throw new Error(`Insufficient dining capacity (available ${avail})`);
    }
    await tx.diningCapacity.update({
      where: { id: ref.resourceId },
      data: { held: { increment: ref.quantity } },
    });
  }

  async consumeHold(tx: TxClient, ref: InventoryResourceRef) {
    await lockDining(tx, ref.resourceId);
    await tx.diningCapacity.update({
      where: { id: ref.resourceId },
      data: {
        held: { decrement: ref.quantity },
        reserved: { increment: ref.quantity },
      },
    });
  }

  async releaseHold(tx: TxClient, ref: InventoryResourceRef) {
    await lockDining(tx, ref.resourceId);
    await tx.diningCapacity.update({
      where: { id: ref.resourceId },
      data: { held: { decrement: ref.quantity } },
    });
  }

  async expireHold(tx: TxClient, ref: InventoryResourceRef) {
    return this.releaseHold(tx, ref);
  }
}

export class ExperienceSlotAdapter implements InventoryAdapter {
  readonly resourceType = 'experience_slot';

  async getAvailability(tx: TxClient, ref: InventoryResourceRef) {
    const slot = await tx.experienceSlot.findUnique({ where: { id: ref.resourceId } });
    if (!slot) return 0;
    return Math.max(0, slot.capacity - slot.reserved - slot.held);
  }

  async createHold(tx: TxClient, ref: InventoryResourceRef) {
    await lockExperienceSlot(tx, ref.resourceId);
    const avail = await this.getAvailability(tx, ref);
    if (avail < ref.quantity) {
      throw new Error(`Insufficient experience slot capacity (available ${avail})`);
    }
    await tx.experienceSlot.update({
      where: { id: ref.resourceId },
      data: { held: { increment: ref.quantity } },
    });
  }

  async consumeHold(tx: TxClient, ref: InventoryResourceRef) {
    await lockExperienceSlot(tx, ref.resourceId);
    await tx.experienceSlot.update({
      where: { id: ref.resourceId },
      data: {
        held: { decrement: ref.quantity },
        reserved: { increment: ref.quantity },
      },
    });
  }

  async releaseHold(tx: TxClient, ref: InventoryResourceRef) {
    await lockExperienceSlot(tx, ref.resourceId);
    await tx.experienceSlot.update({
      where: { id: ref.resourceId },
      data: { held: { decrement: ref.quantity } },
    });
  }

  async expireHold(tx: TxClient, ref: InventoryResourceRef) {
    return this.releaseHold(tx, ref);
  }
}

/** Stay allotment via InventoryAllocation ledger.
 * resourceId format: `assetId:roomProductId` (create) or allocationId (consume/release).
 */
export class StayAllotmentAdapter implements InventoryAdapter {
  readonly resourceType = 'stay_allotment';

  async getAvailability(tx: TxClient, ref: InventoryResourceRef) {
    const [assetId, roomProductId] = ref.resourceId.split(':');
    if (!assetId || !roomProductId || !ref.windowStart || !ref.windowEnd) return 0;
    const covering = await tx.assetAllotment.findMany({
      where: {
        roomProductId,
        startDate: { lte: ref.windowStart },
        endDate: { gte: ref.windowEnd },
        stopSell: false,
      },
    });
    if (!covering.length) {
      const product = await tx.assetRoomProduct.findUnique({ where: { id: roomProductId } });
      const capacity = product?.baseQuantity ?? 0;
      const used = await this.usedQty(tx, assetId, roomProductId, ref.windowStart, ref.windowEnd);
      return Math.max(0, capacity - used);
    }
    const capacity = Math.min(...covering.map((a) => a.availableCount));
    const used = await this.usedQty(tx, assetId, roomProductId, ref.windowStart, ref.windowEnd);
    return Math.max(0, capacity - used);
  }

  private async usedQty(
    tx: TxClient,
    assetId: string,
    roomProductId: string,
    checkIn: Date,
    checkOut: Date,
  ) {
    const rows = await tx.inventoryAllocation.findMany({
      where: {
        assetId,
        roomProductId,
        status: { in: ['hold', 'confirmed'] },
        checkIn: { not: null },
        checkOut: { not: null },
      },
    });
    return rows
      .filter(
        (al) =>
          al.checkIn &&
          al.checkOut &&
          al.checkIn < checkOut &&
          al.checkOut > checkIn,
      )
      .reduce((s, al) => s + al.quantity, 0);
  }

  async createHold(tx: TxClient, ref: InventoryResourceRef) {
    const [assetId, roomProductId] = ref.resourceId.split(':');
    if (!assetId || !roomProductId || !ref.windowStart || !ref.windowEnd) {
      throw new Error('stay_allotment requires assetId:roomProductId and window');
    }
    await tx.$queryRaw`SELECT id FROM inventory_allocations WHERE asset_id = ${assetId} AND room_product_id = ${roomProductId} FOR UPDATE`;
    const avail = await this.getAvailability(tx, ref);
    if (avail < ref.quantity) {
      throw new Error(`Insufficient stay allotment (available ${avail})`);
    }
    await tx.inventoryAllocation.create({
      data: {
        assetId,
        roomProductId,
        checkIn: ref.windowStart,
        checkOut: ref.windowEnd,
        quantity: Math.max(1, Math.floor(ref.quantity)),
        status: 'hold',
        notes: `hold:${ref.organizationId}`,
      },
    });
  }

  async consumeHold(tx: TxClient, ref: InventoryResourceRef) {
    // If resourceId is allocation id, confirm it; else confirm matching holds
    const byId = await tx.inventoryAllocation.findUnique({ where: { id: ref.resourceId } });
    if (byId) {
      await tx.inventoryAllocation.update({
        where: { id: byId.id },
        data: { status: 'confirmed' },
      });
      return;
    }
    const [assetId, roomProductId] = ref.resourceId.split(':');
    if (!assetId || !roomProductId || !ref.windowStart || !ref.windowEnd) return;
    await tx.inventoryAllocation.updateMany({
      where: {
        assetId,
        roomProductId,
        status: 'hold',
        checkIn: ref.windowStart,
        checkOut: ref.windowEnd,
      },
      data: { status: 'confirmed' },
    });
  }

  async releaseHold(tx: TxClient, ref: InventoryResourceRef) {
    const byId = await tx.inventoryAllocation.findUnique({ where: { id: ref.resourceId } });
    if (byId) {
      await tx.inventoryAllocation.update({
        where: { id: byId.id },
        data: { status: 'released' },
      });
      return;
    }
    const [assetId, roomProductId] = ref.resourceId.split(':');
    if (!assetId || !roomProductId || !ref.windowStart || !ref.windowEnd) return;
    await tx.inventoryAllocation.updateMany({
      where: {
        assetId,
        roomProductId,
        status: 'hold',
        checkIn: ref.windowStart,
        checkOut: ref.windowEnd,
      },
      data: { status: 'released' },
    });
  }

  async expireHold(tx: TxClient, ref: InventoryResourceRef) {
    return this.releaseHold(tx, ref);
  }
}

const adapters: InventoryAdapter[] = [
  new DiningCapacityAdapter(),
  new ExperienceSlotAdapter(),
  new StayAllotmentAdapter(),
];

export function getInventoryAdapter(resourceType: string): InventoryAdapter {
  const a = adapters.find((x) => x.resourceType === resourceType);
  if (!a) {
    throw new Error(`No inventory adapter for resourceType=${resourceType}`);
  }
  return a;
}

export async function applyInventoryMode(
  tx: TxClient,
  mode: HoldMode,
  ref: InventoryResourceRef,
) {
  const adapter = getInventoryAdapter(ref.resourceType);
  if (mode === 'hold') return adapter.createHold(tx, ref);
  if (mode === 'confirm') return adapter.consumeHold(tx, ref);
  if (mode === 'release' || mode === 'expire') {
    return mode === 'expire' ? adapter.expireHold(tx, ref) : adapter.releaseHold(tx, ref);
  }
}
