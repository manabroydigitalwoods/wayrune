import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/helpers';

const user = {
  sub: 'user-1',
  organizationId: 'org-fleet',
  permissions: ['ops.write', 'network.write'],
} as AuthUser;

describe('InventoryService.updateAllocation', () => {
  let service: InventoryService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      inventoryAllocation: {
        findFirst: vi.fn(),
        findFirstOrThrow: vi.fn(),
        update: vi.fn(),
      },
      assetCalendarBlock: { deleteMany: vi.fn() },
      partnerAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-1',
          organizationId: 'org-fleet',
          assetKind: 'vehicle',
        }),
      },
      $transaction: vi.fn(async (fn: (tx: PrismaService) => Promise<unknown>) =>
        fn(prisma),
      ),
    } as unknown as PrismaService;
    service = new InventoryService(prisma, { record: vi.fn() } as unknown as AuditService);
    // Bypass org access for unit test — spy private via public path
    vi.spyOn(
      service as unknown as {
        resolveAssetAccess: InventoryService['resolveAssetAccess'];
      },
      'resolveAssetAccess',
    ).mockResolvedValue({
      asset: {
        id: 'asset-1',
        organizationId: 'org-fleet',
        assetKind: 'vehicle',
      },
    } as never);
  });

  it('releases allocation and deletes linked calendar blocks', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      assetId: 'asset-1',
      status: 'hold',
    } as never);
    vi.mocked(prisma.inventoryAllocation.findFirstOrThrow).mockResolvedValue({
      id: 'alloc-1',
      assetId: 'asset-1',
      status: 'released',
      fleetUnit: { id: 'u1', name: 'Innova', plateNumber: 'DL01AB1001' },
    } as never);

    const result = await service.updateAllocation(user, 'alloc-1', {
      status: 'released',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.inventoryAllocation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alloc-1' },
        data: expect.objectContaining({ status: 'released' }),
      }),
    );
    expect(prisma.assetCalendarBlock.deleteMany).toHaveBeenCalledWith({
      where: { allocationId: 'alloc-1' },
    });
    expect(result.status).toBe('released');
  });

  it('confirms a hold', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      assetId: 'asset-1',
      status: 'hold',
    } as never);
    vi.mocked(prisma.inventoryAllocation.findFirstOrThrow).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
    } as never);

    const result = await service.updateAllocation(user, 'alloc-1', {
      status: 'confirmed',
    });

    expect(prisma.inventoryAllocation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'confirmed' }),
      }),
    );
    expect(prisma.assetCalendarBlock.deleteMany).not.toHaveBeenCalled();
    expect(result.status).toBe('confirmed');
  });
});

