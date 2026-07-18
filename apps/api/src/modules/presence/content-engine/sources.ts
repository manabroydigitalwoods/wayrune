import type { PrismaService } from '../../../prisma/prisma.service';
import type { PresenceDataSourceQuery } from '@wayrune/contracts';
import type { DataSourceResult, ResolveContext } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickFields(
  item: Record<string, unknown>,
  fields?: string[],
): Record<string, unknown> {
  if (!fields?.length) return item;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in item) out[f] = item[f];
  }
  return out;
}

function normalizeDataSource(
  props: Record<string, unknown>,
): PresenceDataSourceQuery | null {
  const ds = asRecord(props.dataSource);
  if (typeof ds.source === 'string' && ds.source.trim()) {
    return {
      source: ds.source.trim(),
      filters: asRecord(ds.filters),
      sort:
        ds.sort && typeof ds.sort === 'object'
          ? {
              field: String((ds.sort as { field?: string }).field ?? 'updatedAt'),
              dir:
                (ds.sort as { dir?: string }).dir === 'asc' ? 'asc' : ('desc' as const),
            }
          : undefined,
      limit: typeof ds.limit === 'number' ? ds.limit : undefined,
      fields: Array.isArray(ds.fields)
        ? ds.fields.filter((f): f is string => typeof f === 'string')
        : undefined,
    };
  }
  // Compat: liveFrom: "trips"
  if (props.liveFrom === 'trips') {
    return { source: 'trips', limit: 6 };
  }
  return null;
}

export { normalizeDataSource };

export async function querySource(
  prisma: PrismaService,
  ctx: ResolveContext,
  query: PresenceDataSourceQuery,
): Promise<DataSourceResult> {
  const limit = Math.min(Math.max(query.limit ?? 12, 1), 100);
  const source = query.source;

  if (source === 'trips') {
    return queryTrips(prisma, ctx, query, limit);
  }
  if (source === 'quotations') {
    return queryQuotations(prisma, ctx, query, limit);
  }
  if (source.startsWith('collection:')) {
    const key = source.slice('collection:'.length);
    return queryCollection(prisma, ctx, key, query, limit);
  }

  return { items: [], meta: { source, total: 0 } };
}

async function queryTrips(
  prisma: PrismaService,
  ctx: ResolveContext,
  query: PresenceDataSourceQuery,
  limit: number,
): Promise<DataSourceResult> {
  const filters = asRecord(query.filters);
  const statusFilter = Array.isArray(filters.status)
    ? filters.status.filter((s): s is string => typeof s === 'string')
    : typeof filters.status === 'string'
      ? [filters.status]
      : undefined;

  const trips = await prisma.trip.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      ...(statusFilter?.length ? { status: { in: statusFilter } } : {}),
    },
    orderBy:
      query.sort?.field === 'title'
        ? { title: query.sort.dir }
        : query.sort?.field === 'createdAt'
          ? { createdAt: query.sort.dir }
          : { updatedAt: query.sort?.dir ?? 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      destinationsJson: true,
      updatedAt: true,
    },
  });

  const items = trips.map((trip) => {
    const destinations = Array.isArray(trip.destinationsJson)
      ? trip.destinationsJson
          .map((d) => {
            if (typeof d === 'string') return d;
            const rec = asRecord(d);
            return str(rec.name ?? rec.city ?? rec.label);
          })
          .filter(Boolean)
          .join(', ')
      : '';
    const item: Record<string, unknown> = {
      id: trip.id,
      title: trip.title,
      name: trip.title,
      status: trip.status,
      destinations,
      subtitle: destinations || trip.status,
      body: destinations || trip.status,
      tagline: destinations || trip.status,
      href: '/contact',
      updatedAt: trip.updatedAt.toISOString(),
    };
    return pickFields(item, query.fields);
  });

  return { items, meta: { source: 'trips', total: items.length } };
}

async function queryQuotations(
  prisma: PrismaService,
  ctx: ResolveContext,
  query: PresenceDataSourceQuery,
  limit: number,
): Promise<DataSourceResult> {
  const quotations = await prisma.quotation.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { updatedAt: query.sort?.dir ?? 'desc' },
    take: limit * 2,
    include: {
      trip: { select: { id: true, title: true, status: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        select: {
          status: true,
          sellTotal: true,
          currency: true,
          label: true,
        },
      },
    },
  });

  const filters = asRecord(query.filters);
  const statusFilter = Array.isArray(filters.status)
    ? filters.status.filter((s): s is string => typeof s === 'string')
    : undefined;

  const items = quotations
    .map((q) => {
      const ver = q.versions[0];
      const status = ver?.status ?? 'draft';
      if (statusFilter?.length && !statusFilter.includes(status)) return null;
      // Prefer published/featured-ish statuses for public sites
      if (
        !ctx.preview &&
        !statusFilter?.length &&
        !['sent', 'accepted', 'approved'].includes(status)
      ) {
        return null;
      }
      const item: Record<string, unknown> = {
        id: q.id,
        title: q.trip?.title ?? q.quoteNumber,
        name: q.trip?.title ?? q.quoteNumber,
        quoteNumber: q.quoteNumber,
        status,
        subtitle: ver?.label || status,
        price: ver ? `${ver.currency} ${ver.sellTotal}` : '',
        href: `/quotations/${q.id}`,
        updatedAt: q.updatedAt.toISOString(),
      };
      return pickFields(item, query.fields);
    })
    .filter((x): x is Record<string, unknown> => Boolean(x))
    .slice(0, limit);

  return { items, meta: { source: 'quotations', total: items.length } };
}

async function queryCollection(
  prisma: PrismaService,
  ctx: ResolveContext,
  key: string,
  query: PresenceDataSourceQuery,
  limit: number,
): Promise<DataSourceResult> {
  const collection = await prisma.presenceCollection.findFirst({
    where: { siteId: ctx.site.id, key },
  });
  if (!collection) {
    return { items: [], meta: { source: `collection:${key}`, total: 0 } };
  }

  const entries = await prisma.presenceCollectionEntry.findMany({
    where: {
      collectionId: collection.id,
      ...(ctx.preview ? {} : { status: 'published' }),
    },
    orderBy: { publishedAt: query.sort?.dir ?? 'desc' },
    take: limit,
  });

  const listingBase = collection.listingPath || `/${key}`;
  const items = entries.map((entry) => {
    const data = asRecord(entry.dataJson);
    const item: Record<string, unknown> = {
      id: entry.id,
      slug: entry.slug,
      title: entry.title,
      name: entry.title,
      ...data,
      href: `${listingBase.replace(/\/$/, '')}/${entry.slug}`,
      publishedAt: entry.publishedAt?.toISOString() ?? null,
    };
    return pickFields(item, query.fields);
  });

  return { items, meta: { source: `collection:${key}`, total: items.length } };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}
