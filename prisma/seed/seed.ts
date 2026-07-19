import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  bootstrapEnv,
  PARTNER_ROLE_PERMISSION_MAP,
  PERMISSIONS,
  permissionAllowedForOrgKind,
  PLATFORM_ROLE_PERMISSION_MAP,
  roleAllowedForOrgKind,
  ROLE_PERMISSION_MAP,
  SYSTEM_PLACE_CATEGORIES,
  SYSTEM_PLACE_EDGES,
  SYSTEM_PLACE_KNOWLEDGE,
  SYSTEM_PLACES,
  SYSTEM_PLACES_NORTHEAST,
  NORTHEAST_TRANSPORT_PARENT_OVERRIDES,
  INDIA_TRANSPORT_PLACES,
  SYSTEM_ROOM_TYPES,
  SYSTEM_VEHICLE_TYPES,
  SYSTEM_TRANSFER_FARE_CORRIDORS,
  buildClusterFareSeeds,
  SYSTEM_HOTEL_RATES,
} from '@wayrune/config';
import {
  backfillPartnerDefaultAssets,
  backfillStayStarterInventory,
  orgKindToAssetKind,
  ensureDefaultPartnerAsset,
} from '../../apps/api/src/modules/partner-assets/partner-assets.helpers';
import {
  backfillHotelRateRoomProducts,
  ensureSupplierLinkedStayInventory,
} from '../../apps/api/src/modules/rates/rates-backfill.helpers';
import {
  hotelBookingTitle,
  hotelStayWindow,
  lineBuyTotal,
  lineSellTotal,
} from '../../apps/api/src/modules/operations/hotel-quote-booking';
import { seedPartnerOperationalData } from './partner-ops-seed';
import {
  ensureOrgPresenceFormPresets,
  ensureSystemPresenceThemes,
} from '../../apps/api/src/modules/presence/presence-seed';

const DEMO_PASSWORD = 'Password123!';

async function allocateSeedOrgIdentity(
  prisma: PrismaClient,
  name: string,
  preferredSubdomain?: string,
) {
  const max = await prisma.organization.aggregate({ _max: { publicCode: true } });
  const publicCode = Math.max((max._max.publicCode ?? 10000) + 1, 10001);
  const raw =
    (preferredSubdomain || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 48) || 'org';
  let subdomain = raw;
  let i = 1;
  while (await prisma.organization.findFirst({ where: { subdomain } })) {
    subdomain = `${raw.slice(0, 40)}${i++}`;
  }
  return { publicCode, subdomain };
}

async function seedSystemPlaceCategories(prisma: PrismaClient) {
  const subByKey = new Map<string, string>();
  for (const cat of SYSTEM_PLACE_CATEGORIES) {
    let category = await prisma.placeCategory.findFirst({
      where: { isSystem: true, key: cat.key, deletedAt: null },
    });
    if (category) {
      category = await prisma.placeCategory.update({
        where: { id: category.id },
        data: { name: cat.name, isActive: true },
      });
    } else {
      category = await prisma.placeCategory.create({
        data: {
          organizationId: null,
          name: cat.name,
          key: cat.key,
          isSystem: true,
          isActive: true,
        },
      });
    }
    for (const sub of cat.subcategories) {
      let existing = await prisma.placeSubcategory.findFirst({
        where: { isSystem: true, key: sub.key, deletedAt: null },
      });
      if (existing) {
        existing = await prisma.placeSubcategory.update({
          where: { id: existing.id },
          data: { name: sub.name, categoryId: category.id, isActive: true },
        });
      } else {
        existing = await prisma.placeSubcategory.create({
          data: {
            categoryId: category.id,
            organizationId: null,
            name: sub.name,
            key: sub.key,
            isSystem: true,
            isActive: true,
          },
        });
      }
      subByKey.set(sub.key, existing.id);
    }
  }
  console.log(`Seeded ${SYSTEM_PLACE_CATEGORIES.length} place categories`);
  return subByKey;
}

async function seedSystemPlaces(prisma: PrismaClient) {
  const subByKey = await seedSystemPlaceCategories(prisma);
  const idByKey = new Map<string, string>();
  const allPlaces = [
    ...SYSTEM_PLACES,
    ...SYSTEM_PLACES_NORTHEAST,
    ...INDIA_TRANSPORT_PLACES,
  ];

  // First pass: upsert rows without depending on parents existing yet
  for (const d of allPlaces) {
    const existing = await prisma.place.findFirst({
      where: { isSystem: true, key: d.key, deletedAt: null },
    });
    const data = {
      name: d.name,
      country: d.country,
      region: d.region ?? null,
      domesticOrIntl: d.domesticOrIntl,
      kind: d.kind,
      isActive: true,
      profileJson: d.profile ? (d.profile as Prisma.InputJsonValue) : undefined,
    };
    if (existing) {
      await prisma.place.update({ where: { id: existing.id }, data });
      idByKey.set(d.key, existing.id);
    } else {
      const created = await prisma.place.create({
        data: {
          organizationId: null,
          name: d.name,
          key: d.key,
          country: d.country,
          region: d.region ?? null,
          domesticOrIntl: d.domesticOrIntl,
          kind: d.kind,
          isSystem: true,
          isActive: true,
          profileJson: d.profile ? (d.profile as Prisma.InputJsonValue) : undefined,
        },
      });
      idByKey.set(d.key, created.id);
    }
  }

  // Second pass: wire parents + subcategory links
  for (const d of allPlaces) {
    const id = idByKey.get(d.key);
    if (!id) continue;
    const overrideParent = NORTHEAST_TRANSPORT_PARENT_OVERRIDES[d.key];
    const parentKey = overrideParent ?? d.parentKey ?? null;
    const parentId = parentKey ? idByKey.get(parentKey) ?? null : null;
    await prisma.place.update({
      where: { id },
      data: { parentId },
    });
    if (d.subcategoryKeys?.length) {
      for (const sk of d.subcategoryKeys) {
        const subcategoryId = subByKey.get(sk);
        if (!subcategoryId) continue;
        await prisma.placeSubcategoryLink.upsert({
          where: {
            placeId_subcategoryId: { placeId: id, subcategoryId },
          },
          create: { placeId: id, subcategoryId },
          update: {},
        });
      }
    }
  }

  console.log(`Seeded ${allPlaces.length} system places (hierarchy)`);
  return idByKey;
}

async function seedSystemTransferFares(
  prisma: PrismaClient,
  placeIdByKey: Map<string, string>,
) {
  const vehicleIdByKey = new Map<string, string>();
  const vehicles = await prisma.vehicleType.findMany({
    where: { isSystem: true, organizationId: null, deletedAt: null },
    select: { id: true, key: true },
  });
  for (const v of vehicles) {
    if (v.key) vehicleIdByKey.set(v.key, v.id);
  }

  const seeds = [
    ...SYSTEM_TRANSFER_FARE_CORRIDORS,
    ...buildClusterFareSeeds(),
  ];
  let count = 0;
  for (const row of seeds) {
    const fromPlaceId = placeIdByKey.get(row.fromKey);
    const toPlaceId = placeIdByKey.get(row.toKey);
    const vehicleTypeId = vehicleIdByKey.get(row.vehicleTypeKey);
    if (!fromPlaceId || !toPlaceId || !vehicleTypeId) continue;

    const existing = await prisma.transferFare.findFirst({
      where: {
        isSystem: true,
        organizationId: null,
        fromPlaceId,
        toPlaceId,
        vehicleTypeId,
        deletedAt: null,
      },
    });
    const data = {
      unitCost: new Prisma.Decimal(row.unitCost),
      childUnitCost:
        row.childUnitCost != null
          ? new Prisma.Decimal(row.childUnitCost)
          : null,
      pricingMode: row.pricingMode || 'per_vehicle',
      currency: row.currency || 'INR',
      isActive: true,
    };
    if (existing) {
      await prisma.transferFare.update({ where: { id: existing.id }, data });
    } else {
      await prisma.transferFare.create({
        data: {
          organizationId: null,
          isSystem: true,
          fromPlaceId,
          toPlaceId,
          vehicleTypeId,
          ...data,
        },
      });
    }
    count += 1;
  }
  console.log(`Seeded ${count} system transfer fares`);
}

async function seedSystemHotelRates(
  prisma: PrismaClient,
  placeIdByKey: Map<string, string>,
) {
  let count = 0;
  for (const row of SYSTEM_HOTEL_RATES) {
    const placeId = placeIdByKey.get(row.placeKey);
    if (!placeId) continue;
    const roomType = row.roomType;
    const existing = await prisma.supplierHotelRate.findFirst({
      where: {
        isSystem: true,
        organizationId: null,
        placeId,
        roomType,
        deletedAt: null,
      },
    });
    if (existing) {
      await prisma.supplierHotelRate.update({
        where: { id: existing.id },
        data: {
          unitCost: new Prisma.Decimal(row.unitCost),
          currency: row.currency || 'INR',
          isActive: true,
        },
      });
    } else {
      await prisma.supplierHotelRate.create({
        data: {
          organizationId: null,
          isSystem: true,
          supplierId: null,
          placeId,
          roomType,
          unitCost: new Prisma.Decimal(row.unitCost),
          currency: row.currency || 'INR',
          isActive: true,
        },
      });
    }
    count += 1;
  }
  console.log(`Seeded ${count} system hotel rates`);
}

async function seedPlaceEdges(prisma: PrismaClient, idByKey: Map<string, string>) {
  let count = 0;
  for (const edge of SYSTEM_PLACE_EDGES) {
    const fromPlaceId = idByKey.get(edge.fromKey);
    const toPlaceId = idByKey.get(edge.toKey);
    if (!fromPlaceId || !toPlaceId) continue;
    const mode = edge.mode || 'drive';
    await prisma.placeEdge.upsert({
      where: {
        fromPlaceId_toPlaceId_mode: { fromPlaceId, toPlaceId, mode },
      },
      create: {
        fromPlaceId,
        toPlaceId,
        mode,
        distanceKm: edge.distanceKm ?? null,
        durationMin: edge.durationMin ?? null,
        roadHint: edge.roadHint ?? null,
        stopsJson: edge.stops ? (edge.stops as Prisma.InputJsonValue) : undefined,
        isSystem: true,
      },
      update: {
        distanceKm: edge.distanceKm ?? null,
        durationMin: edge.durationMin ?? null,
        roadHint: edge.roadHint ?? null,
        stopsJson: edge.stops ? (edge.stops as Prisma.InputJsonValue) : undefined,
      },
    });
    count += 1;
  }
  console.log(`Seeded ${count} place edges`);
}

async function seedPlaceKnowledge(prisma: PrismaClient, idByKey: Map<string, string>) {
  let count = 0;
  for (const row of SYSTEM_PLACE_KNOWLEDGE) {
    const placeId = idByKey.get(row.placeKey);
    if (!placeId) continue;
    const season = row.season || 'all';
    const existing = await prisma.placeKnowledge.findFirst({
      where: { placeId, season, kind: row.kind, isSystem: true },
    });
    if (existing) {
      await prisma.placeKnowledge.update({
        where: { id: existing.id },
        data: {
          title: row.title ?? null,
          body: row.body,
          metaJson: row.meta ? (row.meta as Prisma.InputJsonValue) : undefined,
        },
      });
    } else {
      await prisma.placeKnowledge.create({
        data: {
          placeId,
          season,
          kind: row.kind,
          title: row.title ?? null,
          body: row.body,
          metaJson: row.meta ? (row.meta as Prisma.InputJsonValue) : undefined,
          isSystem: true,
        },
      });
    }
    count += 1;
  }
  console.log(`Seeded ${count} place knowledge rows`);
}

async function seedAgencyPackageTemplate(prisma: PrismaClient, organizationId: string) {
  const existing = await prisma.itineraryBlock.findFirst({
    where: { organizationId, name: 'North Bengal 3N/4D hills' },
  });
  const contentJson = {
    days: [
      {
        dayNumber: 1,
        title: 'Arrive Darjeeling',
        destinationKey: 'darjeeling',
        items: [
          {
            type: 'transfer',
            title: 'Bagdogra Airport → Darjeeling',
            catalogPlaceKey: 'bagdogra-airport',
            details: { vehicle: 'Toyota Innova', seats: 6 },
          },
          {
            type: 'sightseeing',
            title: 'Mall Road evening',
            catalogPlaceKey: 'mall-road-darjeeling',
          },
        ],
      },
      {
        dayNumber: 2,
        title: 'Tiger Hill & town',
        destinationKey: 'darjeeling',
        items: [
          { type: 'sightseeing', catalogPlaceKey: 'tiger-hill' },
          { type: 'sightseeing', catalogPlaceKey: 'batasia-loop' },
        ],
      },
      {
        dayNumber: 3,
        title: 'Kalimpong views',
        destinationKey: 'kalimpong',
        items: [{ type: 'sightseeing', catalogPlaceKey: 'delo-hill' }],
      },
    ],
  } as Prisma.InputJsonValue;

  if (existing) {
    await prisma.itineraryBlock.update({
      where: { id: existing.id },
      data: { contentJson, itemType: 'package' },
    });
  } else {
    await prisma.itineraryBlock.create({
      data: {
        organizationId,
        name: 'North Bengal 3N/4D hills',
        itemType: 'package',
        contentJson,
      },
    });
  }
  console.log('Seeded agency package template: North Bengal 3N/4D hills');
}

async function migratePlaceRefs(prisma: PrismaClient) {
  const places = await prisma.place.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, key: true, kind: true },
  });
  const byName = new Map(places.map((p) => [p.name.toLowerCase(), p]));

  function toRef(raw: unknown): { placeId: string | null; name: string; kind?: string } | null {
    if (typeof raw === 'string' && raw.trim()) {
      const hit = byName.get(raw.trim().toLowerCase());
      return {
        placeId: hit?.id ?? null,
        name: hit?.name ?? raw.trim(),
        kind: hit?.kind,
      };
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'name' in raw) {
      const obj = raw as { placeId?: string | null; name?: string; kind?: string };
      if (!obj.name?.trim()) return null;
      const hit = obj.placeId
        ? places.find((p) => p.id === obj.placeId)
        : byName.get(obj.name.trim().toLowerCase());
      return {
        placeId: hit?.id ?? obj.placeId ?? null,
        name: hit?.name ?? obj.name.trim(),
        kind: hit?.kind ?? obj.kind,
      };
    }
    return null;
  }

  function migrateList(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw.map(toRef).filter(Boolean) as Array<{
      placeId: string | null;
      name: string;
      kind?: string;
    }>;
  }

  const inquiries = await prisma.inquiry.findMany({
    select: {
      id: true,
      origin: true,
      originPlaceId: true,
      destinationsJson: true,
      stopsJson: true,
    },
  });
  for (const inq of inquiries) {
    const destinations = migrateList(inq.destinationsJson);
    const stops = migrateList(inq.stopsJson);
    let originPlaceId = inq.originPlaceId;
    let origin = inq.origin;
    if (inq.origin) {
      const ref = toRef(inq.origin);
      if (ref) {
        origin = ref.name;
        originPlaceId = ref.placeId;
      }
    }
    await prisma.inquiry.update({
      where: { id: inq.id },
      data: {
        origin,
        originPlaceId,
        destinationsJson: destinations,
        stopsJson: stops,
      },
    });
  }

  const trips = await prisma.trip.findMany({
    select: { id: true, destinationsJson: true },
  });
  for (const trip of trips) {
    await prisma.trip.update({
      where: { id: trip.id },
      data: { destinationsJson: migrateList(trip.destinationsJson) },
    });
  }
  console.log(`Migrated place refs on ${inquiries.length} inquiries and ${trips.length} trips`);
}

async function seedSystemRoomTypes(prisma: PrismaClient) {
  for (const r of SYSTEM_ROOM_TYPES) {
    const existing = await prisma.roomType.findFirst({
      where: { isSystem: true, key: r.key, deletedAt: null },
    });
    if (existing) {
      await prisma.roomType.update({
        where: { id: existing.id },
        data: {
          name: r.name,
          description: r.description ?? null,
          isActive: true,
        },
      });
    } else {
      await prisma.roomType.create({
        data: {
          organizationId: null,
          name: r.name,
          key: r.key,
          description: r.description ?? null,
          isSystem: true,
          isActive: true,
        },
      });
    }
  }
  console.log(`Seeded ${SYSTEM_ROOM_TYPES.length} system room types`);
}

async function seedSystemVehicleTypes(prisma: PrismaClient) {
  for (const v of SYSTEM_VEHICLE_TYPES) {
    const existing = await prisma.vehicleType.findFirst({
      where: { isSystem: true, key: v.key, deletedAt: null },
    });
    const data = {
      name: v.name,
      description: v.description ?? null,
      seats: v.seats ?? null,
      profileJson: v.profile ? (v.profile as Prisma.InputJsonValue) : undefined,
      isActive: true,
    };
    if (existing) {
      await prisma.vehicleType.update({ where: { id: existing.id }, data });
    } else {
      await prisma.vehicleType.create({
        data: {
          organizationId: null,
          key: v.key,
          isSystem: true,
          ...data,
        },
      });
    }
  }
  console.log(`Seeded ${SYSTEM_VEHICLE_TYPES.length} system vehicle types`);
}

const DEMO_LEAD_TITLES = [
  'Goa honeymoon',
  'Kerala backwaters',
  'Manali family trip',
  'Jaipur weekend',
  'Singapore getaway',
  'Dubai shopping tour',
  'Ladakh adventure',
  'Andaman beach holiday',
  'Rishikesh rafting',
  'Udaipur palace stay',
  'Himachal road trip',
  'Kashmir tulip season',
  'Bali honeymoon',
  'Thailand islands',
  'Nepal trek',
  'Spiti valley',
  'Coorg coffee estate',
  'Ooty hill station',
  'Darjeeling tea trail',
  'Varanasi spiritual',
  'Rajasthan desert safari',
  'Meghalaya caves',
  'Sikkim monastery tour',
  'Maldives luxury',
  'Europe backpack',
  'Japan cherry blossom',
  'Vietnam food tour',
  'Sri Lanka circuit',
  'Bhutan cultural',
  'Leh bike trip',
  'Pondicherry french quarter',
  'Hampi heritage',
  'Mysore dasara',
  'Amritsar golden temple',
  'Agra taj mahal',
  'Shimla toy train',
  'Mussoorie weekend',
  'Nainital lakes',
  'Jim Corbett safari',
  'Ranthambore tiger',
  'Alleppey houseboat',
  'Munnar tea gardens',
  'Kodaikanal mist',
  'Gokarna beaches',
  'Varkala cliffs',
  'Corporate offsite Goa',
  'School trip Jaipur',
  'Wedding destination Udaipur',
  'Anniversary Kerala',
  'Friends reunion Manali',
];

const DEMO_CONTACTS = [
  'Aarav Sharma',
  'Priya Patel',
  'Rohan Mehta',
  'Ananya Gupta',
  'Vikram Singh',
  'Neha Kapoor',
  'Arjun Reddy',
  'Isha Nair',
  'Karan Malhotra',
  'Sneha Iyer',
];

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

