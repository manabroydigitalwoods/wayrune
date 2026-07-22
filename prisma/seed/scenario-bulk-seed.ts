/**
 * Opt-in bulk scenario seed — wipeable relative-dated fixtures for dogfooding
 * date-range filters, ops, finance aging, and sales SLA.
 *
 *   pnpm db:seed              # prerequisite (demo-travel + suppliers)
 *   pnpm db:seed:scenarios    # this script
 *
 * Env:
 *   SEED_SCENARIO_ORG=demo-travel   (default; set pilot-staging only intentionally)
 *   SEED_SCENARIO_SCALE=medium      (small | medium | large)
 *   SEED_SCENARIO_WIPE=1            (default on)
 */
import { PrismaClient } from '@prisma/client';
import { seedInquiries, seedLeads, seedParties } from './scenario-bulk/crm';
import {
  SCALE,
  SEED_KEY,
  resolveOrg,
  resolveOwnerAndSales,
  resolvePipeline,
  resolveScale,
  resolveSuppliersAndPlace,
  wipeScenarioBulk,
  type SeedCtx,
} from './scenario-bulk/helpers';
import { seedInbox, seedTasks } from './scenario-bulk/tasks-inbox';
import { seedDashboardActivity, seedTripsAndOps } from './scenario-bulk/trips';

async function main() {
  const prisma = new PrismaClient();
  const slug = (process.env.SEED_SCENARIO_ORG || 'demo-travel').trim();
  const scaleName = resolveScale(process.env.SEED_SCENARIO_SCALE);
  const wipe = process.env.SEED_SCENARIO_WIPE !== '0';

  if (slug === 'pilot-staging' && process.env.SEED_SCENARIO_ALLOW_PILOT !== '1') {
    throw new Error(
      'Refusing to seed pilot-staging without SEED_SCENARIO_ALLOW_PILOT=1 (keeps Named-pilot clean).',
    );
  }

  console.log(`Scenario bulk seed → org=${slug} scale=${scaleName} wipe=${wipe ? 'yes' : 'no'}`);

  try {
    const org = await resolveOrg(prisma, slug);
    const { ownerId, salesIds } = await resolveOwnerAndSales(prisma, org.id);
    const { pipelineId, stages } = await resolvePipeline(prisma, org.id);
    const suppliers = await resolveSuppliersAndPlace(prisma, org.id);
    const source = await prisma.leadSource.findFirst({
      where: { organizationId: org.id, isActive: true },
      orderBy: { name: 'asc' },
    });

    if (wipe) {
      console.log(`Wiping prior ${SEED_KEY} rows…`);
      await wipeScenarioBulk(prisma, org.id);
    }

    const ctx: SeedCtx = {
      prisma,
      organizationId: org.id,
      ownerId,
      salesIds,
      scale: SCALE[scaleName],
      scaleName,
      hotelSupplierId: suppliers.hotelSupplierId,
      transferSupplierId: suppliers.transferSupplierId,
      placeId: suppliers.placeId,
      placeName: suppliers.placeName,
      pipelineId,
      stages,
      sourceId: source?.id ?? null,
    };

    console.log('Seeding parties…');
    const partyIds = await seedParties(ctx);
    console.log(`  parties: ${partyIds.length}`);

    console.log('Seeding leads…');
    const leadIds = await seedLeads(ctx, partyIds);
    console.log(`  leads: ${leadIds.length}`);

    console.log('Seeding inquiries…');
    const inquiryIds = await seedInquiries(ctx, partyIds, leadIds);
    console.log(`  inquiries: ${inquiryIds.length}`);

    console.log('Seeding trips / bookings / finance…');
    const { tripIds } = await seedTripsAndOps(ctx, partyIds);
    console.log(`  trips: ${tripIds.length}`);

    console.log('Seeding dashboard activity…');
    await seedDashboardActivity(ctx, tripIds);

    console.log('Seeding tasks…');
    const taskCount = await seedTasks(ctx, leadIds, tripIds);
    console.log(`  tasks: ${taskCount}`);

    console.log('Seeding inbox…');
    const inboxCount = await seedInbox(ctx, partyIds);
    console.log(`  inbox threads: ${inboxCount}`);

    console.log('Done. Smoke-check Travel / Due / Movement / Profitability / Aging filters on demo-travel.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
