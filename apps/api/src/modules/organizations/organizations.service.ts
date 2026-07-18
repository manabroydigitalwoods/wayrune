import { Injectable } from '@nestjs/common';
import { PERMISSIONS, PARTNER_ROLE_PERMISSION_MAP, ROLE_PERMISSION_MAP } from '@wayrune/config';
import { permissionAllowedForOrgKind, roleAllowedForOrgKind } from '@wayrune/rbac';
import type {
  CreateAdditionalOrganizationInput,
  UpdateOrganizationSettingsInput,
} from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify, type AuthUser } from '../../common/helpers';
import { PartnerAssetsService } from '../partner-assets/partner-assets.service';
import {
  isPartnerOrgKind,
  orgKindToAssetKind,
} from '../partner-assets/partner-assets.helpers';
import { OrgIdentityService } from './org-identity.service';
import {
  ensureOrgPresenceFormPresets,
  ensureSystemPresenceModuleDefinitions,
  ensureSystemPresenceTemplates,
  ensureSystemPresenceThemes,
} from '../presence/presence-seed';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const DEFAULT_STAGES = [
  { name: 'New', key: 'new', position: 1 },
  { name: 'Attempted Contact', key: 'attempted_contact', position: 2 },
  { name: 'Contacted', key: 'contacted', position: 3 },
  { name: 'Requirements Pending', key: 'requirements_pending', position: 4 },
  { name: 'Qualified', key: 'qualified', position: 5 },
  { name: 'Proposal Sent', key: 'proposal_sent', position: 6 },
  { name: 'Negotiation', key: 'negotiation', position: 7 },
  { name: 'Won', key: 'won', position: 8, isWon: true },
  { name: 'Lost', key: 'lost', position: 9, isLost: true },
];