async function seedDemoLeads(prisma: PrismaClient, organizationId: string, ownerId: string) {
  const pipeline = await prisma.pipeline.findFirst({
    where: { organizationId, isDefault: true },
    include: { stages: true },
  });
  if (!pipeline) {
    console.log('No default pipeline; skipping demo leads');
    return;
  }

  const stageByKey = Object.fromEntries(pipeline.stages.map((s) => [s.key, s]));
  const newStage = stageByKey['new'];
  if (!newStage) {
    console.log('No "new" stage; skipping demo leads');
    return;
  }

  const source = await prisma.leadSource.findFirst({
    where: { organizationId, key: 'website' },
  });

  let created = 0;
  for (let i = 0; i < DEMO_LEAD_TITLES.length; i++) {
    const idempotencyKey = `seed-scroll-lead-${String(i + 1).padStart(3, '0')}`;
    const existing = await prisma.lead.findFirst({
      where: { organizationId, idempotencyKey },
    });
    if (existing) continue;

    let stage = newStage;
    if (i >= 40 && i < 45) stage = stageByKey['attempted_contact'] ?? newStage;
    else if (i >= 45 && i < 48) stage = stageByKey['contacted'] ?? newStage;
    else if (i >= 48) stage = stageByKey['qualified'] ?? newStage;

    const contact = DEMO_CONTACTS[i % DEMO_CONTACTS.length]!;
    const first = contact.split(' ')[0]!.toLowerCase();
    await prisma.lead.create({
      data: {
        organizationId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId,
        sourceId: source?.id ?? null,
        title: DEMO_LEAD_TITLES[i]!,
        contactName: contact,
        email: `${first}.${i + 1}@example.com`,
        phone: `+91${String(9000000000 + i).slice(0, 10)}`,
        priority: PRIORITIES[i % PRIORITIES.length]!,
        idempotencyKey,
        createdBy: ownerId,
        stageHistory: {
          create: { stageId: stage.id, changedBy: ownerId, note: 'Seeded for scroll test' },
        },
      },
    });
    created += 1;
  }

  console.log(`Seeded ${created} demo leads (idempotent; ${DEMO_LEAD_TITLES.length} total keys)`);
}

const DEMO_PARTNERS = [
  {
    slug: 'seed-hotel-goa-breeze',
    name: 'Goa Breeze Resort',
    kind: 'hotel',
    city: 'Goa',
    bio: 'Beachfront boutique hotel · agency-friendly rates',
    email: 'hotel.goa@demo.travel',
  },
  {
    slug: 'seed-homestay-manali-pine',
    name: 'Manali Pine Homestay',
    kind: 'homestay',
    city: 'Manali',
    bio: 'Family homestay with mountain views',
    email: 'homestay.manali@demo.travel',
  },
  {
    slug: 'seed-farmstay-coorg-coffee',
    name: 'Coorg Coffee Farmstay',
    kind: 'farmstay',
    city: 'Coorg',
    bio: 'Estate cottages with plantation walks',
    email: 'farmstay.coorg@demo.travel',
  },
  {
    slug: 'seed-car-rental-mumbai',
    name: 'Mumbai City Cars',
    kind: 'car_rental',
    city: 'Mumbai',
    bio: 'Self-drive and chauffeured fleet',
    email: 'cars.mumbai@demo.travel',
  },
  {
    slug: 'seed-driver-delhi-fleet',
    name: 'Delhi Tempo Fleet',
    kind: 'driver',
    city: 'Delhi',
    bio: 'Innova and Tempo Traveller for tour groups',
    email: 'driver.delhi@demo.travel',
  },
  {
    slug: 'seed-restaurant-jaipur-spice',
    name: 'Jaipur Spice Thali House',
    kind: 'restaurant',
    city: 'Jaipur',
    bio: 'Group thali catering for tour operators',
    email: 'restaurant.jaipur@demo.travel',
  },
  {
    slug: 'seed-dmc-rajasthan',
    name: 'Rajasthan Ground DMC',
    kind: 'dmc',
    city: 'Jaipur',
    bio: 'Local DMC for desert and heritage circuits',
    email: 'dmc.rajasthan@demo.travel',
  },
  {
    slug: 'seed-events-jaipur',
    name: 'Jaipur Events Collective',
    kind: 'other',
    city: 'Jaipur',
    bio: 'Wedding & MICE ground support',
    email: 'events.jaipur@demo.travel',
  },
] as const;

const KIND_TO_SUPPLIER: Record<string, string> = {
  hotel: 'hotel',
  homestay: 'homestay',
  farmstay: 'farmstay',
  car_rental: 'car_rental',
  driver: 'driver',
  restaurant: 'restaurant',
  dmc: 'dmc',
  travel_agency: 'other',
  other: 'other',
};

async function ensureOrgRoles(
  prisma: PrismaClient,
  organizationId: string,
  orgKind: string = 'travel_agency',
) {
  const allPerms = await prisma.permission.findMany();
  const permByKey = Object.fromEntries(allPerms.map((p) => [p.key, p.id]));
  const roleMap =
    orgKind !== 'travel_agency' &&
    orgKind !== 'dmc' &&
    orgKind !== 'platform'
      ? PARTNER_ROLE_PERMISSION_MAP
      : ROLE_PERMISSION_MAP;
  for (const [roleKey, permKeys] of Object.entries(roleMap)) {
    // Deny-by-default role availability (P1-4): only seed roles valid for kind.
    if (!roleAllowedForOrgKind(roleKey, orgKind)) continue;
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId, key: roleKey } },
      create: {
        organizationId,
        name: roleKey.replace(/_/g, ' '),
        key: roleKey,
        isSystem: true,
      },
      update: {},
    });
    const wanted = new Set(
      permKeys.filter((k) => permByKey[k] && permissionAllowedForOrgKind(k, orgKind)),
    );
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      include: { permission: { select: { key: true } } },
    });
    for (const row of existing) {
      if (!wanted.has(row.permission.key as (typeof permKeys)[number])) {
        await prisma.rolePermission.delete({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: row.permissionId },
          },
        });
      }
    }
    for (const key of wanted) {
      const permissionId = permByKey[key];
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }
}

async function ensurePlatformRoles(prisma: PrismaClient, organizationId: string) {
  const allPerms = await prisma.permission.findMany();
  const permByKey = Object.fromEntries(allPerms.map((p) => [p.key, p.id]));
  for (const [roleKey, permKeys] of Object.entries(PLATFORM_ROLE_PERMISSION_MAP)) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId, key: roleKey } },
      create: {
        organizationId,
        name: roleKey.replace(/_/g, ' '),
        key: roleKey,
        isSystem: true,
      },
      update: {},
    });
    for (const key of permKeys) {
      const permissionId = permByKey[key];
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }
}

async function ensurePlatformAdmin(prisma: PrismaClient, password: string) {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: key },
      update: {},
    });
  }

  const email = process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@travelos.platform';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      fullName: 'Travel OS Admin',
      passwordHash,
    },
    update: { passwordHash, fullName: 'Travel OS Admin' },
  });

  let org = await prisma.organization.findUnique({ where: { slug: 'travel-os' } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Travel OS Platform',
        slug: 'travel-os',
        kind: 'platform',
        ...(await allocateSeedOrgIdentity(prisma, 'Travel OS Platform', 'travelos')),
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        brandingJson: { primaryColor: '#0f6e56', companyName: 'Travel OS' },
        settingsJson: { platform: true },
      },
    });
  } else {
    await prisma.organization.update({
      where: { id: org.id },
      data: { kind: 'platform', name: 'Travel OS Platform' },
    });
  }

  await ensurePlatformRoles(prisma, org.id);

  const membership = await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: user.id },
    },
    create: {
      organizationId: org.id,
      userId: user.id,
      isOwner: true,
    },
    update: { isOwner: true },
  });

  const role = await prisma.role.findFirst({
    where: { organizationId: org.id, key: 'platform_admin' },
  });
  if (role) {
    const existingLink = await prisma.membershipRole.findFirst({
      where: { membershipId: membership.id, roleId: role.id },
    });
    if (!existingLink) {
      await prisma.membershipRole.create({
        data: { membershipId: membership.id, roleId: role.id },
      });
    }
  }

  console.log(`Platform admin ready: ${email} (org travel-os)`);
  return { user, org };
}

/**
 * Local-part suffix used to derive a per-role demo login from an org's owner
 * email (e.g. `hotel.goa@demo.travel` → `hotel.goa.frontdesk@demo.travel`).
 * MUST stay in sync with the same map in apps/web/src/pages/LoginPage.tsx.
 */
const ROLE_EMAIL_SUFFIX: Record<string, string> = {
  owner: 'owner',
  admin: 'admin',
  sales_manager: 'sales',
  sales_executive: 'salesexec',
  travel_consultant: 'consultant',
  finance: 'finance',
  operations: 'ops',
  auditor: 'auditor',
  front_desk: 'frontdesk',
  reservation_manager: 'reservations',
  housekeeping: 'housekeeping',
  accountant: 'accountant',
};

function deriveRoleEmail(ownerEmail: string, roleKey: string): string {
  if (roleKey === 'owner') return ownerEmail;
  const [local, domain] = ownerEmail.split('@');
  return `${local}.${ROLE_EMAIL_SUFFIX[roleKey] ?? roleKey}@${domain}`;
}

/** Create one demo login per role (except owner) for a partner-style org. */
async function seedRoleStaff(
  prisma: PrismaClient,
  organizationId: string,
  ownerEmail: string,
  orgName: string,
  roleKeys: string[],
  passwordHash: string,
) {
  for (const roleKey of roleKeys) {
    if (roleKey === 'owner') continue;
    const email = deriveRoleEmail(ownerEmail, roleKey);
    const roleLabel = roleKey.replace(/_/g, ' ');
    const role = await prisma.role.findUnique({
      where: { organizationId_key: { organizationId, key: roleKey } },
    });
    if (!role) continue;
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, fullName: `${orgName} ${roleLabel}`, passwordHash },
      update: { fullName: `${orgName} ${roleLabel}`, passwordHash },
    });
    const membership = await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      create: { organizationId, userId: user.id, isOwner: false },
      update: { isActive: true },
    });
    await prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: { membershipId: membership.id, roleId: role.id },
      },
      create: { membershipId: membership.id, roleId: role.id },
      update: {},
    });
  }
}

async function seedNetworkPartners(prisma: PrismaClient) {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: key },
      update: {},
    });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let created = 0;

  for (const partner of DEMO_PARTNERS) {
    let org = await prisma.organization.findUnique({ where: { slug: partner.slug } });
    const user = await prisma.user.upsert({
      where: { email: partner.email },
      create: {
        email: partner.email,
        fullName: `${partner.name} Owner`,
        passwordHash,
      },
      update: { passwordHash, fullName: `${partner.name} Owner` },
    });

    if (!org) {
      const identity = await allocateSeedOrgIdentity(prisma, partner.name, partner.slug);
      org = await prisma.organization.create({
        data: {
          name: partner.name,
          slug: partner.slug,
          publicCode: identity.publicCode,
          subdomain: identity.subdomain,
          kind: partner.kind,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          brandingJson: { primaryColor: '#0f6e56', companyName: partner.name },
          settingsJson: { indiaReady: true },
          partnerProfile: {
            create: {
              discoverable: true,
              city: partner.city,
              country: 'India',
              bio: partner.bio,
              contactEmail: partner.email,
              contactPhone: '+919876543210',
              capacityHint: partner.kind === 'hotel' ? '40 rooms' : null,
              serviceTagsJson: [partner.kind],
            },
          },
        },
      });
      created += 1;
    } else {
      await prisma.organizationPartnerProfile.upsert({
        where: { organizationId: org.id },
        create: {
          organizationId: org.id,
          discoverable: true,
          city: partner.city,
          country: 'India',
          bio: partner.bio,
          contactEmail: partner.email,
          serviceTagsJson: [partner.kind],
        },
        update: {
          discoverable: true,
          city: partner.city,
          bio: partner.bio,
          contactEmail: partner.email,
        },
      });
      await prisma.organization.update({
        where: { id: org.id },
        data: { kind: partner.kind },
      });
    }

    await ensureOrgRoles(prisma, org.id, partner.kind);
    const ownerRole = await prisma.role.findUniqueOrThrow({
      where: { organizationId_key: { organizationId: org.id, key: 'owner' } },
    });
    const membership = await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id },
      },
      create: { organizationId: org.id, userId: user.id, isOwner: true },
      update: { isOwner: true, isActive: true },
    });
    await prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id },
      },
      create: { membershipId: membership.id, roleId: ownerRole.id },
      update: {},
    });

    // Seed one demo login per role so every role of every org is testable.
    // DMC is an Agency OS variant, so it uses the agency role set.
    const partnerRoleMap =
      partner.kind === 'dmc' ? ROLE_PERMISSION_MAP : PARTNER_ROLE_PERMISSION_MAP;
    await seedRoleStaff(
      prisma,
      org.id,
      partner.email,
      partner.name,
      Object.keys(partnerRoleMap),
      passwordHash,
    );

    // Partner-local suppliers (their own vendors)
    const localName = `${partner.name} House Vendor`;
    const existingLocal = await prisma.supplier.findFirst({
      where: { organizationId: org.id, name: localName, deletedAt: null },
    });
    if (!existingLocal) {
      await prisma.supplier.create({
        data: {
          organizationId: org.id,
          name: localName,
          type: 'other',
          email: `vendor@${partner.slug}.demo`,
          notes: 'Seeded local supplier for partner org',
        },
      });
    }

    // DMC is an Agency OS variant — CRM spine, not PartnerAsset inventory.
    if (partner.kind === 'dmc') {
      await ensureAgencyBootstrap(prisma, org.id);
      const b2bName = 'North India Tours (B2B)';
      const existingB2b = await prisma.party.findFirst({
        where: { organizationId: org.id, displayName: b2bName, deletedAt: null },
      });
      if (!existingB2b) {
        await prisma.party.create({
          data: {
            organizationId: org.id,
            type: 'organization',
            displayName: b2bName,
            email: 'buying@northindia.tours.demo',
            businessType: 'travel_agency',
            notes: 'Seeded B2B agency client for DMC OS',
          },
        });
      }
    } else {
      await ensureDefaultPartnerAsset(
        prisma,
        org.id,
        orgKindToAssetKind(partner.kind),
        partner.name,
      );
    }
  }

  console.log(`Seeded network partners (created ${created} new; ${DEMO_PARTNERS.length} total)`);
}

const AGENCY_STAFF = [
  {
    email: 'admin@demo.travel',
    fullName: 'Demo Admin',
    roleKey: 'admin',
  },
  {
    email: 'sales@demo.travel',
    fullName: 'Demo Sales Manager',
    roleKey: 'sales_manager',
  },
  {
    email: 'salesexec@demo.travel',
    fullName: 'Demo Sales Executive',
    roleKey: 'sales_executive',
  },
  {
    email: 'consultant@demo.travel',
    fullName: 'Demo Travel Consultant',
    roleKey: 'travel_consultant',
  },
  {
    email: 'finance@demo.travel',
    fullName: 'Demo Finance',
    roleKey: 'finance',
  },
  {
    email: 'ops@demo.travel',
    fullName: 'Demo Operations',
    roleKey: 'operations',
  },
  {
    email: 'auditor@demo.travel',
    fullName: 'Demo Auditor',
    roleKey: 'auditor',
  },
] as const;

async function seedAgencyStaff(
  prisma: PrismaClient,
  organizationId: string,
  passwordHash: string,
) {
  await ensureOrgRoles(prisma, organizationId);
  for (const staff of AGENCY_STAFF) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      create: {
        email: staff.email,
        fullName: staff.fullName,
        passwordHash,
      },
      update: { fullName: staff.fullName },
    });
    const membership = await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: { organizationId, userId: user.id },
      },
      create: { organizationId, userId: user.id, isOwner: false },
      update: { isActive: true },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { organizationId_key: { organizationId, key: staff.roleKey } },
    });
    await prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: { membershipId: membership.id, roleId: role.id },
      },
      create: { membershipId: membership.id, roleId: role.id },
      update: {},
    });
  }
  console.log(`Seeded ${AGENCY_STAFF.length} agency staff accounts`);
}

