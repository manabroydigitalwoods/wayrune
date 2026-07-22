import { Prisma } from '@prisma/client';
import type { SeedCtx } from './helpers';
import {
  DOC_PREFIX,
  QT_PREFIX,
  SEED_KEY,
  TRAVEL_START_OFFSETS,
  TRIP_PREFIX,
  TRIP_STATUSES,
  atHour,
  money,
  pad,
  pickRoundRobin,
  utcDate,
} from './helpers';

export async function seedTripsAndOps(
  ctx: SeedCtx,
  partyIds: string[],
): Promise<{ tripIds: string[]; confirmedTripIds: string[] }> {
  const {
    prisma,
    organizationId,
    ownerId,
    salesIds,
    scale,
    hotelSupplierId,
    transferSupplierId,
    placeId,
    placeName,
  } = ctx;

  const tripIds: string[] = [];
  const confirmedTripIds: string[] = [];

  for (let i = 1; i <= scale.trips; i++) {
    const n = pad(i);
    const status = TRIP_STATUSES[i % TRIP_STATUSES.length]!;
    const startOff = TRAVEL_START_OFFSETS[i % TRAVEL_START_OFFSETS.length]!;
    const nights = 3 + (i % 4);
    const startDate = utcDate(startOff);
    const endDate = utcDate(startOff + nights);
    const createdOff = -(i % 55);
    const createdAt = utcDate(createdOff);

    const trip = await prisma.trip.create({
      data: {
        organizationId,
        tripNumber: `${TRIP_PREFIX}${n}`,
        title: `SCN Trip ${n} · ${status} · D${startOff >= 0 ? '+' : ''}${startOff}`,
        status,
        partyId: pickRoundRobin(partyIds, i),
        ownerId: pickRoundRobin(salesIds.length ? salesIds : [ownerId], i),
        startDate,
        endDate,
        destinationsJson: [{ placeId, name: placeName, kind: 'city' }],
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt,
      },
    });
    tripIds.push(trip.id);

    const opsLike = [
      'confirmed',
      'booking_in_progress',
      'ready_to_travel',
      'in_progress',
    ].includes(status);

    if (opsLike || status === 'quoted' || status === 'completed') {
      const quoteStatus =
        status === 'quoted'
          ? 'sent'
          : status === 'planning'
            ? 'draft'
            : 'accepted';
      const cost = 18000 + (i % 20) * 500;
      const sell = Math.round(cost * 1.22);
      await prisma.quotation.create({
        data: {
          organizationId,
          tripId: trip.id,
          quoteNumber: `${QT_PREFIX}${n}`,
          createdAt,
          versions: {
            create: {
              versionNumber: 1,
              label: `SCN quote ${n}`,
              status: quoteStatus,
              currency: 'INR',
              itemsJson: [
                {
                  id: `scn-${n}-hotel`,
                  serviceType: 'hotel',
                  description: `${placeName} stay`,
                  quantity: nights,
                  unitCost: Math.round(cost / nights),
                  unitSell: Math.round(sell / nights),
                  taxPercent: 5,
                },
              ] as Prisma.InputJsonValue,
              costTotal: money(cost),
              sellTotal: money(sell * 1.05),
              taxTotal: money(sell * 0.05),
              discountTotal: money(0),
              marginAmount: money(sell - cost),
              marginPercent: money(((sell - cost) / sell) * 100),
              acceptedAt: quoteStatus === 'accepted' ? createdAt : null,
              createdBy: ownerId,
              createdAt,
            },
          },
        },
      });
    }

    if (opsLike || status === 'completed') {
      confirmedTripIds.push(trip.id);
      const bookingCreated = utcDate(Math.max(createdOff, -25));
      const hotelStatus =
        i % 3 === 0 ? 'confirmed' : i % 3 === 1 ? 'requested' : 'pending';
      const transferStatus = i % 4 === 0 ? 'confirmed' : 'requested';

      await prisma.bookingComponent.create({
        data: {
          organizationId,
          tripId: trip.id,
          supplierId: hotelSupplierId,
          type: 'hotel',
          title: `${placeName} hotel · SCN ${n}`,
          status: hotelStatus,
          confirmationRef: hotelStatus === 'confirmed' ? `SCN-H-${n}` : null,
          voucherNote: hotelStatus === 'confirmed' && i % 2 === 0 ? 'Voucher ready' : null,
          startAt: startDate,
          endAt: endDate,
          costAmount: money(12000 + i * 50),
          quotedAmount: money(15000 + i * 60),
          currency: 'INR',
          createdBy: ownerId,
          updatedBy: ownerId,
          createdAt: bookingCreated,
        },
      });

      await prisma.bookingComponent.create({
        data: {
          organizationId,
          tripId: trip.id,
          supplierId: transferSupplierId,
          type: 'transfer',
          title: `Airport transfer · SCN ${n}`,
          status: transferStatus,
          confirmationRef: transferStatus === 'confirmed' ? `SCN-T-${n}` : null,
          startAt: atHour(startDate, 10),
          endAt: atHour(startDate, 14),
          costAmount: money(3500),
          quotedAmount: money(4200),
          currency: 'INR',
          travellerRequirementsJson:
            transferStatus === 'confirmed'
              ? ({ driverSupplierId: transferSupplierId, driverName: 'SCN Driver' } as Prisma.InputJsonValue)
              : undefined,
          createdBy: ownerId,
          updatedBy: ownerId,
          createdAt: bookingCreated,
        },
      });

      if (i % 5 === 0) {
        await prisma.bookingComponent.create({
          data: {
            organizationId,
            tripId: trip.id,
            supplierId: hotelSupplierId,
            type: 'activity',
            title: `Sightseeing · SCN ${n}`,
            status: i % 2 === 0 ? 'confirmed' : 'requested',
            startAt: utcDate(startOff + 1),
            endAt: utcDate(startOff + 1),
            costAmount: money(2000),
            quotedAmount: money(2800),
            currency: 'INR',
            createdBy: ownerId,
            updatedBy: ownerId,
            createdAt: bookingCreated,
          },
        });
      }
    }

    // Finance: customer + supplier instalments across aging buckets
    if (opsLike || status === 'completed' || status === 'confirmed') {
      const agingBuckets = [
        { dueOff: 5, status: 'scheduled', label: 'Advance (upcoming)' },
        { dueOff: -5, status: 'overdue', label: 'Balance (1–30 overdue)' },
        { dueOff: -40, status: 'overdue', label: 'Balance (31–60 overdue)' },
        { dueOff: -75, status: 'overdue', label: 'Final (61+ overdue)' },
      ] as const;
      const bucket = agingBuckets[i % agingBuckets.length]!;
      await prisma.tripPayment.create({
        data: {
          organizationId,
          tripId: trip.id,
          direction: 'customer',
          label: `SCN ${bucket.label}`,
          amount: money(25000 + i * 100),
          amountPaid: money(0),
          currency: 'INR',
          dueAt: utcDate(bucket.dueOff),
          status: bucket.status,
          notes: `${SEED_KEY} customer instalment`,
          createdBy: ownerId,
          updatedBy: ownerId,
        },
      });

      if (i % 2 === 0) {
        await prisma.tripPayment.create({
          data: {
            organizationId,
            tripId: trip.id,
            direction: 'supplier',
            label: 'SCN Hotel deposit',
            amount: money(8000 + i * 20),
            amountPaid: money(i % 4 === 0 ? 8000 + i * 20 : 0),
            currency: 'INR',
            dueAt: utcDate(i % 4 === 0 ? -10 : 3),
            status: i % 4 === 0 ? 'paid' : 'overdue',
            paidAt: i % 4 === 0 ? utcDate(-8) : null,
            notes: `${SEED_KEY} supplier payable`,
            createdBy: ownerId,
            updatedBy: ownerId,
          },
        });
      }

      // AR commercial docs for dashboard aging (optional density)
      if (i % 4 === 0) {
        await prisma.commercialDocument.create({
          data: {
            organizationId,
            docType: 'invoice',
            direction: 'receivable',
            tripId: trip.id,
            counterpartyPartyId: pickRoundRobin(partyIds, i),
            documentNumber: `${DOC_PREFIX}${n}`,
            label: `SCN Invoice ${n}`,
            amount: money(40000),
            taxAmount: money(2000),
            amountPaid: money(0),
            currency: 'INR',
            status: 'open',
            dueAt: utcDate(bucket.dueOff),
            notes: SEED_KEY,
            createdBy: ownerId,
          },
        });
      }
    }
  }

  return { tripIds, confirmedTripIds };
}

