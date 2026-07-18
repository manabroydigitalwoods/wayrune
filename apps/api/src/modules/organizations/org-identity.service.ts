import { Injectable, NotFoundException } from '@nestjs/common';
import { loadEnv } from '@wayrune/config';
import type { Organization, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/helpers';

const PUBLIC_CODE_START = 10001;

export type OrgIdentityRef =
  | { id: string }
  | { publicCode: number }
  | { slug: string }
  | { subdomain: string }
  | { customDomain: string }
  | { ref: string };

@Injectable()
export class OrgIdentityService {
  constructor(private prisma: PrismaService) {}

  siteBaseDomain() {
    return loadEnv().siteBaseDomain;
  }

  publicSiteUrl(org: { subdomain?: string | null; customDomain?: string | null }) {
    if (org.customDomain) {
      return `https://${org.customDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
    }
    if (org.subdomain) {
      return `https://${org.subdomain}.${this.siteBaseDomain()}`;
    }
    return null;
  }

  /** Host header → subdomain label (roytravels from roytravels.codepoetry.app). */
  subdomainFromHost(host: string): string | null {
    const h = host.split(':')[0]?.toLowerCase() || '';
    const base = this.siteBaseDomain().toLowerCase();
    if (h === base || h === `www.${base}`) return null;
    if (h.endsWith(`.${base}`)) {
      return h.slice(0, -(base.length + 1)) || null;
    }
    return null;
  }

  async allocatePublicCode(tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const max = await db.organization.aggregate({ _max: { publicCode: true } });
    const next = (max._max.publicCode ?? PUBLIC_CODE_START - 1) + 1;
    return Math.max(next, PUBLIC_CODE_START);
  }

  async allocateSubdomain(baseName: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const raw = slugify(baseName).replace(/-/g, '') || 'org';
    let candidate = raw.slice(0, 48);
    let i = 1;
    while (await db.organization.findFirst({ where: { subdomain: candidate } })) {
      candidate = `${raw.slice(0, 40)}${i++}`;
    }
    return candidate;
  }

  /**
   * Resolve org by cuid, numeric publicCode, slug, subdomain, customDomain,
   * or a ref string that may be any of those.
   */
  async resolve(input: OrgIdentityRef): Promise<Organization> {
    if ('id' in input && input.id) {
      const org = await this.prisma.organization.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (org) return org;
    }
    if ('publicCode' in input && input.publicCode != null) {
      const org = await this.prisma.organization.findFirst({
        where: { publicCode: input.publicCode, deletedAt: null },
      });
      if (org) return org;
    }
    if ('slug' in input && input.slug) {
      const org = await this.prisma.organization.findFirst({
        where: { slug: input.slug, deletedAt: null },
      });
      if (org) return org;
    }
    if ('subdomain' in input && input.subdomain) {
      const org = await this.prisma.organization.findFirst({
        where: { subdomain: input.subdomain.toLowerCase(), deletedAt: null },
      });
      if (org) return org;
    }
    if ('customDomain' in input && input.customDomain) {
      const domain = input.customDomain.toLowerCase().replace(/^www\./, '');
      const org = await this.prisma.organization.findFirst({
        where: {
          deletedAt: null,
          OR: [{ customDomain: domain }, { customDomain: `www.${domain}` }],
        },
      });
      if (org) return org;
    }
    if ('ref' in input && input.ref) {
      return this.resolveRef(input.ref);
    }
    throw new NotFoundException('Organization not found');
  }

  async resolveRef(ref: string): Promise<Organization> {
    const trimmed = ref.trim();
    if (!trimmed) throw new NotFoundException('Organization not found');

    if (/^\d+$/.test(trimmed)) {
      const code = Number.parseInt(trimmed, 10);
      const byCode = await this.prisma.organization.findFirst({
        where: { publicCode: code, deletedAt: null },
      });
      if (byCode) return byCode;
    }

    const byId = await this.prisma.organization.findFirst({
      where: { id: trimmed, deletedAt: null },
    });
    if (byId) return byId;

    const bySlug = await this.prisma.organization.findFirst({
      where: { slug: trimmed, deletedAt: null },
    });
    if (bySlug) return bySlug;

    const bySub = await this.prisma.organization.findFirst({
      where: { subdomain: trimmed.toLowerCase(), deletedAt: null },
    });
    if (bySub) return bySub;

    throw new NotFoundException('Organization not found');
  }

  /** Prefer publicCode string for public URLs; fall back to cuid. */
  publicOrgRef(org: { publicCode?: number | null; id: string }) {
    return org.publicCode != null ? String(org.publicCode) : org.id;
  }
}