describe('InventoryService.syncBookingInventory hold upgrade', () => {
  let service: InventoryService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      inventoryAllocation: {
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'alloc-1', status: 'confirmed' }),
      },
      partnerAsset: { findFirst: vi.fn() },
      supplier: { findFirst: vi.fn() },
      assetFleetUnit: { findFirst: vi.fn() },
      assetCalendarBlock: { findMany: vi.fn().mockResolvedValue([]) },
      assetRoomProduct: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    service = new InventoryService(prisma, { record: vi.fn() } as unknown as AuditService);
  });

  it('upgrades existing hold to confirmed when booking confirms', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'hold',
      quantity: 1,
      assetId: 'asset-1',
      roomProductId: null,
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 1,
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-1',
      upgraded: true,
    });
    expect(prisma.inventoryAllocation.update).toHaveBeenCalledWith({
      where: { id: 'alloc-1' },
      data: { status: 'confirmed' },
    });
  });

  it('resyncs hold quantity when booking rooms increased and capacity allows', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'hold',
      quantity: 1,
      assetId: 'asset-1',
      roomProductId: 'rp-1',
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-1',
      from: new Date('2026-07-01'),
      to: new Date('2026-07-03'),
      products: [
        {
          roomProductId: 'rp-1',
          name: 'Deluxe',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 5,
          used: 1,
          remaining: 4,
          stopSell: false,
        },
      ],
    } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 3,
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-1',
      upgraded: true,
      quantityResynced: true,
    });
    expect(prisma.inventoryAllocation.update).toHaveBeenCalledWith({
      where: { id: 'alloc-1' },
      data: { status: 'confirmed', quantity: 3 },
    });
  });

  it('fails qty sync without upgrading when capacity is insufficient', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'hold',
      quantity: 1,
      assetId: 'asset-1',
      roomProductId: 'rp-1',
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-1',
      from: new Date('2026-07-01'),
      to: new Date('2026-07-03'),
      products: [
        {
          roomProductId: 'rp-1',
          name: 'Deluxe',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 2,
          used: 2,
          remaining: 0,
          stopSell: false,
        },
      ],
    } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 3,
    });

    expect(result).toEqual({
      ok: false,
      failed: expect.stringMatching(/Insufficient room availability/),
    });
    expect(prisma.inventoryAllocation.update).not.toHaveBeenCalled();
  });

  it('does not re-upgrade an already-confirmed allocation', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 1,
      assetId: 'asset-1',
      roomProductId: null,
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 1,
    });

    expect(result).toEqual({ ok: true, allocationId: 'alloc-1' });
    expect(prisma.inventoryAllocation.update).not.toHaveBeenCalled();
  });

  it('resyncs quantity on already-confirmed when booking rooms increased', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 1,
      assetId: 'asset-1',
      roomProductId: 'rp-1',
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-1',
      from: new Date('2026-07-01'),
      to: new Date('2026-07-03'),
      products: [
        {
          roomProductId: 'rp-1',
          name: 'Deluxe',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 5,
          used: 1,
          remaining: 4,
          stopSell: false,
        },
      ],
    } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 3,
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-1',
      quantityResynced: true,
    });
    expect(prisma.inventoryAllocation.update).toHaveBeenCalledWith({
      where: { id: 'alloc-1' },
      data: { quantity: 3 },
    });
  });

  it('releases and reallocates when stay dates change and capacity allows', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 2,
      assetId: 'asset-1',
      roomProductId: 'rp-1',
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-1',
      from: new Date('2026-07-05'),
      to: new Date('2026-07-07'),
      products: [
        {
          roomProductId: 'rp-1',
          name: 'Deluxe',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 5,
          used: 0,
          remaining: 5,
          stopSell: false,
        },
      ],
    } as never);
    vi.spyOn(service, 'releaseForBooking').mockResolvedValue({ released: 1 });
    vi.spyOn(service, 'allocate').mockResolvedValue({ id: 'alloc-2' } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-07-05'),
      endAt: new Date('2026-07-07'),
      requiredQuantity: 2,
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-2',
      datesResynced: true,
    });
    expect(service.releaseForBooking).toHaveBeenCalledWith('bk-1');
    expect(service.allocate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        assetId: 'asset-1',
        bookingComponentId: 'bk-1',
        roomProductId: 'rp-1',
        checkIn: '2026-07-05',
        checkOut: '2026-07-07',
        quantity: 2,
        status: 'confirmed',
      }),
    );
  });

  it('soft-fails date move without releasing when capacity insufficient', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'hold',
      quantity: 2,
      assetId: 'asset-1',
      roomProductId: 'rp-1',
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-1',
      from: new Date('2026-08-01'),
      to: new Date('2026-08-03'),
      products: [
        {
          roomProductId: 'rp-1',
          name: 'Deluxe',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 2,
          used: 2,
          remaining: 0,
          stopSell: true,
        },
      ],
    } as never);
    const releaseSpy = vi.spyOn(service, 'releaseForBooking');

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'requested',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-08-01'),
      endAt: new Date('2026-08-03'),
      requiredQuantity: 2,
    });

    expect(result).toEqual({
      ok: false,
      failed: expect.stringMatching(/Insufficient room availability to move allotment/),
    });
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('rebounds stay allotment onto a new asset when supplier target differs', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 1,
      assetId: 'asset-old',
      roomProductId: 'rp-old',
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({
      linkedAssetId: 'asset-new',
    } as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-new',
      from: new Date('2026-07-01'),
      to: new Date('2026-07-03'),
      products: [
        {
          roomProductId: 'rp-new',
          name: 'Standard',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 4,
          used: 0,
          remaining: 4,
          stopSell: false,
        },
      ],
    } as never);
    vi.spyOn(service, 'releaseForBooking').mockResolvedValue({ released: 1 });
    vi.spyOn(service, 'allocate').mockResolvedValue({ id: 'alloc-2' } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-new',
      partnerAssetId: 'asset-new',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 1,
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-2',
      assetRebound: true,
    });
    expect(service.allocate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        assetId: 'asset-new',
        bookingComponentId: 'bk-1',
        checkIn: '2026-07-01',
        checkOut: '2026-07-03',
        quantity: 1,
        status: 'confirmed',
      }),
    );
    expect(service.allocate).toHaveBeenCalledWith(
      user,
      expect.not.objectContaining({ roomProductId: 'rp-old' }),
    );
  });

  it('soft-fails asset rebind without releasing when new property has no capacity', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'hold',
      quantity: 2,
      assetId: 'asset-old',
      roomProductId: 'rp-old',
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
    } as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-new',
      from: new Date('2026-07-01'),
      to: new Date('2026-07-03'),
      products: [
        {
          roomProductId: 'rp-new',
          name: 'Standard',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 1,
          used: 1,
          remaining: 0,
          stopSell: true,
        },
      ],
    } as never);
    const releaseSpy = vi.spyOn(service, 'releaseForBooking');

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'requested',
      supplierId: 'sup-new',
      partnerAssetId: 'asset-new',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 2,
    });

    expect(result).toEqual({
      ok: false,
      failed: expect.stringMatching(/Insufficient room availability on new property/),
    });
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('releases allotment when booking no longer resolves to an asset', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 1,
      assetId: 'asset-old',
      roomProductId: 'rp-1',
      fleetUnitId: null,
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
      startAt: null,
      endAt: null,
    } as never);
    vi.spyOn(service, 'releaseForBooking').mockResolvedValue({ released: 1 });

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-none',
      partnerAssetId: null,
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 1,
    });

    expect(result).toEqual({
      ok: true,
      released: 1,
      orphanReleased: true,
    });
    expect(service.releaseForBooking).toHaveBeenCalledWith('bk-1');
  });

  it('rematches room product on same asset when booking stamps a new product', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 1,
      assetId: 'asset-1',
      roomProductId: 'rp-old',
      fleetUnitId: null,
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
      startAt: null,
      endAt: null,
    } as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-1',
      from: new Date('2026-07-01'),
      to: new Date('2026-07-03'),
      products: [
        {
          roomProductId: 'rp-new',
          name: 'Suite',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 3,
          used: 0,
          remaining: 3,
          stopSell: false,
        },
      ],
    } as never);
    vi.spyOn(service, 'releaseForBooking').mockResolvedValue({ released: 1 });
    vi.spyOn(service, 'allocate').mockResolvedValue({ id: 'alloc-2' } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 1,
      travellerRequirementsJson: { roomProductId: 'rp-new', rooms: 1 },
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-2',
      roomProductRematched: true,
    });
    expect(service.allocate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        assetId: 'asset-1',
        roomProductId: 'rp-new',
        quantity: 1,
        status: 'confirmed',
      }),
    );
  });

  it('resyncs transfer fleet window when booking dates change', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 1,
      assetId: 'asset-fleet',
      roomProductId: null,
      fleetUnitId: 'fu-1',
      checkIn: null,
      checkOut: null,
      startAt: new Date('2026-07-01T10:00:00.000Z'),
      endAt: new Date('2026-07-01T12:00:00.000Z'),
    } as never);
    vi.spyOn(service, 'releaseForBooking').mockResolvedValue({ released: 1 });
    vi.spyOn(service, 'allocate').mockResolvedValue({ id: 'alloc-2' } as never);
    // hasFleetConflict is private — allocate path soft-checks via spy on prisma
    (prisma as { assetCalendarBlock?: { findMany: ReturnType<typeof vi.fn> } }).assetCalendarBlock =
      { findMany: vi.fn().mockResolvedValue([]) };

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'transfer',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-fleet',
      startAt: new Date('2026-07-01T14:00:00.000Z'),
      endAt: new Date('2026-07-01T16:00:00.000Z'),
      travellerRequirementsJson: { fleetUnitId: 'fu-1' },
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-2',
      fleetWindowResynced: true,
    });
    expect(service.allocate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        assetId: 'asset-fleet',
        fleetUnitId: 'fu-1',
        startAt: '2026-07-01T14:00:00.000Z',
        endAt: '2026-07-01T16:00:00.000Z',
        status: 'confirmed',
      }),
    );
  });

  it('rebounds transfer allotment onto a new fleet asset', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 1,
      assetId: 'asset-old',
      roomProductId: null,
      fleetUnitId: 'fu-old',
      checkIn: null,
      checkOut: null,
      startAt: new Date('2026-07-01T10:00:00.000Z'),
      endAt: new Date('2026-07-01T12:00:00.000Z'),
    } as never);
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({
      linkedAssetId: 'asset-new',
    } as never);
    vi.mocked(prisma.assetFleetUnit.findFirst).mockResolvedValue({
      id: 'fu-new',
    } as never);
    (prisma as { assetCalendarBlock?: { findMany: ReturnType<typeof vi.fn> } }).assetCalendarBlock =
      { findMany: vi.fn().mockResolvedValue([]) };
    vi.spyOn(service, 'releaseForBooking').mockResolvedValue({ released: 1 });
    vi.spyOn(service, 'allocate').mockResolvedValue({ id: 'alloc-2' } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'transfer',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-old',
      startAt: new Date('2026-07-01T10:00:00.000Z'),
      endAt: new Date('2026-07-01T12:00:00.000Z'),
      travellerRequirementsJson: {
        driverSupplierId: 'drv-new',
        fleetUnitId: 'fu-new',
      },
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-2',
      assetRebound: true,
      fleetWindowResynced: true,
    });
    expect(service.allocate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        assetId: 'asset-new',
        fleetUnitId: 'fu-new',
        status: 'confirmed',
      }),
    );
  });

  it('rematches room product from unique roomType name when id missing', async () => {
    vi.mocked(prisma.inventoryAllocation.findFirst).mockResolvedValue({
      id: 'alloc-1',
      status: 'confirmed',
      quantity: 1,
      assetId: 'asset-1',
      roomProductId: 'rp-old',
      fleetUnitId: null,
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
      startAt: null,
      endAt: null,
    } as never);
    vi.mocked(prisma.assetRoomProduct.findMany).mockResolvedValue([
      { id: 'rp-deluxe', name: 'Deluxe Room' },
      { id: 'rp-suite', name: 'Suite' },
    ] as never);
    vi.spyOn(service, 'availability').mockResolvedValue({
      assetId: 'asset-1',
      from: new Date('2026-07-01'),
      to: new Date('2026-07-03'),
      products: [
        {
          roomProductId: 'rp-deluxe',
          name: 'Deluxe Room',
          maxOccupancy: 2,
          rateHint: null,
          capacity: 3,
          used: 0,
          remaining: 3,
          stopSell: false,
        },
      ],
    } as never);
    vi.spyOn(service, 'releaseForBooking').mockResolvedValue({ released: 1 });
    vi.spyOn(service, 'allocate').mockResolvedValue({ id: 'alloc-2' } as never);

    const result = await service.syncBookingInventory(user, {
      id: 'bk-1',
      type: 'hotel',
      status: 'confirmed',
      supplierId: 'sup-1',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-07-01'),
      endAt: new Date('2026-07-03'),
      requiredQuantity: 1,
      travellerRequirementsJson: { roomType: 'deluxe  room', rooms: 1 },
    });

    expect(result).toEqual({
      ok: true,
      allocationId: 'alloc-2',
      roomProductRematched: true,
    });
    expect(service.allocate).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ roomProductId: 'rp-deluxe' }),
    );
  });
});
