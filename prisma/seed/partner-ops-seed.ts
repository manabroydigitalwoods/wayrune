/**
 * Idempotent operational demo data for every partner OS (and DMC enrich).
 * Safe to re-run — keys on confirmationRef / publicToken / seedKey names.
 */
import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient;

function utcDate(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function atHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function money(n: number) {
  return new Prisma.Decimal(n);
}

async function orgBySlug(prisma: Db, slug: string) {
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`Seed partner org missing: ${slug} (run seedNetworkPartners first)`);
  return org;
}

async function primaryAsset(prisma: Db, organizationId: string) {
  const asset = await prisma.partnerAsset.findFirst({
    where: { organizationId, deletedAt: null, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!asset) throw new Error(`No PartnerAsset for org ${organizationId}`);
  return asset;
}

async function ensureGuestMenuCategories(
  prisma: Db,
  assetId: string,
  categories: Array<{ key: string; label: string; emoji?: string | null }>,
  featuredOfferingIds: string[] = [],
  extras?: {
    specials?: Array<{
      type: string;
      title: string;
      offeringId: string;
      blurb?: string | null;
    }>;
    combos?: Array<{
      id: string;
      name: string;
      offeringIds: string[];
      price: number;
      saveAmount?: number;
      currency?: string;
    }>;
    upsellPairs?: Record<string, string[]>;
  },
) {
  const asset = await prisma.partnerAsset.findUniqueOrThrow({ where: { id: assetId } });
  const prev =
    asset.profileJson && typeof asset.profileJson === 'object' && !Array.isArray(asset.profileJson)
      ? (asset.profileJson as Record<string, unknown>)
      : {};
  const prevMenu =
    prev.guestMenu && typeof prev.guestMenu === 'object' && !Array.isArray(prev.guestMenu)
      ? (prev.guestMenu as Record<string, unknown>)
      : {};
  await prisma.partnerAsset.update({
    where: { id: assetId },
    data: {
      profileJson: {
        ...prev,
        guestMenu: {
          ...prevMenu,
          categories,
          featuredOfferingIds,
          ...(extras?.specials ? { specials: extras.specials } : {}),
          ...(extras?.combos ? { combos: extras.combos } : {}),
          ...(extras?.upsellPairs ? { upsellPairs: extras.upsellPairs } : {}),
        },
      } as Prisma.InputJsonValue,
    },
  });
}

async function enableGuestServices(
  prisma: Db,
  orgId: string,
  opts: { walkInQrEnabled: boolean },
) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const prev =
    org.settingsJson && typeof org.settingsJson === 'object' && !Array.isArray(org.settingsJson)
      ? (org.settingsJson as Record<string, unknown>)
      : {};
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      settingsJson: {
        ...prev,
        indiaReady: true,
        guestServices: {
          qrEnabled: true,
          acceptingOrders: true,
          walkInQrEnabled: opts.walkInQrEnabled,
          requireRoomPin: true,
          businessHoursFrom: '07:00',
          businessHoursUntil: '23:00',
        },
      },
    },
  });
}

async function ensureLocation(
  prisma: Db,
  input: {
    organizationId: string;
    assetId: string;
    locationType: string;
    label: string;
    publicToken: string;
    locationRef?: string | null;
  },
) {
  const existing = await prisma.serviceLocation.findUnique({
    where: { publicToken: input.publicToken },
  });
  if (existing) {
    return prisma.serviceLocation.update({
      where: { id: existing.id },
      data: {
        label: input.label,
        locationType: input.locationType,
        locationRef: input.locationRef ?? null,
        status: 'active',
        assetId: input.assetId,
        organizationId: input.organizationId,
      },
    });
  }
  return prisma.serviceLocation.create({
    data: {
      organizationId: input.organizationId,
      assetId: input.assetId,
      locationType: input.locationType,
      label: input.label,
      publicToken: input.publicToken,
      locationRef: input.locationRef ?? null,
      status: 'active',
    },
  });
}

async function ensureOffering(
  prisma: Db,
  input: {
    organizationId: string;
    assetId: string;
    name: string;
    kind: string;
    category: string;
    unitPrice: number;
    taxPercent?: number;
    dietaryLabels?: string[];
    prepMinutes?: number;
    sortOrder?: number;
    description?: string;
    imageUrl?: string | null;
    modifiersJson?: Prisma.InputJsonValue;
  },
) {
  const existing = await prisma.serviceOffering.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: input.assetId,
      name: input.name,
    },
  });
  const data = {
    kind: input.kind,
    category: input.category,
    unitPrice: money(input.unitPrice),
    taxPercent: money(input.taxPercent ?? 5),
    currency: 'INR',
    dietaryLabels: input.dietaryLabels ?? [],
    prepMinutes: input.prepMinutes ?? 20,
    sortOrder: input.sortOrder ?? 0,
    description: input.description ?? null,
    imageUrl: input.imageUrl ?? null,
    isActive: true,
    stopSell: false,
    ...(input.modifiersJson !== undefined
      ? { modifiersJson: input.modifiersJson }
      : {}),
  };
  if (existing) {
    return prisma.serviceOffering.update({ where: { id: existing.id }, data });
  }
  return prisma.serviceOffering.create({
    data: {
      organizationId: input.organizationId,
      assetId: input.assetId,
      name: input.name,
      ...data,
    },
  });
}

async function ensureStayByRef(
  prisma: Db,
  input: {
    confirmationRef: string;
    assetId: string;
    roomProductId: string;
    roomUnitId: string | null;
    checkIn: Date;
    checkOut: Date;
    status: string;
    guestName: string;
    guestPhone?: string;
    guestEmail?: string;
    source?: string;
    rateAmount: number;
    amountPaid?: number;
    adults?: number;
    children?: number;
    mealPlan?: string;
    roomServicePin?: string | null;
    houseRulesAckAt?: Date | null;
    inventoryMode?: string | null;
    hostPresent?: boolean | null;
    notes?: string;
  },
) {
  const existing = await prisma.stayReservation.findFirst({
    where: { confirmationRef: input.confirmationRef, assetId: input.assetId },
  });
  const data = {
    roomProductId: input.roomProductId,
    roomUnitId: input.roomUnitId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    status: input.status,
    guestName: input.guestName,
    guestPhone: input.guestPhone ?? null,
    guestEmail: input.guestEmail ?? null,
    source: input.source ?? 'walk_in',
    rateAmount: money(input.rateAmount),
    amountPaid: money(input.amountPaid ?? 0),
    currency: 'INR',
    adults: input.adults ?? 2,
    children: input.children ?? 0,
    mealPlan: input.mealPlan ?? 'CP',
    roomServicePin: input.roomServicePin ?? null,
    houseRulesAckAt: input.houseRulesAckAt ?? null,
    inventoryMode: input.inventoryMode ?? null,
    hostPresent: input.hostPresent ?? null,
    notes: input.notes ?? 'Seeded demo reservation',
    confirmationRef: input.confirmationRef,
  };
  if (existing) {
    return prisma.stayReservation.update({ where: { id: existing.id }, data });
  }
  return prisma.stayReservation.create({
    data: { assetId: input.assetId, ...data },
  });
}

