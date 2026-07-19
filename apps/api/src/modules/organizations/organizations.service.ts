import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, PARTNER_ROLE_PERMISSION_MAP, ROLE_PERMISSION_MAP } from '@wayrune/config';
import { permissionAllowedForOrgKind, roleAllowedForOrgKind } from '@wayrune/rbac';
import type {
  CreateAdditionalOrganizationInput,
  UpdateOrganizationSettingsInput,
} from '@wayrune/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { calcQuoteTotals, slugify, type AuthUser } from '../../common/helpers';
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
import { buildOnboardingStatus } from './onboarding-status';
import {
  DEMO_TRIP_SPEC,
  demoTripDateRange,
  FIT_TEMPLATES_PACK_ID,
  listStarterPackCatalog,
  resolveStarterPackTemplates,
  summarizeStarterPackInstall,
  buildDemoTripInstallMeta,
} from './agency-starter-pack';
import {
  fetchFrankfurterOrgFxRates,
  mergeOrgFxRatesAfterRefresh,
} from './org-fx-refresh';
import {
  defaultValidUntilDate,
  syncTermsWithValidUntil,
} from '../quotations/quote-validity';

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
      where: { organizationId, isActive: true, deletedAt: null },
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

  /**
   * Pull Frankfurter/ECB rates into settingsJson.fxRates (org book per 1 foreign).
   * Skips codes Frankfurter does not publish (e.g. AED) — prior values kept.
   */
  async refreshFxRates(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { currency: true, settingsJson: true },
    });
    const baseCurrency = String(org.currency || 'INR').trim().toUpperCase() || 'INR';

    let fetched: Awaited<ReturnType<typeof fetchFrankfurterOrgFxRates>>;
    try {
      fetched = await fetchFrankfurterOrgFxRates({ baseCurrency });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'FX refresh failed';
      throw new BadRequestException(message);
    }

    const settings = asRecord(org.settingsJson);
    const priorFx = asRecord(settings.fxRates);
    const fxRates = mergeOrgFxRatesAfterRefresh(priorFx, fetched.rates);
    const nextSettings = {
      ...settings,
      fxRates,
      fxRatesMeta: fetched.meta,
    };

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settingsJson: nextSettings as Prisma.InputJsonValue },
      select: { currency: true, settingsJson: true },
    });

    return {
      currency: updated.currency,
      fxRates,
      fxRatesMeta: fetched.meta,
      settingsJson: maskIntegrationSecretsInSettings(updated.settingsJson),
    };
  }

  /** Agency setup checklist — counts + branding/WhatsApp flags (no new tables). */
  async getOnboardingStatus(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { brandingJson: true, settingsJson: true },
    });
    const branding = asRecord(org.brandingJson);
    const settings = asRecord(org.settingsJson);
    const integrations = asRecord(settings.integrations);
    const wa = asRecord(integrations.whatsapp);

    const [
      supplierCount,
      hotelRateCount,
      transferFareCount,
      quoteTemplateCount,
      quotationCount,
      acceptedQuoteCount,
    ] = await Promise.all([
      this.prisma.supplier.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.supplierHotelRate.count({ where: { organizationId } }),
      this.prisma.transferFare.count({ where: { organizationId } }),
      this.prisma.quoteTemplate.count({ where: { organizationId } }),
      this.prisma.quotation.count({ where: { organizationId } }),
      this.prisma.quotationVersion.count({
        where: {
          status: 'accepted',
          quotation: { organizationId },
        },
      }),
    ]);

    const status = buildOnboardingStatus({
      hasLogo:
        typeof branding.logoUrl === 'string' && Boolean(branding.logoUrl.trim()),
      hasPrimaryColor:
        typeof branding.primaryColor === 'string' &&
        Boolean(branding.primaryColor.trim()) &&
        branding.primaryColor.trim().toLowerCase() !== '#0f6e56',
      supplierCount,
      hotelRateCount,
      transferFareCount,
      quoteTemplateCount,
      quotationCount,
      acceptedQuoteCount,
      whatsappEnabled: Boolean(wa.enabled),
    });

    return {
      ...status,
      generatedAt: new Date().toISOString(),
    };
  }

  listStarterPacks() {
    return { items: listStarterPackCatalog() };
  }

  async installStarterPack(user: AuthUser, packId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { id: true, kind: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.kind !== 'travel_agency' && org.kind !== 'dmc') {
      throw new ForbiddenException('Starter packs are only for travel agencies and DMCs');
    }

    const specs = resolveStarterPackTemplates(packId);
    if (!specs) {
      throw new BadRequestException(`Unknown starter pack: ${packId}`);
    }

    const createdNames: string[] = [];
    const skippedNames: string[] = [];
    for (const spec of specs) {
      const existing = await this.prisma.quoteTemplate.findFirst({
        where: { organizationId: user.organizationId, name: spec.name },
        select: { id: true },
      });
      if (existing) {
        skippedNames.push(spec.name);
        continue;
      }
      await this.prisma.quoteTemplate.create({
        data: {
          organizationId: user.organizationId,
          name: spec.name,
          contentJson: spec.contentJson as Prisma.InputJsonValue,
        },
      });
      createdNames.push(spec.name);
    }

    const demo = await this.ensureDemoTrip(user, specs);
    const summary = summarizeStarterPackInstall({
      createdNames,
      skippedNames,
      createdTrips: demo.created ? [demo.tripNumber] : [],
      skippedTrips: demo.created ? [] : [demo.tripNumber],
    });

    return {
      packId,
      ...summary,
      tripId: demo.tripId,
      demoTrip: buildDemoTripInstallMeta({
        tripId: demo.tripId,
        created: demo.created,
        tripNumber: demo.tripNumber,
        title: demo.title,
      }),
      walkthroughHref: demo.tripId
        ? `/trips/${demo.tripId}?tab=quotations`
        : '/work/quotation-drafts?walkthrough=1',
    };
  }

  /** Idempotent sample planning trip + draft quote from the Darjeeling FIT template. */
  private async ensureDemoTrip(
    user: AuthUser,
    specs: Array<{ name: string; contentJson: Record<string, unknown> }>,
  ): Promise<{
    tripId: string;
    tripNumber: string;
    title: string;
    created: boolean;
  }> {
    const existing = await this.prisma.trip.findUnique({
      where: {
        organizationId_tripNumber: {
          organizationId: user.organizationId,
          tripNumber: DEMO_TRIP_SPEC.tripNumber,
        },
      },
      select: { id: true, title: true },
    });
    if (existing) {
      // Polish legacy demo title without rewriting the whole seed trip.
      if (
        existing.title === 'Darjeeling hills — sample' ||
        !existing.title?.trim()
      ) {
        await this.prisma.trip.update({
          where: { id: existing.id },
          data: { title: DEMO_TRIP_SPEC.title },
        });
        return {
          tripId: existing.id,
          tripNumber: DEMO_TRIP_SPEC.tripNumber,
          title: DEMO_TRIP_SPEC.title,
          created: false,
        };
      }
      return {
        tripId: existing.id,
        tripNumber: DEMO_TRIP_SPEC.tripNumber,
        title: existing.title,
        created: false,
      };
    }

    let party = await this.prisma.party.findFirst({
      where: {
        organizationId: user.organizationId,
        displayName: DEMO_TRIP_SPEC.partyDisplayName,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!party) {
      party = await this.prisma.party.create({
        data: {
          organizationId: user.organizationId,
          type: 'individual',
          displayName: DEMO_TRIP_SPEC.partyDisplayName,
          email: 'demo.guest@example.com',
          phone: '+919900001111',
          notes: 'Starter-pack sample guest — safe to edit or delete.',
          metadataJson: { starterPack: FIT_TEMPLATES_PACK_ID },
          createdBy: user.sub,
          updatedBy: user.sub,
        },
        select: { id: true },
      });
    }

    const { startDate, endDate } = demoTripDateRange();
    const template =
      specs.find((s) => s.name === DEMO_TRIP_SPEC.templateName) || specs[0];
    const content = template?.contentJson || {};
    const rawItems = Array.isArray(content.items) ? content.items : [];
    const items: Record<string, unknown>[] = rawItems.map((row, i) => {
      const item =
        row && typeof row === 'object' && !Array.isArray(row)
          ? (row as Record<string, unknown>)
          : {};
      return {
        ...item,
        id:
          typeof item.id === 'string' && item.id.trim()
            ? `demo-${item.id}`
            : `demo-line-${i + 1}`,
      };
    });
    const totals = calcQuoteTotals(
      items.map((item) => ({
        quantity: Number(item.quantity) || 1,
        unitCost:
          item.unitCost == null || item.unitCost === ''
            ? null
            : Number(item.unitCost),
        unitSell:
          item.unitSell == null || item.unitSell === ''
            ? null
            : Number(item.unitSell),
        taxPercent: Number(item.taxPercent) || 0,
      })),
    );
    const validUntil = defaultValidUntilDate(7);
    const termsBase =
      typeof content.terms === 'string'
        ? content.terms
        : Array.isArray(content.terms)
          ? content.terms.filter((t): t is string => typeof t === 'string').join('\n')
          : null;
    const terms = syncTermsWithValidUntil(termsBase, validUntil);
    const inclusions = Array.isArray(content.inclusions)
      ? content.inclusions.filter((x): x is string => typeof x === 'string').join('\n')
      : typeof content.inclusions === 'string'
        ? content.inclusions
        : null;
    const exclusions = Array.isArray(content.exclusions)
      ? content.exclusions.filter((x): x is string => typeof x === 'string').join('\n')
      : typeof content.exclusions === 'string'
        ? content.exclusions
        : null;
    const currency =
      typeof content.currency === 'string' && content.currency.length === 3
        ? content.currency
        : 'INR';

    const quoteCount = await this.prisma.quotation.count({
      where: { organizationId: user.organizationId },
    });

    const trip = await this.prisma.trip.create({
      data: {
        organizationId: user.organizationId,
        tripNumber: DEMO_TRIP_SPEC.tripNumber,
        title: DEMO_TRIP_SPEC.title,
        status: 'planning',
        partyId: party.id,
        ownerId: user.sub,
        startDate: new Date(`${startDate}T12:00:00.000Z`),
        endDate: new Date(`${endDate}T12:00:00.000Z`),
        destinationsJson: [
          { placeId: null, name: DEMO_TRIP_SPEC.destinationName, kind: 'city' },
        ],
        createdBy: user.sub,
        updatedBy: user.sub,
        travellers: {
          create: {
            isLead: true,
            traveller: {
              create: {
                organizationId: user.organizationId,
                fullName: DEMO_TRIP_SPEC.travellerFullName,
                type: 'adult',
                email: 'demo.guest@example.com',
                createdBy: user.sub,
                updatedBy: user.sub,
              },
            },
          },
        },
        itineraries: {
          create: {
            organizationId: user.organizationId,
            title: 'Main itinerary',
            versions: {
              create: {
                versionNumber: 1,
                label: 'v1',
                status: 'draft',
                contentJson: { days: [] },
                createdBy: user.sub,
              },
            },
          },
        },
        quotations: {
          create: {
            organizationId: user.organizationId,
            quoteNumber: `QT-DEMO-${String(quoteCount + 1).padStart(3, '0')}`,
            versions: {
              create: {
                versionNumber: 1,
                label: 'v1 (sample)',
                status: 'draft',
                currency,
                validUntil,
                itemsJson: items as unknown as Prisma.InputJsonValue,
                inclusions,
                exclusions,
                terms,
                ...totals,
                createdBy: user.sub,
              },
            },
          },
        },
      },
      select: { id: true },
    });

    return {
      tripId: trip.id,
      tripNumber: DEMO_TRIP_SPEC.tripNumber,
      title: DEMO_TRIP_SPEC.title,
      created: true,
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
