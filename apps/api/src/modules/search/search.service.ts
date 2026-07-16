import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/helpers';

export const SEARCH_TYPES = [
  'party',
  'trip',
  'lead',
  'quotation',
  'service_request',
  'document',
  'asset',
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export type SearchHit = {
  type: SearchType;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

function parseTypes(raw?: string): SearchType[] | null {
  if (!raw?.trim()) return null;
  const wanted = new Set(
    raw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
  const selected = SEARCH_TYPES.filter((t) => wanted.has(t));
  return selected.length ? selected : null;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(user: AuthUser, q: string, typesRaw?: string) {
    const query = q.trim();
    const typesFilter = parseTypes(typesRaw);
    const orgId = user.organizationId;

    if (query.length < 2) {
      return {
        query,
        types: typesFilter,
        facets: Object.fromEntries(SEARCH_TYPES.map((t) => [t, 0])) as Record<
          SearchType,
          number
        >,
        results: [] as SearchHit[],
      };
    }

    const take = typesFilter?.length === 1 ? 16 : 8;
    const want = (t: SearchType) => !typesFilter || typesFilter.includes(t);

    const [
      parties,
      trips,
      leads,
      quotations,
      srs,
      docs,
      assets,
      partyCount,
      tripCount,
      leadCount,
      quotationCount,
      srCount,
      docCount,
      assetCount,
    ] = await Promise.all([
      want('party')
        ? this.prisma.party.findMany({
            where: {
              organizationId: orgId,
              deletedAt: null,
              OR: [
                { displayName: { contains: query } },
                { email: { contains: query } },
                { phone: { contains: query } },
              ],
            },
            take,
            orderBy: { updatedAt: 'desc' },
            select: { id: true, displayName: true, email: true, type: true },
          })
        : Promise.resolve([]),
      want('trip')
        ? this.prisma.trip.findMany({
            where: {
              organizationId: orgId,
              deletedAt: null,
              OR: [
                { title: { contains: query } },
                { tripNumber: { contains: query } },
                { party: { displayName: { contains: query } } },
              ],
            },
            take,
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              title: true,
              tripNumber: true,
              status: true,
              party: { select: { displayName: true } },
            },
          })
        : Promise.resolve([]),
      want('lead')
        ? this.prisma.lead.findMany({
            where: {
              organizationId: orgId,
              deletedAt: null,
              OR: [
                { title: { contains: query } },
                { contactName: { contains: query } },
                { email: { contains: query } },
                { phone: { contains: query } },
              ],
            },
            take,
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              title: true,
              contactName: true,
              email: true,
              stage: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      want('quotation')
        ? this.prisma.quotation.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { quoteNumber: { contains: query } },
                { trip: { title: { contains: query } } },
                { trip: { tripNumber: { contains: query } } },
              ],
            },
            take,
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              quoteNumber: true,
              tripId: true,
              trip: { select: { title: true, tripNumber: true } },
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
                select: { status: true, sellTotal: true, currency: true },
              },
            },
          })
        : Promise.resolve([]),
      want('service_request')
        ? this.prisma.serviceRequest.findMany({
            where: {
              OR: [
                { buyerOrganizationId: orgId },
                { sellerOrganizationId: orgId },
              ],
              AND: {
                OR: [
                  { title: { contains: query } },
                  { confirmationRef: { contains: query } },
                  { serviceType: { contains: query } },
                ],
              },
            },
            take,
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              title: true,
              status: true,
              serviceType: true,
              confirmationRef: true,
            },
          })
        : Promise.resolve([]),
      want('document')
        ? this.prisma.commercialDocument.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { label: { contains: query } },
                { documentNumber: { contains: query } },
              ],
            },
            take,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              label: true,
              documentNumber: true,
              docType: true,
              status: true,
              tripId: true,
            },
          })
        : Promise.resolve([]),
      want('asset')
        ? this.prisma.partnerAsset.findMany({
            where: {
              organizationId: orgId,
              deletedAt: null,
              OR: [
                { name: { contains: query } },
                { assetKind: { contains: query } },
              ],
            },
            take,
            orderBy: { updatedAt: 'desc' },
            select: { id: true, name: true, assetKind: true },
          })
        : Promise.resolve([]),
      // Facet counts always across all types for the query (so chips stay useful)
      this.prisma.party.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [
            { displayName: { contains: query } },
            { email: { contains: query } },
            { phone: { contains: query } },
          ],
        },
      }),
      this.prisma.trip.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [
            { title: { contains: query } },
            { tripNumber: { contains: query } },
            { party: { displayName: { contains: query } } },
          ],
        },
      }),
      this.prisma.lead.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [
            { title: { contains: query } },
            { contactName: { contains: query } },
            { email: { contains: query } },
            { phone: { contains: query } },
          ],
        },
      }),
      this.prisma.quotation.count({
        where: {
          organizationId: orgId,
          OR: [
            { quoteNumber: { contains: query } },
            { trip: { title: { contains: query } } },
            { trip: { tripNumber: { contains: query } } },
          ],
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          OR: [{ buyerOrganizationId: orgId }, { sellerOrganizationId: orgId }],
          AND: {
            OR: [
              { title: { contains: query } },
              { confirmationRef: { contains: query } },
              { serviceType: { contains: query } },
            ],
          },
        },
      }),
      this.prisma.commercialDocument.count({
        where: {
          organizationId: orgId,
          OR: [
            { label: { contains: query } },
            { documentNumber: { contains: query } },
          ],
        },
      }),
      this.prisma.partnerAsset.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [{ name: { contains: query } }, { assetKind: { contains: query } }],
        },
      }),
    ]);

    const results: SearchHit[] = [
      ...parties.map((p) => ({
        type: 'party' as const,
        id: p.id,
        title: p.displayName,
        subtitle: p.email || p.type,
        href: `/parties/${p.id}`,
      })),
      ...trips.map((t) => ({
        type: 'trip' as const,
        id: t.id,
        title: `${t.tripNumber} · ${t.title}`,
        subtitle: t.party?.displayName || t.status,
        href: `/trips/${t.id}`,
      })),
      ...leads.map((l) => ({
        type: 'lead' as const,
        id: l.id,
        title: l.title,
        subtitle: [l.contactName, l.email, l.stage?.name].filter(Boolean).join(' · '),
        href: `/leads/${l.id}`,
      })),
      ...quotations.map((qrow) => {
        const latest = qrow.versions[0];
        return {
          type: 'quotation' as const,
          id: qrow.id,
          title: qrow.quoteNumber,
          subtitle: [
            qrow.trip?.tripNumber,
            qrow.trip?.title,
            latest?.status,
          ]
            .filter(Boolean)
            .join(' · '),
          href: `/trips/${qrow.tripId}`,
        };
      }),
      ...srs.map((s) => ({
        type: 'service_request' as const,
        id: s.id,
        title: s.title,
        subtitle: [s.serviceType, s.confirmationRef, s.status].filter(Boolean).join(' · '),
        href: `/trips?ops=1`,
      })),
      ...docs.map((d) => ({
        type: 'document' as const,
        id: d.id,
        title: d.label,
        subtitle: [d.docType, d.documentNumber, d.status].filter(Boolean).join(' · '),
        href: d.tripId ? `/trips/${d.tripId}` : `/`,
      })),
      ...assets.map((a) => ({
        type: 'asset' as const,
        id: a.id,
        title: a.name,
        subtitle: a.assetKind,
        href: `/`,
      })),
    ];

    const facets: Record<SearchType, number> = {
      party: partyCount,
      trip: tripCount,
      lead: leadCount,
      quotation: quotationCount,
      service_request: srCount,
      document: docCount,
      asset: assetCount,
    };

    return { query, types: typesFilter, facets, results };
  }
}