async function ensureFolioOnce(
  prisma: Db,
  key: { description: string; stayReservationId?: string; mealReservationId?: string; rentalReservationId?: string; tableSessionId?: string },
  amount: number,
  category: string,
) {
  const where = {
    description: key.description,
    ...(key.stayReservationId ? { stayReservationId: key.stayReservationId } : {}),
    ...(key.mealReservationId ? { mealReservationId: key.mealReservationId } : {}),
    ...(key.rentalReservationId ? { rentalReservationId: key.rentalReservationId } : {}),
    ...(key.tableSessionId ? { tableSessionId: key.tableSessionId } : {}),
  };
  const existing = await prisma.folioCharge.findFirst({ where });
  if (existing) return existing;
  return prisma.folioCharge.create({
    data: {
      ...key,
      description: key.description,
      category,
      amount: money(amount),
      taxAmount: money(Math.round(amount * 0.05 * 100) / 100),
      currency: 'INR',
    },
  });
}

async function seedHotelGoa(prisma: Db) {
  const org = await orgBySlug(prisma, 'seed-hotel-goa-breeze');
  const asset = await primaryAsset(prisma, org.id);
  await enableGuestServices(prisma, org.id, { walkInQrEnabled: false });

  const products = await prisma.assetRoomProduct.findMany({
    where: { assetId: asset.id, deletedAt: null },
    include: { units: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  const deluxe = products.find((p) => p.name.includes('Deluxe')) ?? products[0];
  const suite = products.find((p) => p.name.includes('Suite')) ?? products[1] ?? deluxe;
  if (!deluxe?.units[0]) throw new Error('Hotel starter inventory missing — run stay backfill first');

  const unit101 = deluxe.units.find((u) => u.name === '101') ?? deluxe.units[0];
  const unit102 = deluxe.units.find((u) => u.name === '102') ?? deluxe.units[1] ?? unit101;
  const suiteUnit = suite.units[0] ?? unit101;

  const inHouse = await ensureStayByRef(prisma, {
    confirmationRef: 'SEED-STAY-GOA-CHECKEDIN',
    assetId: asset.id,
    roomProductId: deluxe.id,
    roomUnitId: unit101.id,
    checkIn: utcDate(-1),
    checkOut: utcDate(3),
    status: 'checked_in',
    guestName: 'Priya Sharma',
    guestPhone: '+919820011001',
    guestEmail: 'priya.sharma@example.com',
    source: 'agency_inbound',
    rateAmount: 6500,
    amountPaid: 6500,
    adults: 2,
    children: 1,
    mealPlan: 'MAP',
    roomServicePin: '4821',
    notes: 'In-house demo · room PIN 4821 for QR room service',
  });

  await ensureStayByRef(prisma, {
    confirmationRef: 'SEED-STAY-GOA-ARRIVING',
    assetId: asset.id,
    roomProductId: suite.id,
    roomUnitId: suiteUnit.id,
    checkIn: utcDate(1),
    checkOut: utcDate(4),
    status: 'confirmed',
    guestName: 'James Whitfield',
    guestPhone: '+447700900123',
    guestEmail: 'j.whitfield@example.com',
    source: 'website',
    rateAmount: 9800,
    amountPaid: 4900,
    adults: 2,
    mealPlan: 'CP',
    notes: 'Arriving tomorrow — demo checkout / assignment',
  });

  await ensureStayByRef(prisma, {
    confirmationRef: 'SEED-STAY-GOA-DEPARTED',
    assetId: asset.id,
    roomProductId: deluxe.id,
    roomUnitId: unit102.id,
    checkIn: utcDate(-5),
    checkOut: utcDate(-2),
    status: 'checked_out',
    guestName: 'Ananya Rao',
    guestPhone: '+919811122233',
    guestEmail: 'ananya.rao@example.com',
    source: 'walk_in',
    rateAmount: 6500,
    amountPaid: 13000,
    adults: 2,
  });

  await ensureStayByRef(prisma, {
    confirmationRef: 'SEED-STAY-GOA-HELD',
    assetId: asset.id,
    roomProductId: deluxe.id,
    roomUnitId: null,
    checkIn: utcDate(5),
    checkOut: utcDate(8),
    status: 'held',
    guestName: 'Corporate Hold — Infosys Offsite',
    guestPhone: '+918022334455',
    source: 'corporate',
    rateAmount: 6500,
    amountPaid: 0,
    adults: 4,
    notes: 'Hold without unit — assign in ops',
  });

  await ensureFolioOnce(
    prisma,
    { description: 'SEED Room night · Deluxe 101', stayReservationId: inHouse.id },
    6500,
    'room',
  );
  await ensureFolioOnce(
    prisma,
    { description: 'SEED Mini-bar · Soft drinks', stayReservationId: inHouse.id },
    450,
    'f_and_b',
  );

  const hkExisting = await prisma.housekeepingTask.findFirst({
    where: { assetId: asset.id, roomUnitId: unit102.id, notes: 'SEED-HK-TURNOVER' },
  });
  if (!hkExisting) {
    await prisma.housekeepingTask.create({
      data: {
        assetId: asset.id,
        roomUnitId: unit102.id,
        status: 'pending',
        priority: 'high',
        notes: 'SEED-HK-TURNOVER',
        checklistJson: ['Strip linen', 'Vacuum', 'Restock amenities', 'Inspect bathroom'],
        dueAt: atHour(utcDate(0), 12),
      },
    });
  }

  const woExisting = await prisma.maintenanceWorkOrder.findFirst({
    where: { assetId: asset.id, title: 'SEED AC filter — Room 201' },
  });
  if (!woExisting) {
    await prisma.maintenanceWorkOrder.create({
      data: {
        assetId: asset.id,
        roomUnitId: deluxe.units.find((u) => u.name === '201')?.id ?? null,
        title: 'SEED AC filter — Room 201',
        description: 'Guest reported weak cooling; replace filter.',
        status: 'open',
        priority: 'normal',
        category: 'hvac',
        estimatedCost: money(1200),
      },
    });
  }

  const dayCloseDate = utcDate(-1);
  await prisma.propertyDayClose.upsert({
    where: {
      assetId_businessDate: { assetId: asset.id, businessDate: dayCloseDate },
    },
    create: {
      assetId: asset.id,
      businessDate: dayCloseDate,
      postedRoomCharges: 2,
      noShowsMarked: 0,
      summaryJson: {
        seed: true,
        roomsOccupied: 1,
        cashCollected: 6500,
        note: 'Seeded prior business-day close',
      },
      closedBy: 'seed',
    },
    update: {
      postedRoomCharges: 2,
      summaryJson: {
        seed: true,
        roomsOccupied: 1,
        cashCollected: 6500,
        note: 'Seeded prior business-day close',
      },
    },
  });

  const loc101 = await ensureLocation(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    locationType: 'HOTEL_ROOM',
    label: 'Room 101',
    publicToken: 'gs-goa-room-101',
    locationRef: unit101.id,
  });
  await ensureLocation(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    locationType: 'HOTEL_ROOM',
    label: 'Room 102',
    publicToken: 'gs-goa-room-102',
    locationRef: unit102.id,
  });
  await ensureLocation(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    locationType: 'DINING_ZONE',
    label: 'Pool cafe zone',
    publicToken: 'gs-goa-pool-cafe',
  });

  const sandwich = await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Goa Club Sandwich',
    kind: 'food',
    category: 'all_day',
    unitPrice: 420,
    dietaryLabels: ['egg'],
    prepMinutes: 18,
    sortOrder: 1,
    description: 'Chicken, egg, tomato on toasted bread — crisps on the side.',
    imageUrl:
      'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=640&q=80',
  });
  const chai = await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Masala Chai',
    kind: 'beverage',
    category: 'beverage',
    unitPrice: 120,
    taxPercent: 5,
    dietaryLabels: ['vegetarian'],
    prepMinutes: 8,
    sortOrder: 2,
    description: 'House chai with ginger and cardamom.',
    imageUrl:
      'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=640&q=80',
  });
  await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Goan fish curry rice',
    kind: 'food',
    category: 'all_day',
    unitPrice: 520,
    dietaryLabels: ['non_vegetarian'],
    prepMinutes: 28,
    sortOrder: 2,
    description: 'Coconut gravy, catch of the day, steamed rice.',
    imageUrl:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=640&q=80',
  });
  await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Fresh coconut water',
    kind: 'beverage',
    category: 'beverage',
    unitPrice: 100,
    dietaryLabels: ['vegan'],
    prepMinutes: 5,
    sortOrder: 3,
    description: 'Chilled, cut to order.',
  });
  await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Express Laundry Bag',
    kind: 'laundry',
    category: 'laundry',
    unitPrice: 350,
    taxPercent: 18,
    prepMinutes: 240,
    sortOrder: 10,
    description: 'Same-day return before 8pm if placed by noon',
  });

  await ensureGuestMenuCategories(prisma, asset.id, [
    { key: 'all_day', label: 'All day', emoji: '🍽️' },
    { key: 'beverage', label: 'Drinks', emoji: '☕' },
    { key: 'laundry', label: 'Laundry', emoji: '🧺' },
  ]);

  const orderKey = 'seed-goa-room-order-1';
  let order = await prisma.serviceOrder.findFirst({
    where: { organizationId: org.id, idempotencyKey: orderKey },
  });
  if (!order) {
    const line1 = 420;
    const line2 = 120;
    const tax = Math.round((line1 + line2) * 0.05 * 100) / 100;
    order = await prisma.serviceOrder.create({
      data: {
        organizationId: org.id,
        assetId: asset.id,
        serviceLocationId: loc101.id,
        stayReservationId: inHouse.id,
        sourceType: 'QR',
        status: 'preparing',
        currency: 'INR',
        subtotal: money(line1 + line2),
        taxTotal: money(tax),
        total: money(line1 + line2 + tax),
        customerNote: 'Less spicy please',
        idempotencyKey: orderKey,
        acceptedAt: new Date(),
        folioPostedAt: new Date(),
        items: {
          create: [
            {
              offeringId: sandwich.id,
              nameSnapshot: sandwich.name,
              quantity: 1,
              unitPriceSnapshot: money(line1),
              taxSnapshot: money(Math.round(line1 * 0.05 * 100) / 100),
              lineTotal: money(line1),
              status: 'preparing',
            },
            {
              offeringId: chai.id,
              nameSnapshot: chai.name,
              quantity: 1,
              unitPriceSnapshot: money(line2),
              taxSnapshot: money(Math.round(line2 * 0.05 * 100) / 100),
              lineTotal: money(line2),
              status: 'preparing',
            },
          ],
        },
      },
    });
    await ensureFolioOnce(
      prisma,
      { description: 'SEED QR · Room service order', stayReservationId: inHouse.id },
      line1 + line2 + tax,
      'f_and_b',
    );
  }

  const reqExisting = await prisma.guestServiceRequest.findFirst({
    where: {
      organizationId: org.id,
      title: 'Extra towels',
      serviceLocationId: loc101.id,
    },
  });
  if (!reqExisting) {
    await prisma.guestServiceRequest.create({
      data: {
        organizationId: org.id,
        assetId: asset.id,
        serviceLocationId: loc101.id,
        stayReservationId: inHouse.id,
        category: 'housekeeping',
        title: 'Extra towels',
        notes: 'Two bath towels please',
        status: 'requested',
      },
    });
  }

  await prisma.assetRoomUnit.update({
    where: { id: unit101.id },
    data: { status: 'occupied' },
  });

  return {
    org: org.slug,
    qr: ['/o/gs-goa-room-101', '/o/gs-goa-room-102', '/o/gs-goa-pool-cafe'],
    pin: '4821',
    guest: inHouse.guestName,
  };
}

