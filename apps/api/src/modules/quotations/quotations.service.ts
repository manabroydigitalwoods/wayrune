import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { buildAbility, hasPermission, redactFields } from '@wayrune/auth';
import { Prisma } from '@prisma/client';
import type {
  ApplyQuoteTemplateInput,
  CloneQuotationInput,
  CreateQuoteTemplateInput,
  QuotationItem,
  RecordQuoteMarginOverridesInput,
  SaveQuotationVersionInput,
  UpdateQuoteTemplateInput,
} from '@wayrune/contracts';
import {
  lineMarginPolicyViolation,
  parseMinMarginPercent,
  resolveTripWindowDisplay,
} from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { FilesService } from '../files/files.service';
import { LeadsService } from '../leads/leads.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GoogleService } from '../google/google.service';
import {
  computePackageSummary,
  customerItineraryDays,
  keyCoverageHints,
  parseBusinessContact,
  parseItineraryStory,
  parseOrgBranding,
  parseOrgTrust,
  presentCustomerQuote,
  resolveCancellationNote,
  resolveItemGallery,
  resolvePaymentSchedule,
  splitChecklist,
} from '../../common/customer-proposal';
import { calcQuoteTotals, escapeHtml, formatCurrency, type AuthUser } from '../../common/helpers';
import { buildBrandedProposalPdf } from './branded-proposal-pdf';
import {
  checklistToText,
  contentFromVersionFields,
  parseQuoteTemplateContent,
  remintQuoteItems,
} from './quote-template-content';

const IMMUTABLE = new Set(['accepted']);
const AUTOSAVEABLE = new Set(['draft', 'pending_approval']);

/** Allowed from→status for each workflow action. */
const ALLOWED_TRANSITIONS: Record<
  'request_approval' | 'approve' | 'send' | 'accept' | 'reject' | 'expire',
  ReadonlySet<string>