export async function seedDashboardActivity(ctx: SeedCtx, tripIds: string[]) {
  const { prisma, organizationId, ownerId } = ctx;
  // Extra confirmed bookings in last 7/30/60d for History presets on dashboard
  const sampleTrips = tripIds.slice(0, Math.min(40, tripIds.length));
  for (let i = 0; i < sampleTrips.length; i++) {
    const tripId = sampleTrips[i]!;
    const daysAgo = [3, 7, 14, 28, 45, 55][i % 6]!;
    await prisma.bookingComponent.create({
      data: {
        organizationId,
        tripId,
        type: 'other',
        title: `SCN dashboard booking D-${daysAgo}`,
        status: 'confirmed',
        confirmationRef: `SCN-DB-${pad(i + 1)}`,
        startAt: utcDate(daysAgo),
        costAmount: money(1000),
        quotedAmount: money(1200),
        currency: 'INR',
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: utcDate(-daysAgo),
      },
    });
  }

  // FIT build timing samples for claim gates / SLA charts
  for (let i = 1; i <= 25; i++) {
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId: ownerId,
        action: 'quote.fit_build',
        entityType: 'quotation',
        entityId: `${SEED_KEY}:fit:${pad(i)}`,
        metadataJson: {
          minutes: 8 + (i % 20),
          source: 'demo_seed',
          seedKey: SEED_KEY,
        },
        createdAt: utcDate(-(1 + (i % 28))),
      },
    });
  }
}