async function seedHomestayManali(prisma: Db) {
  const org = await orgBySlug(prisma, 'seed-homestay-manali-pine');
  const asset = await primaryAsset(prisma, org.id);
  await enableGuestServices(prisma, org.id, { walkInQrEnabled: false });

  const product = await prisma.assetRoomProduct.findFirst({
    where: { assetId: asset.id, deletedAt: null },
    include: { units: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
  });
  if (!product?.units[0]) throw new Error('Homestay inventory missing');
  const unit = product.units[0];

  const stay = await ensureStayByRef(prisma, {
    confirmationRef: 'SEED-STAY-MANALI-INHOUSE',
    assetId: asset.id,
    roomProductId: product.id,
    roomUnitId: unit.id,
    checkIn: utcDate(0),
    checkOut: utcDate(3),
    status: 'checked_in',
    guestName: 'Neha Kapoor',
    guestPhone: '+919811100200',
    guestEmail: 'neha.kapoor@example.com',
    source: 'website',
    rateAmount: 3500,
    amountPaid: 3500,
    roomServicePin: '3391',
    houseRulesAckAt: new Date(),
    inventoryMode: 'private_room',
    hostPresent: true,
    notes: 'Homestay demo · house rules acknowledged · PIN 3391',
  });

  await ensureStayByRef(prisma, {
    confirmationRef: 'SEED-STAY-MANALI-CONFIRMED',
    assetId: asset.id,
    roomProductId: product.id,
    roomUnitId: product.units[1]?.id ?? null,
    checkIn: utcDate(4),
    checkOut: utcDate(6),
    status: 'confirmed',
    guestName: 'Rahul Mehta',
    guestPhone: '+919822233344',
    source: 'phone',
    rateAmount: 3500,
    inventoryMode: 'private_room',
  });

  const loc = await ensureLocation(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    locationType: 'HOMESTAY_ROOM',
    label: `Room ${unit.name}`,
    publicToken: 'gs-manali-room-a1',
    locationRef: unit.id,
  });

  const thali = await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Himachali Home Thali',
    kind: 'food',
    category: 'dinner',
    unitPrice: 380,
    dietaryLabels: ['vegetarian'],
    prepMinutes: 35,
    sortOrder: 1,
    description: 'Host-cooked dinner — order by 5pm',
  });
  await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Hot Chocolate',
    kind: 'beverage',
    category: 'beverage',
    unitPrice: 150,
    dietaryLabels: ['vegetarian'],
    prepMinutes: 10,
    sortOrder: 2,
  });

  await ensureGuestMenuCategories(prisma, asset.id, [
    { key: 'dinner', label: 'Dinner', emoji: '🍲' },
    { key: 'beverage', label: 'Drinks', emoji: '☕' },
  ]);

  const orderKey = 'seed-manali-host-meal-1';
  const existingOrder = await prisma.serviceOrder.findFirst({
    where: { organizationId: org.id, idempotencyKey: orderKey },
  });
  if (!existingOrder) {
    const price = 380;
    const tax = Math.round(price * 0.05 * 100) / 100;
    await prisma.serviceOrder.create({
      data: {
        organizationId: org.id,
        assetId: asset.id,
        serviceLocationId: loc.id,
        stayReservationId: stay.id,
        sourceType: 'QR',
        status: 'placed',
        currency: 'INR',
        subtotal: money(price),
        taxTotal: money(tax),
        total: money(price + tax),
        idempotencyKey: orderKey,
        items: {
          create: [
            {
              offeringId: thali.id,
              nameSnapshot: thali.name,
              quantity: 1,
              unitPriceSnapshot: money(price),
              taxSnapshot: money(tax),
              lineTotal: money(price),
              status: 'placed',
            },
          ],
        },
      },
    });
  }

  return { org: org.slug, qr: ['/o/gs-manali-room-a1'], pin: '3391' };
}

