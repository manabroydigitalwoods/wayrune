import type { SeedCtx } from './helpers';
import { SEED_KEY, money, pad, pickRoundRobin, utcDate } from './helpers';

export async function seedParties(ctx: SeedCtx): Promise<string[]> {
  const { prisma, organizationId, ownerId, scale } = ctx;
  const ids: string[] = [];
  for (let i = 1; i <= scale.parties; i++) {
    const n = pad(i);
    const isOrg = i % 5 === 0;
    const email = `scn.party.${n}@scenario.demo`;
    const party = await prisma.party.create({
      data: {
        organizationId,
        type: isOrg ? 'organization' : 'individual',
        displayName: isOrg ? `SCN Agency ${n}` : `SCN Traveller ${n}`,
        email,
        phone: `+9198${String(10000000 + i).slice(0, 8)}`,
        businessType: isOrg ? 'travel_agency' : null,
        creditLimit: isOrg ? money(200000 + i * 1000) : null,
        paymentTerms: isOrg ? 'Net 15' : null,
        notes: `${SEED_KEY} scenario party`,
        metadataJson: { seedKey: SEED_KEY, n: i },
        createdBy: ownerId,
        contacts: {
          create: {
            fullName: isOrg ? `Buyer ${n}` : `SCN Traveller ${n}`,
            email,
            phone: `+9198${String(10000000 + i).slice(0, 8)}`,
            isPrimary: true,
          },
        },
      },
    });
    ids.push(party.id);
  }
  return ids;
}

export async function seedLeads(ctx: SeedCtx, partyIds: string[]): Promise<string[]> {
  const { prisma, organizationId, ownerId, salesIds, scale, pipelineId, stages, sourceId } =
    ctx;
  const openStages = stages.filter((s) => !s.isWon && !s.isLost);
  const won = stages.find((s) => s.isWon);
  const lost = stages.find((s) => s.isLost);
  const priorities = ['low', 'normal', 'high'] as const;
  const dueOffsets = [-14, -7, -3, -1, 0, 1, 3, 7, 14, 21, 30] as const;
  const ids: string[] = [];

  for (let i = 1; i <= scale.leads; i++) {
    const n = pad(i);
    let stage = pickRoundRobin(openStages.length ? openStages : stages, i);
    if (i % 17 === 0 && won) stage = won;
    if (i % 19 === 0 && lost) stage = lost;

    const dueOff = dueOffsets[i % dueOffsets.length]!;
    const followUpAt =
      stage.isWon || stage.isLost
        ? null
        : i % 11 === 0
          ? null
          : utcDate(dueOff);

    const lead = await prisma.lead.create({
      data: {
        organizationId,
        pipelineId,
        stageId: stage.id,
        partyId: pickRoundRobin(partyIds, i),
        sourceId,
        ownerId: pickRoundRobin(salesIds.length ? salesIds : [ownerId], i),
        title: `SCN Lead ${n} · ${stage.key}`,
        contactName: `Contact ${n}`,
        email: `scn.lead.${n}@scenario.demo`,
        phone: `+9197${String(20000000 + i).slice(0, 8)}`,
        priority: priorities[i % priorities.length]!,
        followUpAt,
        idempotencyKey: `${SEED_KEY}:lead:${n}`,
        channel: pickRoundRobin(['whatsapp', 'phone', 'website', 'email'], i),
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: utcDate(-(i % 45)),
      },
    });
    ids.push(lead.id);
  }
  return ids;
}

export async function seedInquiries(
  ctx: SeedCtx,
  partyIds: string[],
  leadIds: string[],
): Promise<string[]> {
  const { prisma, organizationId, ownerId, salesIds, scale, placeId, placeName } = ctx;
  const statuses = ['open', 'qualified', 'converted', 'lost', 'closed'] as const;
  const travelOffsets = [-30, -7, 0, 5, 14, 28, 45, 90] as const;
  const ids: string[] = [];

  for (let i = 1; i <= scale.inquiries; i++) {
    const n = pad(i);
    const startOff = travelOffsets[i % travelOffsets.length]!;
    const start = utcDate(startOff);
    const end = utcDate(startOff + 4 + (i % 3));
    const status = statuses[i % statuses.length]!;
    const stale = i % 6 === 0;

    const inquiry = await prisma.inquiry.create({
      data: {
        organizationId,
        inquiryNumber: `INQ-SCN-${n}`,
        partyId: pickRoundRobin(partyIds, i),
        leadId: leadIds.length ? pickRoundRobin(leadIds, i) : null,
        ownerId: pickRoundRobin(salesIds.length ? salesIds : [ownerId], i),
        status,
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
        destinationsJson: [{ placeId, name: placeName, kind: 'city' }],
        startDate: start,
        endDate: end,
        nights: 4 + (i % 3),
        adults: 2,
        children: i % 3 === 0 ? 1 : 0,
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: utcDate(-(10 + (i % 40))),
      },
    });
    if (stale) {
      await prisma.inquiry.update({
        where: { id: inquiry.id },
        data: { updatedAt: utcDate(-(20 + (i % 10))) },
      });
    }
    ids.push(inquiry.id);
  }
  return ids;
}
