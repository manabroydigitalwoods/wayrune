import { describe, expect, it } from 'vitest';
import {
  DEMO_OPERATE_MARKER,
  DEMO_OPERATE_SUPPLIER_NAMES,
  isDemoOperateSupplier,
  stampDemoSupplierIdsOntoItems,
  stripDemoOperateSupplierIdsFromItems,
} from './demo-operate-pack';

describe('demo-operate-pack', () => {
  const ids = {
    hotelId: 'sup-hotel',
    transferId: 'sup-transfer',
    activityId: 'sup-activity',
  };

  it('recognises demo suppliers by name or profileJson', () => {
    expect(isDemoOperateSupplier(DEMO_OPERATE_SUPPLIER_NAMES.hotel)).toBe(true);
    expect(isDemoOperateSupplier('[Demo] Custom')).toBe(true);
    expect(isDemoOperateSupplier({ demoOperate: true })).toBe(true);
    expect(isDemoOperateSupplier({ marker: DEMO_OPERATE_MARKER })).toBe(true);
    expect(isDemoOperateSupplier('Real Hotel')).toBe(false);
    expect(isDemoOperateSupplier({ liveBooking: true })).toBe(false);
    expect(isDemoOperateSupplier(null)).toBe(false);
  });

  it('stamps supplierIds by serviceType and clears manual priceSource', () => {
    const stamped = stampDemoSupplierIdsOntoItems(
      [
        {
          id: 'h1',
          serviceType: 'hotel',
          details: { priceSource: 'manual', roomType: 'Deluxe' },
        },
        {
          id: 't1',
          serviceType: 'transfer',
          details: { priceSource: 'sell', vehicles: 1 },
        },
        {
          id: 'a1',
          serviceType: 'activity',
          details: { priceSource: 'manual' },
        },
        {
          id: 'other',
          serviceType: 'flight',
          details: { priceSource: 'manual' },
        },
      ],
      ids,
    );

    expect(stamped[0]?.details).toEqual({
      roomType: 'Deluxe',
      supplierId: 'sup-hotel',
      demoOperate: true,
    });
    expect(stamped[1]?.details).toEqual({
      priceSource: 'sell',
      vehicles: 1,
      supplierId: 'sup-transfer',
      demoOperate: true,
    });
    expect(stamped[2]?.details).toEqual({
      supplierId: 'sup-activity',
      demoOperate: true,
    });
    expect(stamped[3]?.details).toEqual({ priceSource: 'manual' });
  });

  it('strips only demoOperate-stamped supplierIds', () => {
    const stripped = stripDemoOperateSupplierIdsFromItems([
      {
        id: 'h1',
        details: {
          supplierId: 'sup-hotel',
          demoOperate: true,
          roomType: 'Deluxe',
        },
      },
      {
        id: 'h2',
        details: { supplierId: 'real-supplier', roomType: 'Suite' },
      },
    ]);
    expect(stripped[0]?.details).toEqual({ roomType: 'Deluxe' });
    expect(stripped[1]?.details).toEqual({
      supplierId: 'real-supplier',
      roomType: 'Suite',
    });
  });
});
