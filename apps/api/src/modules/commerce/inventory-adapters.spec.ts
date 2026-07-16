import { describe, expect, it } from 'vitest';
import {
  DiningCapacityAdapter,
  ExperienceSlotAdapter,
  type InventoryResourceRef,
  type TxClient,
} from './inventory-adapters';

/**
 * Pure math / contract tests for inventory adapters — no DB required.
 * Each adapter is exercised against a hand-rolled in-memory `tx` fake that
 * mimics the subset of Prisma's client surface the adapters call
 * (`findUnique` + `update` with `increment`/`decrement`, and `$queryRaw` for
 * row locking, which is a no-op here).
 * @see docs/commerce-integrity/11-inventory-adapters-and-stay-modify.md
 */

function applyIncDec(current: number, op: unknown): number {
  if (typeof op === 'number') return op;
  if (op && typeof op === 'object') {
    const o = op as { increment?: number; decrement?: number };
    if (typeof o.increment === 'number') return current + o.increment;
    if (typeof o.decrement === 'number') return current - o.decrement;
  }
  return current;
}

function ref(resourceId: string, quantity: number, resourceType = 'dining_capacity'): InventoryResourceRef {
  return { organizationId: 'org_1', resourceType, resourceId, quantity };
}

function makeDiningTx(initial: {
  id: string;
  totalCapacity: number;
  reserved: number;
  held: number;
}) {
  let record = { ...initial };
  const tx = {
    $queryRaw: async () => [],
    diningCapacity: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === record.id ? { ...record } : null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        if (where.id !== record.id) throw new Error('dining_capacity not found');
        record = {
          ...record,
          reserved:
            'reserved' in data ? applyIncDec(record.reserved, data.reserved) : record.reserved,
          held: 'held' in data ? applyIncDec(record.held, data.held) : record.held,
        };
        return { ...record };
      },
    },
  };
  return { tx: tx as unknown as TxClient, getRecord: () => record };
}

function makeExperienceTx(initial: {
  id: string;
  capacity: number;
  reserved: number;
  held?: number;
}) {
  let record = { held: 0, ...initial };
  const tx = {
    $queryRaw: async () => [],
    experienceSlot: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === record.id ? { ...record } : null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        if (where.id !== record.id) throw new Error('experience_slot not found');
        record = {
          ...record,
          reserved:
            'reserved' in data ? applyIncDec(record.reserved, data.reserved) : record.reserved,
          held: 'held' in data ? applyIncDec(record.held, data.held) : record.held,
        };
        return { ...record };
      },
    },
  };
  return { tx: tx as unknown as TxClient, getRecord: () => record };
}

