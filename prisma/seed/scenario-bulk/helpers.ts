/**
 * Shared helpers for opt-in scenario-bulk seed (wipeable, relative dates).
 */
import { Prisma, PrismaClient } from '@prisma/client';

export const SEED_KEY = 'scenario-bulk-v1';
export const TRIP_PREFIX = 'TRP-SCN-';
export const INQ_PREFIX = 'INQ-SCN-';
export const QT_PREFIX = 'QT-SCN-';
export const TASK_PREFIX = 'SCN: ';
export const INTERACTION_PREFIX = `${SEED_KEY}:ix:`;
export const DOC_PREFIX = 'SCN-DOC-';

export type Db = PrismaClient;

export type ScaleName = 'small' | 'medium' | 'large';

export type ScaleConfig = {
  parties: number;
  leads: number;
  inquiries: number;
  trips: number;
  inboxThreads: number;
  tasks: number;
};

export const SCALE: Record<ScaleName, ScaleConfig> = {
  small: { parties: 20, leads: 40, inquiries: 20, trips: 30, inboxThreads: 10, tasks: 20 },
  medium: { parties: 80, leads: 200, inquiries: 100, trips: 120, inboxThreads: 40, tasks: 80 },
  large: { parties: 200, leads: 500, inquiries: 250, trips: 300, inboxThreads: 100, tasks: 200 },
};

export type SeedCtx = {
  prisma: Db;
  organizationId: string;
  ownerId: string;
  salesIds: string[];
  scale: ScaleConfig;
  scaleName: ScaleName;
  hotelSupplierId: string | null;
  transferSupplierId: string | null;
  placeId: string | null;
  placeName: string;
  pipelineId: string;
  stages: Array<{ id: string; key: string; isWon: boolean; isLost: boolean }>;
  sourceId: string | null;
};

export function utcDate(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

export function atHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

export function money(n: number) {
  return new Prisma.Decimal(n);
}

export function pad(n: number, width = 4): string {
  return String(n).padStart(width, '0');
}

export function resolveScale(raw?: string | null): ScaleName {
  const v = (raw || 'medium').toLowerCase();
  if (v === 'small' || v === 'medium' || v === 'large') return v;
  throw new Error(`SEED_SCENARIO_SCALE must be small|medium|large (got ${raw})`);
}

export async function resolveOrg(prisma: Db, slug: string) {
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) {
    throw new Error(
      `Org slug "${slug}" not found. Run pnpm db:seed first (demo-travel / pilot-staging).`,
    );
  }
  return org;
}

export async function resolveOwnerAndSales(prisma: Db, organizationId: string) {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      user: true,
      roles: { include: { role: true } },
    },
  });
  const owners = memberships.filter((m) =>
    m.roles.some((r) => r.role.key === 'owner' || r.role.key === 'admin'),
  );
  const sales = memberships.filter((m) =>
    m.roles.some((r) => r.role.key === 'sales_executive' || r.role.key === 'sales_manager'),
  );
  const owner = owners[0]?.user ?? memberships[0]?.user;
  if (!owner) throw new Error(`No users in org ${organizationId}`);
  const salesIds = (sales.length ? sales : memberships).map((m) => m.userId);
  return { ownerId: owner.id, salesIds };
}

export async function resolvePipeline(prisma: Db, organizationId: string) {
  const pipeline = await prisma.pipeline.findFirst({
    where: { organizationId },
    include: { stages: { orderBy: { position: 'asc' } } },
  });
  if (!pipeline || !pipeline.stages.length) {
    throw new Error(`No pipeline/stages for org ${organizationId} — run pnpm db:seed`);
  }
  return {
    pipelineId: pipeline.id,
    stages: pipeline.stages.map((s) => ({
      id: s.id,
      key: s.key,
      isWon: s.isWon,
      isLost: s.isLost,
    })),
  };
}

