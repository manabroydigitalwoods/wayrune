import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

export const INQUIRY_PLANNING_STATUSES = ['open', 'qualified'] as const;

export type InquiryListQueue = 'my_requests' | 'planning' | 'active';

export type InquiryListFilters = {
  q?: string;
  status?: string;
  queue?: InquiryListQueue;
  ownerId?: string | null;
  incomplete?: boolean;
  /** Planning items with updatedAt older than org inbox aging hours. */
  stale?: boolean;
  /** Used with `stale` — hours threshold (default 4). */
  agingHours?: number;
  viewerUserId?: string;
};

export function inquiryHasMissingFieldsWhere(): Prisma.InquiryWhereInput {
  return {
    NOT: {
      OR: [
        { missingFieldsJson: { equals: Prisma.DbNull } },
        { missingFieldsJson: { equals: [] } },
      ],
    },
  };
}

/** Planning inquiries last updated before `now - agingHours`. */
export function inquiryPlanningStaleWhere(
  agingHours: number,
  now: Date = new Date(),
): Prisma.InquiryWhereInput {
  const raw = Number(agingHours);
  const hours = Number.isFinite(raw)
    ? Math.max(1, Math.min(72, Math.floor(raw) || 1))
    : 4;
  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
  return { updatedAt: { lt: cutoff } };
}

export function buildInquiryListWhere(
  organizationId: string,
  filters: InquiryListFilters,
): Prisma.InquiryWhereInput {
  const where: Prisma.InquiryWhereInput = {
    organizationId,
    deletedAt: null,
  };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.queue === 'planning') {
    where.status = { in: [...INQUIRY_PLANNING_STATUSES] };
  } else if (filters.queue === 'active') {
    where.status = { not: 'lost' };
  } else if (filters.queue === 'my_requests') {
    where.status = { not: 'lost' };
    const viewerId = filters.viewerUserId;
    if (viewerId) {
      where.OR = [{ ownerId: null }, { ownerId: viewerId }];
    }
  }

  if (filters.ownerId !== undefined) {
    where.ownerId = filters.ownerId;
  }

  const andParts: Prisma.InquiryWhereInput[] = [];
  if (filters.incomplete) {
    andParts.push(inquiryHasMissingFieldsWhere());
  }
  if (filters.stale) {
    // Stale is a planning-queue cue — force planning statuses when filtering.
    where.status = { in: [...INQUIRY_PLANNING_STATUSES] };
    andParts.push(
      inquiryPlanningStaleWhere(filters.agingHours ?? 4),
    );
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    andParts.push({
      OR: [
        { inquiryNumber: { contains: q } },
        { travelType: { contains: q } },
        { party: { displayName: { contains: q } } },
      ],
    });
  }

  if (andParts.length) {
    return { AND: [where, ...andParts] };
  }

  return where;
}

export type InquiryQueueSummary = {
  myRequests: number;
  planning: number;
  planningIncomplete: number;
  planningUnassigned: number;
  planningStale: number;
  agingHours: number;
};

export async function getInquiryQueueSummary(
  prisma: PrismaService['inquiry'],
  organizationId: string,
  viewerUserId: string,
  agingHours = 4,
): Promise<InquiryQueueSummary> {
  const raw = Number(agingHours);
  const hours = Number.isFinite(raw)
    ? Math.max(1, Math.min(72, Math.floor(raw) || 1))
    : 4;
  const base = { organizationId, deletedAt: null };
  const planningWhere: Prisma.InquiryWhereInput = {
    ...base,
    status: { in: [...INQUIRY_PLANNING_STATUSES] },
  };
  const myRequestsWhere: Prisma.InquiryWhereInput = {
    ...base,
    status: { not: 'lost' },
    OR: [{ ownerId: null }, { ownerId: viewerUserId }],
  };

  const [
    myRequests,
    planning,
    planningIncomplete,
    planningUnassigned,
    planningStale,
  ] = await Promise.all([
    prisma.count({ where: myRequestsWhere }),
    prisma.count({ where: planningWhere }),
    prisma.count({
      where: { AND: [planningWhere, inquiryHasMissingFieldsWhere()] },
    }),
    prisma.count({ where: { ...planningWhere, ownerId: null } }),
    prisma.count({
      where: {
        AND: [planningWhere, inquiryPlanningStaleWhere(hours)],
      },
    }),
  ]);

  return {
    myRequests,
    planning,
    planningIncomplete,
    planningUnassigned,
    planningStale,
    agingHours: hours,
  };
}