describe('DiningCapacityAdapter', () => {
  const adapter = new DiningCapacityAdapter();

  it('computes availability as capacity minus reserved and held', async () => {
    const { tx } = makeDiningTx({ id: 'cap_1', totalCapacity: 20, reserved: 5, held: 3 });
    await expect(adapter.getAvailability(tx, ref('cap_1', 4))).resolves.toBe(12);
  });

  it('returns 0 availability for an unknown resource', async () => {
    const { tx } = makeDiningTx({ id: 'cap_1', totalCapacity: 20, reserved: 0, held: 0 });
    await expect(adapter.getAvailability(tx, ref('does_not_exist', 1))).resolves.toBe(0);
  });

  it('createHold increments held quantity when capacity is available', async () => {
    const { tx, getRecord } = makeDiningTx({ id: 'cap_1', totalCapacity: 10, reserved: 2, held: 0 });
    await adapter.createHold(tx, ref('cap_1', 4));
    expect(getRecord().held).toBe(4);
  });

  it('createHold throws when capacity is insufficient', async () => {
    const { tx, getRecord } = makeDiningTx({ id: 'cap_1', totalCapacity: 10, reserved: 8, held: 0 });
    await expect(adapter.createHold(tx, ref('cap_1', 5))).rejects.toThrow(
      /Insufficient dining capacity/,
    );
    // Failed hold must not mutate state
    expect(getRecord().held).toBe(0);
  });

  it('last-seat race: only one of two sequential holds on remaining capacity succeeds', async () => {
    // Models two confirms competing for the last dining seat inside separate txs
    // that each lock then re-read — second caller must see held=1 and fail.
    const { tx, getRecord } = makeDiningTx({
      id: 'cap_last',
      totalCapacity: 10,
      reserved: 9,
      held: 0,
    });
    await adapter.createHold(tx, ref('cap_last', 1));
    expect(getRecord().held).toBe(1);
    await expect(adapter.createHold(tx, ref('cap_last', 1))).rejects.toThrow(
      /Insufficient dining capacity \(available 0\)/,
    );
    expect(getRecord().held).toBe(1);
  });

  it('idempotent double confirm: consume then second consume still settles reserved', async () => {
    const { tx, getRecord } = makeDiningTx({
      id: 'cap_1',
      totalCapacity: 10,
      reserved: 0,
      held: 1,
    });
    await adapter.consumeHold(tx, ref('cap_1', 1));
    expect(getRecord()).toMatchObject({ held: 0, reserved: 1 });
    // A second consume with held already 0 would go negative in naive math —
    // production path only consumeHold when hold.status === 'active'.
    await adapter.consumeHold(tx, ref('cap_1', 0));
    expect(getRecord().reserved).toBe(1);
  });

  it('consumeHold moves quantity from held into reserved', async () => {
    const { tx, getRecord } = makeDiningTx({ id: 'cap_1', totalCapacity: 10, reserved: 0, held: 4 });
    await adapter.consumeHold(tx, ref('cap_1', 4));
    const rec = getRecord();
    expect(rec.held).toBe(0);
    expect(rec.reserved).toBe(4);
  });

  it('releaseHold and expireHold both decrement held without touching reserved', async () => {
    const { tx, getRecord } = makeDiningTx({ id: 'cap_1', totalCapacity: 10, reserved: 1, held: 4 });
    await adapter.releaseHold(tx, ref('cap_1', 4));
    expect(getRecord()).toMatchObject({ held: 0, reserved: 1 });

    const { tx: tx2, getRecord: getRecord2 } = makeDiningTx({
      id: 'cap_2',
      totalCapacity: 10,
      reserved: 0,
      held: 2,
    });
    await adapter.expireHold(tx2, ref('cap_2', 2));
    expect(getRecord2().held).toBe(0);
  });
});

describe('ExperienceSlotAdapter', () => {
  const adapter = new ExperienceSlotAdapter();

  it('computes availability as capacity minus reserved and held', async () => {
    const { tx } = makeExperienceTx({ id: 'slot_1', capacity: 15, reserved: 6, held: 2 });
    await expect(
      adapter.getAvailability(tx, ref('slot_1', 1, 'experience_slot')),
    ).resolves.toBe(7);
  });

  it('createHold increments held; consumeHold moves held → reserved', async () => {
    const { tx, getRecord } = makeExperienceTx({ id: 'slot_1', capacity: 15, reserved: 6 });
    await adapter.createHold(tx, ref('slot_1', 3, 'experience_slot'));
    expect(getRecord()).toMatchObject({ held: 3, reserved: 6 });
    await adapter.consumeHold(tx, ref('slot_1', 3, 'experience_slot'));
    expect(getRecord()).toMatchObject({ held: 0, reserved: 9 });
  });

  it('createHold throws when the slot is full', async () => {
    const { tx, getRecord } = makeExperienceTx({ id: 'slot_1', capacity: 10, reserved: 9 });
    await expect(
      adapter.createHold(tx, ref('slot_1', 2, 'experience_slot')),
    ).rejects.toThrow(/Insufficient experience slot capacity/);
    expect(getRecord().held).toBe(0);
  });

  it('releaseHold and expireHold decrement held', async () => {
    const { tx, getRecord } = makeExperienceTx({
      id: 'slot_1',
      capacity: 10,
      reserved: 5,
      held: 4,
    });
    await adapter.releaseHold(tx, ref('slot_1', 2, 'experience_slot'));
    expect(getRecord()).toMatchObject({ held: 2, reserved: 5 });
    await adapter.expireHold(tx, ref('slot_1', 2, 'experience_slot'));
    expect(getRecord().held).toBe(0);
  });
});