async function seedFarmstayCoorg(prisma: Db) {
  const org = await orgBySlug(prisma, 'seed-farmstay-coorg-coffee');
  const asset = await primaryAsset(prisma, org.id);
  await enableGuestServices(prisma, org.id, { walkInQrEnabled: false });

  const product = await prisma.assetRoomProduct.findFirst({
    where: { assetId: asset.id, deletedAt: null },
    include: { units: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
  });
  if (!product?.units[0]) throw new Error('Farmstay inventory missing');
  const cottage = product.units[0];

  await ensureStayByRef(prisma, {
    confirmationRef: 'SEED-STAY-COORG-INHOUSE',
    assetId: asset.id,
    roomProductId: product.id,
    roomUnitId: cottage.id,
    checkIn: utcDate(-1),
    checkOut: utcDate(2),
    status: 'checked_in',
    guestName: 'Vikram Iyer',
    guestPhone: '+919900112233',
    guestEmail: 'vikram.iyer@example.com',
    source: 'website',
    rateAmount: 4200,
    amountPaid: 4200,
    roomServicePin: '7755',
    houseRulesAckAt: new Date(),
    inventoryMode: 'entire_home',
    hostPresent: false,
    mealPlan: 'AP',
    notes: 'Farmstay in-house · PIN 7755',
  });

  let xp = await prisma.experienceProduct.findFirst({
    where: { assetId: asset.id, title: 'Coffee Plantation Walk', deletedAt: null },
  });
  if (!xp) {
    xp = await prisma.experienceProduct.create({
      data: {
        assetId: asset.id,
        title: 'Coffee Plantation Walk',
        category: 'nature',
        durationMinutes: 90,
        capacity: 12,
        ageMin: 8,
        price: money(750),
        currency: 'INR',
        instructorRequired: true,
        weatherDependent: true,
        description: 'Guided estate walk with cupping at the end.',
        safetyJson: { footwear: 'closed shoes', note: 'Watch for leeches in monsoon' },
        isActive: true,
      },
    });
  }

  let xp2 = await prisma.experienceProduct.findFirst({
    where: { assetId: asset.id, title: 'Estate Cooking Class', deletedAt: null },
  });
  if (!xp2) {
    xp2 = await prisma.experienceProduct.create({
      data: {
        assetId: asset.id,
        title: 'Estate Cooking Class',
        category: 'food',
        durationMinutes: 120,
        capacity: 8,
        price: money(1200),
        currency: 'INR',
        instructorRequired: true,
        description: 'Kodava-style lunch prep with the host family.',
        isActive: true,
      },
    });
  }

  const slotStart = atHour(utcDate(1), 9, 30);
  const slotEnd = atHour(utcDate(1), 11, 0);
  let slot = await prisma.experienceSlot.findFirst({
    where: { experienceProductId: xp.id, startAt: slotStart },
  });
  if (!slot) {
    slot = await prisma.experienceSlot.create({
      data: {
        experienceProductId: xp.id,
        startAt: slotStart,
        endAt: slotEnd,
        capacity: 12,
        reserved: 2,
        held: 0,
        status: 'available',
      },
    });
  }

  const cookStart = atHour(utcDate(2), 11, 0);
  const cookSlot = await prisma.experienceSlot.findFirst({
    where: { experienceProductId: xp2.id, startAt: cookStart },
  });
  if (!cookSlot) {
    await prisma.experienceSlot.create({
      data: {
        experienceProductId: xp2.id,
        startAt: cookStart,
        endAt: atHour(utcDate(2), 13, 0),
        capacity: 8,
        reserved: 0,
        status: 'available',
      },
    });
  }

  let xpRes = await prisma.experienceReservation.findFirst({
    where: {
      assetId: asset.id,
      bookerName: 'Vikram Iyer',
      experienceSlotId: slot.id,
    },
  });
  if (!xpRes) {
    xpRes = await prisma.experienceReservation.create({
      data: {
        assetId: asset.id,
        experienceProductId: xp.id,
        experienceSlotId: slot.id,
        bookerName: 'Vikram Iyer',
        bookerPhone: '+919900112233',
        guestCount: 2,
        status: 'confirmed',
        rateAmount: money(1500),
        currency: 'INR',
        waiverAckAt: new Date(),
        waiverTextSnapshot:
          'I understand plantation walks involve uneven terrain and accept normal outdoor risks.',
        notes: 'SEED experience reservation',
        participants: {
          create: [
            { fullName: 'Vikram Iyer', age: 38, waiverAckAt: new Date() },
            { fullName: 'Meera Iyer', age: 34, waiverAckAt: new Date() },
          ],
        },
      },
    });
  }

  await ensureLocation(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    locationType: 'FARMSTAY_UNIT',
    label: `Cottage ${cottage.name}`,
    publicToken: 'gs-coorg-cottage-a1',
    locationRef: cottage.id,
  });
  await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Estate Filter Coffee',
    kind: 'beverage',
    category: 'beverage',
    unitPrice: 80,
    dietaryLabels: ['vegetarian'],
    prepMinutes: 10,
    sortOrder: 1,
  });
  await ensureOffering(prisma, {
    organizationId: org.id,
    assetId: asset.id,
    name: 'Packed Estate Picnic',
    kind: 'food',
    category: 'lunch',
    unitPrice: 550,
    dietaryLabels: ['vegetarian'],
    prepMinutes: 45,
    sortOrder: 2,
    description: 'For plantation walk guests — place by 9am',
  });

  await ensureGuestMenuCategories(prisma, asset.id, [
    { key: 'beverage', label: 'Drinks', emoji: '☕' },
    { key: 'lunch', label: 'Lunch', emoji: '🍱' },
  ]);

  return {
    org: org.slug,
    qr: ['/o/gs-coorg-cottage-a1'],
    pin: '7755',
    experience: xp.title,
  };
}

