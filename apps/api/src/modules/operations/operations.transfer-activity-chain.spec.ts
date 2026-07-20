import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsService } from './operations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../../common/helpers';

const user = {
  sub: 'user-1',
  organizationId: 'org-1',
} as AuthUser;

const acceptedVersion = {
  id: 'ver-1',
  status: 'accepted',
  currency: 'USD',
  itemsJson: [
    {
      id: 'line-transfer',
      serviceType: 'transfer',
      description: 'Airport transfer',
      quantity: 1,
      unitCost: 2000,
      unitSell: 2500,
      details: {
        supplierId: 'sup-fleet',
        fromPlaceName: 'Bagdogra',
        toPlaceName: 'Darjeeling',
        vehicleTypeName: 'Innova',
        serviceDate: '2026-10-05',
        vehicles: 1,
      },
    },
    {
      id: 'line-activity',
      serviceType: 'activity',
      description: 'Tiger Hill',
      quantity: 2,
      unitCost: 800,
      unitSell: 1000,
      details: {
        supplierId: 'sup-activity',
        activityName: 'Tiger Hill sunrise',
        privateOrSic: 'private',
        serviceDate: '2026-10-06',
        adults: 2,
      },
    },
    {
      id: 'line-transfer-orphan',
      serviceType: 'transfer',
      description: 'Orphan transfer',
      details: {},
    },
  ],
};