async function ensureAgencyBootstrap(
  prisma: PrismaClient,
  organizationId: string,
) {
  const sources = [
    { name: 'Manual', key: 'manual' },
    { name: 'Website', key: 'website' },
    { name: 'Facebook', key: 'facebook' },
    { name: 'Instagram', key: 'instagram' },
    { name: 'Google', key: 'google' },
    { name: 'CSV Import', key: 'csv' },
    { name: 'Referral', key: 'referral' },
    { name: 'Phone', key: 'phone' },
    { name: 'WhatsApp', key: 'whatsapp' },
    { name: 'Walk-in', key: 'walk_in' },
    { name: 'Existing customer', key: 'existing_customer' },
    { name: 'Unknown', key: 'unknown' },
  ];
  for (const s of sources) {
    await prisma.leadSource.upsert({
      where: { organizationId_key: { organizationId, key: s.key } },
      create: { organizationId, name: s.name, key: s.key },
      update: { name: s.name },
    });
  }

  let pipeline = await prisma.pipeline.findFirst({
    where: { organizationId, isDefault: true },
  });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        organizationId,
        name: 'Default Sales',
        isDefault: true,
        stages: {
          create: [
            { name: 'New', key: 'new', position: 1 },
            { name: 'Attempted Contact', key: 'attempted_contact', position: 2 },
            { name: 'Contacted', key: 'contacted', position: 3 },
            { name: 'Requirements Pending', key: 'requirements_pending', position: 4 },
            { name: 'Qualified', key: 'qualified', position: 5 },
            { name: 'Proposal Sent', key: 'proposal_sent', position: 6 },
            { name: 'Negotiation', key: 'negotiation', position: 7 },
            { name: 'Won', key: 'won', position: 8, isWon: true },
            { name: 'Lost', key: 'lost', position: 9, isLost: true },
          ],
        },
      },
    });
  }

  const existingCampaign = await prisma.campaign.findFirst({
    where: { organizationId, name: 'Summer Leisure 2026' },
  });
  if (!existingCampaign) {
    await prisma.campaign.create({
      data: { organizationId, name: 'Summer Leisure 2026', externalId: 'seed-summer-2026' },
    });
  }

  const templateSpecs: Array<{
    name: string;
    contentJson: Record<string, unknown>;
  }> = [
    {
      name: 'Darjeeling classic FIT',
      contentJson: {
        currency: 'INR',
        destinationHint: 'Darjeeling',
        tags: ['hill', 'family'],
        folder: 'Hill stations/Darjeeling',
        inclusions: [
          'Private transfers (IXB–Darjeeling–Kalimpong–IXB)',
          '2N Darjeeling + 1N Kalimpong on twin sharing',
          'Breakfast daily',
          'Toy train / local sightseeing as listed',
        ],
        exclusions: ['Flights', 'Lunch & dinner', 'Personal expenses', 'Monument fees'],
        terms: 'Pay 40% to confirm. Balance 7 days before travel. Rates subject to hotel availability.',
        items: [
          {
            id: 'seed-dj-t1',
            description: 'Day 1: Bagdogra Airport → Darjeeling',
            quantity: 1,
            unitCost: 3200,
            unitSell: 4000,
            taxPercent: 5,
            pricingUnit: 'per_service',
            serviceType: 'transfer',
            rateKind: 'transfer',
            details: {
              fromPlaceName: 'Bagdogra (IXB)',
              toPlaceName: 'Darjeeling',
              vehicleLabel: 'Sedan',
              vehicles: 1,
              priceSource: 'manual',
            },
          },
          {
            id: 'seed-dj-h1',
            description: 'Day 1–3: Darjeeling boutique stay',
            quantity: 2,
            unitCost: 4500,
            unitSell: 5400,
            taxPercent: 5,
            pricingUnit: 'per_room',
            serviceType: 'hotel',
            rateKind: 'hotel',
            details: {
              placeName: 'Darjeeling',
              propertyName: 'Heritage boutique hotel',
              roomType: 'Deluxe mountain view',
              mealPlan: 'CP',
              nights: 2,
              rooms: 1,
              priceSource: 'manual',
            },
          },
          {
            id: 'seed-dj-a1',
            description: 'Day 2: Tiger Hill sunrise + local sightseeing',
            quantity: 2,
            unitCost: 800,
            unitSell: 1200,
            taxPercent: 5,
            pricingUnit: 'per_person',
            serviceType: 'activity',
            details: {
              placeName: 'Darjeeling',
              privateOrSic: 'private',
              priceSource: 'manual',
            },
          },
          {
            id: 'seed-dj-t2',
            description: 'Day 3: Darjeeling → Kalimpong',
            quantity: 1,
            unitCost: 2800,
            unitSell: 3500,
            taxPercent: 5,
            pricingUnit: 'per_service',
            serviceType: 'transfer',
            rateKind: 'transfer',
            details: {
              fromPlaceName: 'Darjeeling',
              toPlaceName: 'Kalimpong',
              vehicleLabel: 'Sedan',
              vehicles: 1,
              priceSource: 'manual',
            },
          },
          {
            id: 'seed-dj-h2',
            description: 'Day 3–4: Kalimpong boutique stay',
            quantity: 1,
            unitCost: 4200,
            unitSell: 5200,
            taxPercent: 5,
            pricingUnit: 'per_room',
            serviceType: 'hotel',
            rateKind: 'hotel',
            details: {
              placeName: 'Kalimpong',
              propertyName: 'Hillside boutique hotel',
              roomType: 'Deluxe',
              mealPlan: 'CP',
              nights: 1,
              rooms: 1,
              priceSource: 'manual',
            },
          },
          {
            id: 'seed-dj-t3',
            description: 'Day 4: Kalimpong → Bagdogra Airport',
            quantity: 1,
            unitCost: 3000,
            unitSell: 3800,
            taxPercent: 5,
            pricingUnit: 'per_service',
            serviceType: 'transfer',
            rateKind: 'transfer',
            details: {
              fromPlaceName: 'Kalimpong',
              toPlaceName: 'Bagdogra (IXB)',
              vehicleLabel: 'Sedan',
              vehicles: 1,
              priceSource: 'manual',
            },
          },
        ],
      },
    },
    {
      name: 'Goa beach FIT',
      contentJson: {
        currency: 'INR',
        destinationHint: 'Goa',
        tags: ['beach', 'honeymoon'],
        folder: 'Beach/Goa',
        inclusions: [
          'Airport transfers (GOI)',
          '3N North Goa hotel on twin sharing',
          'Breakfast daily',
          'Half-day North Goa sightseeing',
        ],
        exclusions: ['Flights', 'Water sports', 'Lunch & dinner', 'Personal expenses'],
        terms: 'Pay 50% to confirm. Balance before check-in. Peak-season supplements may apply.',
        items: [
          {
            id: 'seed-goa-t1',
            description: 'Arrival: Goa Airport → North Goa hotel',
            quantity: 1,
            unitCost: 1800,
            unitSell: 2400,
            taxPercent: 5,
            pricingUnit: 'per_service',
            serviceType: 'transfer',
            rateKind: 'transfer',
            details: {
              fromPlaceName: 'Goa Airport (GOI)',
              toPlaceName: 'Calangute',
              vehicleLabel: 'Sedan',
              vehicles: 1,
              priceSource: 'manual',
            },
          },
          {
            id: 'seed-goa-h1',
            description: '3N North Goa beach hotel',
            quantity: 3,
            unitCost: 5500,
            unitSell: 7200,
            taxPercent: 5,
            pricingUnit: 'per_room',
            serviceType: 'hotel',
            rateKind: 'hotel',
            details: {
              placeName: 'Calangute',
              propertyName: 'Beach resort',
              roomType: 'Superior sea view',
              mealPlan: 'CP',
              nights: 3,
              rooms: 1,
              priceSource: 'manual',
            },
          },
          {
            id: 'seed-goa-a1',
            description: 'North Goa half-day sightseeing',
            quantity: 2,
            unitCost: 900,
            unitSell: 1400,
            taxPercent: 5,
            pricingUnit: 'per_person',
            serviceType: 'activity',
            details: {
              placeName: 'North Goa',
              privateOrSic: 'private',
              priceSource: 'manual',
            },
          },
          {
            id: 'seed-goa-t2',
            description: 'Departure: North Goa hotel → Goa Airport',
            quantity: 1,
            unitCost: 1800,
            unitSell: 2400,
            taxPercent: 5,
            pricingUnit: 'per_service',
            serviceType: 'transfer',
            rateKind: 'transfer',
            details: {
              fromPlaceName: 'Calangute',
              toPlaceName: 'Goa Airport (GOI)',
              vehicleLabel: 'Sedan',
              vehicles: 1,
              priceSource: 'manual',
            },
          },
        ],
      },
    },
    {
      name: 'Classic FIT quote',
      contentJson: {
        currency: 'INR',
        destinationHint: null,
        inclusions: ['Stay', 'Breakfast', 'Airport transfer'],
        exclusions: ['Flights', 'Personal expenses'],
        terms: 'Pay 50% to confirm. Balance before travel.',
        items: [],
      },
    },
  ];

  for (const spec of templateSpecs) {
    const existing = await prisma.quoteTemplate.findFirst({
      where: { organizationId, name: spec.name, status: 'active' },
    });
    if (!existing) {
      await prisma.quoteTemplate.create({
        data: {
          organizationId,
          name: spec.name,
          contentJson: spec.contentJson,
          status: 'active',
          versionNumber: 1,
        },
      });
      continue;
    }
    // Upgrade empty meta-only seeds to priced packages when we add lines.
    const raw = existing.contentJson as { items?: unknown } | null;
    const hasItems = Array.isArray(raw?.items) && raw.items.length > 0;
    const wantsItems =
      Array.isArray(spec.contentJson.items) && (spec.contentJson.items as unknown[]).length > 0;
    if (!hasItems && wantsItems) {
      await prisma.quoteTemplate.update({
        where: { id: existing.id },
        data: { contentJson: spec.contentJson },
      });
    }
  }

  const blockName = 'Goa beach day template';
  const existingBlock = await prisma.itineraryBlock.findFirst({
    where: { organizationId, name: blockName },
  });
  if (!existingBlock) {
    await prisma.itineraryBlock.create({
      data: {
        organizationId,
        name: blockName,
        itemType: 'sightseeing',
        contentJson: {
          items: [{ title: 'Beach morning', type: 'sightseeing', durationHours: 3 }],
        },
      },
    });
  }

  return pipeline;
}

