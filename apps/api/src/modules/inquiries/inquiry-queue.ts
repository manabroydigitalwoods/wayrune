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

  if (filters.incomplete) {
    return { AND: [where, inquiryHasMissingFieldsWhere()] };
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const textFilter: Prisma.InquiryWhereInput = {
      OR: [
        { inquiryNumber: { contains: q } },
        { travelType: { contains: q } },
        { party: { displayName: { contains: q } } },
      ],
    };
    return { AND: [where, textFilter] };
  }

  return where;
}

export type InquiryQueueSummary = {
  myRequests: number;
  planning: number;
  planningIncomplete: number;
  planningUnassigned: number;
};

export async function getInquiryQueueSummary(
  prisma: PrismaService['inquiry'],
  organizationId: string,
  viewerUserId: string,
): Promise<InquiryQueueSummary> {
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

  const [myRequests, planning, planningIncomplete, planningUnassigned] =
    await Promise.all([
      prisma.count({ where: myRequestsWhere }),
      prisma.count({ where: planningWhere }),
      prisma.count({
        where: { AND: [planningWhere, inquiryHasMissingFieldsWhere()] },
      }),
      prisma.count({ where: { ...planningWhere, ownerId: null } }),
    ]);

  return { myRequests, planning, planningIncomplete, planningUnassigned };
}