export async function resolveSuppliersAndPlace(prisma: Db, organizationId: string) {
  const hotel = await prisma.supplier.findFirst({
    where: { organizationId, deletedAt: null, type: 'hotel' },
    orderBy: { createdAt: 'asc' },
  });
  const transfer = await prisma.supplier.findFirst({
    where: {
      organizationId,
      deletedAt: null,
      type: { in: ['transfer', 'car_rental', 'driver', 'transport'] },
    },
    orderBy: { createdAt: 'asc' },
  });
  const place =
    (hotel?.placeId
      ? await prisma.place.findFirst({ where: { id: hotel.placeId } })
      : null) ??
    (await prisma.place.findFirst({
      where: { name: { contains: 'Darjeeling' } },
    })) ??
    (await prisma.place.findFirst({ where: { kind: 'city' } }));

  return {
    hotelSupplierId: hotel?.id ?? null,
    transferSupplierId: transfer?.id ?? hotel?.id ?? null,
    placeId: place?.id ?? null,
    placeName: place?.name ?? 'Darjeeling',
  };
}

/**
 * Delete prior scenario-bulk rows for this org (FK-safe order).
 */
export async function wipeScenarioBulk(prisma: Db, organizationId: string): Promise<void> {
  const trips = await prisma.trip.findMany({
    where: { organizationId, tripNumber: { startsWith: TRIP_PREFIX } },
    select: { id: true },
  });
  const tripIds = trips.map((t) => t.id);

  const inquiries = await prisma.inquiry.findMany({
    where: { organizationId, inquiryNumber: { startsWith: INQ_PREFIX } },
    select: { id: true },
  });
  const inquiryIds = inquiries.map((i) => i.id);

  const leads = await prisma.lead.findMany({
    where: { organizationId, idempotencyKey: { startsWith: `${SEED_KEY}:` } },
    select: { id: true },
  });
  const leadIds = leads.map((l) => l.id);

  const parties = await prisma.party.findMany({
    where: {
      organizationId,
      OR: [
        { email: { startsWith: 'scn.party.' } },
        { notes: { contains: SEED_KEY } },
      ],
    },
    select: { id: true },
  });
  const partyIds = parties.map((p) => p.id);

  // Interactions / conversations
  await prisma.interaction.deleteMany({
    where: {
      organizationId,
      idempotencyKey: { startsWith: INTERACTION_PREFIX },
    },
  });
  await prisma.engagementConversation.deleteMany({
    where: {
      organizationId,
      OR: [
        { subject: { startsWith: 'SCN ' } },
        ...(partyIds.length ? [{ partyId: { in: partyIds } }] : []),
      ],
    },
  });

  await prisma.task.deleteMany({
    where: { organizationId, title: { startsWith: TASK_PREFIX } },
  });

  await prisma.commercialDocument.deleteMany({
    where: { organizationId, documentNumber: { startsWith: DOC_PREFIX } },
  });

  if (tripIds.length) {
    await prisma.quotation.deleteMany({
      where: { organizationId, tripId: { in: tripIds } },
    });
    await prisma.trip.deleteMany({
      where: { id: { in: tripIds } },
    });
  }

  if (inquiryIds.length) {
    await prisma.inquiry.deleteMany({ where: { id: { in: inquiryIds } } });
  }
  if (leadIds.length) {
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  }
  if (partyIds.length) {
    await prisma.partyContact.deleteMany({ where: { partyId: { in: partyIds } } });
    await prisma.address.deleteMany({ where: { partyId: { in: partyIds } } });
    await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
  }

  await prisma.auditEvent.deleteMany({
    where: {
      organizationId,
      action: 'quote.fit_build',
      entityId: { startsWith: `${SEED_KEY}:` },
    },
  });
}

export function pickRoundRobin<T>(items: T[], i: number): T {
  return items[i % items.length]!;
}

export const TRIP_STATUSES = [
  'planning',
  'quoted',
  'confirmed',
  'booking_in_progress',
  'ready_to_travel',
  'in_progress',
  'completed',
  'cancelled',
] as const;

/** Travel start offsets for date-range filter coverage. */
export const TRAVEL_START_OFFSETS = [
  -90, -45, -14, -7, -3, -1, 0, 2, 5, 10, 14, 21, 28, 35, 45, 60, 90, 120, 150,
] as const;

/** Follow-up / due offsets. */
export const DUE_OFFSETS = [-14, -7, -3, -1, 0, 1, 3, 7, 14, 21, 30, null] as const;