async function seedRichAgencyData(
  prisma: PrismaClient,
  organizationId: string,
  ownerId: string,
) {
  await ensureAgencyBootstrap(prisma, organizationId);

  // Parties
  const partiesSpec = [
    {
      key: 'seed-party-sneha',
      type: 'individual',
      displayName: 'Sneha Iyer',
      email: 'sneha.iyer@example.com',
      phone: '+919811122233',
    },
    {
      key: 'seed-party-aarav',
      type: 'individual',
      displayName: 'Aarav Sharma',
      email: 'aarav.sharma@example.com',
      phone: '+919822233344',
    },
    {
      key: 'seed-party-acme',
      type: 'organization',
      displayName: 'Acme Corp Travel Desk',
      email: 'travel@acme.example.com',
      phone: '+912240001111',
      businessType: 'corporate',
    },
  ] as const;

  const parties: Record<string, string> = {};
  for (const p of partiesSpec) {
    let party = await prisma.party.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        email: p.email,
      },
    });
    if (!party) {
      party = await prisma.party.create({
        data: {
          organizationId,
          type: p.type,
          displayName: p.displayName,
          email: p.email,
          phone: p.phone,
          businessType: 'businessType' in p ? p.businessType : null,
          creditLimit: p.type === 'organization' ? new Prisma.Decimal(500000) : null,
          paymentTerms: p.type === 'organization' ? 'Net 30' : null,
          notes: 'Seeded demo client',
          metadataJson: { seedKey: p.key },
          createdBy: ownerId,
          contacts: {
            create: {
              fullName: p.displayName,
              email: p.email,
              phone: p.phone,
              title: p.type === 'organization' ? 'Travel manager' : 'Primary',
              isPrimary: true,
            },
          },
          addresses: {
            create: {
              label: 'primary',
              line1: '12 MG Road',
              city: 'Bengaluru',
              state: 'KA',
              postalCode: '560001',
              country: 'IN',
            },
          },
        },
      });
    }
    parties[p.key] = party.id;
  }

  // Local + network-linked suppliers
  const hotelOrg = await prisma.organization.findUnique({
    where: { slug: 'seed-hotel-goa-breeze' },
  });
  const driverOrg = await prisma.organization.findUnique({
    where: { slug: 'seed-driver-delhi-fleet' },
  });

  async function ensureSupplier(input: {
    name: string;
    type: string;
    linkedOrganizationId?: string | null;
    linkedAssetId?: string | null;
    placeId?: string | null;
    email?: string | null;
    phone?: string | null;
    profileJson?: Prisma.InputJsonValue;
  }) {
    const email =
      input.email ||
      `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@suppliers.demo`;
    const phone = input.phone || '+919900011122';
    if (input.linkedOrganizationId) {
      const linked = await prisma.supplier.findFirst({
        where: {
          organizationId,
          linkedOrganizationId: input.linkedOrganizationId,
          deletedAt: null,
        },
      });
      if (linked) {
        return prisma.supplier.update({
          where: { id: linked.id },
          data: {
            type: input.type,
            placeId: input.placeId ?? linked.placeId,
            email: input.email ?? linked.email ?? email,
            phone: input.phone ?? linked.phone ?? phone,
            profileJson: input.profileJson ?? linked.profileJson ?? undefined,
            ...(input.linkedAssetId !== undefined
              ? { linkedAssetId: input.linkedAssetId }
              : {}),
          },
        });
      }
    }
    const byName = await prisma.supplier.findFirst({
      where: { organizationId, name: input.name, deletedAt: null },
    });
    if (byName) {
      return prisma.supplier.update({
        where: { id: byName.id },
        data: {
          type: input.type,
          placeId: input.placeId ?? byName.placeId,
          email: input.email ?? byName.email ?? email,
          phone: input.phone ?? byName.phone ?? phone,
          profileJson: input.profileJson ?? byName.profileJson ?? undefined,
          ...(input.linkedAssetId !== undefined
            ? { linkedAssetId: input.linkedAssetId }
            : {}),
        },
      });
    }
    return prisma.supplier.create({
      data: {
        organizationId,
        name: input.name,
        type: input.type,
        email,
        phone,
        notes: 'Seeded supplier',
        linkedOrganizationId: input.linkedOrganizationId || null,
        linkedAssetId: input.linkedAssetId || null,
        placeId: input.placeId || null,
        profileJson: input.profileJson,
      },
    });
  }

  const localActivity = await ensureSupplier({
    name: 'SpiceJet Activities Desk',
    type: 'activity',
  });
  const hotelSupplier = hotelOrg
    ? await ensureSupplier({
        name: hotelOrg.name,
        type: KIND_TO_SUPPLIER[hotelOrg.kind] || 'hotel',
        linkedOrganizationId: hotelOrg.id,
      })
    : localActivity;
  const driverSupplier = driverOrg
    ? await ensureSupplier({
        name: driverOrg.name,
        type: KIND_TO_SUPPLIER[driverOrg.kind] || 'driver',
        linkedOrganizationId: driverOrg.id,
        linkedAssetId: (
          await prisma.partnerAsset.findFirst({
            where: {
              organizationId: driverOrg.id,
              deletedAt: null,
              isActive: true,
              assetKind: { in: ['driver', 'vehicle'] },
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          })
        )?.id ?? null,
      })
    : localActivity;

  if (hotelOrg) {
    await prisma.orgRelationship.upsert({
      where: {
        fromOrganizationId_toOrganizationId: {
          fromOrganizationId: organizationId,
          toOrganizationId: hotelOrg.id,
        },
      },
      create: {
        fromOrganizationId: organizationId,
        toOrganizationId: hotelOrg.id,
        status: 'preferred',
        notes: 'Seeded preferred hotel partner',
        createdBy: ownerId,
        updatedBy: ownerId,
      },
      update: { status: 'preferred' },
    });
  }
  if (driverOrg) {
    await prisma.orgRelationship.upsert({
      where: {
        fromOrganizationId_toOrganizationId: {
          fromOrganizationId: organizationId,
          toOrganizationId: driverOrg.id,
        },
      },
      create: {
        fromOrganizationId: organizationId,
        toOrganizationId: driverOrg.id,
        status: 'following',
        createdBy: ownerId,
        updatedBy: ownerId,
      },
      update: { status: 'following' },
    });
  }

  // Lead activities on first few leads (+ SLA demo timestamps)
  const sampleLeads = await prisma.lead.findMany({
    where: { organizationId, idempotencyKey: { startsWith: 'seed-scroll-lead-' } },
    take: 5,
    orderBy: { createdAt: 'asc' },
  });
  const slaNow = Date.now();
  for (let i = 0; i < sampleLeads.length; i++) {
    const lead = sampleLeads[i]!;
    const created = new Date(slaNow - (i + 2) * 24 * 3_600_000);
    const followUpAt =
      i === 0
        ? new Date(slaNow - 12 * 3_600_000)
        : i === 1
          ? new Date(slaNow + 24 * 3_600_000)
          : null;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { createdAt: created, followUpAt },
    });
  }
  for (const lead of sampleLeads) {
    const existingAct = await prisma.activity.findFirst({
      where: { leadId: lead.id, type: 'note', body: { contains: 'Seed note' } },
    });
    const refreshed = await prisma.lead.findUnique({ where: { id: lead.id } });
    const touchAt = new Date(
      (refreshed?.createdAt.getTime() ?? slaNow) + 4 * 3_600_000,
    );
    if (!existingAct) {
      await prisma.activity.create({
        data: {
          organizationId,
          leadId: lead.id,
          type: 'note',
          body: 'Seed note: client asked for beach-facing rooms.',
          createdBy: ownerId,
          createdAt: touchAt,
        },
      });
      await prisma.activity.create({
        data: {
          organizationId,
          leadId: lead.id,
          type: 'call',
          body: 'Seed call logged — 8 minutes discovery.',
          createdBy: ownerId,
          createdAt: new Date(touchAt.getTime() + 30 * 60_000),
        },
      });
    } else {
      await prisma.activity.updateMany({
        where: { leadId: lead.id, body: { contains: 'Seed' } },
        data: { createdAt: touchAt },
      });
    }
  }

  // Backdate first quote on INQ-SEED-02 chain so median lead→quote is non-null
  const inq02 = await prisma.inquiry.findFirst({
    where: { organizationId, inquiryNumber: 'INQ-SEED-02' },
    select: { id: true, leadId: true },
  });
  if (inq02?.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: inq02.leadId } });
    if (lead) {
      const trip = await prisma.trip.findFirst({
        where: { inquiryId: inq02.id, deletedAt: null },
        select: { id: true },
      });
      if (trip) {
        const quoteAt = new Date(lead.createdAt.getTime() + 36 * 3_600_000);
        await prisma.quotation.updateMany({
          where: { tripId: trip.id },
          data: { createdAt: quoteAt },
        });
      }
    }
  }

  // Inquiries
  async function ensureInquiry(input: {
    number: string;
    partyKey: string;
    status: string;
    titleDest: string;
    leadIndex?: number;
  }) {
    let inquiry = await prisma.inquiry.findUnique({
      where: {
        organizationId_inquiryNumber: {
          organizationId,
          inquiryNumber: input.number,
        },
      },
    });
    if (inquiry) return inquiry;
    const lead =
      input.leadIndex != null ? sampleLeads[input.leadIndex] : undefined;
    inquiry = await prisma.inquiry.create({
      data: {
        organizationId,
        inquiryNumber: input.number,
        partyId: parties[input.partyKey],
        leadId: lead?.id ?? null,
        ownerId,
        status: input.status,
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
        origin: 'Bengaluru',
        destinationsJson: [input.titleDest],
        startDate: new Date('2026-09-10'),
        endDate: new Date('2026-09-15'),
        nights: 5,
        adults: 2,
        children: 1,
        budgetAmount: new Prisma.Decimal(120000),
        budgetCurrency: 'INR',
        hotelCategory: '4 star',
        meals: 'breakfast',
        transportPref: 'private cab',
        flightsRequired: true,
        createdBy: ownerId,
        statusHistory: {
          create: { status: input.status, changedBy: ownerId, note: 'Seeded' },
        },
      },
    });
    return inquiry;
  }

  const inqOpen = await ensureInquiry({
    number: 'INQ-SEED-01',
    partyKey: 'seed-party-aarav',
    status: 'open',
    titleDest: 'Manali',
    leadIndex: 0,
  });
  const inqConverted = await ensureInquiry({
    number: 'INQ-SEED-02',
    partyKey: 'seed-party-sneha',
    status: 'converted',
    titleDest: 'Goa',
    leadIndex: 1,
  });
  await ensureInquiry({
    number: 'INQ-SEED-03',
    partyKey: 'seed-party-acme',
    status: 'qualified',
    titleDest: 'Jaipur',
  });

  // Trips across statuses — each gets travellers + itinerary days + quotation
  async function placeRef(key: string) {
    const p = await prisma.place.findFirst({
      where: { key, isSystem: true, deletedAt: null },
    });
    if (!p) return { placeId: null as string | null, name: key, kind: 'city' };
    return { placeId: p.id, name: p.name, kind: p.kind };
  }

  const manali = await placeRef('manali');
  const goa = await placeRef('goa');
  const delhi = await placeRef('delhi');
  const darjeeling = await placeRef('darjeeling');
  const kalimpong = await placeRef('kalimpong');
  const jaipur = await placeRef('jaipur');
  const tigerHill = await placeRef('tiger-hill');
  const batasia = await placeRef('batasia-loop');
  const mallRoad = await placeRef('mall-road-darjeeling');
  const deloHill = await placeRef('delo-hill');
  const bagdogra = await placeRef('bagdogra-airport');

  const darjeelingHeritageHotel = await ensureSupplier({
    name: 'Darjeeling Heritage Lodge',
    type: 'hotel',
    placeId: darjeeling.placeId,
    phone: '+919831100101',
    profileJson: {
      description:
        'Boutique mountain rooms with views that make evenings feel special.',
      imageUrl:
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
      imageUrls: [
        'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=800&q=80',
      ],
      amenities: ['WiFi', 'Breakfast', 'Mountain view', 'Parking', 'Hot water'],
      roomHints: ['Deluxe mountain view', 'Heritage suite'],
      capacityHint: '24 rooms · groups OK',
      stars: 3,
      googleRating: 4.4,
      googleReviewCount: 312,
      googleMapsUrl: 'https://maps.google.com/?q=Darjeeling+Heritage+Lodge',
      reviewSnippet: 'Warm staff and excellent Kanchenjunga views at sunrise.',
      checkIn: '2:00 PM',
      checkOut: '11:00 AM',
      distanceHint: '500m from Mall Road',
    },
  });

  const DARJEELING_HERITAGE_ROOMS = [
    {
      name: 'Deluxe mountain view',
      roomTypeKey: 'deluxe_mountain_view',
      maxOccupancy: 2,
      baseQuantity: 12,
      allotmentStart: '2026-04-01',
      allotmentEnd: '2026-12-31',
    },
    {
      name: 'Heritage suite',
      roomTypeKey: 'heritage_suite',
      maxOccupancy: 3,
      baseQuantity: 4,
      allotmentStart: '2026-04-01',
      allotmentEnd: '2026-12-31',
    },
  ] as const;

  await ensureSupplierLinkedStayInventory(prisma, {
    organizationId,
    supplierId: darjeelingHeritageHotel.id,
    supplierName: darjeelingHeritageHotel.name,
    placeId: darjeeling.placeId,
    profileJson: darjeelingHeritageHotel.profileJson as Prisma.InputJsonValue,
    createdBy: ownerId,
    roomProducts: [...DARJEELING_HERITAGE_ROOMS],
  });

  const darjeelingHeritageContractTitle = 'FY26 FIT — Darjeeling Heritage Lodge';
  let darjeelingHeritageContract = await prisma.supplierContract.findFirst({
    where: {
      organizationId,
      supplierId: darjeelingHeritageHotel.id,
      title: darjeelingHeritageContractTitle,
      deletedAt: null,
    },
  });
  if (!darjeelingHeritageContract) {
    darjeelingHeritageContract = await prisma.supplierContract.create({
      data: {
        organizationId,
        supplierId: darjeelingHeritageHotel.id,
        title: darjeelingHeritageContractTitle,
        status: 'active',
        versionNumber: 1,
        effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
        effectiveUntil: new Date('2026-12-31T00:00:00.000Z'),
        preferred: true,
        paymentTerms: 'Net 15',
        cancellationTerms:
          'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours.',
        cancellationPolicyJson: {
          text: 'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours.',
          rules: [
            { beforeHours: 168, chargeType: 'PERCENTAGE', chargeValue: 0 },
            { beforeHours: 72, chargeType: 'PERCENTAGE', chargeValue: 50 },
            { beforeHours: 24, chargeType: 'PERCENTAGE', chargeValue: 100 },
          ],
          noShowChargePercentage: 100,
        },
        blackoutJson: [{ from: '2026-12-21', to: '2026-12-26' }],
        stopSaleJson: [],
        notes: 'Seeded demo contract — blackout Christmas week; stop-sale via inventory.',
        createdBy: ownerId,
      },
    });
  } else {
    darjeelingHeritageContract = await prisma.supplierContract.update({
      where: { id: darjeelingHeritageContract.id },
      data: {
        status: 'active',
        versionNumber: 1,
        preferred: true,
        cancellationTerms:
          'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours.',
        cancellationPolicyJson: {
          text: 'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours.',
          rules: [
            { beforeHours: 168, chargeType: 'PERCENTAGE', chargeValue: 0 },
            { beforeHours: 72, chargeType: 'PERCENTAGE', chargeValue: 50 },
            { beforeHours: 24, chargeType: 'PERCENTAGE', chargeValue: 100 },
          ],
          noShowChargePercentage: 100,
        },
      },
    });
  }
  await ensureSupplier({
    name: 'Kalimpong Orchid Retreat',
    type: 'hotel',
    placeId: kalimpong.placeId,
    phone: '+919831100102',
    profileJson: {
      description: 'Garden-facing suites with space to unwind after the hills.',
      imageUrl:
        'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
      imageUrls: [
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      ],
      amenities: ['WiFi', 'Garden', 'Home-style meals', 'Fireplace'],
      roomHints: ['Garden view room', 'Orchid cottage'],
      capacityHint: '18 rooms',
      stars: 3,
      googleRating: 4.6,
      googleReviewCount: 148,
      checkIn: '1:00 PM',
      checkOut: '11:00 AM',
      distanceHint: 'Near Deolo Hill road',
    },
  });
  await ensureSupplier({
    name: 'Mayfair Spa Resort Gangtok',
    type: 'hotel',
    placeId: (await placeRef('gangtok')).placeId,
    phone: '+919831100103',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
      amenities: ['Spa', 'WiFi', 'Restaurant', 'Valley view', 'Conference'],
      roomHints: ['Deluxe valley view', 'Spa suite'],
      capacityHint: '60 rooms',
      stars: 5,
      googleRating: 4.7,
      googleReviewCount: 890,
      checkIn: '2:00 PM',
      checkOut: '12:00 PM',
      distanceHint: '10 min from MG Marg',
    },
  });
  await ensureSupplier({
    name: 'Siliguri Transit Inn',
    type: 'hotel',
    placeId: (await placeRef('siliguri')).placeId,
    phone: '+919831100104',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80',
      amenities: ['WiFi', 'Airport desk', 'Parking', 'Early check-in'],
      roomHints: ['Standard twin', 'Family room'],
      capacityHint: '40 rooms · layover friendly',
      stars: 2,
      googleRating: 3.9,
      googleReviewCount: 210,
      checkIn: '12:00 PM',
      checkOut: '10:00 AM',
      distanceHint: '20 min to Bagdogra Airport',
    },
  });
  await ensureSupplier({
    name: 'Windamere Hotel Ridge',
    type: 'hotel',
    placeId: darjeeling.placeId,
    phone: '+919831100105',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80',
      amenities: ['Heritage lounge', 'WiFi', 'Library', 'Garden'],
      roomHints: ['Colonial suite', 'Ridge view deluxe'],
      capacityHint: '32 rooms',
      stars: 4,
      googleRating: 4.5,
      googleReviewCount: 620,
      checkIn: '2:00 PM',
      checkOut: '11:00 AM',
      distanceHint: 'On Observatory Hill ridge',
      reviewSnippet: 'Old-world charm with impeccable afternoon tea.',
    },
  });
  await ensureSupplier({
    name: 'Goa Breeze Beach Resort',
    type: 'hotel',
    placeId: goa.placeId,
    phone: '+919831100106',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80',
      imageUrls: [
        'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
      ],
      amenities: ['Pool', 'Beach access', 'WiFi', 'Bar', 'Spa'],
      roomHints: ['Sea view deluxe', 'Garden cottage'],
      capacityHint: '48 rooms',
      stars: 4,
      googleRating: 4.3,
      googleReviewCount: 1104,
      checkIn: '3:00 PM',
      checkOut: '11:00 AM',
      distanceHint: 'Calangute beachfront',
    },
  });

  // Homestays
  await ensureSupplier({
    name: 'Lepcha Family Homestay',
    type: 'homestay',
    placeId: kalimpong.placeId,
    phone: '+919831100201',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
      amenities: ['Home kitchen', 'WiFi', 'Garden', 'Local host'],
      roomHints: ['Family room', 'Attic twin'],
      capacityHint: '6 rooms · host meals included',
      stars: 0,
      googleRating: 4.8,
      googleReviewCount: 64,
      checkIn: '1:00 PM',
      checkOut: '10:00 AM',
      distanceHint: 'Quiet lane above bazaar',
      reviewSnippet: 'Authentic Lepcha hospitality and incredible local food.',
    },
  });
  await ensureSupplier({
    name: 'Mall Road Nest Homestay',
    type: 'homestay',
    placeId: darjeeling.placeId,
    phone: '+919831100202',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
      amenities: ['WiFi', 'Shared lounge', 'Kitchenette', 'City view'],
      roomHints: ['Cozy double', 'Triple loft'],
      capacityHint: '4 rooms',
      googleRating: 4.5,
      googleReviewCount: 91,
      checkIn: '2:00 PM',
      checkOut: '11:00 AM',
      distanceHint: '3 min walk to Mall Road',
    },
  });
  await ensureSupplier({
    name: 'Manali Cedar Homestay',
    type: 'homestay',
    placeId: manali.placeId,
    phone: '+919831100203',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80',
      amenities: ['Fireplace', 'WiFi', 'Mountain view', 'Parking'],
      roomHints: ['Cedar loft', 'Valley double'],
      capacityHint: '5 rooms',
      googleRating: 4.7,
      googleReviewCount: 128,
      checkIn: '1:00 PM',
      checkOut: '10:00 AM',
      distanceHint: 'Old Manali side',
    },
  });

  // Farmstays
  await ensureSupplier({
    name: 'Teesta Valley Farmstay',
    type: 'farmstay',
    placeId: kalimpong.placeId,
    phone: '+919831100301',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
      imageUrls: [
        'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=800&q=80',
      ],
      amenities: ['Organic meals', 'Farm walk', 'WiFi', 'Campfire'],
      roomHints: ['Cottage', 'Farm loft'],
      capacityHint: '8 cottages · nature groups OK',
      googleRating: 4.9,
      googleReviewCount: 47,
      checkIn: '12:00 PM',
      checkOut: '10:00 AM',
      distanceHint: 'Teesta riverside farm',
      reviewSnippet: 'Kids loved the farm animals and evening campfire.',
    },
  });
  await ensureSupplier({
    name: 'Orange Grove Farmstay',
    type: 'farmstay',
    placeId: (await placeRef('gangtok')).placeId,
    phone: '+919831100302',
    profileJson: {
      imageUrl:
        'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=80',
      amenities: ['Orchard tour', 'Home meals', 'WiFi', 'Pet-friendly'],
      roomHints: ['Grove cabin', 'Family cottage'],
      capacityHint: '6 cottages',
      googleRating: 4.6,
      googleReviewCount: 38,
      checkIn: '1:00 PM',
      checkOut: '11:00 AM',
      distanceHint: 'East Sikkim orange belt',
    },
  });

  // Drivers
  await ensureSupplier({
    name: 'Ramesh Hill Taxi',
    type: 'driver',
    placeId: darjeeling.placeId,
    phone: '+919831100401',
    email: 'ramesh.hilltaxi@suppliers.demo',
    profileJson: {
      licenceNumber: 'WB-78-2019-004512',
      licenceExpiry: '2028-06-30',
      languages: ['Nepali', 'Hindi', 'English'],
      serviceAreas: ['Darjeeling', 'Kalimpong', 'Bagdogra', 'Gangtok'],
      emergencyContact: '+919831100499',
      verificationStatus: 'verified',
    },
  });
  await ensureSupplier({
    name: 'Sonam Sikkim Driver',
    type: 'driver',
    placeId: (await placeRef('gangtok')).placeId,
    phone: '+919831100402',
    profileJson: {
      licenceNumber: 'SK-01-2020-118822',
      licenceExpiry: '2027-11-15',
      languages: ['Nepali', 'English', 'Bhutia'],
      serviceAreas: ['Gangtok', 'Pelling', 'Lachung', 'Bagdogra'],
      emergencyContact: '+919831100498',
      verificationStatus: 'verified',
    },
  });
  await ensureSupplier({
    name: 'Delhi Airport Cab Partner',
    type: 'driver',
    placeId: delhi.placeId,
    phone: '+919831100403',
    profileJson: {
      licenceNumber: 'DL-0420110012345',
      licenceExpiry: '2029-01-31',
      languages: ['Hindi', 'English'],
      serviceAreas: ['Delhi NCR', 'Agra day trip', 'Jaipur'],
      emergencyContact: '+919831100497',
      verificationStatus: 'pending',
    },
  });

  // Fleet / restaurant / guide / activity / DMC
  await ensureSupplier({
    name: 'North Bengal Fleet Rentals',
    type: 'car_rental',
    placeId: (await placeRef('siliguri')).placeId,
    phone: '+919831100501',
    profileJson: {
      fleetHint: '18 sedans · 10 Innovas · 4 tempo travellers',
      vehicleTypes: ['Sedan', 'Innova', 'Tempo Traveller', 'SUV'],
      routesServed: 'Siliguri, Darjeeling, Kalimpong, Gangtok, Pelling',
      permitNotes: 'Sikkim inner-line permits arranged on request',
      parkingTollPolicy: 'Parking + tolls billed at actuals',
    },
  });
  const northBengalFleet = await prisma.supplier.findFirst({
    where: {
      organizationId,
      name: 'North Bengal Fleet Rentals',
      deletedAt: null,
    },
  });
  if (northBengalFleet) {
    const fleetContractTitle = 'FY26 FIT — North Bengal Fleet corridors';
    let fleetContract = await prisma.supplierContract.findFirst({
      where: {
        organizationId,
        supplierId: northBengalFleet.id,
        title: fleetContractTitle,
        deletedAt: null,
      },
    });
    if (!fleetContract) {
      fleetContract = await prisma.supplierContract.create({
        data: {
          organizationId,
          supplierId: northBengalFleet.id,
          title: fleetContractTitle,
          status: 'active',
          versionNumber: 1,
          effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
          effectiveUntil: new Date('2027-03-31T00:00:00.000Z'),
          preferred: true,
          paymentTerms: 'Net 7',
          // Soft blackout: Durga Puja week — manual rate OK.
          blackoutJson: [{ from: '2026-10-10', to: '2026-10-16' }],
          // Hard closing: monsoon landslide week — resolve blocks.
          stopSaleJson: [{ from: '2026-07-15', to: '2026-07-22' }],
          notes:
            'Seeded fleet contract — soft blackout Puja week; hard stop-sale mid-July closing.',
          createdBy: ownerId,
        },
      });
    } else if (
      !fleetContract.blackoutJson ||
      !fleetContract.stopSaleJson ||
      fleetContract.status !== 'active'
    ) {
      await prisma.supplierContract.update({
        where: { id: fleetContract.id },
        data: {
          status: 'active',
          blackoutJson: [{ from: '2026-10-10', to: '2026-10-16' }],
          stopSaleJson: [{ from: '2026-07-15', to: '2026-07-22' }],
        },
      });
    }

    // Supplier-owned corridor chart (prefer over system catalog when quoting this fleet).
    const innova = await prisma.vehicleType.findFirst({
      where: {
        key: 'suv-innova',
        isSystem: true,
        organizationId: null,
        deletedAt: null,
      },
      select: { id: true },
    });
    const siliguriPlace = await placeRef('siliguri');
    const darjeelingPlace = await placeRef('darjeeling');
    const bagdograPlace = await placeRef('bagdogra-airport');
    if (innova) {
      const fleetCorridors = [
        {
          fromPlaceId: siliguriPlace.placeId,
          toPlaceId: darjeelingPlace.placeId,
          unitCost: 3600,
        },
        {
          fromPlaceId: bagdograPlace.placeId,
          toPlaceId: darjeelingPlace.placeId,
          unitCost: 4100,
        },
      ] as const;
      for (const corridor of fleetCorridors) {
        const existingFare = await prisma.transferFare.findFirst({
          where: {
            organizationId,
            supplierId: northBengalFleet.id,
            fromPlaceId: corridor.fromPlaceId,
            toPlaceId: corridor.toPlaceId,
            vehicleTypeId: innova.id,
            deletedAt: null,
          },
        });
        if (existingFare) {
          await prisma.transferFare.update({
            where: { id: existingFare.id },
            data: {
              unitCost: new Prisma.Decimal(corridor.unitCost),
              isActive: true,
              isSystem: false,
            },
          });
        } else {
          await prisma.transferFare.create({
            data: {
              organizationId,
              supplierId: northBengalFleet.id,
              isSystem: false,
              fromPlaceId: corridor.fromPlaceId,
              toPlaceId: corridor.toPlaceId,
              vehicleTypeId: innova.id,
              unitCost: new Prisma.Decimal(corridor.unitCost),
              pricingMode: 'per_vehicle',
              currency: 'INR',
              isActive: true,
              createdBy: ownerId,
            },
          });
        }
      }
    }
  }
  await ensureSupplier({
    name: 'Glenarys Bakery Dining',
    type: 'restaurant',
    placeId: darjeeling.placeId,
    phone: '+919831100601',
    profileJson: {
      cuisine: 'Bakery, Continental, Indian',
      mealPeriods: ['Breakfast', 'Lunch', 'Tea', 'Dinner'],
      menuType: 'a_la_carte',
      seatingCapacity: 120,
      openingHours: '08:00–21:00',
      vegNonVeg: 'both',
      reservationLeadHours: 2,
      photos: [
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
      ],
    },
  });
  await ensureSupplier({
    name: 'Kunga Restaurant Gangtok',
    type: 'restaurant',
    placeId: (await placeRef('gangtok')).placeId,
    phone: '+919831100602',
    profileJson: {
      cuisine: 'Tibetan, Nepali',
      mealPeriods: ['Lunch', 'Dinner'],
      menuType: 'a_la_carte',
      seatingCapacity: 60,
      openingHours: '11:00–21:30',
      vegNonVeg: 'both',
      photos: [
        'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80',
      ],
    },
  });
  await ensureSupplier({
    name: 'Pemayangtse Trek Guide',
    type: 'guide',
    placeId: (await placeRef('gangtok')).placeId,
    phone: '+919831100701',
    profileJson: {
      languages: ['English', 'Nepali', 'Hindi'],
      destinations: ['Gangtok', 'Pelling', 'Yuksom', 'Dzongri'],
      specialties: ['Monastery tours', 'Nature walks', 'Photography'],
      verificationStatus: 'verified',
    },
  });
  const tigerHillSunriseDesk = await ensureSupplier({
    name: 'Tiger Hill Sunrise Desk',
    type: 'activity',
    placeId: tigerHill.placeId,
    phone: '+919831100801',
    profileJson: {
      activitiesOffered: ['Sunrise viewpoint', 'Photo stop', 'Tea stop'],
      durationHint: '3–4 hours early morning',
      privateOrSic: 'both',
      capacity: 12,
      inclusions: ['Pickup Mall Road', 'Viewpoint entry assist'],
      safetyNotes: 'Warm layers required; roads may be foggy',
    },
  });
  await ensureSupplier({
    name: 'North Bengal Ground DMC',
    type: 'dmc',
    placeId: darjeeling.placeId,
    phone: '+919831100901',
    profileJson: {
      destinationsServed: 'Darjeeling, Kalimpong, Gangtok, Pelling, Dooars',
      serviceCategories: 'Hotels, Transport, Activities, Guides, Permits',
      markets: 'FIT, small groups, MICE soft',
      emergencyContact: '+919831100900',
      bookingSlaHint: 'Confirmations within 4 business hours',
    },
  });

  // Enrich linked network partners if present
  if (hotelOrg) {
    await ensureSupplier({
      name: hotelOrg.name,
      type: KIND_TO_SUPPLIER[hotelOrg.kind] || 'hotel',
      linkedOrganizationId: hotelOrg.id,
      placeId: goa.placeId,
      profileJson: {
        imageUrl:
          'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=1200&q=80',
        amenities: ['Pool', 'WiFi', 'Restaurant', 'Beach shuttle'],
        roomHints: ['Ocean deluxe', 'Pool view'],
        capacityHint: '72 rooms',
        stars: 4,
        googleRating: 4.2,
        checkIn: '3:00 PM',
        checkOut: '11:00 AM',
        distanceHint: 'North Goa',
      },
    });
  }
  if (driverOrg) {
    await ensureSupplier({
      name: driverOrg.name,
      type: KIND_TO_SUPPLIER[driverOrg.kind] || 'driver',
      linkedOrganizationId: driverOrg.id,
      linkedAssetId: (
        await prisma.partnerAsset.findFirst({
          where: {
            organizationId: driverOrg.id,
            deletedAt: null,
            isActive: true,
            assetKind: { in: ['driver', 'vehicle'] },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id ?? null,
      placeId: delhi.placeId,
      profileJson: {
        licenceNumber: 'DL-FLEET-SEED-001',
        licenceExpiry: '2028-12-31',
        languages: ['Hindi', 'English', 'Punjabi'],
        serviceAreas: ['Delhi NCR', 'Agra', 'Jaipur'],
        emergencyContact: '+919900022233',
        verificationStatus: 'verified',
      },
    });
  }

  const spiceJetActivitiesDesk = await ensureSupplier({
    name: 'SpiceJet Activities Desk',
    type: 'activity',
    placeId: goa.placeId,
    profileJson: {
      activitiesOffered: ['Water sports desk', 'Sunset cruise booking'],
      durationHint: 'Half day / evening',
      privateOrSic: 'sic',
      capacity: 40,
      inclusions: ['Life jackets', 'Instructor'],
      safetyNotes: 'Weather-dependent; age limits apply',
    },
  });

  async function ensureAgencyHotelRate(input: {
    supplierId: string;
    placeId?: string | null;
    contractId?: string | null;
    roomType: string | null;
    mealPlan: string | null;
    unitCost: number;
    weekendUnitCost?: number | null;
    startDate: string;
    endDate: string;
    occupancyPricing?: {
      baseAdults?: number;
      baseChildren?: number;
      extraAdultPerNight?: number;
      childWithBedPerNight?: number;
      childWithoutBedPerNight?: number;
      dateSupplements?: Array<{
        date?: string;
        from?: string;
        to?: string;
        amount: number;
        label?: string;
      }>;
    } | null;
  }) {
    const existing = await prisma.supplierHotelRate.findFirst({
      where: {
        organizationId,
        supplierId: input.supplierId,
        roomType: input.roomType,
        mealPlan: input.mealPlan,
        startDate: new Date(input.startDate),
        deletedAt: null,
        isSystem: false,
      },
    });
    const data = {
      placeId: input.placeId || null,
      ...(input.contractId !== undefined
        ? { contractId: input.contractId }
        : {}),
      unitCost: new Prisma.Decimal(input.unitCost),
      weekendUnitCost:
        input.weekendUnitCost != null
          ? new Prisma.Decimal(input.weekendUnitCost)
          : null,
      endDate: new Date(input.endDate),
      currency: 'INR',
      isActive: true,
      ...(input.occupancyPricing !== undefined
        ? {
            occupancyPricingJson:
              input.occupancyPricing == null
                ? Prisma.JsonNull
                : (input.occupancyPricing as Prisma.InputJsonValue),
          }
        : {}),
    };
    if (existing) {
      await prisma.supplierHotelRate.update({
        where: { id: existing.id },
        data,
      });
      return;
    }
    await prisma.supplierHotelRate.create({
      data: {
        organizationId,
        supplierId: input.supplierId,
        isSystem: false,
        roomType: input.roomType,
        mealPlan: input.mealPlan,
        startDate: new Date(input.startDate),
        createdBy: ownerId,
        ...data,
      },
    });
  }

  const heritageOccupancy = {
    baseAdults: 2,
    baseChildren: 0,
    extraAdultPerNight: 1500,
    childWithBedPerNight: 1000,
    childWithoutBedPerNight: 500,
  };

  const heritageWinterOccupancy = {
    ...heritageOccupancy,
    dateSupplements: [
      {
        date: '2026-12-24',
        amount: 2500,
        label: 'Christmas Eve gala',
      },
      {
        date: '2026-12-31',
        amount: 3500,
        label: 'New Year Eve gala',
      },
    ],
  };

  await ensureAgencyHotelRate({
    supplierId: darjeelingHeritageHotel.id,
    placeId: darjeeling.placeId,
    contractId: darjeelingHeritageContract.id,
    roomType: 'Deluxe mountain view',
    mealPlan: 'MAP',
    unitCost: 4500,
    weekendUnitCost: 5200,
    startDate: '2026-04-01',
    endDate: '2026-06-30',
    occupancyPricing: heritageOccupancy,
  });
  await ensureAgencyHotelRate({
    supplierId: darjeelingHeritageHotel.id,
    placeId: darjeeling.placeId,
    contractId: darjeelingHeritageContract.id,
    roomType: 'Deluxe mountain view',
    mealPlan: 'MAP',
    unitCost: 5200,
    weekendUnitCost: 6000,
    startDate: '2026-10-01',
    endDate: '2026-12-20',
    occupancyPricing: heritageOccupancy,
  });
  await ensureAgencyHotelRate({
    supplierId: darjeelingHeritageHotel.id,
    placeId: darjeeling.placeId,
    contractId: darjeelingHeritageContract.id,
    roomType: 'Deluxe mountain view',
    mealPlan: 'MAP',
    unitCost: 6500,
    weekendUnitCost: 7500,
    startDate: '2026-12-21',
    endDate: '2027-01-05',
    occupancyPricing: heritageWinterOccupancy,
  });
  await ensureAgencyHotelRate({
    supplierId: darjeelingHeritageHotel.id,
    placeId: darjeeling.placeId,
    contractId: darjeelingHeritageContract.id,
    roomType: 'Heritage suite',
    mealPlan: 'CP',
    unitCost: 6800,
    weekendUnitCost: 7500,
    startDate: '2026-04-01',
    endDate: '2026-12-20',
  });

  async function ensureAgencyActivityRate(input: {
    supplierId: string;
    placeId?: string | null;
    activityName: string;
    privateOrSic?: 'private' | 'sic' | null;
    adultUnitCost: number;
    childUnitCost?: number | null;
    childAgeMin?: number | null;
    childAgeMax?: number | null;
    startDate: string;
    endDate: string;
  }) {
    const activityKey = input.activityName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const existing = await prisma.supplierActivityRate.findFirst({
      where: {
        organizationId,
        supplierId: input.supplierId,
        activityKey,
        privateOrSic: input.privateOrSic ?? null,
        startDate: new Date(input.startDate),
        deletedAt: null,
      },
    });
    const data = {
      placeId: input.placeId || null,
      activityName: input.activityName,
      activityKey,
      privateOrSic: input.privateOrSic ?? null,
      adultUnitCost: new Prisma.Decimal(input.adultUnitCost),
      childUnitCost:
        input.childUnitCost != null
          ? new Prisma.Decimal(input.childUnitCost)
          : null,
      childAgeMin: input.childAgeMin ?? null,
      childAgeMax: input.childAgeMax ?? null,
      endDate: new Date(input.endDate),
      currency: 'INR',
      isActive: true,
    };
    if (existing) {
      await prisma.supplierActivityRate.update({
        where: { id: existing.id },
        data,
      });
      return;
    }
    await prisma.supplierActivityRate.create({
      data: {
        organizationId,
        supplierId: input.supplierId,
        startDate: new Date(input.startDate),
        createdBy: ownerId,
        ...data,
      },
    });
  }

  await ensureAgencyActivityRate({
    supplierId: tigerHillSunriseDesk.id,
    placeId: tigerHill.placeId,
    activityName: 'Tiger Hill sunrise',
    privateOrSic: 'private',
    adultUnitCost: 1800,
    childUnitCost: 900,
    childAgeMin: 0,
    childAgeMax: 11,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });
  await ensureAgencyActivityRate({
    supplierId: tigerHillSunriseDesk.id,
    placeId: tigerHill.placeId,
    activityName: 'Tiger Hill sunrise',
    privateOrSic: 'sic',
    adultUnitCost: 950,
    childUnitCost: 500,
    childAgeMin: 0,
    childAgeMax: 11,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });
  await ensureAgencyActivityRate({
    supplierId: spiceJetActivitiesDesk.id,
    placeId: goa.placeId,
    activityName: 'Sunset cruise',
    privateOrSic: 'sic',
    adultUnitCost: 2200,
    childUnitCost: 1400,
    childAgeMin: 3,
    childAgeMax: 12,
    startDate: '2026-04-01',
    endDate: '2026-10-31',
  });

  const heritageRatesBackfilled = await backfillHotelRateRoomProducts(
    prisma,
    organizationId,
  );
  if (heritageRatesBackfilled) {
    console.log(
      `Backfilled roomProductId on ${heritageRatesBackfilled} Darjeeling Heritage hotel rate(s)`,
    );
  }

  async function ensureTrip(input: {
    number: string;
    title: string;
    status: string;
    partyKey: string;
    inquiryId?: string;
    destinations: Array<{ placeId: string | null; name: string; kind?: string }>;
    startDate: string;
    endDate: string;
  }) {
    let trip = await prisma.trip.findUnique({
      where: {
        organizationId_tripNumber: { organizationId, tripNumber: input.number },
      },
    });
    if (trip) {
      trip = await prisma.trip.update({
        where: { id: trip.id },
        data: {
          destinationsJson: input.destinations,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          updatedBy: ownerId,
        },
      });
      return trip;
    }
    trip = await prisma.trip.create({
      data: {
        organizationId,
        tripNumber: input.number,
        title: input.title,
        status: input.status,
        partyId: parties[input.partyKey],
        inquiryId: input.inquiryId ?? null,
        ownerId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        destinationsJson: input.destinations,
        createdBy: ownerId,
        updatedBy: ownerId,
      },
    });
    return trip;
  }

  function quoteTotals(
    items: Array<{ quantity: number; unitCost: number; unitSell: number; taxPercent: number }>,
  ) {
    let costTotal = 0;
    let sellSubtotal = 0;
    let taxTotal = 0;
    for (const item of items) {
      costTotal += item.quantity * item.unitCost;
      const lineSell = item.quantity * item.unitSell;
      sellSubtotal += lineSell;
      taxTotal += (lineSell * item.taxPercent) / 100;
    }
    const sellTotal = sellSubtotal + taxTotal;
    const marginAmount = sellSubtotal - costTotal;
    const marginPercent = sellSubtotal === 0 ? 0 : (marginAmount / sellSubtotal) * 100;
    return {
      costTotal: Math.round(costTotal * 100) / 100,
      sellTotal: Math.round(sellTotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      discountTotal: 0,
      marginAmount: Math.round(marginAmount * 100) / 100,
      marginPercent: Math.round(marginPercent * 100) / 100,
    };
  }

  async function ensureTravellers(
    tripId: string,
    people: Array<{
      email: string;
      fullName: string;
      type: string;
      phone?: string;
      isLead?: boolean;
      passportNumber?: string;
    }>,
  ) {
    for (const person of people) {
      let traveller = await prisma.traveller.findFirst({
        where: { organizationId, email: person.email },
      });
      if (!traveller) {
        traveller = await prisma.traveller.create({
          data: {
            organizationId,
            fullName: person.fullName,
            email: person.email,
            phone: person.phone ?? null,
            type: person.type,
            passportNumber: person.passportNumber ?? null,
            nationality: 'IN',
            createdBy: ownerId,
            updatedBy: ownerId,
          },
        });
      }
      await prisma.tripTraveller.upsert({
        where: {
          tripId_travellerId: { tripId, travellerId: traveller.id },
        },
        create: {
          tripId,
          travellerId: traveller.id,
          isLead: Boolean(person.isLead),
        },
        update: { isLead: Boolean(person.isLead) },
      });
    }
  }

  async function ensureItinerary(
    tripId: string,
    input: {
      label: string;
      status: string;
      days: unknown[];
      story?: Record<string, unknown>;
      /** When true, overwrite latest version content (idempotent demo refresh). */
      refresh?: boolean;
    },
  ) {
    const contentJson = {
      days: input.days,
      ...(input.story ? { story: input.story } : {}),
    };
    let itinerary = await prisma.itinerary.findFirst({ where: { tripId } });
    if (!itinerary) {
      await prisma.itinerary.create({
        data: {
          organizationId,
          tripId,
          title: 'Main itinerary',
          versions: {
            create: {
              versionNumber: 1,
              label: input.label,
              status: input.status,
              contentJson,
              createdBy: ownerId,
            },
          },
        },
      });
      return;
    }
    const latest = await prisma.itineraryVersion.findFirst({
      where: { itineraryId: itinerary.id },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latest) {
      await prisma.itineraryVersion.create({
        data: {
          itineraryId: itinerary.id,
          versionNumber: 1,
          label: input.label,
          status: input.status,
          contentJson,
          createdBy: ownerId,
        },
      });
      return;
    }
    const content = latest.contentJson as { days?: unknown[] } | null;
    const empty = !Array.isArray(content?.days) || content.days.length === 0;
    if (empty || input.refresh) {
      await prisma.itineraryVersion.update({
        where: { id: latest.id },
        data: {
          label: input.label,
          status: input.status,
          contentJson,
        },
      });
    }
  }

  async function ensureQuotation(
    tripId: string,
    input: {
      quoteNumber: string;
      label: string;
      status: string;
      items: Array<{
        id: string;
        description: string;
        quantity: number;
        unitCost: number;
        unitSell: number;
        taxPercent: number;
        pricingUnit: string;
      }>;
      inclusions?: string;
      exclusions?: string;
      terms?: string;
      accepted?: boolean;
      refresh?: boolean;
    },
  ) {
    const totals = quoteTotals(input.items);
    const existing = await prisma.quotation.findFirst({
      where: { tripId, quoteNumber: input.quoteNumber },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (existing) {
      const latest = existing.versions[0];
      if (latest && input.refresh) {
        await prisma.quotationVersion.update({
          where: { id: latest.id },
          data: {
            label: input.label,
            status: input.status,
            itemsJson: input.items,
            inclusions: input.inclusions ?? null,
            exclusions: input.exclusions ?? null,
            terms: input.terms ?? null,
            ...totals,
            acceptedAt: input.accepted ? latest.acceptedAt ?? new Date() : null,
          },
        });
      }
      return existing;
    }
    return prisma.quotation.create({
      data: {
        organizationId,
        tripId,
        quoteNumber: input.quoteNumber,
        versions: {
          create: {
            versionNumber: 1,
            label: input.label,
            status: input.status,
            currency: 'INR',
            itemsJson: input.items,
            inclusions: input.inclusions ?? null,
            exclusions: input.exclusions ?? null,
            terms: input.terms ?? null,
            ...totals,
            acceptedAt: input.accepted ? new Date() : null,
            createdBy: ownerId,
          },
        },
      },
    });
  }

  const tripPlanning = await ensureTrip({
    number: 'TRP-SEED-01',
    title: 'Manali family draft',
    status: 'planning',
    partyKey: 'seed-party-aarav',
    inquiryId: inqOpen.id,
    destinations: [manali],
    startDate: '2026-10-05',
    endDate: '2026-10-10',
  });
  const tripConfirmed = await ensureTrip({
    number: 'TRP-SEED-02',
    title: 'Darjeeling honeymoon confirmed',
    status: 'confirmed',
    partyKey: 'seed-party-sneha',
    inquiryId: inqConverted.id,
    destinations: [darjeeling, kalimpong],
    startDate: '2026-10-05',
    endDate: '2026-10-10',
  });
  const tripOps = await ensureTrip({
    number: 'TRP-SEED-03',
    title: 'Corporate offsite — hotel enquiry',
    status: 'booking_in_progress',
    partyKey: 'seed-party-acme',
    destinations: [darjeeling],
    startDate: '2026-11-12',
    endDate: '2026-11-15',
  });
  const tripNorthBengal = await ensureTrip({
    number: 'TRP-SEED-04',
    title: 'North Bengal hills package',
    status: 'quoted',
    partyKey: 'seed-party-aarav',
    destinations: [darjeeling, kalimpong],
    startDate: '2026-12-01',
    endDate: '2026-12-06',
  });

  await ensureTravellers(tripPlanning.id, [
    {
      email: 'aarav.lead@example.com',
      fullName: 'Aarav Sharma',
      type: 'adult',
      phone: '+919876543210',
      isLead: true,
      passportNumber: 'M9988776',
    },
    {
      email: 'anaya.child@example.com',
      fullName: 'Anaya Sharma',
      type: 'child',
      isLead: false,
    },
  ]);
  await ensureTravellers(tripConfirmed.id, [
    {
      email: 'sneha.traveller@example.com',
      fullName: 'Sneha Iyer',
      type: 'adult',
      phone: '+919811122233',
      isLead: true,
      passportNumber: 'Z1234567',
    },
    {
      email: 'rahul.partner@example.com',
      fullName: 'Rahul Iyer',
      type: 'adult',
      phone: '+919811122244',
      isLead: false,
      passportNumber: 'Z7654321',
    },
  ]);
  await ensureTravellers(tripOps.id, [
    {
      email: 'ops.lead@acme.example.com',
      fullName: 'Priya Menon',
      type: 'adult',
      phone: '+919900112233',
      isLead: true,
    },
    {
      email: 'ops.member2@acme.example.com',
      fullName: 'Karan Malhotra',
      type: 'adult',
      isLead: false,
    },
    {
      email: 'ops.member3@acme.example.com',
      fullName: 'Neha Gupta',
      type: 'adult',
      isLead: false,
    },
  ]);
  await ensureTravellers(tripNorthBengal.id, [
    {
      email: 'northbengal.lead@example.com',
      fullName: 'Dev Patel',
      type: 'adult',
      phone: '+919712345678',
      isLead: true,
      passportNumber: 'N4455667',
    },
    {
      email: 'northbengal.spouse@example.com',
      fullName: 'Meera Patel',
      type: 'adult',
      isLead: false,
    },
  ]);

  await ensureItinerary(tripPlanning.id, {
    label: 'Draft',
    status: 'draft',
    refresh: true,
    days: [
      {
        id: 'seed-manali-d1',
        dayNumber: 1,
        title: 'Arrive Manali',
        date: '2026-10-05',
        destination: manali,
        items: [
          {
            id: 'seed-manali-i1',
            type: 'transfer',
            title: 'Pickup from Bhuntar',
            startTime: '14:00',
            endTime: '16:00',
            location: manali,
            customerVisible: true,
            details: {},
          },
          {
            id: 'seed-manali-i2',
            type: 'hotel',
            title: 'Check-in riverside stay',
            startTime: '16:30',
            location: manali,
            customerVisible: true,
            details: {},
          },
        ],
      },
      {
        id: 'seed-manali-d2',
        dayNumber: 2,
        title: 'Solang Valley',
        date: '2026-10-06',
        destination: manali,
        items: [
          {
            id: 'seed-manali-i3',
            type: 'sightseeing',
            title: 'Solang adventure morning',
            startTime: '09:00',
            endTime: '13:00',
            location: manali,
            customerVisible: true,
            details: {},
          },
          {
            id: 'seed-manali-i4',
            type: 'meal',
            title: 'Lunch at local café',
            startTime: '13:30',
            location: manali,
            customerVisible: true,
            details: {},
          },
        ],
      },
      {
        id: 'seed-manali-d3',
        dayNumber: 3,
        title: 'Old Manali leisure',
        date: '2026-10-07',
        destination: manali,
        items: [
          {
            id: 'seed-manali-i5',
            type: 'free_time',
            title: 'Café hopping & Mall Road',
            startTime: '10:00',
            endTime: '17:00',
            location: manali,
            customerVisible: true,
            details: {},
          },
        ],
      },
    ],
  });

  await ensureItinerary(tripConfirmed.id, {
    label: 'Seed v1',
    status: 'published',
    refresh: true,
    days: [
      {
        id: 'seed-goa-d1',
        dayNumber: 1,
        title: 'Arrival Goa',
        date: '2026-09-10',
        destination: goa,
        items: [
          {
            id: 'seed-item-1',
            type: 'transfer',
            title: 'Airport pickup',
            startTime: '12:00',
            endTime: '13:00',
            location: goa,
            customerVisible: true,
            details: {},
          },
          {
            id: 'seed-item-2',
            type: 'hotel',
            title: 'Check-in Goa Breeze',
            startTime: '14:00',
            location: goa,
            customerVisible: true,
            details: {},
          },
        ],
      },
      {
        id: 'seed-goa-d2',
        dayNumber: 2,
        title: 'Beach day',
        date: '2026-09-11',
        destination: goa,
        items: [
          {
            id: 'seed-item-3',
            type: 'sightseeing',
            title: 'North Goa sightseeing',
            startTime: '09:30',
            endTime: '16:00',
            location: goa,
            customerVisible: true,
            details: {},
          },
          {
            id: 'seed-item-4',
            type: 'meal',
            title: 'Seafood dinner',
            startTime: '20:00',
            location: goa,
            customerVisible: true,
            details: {},
          },
        ],
      },
      {
        id: 'seed-goa-d3',
        dayNumber: 3,
        title: 'Transit via Delhi',
        date: '2026-09-15',
        destination: delhi,
        items: [
          {
            id: 'seed-item-5',
            type: 'flight',
            title: 'GOI → DEL',
            startTime: '10:00',
            endTime: '12:30',
            location: delhi,
            customerVisible: true,
            details: {},
          },
        ],
      },
    ],
  });

  await ensureItinerary(tripOps.id, {
    label: 'Ops draft',
    status: 'draft',
    refresh: true,
    days: [
      {
        id: 'seed-ops-d1',
        dayNumber: 1,
        title: 'Team arrival',
        date: '2026-11-12',
        destination: goa,
        items: [
          {
            id: 'seed-ops-i1',
            type: 'transfer',
            title: 'Coach from airport',
            startTime: '11:00',
            endTime: '12:30',
            location: goa,
            customerVisible: true,
            details: {},
          },
          {
            id: 'seed-ops-i2',
            type: 'hotel',
            title: 'Resort check-in',
            startTime: '13:00',
            location: goa,
            customerVisible: true,
            details: {},
          },
          {
            id: 'seed-ops-i3',
            type: 'meal',
            title: 'Welcome dinner',
            startTime: '19:30',
            location: goa,
            customerVisible: true,
            details: {},
          },
        ],
      },
      {
        id: 'seed-ops-d2',
        dayNumber: 2,
        title: 'Offsite day',
        date: '2026-11-13',
        destination: goa,
        items: [
          {
            id: 'seed-ops-i4',
            type: 'sightseeing',
            title: 'Strategy workshop',
            startTime: '09:00',
            endTime: '17:00',
            location: goa,
            customerVisible: true,
            details: {},
          },
        ],
      },
    ],
  });

  await ensureItinerary(tripNorthBengal.id, {
    label: 'Quoted package',
    status: 'draft',
    refresh: true,
    story: {
      headline: 'Escape to the Himalayas',
      tagline:
        'Experience breathtaking sunrises, tea gardens and peaceful mountain towns.',
      bestTime: 'December – March',
      heroImageUrl:
        'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=1400&q=80',
      highlights: [
        'Watch sunrise from Tiger Hill',
        'Stay in boutique mountain hotels',
        'Private sightseeing throughout',
        'Tea garden experience in Darjeeling',
        'Peaceful Kalimpong interludes',
        'Family-friendly pacing',
      ],
      packingTips: [],
      packingCategories: {
        clothing: ['Warm jacket', 'Walking shoes', 'Layered tops'],
        electronics: ['Power bank', 'Camera / phone charger'],
        documents: ['Identity card', 'Trip confirmation'],
        medicine: ['Personal medicines', 'Basic first-aid'],
      },
      weatherNote: 'Crisp mornings around 4–10°C in Dec–Jan; pack layers for Tiger Hill.',
      cancellationNote:
        'Free date change up to 15 days before arrival. Cancellation within 7 days follows hotel rules; deposits may be adjusted toward a future trip.',
      paymentSchedule: [
        { label: 'Today', percent: 40, amountHint: 'To confirm' },
        { label: '15 days before travel', percent: 60, amountHint: 'Balance' },
      ],
      faqs: [
        {
          question: 'Is breakfast included?',
          answer: 'Yes — CP (breakfast) at both hotels.',
        },
        {
          question: 'What vehicle do we get?',
          answer: 'Private Toyota Innova (6 seater) with driver, fuel, toll and parking.',
        },
        {
          question: 'Suitable for parents?',
          answer: 'Yes — moderate walking; early Tiger Hill start is optional for elders.',
        },
      ],
      consultantNote:
        'Excited to host your family in the hills — ping us anytime on WhatsApp to lock dates.',
    },
    days: [
      {
        id: 'seed-nb-d1',
        dayNumber: 1,
        title: 'Darjeeling arrival',
        date: '2026-12-01',
        destination: darjeeling,
        items: [
          {
            id: 'seed-nb-i1',
            type: 'transfer',
            title: 'Bagdogra Airport → Darjeeling',
            description: 'Scenic climb into the hills with your private driver waiting at arrivals.',
            startTime: '13:00',
            endTime: '16:30',
            location: darjeeling,
            customerVisible: true,
            details: {
              vehicle: 'Toyota Innova',
              seats: 6,
              includes: ['AC', 'Luggage', 'Driver included'],
              driveDuration: '3h 30m',
              from: 'Bagdogra Airport',
              to: 'Darjeeling',
              fromPlaceId: bagdogra.placeId,
              toPlaceId: darjeeling.placeId,
            },
          },
          {
            id: 'seed-nb-i2',
            type: 'hotel',
            title: 'Heritage stay check-in',
            description: 'Boutique mountain rooms with views that make evenings feel special.',
            startTime: '17:00',
            location: darjeeling,
            customerVisible: true,
            details: {
              nights: 2,
              roomType: 'Deluxe mountain view',
              stars: 4,
              supplierId: darjeelingHeritageHotel.id,
              googleRating: 4.5,
              googleReviewCount: 1287,
              distanceHint: '500m from Mall Road',
              amenities: ['WiFi', 'Breakfast', 'Mountain view', 'Parking'],
              checkIn: '2:00 PM',
              checkOut: '11:00 AM',
              googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Darjeeling+Mall+Road+hotel',
              reviewSnippet:
                '“Rooms were spotless and waking up to the mountains felt unforgettable.”',
              imageUrl:
                'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
              imageUrls: [
                'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1000&q=80',
                'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1000&q=80',
              ],
            },
          },
          {
            id: 'seed-nb-i2b',
            type: 'meal',
            title: 'Welcome breakfast next morning',
            description: 'Start slow with coffee and Kanchenjunga light through the window.',
            startTime: '08:00',
            location: darjeeling,
            customerVisible: true,
            details: {},
          },
        ],
      },
      {
        id: 'seed-nb-d2',
        dayNumber: 2,
        title: 'Tiger Hill & town',
        date: '2026-12-02',
        destination: darjeeling,
        items: [
          {
            id: 'seed-nb-i3',
            type: 'sightseeing',
            title: 'Tiger Hill sunrise',
            description: 'Watch the first sunlight touch Kanchenjunga — the moment this trip is built around.',
            startTime: '04:00',
            endTime: '07:00',
            location: darjeeling,
            notes: 'Carry a jacket — it is cold before sunrise.',
            customerVisible: true,
            details: {
              catalogPlaceId: tigerHill.placeId,
              catalogProvenance: 'destination_guide',
              bestVisitTime: 'Arrive by 4:45 AM for clear Kanchenjunga colour',
              googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tiger+Hill+Darjeeling',
              reviewSnippet: '“Worth every shivering minute — the peaks lit up like fire.”',
              imageUrl:
                'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1000&q=80',
              imageUrls: [
                'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=80',
                'https://images.unsplash.com/photo-1483728642387-6c3bdd4aa93d?auto=format&fit=crop&w=1000&q=80',
              ],
            },
          },
          {
            id: 'seed-nb-i3b',
            type: 'meal',
            title: 'Breakfast at hotel',
            description: 'Warm up back at the hotel after the early start.',
            startTime: '08:00',
            location: darjeeling,
            customerVisible: true,
            details: {},
          },
          {
            id: 'seed-nb-i4',
            type: 'sightseeing',
            title: 'Batasia Loop',
            description:
              'A spiraling railway loop with war memorial gardens and panoramic valley views.',
            startTime: '10:00',
            endTime: '12:30',
            location: darjeeling,
            customerVisible: true,
            details: {
              catalogPlaceId: batasia.placeId,
              catalogProvenance: 'destination_guide',
              bestVisitTime: 'Late morning after sunrise, or with toy-train timing',
              googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Batasia+Loop+Darjeeling',
              reviewSnippet: '“Loved the gardens and the toy-train spiral — easy for the family.”',
              imageUrl:
                'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1000&q=80',
              imageUrls: [
                'https://images.unsplash.com/photo-1564890369028-9c2f7359a1f6?auto=format&fit=crop&w=1000&q=80',
              ],
            },
          },
          {
            id: 'seed-nb-i4b',
            type: 'sightseeing',
            title: 'Mall Road evening',
            description: 'Cafés, strolls, and Chowrasta square as the town lights come on.',
            startTime: '17:00',
            endTime: '19:00',
            location: darjeeling,
            customerVisible: true,
            details: {
              catalogPlaceId: mallRoad.placeId,
              catalogProvenance: 'destination_guide',
              bestVisitTime: 'Late afternoon into evening for the promenade buzz',
              googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mall+Road+Darjeeling',
              imageUrl:
                'https://images.unsplash.com/photo-1582972236019-ea4af5ffe587?auto=format&fit=crop&w=1000&q=80',
            },
          },
        ],
      },
      {
        id: 'seed-nb-d3',
        dayNumber: 3,
        title: 'Transfer to Kalimpong',
        date: '2026-12-03',
        destination: kalimpong,
        items: [
          {
            id: 'seed-nb-i5',
            type: 'transfer',
            title: 'Darjeeling → Kalimpong',
            description: 'A quieter drive into Kalimpong’s hillside lanes and flower nurseries.',
            startTime: '09:00',
            endTime: '12:00',
            location: kalimpong,
            customerVisible: true,
            details: {
              vehicle: 'Toyota Innova',
              seats: 6,
              includes: ['AC', 'Luggage', 'Driver included'],
              driveDuration: '2h 45m',
              from: 'Darjeeling',
              to: 'Kalimpong',
              fromPlaceId: darjeeling.placeId,
              toPlaceId: kalimpong.placeId,
            },
          },
          {
            id: 'seed-nb-i6',
            type: 'hotel',
            title: 'Kalimpong boutique stay',
            description: 'Garden-facing suites with space to unwind after the hills.',
            startTime: '13:00',
            location: kalimpong,
            customerVisible: true,
            details: {
              nights: 2,
              roomType: 'Garden suite',
              stars: 4,
              googleRating: 4.6,
              googleReviewCount: 842,
              distanceHint: 'Near Pedong Road',
              amenities: ['WiFi', 'Breakfast', 'Garden', 'Parking'],
              checkIn: '1:00 PM',
              checkOut: '11:00 AM',
              googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kalimpong+boutique+hotel',
              reviewSnippet: '“Quiet gardens, friendly hosts — a perfect contrast to busy Darjeeling.”',
              imageUrl:
                'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1000&q=80',
              imageUrls: [
                'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1000&q=80',
              ],
            },
          },
        ],
      },
      {
        id: 'seed-nb-d4',
        dayNumber: 4,
        title: 'Kalimpong leisure',
        date: '2026-12-04',
        destination: kalimpong,
        items: [
          {
            id: 'seed-nb-i7',
            type: 'sightseeing',
            title: 'Delo Hill viewpoint',
            description: 'Wide valley views and soft morning light — perfect for unhurried photos.',
            startTime: '08:00',
            endTime: '11:00',
            location: kalimpong,
            customerVisible: true,
            details: {
              catalogPlaceId: deloHill.placeId,
              catalogProvenance: 'destination_guide',
              bestVisitTime: 'Clear mornings or golden hour',
              googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Delo+Hill+Kalimpong',
              reviewSnippet: '“Soft light, quiet paths — our favourite Kalimpong morning.”',
              imageUrl:
                'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1000&q=80',
              imageUrls: [
                'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1000&q=80',
              ],
            },
          },
          {
            id: 'seed-nb-i8',
            type: 'meal',
            title: 'Home-style lunch',
            description: 'Optional café stop or leisurely lunch before free time.',
            startTime: '13:00',
            location: kalimpong,
            customerVisible: true,
            details: {},
          },
          {
            id: 'seed-nb-i9',
            type: 'transfer',
            title: 'Kalimpong → Bagdogra Airport',
            description: 'Relaxed descent to the airport with buffer time for check-in.',
            startTime: '14:00',
            endTime: '17:15',
            location: kalimpong,
            customerVisible: true,
            details: {
              vehicle: 'Toyota Innova',
              seats: 6,
              includes: ['AC', 'Luggage', 'Driver included'],
              driveDuration: '3h 15m',
            },
          },
        ],
      },
    ],
  });

  await ensureQuotation(tripPlanning.id, {
    quoteNumber: 'QT-SEED-01',
    label: 'Draft estimate',
    status: 'draft',
    refresh: true,
    items: [
      {
        id: '1',
        description: '3N Manali hotel (family room)',
        quantity: 1,
        unitCost: 18000,
        unitSell: 26000,
        taxPercent: 5,
        pricingUnit: 'per_room',
      },
      {
        id: '2',
        description: 'Cab for 3 days',
        quantity: 1,
        unitCost: 9000,
        unitSell: 13500,
        taxPercent: 5,
        pricingUnit: 'per_service',
      },
      {
        id: '3',
        description: 'Solang activity vouchers',
        quantity: 2,
        unitCost: 1500,
        unitSell: 2500,
        taxPercent: 5,
        pricingUnit: 'per_person',
      },
    ],
    inclusions: 'Stay with breakfast, local transfers',
    exclusions: 'Flights, adventure gear rental',
    terms: 'Valid 10 days',
  });

  await ensureQuotation(tripConfirmed.id, {
    quoteNumber: 'QT-SEED-02',
    label: 'Accepted seed quote',
    status: 'accepted',
    accepted: true,
    refresh: true,
    items: [
      {
        id: 'seed-qt02-hotel',
        serviceType: 'hotel',
        description: 'Darjeeling Heritage Lodge · Deluxe mountain view · MAP',
        quantity: 3,
        unitCost: 4500,
        unitSell: 5400,
        taxPercent: 5,
        pricingUnit: 'per_room',
        rateProvenance: {
          rateKind: 'hotel',
          matchSummary: 'Room matched; Active contract v1',
        },
        details: {
          supplierId: darjeelingHeritageHotel.id,
          supplierName: darjeelingHeritageHotel.name,
          propertyName: darjeelingHeritageHotel.name,
          roomType: 'Deluxe mountain view',
          mealPlan: 'MAP',
          checkIn: '2026-10-05',
          checkOut: '2026-10-08',
          nights: 3,
          rooms: 1,
        },
      },
      {
        id: 'seed-qt02-transfer',
        serviceType: 'transfer',
        description: 'Bagdogra → Darjeeling · Innova',
        quantity: 1,
        unitCost: 4100,
        unitSell: 4920,
        taxPercent: 5,
        pricingUnit: 'per_service',
        details: {
          supplierId: northBengalFleet?.id,
          supplierName: northBengalFleet?.name || 'North Bengal Fleet Rentals',
          fromPlaceId: bagdogra.placeId,
          toPlaceId: darjeeling.placeId,
          fromPlaceName: 'Bagdogra Airport',
          toPlaceName: 'Darjeeling',
          vehicleTypeName: 'Innova',
          serviceDate: '2026-10-05',
          vehicles: 1,
        },
      },
      {
        id: 'seed-qt02-activity',
        serviceType: 'activity',
        description: 'Tiger Hill sunrise',
        quantity: 2,
        unitCost: 900,
        unitSell: 1200,
        taxPercent: 5,
        pricingUnit: 'per_person',
        details: {
          supplierId: tigerHillSunriseDesk.id,
          supplierName: tigerHillSunriseDesk.name,
          activityName: 'Tiger Hill sunrise',
          placeId: tigerHill.placeId,
          placeName: 'Tiger Hill',
          serviceDate: '2026-10-06',
          privateOrSic: 'private',
          adults: 2,
          children: 0,
        },
      },
      {
        id: '3',
        description: 'Sightseeing cab',
        quantity: 1,
        unitCost: 4000,
        unitSell: 6500,
        taxPercent: 5,
        pricingUnit: 'per_service',
      },
    ],
    inclusions: 'Stay with breakfast, transfers',
    exclusions: 'Flights, lunches',
    terms: '50% advance',
  });

  await ensureQuotation(tripOps.id, {
    quoteNumber: 'QT-SEED-03',
    label: 'Corporate package',
    status: 'accepted',
    accepted: true,
    refresh: true,
    items: [
      {
        id: '1',
        description: 'Resort rooms (12 pax / 3N)',
        quantity: 6,
        unitCost: 8000,
        unitSell: 12000,
        taxPercent: 5,
        pricingUnit: 'per_room',
      },
      {
        id: '2',
        description: 'Conference hall + AV',
        quantity: 2,
        unitCost: 15000,
        unitSell: 22000,
        taxPercent: 18,
        pricingUnit: 'per_service',
      },
      {
        id: '3',
        description: 'Group transfers',
        quantity: 1,
        unitCost: 12000,
        unitSell: 18000,
        taxPercent: 5,
        pricingUnit: 'per_service',
      },
    ],
    inclusions: 'Stay MAP, hall, airport coach',
    exclusions: 'Flights, alcohol',
    terms: 'Net 15 for corporate account',
  });

  await ensureQuotation(tripNorthBengal.id, {
    quoteNumber: 'QT-SEED-04',
    label: 'Pending client review',
    status: 'sent',
    refresh: true,
    items: [
      {
        id: '1',
        description: 'Darjeeling 2N boutique stay',
        quantity: 1,
        unitCost: 14000,
        unitSell: 21000,
        taxPercent: 5,
        pricingUnit: 'per_room',
      },
      {
        id: '2',
        description: 'Kalimpong 2N stay',
        quantity: 1,
        unitCost: 11000,
        unitSell: 16500,
        taxPercent: 5,
        pricingUnit: 'per_room',
      },
      {
        id: '3',
        description: 'Private cab circuit (4D)',
        quantity: 1,
        unitCost: 16000,
        unitSell: 24000,
        taxPercent: 5,
        pricingUnit: 'per_service',
      },
    ],
    inclusions: 'Hotel\nPrivate cab\nBreakfast\nSightseeing\nDriver\nToll\nParking',
    exclusions: 'Flights to Bagdogra\nPersonal expenses\nEntry tickets\nLunch\nDinner',
    terms: '40% to confirm; balance before travel',
  });

  // Family sharing demo on North Bengal proposal
  {
    const itinerary = await prisma.itinerary.findFirst({
      where: { tripId: tripNorthBengal.id },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const version = itinerary?.versions[0];
    if (version) {
      const demoToken = 'seed-nb-family-share';
      const demoFamilyPin = '482916';
      const familyPinHash = await bcrypt.hash(demoFamilyPin, 10);
      let share = await prisma.itineraryShareLink.findUnique({ where: { token: demoToken } });
      if (!share) {
        share = await prisma.itineraryShareLink.create({
          data: {
            organizationId,
            tripId: tripNorthBengal.id,
            itineraryVersionId: version.id,
            token: demoToken,
            familyPinHash,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            createdBy: ownerId,
          },
        });
      } else {
        share = await prisma.itineraryShareLink.update({
          where: { id: share.id },
          data: {
            itineraryVersionId: version.id,
            revokedAt: null,
            familyPinHash,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        });
      }

      const wife = await prisma.proposalParticipant.upsert({
        where: {
          shareLinkId_viewerKey: { shareLinkId: share.id, viewerKey: 'seed-viewer-wife' },
        },
        create: {
          shareLinkId: share.id,
          viewerKey: 'seed-viewer-wife',
          displayName: 'Priya',
          relationHint: 'Spouse',
        },
        update: { displayName: 'Priya', relationHint: 'Spouse', lastSeenAt: new Date() },
      });
      const brother = await prisma.proposalParticipant.upsert({
        where: {
          shareLinkId_viewerKey: { shareLinkId: share.id, viewerKey: 'seed-viewer-brother' },
        },
        create: {
          shareLinkId: share.id,
          viewerKey: 'seed-viewer-brother',
          displayName: 'Rohan',
          relationHint: 'Sibling',
        },
        update: { displayName: 'Rohan', relationHint: 'Sibling', lastSeenAt: new Date() },
      });

      await prisma.proposalReaction.upsert({
        where: {
          shareLinkId_participantId_kind: {
            shareLinkId: share.id,
            participantId: wife.id,
            kind: 'love',
          },
        },
        create: { shareLinkId: share.id, participantId: wife.id, kind: 'love' },
        update: {},
      });
      await prisma.proposalReaction.upsert({
        where: {
          shareLinkId_participantId_kind: {
            shareLinkId: share.id,
            participantId: brother.id,
            kind: 'love',
          },
        },
        create: { shareLinkId: share.id, participantId: brother.id, kind: 'love' },
        update: {},
      });

      const existingMsgs = await prisma.proposalMessage.count({ where: { shareLinkId: share.id } });
      if (!existingMsgs) {
        await prisma.proposalMessage.createMany({
          data: [
            {
              shareLinkId: share.id,
              participantId: wife.id,
              authorRole: 'family',
              authorName: 'Priya',
              kind: 'comment',
              body: 'Love the Tiger Hill sunrise day — can elders skip the 4 AM start?',
            },
            {
              shareLinkId: share.id,
              participantId: brother.id,
              authorRole: 'family',
              authorName: 'Rohan',
              kind: 'question',
              body: 'Is the Innova big enough for 5 adults + soft bags?',
            },
            {
              shareLinkId: share.id,
              participantId: null,
              authorRole: 'agency',
              authorName: 'Demo Travel Agency',
              kind: 'answer',
              body: 'Yes — Tiger Hill is optional for elders (they can join breakfast). Innova is fine for 5 with soft luggage; we can upgrade to a tempo if you prefer.',
            },
          ],
        });
      }
      console.log(`Family share demo: /p/itinerary/${demoToken} (PIN ${demoFamilyPin})`);
    }
  }

  // unused place refs kept for possible future seed lines
  void jaipur;

  // Bookings / readiness / payments / invoices on ops trips
  for (const trip of [tripConfirmed, tripOps]) {
    const existingBookings = await prisma.bookingComponent.count({
      where: { tripId: trip.id },
    });
    if (!existingBookings) {
      if (trip.id === tripConfirmed.id) {
        const hotelLine = {
          id: 'seed-qt02-hotel',
          serviceType: 'hotel' as const,
          description: 'Darjeeling Heritage Lodge · Deluxe mountain view · MAP',
          quantity: 3,
          unitCost: 4500,
          unitSell: 5400,
          details: {
            supplierId: darjeelingHeritageHotel.id,
            propertyName: darjeelingHeritageHotel.name,
            roomType: 'Deluxe mountain view',
            mealPlan: 'MAP',
            checkIn: '2026-10-05',
            checkOut: '2026-10-08',
            nights: 3,
            rooms: 1,
          },
        };
        const { startAt, endAt } = hotelStayWindow(hotelLine.details);
        const costAmount = lineBuyTotal(hotelLine);
        const quotedAmount = lineSellTotal(hotelLine);
        const hotelBooking = await prisma.bookingComponent.create({
          data: {
            organizationId,
            tripId: trip.id,
            supplierId: darjeelingHeritageHotel.id,
            partnerAssetId: darjeelingHeritageHotel.linkedAssetId || null,
            quotationLineId: 'seed-qt02-hotel',
            type: 'hotel',
            title: hotelBookingTitle(hotelLine),
            status: 'confirmed',
            confirmationRef: 'HTL-SEED-1',
            voucherNote: 'Confirmed HTL-SEED-1 · 2026-10-05 · 2026-10-08',
            startAt,
            endAt,
            costAmount:
              costAmount != null ? new Prisma.Decimal(costAmount) : new Prisma.Decimal(13500),
            quotedAmount:
              quotedAmount != null
                ? new Prisma.Decimal(quotedAmount)
                : new Prisma.Decimal(16200),
            confirmedAmount:
              costAmount != null ? new Prisma.Decimal(costAmount) : new Prisma.Decimal(13500),
            currency: 'INR',
            requiredQuantity: new Prisma.Decimal(1),
            createdBy: ownerId,
            updatedBy: ownerId,
          },
        });
        const sr = await prisma.serviceRequest.create({
          data: {
            buyerOrganizationId: organizationId,
            supplierId: darjeelingHeritageHotel.id,
            partnerAssetId: darjeelingHeritageHotel.linkedAssetId || null,
            serviceType: 'STAY',
            title: hotelBooking.title,
            status: 'confirmed',
            tripId: trip.id,
            quotationLineId: 'seed-qt02-hotel',
            serviceStartAt: startAt,
            serviceEndAt: endAt,
            quotedAmount: hotelBooking.quotedAmount,
            agreedAmount: hotelBooking.confirmedAmount,
            currency: 'INR',
            confirmationRef: 'HTL-SEED-1',
            createdBy: ownerId,
            updatedBy: ownerId,
            items: {
              create: {
                bookingComponentId: hotelBooking.id,
                quantity: 1,
                selected: true,
                status: 'confirmed',
                agreedAmount: hotelBooking.confirmedAmount,
                currency: 'INR',
              },
            },
          },
        });
        await prisma.bookingComponent.update({
          where: { id: hotelBooking.id },
          data: { serviceRequestId: sr.id },
        });
        const invCount = await prisma.supplierInvoice.count({
          where: { tripId: trip.id, bookingComponentId: hotelBooking.id },
        });
        if (!invCount) {
          const inv = await prisma.supplierInvoice.create({
            data: {
              organizationId,
              tripId: trip.id,
              supplierId: darjeelingHeritageHotel.id,
              bookingComponentId: hotelBooking.id,
              invoiceNumber: 'AUTO-SEED-HTL',
              amount: hotelBooking.confirmedAmount ?? new Prisma.Decimal(13500),
              currency: 'INR',
              status: 'open',
              notes: 'Auto payable on confirm · seed hotel booking',
              createdBy: ownerId,
              updatedBy: ownerId,
            },
          });
          await prisma.tripPayment.create({
            data: {
              organizationId,
              tripId: trip.id,
              direction: 'supplier',
              label: `Invoice ${inv.invoiceNumber}`,
              amount: inv.amount,
              currency: 'INR',
              status: 'scheduled',
              supplierInvoiceId: inv.id,
              bookingComponentId: hotelBooking.id,
              createdBy: ownerId,
              updatedBy: ownerId,
            },
          });
        }
        const cdCount = await prisma.commercialDocument.count({
          where: {
            organizationId,
            direction: 'payable',
            linkedEntityType: 'booking_component',
            linkedEntityId: hotelBooking.id,
          },
        });
        if (!cdCount) {
          const payableAmount =
            hotelBooking.confirmedAmount ?? new Prisma.Decimal(13500);
          await prisma.commercialDocument.create({
            data: {
              organizationId,
              docType: 'invoice',
              direction: 'payable',
              supplierId: darjeelingHeritageHotel.id,
              linkedEntityType: 'booking_component',
              linkedEntityId: hotelBooking.id,
              tripId: trip.id,
              serviceRequestId: sr.id,
              documentNumber: 'AUTO-SEED-HTL',
              label: `Payable · ${hotelBooking.title}`,
              amount: payableAmount,
              currency: 'INR',
              status: 'open',
              notes: 'Auto payable on confirm · seed hotel booking',
              createdBy: ownerId,
              lines: {
                create: {
                  description: hotelBooking.title,
                  quantity: 1,
                  unitAmount: payableAmount,
                  taxAmount: 0,
                },
              },
            },
          });
        }
        await prisma.bookingComponent.create({
          data: {
            organizationId,
            tripId: trip.id,
            supplierId: driverSupplier.id,
            type: 'transfer',
            title: 'Airport transfers',
            status: 'requested',
            costAmount: new Prisma.Decimal(3000),
            currency: 'INR',
            createdBy: ownerId,
            updatedBy: ownerId,
          },
        });
      } else {
        // Mid-pipeline demo: quote-sourced hotel at enquiry (requested) — Confirm next.
        const hotelLine = {
          id: 'seed-qt03-hotel',
          serviceType: 'hotel' as const,
          description: 'Darjeeling Heritage Lodge · Deluxe mountain view · MAP',
          quantity: 3,
          unitCost: 4500,
          unitSell: 5400,
          details: {
            supplierId: darjeelingHeritageHotel.id,
            propertyName: darjeelingHeritageHotel.name,
            roomType: 'Deluxe mountain view',
            mealPlan: 'MAP',
            checkIn: '2026-11-12',
            checkOut: '2026-11-15',
            nights: 3,
            rooms: 1,
          },
        };
        const { startAt, endAt } = hotelStayWindow(hotelLine.details);
        const costAmount = lineBuyTotal(hotelLine);
        const quotedAmount = lineSellTotal(hotelLine);
        const hotelBooking = await prisma.bookingComponent.create({
          data: {
            organizationId,
            tripId: trip.id,
            supplierId: darjeelingHeritageHotel.id,
            partnerAssetId: darjeelingHeritageHotel.linkedAssetId || null,
            quotationLineId: 'seed-qt03-hotel',
            type: 'hotel',
            title: hotelBookingTitle(hotelLine),
            status: 'requested',
            startAt,
            endAt,
            costAmount:
              costAmount != null ? new Prisma.Decimal(costAmount) : new Prisma.Decimal(13500),
            quotedAmount:
              quotedAmount != null
                ? new Prisma.Decimal(quotedAmount)
                : new Prisma.Decimal(16200),
            currency: 'INR',
            requiredQuantity: new Prisma.Decimal(1),
            createdBy: ownerId,
            updatedBy: ownerId,
          },
        });
        const sr = await prisma.serviceRequest.create({
          data: {
            buyerOrganizationId: organizationId,
            supplierId: darjeelingHeritageHotel.id,
            partnerAssetId: darjeelingHeritageHotel.linkedAssetId || null,
            serviceType: 'STAY',
            title: hotelBooking.title,
            status: 'sent',
            tripId: trip.id,
            quotationLineId: 'seed-qt03-hotel',
            serviceStartAt: startAt,
            serviceEndAt: endAt,
            quotedAmount: hotelBooking.quotedAmount,
            currency: 'INR',
            createdBy: ownerId,
            updatedBy: ownerId,
            items: {
              create: {
                bookingComponentId: hotelBooking.id,
                quantity: 1,
                selected: true,
                status: 'requested',
                currency: 'INR',
              },
            },
          },
        });
        await prisma.bookingComponent.update({
          where: { id: hotelBooking.id },
          data: { serviceRequestId: sr.id },
        });
        await prisma.bookingComponent.create({
          data: {
            organizationId,
            tripId: trip.id,
            supplierId: driverSupplier.id,
            type: 'transfer',
            title: 'Airport transfers',
            status: 'requested',
            costAmount: new Prisma.Decimal(3000),
            currency: 'INR',
            createdBy: ownerId,
            updatedBy: ownerId,
          },
        });
      }
    }

    // Idempotent: upgrade legacy TRP-SEED-03 stub hotel to mid-pipeline enquiry.
    if (trip.id === tripOps.id) {
      const stubHotel = await prisma.bookingComponent.findFirst({
        where: {
          tripId: trip.id,
          type: 'hotel',
          quotationLineId: null,
          title: 'Hotel stay',
        },
      });
      if (stubHotel) {
        const hotelLine = {
          id: 'seed-qt03-hotel',
          serviceType: 'hotel' as const,
          description: 'Darjeeling Heritage Lodge · Deluxe mountain view · MAP',
          quantity: 3,
          unitCost: 4500,
          unitSell: 5400,
          details: {
            supplierId: darjeelingHeritageHotel.id,
            propertyName: darjeelingHeritageHotel.name,
            roomType: 'Deluxe mountain view',
            mealPlan: 'MAP',
            checkIn: '2026-11-12',
            checkOut: '2026-11-15',
            nights: 3,
            rooms: 1,
          },
        };
        const { startAt, endAt } = hotelStayWindow(hotelLine.details);
        const costAmount = lineBuyTotal(hotelLine);
        const quotedAmount = lineSellTotal(hotelLine);
        await prisma.bookingComponent.update({
          where: { id: stubHotel.id },
          data: {
            supplierId: darjeelingHeritageHotel.id,
            partnerAssetId: darjeelingHeritageHotel.linkedAssetId || null,
            quotationLineId: 'seed-qt03-hotel',
            title: hotelBookingTitle(hotelLine),
            status: 'requested',
            startAt,
            endAt,
            costAmount:
              costAmount != null ? new Prisma.Decimal(costAmount) : new Prisma.Decimal(13500),
            quotedAmount:
              quotedAmount != null
                ? new Prisma.Decimal(quotedAmount)
                : new Prisma.Decimal(16200),
            updatedBy: ownerId,
          },
        });
        const existingSr = await prisma.serviceRequest.findFirst({
          where: { tripId: trip.id, quotationLineId: 'seed-qt03-hotel' },
        });
        if (!existingSr) {
          const sr = await prisma.serviceRequest.create({
            data: {
              buyerOrganizationId: organizationId,
              supplierId: darjeelingHeritageHotel.id,
              partnerAssetId: darjeelingHeritageHotel.linkedAssetId || null,
              serviceType: 'STAY',
              title: hotelBookingTitle(hotelLine),
              status: 'sent',
              tripId: trip.id,
              quotationLineId: 'seed-qt03-hotel',
              serviceStartAt: startAt,
              serviceEndAt: endAt,
              quotedAmount:
                quotedAmount != null
                  ? new Prisma.Decimal(quotedAmount)
                  : new Prisma.Decimal(16200),
              currency: 'INR',
              createdBy: ownerId,
              updatedBy: ownerId,
              items: {
                create: {
                  bookingComponentId: stubHotel.id,
                  quantity: 1,
                  selected: true,
                  status: 'requested',
                  currency: 'INR',
                },
              },
            },
          });
          await prisma.bookingComponent.update({
            where: { id: stubHotel.id },
            data: { serviceRequestId: sr.id },
          });
        }
      }
    }

    const readinessCount = await prisma.tripReadinessItem.count({
      where: { tripId: trip.id },
    });
    if (!readinessCount) {
      await prisma.tripReadinessItem.createMany({
        data: [
          'All bookings confirmed',
          'Vouchers issued',
          'Traveller documents collected',
          'Customer balance settled',
          'Emergency contacts recorded',
        ].map((label, position) => ({
          tripId: trip.id,
          label,
          position,
          done:
            trip.id === tripConfirmed.id && (position === 0 || position === 1),
        })),
      });
    }

    const paymentCount = await prisma.tripPayment.count({ where: { tripId: trip.id } });
    if (!paymentCount) {
      await prisma.tripPayment.createMany({
        data: [
          {
            organizationId,
            tripId: trip.id,
            direction: 'customer',
            label: 'Advance',
            amount: new Prisma.Decimal(20000),
            amountPaid: new Prisma.Decimal(20000),
            currency: 'INR',
            method: 'upi',
            reference: 'UTRSEED001',
            status: 'paid',
            paidAt: new Date(),
            dueAt: new Date('2026-08-01'),
            createdBy: ownerId,
            updatedBy: ownerId,
          },
          {
            organizationId,
            tripId: trip.id,
            direction: 'customer',
            label: 'Balance',
            amount: new Prisma.Decimal(21000),
            amountPaid: new Prisma.Decimal(0),
            currency: 'INR',
            status: 'scheduled',
            dueAt: new Date('2026-09-01'),
            createdBy: ownerId,
            updatedBy: ownerId,
          },
          {
            organizationId,
            tripId: trip.id,
            direction: 'supplier',
            label: 'Hotel deposit',
            amount: new Prisma.Decimal(12000),
            amountPaid: new Prisma.Decimal(0),
            currency: 'INR',
            status: 'scheduled',
            dueAt: new Date('2026-08-15'),
            bookingComponentId: null,
            createdBy: ownerId,
            updatedBy: ownerId,
          },
        ],
      });
    }

    const invoiceCount = await prisma.supplierInvoice.count({
      where: { tripId: trip.id },
    });
    if (!invoiceCount) {
      await prisma.supplierInvoice.create({
        data: {
          organizationId,
          tripId: trip.id,
          supplierId: hotelSupplier.id,
          invoiceNumber: `INV-SEED-${trip.tripNumber}`,
          amount: new Prisma.Decimal(24000),
          currency: 'INR',
          dueAt: new Date('2026-08-20'),
          status: 'open',
          notes: 'Seed hotel invoice',
          createdBy: ownerId,
          updatedBy: ownerId,
        },
      });
    }
  }

  // Demo AR/AP aging fixtures (idempotent) — overdue customer + past-due supplier payable
  {
    const existingBalance = await prisma.tripPayment.findFirst({
      where: {
        tripId: tripConfirmed.id,
        direction: 'customer',
        label: 'Balance',
      },
    });
    if (!existingBalance) {
      await prisma.tripPayment.create({
        data: {
          organizationId,
          tripId: tripConfirmed.id,
          direction: 'customer',
          label: 'Balance',
          amount: new Prisma.Decimal(45000),
          amountPaid: new Prisma.Decimal(0),
          currency: 'INR',
          status: 'overdue',
          dueAt: new Date('2026-06-01'),
          createdBy: ownerId,
          updatedBy: ownerId,
        },
      });
    } else if (
      existingBalance.status !== 'paid' &&
      existingBalance.status !== 'cancelled'
    ) {
      await prisma.tripPayment.update({
        where: { id: existingBalance.id },
        data: {
          dueAt: new Date('2026-06-01'),
          status: 'overdue',
          amountPaid: new Prisma.Decimal(0),
        },
      });
    }

    const balanceForCd =
      existingBalance ||
      (await prisma.tripPayment.findFirst({
        where: {
          tripId: tripConfirmed.id,
          direction: 'customer',
          label: 'Balance',
        },
      }));
    if (balanceForCd) {
      const arCount = await prisma.commercialDocument.count({
        where: {
          organizationId,
          direction: 'receivable',
          linkedEntityType: 'trip_payment',
          linkedEntityId: balanceForCd.id,
        },
      });
      if (!arCount) {
        await prisma.commercialDocument.create({
          data: {
            organizationId,
            docType: 'invoice',
            direction: 'receivable',
            counterpartyPartyId: tripConfirmed.partyId,
            linkedEntityType: 'trip_payment',
            linkedEntityId: balanceForCd.id,
            tripId: tripConfirmed.id,
            documentNumber: `AR-${balanceForCd.id.slice(-8).toUpperCase()}`,
            label: `Receivable · ${balanceForCd.label}`,
            amount: balanceForCd.amount,
            currency: 'INR',
            status: 'open',
            dueAt: balanceForCd.dueAt,
            notes: `Customer instalment · ${balanceForCd.label}`,
            createdBy: ownerId,
            lines: {
              create: {
                description: balanceForCd.label,
                quantity: 1,
                unitAmount: balanceForCd.amount,
                taxAmount: 0,
              },
            },
          },
        });
      }
    }

    const supplierPayable = await prisma.tripPayment.findFirst({
      where: {
        tripId: tripConfirmed.id,
        direction: 'supplier',
        label: { startsWith: 'Invoice AUTO' },
      },
    });
    if (supplierPayable && !supplierPayable.dueAt) {
      await prisma.tripPayment.update({
        where: { id: supplierPayable.id },
        data: {
          dueAt: new Date('2026-06-20'),
          status: 'overdue',
        },
      });
    }
  }

  const feedbackCount = await prisma.tripFeedback.count({
    where: { tripId: tripConfirmed.id },
  });
  if (!feedbackCount) {
    await prisma.tripFeedback.create({
      data: {
        tripId: tripConfirmed.id,
        score: 9,
        note: 'Seed feedback — loved the hotel.',
        createdBy: ownerId,
      },
    });
  }

  // Tasks + notifications + audit sample
  const taskTitle = 'Follow up Acme offsite advance';
  const existingTask = await prisma.task.findFirst({
    where: { organizationId, title: taskTitle, deletedAt: null },
  });
  if (!existingTask) {
    await prisma.task.create({
      data: {
        organizationId,
        title: taskTitle,
        description: 'Seeded finance follow-up task',
        status: 'open',
        priority: 'high',
        dueAt: new Date('2026-08-10'),
        assigneeId: ownerId,
        entityType: 'trip',
        entityId: tripOps.id,
        createdBy: ownerId,
      },
    });
  }

  const notifCount = await prisma.notification.count({
    where: { organizationId, userId: ownerId },
  });
  if (!notifCount) {
    await prisma.notification.createMany({
      data: [
        {
          organizationId,
          userId: ownerId,
          channel: 'in_app',
          title: 'Trip confirmed',
          body: 'TRP-SEED-02 moved to confirmed',
          linkPath: '/trips',
        },
        {
          organizationId,
          userId: ownerId,
          channel: 'in_app',
          title: 'Network partner preferred',
          body: 'Goa Breeze Resort marked preferred',
          linkPath: '/network',
        },
      ],
    });
  }

  // Sample document metadata row (storage key is placeholder for local)
  const docCount = await prisma.document.count({
    where: { organizationId, entityType: 'trip', entityId: tripConfirmed.id },
  });
  if (!docCount) {
    await prisma.document.create({
      data: {
        organizationId,
        entityType: 'trip',
        entityId: tripConfirmed.id,
        name: 'seed-voucher-note.txt',
        mimeType: 'text/plain',
        sizeBytes: 42,
        storageKey: `seed/${organizationId}/${tripConfirmed.id}/voucher.txt`,
        visibility: 'internal',
        createdBy: ownerId,
      },
    });
  }

  // Outbox event sample
  const outboxCount = await prisma.outboxEvent.count({
    where: { organizationId, eventType: 'seed.demo_ready' },
  });
  if (!outboxCount) {
    await prisma.outboxEvent.create({
      data: {
        organizationId,
        eventType: 'seed.demo_ready',
        payloadJson: { trips: 3, partners: DEMO_PARTNERS.length },
        status: 'completed',
      },
    });
  }

  const seedAudit = await prisma.auditEvent.findFirst({
    where: { organizationId, action: 'seed.rich_demo' },
  });
  if (!seedAudit) {
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId: ownerId,
        action: 'seed.rich_demo',
        entityType: 'organization',
        entityId: organizationId,
        metadataJson: {
          trips: ['TRP-SEED-01', 'TRP-SEED-02', 'TRP-SEED-03'],
          inquiries: ['INQ-SEED-01', 'INQ-SEED-02', 'INQ-SEED-03'],
        },
      },
    });
  }

  console.log('Seeded rich agency demo data (parties, inquiries, trips, finance, tasks)');
  await seedInboxReplyDemo(prisma, organizationId, ownerId, parties);
}

/** Inbox threads the agency can practice replying on (WhatsApp / Email / Google / Instagram). */
async function seedInboxReplyDemo(
  prisma: PrismaClient,
  organizationId: string,
  ownerId: string,
  parties: Record<string, string>,
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settingsJson: true },
  });
  const existingSettings =
    org?.settingsJson && typeof org.settingsJson === 'object' && !Array.isArray(org.settingsJson)
      ? (org.settingsJson as Record<string, unknown>)
      : {};
  const existingIntegrations =
    existingSettings.integrations &&
    typeof existingSettings.integrations === 'object' &&
    !Array.isArray(existingSettings.integrations)
      ? (existingSettings.integrations as Record<string, unknown>)
      : {};

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settingsJson: {
        ...existingSettings,
        integrations: {
          ...existingIntegrations,
          whatsapp: {
            enabled: true,
            phoneNumberId: 'seed-demo-phone-id',
            accessToken: 'seed-demo-whatsapp-token',
            verifyToken: 'seed-demo-verify',
            appSecret: 'seed-demo-secret',
          },
          facebook: {
            enabled: true,
            pageId: 'seed-demo-page',
            accessToken: 'seed-demo-facebook-token',
            verifyToken: 'seed-demo-verify',
            appSecret: 'seed-demo-secret',
            instagramBusinessAccountId: 'seed-demo-ig',
          },
          emailIngest: {
            enabled: true,
            sharedSecret: 'seed-demo-email-secret',
          },
        },
      },
    },
  });

  const quoteProposalTpl = await prisma.whatsAppTemplate.upsert({
    where: {
      organizationId_name: {
        organizationId,
        name: 'Quote proposal',
      },
    },
    create: {
      organizationId,
      name: 'Quote proposal',
      metaTemplateName: 'quote_proposal',
      languageCode: 'en',
      variableCount: 4,
      bodyPreview:
        'Hi {{1}}, your proposal for {{2}} ({{3}}) is ready: {{4}}',
      isActive: true,
    },
    update: {
      metaTemplateName: 'quote_proposal',
      languageCode: 'en',
      variableCount: 4,
      isActive: true,
    },
  });

  const afterTplOrg = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settingsJson: true },
  });
  const afterSettings =
    afterTplOrg?.settingsJson &&
    typeof afterTplOrg.settingsJson === 'object' &&
    !Array.isArray(afterTplOrg.settingsJson)
      ? (afterTplOrg.settingsJson as Record<string, unknown>)
      : {};
  const afterIntegrations =
    afterSettings.integrations &&
    typeof afterSettings.integrations === 'object' &&
    !Array.isArray(afterSettings.integrations)
      ? (afterSettings.integrations as Record<string, unknown>)
      : {};
  const afterWa =
    afterIntegrations.whatsapp &&
    typeof afterIntegrations.whatsapp === 'object' &&
    !Array.isArray(afterIntegrations.whatsapp)
      ? (afterIntegrations.whatsapp as Record<string, unknown>)
      : {};
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settingsJson: {
        ...afterSettings,
        integrations: {
          ...afterIntegrations,
          whatsapp: {
            ...afterWa,
            quoteProposalTemplateId: quoteProposalTpl.id,
          },
        },
      },
    },
  });

  let kavya = await prisma.party.findFirst({
    where: {
      organizationId,
      deletedAt: null,
      email: 'kavya.mehta@example.com',
    },
  });
  if (!kavya) {
    kavya = await prisma.party.create({
      data: {
        organizationId,
        type: 'individual',
        displayName: 'Kavya Mehta',
        email: 'kavya.mehta@example.com',
        phone: '+919900112233',
        notes: 'Seeded — Google Business / Instagram reply demo',
        metadataJson: { seedKey: 'seed-party-kavya' },
        createdBy: ownerId,
        contacts: {
          create: {
            fullName: 'Kavya Mehta',
            email: 'kavya.mehta@example.com',
            phone: '+919900112233',
            title: 'Primary',
            isPrimary: true,
          },
        },
      },
    });
  }

  const threads: Array<{
    seedKey: string;
    partyId: string;
    channel: string;
    subject: string;
    journey: string[];
    messages: Array<{
      idempotencyKey: string;
      direction: 'inbound' | 'outbound';
      summary: string;
      minutesAgo: number;
      unread?: boolean;
      raw: Record<string, unknown>;
    }>;
  }> = [
    {
      seedKey: 'seed-inbox-wa-sneha',
      partyId: parties['seed-party-sneha']!,
      channel: 'whatsapp',
      subject: 'WhatsApp — Kerala dates',
      journey: ['whatsapp'],
      messages: [
        {
          idempotencyKey: 'seed-inbox-wa-sneha-1',
          direction: 'inbound',
          summary: 'Hi, do you have a 5N Kerala package for mid-August?',
          minutesAgo: 95,
          unread: false,
          raw: {
            direction: 'inbound',
            from: '919811122233',
            text: 'Hi, do you have a 5N Kerala package for mid-August?',
            demo: true,
          },
        },
        {
          idempotencyKey: 'seed-inbox-wa-sneha-2',
          direction: 'outbound',
          summary: 'Outbound: Yes — we can do Kochi + Munnar + Alleppey. Sharing options shortly.',
          minutesAgo: 80,
          unread: false,
          raw: {
            direction: 'outbound',
            to: '919811122233',
            text: 'Yes — we can do Kochi + Munnar + Alleppey. Sharing options shortly.',
            demo: true,
          },
        },
        {
          idempotencyKey: 'seed-inbox-wa-sneha-3',
          direction: 'inbound',
          summary: 'Great. Prefer houseboat one night. Budget around 80k for 2 adults.',
          minutesAgo: 12,
          unread: true,
          raw: {
            direction: 'inbound',
            from: '919811122233',
            text: 'Great. Prefer houseboat one night. Budget around 80k for 2 adults.',
            demo: true,
          },
        },
      ],
    },
    {
      seedKey: 'seed-inbox-email-aarav',
      partyId: parties['seed-party-aarav']!,
      channel: 'email',
      subject: 'Email — Bali honeymoon',
      journey: ['email'],
      messages: [
        {
          idempotencyKey: 'seed-inbox-email-aarav-1',
          direction: 'inbound',
          summary: 'Looking for a Bali honeymoon in October — 6 nights, beach + Ubud.',
          minutesAgo: 40,
          unread: true,
          raw: {
            direction: 'inbound',
            from: 'aarav.sharma@example.com',
            subject: 'Bali honeymoon enquiry',
            messageId: '<seed-aarav-bali@example.com>',
            text: 'Looking for a Bali honeymoon in October — 6 nights, beach + Ubud.',
            demo: true,
          },
        },
      ],
    },
    {
      seedKey: 'seed-inbox-gbp-kavya',
      partyId: kavya.id,
      channel: 'google_business',
      subject: 'Google review — Manali trip',
      journey: ['google_business'],
      messages: [
        {
          idempotencyKey: 'seed-inbox-gbp-kavya-1',
          direction: 'inbound',
          summary: '★5 Wonderful Manali trip — hotel and driver were excellent. Thank you!',
          minutesAgo: 300,
          unread: true,
          raw: {
            direction: 'inbound',
            source: 'google_business',
            kind: 'review',
            rating: 5,
            externalId: 'seed-gbp-review-kavya-1',
            locationName: 'accounts/seed/locations/seed-demo-location',
            text: 'Wonderful Manali trip — hotel and driver were excellent. Thank you!',
            demo: true,
          },
        },
      ],
    },
    {
      seedKey: 'seed-inbox-ig-kavya',
      partyId: kavya.id,
      channel: 'instagram',
      subject: 'Instagram DM — weekend Goa',
      journey: ['instagram'],
      messages: [
        {
          idempotencyKey: 'seed-inbox-ig-kavya-1',
          direction: 'inbound',
          summary: 'Do you arrange weekend Goa getaways from Mumbai?',
          minutesAgo: 8,
          unread: true,
          raw: {
            direction: 'inbound',
            senderId: 'seed-ig-sender-kavya',
            text: 'Do you arrange weekend Goa getaways from Mumbai?',
            demo: true,
          },
        },
      ],
    },
  ];

  for (const thread of threads) {
    let conv = await prisma.engagementConversation.findFirst({
      where: {
        organizationId,
        partyId: thread.partyId,
        subject: thread.subject,
      },
    });
    const lastAt = new Date(Date.now() - Math.min(...thread.messages.map((m) => m.minutesAgo)) * 60_000);
    const unreadCount = thread.messages.filter((m) => m.unread).length;
    if (!conv) {
      conv = await prisma.engagementConversation.create({
        data: {
          organizationId,
          partyId: thread.partyId,
          status: 'open',
          subject: thread.subject,
          assignedUserId: null,
          lastInteractionAt: lastAt,
          unreadCount,
          journeyPathJson: thread.journey,
        },
      });
    } else {
      await prisma.engagementConversation.update({
        where: { id: conv.id },
        data: {
          lastInteractionAt: lastAt,
          unreadCount,
          journeyPathJson: thread.journey,
          status: 'open',
        },
      });
    }

    for (const msg of thread.messages) {
      const existing = await prisma.interaction.findFirst({
        where: { organizationId, idempotencyKey: msg.idempotencyKey },
      });
      if (existing) continue;
      const occurredAt = new Date(Date.now() - msg.minutesAgo * 60_000);
      await prisma.interaction.create({
        data: {
          organizationId,
          conversationId: conv.id,
          partyId: thread.partyId,
          channel: thread.channel,
          acquisitionSourceKey: thread.channel,
          outcome: 'pending',
          unread: msg.unread ?? msg.direction === 'inbound',
          summary: msg.summary,
          staffUserId: msg.direction === 'outbound' ? ownerId : null,
          occurredAt,
          idempotencyKey: msg.idempotencyKey,
          rawPayloadJson: msg.raw,
        },
      });
    }
  }

  console.log('Seeded Inbox reply demo (WhatsApp, Email, Google Business, Instagram)');
}