const DEFAULT_SOURCES = [
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

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private partnerAssets: PartnerAssetsService,
    private orgIdentity: OrgIdentityService,
  ) {}

  async ensurePermissions() {
    for (const key of PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { key },
        create: { key, description: key },
        update: {},
      });
    }
  }

  async createOrganizationWithOwner(input: {
    name: string;
    ownerUserId: string;
    kind?: string;
    city?: string | null;
    placeId?: string | null;
    region?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    capacityHint?: string | null;
    discoverable?: boolean;
  }) {
    await this.ensurePermissions();
    const baseSlug = slugify(input.name) || 'org';
    let slug = baseSlug;
    let i = 1;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${i++}`;
    }

    const kind = input.kind || 'travel_agency';
    const isPartnerKind = isPartnerOrgKind(kind);

    const org = await this.prisma.$transaction(async (tx) => {
      const publicCode = await this.orgIdentity.allocatePublicCode(tx);
      const subdomain = await this.orgIdentity.allocateSubdomain(input.name, tx);
      const created = await tx.organization.create({
        data: {
          name: input.name,
          slug,
          publicCode,
          subdomain,
          kind,
          settingsJson: { indiaReady: true, defaultTaxPercent: 5 },
          brandingJson: { primaryColor: '#0f6e56', companyName: input.name },
          partnerProfile: {
            create: {
              discoverable: input.discoverable ?? isPartnerKind,
              city: input.city || null,
              region: input.region || null,
              country: 'India',
              contactEmail: input.contactEmail || null,
              contactPhone: input.contactPhone || null,
              capacityHint: input.capacityHint || null,
              serviceTagsJson: [],
            },
          },
        },
      });

      const allPerms = await tx.permission.findMany();
      const permByKey = Object.fromEntries(allPerms.map((p) => [p.key, p.id]));

      const roleMap = isPartnerKind ? PARTNER_ROLE_PERMISSION_MAP : ROLE_PERMISSION_MAP;
      for (const [roleKey, permKeys] of Object.entries(roleMap)) {
        // Deny-by-default role availability: only materialize roles valid for
        // this org kind (e.g. a hotel gets front_desk/housekeeping but not
        // waiter/fleet_manager). `owner` is always allowed for its family.
        if (!roleAllowedForOrgKind(roleKey, kind)) continue;
        // Only grant permissions valid for this org kind (defense in depth with
        // the token-mint clamp).
        const scopedPermKeys = permKeys.filter((k) => permissionAllowedForOrgKind(k, kind));
        const role = await tx.role.create({
          data: {
            organizationId: created.id,
            name: roleKey.replace(/_/g, ' '),
            key: roleKey,
            isSystem: true,
          },
        });
        await tx.rolePermission.createMany({
          data: scopedPermKeys
            .filter((k) => permByKey[k])
            .map((k) => ({ roleId: role.id, permissionId: permByKey[k] })),
        });
      }

      const ownerRole = await tx.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId: created.id, key: 'owner' } },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          organizationId: created.id,
          userId: input.ownerUserId,
          isOwner: true,
        },
      });
      await tx.membershipRole.create({
        data: { membershipId: membership.id, roleId: ownerRole.id },
      });

      // Agency sales CRM bootstrap; partner kinds skip lead pipeline noise.
      if (!isPartnerKind) {
        const pipeline = await tx.pipeline.create({
          data: {
            organizationId: created.id,
            name: 'Default Sales',
            isDefault: true,
            stages: {
              create: DEFAULT_STAGES.map((s) => ({
                name: s.name,
                key: s.key,
                position: s.position,
                isWon: !!s.isWon,
                isLost: !!s.isLost,
              })),
            },
          },
        });

        await tx.leadSource.createMany({
          data: DEFAULT_SOURCES.map((s) => ({
            organizationId: created.id,
            name: s.name,
            key: s.key,
          })),
        });

        void pipeline;
      }

      return created;
    });

    if (isPartnerKind) {
      const asset = await this.partnerAssets.ensureDefaultAsset(
        org.id,
        orgKindToAssetKind(kind),
        org.name,
        input.ownerUserId,
      );
      if (input.placeId) {
        await this.prisma.partnerAsset.update({
          where: { id: asset.id },
          data: { placeId: input.placeId },
        });
      }
      await this.partnerAssets.ensureStayStarterInventory(asset);
    }

    await ensureSystemPresenceThemes(this.prisma);
    await ensureSystemPresenceModuleDefinitions(this.prisma);
    await ensureSystemPresenceTemplates(this.prisma);
    await ensureOrgPresenceFormPresets(this.prisma, org.id, kind);

    return org;
  }

  /** Same login adds another business (hotel, restaurant, second agency…). */
  async createAdditionalOrganization(
    user: AuthUser,
    input: CreateAdditionalOrganizationInput,
  ) {
    const org = await this.createOrganizationWithOwner({
      name: input.name.trim(),
      ownerUserId: user.sub,
      kind: input.kind,
      city: input.city || null,
      placeId: input.placeId || null,
      region: input.region || null,
      contactEmail: input.contactEmail || null,
      contactPhone: input.contactPhone || null,
      capacityHint: input.capacityHint || null,
      discoverable:
        input.discoverable ??
        (input.kind !== 'travel_agency' && input.kind !== 'dmc'),
    });
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      kind: org.kind,
      publicCode: org.publicCode,
      subdomain: org.subdomain,
    };
  }

  async listMembershipsForUser(userId: string) {
    const rows = await this.prisma.organizationMembership.findMany({
      where: { userId, isActive: true, deletedAt: null },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            kind: true,
            publicCode: true,
            subdomain: true,
            customDomain: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      organizationId: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      kind: m.organization.kind,
      publicCode: m.organization.publicCode,
      subdomain: m.organization.subdomain,
      customDomain: m.organization.customDomain,
      isOwner: m.isOwner,
    }));
  }

  async getSettings(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return {
      ...org,
      settingsJson: maskIntegrationSecretsInSettings(org.settingsJson),
    };
  }

  /** Upsert acquisition source keys so call-flow chips resolve on existing orgs. */
  async ensureDefaultLeadSources(organizationId: string) {
    for (const s of DEFAULT_SOURCES) {
      await this.prisma.leadSource.upsert({
        where: { organizationId_key: { organizationId, key: s.key } },
        create: { organizationId, name: s.name, key: s.key },
        update: { name: s.name },
      });
    }
  }

  async listMembers(organizationId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.user.id,
      fullName: m.user.fullName,
      email: m.user.email,
      membershipId: m.id,
    }));
  }

  async updateSettings(organizationId: string, data: UpdateOrganizationSettingsInput) {
    const current = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { brandingJson: true, settingsJson: true },
    });

    const brandingJson = data.brandingJson
      ? deepMerge(asRecord(current.brandingJson), data.brandingJson as Record<string, unknown>)
      : undefined;

    let incomingSettings = data.settingsJson
      ? deepMerge(asRecord(current.settingsJson), data.settingsJson as Record<string, unknown>)
      : undefined;

    if (incomingSettings) {
      incomingSettings = preserveIntegrationSecrets(
        asRecord(current.settingsJson),
        incomingSettings,
      );
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: data.name,
        timezone: data.timezone,
        currency: data.currency,
        taxLabel: data.taxLabel,
        ...(brandingJson
          ? { brandingJson: brandingJson as Prisma.InputJsonValue }
          : {}),
        ...(incomingSettings
          ? { settingsJson: incomingSettings as Prisma.InputJsonValue }
          : {}),
      },
    });

    return {
      ...updated,
      settingsJson: maskIntegrationSecretsInSettings(updated.settingsJson),
    };
  }
}

const SECRET_MASK = '••••••••';

function asNestedConfig(settings: Record<string, unknown>, key: string) {
  const integrations = asRecord(settings.integrations);
  return asRecord(integrations[key]);
}

function isSecretPlaceholder(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'string') return true;
  const v = value.trim();
  return !v || v === SECRET_MASK || v.startsWith('••••');
}

function maskSecretBlock(
  block: Record<string, unknown>,
  secretKeys: string[],
): Record<string, unknown> {
  if (!Object.keys(block).length) return block;
  const next = { ...block };
  for (const key of secretKeys) {
    const configured = Boolean(block[key] && !isSecretPlaceholder(block[key]));
    next[key] = configured ? SECRET_MASK : '';
    next[`${key}Configured`] = configured;
  }
  return next;
}

function preserveSecretBlock(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
  secretKeys: string[],
): Record<string, unknown> {
  if (!Object.keys(next).length) return next;
  const rest = { ...next };
  for (const key of secretKeys) {
    delete rest[`${key}Configured`];
    rest[key] = isSecretPlaceholder(next[key]) ? current[key] ?? '' : next[key];
  }
  return rest;
}

function maskIntegrationSecretsInSettings(settingsJson: unknown) {
  const settings = asRecord(settingsJson);
  const integrations = asRecord(settings.integrations);
  const wa = asRecord(integrations.whatsapp);
  const fb = asRecord(integrations.facebook);
  const email = asRecord(integrations.emailIngest);
  const website = asRecord(integrations.websiteIngest);
  const hubspot = asRecord(integrations.hubspot);
  if (
    !Object.keys(wa).length &&
    !Object.keys(fb).length &&
    !Object.keys(email).length &&
    !Object.keys(website).length &&
    !Object.keys(hubspot).length
  ) {
    return settingsJson;
  }

  return {
    ...settings,
    integrations: {
      ...integrations,
      ...(Object.keys(wa).length
        ? { whatsapp: maskSecretBlock(wa, ['accessToken', 'appSecret']) }
        : {}),
      ...(Object.keys(fb).length
        ? { facebook: maskSecretBlock(fb, ['accessToken', 'appSecret']) }
        : {}),
      ...(Object.keys(email).length
        ? { emailIngest: maskSecretBlock(email, ['sharedSecret']) }
        : {}),
      ...(Object.keys(website).length
        ? { websiteIngest: maskSecretBlock(website, ['sharedSecret']) }
        : {}),
      ...(Object.keys(hubspot).length
        ? { hubspot: maskSecretBlock(hubspot, ['accessToken']) }
        : {}),
    },
  };
}

function preserveIntegrationSecrets(
  currentSettings: Record<string, unknown>,
  nextSettings: Record<string, unknown>,
) {
  const nextIntegrations = asRecord(nextSettings.integrations);
  const currentWa = asNestedConfig(currentSettings, 'whatsapp');
  const currentFb = asNestedConfig(currentSettings, 'facebook');
  const currentEmail = asNestedConfig(currentSettings, 'emailIngest');
  const currentWebsite = asNestedConfig(currentSettings, 'websiteIngest');
  const currentHubspot = asNestedConfig(currentSettings, 'hubspot');
  const nextWa = asRecord(nextIntegrations.whatsapp);
  const nextFb = asRecord(nextIntegrations.facebook);
  const nextEmail = asRecord(nextIntegrations.emailIngest);
  const nextWebsite = asRecord(nextIntegrations.websiteIngest);
  const nextHubspot = asRecord(nextIntegrations.hubspot);

  return {
    ...nextSettings,
    integrations: {
      ...nextIntegrations,
      ...(Object.keys(nextWa).length
        ? { whatsapp: preserveSecretBlock(currentWa, nextWa, ['accessToken', 'appSecret']) }
        : {}),
      ...(Object.keys(nextFb).length
        ? { facebook: preserveSecretBlock(currentFb, nextFb, ['accessToken', 'appSecret']) }
        : {}),
      ...(Object.keys(nextEmail).length
        ? {
            emailIngest: preserveSecretBlock(currentEmail, nextEmail, ['sharedSecret']),
          }
        : {}),
      ...(Object.keys(nextWebsite).length
        ? {
            websiteIngest: preserveSecretBlock(currentWebsite, nextWebsite, ['sharedSecret']),
          }
        : {}),
      ...(Object.keys(nextHubspot).length
        ? { hubspot: preserveSecretBlock(currentHubspot, nextHubspot, ['accessToken']) }
        : {}),
    },
  };
}
