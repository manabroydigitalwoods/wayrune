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
  itemsJson: [
    {
      id: 'line-hotel',
      serviceType: 'hotel',
      description: 'Heritage stay',
      quantity: 2,
      unitCost: 4500,
      unitSell: 5400,
      rateProvenance: { rateId: 'rate-1', matchSummary: 'Room matched' },
      details: {
        supplierId: 'sup-heritage',
        propertyName: 'Darjeeling Heritage Lodge',
        roomType: 'Deluxe mountain view',
        mealPlan: 'MAP',
        checkIn: '2026-10-05',
        nights: 2,
        rooms: 1,
      },
    },
  ],
};

const createdBooking = {
  id: 'bc-1',
  organizationId: 'org-1',
  tripId: 'trip-1',
  supplierId: 'sup-heritage',
  partnerAssetId: 'asset-1',
  quotationLineId: 'line-hotel',
  title: 'Darjeeling Heritage Lodge · Deluxe mountain view · MAP',
  status: 'requested',
  startAt: new Date('2026-10-05T00:00:00.000Z'),
  endAt: new Date('2026-10-07T00:00:00.000Z'),
  costAmount: { toString: () => '9000' },
  quotedAmount: { toString: () => '10800' },
  requiredQuantity: { toString: () => '1' },
  currency: 'INR',
  serviceRequestId: null as string | null,
  confirmationRef: null,
};

describe('OperationsService hotel booking chain', () => {
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
        create: vi.fn().mockResolvedValue(createdBooking),
        update: vi.fn().mockResolvedValue({}),
      },
      supplier: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sup-heritage',
          linkedAssetId: 'asset-1',
          name: 'Darjeeling Heritage Lodge',
        }),
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
          amount: { toString: () => '9000' },
          currency: 'INR',
          invoiceNumber: 'AUTO-BC1',
          dueAt: null,
          notes: 'Auto payable on confirm · Hotel',
        }),
      },
      commercialDocument: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'cd-1',
          direction: 'payable',
          documentNumber: 'AUTO-BC1',
        }),
      },
      tripPayment: {
        create: vi.fn().mockResolvedValue({
          id: 'pay-1',
          direction: 'supplier',
          amount: { toString: () => '9000' },
        }),
      },
      tripReadinessItem: {
        updateMany: vi.fn(),
      },
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ currency: 'INR' }),
        findFirst: vi.fn().mockResolvedValue({ kind: 'travel_agency' }),
      },
    } as unknown as PrismaService;

    const inventory = {
      syncBookingInventory: vi.fn().mockResolvedValue({
        ok: true,
        allocationId: 'alloc-1',
      }),
    } as unknown as InventoryService;

    service = new OperationsService(
      prisma,
      { record: vi.fn() } as unknown as AuditService,
      inventory,
      {} as NotificationsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('materializes hotel booking + SR from accepted quote', async () => {
    vi.mocked(prisma.bookingComponent.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...createdBooking });

    const result = await service.materializeHotelBookingsFromAcceptedQuote(
      'org-1',
      'user-1',
      'trip-1',
    );
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.allotmentHolds).toBe(1);
    expect(prisma.bookingComponent.create).toHaveBeenCalled();
    expect(prisma.serviceRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
          serviceType: 'STAY',
          quotationLineId: 'line-hotel',
        }),
      }),
    );
  });

  it('skips when booking already exists for quotation line', async () => {
    vi.mocked(prisma.bookingComponent.findFirst).mockResolvedValue({
      id: 'bc-existing',
      serviceRequestId: 'sr-existing',
      type: 'hotel',
      status: 'requested',
      title: 'Existing',
      supplierId: 'sup-heritage',
      partnerAssetId: 'asset-1',
      startAt: new Date('2026-10-05T00:00:00.000Z'),
      endAt: new Date('2026-10-07T00:00:00.000Z'),
      requiredQuantity: 1,
      travellerRequirementsJson: { rooms: 1 },
    } as never);

    const result = await service.materializeHotelBookingsFromAcceptedQuote(
      'org-1',
      'user-1',
      'trip-1',
    );
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.allotmentHolds).toBe(1);
    expect(prisma.bookingComponent.create).not.toHaveBeenCalled();
  });

  it('creates supplier invoice when booking is confirmed', async () => {
    const pending = {
      id: 'bc-1',
      tripId: 'trip-1',
      organizationId: 'org-1',
      status: 'requested',
      confirmationRef: null,
      voucherNote: null,
      costAmount: { toString: () => '9000' },
      quotedAmount: { toString: () => '10800' },
      confirmedAmount: null,
      supplierId: 'sup-heritage',
      serviceRequestId: 'sr-1',
      currency: 'INR',
      title: 'Hotel',
      startAt: new Date('2026-10-05T00:00:00.000Z'),
    };
    const confirmed = {
      ...pending,
      status: 'confirmed',
      confirmationRef: 'CONF-1',
      confirmedAmount: { toString: () => '9000' },
      supplier: { id: 'sup-heritage', name: 'Lodge' },
    };

    vi.mocked(prisma.bookingComponent.findFirst)
      .mockResolvedValueOnce(pending as never)
      .mockResolvedValueOnce(confirmed as never);
    vi.mocked(prisma.bookingComponent.update).mockResolvedValue(confirmed as never);

    await service.updateBooking(user, 'trip-1', 'bc-1', {
      status: 'confirmed',
      confirmationRef: 'CONF-1',
      confirmedAmount: 9000,
    });

    expect(prisma.supplierInvoice.create).toHaveBeenCalled();
    expect(prisma.tripPayment.create).toHaveBeenCalled();
    expect(prisma.commercialDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: 'payable',
          linkedEntityType: 'booking_component',
          linkedEntityId: 'bc-1',
          documentNumber: 'AUTO-BC1',
        }),
      }),
    );
  });
});