async function ensureDemoAgency(
  prisma: PrismaClient,
  email: string,
  password: string,
) {
  const passwordHash = await bcrypt.hash(password, 10);
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: key },
      update: {},
    });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        fullName: 'Demo Owner',
        passwordHash,
      },
    });
  }

  let org = await prisma.organization.findUnique({ where: { slug: 'demo-travel' } });
  if (!org) {
    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: user.id, isOwner: true },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    org = membership?.organization ?? null;
  }

  if (!org) {
    const identity = await allocateSeedOrgIdentity(prisma, 'Demo Travel Agency', 'demotravel');
    org = await prisma.organization.create({
      data: {
        name: 'Demo Travel Agency',
        slug: 'demo-travel',
        publicCode: identity.publicCode,
        subdomain: identity.subdomain,
        kind: 'travel_agency',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        brandingJson: { primaryColor: '#0f6e56', companyName: 'Demo Travel Agency' },
          settingsJson: {
            indiaReady: true,
            defaultTaxPercent: 5,
            business: {
              phone: '+919876543210',
              emergencyPhone: '+919876543299',
              supportEmail: 'hello@demo.travel',
              website: 'https://demo.travel',
              legalName: 'Demo Travel Agency Pvt Ltd',
            },
            trust: {
              licensed: true,
              yearsExperience: 12,
              travellerCountLabel: '5000+',
              support247: true,
              verifiedHotels: true,
              defaultCancellationNote:
                'Free cancellation up to 15 days before travel; thereafter per hotel rules. We help rebook when possible.',
            },
          },
        partnerProfile: {
          create: {
            discoverable: false,
            country: 'India',
            city: 'Bengaluru',
            serviceTagsJson: [],
          },
        },
      },
    });
  } else {
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        kind: 'travel_agency',
        slug: org.slug === 'demo-travel' ? org.slug : org.slug,
        settingsJson: {
          ...((org.settingsJson && typeof org.settingsJson === 'object'
            ? org.settingsJson
            : {}) as object),
          indiaReady: true,
          defaultTaxPercent: 5,
          business: {
            phone: '+919876543210',
            emergencyPhone: '+919876543299',
            supportEmail: 'hello@demo.travel',
            website: 'https://demo.travel',
            legalName: 'Demo Travel Agency Pvt Ltd',
          },
          trust: {
            licensed: true,
            yearsExperience: 12,
            travellerCountLabel: '5000+',
            support247: true,
            verifiedHotels: true,
            defaultCancellationNote:
              'Free cancellation up to 15 days before travel; thereafter per hotel rules. We help rebook when possible.',
          },
        },
      },
    });
    await prisma.organizationPartnerProfile.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        discoverable: false,
        country: 'India',
        city: 'Bengaluru',
        serviceTagsJson: [],
      },
      update: {},
    });
  }

  await ensureOrgRoles(prisma, org.id);
  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId: org.id, key: 'owner' } },
  });
  const membership = await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: user.id },
    },
    create: { organizationId: org.id, userId: user.id, isOwner: true },
    update: { isOwner: true, isActive: true },
  });
  await prisma.membershipRole.upsert({
    where: {
      membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id },
    },
    create: { membershipId: membership.id, roleId: ownerRole.id },
    update: {},
  });

  return { user, org, passwordHash };
}

