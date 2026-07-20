import { Prisma } from '@prisma/client';
import { INQUIRY_PLANNING_STATUSES } from '../inquiries/inquiry-queue';

/** Trips still in the sales / ops pipeline (not completed or cancelled). */
export const PARTY_ACTIVE_TRIP_STATUSES = [
  'planning',
  'quoted',
  'awaiting_approval',
  'confirmed',
  'booking_in_progress',
  'ready_to_travel',
  'in_progress',
] as const;

export type PartyListFilters = {
  q?: string;
  type?: string;
  b2b?: boolean;
};

/** Matches PartiesPage client B2B toggle: org accounts or any businessType set. */
export function partyB2bWhere(): Prisma.PartyWhereInput {
  return {
    OR: [{ businessType: { not: null } }, { type: 'organization' }],
  };
}

export function buildPartyListWhere(
  organizationId: string,
  filters: PartyListFilters,
): Prisma.PartyWhereInput {
  const parts: Prisma.PartyWhereInput[] = [
    { organizationId, deletedAt: null },
  ];

  if (filters.type) {
    parts.push({ type: filters.type });
  }

  if (filters.b2b) {
    parts.push(partyB2bWhere());
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    parts.push({
      OR: [
        { displayName: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
      ],
    });
  }

  return parts.length === 1 ? parts[0]! : { AND: parts };
}

export const partyListCountSelect = {
  inquiries: {
    where: {
      deletedAt: null,
      status: { in: [...INQUIRY_PLANNING_STATUSES] },
    },
  },
  trips: {
    where: {
      deletedAt: null,
      status: { in: [...PARTY_ACTIVE_TRIP_STATUSES] },
    },
  },
};