async function seedRestaurantJaipur(prisma: Db) {
  const org = await orgBySlug(prisma, 'seed-restaurant-jaipur-spice');
  const asset = await primaryAsset(prisma, org.id);
  await enableGuestServices(prisma, org.id, { walkInQrEnabled: true });

  let party = await prisma.party.findFirst({
    where: {
      organizationId: org.id,
      displayName: 'Desert Caravan Tours',
      deletedAt: null,
    },
  });
  if (!party) {
    party = await prisma.party.create({
      data: {
        organizationId: org.id,
        type: 'organization',
        displayName: 'Desert Caravan Tours',
        email: 'ops@desertcaravan.demo',
        phone: '+919414001100',
        businessType: 'travel_agency',
        notes: 'SEED restaurant B2B client',
      },
    });
  }

  let thaliPkg = await prisma.mealPackage.findFirst({
    where: { assetId: asset.id, name: 'Rajasthani Royal Thali', deletedAt: null },
  });
  if (!thaliPkg) {
    thaliPkg = await prisma.mealPackage.create({
      data: {
        assetId: asset.id,
        name: 'Rajasthani Royal Thali',
        mealType: 'dinner',
        pricePerPerson: money(650),
        currency: 'INR',
        minGuests: 10,
        maxGuests: 80,
        advanceNoticeHours: 24,
        serviceWindow: '19:00-22:00',
        itemsIncludedJson: ['Dal baati churma', 'Gatte ki sabzi', 'Bajra roti', 'Chaas', 'Ghewar'],
        dietaryOptionsJson: ['vegetarian', 'jain_on_request'],
        description: 'Fixed thali for tour groups',
        isActive: true,
      },
    });
  }

  let buffet = await prisma.mealPackage.findFirst({
    where: { assetId: asset.id, name: 'Group Lunch Buffet', deletedAt: null },
  });
  if (!buffet) {
    buffet = await prisma.mealPackage.create({
      data: {
        assetId: asset.id,
        name: 'Group Lunch Buffet',
        mealType: 'lunch',
        pricePerPerson: money(450),
        currency: 'INR',
        minGuests: 20,
        maxGuests: 120,
        advanceNoticeHours: 48,
        serviceWindow: '12:30-15:00',
        description: 'Live counters + salad + dessert',
        isActive: true,
      },
    });
  }

  const dinnerStart = atHour(utcDate(0), 19, 0);
  const dinnerEnd = atHour(utcDate(0), 22, 0);
  let capacity = await prisma.diningCapacity.findFirst({
    where: {
      assetId: asset.id,
      serviceDate: utcDate(0),
      slotStart: dinnerStart,
    },
  });
  if (!capacity) {
    capacity = await prisma.diningCapacity.create({
      data: {
        assetId: asset.id,
        serviceDate: utcDate(0),
        slotStart: dinnerStart,
        slotEnd: dinnerEnd,
        totalCapacity: 80,
        reserved: 24,
        held: 0,
        zone: 'main_hall',
      },
    });
  }

  let inquiry = await prisma.mealInquiry.findFirst({
    where: {
      assetId: asset.id,
      contactName: 'Kavita Singh',
      notes: 'SEED-MEAL-INQ-OPEN',
    },
  });
  if (!inquiry) {
    inquiry = await prisma.mealInquiry.create({
      data: {
        assetId: asset.id,
        partyId: party.id,
        contactName: 'Kavita Singh',
        contactPhone: '+919414001100',
        contactEmail: 'ops@desertcaravan.demo',
        guestCount: 35,
        preferredServiceAt: atHour(utcDate(3), 20, 0),
        mealPackageId: thaliPkg.id,
        status: 'quoted',
        quotedAmount: money(35 * 650),
        currency: 'INR',
        notes: 'SEED-MEAL-INQ-OPEN',
      },
    });
  }

  let mealRes = await prisma.mealReservation.findFirst({
    where: { assetId: asset.id, guestName: 'Desert Caravan — Group A', notes: 'SEED-MEAL-RES' },
  });
  if (!mealRes) {
    mealRes = await prisma.mealReservation.create({
      data: {
        assetId: asset.id,
        mealPackageId: thaliPkg.id,
        diningCapacityId: capacity.id,
        partyId: party.id,
        serviceAt: dinnerStart,
        guestCount: 24,
        guestName: 'Desert Caravan — Group A',
        status: 'confirmed',
        preparationStatus: 'prep_started',
        source: 'partner_direct',
        dietaryJson: { vegetarian: 20, Jain: 4 },
        rateAmount: money(24 * 650),
        amountPaid: money(8000),
        currency: 'INR',
        notes: 'SEED-MEAL-RES',
      },
    });
    await ensureFolioOnce(
      prisma,
      { description: 'SEED Group thali deposit balance', mealReservationId: mealRes.id },
      24 * 650 - 8000,
      'f_and_b',
    );
  }

  const tables = [
    { label: 'Table 1', token: 'gs-jaipur-table-1' },
    { label: 'Table 2', token: 'gs-jaipur-table-2' },
    { label: 'Table 3', token: 'gs-jaipur-table-3' },
    { label: 'Patio A', token: 'gs-jaipur-patio-a' },
  ];
  const locs = [];
  for (const t of tables) {
    locs.push(
      await ensureLocation(prisma, {
        organizationId: org.id,
        assetId: asset.id,
        locationType: 'RESTAURANT_TABLE',
        label: t.label,
        publicToken: t.token,
      }),
    );
  }

  const menuSeed = [
    {
      name: 'Papad roasting platter',
      category: 'starters',
      unitPrice: 120,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 8,
      sortOrder: 1,
      description: 'Three house papads with green chutney and raw onion.',
      imageUrl:
        'https://images.unsplash.com/photo-1606491956689-2f73063b8daf?w=640&q=80',
    },
    {
      name: 'Mirchi vada',
      category: 'starters',
      unitPrice: 160,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 15,
      sortOrder: 2,
      description: 'Batter-fried green chillies stuffed with spiced potato.',
      imageUrl:
        'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=640&q=80',
    },
    {
      name: 'Dal Baati Churma',
      category: 'mains',
      unitPrice: 280,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 25,
      sortOrder: 1,
      description: 'Baked baati, smoky dal, and crumbled churma — our signature plate.',
      imageUrl:
        'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=640&q=80',
      modifiersJson: [
        {
          id: 'g_spice',
          name: 'Spice level',
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'o_mild', name: 'Mild', priceDelta: 0 },
            { id: 'o_med', name: 'Medium', priceDelta: 0 },
            { id: 'o_hot', name: 'Extra hot', priceDelta: 20 },
          ],
        },
      ],
    },
    {
      name: 'Rajasthani Royal Thali',
      category: 'thali',
      unitPrice: 450,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 30,
      sortOrder: 1,
      description:
        'Five sabzis, dal, roti, rice, chaas, and dessert — plated for the table.',
      imageUrl:
        'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=640&q=80',
    },
    {
      name: 'Laal Maas',
      category: 'mains',
      unitPrice: 420,
      kind: 'food' as const,
      dietaryLabels: ['non_vegetarian'],
      prepMinutes: 35,
      sortOrder: 2,
      description: 'Slow-cooked mutton in Mathania chilli gravy — fire is optional.',
      imageUrl:
        'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=640&q=80',
      modifiersJson: [
        {
          id: 'g_heat',
          name: 'Heat',
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'o_trad', name: 'Traditional hot', priceDelta: 0 },
            { id: 'o_tame', name: 'Tamed for tourists', priceDelta: 0 },
          ],
        },
      ],
    },
    {
      name: 'Gatte ki sabzi',
      category: 'mains',
      unitPrice: 240,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 20,
      sortOrder: 3,
      description: 'Gram-flour dumplings in a yoghurt curry — kitchen comfort.',
      imageUrl:
        'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=640&q=80',
    },
    {
      name: 'Bajra roti basket',
      category: 'mains',
      unitPrice: 90,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 12,
      sortOrder: 4,
      description: 'Two millet rotis with white butter.',
    },
    {
      name: 'Ker sangri',
      category: 'mains',
      unitPrice: 260,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian', 'jain_on_request'],
      prepMinutes: 18,
      sortOrder: 5,
      description: 'Desert berries and beans — tangy, dry, unmistakably Marwari.',
    },
    {
      name: 'Sweet Lassi',
      category: 'beverage',
      unitPrice: 90,
      kind: 'beverage' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 5,
      sortOrder: 1,
      description: 'Chilled, frothy, topped with a whisper of elaichi.',
      imageUrl:
        'https://images.unsplash.com/photo-1623065425908-6e66c6b2b7c3?w=640&q=80',
      modifiersJson: [
        {
          id: 'g_size',
          name: 'Size',
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'o_reg', name: 'Regular', priceDelta: 0 },
            { id: 'o_lrg', name: 'Large', priceDelta: 40 },
          ],
        },
      ],
    },
    {
      name: 'Chaas',
      category: 'beverage',
      unitPrice: 60,
      kind: 'beverage' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 4,
      sortOrder: 2,
      description: 'Spiced buttermilk — the antidote to every chilli.',
    },
    {
      name: 'Masala chai',
      category: 'beverage',
      unitPrice: 50,
      kind: 'beverage' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 8,
      sortOrder: 3,
      description: 'Kadak kitchen chai with ginger.',
      imageUrl:
        'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=640&q=80',
    },
    {
      name: 'Fresh lime soda',
      category: 'beverage',
      unitPrice: 80,
      kind: 'beverage' as const,
      dietaryLabels: ['vegetarian', 'vegan'],
      prepMinutes: 5,
      sortOrder: 4,
      description: 'Sweet, salted, or mixed — say which.',
      modifiersJson: [
        {
          id: 'g_lime',
          name: 'Style',
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'o_sweet', name: 'Sweet', priceDelta: 0 },
            { id: 'o_salt', name: 'Salted', priceDelta: 0 },
            { id: 'o_mix', name: 'Sweet & salted', priceDelta: 0 },
          ],
        },
      ],
    },
    {
      name: 'Ghewar',
      category: 'dessert',
      unitPrice: 160,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 5,
      sortOrder: 1,
      description: 'Honeycomb Rajasthani sweet with rabri if you ask.',
      imageUrl:
        'https://images.unsplash.com/photo-1571115177098-24ec42ced893?w=640&q=80',
    },
    {
      name: 'Malpua with rabri',
      category: 'dessert',
      unitPrice: 180,
      kind: 'food' as const,
      dietaryLabels: ['vegetarian'],
      prepMinutes: 12,
      sortOrder: 2,
      description: 'Warm pancake, reduced milk, pistachio dust.',
      imageUrl:
        'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=640&q=80',
    },
  ];

  let dal: { id: string; name: string } | null = null;
  let lassi: { id: string; name: string } | null = null;
  for (const item of menuSeed) {
    const row = await ensureOffering(prisma, {
      organizationId: org.id,
      assetId: asset.id,
      ...item,
    });
    if (item.name === 'Dal Baati Churma') dal = row;
    if (item.name === 'Sweet Lassi') lassi = row;
  }
  if (!dal || !lassi) {
    throw new Error('Restaurant seed offerings missing Dal/Lassi');
  }

  const papad = await prisma.serviceOffering.findFirst({
    where: { assetId: asset.id, name: 'Papad roasting platter' },
  });
  const ghewar = await prisma.serviceOffering.findFirst({
    where: { assetId: asset.id, name: 'Ghewar' },
  });

  await ensureGuestMenuCategories(
    prisma,
    asset.id,
    [
      { key: 'starters', label: 'To begin', emoji: '🥗' },
      { key: 'mains', label: 'House mains', emoji: '🍛' },
      { key: 'thali', label: 'Thalis', emoji: '🥘' },
      { key: 'beverage', label: 'Drinks', emoji: '🥤' },
      { key: 'dessert', label: 'Something sweet', emoji: '🍰' },
    ],
    [dal.id, lassi.id],
    {
      specials: [
        {
          type: 'today',
          title: "Today's special",
          offeringId: dal.id,
          blurb: 'Smoky dal with fresh baati — house signature.',
        },
        ...(ghewar
          ? [
              {
                type: 'festival' as const,
                title: 'Festival sweet',
                offeringId: ghewar.id,
                blurb: 'Crisp ghewar while it lasts.',
              },
            ]
          : []),
      ],
      combos: [
        {
          id: 'combo_thali_drink',
          name: 'Dal + Lassi combo',
          offeringIds: [dal.id, lassi.id],
          price: 340,
          saveAmount: 30,
          currency: 'INR',
        },
      ],
      upsellPairs: {
        [dal.id]: [lassi.id, ...(papad ? [papad.id] : []), ...(ghewar ? [ghewar.id] : [])],
      },
    },
  );

  // Soft recommendation tags on a couple of dishes
  await prisma.serviceOffering.updateMany({
    where: { id: dal.id },
    data: {
      dietaryLabels: ['vegetarian', 'for_family'],
    },
  });
  if (lassi) {
    await prisma.serviceOffering.update({
      where: { id: lassi.id },
      data: {
        dietaryLabels: ['vegetarian', 'for_couples'],
      },
    });
  }

  const seedRatings = [
    { offeringId: dal.id, stars: 5 },
    { offeringId: dal.id, stars: 5 },
    { offeringId: dal.id, stars: 4 },
    { offeringId: lassi.id, stars: 5 },
    { offeringId: lassi.id, stars: 4 },
    { offeringId: lassi.id, stars: 5 },
  ];
  for (const [i, r] of seedRatings.entries()) {
    const existing = await prisma.serviceOfferingRating.findFirst({
      where: {
        offeringId: r.offeringId,
        fingerprint: `seed-jaipur-${i}`,
      },
    });
    if (!existing) {
      await prisma.serviceOfferingRating.create({
        data: {
          organizationId: org.id,
          assetId: asset.id,
          offeringId: r.offeringId,
          stars: r.stars,
          fingerprint: `seed-jaipur-${i}`,
          comment: i === 0 ? 'Signature plate' : null,
        },
      });
    }
  }

  let session = await prisma.tableSession.findFirst({
    where: { serviceLocationId: locs[0].id, openedBy: 'seed' },
  });
  if (!session) {
    session = await prisma.tableSession.create({
      data: {
        organizationId: org.id,
        assetId: asset.id,
        serviceLocationId: locs[0].id,
        guestCount: 3,
        status: 'open',
        openedBy: 'seed',
        currency: 'INR',
      },
    });
  } else if (session.status !== 'open') {
    session = await prisma.tableSession.update({
      where: { id: session.id },
      data: { status: 'open', closedAt: null },
    });
  }

  const orderKey = 'seed-jaipur-table1-order-1';
  let order = await prisma.serviceOrder.findFirst({
    where: { organizationId: org.id, idempotencyKey: orderKey },
  });
  if (!order) {
    const sub = 280 + 90;
    const tax = Math.round(sub * 0.05 * 100) / 100;
    order = await prisma.serviceOrder.create({
      data: {
        organizationId: org.id,
        assetId: asset.id,
        serviceLocationId: locs[0].id,
        tableSessionId: session.id,
        sourceType: 'QR',
        status: 'accepted',
        currency: 'INR',
        subtotal: money(sub),
        taxTotal: money(tax),
        total: money(sub + tax),
        customerNote: 'One extra chaas if available',
        idempotencyKey: orderKey,
        acceptedAt: new Date(),
        folioPostedAt: new Date(),
        items: {
          create: [
            {
              offeringId: dal.id,
              nameSnapshot: dal.name,
              quantity: 1,
              unitPriceSnapshot: money(280),
              taxSnapshot: money(14),
              lineTotal: money(280),
              status: 'accepted',
            },
            {
              offeringId: lassi.id,
              nameSnapshot: lassi.name,
              quantity: 1,
              unitPriceSnapshot: money(90),
              taxSnapshot: money(4.5),
              lineTotal: money(90),
              status: 'accepted',
            },
          ],
        },
      },
    });
    await ensureFolioOnce(
      prisma,
      { description: 'SEED QR · Table 1 order', tableSessionId: session.id },
      sub + tax,
      'f_and_b',
    );
  }

  return {
    org: org.slug,
    qr: tables.map((t) => `/o/${t.token}`),
    mealPackage: thaliPkg.name,
    inquiry: inquiry.contactName,
  };
}