/** Extra agency owner (e.g. personal Google SSO email) on the demo org. */
async function ensureAgencyOwnerAlias(
  prisma: PrismaClient,
  organizationId: string,
  email: string,
  passwordHash: string,
  fullName: string,
) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, fullName, passwordHash },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, fullName: user.fullName || fullName },
    });
  }

  await ensureOrgRoles(prisma, organizationId);
  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId, key: 'owner' } },
  });
  const membership = await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: { organizationId, userId: user.id },
    },
    create: { organizationId, userId: user.id, isOwner: true },
    update: { isOwner: true, isActive: true },
  });
  await prisma.membershipRole.upsert({
    where: {
      membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id },
    },
    create: { membershipId: membership.id, roleId: ownerRole.id },
    update: {},
  });
  return user;
}

/** Copy every active workspace membership (+ roles) from primary demo owner → alias. */
async function mirrorOwnerMemberships(
  prisma: PrismaClient,
  primaryUserId: string,
  aliasUserId: string,
) {
  if (primaryUserId === aliasUserId) return 0;
  const source = await prisma.organizationMembership.findMany({
    where: { userId: primaryUserId, isActive: true, deletedAt: null },
    include: {
      roles: { select: { roleId: true } },
    },
  });
  let linked = 0;
  for (const m of source) {
    const membership = await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: m.organizationId,
          userId: aliasUserId,
        },
      },
      create: {
        organizationId: m.organizationId,
        userId: aliasUserId,
        isOwner: m.isOwner,
        isActive: true,
      },
      update: { isOwner: m.isOwner, isActive: true, deletedAt: null },
    });
    for (const r of m.roles) {
      await prisma.membershipRole.upsert({
        where: {
          membershipId_roleId: {
            membershipId: membership.id,
            roleId: r.roleId,
          },
        },
        create: { membershipId: membership.id, roleId: r.roleId },
        update: {},
      });
    }
    linked += 1;
  }
  return linked;
}