describe('OperationsService transfer/activity booking chain', () => {
  let service: OperationsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      trip: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'trip-1',
          organizationId: 'org-1',
          status: 'confirmed',
        }),
        update: vi.fn(),
      },
      quotationVersion: {
        findFirst: vi.fn().mockResolvedValue(acceptedVersion),
      },
      bookingComponent: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      supplier: {
        findFirst: vi.fn(),
      },
      serviceRequest: {
        create: vi.fn().mockResolvedValue({ id: 'sr-1' }),
        updateMany: vi.fn(),
      },
      serviceRequestItem: {
        updateMany: vi.fn(),
      },
      supplierInvoice: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'inv-1',
          amount: { toString: () => '2000' },
          currency: 'USD',
          invoiceNumber: 'AUTO-BC-T',
          dueAt: null,
          notes: 'Auto payable on confirm · Transfer',
        }),
      },
      commercialDocument: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'cd-1',
          direction: 'payable',
          documentNumber: 'AUTO-BC-T',
        }),
      },
      tripPayment: {
        create: vi.fn().mockResolvedValue({
          id: 'pay-1',
          direction: 'supplier',
          amount: { toString: () => '2000' },
        }),
      },
      tripReadinessItem: {
        updateMany: vi.fn(),
      },
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ currency: 'USD' }),
        findFirst: vi.fn().mockResolvedValue({ kind: 'travel_agency' }),
      },
    } as unknown as PrismaService;

    service = new OperationsService(
      prisma,
      { record: vi.fn() } as unknown as AuditService,
      {
        syncBookingInventory: vi.fn().mockResolvedValue({
          ok: true,
          allocationId: 'alloc-1',
        }),
      } as unknown as InventoryService,
      {} as NotificationsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('materializes transfer with quote currency + missing-supplier warning', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({
      id: 'sup-fleet',
      linkedAssetId: 'asset-1',
      name: 'Hill Fleet',
    } as never);
    const createdTransfer = {
      id: 'bc-t1',
      organizationId: 'org-1',
      tripId: 'trip-1',
      type: 'transfer',
      title: 'Bagdogra → Darjeeling Innova',
      supplierId: 'sup-fleet',
      partnerAssetId: 'asset-1',
      quotationLineId: 'line-transfer',
      status: 'requested',
      serviceRequestId: null,
      startAt: new Date('2026-10-05T00:00:00.000Z'),
      endAt: new Date('2026-10-05T02:00:00.000Z'),
      costAmount: { toString: () => '2000' },
      quotedAmount: { toString: () => '2500' },
      requiredQuantity: { toString: () => '1' },
      currency: 'USD',
    };
    vi.mocked(prisma.bookingComponent.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdTransfer as never);
    vi.mocked(prisma.bookingComponent.create).mockResolvedValue(
      createdTransfer as never,
    );

    const result = await service.materializeTransferBookingsFromAcceptedQuote(
      'org-1',
      'user-1',
      'trip-1',
    );

    expect(result.created).toBe(1);
    expect(result.warnings.some((w) => /Orphan transfer/i.test(w))).toBe(true);
    expect(prisma.bookingComponent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'transfer',
          currency: 'USD',
          quotationLineId: 'line-transfer',
        }),
      }),
    );
    expect(prisma.serviceRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
          serviceType: 'TRANSFER',
          quotationLineId: 'line-transfer',
        }),
      }),
    );
  });

  it('materializes activity with quote currency + missing-supplier warning', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({
      id: 'sup-activity',
      linkedAssetId: null,
      name: 'Tiger Hill desk',
    } as never);
    const createdActivity = {
      id: 'bc-a1',
      organizationId: 'org-1',
      tripId: 'trip-1',
      type: 'activity',
      title: 'Tiger Hill sunrise · PRIVATE',
      supplierId: 'sup-activity',
      partnerAssetId: null,
      quotationLineId: 'line-activity',
      status: 'requested',
      serviceRequestId: null,
      startAt: new Date('2026-10-06T00:00:00.000Z'),
      endAt: new Date('2026-10-06T04:00:00.000Z'),
      costAmount: { toString: () => '1600' },
      quotedAmount: { toString: () => '2000' },
      requiredQuantity: { toString: () => '2' },
      currency: 'USD',
    };
    vi.mocked(prisma.bookingComponent.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdActivity as never);
    vi.mocked(prisma.bookingComponent.create).mockResolvedValue(
      createdActivity as never,
    );

    const result = await service.materializeActivityBookingsFromAcceptedQuote(
      'org-1',
      'user-1',
      'trip-1',
    );

    expect(result.created).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(prisma.bookingComponent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'activity',
          currency: 'USD',
          quotationLineId: 'line-activity',
        }),
      }),
    );
  });

  it('warns when transfer supplier was deleted', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.bookingComponent.findFirst).mockResolvedValue(null);

    const result = await service.materializeTransferBookingsFromAcceptedQuote(
      'org-1',
      'user-1',
      'trip-1',
    );

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((w) => /Supplier missing/i.test(w))).toBe(true);
    expect(prisma.bookingComponent.create).not.toHaveBeenCalled();
  });

  it('creates supplier invoice when transfer booking is confirmed', async () => {
    const pending = {
      id: 'bc-t1',
      tripId: 'trip-1',
      organizationId: 'org-1',
      status: 'requested',
      type: 'transfer',
      confirmationRef: null,
      voucherNote: null,
      costAmount: { toString: () => '2000' },
      quotedAmount: { toString: () => '2500' },
      confirmedAmount: null,
      supplierId: 'sup-fleet',
      serviceRequestId: 'sr-1',
      currency: 'USD',
      title: 'Bagdogra → Darjeeling Innova',
      startAt: new Date('2026-10-05T00:00:00.000Z'),
    };
    const confirmed = {
      ...pending,
      status: 'confirmed',
      confirmationRef: 'CONF-T1',
      confirmedAmount: { toString: () => '2000' },
      supplier: { id: 'sup-fleet', name: 'Hill Fleet' },
    };

    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({
      id: 'sup-fleet',
      linkedAssetId: 'asset-1',
      name: 'Hill Fleet',
    } as never);
    vi.mocked(prisma.bookingComponent.findFirst)
      .mockResolvedValueOnce(pending as never)
      .mockResolvedValueOnce(confirmed as never);
    vi.mocked(prisma.bookingComponent.update).mockResolvedValue(confirmed as never);

    await service.updateBooking(user, 'trip-1', 'bc-t1', {
      status: 'confirmed',
      confirmationRef: 'CONF-T1',
      confirmedAmount: 2000,
    });

    expect(prisma.supplierInvoice.create).toHaveBeenCalled();
    expect(prisma.commercialDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: 'payable',
          linkedEntityType: 'booking_component',
          linkedEntityId: 'bc-t1',
        }),
      }),
    );
  });
});