> = {
  request_approval: new Set(['draft']),
  approve: new Set(['pending_approval']),
  reject: new Set(['pending_approval']),
  send: new Set(['draft', 'approved']),
  accept: new Set(['approved', 'sent']),
  expire: new Set(['sent', 'approved', 'draft', 'pending_approval']),
};

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private outbox: OutboxService,
    private files: FilesService,
    private leads: LeadsService,
    private notifications: NotificationsService,
    @Optional()
    @Inject(forwardRef(() => GoogleService))
    private google?: GoogleService,
  ) {}

  private async ensureTrip(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  /** Hard-block send / approval request until sell prices and validity are complete. */
  private async assertQuoteReadyForCustomer(
    user: AuthUser,
    version: {
      itemsJson: unknown;
      validUntil: Date | null;
      quotation: { tripId: string };
    },
  ) {
    const items = Array.isArray(version.itemsJson)
      ? (version.itemsJson as Array<{ unitSell?: number | null; unitCost?: number | null }>)
      : [];
    if (!items.length) {
      throw new BadRequestException('Add at least one service before sending');
    }
    const missingSell = items.filter((i) => i.unitSell == null).length;
    if (missingSell > 0) {
      throw new BadRequestException(
        `${missingSell} service${missingSell === 1 ? '' : 's'} missing sell price`,
      );
    }
    if (!version.validUntil) {
      throw new BadRequestException('Set a validity date before sending');
    }
    if (hasPermission(user.permissions, 'quote.view_cost')) {
      const missingCost = items.filter((i) => i.unitCost == null).length;
      if (missingCost > 0) {
        throw new BadRequestException(
          `${missingCost} service${missingCost === 1 ? '' : 's'} missing buy rate`,
        );
      }
      const org = await this.prisma.organization.findFirst({
        where: { id: user.organizationId },
        select: { settingsJson: true },
      });
      const minMarginPercent = parseMinMarginPercent(org?.settingsJson);
      const unauthorised = items.filter((i) => {
        const violation = lineMarginPolicyViolation(
          i.unitCost,
          i.unitSell,
          minMarginPercent,
        );
        if (!violation) return false;
        const override = (i as { marginOverride?: { reason?: string } }).marginOverride;
        return !override?.reason?.trim();
      });
      if (unauthorised.length > 0) {
        const lossCount = unauthorised.filter((i) =>
          lineMarginPolicyViolation(i.unitCost, i.unitSell, minMarginPercent)?.kind === 'loss',
        ).length;
        const floorCount = unauthorised.length - lossCount;
        const parts: string[] = [];
        if (lossCount > 0) {
          parts.push(
            `${lossCount} sell below cost`,
          );
        }
        if (floorCount > 0) {
          parts.push(
            `${floorCount} below ${minMarginPercent}% margin floor`,
          );
        }
        throw new BadRequestException(
          `${unauthorised.length} service${unauthorised.length === 1 ? '' : 's'} need a below-margin override (${parts.join('; ')}) — a manager with below_margin.approve must authorise selected lines`,
        );
      }
    }
    const travellers = await this.prisma.tripTraveller.count({
      where: { tripId: version.quotation.tripId },
    });
    if (travellers <= 0) {
      throw new BadRequestException('Add at least one traveller before sending');
    }
  }

  async createQuotation(user: AuthUser, tripId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    const count = await this.prisma.quotation.count({
      where: { organizationId: user.organizationId },
    });
    const quotation = await this.prisma.quotation.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        quoteNumber: `QT-${String(count + 1).padStart(5, '0')}`,
        versions: {
          create: {
            versionNumber: 1,
            label: 'v1',
            status: 'draft',
            itemsJson: [],
            currency: 'INR',
            createdBy: user.sub,
          },
        },
      },
      include: { versions: true },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.create',
      entityType: 'quotation',
      entityId: quotation.id,
    });

    return quotation;
  }

  /** Copy the trip's accepted quotation into a new draft quotation for revisions. */
  async createFromAccepted(user: AuthUser, tripId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    const accepted = await this.prisma.quotationVersion.findFirst({
      where: {
        status: 'accepted',
        quotation: { tripId, organizationId: user.organizationId },
      },
      include: { quotation: true },
      orderBy: { acceptedAt: 'desc' },
    });
    if (!accepted) {
      throw new BadRequestException('No accepted quotation to revise');
    }

    const existingDraft = await this.prisma.quotation.findFirst({
      where: {
        tripId,
        organizationId: user.organizationId,
        versions: {
          some: {
            status: { in: ['draft', 'pending_approval'] },
            label: { contains: 'from accepted' },
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    if (existingDraft) {
      return { ...existingDraft, resumed: true as const };
    }

    const count = await this.prisma.quotation.count({
      where: { organizationId: user.organizationId },
    });
    const quotation = await this.prisma.quotation.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        quoteNumber: `QT-${String(count + 1).padStart(5, '0')}`,
        versions: {
          create: {
            versionNumber: 1,
            label: 'v1 (from accepted)',
            status: 'draft',
            currency: accepted.currency,
            validUntil: accepted.validUntil,
            itemsJson: accepted.itemsJson as Prisma.InputJsonValue,
            inclusions: accepted.inclusions,
            exclusions: accepted.exclusions,
            terms: accepted.terms,
            exchangeRatesJson: accepted.exchangeRatesJson ?? { INR: 1, USD: 0.012 },
            costTotal: accepted.costTotal,
            sellTotal: accepted.sellTotal,
            taxTotal: accepted.taxTotal,
            discountTotal: accepted.discountTotal,
            marginAmount: accepted.marginAmount,
            marginPercent: accepted.marginPercent,
            createdBy: user.sub,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.create_from_accepted',
      entityType: 'quotation',
      entityId: quotation.id,
      metadata: { sourceVersionId: accepted.id, sourceQuotationId: accepted.quotationId },
    });

    return { ...quotation, resumed: false as const };
  }

  async listTemplates(user: AuthUser) {
    const items = await this.prisma.quoteTemplate.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      items: items.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt,
        content: parseQuoteTemplateContent(t.contentJson),
      })),
    };
  }

  async createTemplate(user: AuthUser, input: CreateQuoteTemplateInput) {
    let content = input.contentJson ? parseQuoteTemplateContent(input.contentJson) : null;

    if (input.versionId) {
      const version = await this.prisma.quotationVersion.findFirst({
        where: {
          id: input.versionId,
          quotation: { organizationId: user.organizationId },
        },
      });
      if (!version) throw new NotFoundException('Quotation version not found');
      content = contentFromVersionFields({
        currency: version.currency,
        itemsJson: version.itemsJson,
        inclusions: version.inclusions,
        exclusions: version.exclusions,
        terms: version.terms,
        destinationHint: content?.destinationHint,
      });
    }

    if (!content) {
      throw new BadRequestException('Provide contentJson or versionId');
    }

    const template = await this.prisma.quoteTemplate.create({
      data: {
        organizationId: user.organizationId,
        name: input.name.trim(),
        contentJson: content as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.template_create',
      entityType: 'quote_template',
      entityId: template.id,
    });

    return {
      id: template.id,
      name: template.name,
      createdAt: template.createdAt,
      content: parseQuoteTemplateContent(template.contentJson),
    };
  }

  async updateTemplate(user: AuthUser, templateId: string, input: UpdateQuoteTemplateInput) {
    const existing = await this.prisma.quoteTemplate.findFirst({
      where: { id: templateId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Quote template not found');

    const template = await this.prisma.quoteTemplate.update({
      where: { id: existing.id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.contentJson != null
          ? { contentJson: parseQuoteTemplateContent(input.contentJson) as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });

    return {
      id: template.id,
      name: template.name,
      createdAt: template.createdAt,
      content: parseQuoteTemplateContent(template.contentJson),
    };
  }

  async deleteTemplate(user: AuthUser, templateId: string) {
    const existing = await this.prisma.quoteTemplate.findFirst({
      where: { id: templateId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Quote template not found');
    await this.prisma.quoteTemplate.delete({ where: { id: existing.id } });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.template_delete',
      entityType: 'quote_template',
      entityId: existing.id,
    });
    return { ok: true as const };
  }

  async createFromTemplate(user: AuthUser, tripId: string, input: ApplyQuoteTemplateInput) {
    await this.ensureTrip(user.organizationId, tripId);
    const template = await this.prisma.quoteTemplate.findFirst({
      where: { id: input.templateId, organizationId: user.organizationId },
    });
    if (!template) throw new NotFoundException('Quote template not found');

    const content = parseQuoteTemplateContent(template.contentJson);
    const items = remintQuoteItems((content.items ?? []) as QuotationItem[]);
    const totals = calcQuoteTotals(items, 0);
    const count = await this.prisma.quotation.count({
      where: { organizationId: user.organizationId },
    });

    const quotation = await this.prisma.quotation.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        quoteNumber: `QT-${String(count + 1).padStart(5, '0')}`,
        versions: {
          create: {
            versionNumber: 1,
            label: `v1 (from ${template.name})`,
            status: 'draft',
            currency: content.currency || 'INR',
            itemsJson: items as unknown as Prisma.InputJsonValue,
            inclusions: checklistToText(content.inclusions),
            exclusions: checklistToText(content.exclusions),
            terms: content.terms ?? null,
            exchangeRatesJson: { INR: 1, USD: 0.012 },
            ...totals,
            createdBy: user.sub,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.create_from_template',
      entityType: 'quotation',
      entityId: quotation.id,
      metadata: { templateId: template.id, templateName: template.name },
    });

    return quotation;
  }

  async cloneQuotation(user: AuthUser, tripId: string, quotationId: string, input: CloneQuotationInput) {
    await this.ensureTrip(user.organizationId, tripId);
    const source = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tripId, organizationId: user.organizationId },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!source) throw new NotFoundException('Quotation not found');

    const version =
      (input.versionId
        ? source.versions.find((v) => v.id === input.versionId)
        : source.versions[0]) ?? null;
    if (!version) throw new NotFoundException('Quotation version not found');

    const content = contentFromVersionFields({
      currency: version.currency,
      itemsJson: version.itemsJson,
      inclusions: version.inclusions,
      exclusions: version.exclusions,
      terms: version.terms,
    });
    const items = remintQuoteItems((content.items ?? []) as QuotationItem[], 'clone');
    const totals = calcQuoteTotals(items, Number(version.discountTotal) || 0);
    const count = await this.prisma.quotation.count({
      where: { organizationId: user.organizationId },
    });

    const quotation = await this.prisma.quotation.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        quoteNumber: `QT-${String(count + 1).padStart(5, '0')}`,
        versions: {
          create: {
            versionNumber: 1,
            label: `v1 (clone of ${source.quoteNumber})`,
            status: 'draft',
            currency: content.currency || version.currency || 'INR',
            validUntil: version.validUntil,
            itemsJson: items as unknown as Prisma.InputJsonValue,
            inclusions: checklistToText(content.inclusions),
            exclusions: checklistToText(content.exclusions),
            terms: content.terms ?? null,
            exchangeRatesJson: version.exchangeRatesJson ?? { INR: 1, USD: 0.012 },
            ...totals,
            createdBy: user.sub,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.clone',
      entityType: 'quotation',
      entityId: quotation.id,
      metadata: {
        sourceQuotationId: source.id,
        sourceVersionId: version.id,
        sourceQuoteNumber: source.quoteNumber,
      },
    });

    return quotation;
  }

  async saveVersion(user: AuthUser, tripId: string, quotationId: string, input: SaveQuotationVersionInput) {
    await this.ensureTrip(user.organizationId, tripId);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tripId, organizationId: user.organizationId },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');

    const latest = quotation.versions[0];
    if (latest && IMMUTABLE.has(latest.status)) {
      throw new BadRequestException('Accepted quotation is immutable; create a new quotation');
    }
    if (input.expectedLock != null && latest && latest.versionLock !== input.expectedLock) {
      throw new ConflictException('Quotation was modified by another user');
    }

    const totals = calcQuoteTotals(input.items, input.discountTotal);

    const version = await this.prisma.quotationVersion.create({
      data: {
        quotationId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        label: input.label ?? `v${(latest?.versionNumber ?? 0) + 1}`,
        status: 'draft',
        currency: input.currency,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        itemsJson: input.items as unknown as Prisma.InputJsonValue,
        inclusions: input.inclusions ?? null,
        exclusions: input.exclusions ?? null,
        terms: input.terms ?? null,
        exchangeRatesJson: { INR: 1, USD: 0.012 },
        ...totals,
        createdBy: user.sub,
      },
    });

    // Saving a draft quote moves planning trips to quoted
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (trip?.status === 'planning') {
      await this.prisma.trip.update({
        where: { id: tripId },
        data: { status: 'quoted' },
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.version_create',
      entityType: 'quotation_version',
      entityId: version.id,
    });

    return this.presentVersion(user, version);
  }

  /** Update draft / pending_approval version in place (auto-save). */
  async autosave(
    user: AuthUser,
    tripId: string,
    quotationId: string,
    input: SaveQuotationVersionInput & { versionId?: string | null },
  ) {
    await this.ensureTrip(user.organizationId, tripId);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tripId, organizationId: user.organizationId },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');

    const target =
      (input.versionId
        ? quotation.versions.find((v) => v.id === input.versionId)
        : null) ||
      quotation.versions.find((v) => AUTOSAVEABLE.has(v.status)) ||
      null;

    if (target && AUTOSAVEABLE.has(target.status)) {
      if (input.expectedLock != null && target.versionLock !== input.expectedLock) {
        throw new ConflictException('Quotation was modified by another user');
      }
      // Margin overrides may only be created via recordMarginOverrides (audited).
      const items = this.preserveExistingMarginOverrides(
        input.items as QuotationItem[],
        target.itemsJson,
      );
      const totals = calcQuoteTotals(items, input.discountTotal ?? Number(target.discountTotal));
      const updated = await this.prisma.quotationVersion.update({
        where: { id: target.id },
        data: {
          itemsJson: items as unknown as Prisma.InputJsonValue,
          inclusions: input.inclusions ?? target.inclusions,
          exclusions: input.exclusions ?? target.exclusions,
          terms: input.terms ?? target.terms,
          currency: input.currency || target.currency,
          ...(input.validUntil !== undefined
            ? { validUntil: input.validUntil ? new Date(input.validUntil) : null }
            : {}),
          versionLock: target.versionLock + 1,
          ...totals,
        },
      });
      return this.presentVersion(user, updated);
    }

    const latest = quotation.versions[0];
    if (latest && IMMUTABLE.has(latest.status)) {
      throw new BadRequestException('Accepted quotation is immutable; create a new quotation');
    }

    return this.saveVersion(user, tripId, quotationId, input);
  }

  /**
   * Autosave must not invent margin overrides — only {@link recordMarginOverrides} may.
   * Existing audited overrides are preserved; clearing an override (removing the field) is allowed.
   */
  private preserveExistingMarginOverrides(
    incoming: QuotationItem[],
    existingJson: unknown,
  ): QuotationItem[] {
    const existing = Array.isArray(existingJson)
      ? (existingJson as QuotationItem[])
      : [];
    const byId = new Map(existing.map((row) => [row.id, row]));
    return incoming.map((item) => {
      const prev = byId.get(item.id);
      const prevOverride = prev?.marginOverride;
      const nextOverride = item.marginOverride;
      if (!nextOverride?.reason?.trim()) {
        return { ...item, marginOverride: undefined };
      }
      if (
        prevOverride?.reason?.trim() &&
        prevOverride.reason === nextOverride.reason &&
        prevOverride.unitCost === nextOverride.unitCost &&
        prevOverride.unitSell === nextOverride.unitSell &&
        prevOverride.byUserId === nextOverride.byUserId
      ) {
        return { ...item, marginOverride: prevOverride };
      }
      // Reject client-forged or mutated overrides; keep prior audited value if any.
      return { ...item, marginOverride: prevOverride };
    });
  }

  /** Permission-gated, audited sell-below-cost / below-floor override on selected lines only. */
  async recordMarginOverrides(
    user: AuthUser,
    versionId: string,
    input: RecordQuoteMarginOverridesInput,
  ) {
    if (!hasPermission(user.permissions, 'below_margin.approve')) {
      throw new ForbiddenException('Missing below_margin.approve');
    }
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: { quotation: true },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }
    if (!AUTOSAVEABLE.has(version.status)) {
      throw new BadRequestException('Only draft quotations can record margin overrides');
    }
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    const minMarginPercent = parseMinMarginPercent(org?.settingsJson);
    const items = Array.isArray(version.itemsJson)
      ? ([...(version.itemsJson as QuotationItem[])] as QuotationItem[])
      : [];
    const selected = new Set(input.lineIds);
    const at = new Date().toISOString();
    const applied: Array<{
      id: string;
      description: string;
      unitCost: number;
      unitSell: number;
      profit: number;
      kind: string;
      marginPercent: number;
      floorPercent: number;
    }> = [];

    const nextItems = items.map((item) => {
      if (!selected.has(item.id)) return item;
      if (item.unitCost == null || item.unitSell == null) {
        throw new BadRequestException(
          `Line “${item.description}” needs both cost and sell before override`,
        );
      }
      const violation = lineMarginPolicyViolation(
        item.unitCost,
        item.unitSell,
        minMarginPercent,
      );
      if (!violation) {
        throw new BadRequestException(
          minMarginPercent > 0
            ? `Line “${item.description}” meets the ${minMarginPercent}% margin floor`
            : `Line “${item.description}” is not loss-making`,
        );
      }
      applied.push({
        id: item.id,
        description: item.description,
        unitCost: item.unitCost,
        unitSell: item.unitSell,
        profit: violation.profit,
        kind: violation.kind,
        marginPercent: violation.marginPercent,
        floorPercent: violation.floorPercent,
      });
      return {
        ...item,
        marginOverride: {
          at,
          reason: input.reason.trim(),
          byUserId: user.sub,
          unitCost: item.unitCost,
          unitSell: item.unitSell,
        },
      };
    });

    if (!applied.length) {
      throw new BadRequestException('Select at least one service that breaches margin policy');
    }
    const missing = input.lineIds.filter((id) => !items.some((i) => i.id === id));
    if (missing.length) {
      throw new BadRequestException('One or more selected services were not found on this quotation');
    }

    const totals = calcQuoteTotals(nextItems, Number(version.discountTotal) || 0);
    const updated = await this.prisma.quotationVersion.update({
      where: { id: versionId },
      data: {
        itemsJson: nextItems as unknown as Prisma.InputJsonValue,
        versionLock: version.versionLock + 1,
        ...totals,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.margin_override',
      entityType: 'quotation_version',
      entityId: versionId,
      metadata: {
        reason: input.reason.trim(),
        approvedByUserId: user.sub,
        at,
        minMarginPercent,
        lines: applied,
      },
    });

    return this.presentVersion(user, updated);
  }

  presentVersion(user: AuthUser, version: {
    id: string;
    costTotal: Prisma.Decimal | number;
    marginAmount: Prisma.Decimal | number;
    marginPercent: Prisma.Decimal | number;
    itemsJson: Prisma.JsonValue;
    [key: string]: unknown;
  }) {
    const ability = buildAbility(user.permissions);
    if (ability.can('quote.view_cost')) return version;
    // Field-level redaction (RBAC Integrity 1.0 / P1-5): cost is gated by
    // `quote.view_cost`; margin also unlocks for `finance.margin.read`. Nested
    // per-line unit costs are stripped from itemsJson.
    const { itemsJson } = version;
    const items = Array.isArray(itemsJson)
      ? (itemsJson as Array<Record<string, unknown>>).map(({ unitCost, ...item }) => item)
      : itemsJson;
    const redacted = redactFields(version, ability, {
      costTotal: 'quote.view_cost',
      marginAmount: ['quote.view_cost', 'finance.margin.read'],
      marginPercent: ['quote.view_cost', 'finance.margin.read'],
    });
    return { ...redacted, itemsJson: items, costHidden: true };
  }

  async transition(user: AuthUser, versionId: string, action: 'request_approval' | 'approve' | 'send' | 'accept' | 'reject' | 'expire') {
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: { quotation: true },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }
    if (IMMUTABLE.has(version.status) && action !== 'expire') {
      throw new BadRequestException('Accepted quotation is immutable');
    }

    const allowedFrom = ALLOWED_TRANSITIONS[action];
    if (!allowedFrom.has(version.status)) {
      throw new BadRequestException(
        `Cannot ${action.replace(/_/g, ' ')} from status “${version.status.replace(/_/g, ' ')}”`,
      );
    }

    const map: Record<string, string> = {
      request_approval: 'pending_approval',
      approve: 'approved',
      send: 'sent',
      accept: 'accepted',
      reject: 'rejected',
      expire: 'expired',
    };

    if (
      (action === 'approve' || action === 'reject') &&
      !hasPermission(user.permissions, 'quote.approve')
    ) {
      throw new ForbiddenException('Missing quote.approve');
    }

    if (action === 'send' || action === 'request_approval') {
      await this.assertQuoteReadyForCustomer(user, version);
    }

    if (action === 'accept') {
      const result = await this.finalizeAccept(
        user.organizationId,
        version,
        user.sub,
        user,
      );
      return { ...this.presentVersion(user, result.version), leadOutcome: result.leadOutcome };
    }

    const updated = await this.prisma.quotationVersion.update({
      where: { id: versionId },
      data: {
        status: map[action],
      },
    });

    // Trip status progression for earlier quote actions
    if (action === 'send' || action === 'request_approval') {
      const trip = await this.prisma.trip.findFirst({
        where: { id: version.quotation.tripId },
      });
      if (trip && (trip.status === 'planning' || trip.status === 'quoted')) {
        await this.prisma.trip.update({
          where: { id: trip.id },
          data: {
            status: action === 'request_approval' ? 'awaiting_approval' : 'quoted',
          },
        });
      }
      if (action === 'request_approval') {
        try {
          const notifyUserId = trip?.ownerId;
          if (notifyUserId && notifyUserId !== user.sub) {
            const flags = await this.notifications.orgNotifyFlags(user.organizationId);
            await this.notifications.notify({
              organizationId: user.organizationId,
              userId: notifyUserId,
              title: 'Quote needs approval',
              body: `Approval requested for ${trip?.tripNumber || 'trip'}: ${trip?.title || ''}`.trim(),
              linkPath: `/trips/${version.quotation.tripId}`,
              channel: flags.notifyOnQuoteApproval ? 'both' : 'in_app',
            });
          }
        } catch {
          /* non-blocking */
        }
      }
    }
    if (action === 'approve') {
      const trip = await this.prisma.trip.findFirst({
        where: { id: version.quotation.tripId },
      });
      if (trip && trip.status !== 'confirmed') {
        await this.prisma.trip.update({
          where: { id: trip.id },
          data: { status: 'quoted' },
        });
      }
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: `quote.${action}`,
      entityType: 'quotation_version',
      entityId: versionId,
    });

    return this.presentVersion(user, updated);
  }

  /**
   * Client accept via public itinerary share token (no staff session).
   * Idempotent when the quote is already accepted.
   */
  async acceptFromPublicShare(
    organizationId: string,
    tripId: string,
    actorUserId: string | null,
  ) {
    for (const status of ['sent', 'approved'] as const) {
      const version = await this.prisma.quotationVersion.findFirst({
        where: {
          status,
          quotation: { tripId, organizationId },
        },
        include: { quotation: { select: { quoteNumber: true, tripId: true, organizationId: true } } },
        orderBy: [{ versionNumber: 'desc' }, { updatedAt: 'desc' }],
      });
      if (version) {
        const result = await this.finalizeAccept(
          organizationId,
          version,
          actorUserId,
          this.publicShareActor(organizationId, actorUserId),
        );
        return {
          alreadyAccepted: false as const,
          quotation: presentCustomerQuote({
            ...result.version,
            quotation: { quoteNumber: version.quotation.quoteNumber },
          }),
          leadOutcome: result.leadOutcome,
        };
      }
    }

    const accepted = await this.prisma.quotationVersion.findFirst({
      where: {
        status: 'accepted',
        quotation: { tripId, organizationId },
      },
      include: { quotation: { select: { quoteNumber: true } } },
      orderBy: [{ acceptedAt: 'desc' }, { versionNumber: 'desc' }],
    });
    if (accepted) {
      return {
        alreadyAccepted: true as const,
        quotation: presentCustomerQuote(accepted),
      };
    }

    throw new BadRequestException('No approved or sent quotation is available to accept');
  }

  private publicShareActor(organizationId: string, actorUserId: string | null): AuthUser {
    return {
      sub: actorUserId || 'public-share',
      email: 'share@local',
      organizationId,
      membershipId: 'public-share',
      permissions: ['quote.write', 'lead.write'],
    };
  }

  private async finalizeAccept(
    organizationId: string,
    version: {
      id: string;
      status: string;
      acceptedAt: Date | null;
      quotation: { tripId: string; organizationId?: string };
    },
    actorUserId: string | null,
    leadUser: AuthUser,
  ) {
    if (version.status === 'accepted') {
      const current = await this.prisma.quotationVersion.findUniqueOrThrow({
        where: { id: version.id },
      });
      return { version: current, leadOutcome: { markedWon: false, skippedReason: 'already_accepted' } };
    }
    if (!ALLOWED_TRANSITIONS.accept.has(version.status)) {
      throw new BadRequestException(
        `Cannot accept from status “${version.status.replace(/_/g, ' ')}”`,
      );
    }

    const siblings = await this.prisma.quotation.findMany({
      where: { tripId: version.quotation.tripId },
      include: { versions: true },
    });
    for (const q of siblings) {
      for (const v of q.versions) {
        if (v.status === 'accepted' && v.id !== version.id) {
          await this.prisma.quotationVersion.update({
            where: { id: v.id },
            data: { status: 'superseded' },
          });
        }
      }
    }

    const updated = await this.prisma.quotationVersion.update({
      where: { id: version.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
      },
    });

    const tripBefore = await this.prisma.trip.findFirst({
      where: { id: version.quotation.tripId },
      select: { status: true, ownerId: true, title: true, tripNumber: true },
    });
    await this.prisma.trip.update({
      where: { id: version.quotation.tripId },
      data: { status: 'confirmed' },
    });

    const trip = await this.prisma.trip.findFirst({
      where: { id: version.quotation.tripId },
      include: { inquiry: { select: { leadId: true } } },
    });
    const leadOutcome = await this.leads.markWonIfEligible(
      leadUser,
      trip?.inquiry?.leadId,
      'quote accepted',
    );

    await this.audit.record({
      organizationId,
      actorUserId: actorUserId,
      action: 'quote.accept',
      entityType: 'quotation_version',
      entityId: version.id,
      metadata: {
        leadOutcome,
        tripId: version.quotation.tripId,
        via: actorUserId ? 'staff' : 'public_share',
      },
    });
    if (tripBefore && tripBefore.status !== 'confirmed') {
      await this.audit.record({
        organizationId,
        actorUserId: actorUserId,
        action: 'trip.status_change',
        entityType: 'trip',
        entityId: version.quotation.tripId,
        metadata: {
          fromStatus: tripBefore.status,
          toStatus: 'confirmed',
          status: 'confirmed',
          reason: 'quote_accepted',
        },
      });
    }

    const notifyUserId = tripBefore?.ownerId || actorUserId;
    if (notifyUserId) {
      try {
        const flags = await this.notifications.orgNotifyFlags(organizationId);
        await this.notifications.notify({
          organizationId,
          userId: notifyUserId,
          title: 'Quote accepted',
          body: `Quotation accepted for ${tripBefore?.tripNumber || 'trip'}: ${tripBefore?.title || ''}`.trim(),
          linkPath: `/trips/${version.quotation.tripId}`,
          channel: flags.notifyOnQuoteAccept ? 'both' : 'in_app',
        });
      } catch {
        /* non-blocking */
      }
    }

    return {
      version: updated,
      leadOutcome,
    };
  }

  async generatePdf(user: AuthUser, versionId: string) {
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: {
        quotation: {
          include: {
            trip: { include: { party: { select: { displayName: true } } } },
          },
        },
      },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
    });
    const branding = parseOrgBranding(org.brandingJson, org.name);
    const contact = parseBusinessContact(org.settingsJson);
    const trust = parseOrgTrust(org.settingsJson);
    const primaryColor = escapeHtml(branding.primaryColor);
    const companyName = branding.companyName;
    const footer = branding.previewFooter || `${companyName} · Proposal`;

    const quote = presentCustomerQuote({
      ...version,
      quotation: { quoteNumber: version.quotation.quoteNumber },
    });
    const rawQuoteItems = Array.isArray(version.itemsJson)
      ? (version.itemsJson as Array<{ unitSell?: number | null }>)
      : [];
    const draftIncomplete =
      rawQuoteItems.length === 0 ||
      rawQuoteItems.some((i) => i.unitSell == null) ||
      !version.validUntil;

    const itinerary = await this.prisma.itinerary.findFirst({
      where: {
        tripId: version.quotation.tripId,
        organizationId: user.organizationId,
      },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const contentJson = itinerary?.versions[0]?.contentJson;
    const days = contentJson ? customerItineraryDays(contentJson) : [];
    const story = contentJson ? parseItineraryStory(contentJson) : null;
    const summary = computePackageSummary(days, quote, story);
    const trip = version.quotation.trip;
    const startIso = trip.startDate
      ? trip.startDate.toISOString().slice(0, 10)
      : null;
    const endIso = trip.endDate ? trip.endDate.toISOString().slice(0, 10) : null;
    const tripWindow = resolveTripWindowDisplay(
      summary.bestTime || story?.bestTime,
      startIso,
      endIso,
      summary.destinations[0] || null,
    );

    const logoBlock = branding.logoUrl
      ? `<img src="${escapeHtml(branding.logoUrl)}" alt="" style="max-height:48px;max-width:160px;object-fit:contain" />`
      : '';
    const heroBg = story?.heroImageUrl
      ? `background-image:url('${escapeHtml(story.heroImageUrl)}');background-size:cover;background-position:center;`
      : `background:linear-gradient(135deg,${primaryColor},${primaryColor}99);`;

    const chips = [
      `${summary.days}D · ${summary.nights}N`,
      summary.destinations.length
        ? `${summary.destinations.length} destination${summary.destinations.length > 1 ? 's' : ''}`
        : null,
      summary.transportLabel,
      summary.mealLabels[0] || null,
      tripWindow || null,
    ]
      .filter(Boolean)
      .map((c) => `<span class="chip">${escapeHtml(String(c))}</span>`)
      .join('');

    const highlightsHtml =
      story?.highlights && story.highlights.length
        ? `<div class="section"><h2>Why you'll love this trip</h2><ul class="checks">${story.highlights
            .map((h) => `<li>✓ ${escapeHtml(h)}</li>`)
            .join('')}</ul></div>`
        : '';

    const trustHtml = trust.chips.length
      ? `<div class="section coverage trust">${trust.chips
          .map((c) => `<span class="chip ok">✓ ${escapeHtml(c)}</span>`)
          .join('')}</div>`
      : '';

    const weatherHtml =
      story?.weatherNote || tripWindow
        ? `<div class="section"><p><strong>During your trip${
            tripWindow ? ` · ${escapeHtml(tripWindow)}` : ''
          }</strong><br><span class="meta">${escapeHtml(
            story?.weatherNote || '',
          )}</span></p></div>`
        : '';

    const priceLabel = formatCurrency(quote.sellTotal, quote.currency);
    const primarySummary = [
      ['Package price', priceLabel],
      ['Duration', `${summary.days} days · ${summary.nights} nights`],
      ['Destinations', summary.destinations.join(' · ') || '—'],
      ['Vehicle', summary.transportLabel || '—'],
      ['Hotels', summary.hotelCount ? String(summary.hotelCount) : '—'],
      ['Meals', summary.mealLabels.join(', ') || '—'],
    ]
      .map(
        (row) =>
          `<div class="summary-cell emphasize"><div class="label">${escapeHtml(row[0])}</div><div>${escapeHtml(row[1])}</div></div>`,
      )
      .join('');
    const secondarySummary = [
      summary.activityCount ? ['Activities', String(summary.activityCount)] : null,
      summary.pickup ? ['Pickup', summary.pickup] : null,
      summary.drop ? ['Drop', summary.drop] : null,
      !story?.weatherNote && tripWindow ? ['Your dates', tripWindow] : null,
    ]
      .filter(Boolean)
      .map(
        (row) =>
          `<div class="summary-cell muted"><div class="label">${escapeHtml((row as string[])[0])}</div><div>${escapeHtml((row as string[])[1])}</div></div>`,
      )
      .join('');

    const includeLinesEarly = splitChecklist(quote.inclusions);
    const excludeLinesEarly = splitChecklist(quote.exclusions);
    const coverage = keyCoverageHints(includeLinesEarly, excludeLinesEarly);
    const coverageHtml = coverage.length
      ? `<div class="section coverage">${coverage
          .map(
            (c) =>
              `<span class="chip ${c.included ? 'ok' : 'no'}">${c.included ? '✓' : '✗'} ${escapeHtml(c.label)} · ${
                c.included ? 'included' : 'not included'
              }</span>`,
          )
          .join('')}</div>`
      : '';

    const routeHtml =
      summary.routeStops.length > 0
        ? `<div class="section"><h2>Your route</h2><div class="route-list">${summary.routeStops
            .map((stop, i) => {
              const kind =
                stop.kind === 'pickup' ? 'Start' : stop.kind === 'drop' ? 'Return' : 'Stay';
              const nights =
                stop.kind === 'stay' && stop.nights
                  ? `<div class="meta">${stop.nights} night${stop.nights === 1 ? '' : 's'}</div>`
                  : '';
              const leg =
                i > 0 && stop.legFromPrevious
                  ? `<div class="route-arrow">↓</div><div class="meta" style="text-align:center;color:var(--brand,#0f6e56);font-weight:600">${escapeHtml(
                      stop.legFromPrevious,
                    )}</div><div class="route-arrow">↓</div>`
                  : i > 0
                    ? '<div class="route-arrow">↓</div>'
                    : '';
              return `${leg}<div class="route-stop"><div class="label">${escapeHtml(
                kind,
              )}</div><strong>${escapeHtml(stop.label)}</strong>${nights}</div>`;
            })
            .join('')}</div></div>`
        : '';

    const hotels = days.flatMap((d) => d.items.filter((i) => i.type === 'hotel'));
    const transfersAll = days.flatMap((d) => d.items.filter((i) => i.type === 'transfer'));
    const transfers = transfersAll.filter((item, idx) => {
      const vehicle =
        typeof item.details?.vehicle === 'string' && item.details.vehicle
          ? item.details.vehicle
          : item.title;
      return (
        transfersAll.findIndex((other) => {
          const otherVehicle =
            typeof other.details?.vehicle === 'string' && other.details.vehicle
              ? other.details.vehicle
              : other.title;
          return otherVehicle === vehicle;
        }) === idx
      );
    });
    const stayCards = [
      ...hotels.map((item) => {
        const details = item.details || {};
        const amenities = Array.isArray(details.amenities)
          ? details.amenities.map(String).filter(Boolean)
          : [];
        const imageUrl = resolveItemGallery(details)[0] || null;
        const googleRating = Number(details.googleRating);
        const distanceHint =
          typeof details.distanceHint === 'string' && details.distanceHint.trim()
            ? details.distanceHint.trim()
            : null;
        const stars = Number(details.stars);
        return `<div class="card">${
          imageUrl
            ? `<div class="media" style="background-image:url('${escapeHtml(imageUrl)}')"></div>`
            : ''
        }<strong>Hotel · ${escapeHtml(item.title)}</strong>${
          Number.isFinite(stars) && stars > 0
            ? `<div class="meta">${'★'.repeat(Math.min(5, Math.round(stars)))}${
                Number.isFinite(googleRating) && googleRating > 0
                  ? ` · Google ${googleRating.toFixed(1)}`
                  : ''
              }</div>`
            : Number.isFinite(googleRating) && googleRating > 0
              ? `<div class="meta">Google ${googleRating.toFixed(1)}</div>`
              : ''
        }${item.location ? `<div class="meta">${escapeHtml(item.location)}</div>` : ''}${
          distanceHint ? `<div class="meta">${escapeHtml(distanceHint)}</div>` : ''
        }<div class="meta">${[
          details.nights ? `${details.nights} night(s)` : null,
          details.roomType ? String(details.roomType) : null,
          details.checkIn ? `In ${details.checkIn}` : null,
        ]
          .filter(Boolean)
          .map((x) => escapeHtml(String(x)))
          .join(' · ')}</div>${
          item.description
            ? `<div class="item-notes">${escapeHtml(item.description)}</div>`
            : ''
        }${
          amenities.length
            ? `<div class="meta">${amenities.map((a) => escapeHtml(a)).join(' · ')}</div>`
            : ''
        }</div>`;
      }),
      ...transfers.map((item) => {
        const details = item.details || {};
        const includes = Array.isArray(details.includes)
          ? details.includes.map(String).filter(Boolean)
          : [];
        const seats = details.seats ? Number(details.seats) : summary.vehicleSeats;
        const chipsList = [
          Number.isFinite(seats) && seats! > 0 ? `${seats} Seater` : null,
          ...includes,
        ].filter(Boolean) as string[];
        const vehicle =
          typeof details.vehicle === 'string' && details.vehicle ? details.vehicle : item.title;
        return `<div class="card"><strong>Vehicle · ${escapeHtml(vehicle)}</strong>${
          chipsList.length
            ? `<div class="meta">${chipsList.map((a) => escapeHtml(a)).join(' · ')}</div>`
            : ''
        }</div>`;
      }),
    ].join('');

    const stayHtml = stayCards
      ? `<div class="section"><h2>Stays &amp; transport</h2><div class="cards">${stayCards}</div></div>`
      : '';

    const packingCats = story?.packingCategories;
    const packingCatBlocks = (
      [
        ['Clothing', packingCats?.clothing],
        ['Electronics', packingCats?.electronics],
        ['Documents', packingCats?.documents],
        ['Medicine', packingCats?.medicine],
      ] as const
    ).filter(([, items]) => items && items.length > 0);

    const packingHtml = packingCatBlocks.length
      ? `<div class="section"><h2>Packing checklist</h2><div class="cards">${packingCatBlocks
          .map(
            ([label, items]) =>
              `<div class="card"><strong>${escapeHtml(label)}</strong><ul class="checks">${(items || [])
                .map((t) => `<li>✓ ${escapeHtml(t)}</li>`)
                .join('')}</ul></div>`,
          )
          .join('')}</div></div>`
      : story?.packingTips && story.packingTips.length
        ? `<div class="section"><h2>Packing checklist</h2><p>${story.packingTips
            .map((t) => escapeHtml(t))
            .join(' · ')}</p></div>`
        : '';
    const faqHtml =
      story?.faqs && story.faqs.length
        ? `<div class="section"><h2>Before you go</h2>${story.faqs
            .map(
              (f) =>
                `<p><strong>${escapeHtml(f.question)}</strong><br><span class="meta">${escapeHtml(f.answer)}</span></p>`,
            )
            .join('')}</div>`
        : '';

    const cancellationNote = resolveCancellationNote(story, trust);
    const cancellationHtml = cancellationNote
      ? `<div class="section"><h2>Cancellation</h2><p class="meta">${escapeHtml(cancellationNote)}</p></div>`
      : '';
    const emergencyPhone = contact.emergencyPhone || contact.phone;
    const emergencyHtml = emergencyPhone
      ? `<p class="meta" style="margin-top:12px"><strong>Emergency support · 24×7</strong><br><a href="tel:${escapeHtml(
          emergencyPhone,
        )}">${escapeHtml(emergencyPhone)}</a></p>`
      : '';

    const itineraryHtml =
      days.length === 0
        ? '<p class="meta">No customer itinerary items yet.</p>'
        : days
            .map((day) => {
              const items = day.items
                .map((item) => {
                  const when = [item.startTime, item.endTime].filter(Boolean).join(' – ');
                  const loc = item.location ? escapeHtml(item.location) : '';
                  const imageUrl = resolveItemGallery(item.details)[0] || null;
                  const blurb = item.description?.trim() || item.notes?.trim() || '';
                  const extraNote =
                    item.description?.trim() &&
                    item.notes?.trim() &&
                    item.notes.trim() !== item.description.trim()
                      ? item.notes.trim()
                      : '';
                  return `<li class="exp-item">${
                    imageUrl
                      ? `<div class="thumb" style="background-image:url('${escapeHtml(imageUrl)}')"></div>`
                      : ''
                  }<div><strong>${escapeHtml(item.title)}</strong>${
                    when ? ` <span class="meta">(${escapeHtml(when)})</span>` : ''
                  }${
                    blurb ? `<div class="item-notes">${escapeHtml(blurb)}</div>` : ''
                  }${loc ? `<div class="meta">${loc}</div>` : ''}${
                    extraNote ? `<div class="meta">${escapeHtml(extraNote)}</div>` : ''
                  }</div></li>`;
                })
                .join('');
              return `<div class="day"><h3>Day ${day.dayNumber}${
                day.date ? ` · ${escapeHtml(String(day.date).slice(0, 10))}` : ''
              } — ${escapeHtml(day.title)}</h3>${
                day.destination
                  ? `<p class="meta">${escapeHtml(day.destination)}</p>`
                  : ''
              }<p class="exp-label">Today's experience</p><ul class="exp-list">${
                items || '<li class="meta">No items</li>'
              }</ul></div>`;
            })
            .join('');

    const includeLines = includeLinesEarly;
    const excludeLines = excludeLinesEarly;
    const includeHtml = includeLines.length
      ? `<ul class="checks">${includeLines.map((l) => `<li>✓ ${escapeHtml(l)}</li>`).join('')}</ul>`
      : '';
    const excludeHtml = excludeLines.length
      ? `<ul class="checks muted">${excludeLines.map((l) => `<li>✗ ${escapeHtml(l)}</li>`).join('')}</ul>`
      : '';
    const itemRows = quote.items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.description)}</td><td class="num">${item.quantity}</td><td class="num">${formatCurrency(item.unitSell, quote.currency)}</td><td class="num">${formatCurrency(item.amount, quote.currency)}</td></tr>`,
      )
      .join('');

    const paymentSteps = resolvePaymentSchedule(story, quote.terms);
    const paymentHtml = paymentSteps.length
      ? `<div style="margin:12px 0"><strong>Payment</strong><div class="payment">${paymentSteps
          .map(
            (s, i) =>
              `${i > 0 ? '<span class="pay-arrow">→</span>' : ''}<div class="pay-step"><div class="label">${escapeHtml(
                s.label,
              )}</div>${
                s.percent != null
                  ? `<div class="pay-pct">${s.percent}%</div>`
                  : ''
              }${s.amountHint ? `<div class="meta">${escapeHtml(s.amountHint)}</div>` : ''}</div>`,
          )
          .join('')}</div></div>`
      : '';

    const clientName = version.quotation.trip.party?.displayName ?? null;
    const heroHeadline = story?.headline || version.quotation.trip.title;
    const heroPackageTitle = story?.headline
      ? `Your ${summary.days}-Day ${version.quotation.trip.title
          .replace(/\bpackage\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim()} Journey`
      : null;
    const waDigits = contact.phone ? contact.phone.replace(/\D/g, '') : '';
    const ctaButtons = [
      waDigits
        ? `<a class="btn btn-wa" href="https://wa.me/${escapeHtml(waDigits)}">WhatsApp</a>`
        : null,
      contact.phone
        ? `<a class="btn btn-call" href="tel:${escapeHtml(contact.phone)}">Call</a>`
        : null,
      contact.supportEmail
        ? `<a class="btn btn-mail" href="mailto:${escapeHtml(contact.supportEmail)}">Email</a>`
        : null,
    ]
      .filter(Boolean)
      .join(' ');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(quote.quoteNumber)}</title>
      <style>
        body{font-family:Georgia,'Times New Roman',serif;padding:32px;color:#0b2e26;max-width:720px;margin:0 auto}
        .hero{${heroBg}color:#fff;border-radius:16px;padding:28px;margin-bottom:24px;min-height:160px;position:relative;overflow:hidden}
        .hero::after{content:'';position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.65),rgba(0,0,0,.15))}
        .hero-inner{position:relative;z-index:1}
        .chip{display:inline-block;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.15);border-radius:999px;padding:4px 10px;margin:4px 4px 0 0;font-size:11px}
        .coverage .chip{border-color:#d7e3de;background:#f7faf9;color:#0b2e26}
        .coverage .chip.ok{border-color:${primaryColor}55;background:${primaryColor}12}
        .coverage .chip.no{color:#4a635c}
        .price{float:right;background:#fff;color:#0b2e26;border-radius:999px;padding:6px 12px;font-weight:600;font-variant-numeric:tabular-nums}
        h1{margin:12px 0 6px;font-size:1.8rem}
        h2{color:${primaryColor};margin:28px 0 12px;font-size:1.15rem}
        h3{margin:12px 0 6px;font-size:1rem}
        .tagline{opacity:.92;margin:0}
        .package-title{opacity:.85;margin:0 0 4px;font-size:.95rem}
        .meta{color:#4a635c;font-size:0.9rem}
        .summary{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .summary-cell{border:1px solid #d7e3de;border-radius:10px;padding:10px}
        .summary-cell.emphasize{border-color:${primaryColor}44;background:${primaryColor}0a}
        .summary-cell.muted{border-style:dashed;opacity:.9}
        .summary-cell .label{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#4a635c;margin-bottom:2px}
        .checks{padding-left:0;list-style:none;margin:8px 0}
        .checks li{margin:4px 0}
        .checks.muted{color:#4a635c}
        .cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .card{border:1px solid #d7e3de;border-radius:12px;padding:12px;overflow:hidden}
        .media{height:120px;margin:-12px -12px 10px;background-size:cover;background-position:center}
        .thumb{width:96px;height:72px;border-radius:8px;background-size:cover;background-position:center;flex-shrink:0}
        .exp-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:${primaryColor};margin:8px 0 4px}
        .exp-list{list-style:none;padding:0;margin:0}
        .exp-item{display:flex;gap:12px;margin:10px 0;align-items:flex-start}
        .route-list{text-align:center}
        .route-stop{border:1px solid #d7e3de;border-radius:12px;padding:10px 14px;display:inline-block;min-width:200px;text-align:left;margin:4px 0}
        .route-arrow{color:#4a635c;margin:2px 0}
        .payment{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}
        .pay-step{border:1px solid #d7e3de;border-radius:12px;padding:10px 16px;text-align:center;min-width:120px}
        .pay-pct{font-size:1.4rem;font-weight:600;color:${primaryColor}}
        .pay-arrow{color:#4a635c}
        table{width:100%;border-collapse:collapse;margin:12px 0}
        th,td{border-bottom:1px solid #d7e3de;padding:8px 6px;text-align:left;font-size:0.9rem}
        th{color:${primaryColor};font-size:0.75rem;text-transform:uppercase}
        .num{text-align:right;font-variant-numeric:tabular-nums}
        .total{font-size:1.2rem;font-weight:600;color:${primaryColor}}
        .day{margin:12px 0 18px;padding-bottom:8px;border-bottom:1px solid #e8f0ed}
        .day ul{margin:6px 0 0;padding-left:0}
        .item-notes{color:#1a3d34;font-size:0.9rem;margin-top:4px;line-height:1.45}
        .cta{border:1px solid #d7e3de;border-radius:16px;padding:20px;text-align:center;margin-top:28px}
        .btn{display:inline-block;border-radius:999px;padding:8px 16px;margin:4px;text-decoration:none;font-size:.9rem;font-weight:600;color:#fff}
        .btn-wa{background:#059669}
        .btn-call{background:#0284c7}
        .btn-mail{background:#64748b}
        .footer{margin-top:36px;padding-top:16px;border-top:1px solid #d7e3de;color:#4a635c;font-size:0.8rem}
        .note{margin-top:10px;font-size:0.75rem;color:#7a9089}
        .section{page-break-inside:avoid}
        .draft-banner{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:10px;padding:10px 14px;margin:0 0 16px;font-weight:600;font-size:.9rem;text-align:center}
      </style></head>
      <body>
      ${
        draftIncomplete
          ? '<div class="draft-banner">Draft proposal — pricing incomplete</div>'
          : ''
      }
      <div class="hero"><div class="hero-inner">
        <div>${logoBlock}<span class="price">${escapeHtml(priceLabel)}</span></div>
        <h1>${escapeHtml(heroHeadline)}</h1>
        ${heroPackageTitle ? `<p class="package-title">${escapeHtml(heroPackageTitle)}</p>` : ''}
        ${
          story?.tagline || branding.tagline
            ? `<p class="tagline">${escapeHtml(story?.tagline || branding.tagline || '')}</p>`
            : ''
        }
        <p class="tagline" style="opacity:.8;font-size:.85rem;margin-top:6px">${escapeHtml(
          [version.quotation.trip.tripNumber, clientName].filter(Boolean).join(' · '),
        )}</p>
        <div style="margin-top:10px">${chips}</div>
      </div></div>

      ${trustHtml}
      ${highlightsHtml}
      <div class="section"><h2>Trip summary</h2><div class="summary">${primarySummary}</div>${
        secondarySummary ? `<div class="summary" style="margin-top:8px">${secondarySummary}</div>` : ''
      }</div>
      ${weatherHtml}
      ${coverageHtml}
      ${routeHtml}
      ${stayHtml}
      ${packingHtml}
      ${faqHtml}

      <div class="section"><h2>Day by day</h2>${itineraryHtml}</div>

      <div class="section">
        <h2>Your package — ${escapeHtml(priceLabel)}</h2>
        <p class="meta">${escapeHtml(quote.quoteNumber)}${
          quote.versionLabel ? ` · ${escapeHtml(quote.versionLabel)}` : ''
        }${quote.validUntil ? ` · Valid until ${escapeHtml(quote.validUntil.slice(0, 10))}` : ''}</p>
        ${paymentHtml}
        ${includeHtml || excludeHtml ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0">${includeHtml ? `<div><strong>Includes</strong>${includeHtml}</div>` : ''}${excludeHtml ? `<div><strong>Not included</strong>${excludeHtml}</div>` : ''}</div>` : ''}
        <table>
          <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
          <tbody>${itemRows || '<tr><td colspan="4">No line items</td></tr>'}</tbody>
        </table>
        ${quote.taxTotal ? `<p class="meta">Tax: ${formatCurrency(quote.taxTotal, quote.currency)}</p>` : ''}
        <p class="total">Total: ${formatCurrency(quote.sellTotal, quote.currency)}</p>
        ${quote.terms ? `<p><strong>Terms</strong><br>${escapeHtml(quote.terms)}</p>` : ''}
      </div>

      <div class="cta section">
        <h2 style="margin-top:0">Ready for your trip?</h2>
        ${
          story?.consultantNote
            ? `<p>${escapeHtml(story.consultantNote)}</p>`
            : '<p class="meta">Tell us when you are ready — we will confirm stays and share next steps.</p>'
        }
        <p><strong>${escapeHtml(companyName)}</strong></p>
        <p style="margin-top:12px">${ctaButtons}</p>
        ${emergencyHtml}
      </div>

      ${cancellationHtml}

      <div class="footer">${escapeHtml(footer)}</div>
      </body></html>`;

    const pdfItems = quote.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitSell: item.unitSell,
      lineSell: item.amount,
    }));
    const daysDetail = days.map((d) => ({
      title: d.title || `Day ${d.dayNumber}`,
      items: d.items.map((item) => ({
        title: item.title,
        time: item.startTime
          ? item.endTime
            ? `${item.startTime}–${item.endTime}`
            : item.startTime
          : null,
        place: item.location,
      })),
    }));
    const pdfBuffer = await buildBrandedProposalPdf({
      branding,
      tripTitle: version.quotation.trip.title,
      partyName: version.quotation.trip.party?.displayName ?? null,
      quoteNumber: quote.quoteNumber,
      versionLabel: quote.versionLabel,
      currency: quote.currency,
      sellTotal: quote.sellTotal,
      taxTotal: quote.taxTotal || undefined,
      validUntil: quote.validUntil,
      terms: quote.terms,
      destinations: summary.destinations,
      days: summary.days,
      nights: summary.nights,
      dayTitles: days.map((d) => d.title || `Day ${d.dayNumber}`),
      daysDetail,
      items: pdfItems,
      formatMoney: formatCurrency,
      draftIncomplete,
    });

    const doc = await this.files.upload({
      organizationId: user.organizationId,
      userId: user.sub,
      entityType: 'quotation_version',
      entityId: versionId,
      fileName: `${version.quotation.quoteNumber}-v${version.versionNumber}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      visibility: 'customer',
    });

    await this.files.upload({
      organizationId: user.organizationId,
      userId: user.sub,
      entityType: 'quotation_version',
      entityId: versionId,
      fileName: `${version.quotation.quoteNumber}-v${version.versionNumber}.html`,
      mimeType: 'text/html',
      buffer: Buffer.from(html, 'utf8'),
      visibility: 'customer',
    });

    await this.prisma.quotationVersion.update({
      where: { id: versionId },
      data: { pdfDocumentId: doc.id },
    });

    await this.outbox.enqueue({
      organizationId: user.organizationId,
      eventType: 'pdf.generation',
      payload: {
        documentId: doc.id,
        quotationVersionId: versionId,
        mimeType: 'application/pdf',
      },
    });

    return {
      documentId: doc.id,
      contentUrl: doc.contentUrl,
      storageKey: doc.storageKey,
      fileName: doc.name,
      mimeType: doc.mimeType,
      previewHtml: html,
      delivery: 'pdf' as const,
      quoteNumber: version.quotation.quoteNumber,
      tripTitle: version.quotation.trip.title,
      versionLabel: quote.versionLabel,
    };
  }

  async sendEmail(user: AuthUser, versionId: string, toEmail: string) {
    const pdf = await this.generatePdf(user, versionId);
    const quoteRef = pdf.versionLabel
      ? `${pdf.quoteNumber} (${pdf.versionLabel})`
      : pdf.quoteNumber;
    const subject = `Travel proposal — ${pdf.tripTitle} · ${pdf.quoteNumber}`;
    const body = [
      `Hello,`,
      ``,
      `Please find attached our travel proposal for ${pdf.tripTitle} (${quoteRef}).`,
      ``,
      `If you have any questions, reply to this email and we will be happy to help.`,
    ].join('\n');

    await this.outbox.enqueue({
      organizationId: user.organizationId,
      eventType: 'quote.email',
      payload: {
        quotationVersionId: versionId,
        toEmail,
        documentId: pdf.documentId,
        storageKey: pdf.storageKey,
        fileName: pdf.fileName,
        mimeType: pdf.mimeType,
        subject,
        body,
      },
    });
    await this.transition(user, versionId, 'send');
    return { queued: true, ...pdf };
  }

  async savePdfToDrive(user: AuthUser, versionId: string) {
    if (!this.google) throw new BadRequestException('Google Drive is not available');
    const pdf = await this.generatePdf(user, versionId);
    const drive = await this.google.saveDocumentToDrive(user, pdf.documentId);
    return { ...pdf, drive };
  }
}