async function seedCarRentalMumbai(prisma: Db) {
  const org = await orgBySlug(prisma, 'seed-car-rental-mumbai');
  const asset = await primaryAsset(prisma, org.id);

  const fleetDefs = [
    { name: 'Swift Dzire', plateNumber: 'MH01AB4521', seats: 4, vehicleTypeKey: 'sedan' },
    { name: 'Innova Crysta', plateNumber: 'MH02CD8832', seats: 7, vehicleTypeKey: 'suv' },
    { name: 'Toyota Fortuner', plateNumber: 'MH03EF1100', seats: 7, vehicleTypeKey: 'suv' },
  ];
  const units = [];
  for (const def of fleetDefs) {
    let u = await prisma.assetFleetUnit.findFirst({
      where: { assetId: asset.id, plateNumber: def.plateNumber, deletedAt: null },
    });
    if (!u) {
      u = await prisma.assetFleetUnit.create({
        data: { assetId: asset.id, ...def, isActive: true },
      });
    }
    units.push(u);
  }

  let rate = await prisma.assetFleetRate.findFirst({
    where: { assetId: asset.id, name: 'City daily · Sedan', deletedAt: null },
  });
  if (!rate) {
    rate = await prisma.assetFleetRate.create({
      data: {
        assetId: asset.id,
        name: 'City daily · Sedan',
        amountPerDay: money(2800),
        depositAmount: money(5000),
        currency: 'INR',
        isActive: true,
      },
    });
  }
  let rateSuv = await prisma.assetFleetRate.findFirst({
    where: { assetId: asset.id, name: 'City daily · SUV', deletedAt: null },
  });
  if (!rateSuv) {
    rateSuv = await prisma.assetFleetRate.create({
      data: {
        assetId: asset.id,
        name: 'City daily · SUV',
        amountPerDay: money(4500),
        depositAmount: money(8000),
        currency: 'INR',
        isActive: true,
      },
    });
  }

  let party = await prisma.party.findFirst({
    where: { organizationId: org.id, displayName: 'Aarav Patel', deletedAt: null },
  });
  if (!party) {
    party = await prisma.party.create({
      data: {
        organizationId: org.id,
        type: 'individual',
        displayName: 'Aarav Patel',
        email: 'aarav.patel@example.com',
        phone: '+919876501234',
        notes: 'SEED rental guest',
      },
    });
  }

  const startAt = atHour(utcDate(-1), 10);
  const endAt = atHour(utcDate(2), 10);
  let active = await prisma.rentalReservation.findFirst({
    where: { assetId: asset.id, guestName: 'Aarav Patel', notes: 'SEED-RENTAL-OUT' },
  });
  if (!active) {
    active = await prisma.rentalReservation.create({
      data: {
        assetId: asset.id,
        fleetUnitId: units[0].id,
        fleetRateId: rate.id,
        partyId: party.id,
        guestName: 'Aarav Patel',
        guestPhone: '+919876501234',
        startAt,
        endAt,
        status: 'checked_out',
        rateAmount: money(2800 * 3),
        depositAmount: money(5000),
        depositPaid: money(5000),
        amountPaid: money(2800),
        currency: 'INR',
        checkoutChecklistJson: { fuel: 'full', odometer: 42310, scratches: 'none' },
        notes: 'SEED-RENTAL-OUT',
      },
    });
    await ensureFolioOnce(
      prisma,
      { description: 'SEED Rental day 1', rentalReservationId: active.id },
      2800,
      'transport',
    );
  }

  const futureStart = atHour(utcDate(3), 9);
  const future = await prisma.rentalReservation.findFirst({
    where: { assetId: asset.id, guestName: 'Sonia Desai', notes: 'SEED-RENTAL-CONF' },
  });
  if (!future) {
    await prisma.rentalReservation.create({
      data: {
        assetId: asset.id,
        fleetUnitId: units[1].id,
        fleetRateId: rateSuv.id,
        guestName: 'Sonia Desai',
        guestPhone: '+919820045678',
        startAt: futureStart,
        endAt: atHour(utcDate(5), 9),
        status: 'confirmed',
        rateAmount: money(4500 * 2),
        depositAmount: money(8000),
        depositPaid: money(0),
        amountPaid: money(0),
        currency: 'INR',
        notes: 'SEED-RENTAL-CONF',
      },
    });
  }

  return { org: org.slug, fleet: units.length, activeGuest: 'Aarav Patel' };
}