async function main() {
  bootstrapEnv();
  const prisma = new PrismaClient();
  const email = process.env.SEED_EMAIL ?? 'owner@demo.travel';
  const password = process.env.SEED_PASSWORD ?? DEMO_PASSWORD;

  const placeIdByKey = await seedSystemPlaces(prisma);
  await seedPlaceEdges(prisma, placeIdByKey);
  await seedPlaceKnowledge(prisma, placeIdByKey);
  await migratePlaceRefs(prisma);
  await seedSystemRoomTypes(prisma);
  await seedSystemVehicleTypes(prisma);
  await seedSystemTransferFares(prisma, placeIdByKey);
  await seedSystemHotelRates(prisma, placeIdByKey);
  await seedNetworkPartners(prisma);
  const backfilled = await backfillPartnerDefaultAssets(prisma);
  if (backfilled) {
    console.log(`Backfilled PartnerAsset for ${backfilled} partner org(s)`);
  }
  const stayInv = await backfillStayStarterInventory(prisma);
  if (stayInv) {
    console.log(`Seeded stay starter inventory for ${stayInv} property(ies)`);
  }
  await ensurePlatformAdmin(prisma, password);

  const { user, org, passwordHash } = await ensureDemoAgency(prisma, email, password);
  const aliasEmail =
    process.env.SEED_OWNER_ALIAS_EMAIL ?? 'manab@digitalwoods.io';
  const aliasUser = await ensureAgencyOwnerAlias(
    prisma,
    org.id,
    aliasEmail,
    passwordHash,
    process.env.SEED_OWNER_ALIAS_NAME ?? 'Manab Roy',
  );
  await seedAgencyStaff(prisma, org.id, passwordHash);
  await ensureAgencyBootstrap(prisma, org.id);
  await seedDemoLeads(prisma, org.id, user.id);
  await seedRichAgencyData(prisma, org.id, user.id);
  await seedAgencyPackageTemplate(prisma, org.id);
  await seedPartnerOperationalData(prisma);

  await ensureSystemPresenceThemes(prisma);
  const orgsForPresence = await prisma.organization.findMany({
    where: { deletedAt: null, kind: { not: 'platform' } },
    select: { id: true, kind: true },
  });
  for (const o of orgsForPresence) {
    await ensureOrgPresenceFormPresets(prisma, o.id, o.kind);
  }
  console.log(`Presence themes + form presets ready for ${orgsForPresence.length} org(s)`);

  const mirrored = await mirrorOwnerMemberships(prisma, user.id, aliasUser.id);
  if (mirrored) {
    console.log(`Mirrored ${mirrored} workspace(s) onto ${aliasUser.email}`);
  }

  console.log('\nDemo accounts (password:', password + ')');
  console.log('  Platform admin:   ', process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@travelos.platform');
  console.log('  Agency owner:     ', email);
  console.log('  Agency owner (SSO alias):', aliasUser.email);
  for (const s of AGENCY_STAFF) console.log('  ', s.roleKey.padEnd(18), s.email);
  for (const p of DEMO_PARTNERS) console.log('  ', p.kind.padEnd(18), p.email, '(+ per-role logins)');
  console.log(
    'Per-role partner logins follow <owner-local>.<role>@domain, e.g. hotel.goa.frontdesk@demo.travel',
  );
  console.log('Org slug: travel-os (platform) / demo-travel / partner slugs seed-*');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