async function seedDriverDelhi(prisma: Db) {
  const org = await orgBySlug(prisma, 'seed-driver-delhi-fleet');
  const asset = await primaryAsset(prisma, org.id);

  const jobs = [
    {
      key: 'SEED-DRV-ENROUTE',
      guestName: 'Tour group — Delhi Jaipur',
      guestPhone: '+919811122200',
      pickupLocation: 'IGI T3 Arrivals',
      dropLocation: 'Hotel Imperial, Janpath',
      startAt: atHour(utcDate(0), 14),
      endAt: atHour(utcDate(0), 16),
      status: 'en_route',
      rateAmount: 2500,
    },
    {
      key: 'SEED-DRV-ASSIGNED',
      guestName: 'Meera Krishnan',
      guestPhone: '+919900223344',
      pickupLocation: 'Connaught Place',
      dropLocation: 'Qutub Minar',
      startAt: atHour(utcDate(0), 17),
      endAt: atHour(utcDate(0), 19),
      status: 'assigned',
      rateAmount: 1800,
    },
    {
      key: 'SEED-DRV-DONE',
      guestName: 'Akira Tanaka',
      guestPhone: '+819012345678',
      pickupLocation: 'Aerocity',
      dropLocation: 'Red Fort',
      startAt: atHour(utcDate(-1), 9),
      endAt: atHour(utcDate(-1), 12),
      status: 'completed',
      rateAmount: 3200,
      completionNote: 'Guest tip received · SEED',
    },
  ] as const;

  for (const j of jobs) {
    const existing = await prisma.driverJob.findFirst({
      where: { assetId: asset.id, notes: j.key },
    });
    if (existing) {
      await prisma.driverJob.update({
        where: { id: existing.id },
        data: {
          status: j.status,
          pickupLocation: j.pickupLocation,
          dropLocation: j.dropLocation,
          startAt: j.startAt,
          endAt: j.endAt,
          rateAmount: money(j.rateAmount),
          amountPaid: j.status === 'completed' ? money(j.rateAmount) : money(0),
          completionNote: 'completionNote' in j ? j.completionNote : null,
        },
      });
      continue;
    }
    await prisma.driverJob.create({
      data: {
        assetId: asset.id,
        guestName: j.guestName,
        guestPhone: j.guestPhone,
        pickupLocation: j.pickupLocation,
        dropLocation: j.dropLocation,
        startAt: j.startAt,
        endAt: j.endAt,
        status: j.status,
        rateAmount: money(j.rateAmount),
        amountPaid: j.status === 'completed' ? money(j.rateAmount) : money(0),
        currency: 'INR',
        notes: j.key,
        completionNote: 'completionNote' in j ? j.completionNote : null,
      },
    });
  }

  return { org: org.slug, jobs: jobs.length };
}

async function seedDmcRajasthan(prisma: Db) {
  const org = await orgBySlug(prisma, 'seed-dmc-rajasthan');

  const parties = [
    {
      displayName: 'North India Tours (B2B)',
      email: 'buying@northindia.tours.demo',
      phone: '+919811155566',
      businessType: 'travel_agency',
    },
    {
      displayName: 'Alpine Trails GmbH',
      email: 'ops@alpinetrails.demo',
      phone: '+4989123456',
      businessType: 'travel_agency',
    },
    {
      displayName: 'Wanderlust USA',
      email: 'groups@wanderlustusa.demo',
      phone: '+12125550199',
      businessType: 'travel_agency',
    },
  ];
  for (const p of parties) {
    const existing = await prisma.party.findFirst({
      where: { organizationId: org.id, displayName: p.displayName, deletedAt: null },
    });
    if (!existing) {
      await prisma.party.create({
        data: {
          organizationId: org.id,
          type: 'organization',
          displayName: p.displayName,
          email: p.email,
          phone: p.phone,
          businessType: p.businessType,
          notes: 'SEED DMC B2B client',
        },
      });
    }
  }

  const owner = await prisma.organizationMembership.findFirst({
    where: { organizationId: org.id, isOwner: true },
  });
  const pipeline = await prisma.pipeline.findFirst({
    where: { organizationId: org.id },
  });
  const stage = pipeline
    ? await prisma.pipelineStage.findFirst({
        where: { pipelineId: pipeline.id },
        orderBy: { position: 'asc' },
      })
    : null;

  if (owner && pipeline && stage) {
    const leadKey = 'seed-dmc-desert-circuit';
    const existingLead = await prisma.lead.findFirst({
      where: { organizationId: org.id, idempotencyKey: leadKey },
    });
    if (!existingLead) {
      await prisma.lead.create({
        data: {
          organizationId: org.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          ownerId: owner.userId,
          title: 'Desert Circuit FIT — 8 pax Oct',
          contactName: 'Claudia Berger',
          email: 'ops@alpinetrails.demo',
          phone: '+4989123456',
          priority: 'high',
          idempotencyKey: leadKey,
          customFieldsJson: { seedNote: 'DMC inbound from Alpine Trails' },
          stageHistory: {
            create: {
              stageId: stage.id,
              changedBy: owner.userId,
              note: 'Seeded DMC demo lead',
            },
          },
        },
      });
    }
  }

  return { org: org.slug, b2bParties: parties.length };
}

/** Link agency suppliers to all partner kinds (idempotent). */
async function linkAgencyToPartners(prisma: Db) {
  const agency = await prisma.organization.findUnique({ where: { slug: 'demo-travel' } });
  if (!agency) return { linked: 0 };

  const partners = await prisma.organization.findMany({
    where: {
      slug: {
        in: [
          'seed-hotel-goa-breeze',
          'seed-homestay-manali-pine',
          'seed-farmstay-coorg-coffee',
          'seed-car-rental-mumbai',
          'seed-driver-delhi-fleet',
          'seed-restaurant-jaipur-spice',
          'seed-dmc-rajasthan',
          'seed-events-jaipur',
        ],
      },
    },
  });

  let linked = 0;
  for (const p of partners) {
    const rel = await prisma.orgRelationship.findFirst({
      where: {
        fromOrganizationId: agency.id,
        toOrganizationId: p.id,
      },
    });
    if (!rel) {
      await prisma.orgRelationship.create({
        data: {
          fromOrganizationId: agency.id,
          toOrganizationId: p.id,
          status: 'preferred',
          notes: `SEED link · ${p.kind}`,
        },
      });
      linked += 1;
    }

    const supplierType =
      p.kind === 'hotel' || p.kind === 'homestay' || p.kind === 'farmstay'
        ? 'hotel'
        : p.kind === 'car_rental' || p.kind === 'driver'
          ? 'transport'
          : p.kind === 'dmc'
            ? 'dmc'
            : 'other';
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        organizationId: agency.id,
        linkedOrganizationId: p.id,
        deletedAt: null,
      },
    });
    if (!existingSupplier) {
      await prisma.supplier.create({
        data: {
          organizationId: agency.id,
          name: p.name,
          type: supplierType,
          email: `${p.slug}@link.demo`,
          linkedOrganizationId: p.id,
          notes: 'SEED network-linked supplier',
        },
      });
      linked += 1;
    }
  }
  return { linked };
}

export async function seedPartnerOperationalData(prisma: Db) {
  const summary: Record<string, unknown> = {};
  summary.hotel = await seedHotelGoa(prisma);
  summary.homestay = await seedHomestayManali(prisma);
  summary.farmstay = await seedFarmstayCoorg(prisma);
  summary.restaurant = await seedRestaurantJaipur(prisma);
  summary.carRental = await seedCarRentalMumbai(prisma);
  summary.driver = await seedDriverDelhi(prisma);
  summary.dmc = await seedDmcRajasthan(prisma);
  summary.agencyLinks = await linkAgencyToPartners(prisma);

  console.log('\nPartner operational demo data ready:');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nGuest QR paths (append to web origin):');
  console.log('  Hotel room 101 (PIN 4821):  /o/gs-goa-room-101');
  console.log('  Homestay (PIN 3391):        /o/gs-manali-room-a1');
  console.log('  Farmstay (PIN 7755):        /o/gs-coorg-cottage-a1');
  console.log('  Restaurant Table 1:         /o/gs-jaipur-table-1');
  return summary;
}
