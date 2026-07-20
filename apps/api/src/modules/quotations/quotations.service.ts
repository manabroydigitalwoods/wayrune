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
  CreateTripFromPackageInput,
  CloneQuotationInput,
  CreateQuoteTemplateInput,
  LockQuoteFxInput,
  MarkQuoteSentInput,
  QuotationItem,
  RecordQuoteFitTimingInput,
  RecordQuoteInventoryRiskAcksInput,
  RecordQuoteMarginOverridesInput,
  RecordQuoteRateDriftAcksInput,
  RestoreQuoteTemplateInput,
  RenameQuoteTemplateFolderInput,
  UpsertQuoteTemplateFolderInput,
  RemoveQuoteTemplateFolderInput,
  SaveQuotationVersionInput,
  SendQuoteWhatsappInput,
  UpdateQuoteTemplateInput,
} from '@wayrune/contracts';
import {
  lineMarginPolicyViolation,
  lineNeedsAllotmentRiskAck,
  lineNeedsCapacityRiskAck,
  lineNeedsMinStayRiskAck,
  lineNeedsRateDriftAck,
  parseMinMarginPercent,
  resolveTripWindowDisplay,
} from '@wayrune/contracts';
import { hashPassword } from '@wayrune/auth';
import { loadEnv } from '@wayrune/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { FilesService } from '../files/files.service';
import { LeadsService } from '../leads/leads.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GoogleService } from '../google/google.service';
import { MetaCloudMessagingProvider } from '../messaging/meta-cloud.messaging';
import { InteractionsService } from '../interactions/interactions.service';
import { OperationsService } from '../operations/operations.service';
import { TripsService } from '../trips/trips.service';
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
import {
  formatOrgTaxDisplaySplitLines,
  formatOrgTaxIdentityLines,
  orgTaxDisplaySplitCue,
  orgTaxTotalsLabel,
  parseOrgTaxIdentity,
  type OrgTaxIdentity,
} from '../../common/org-tax-identity';
import { inferDestinationPlaceOfSupplyFromLabels } from '../../common/destination-pos-infer';
import { placeAncestorLabelsForRefs } from '../../common/place-refs';
import {
  parseQuoteTaxIdentity,
  quoteTaxIdentityToJson,
} from '../../common/quote-tax-identity';
import { calcQuoteTotals, escapeHtml, formatCurrency, type AuthUser } from '../../common/helpers';
import { buildBrandedProposalPdf } from './branded-proposal-pdf';
import {
  checklistToText,
  buildItineraryDaysFromHotelItems,
  contentFromVersionFields,
  normalizeTemplateFolder,
  parseQuoteTemplateContent,
  reanchorItineraryDaysToTripStart,
  remintQuoteItems,
  remintTemplateItineraryDays,
  resolveApplyPax,
  resolveTemplateApplyTravelStart,
  shiftQuoteItemsToTripStart,
  stampApplyPaxOntoQuoteItems,
  templateItineraryDays,
} from './quote-template-content';
import {
  remapTemplateFolderPrefix,
  templateFolderMatchesPrefix,
} from './quote-template-folder-rename';
import {
  addPackageFolderToIndex,
  mergePackageFolderSources,
  parsePackageFolderIndex,
  remapPackageFolderIndex,
  removePackageFolderFromIndex,
  withPackageFolderIndex,
} from './quote-template-folder-index';
import { rematchQuoteItemsFromRates } from './quote-rate-rematch';
import { RatesService } from '../rates/rates.service';
import { resolveNationalityOptsFromTripTravellers } from '../rates/hotel-nationality';
import { diffQuoteTemplateContent } from './quote-template-diff';
import {
  normalizeTemplateName,
  orderTemplateVersionChain,
  planQuoteTemplateCreate,
  planQuoteTemplateRestore,
  templateApplyBlockedReason,
  type TemplateChainRow,
} from './quote-template-version';
import {
  defaultValidUntilDate,
  isQuoteValidUntilExpired,
  isQuoteWithinPostExpiryGrace,
  quoteValidityDaysFromSettings,
  quoteValidityGraceHoursFromSettings,
  shouldAutoExtendQuoteValidity,
  shouldBlockSendPastGrace,
  shouldExtendValidityOnSend,
  syncTermsWithValidUntil,
} from './quote-validity';
import {
  buildQuoteFxLock,
  convertBuyToQuoteCurrency,
  fxLockCoversQuote,
  normalizeCurrency,
  parseOrgFxRates,
  parseQuoteFxLock,
  quoteFxLockToJson,
  sameCurrencyLock,
} from './quote-fx';
import { pickQuoteProposalTemplate } from './quote-whatsapp-template';
import {
  evaluateWhatsappCustomerSession,
  WHATSAPP_CUSTOMER_SESSION_MS,
} from '../messaging/whatsapp-customer-session';

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
    private messaging: MetaCloudMessagingProvider,
    @Inject(forwardRef(() => InteractionsService))
    private interactions: InteractionsService,
    @Optional()
    @Inject(forwardRef(() => GoogleService))
    private google: GoogleService | undefined,
    private operations: OperationsService,
    private trips: TripsService,
    private rates: RatesService,
  ) {}

  private async ensureTrip(
    organizationId: string,
    tripId: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const trip = await db.trip.findFirst({
      where: { id: tripId, organizationId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  private async orgQuoteValidityDays(organizationId: string): Promise<number> {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    return quoteValidityDaysFromSettings(org?.settingsJson);
  }

  private async freshQuoteValidity(organizationId: string): Promise<{
    validUntil: Date;
    termsWithValidity: (terms: string | null | undefined) => string;
  }> {
    const days = await this.orgQuoteValidityDays(organizationId);
    const validUntil = defaultValidUntilDate(days);
    return {
      validUntil,
      termsWithValidity: (terms) => syncTermsWithValidUntil(terms, validUntil),
    };
  }

  /**
   * Commercial readiness for send / request-approval / approve.
   * Margin floor applies to all senders (not only quote.view_cost).
   * Missing validUntil blocks; expired past grace blocks; in-grace keeps date;
   * near-expiry auto-extends to org default only after other gates pass.
   */
  private async assertQuoteReadyForCustomer(
    user: AuthUser,
    version: {
      id: string;
      currency?: string;
      exchangeRatesJson?: unknown;
      itemsJson: unknown;
      validUntil: Date | null;
      terms: string | null;
      quotation: { tripId: string; organizationId: string };
    },
    opts?: { autoExtendValidity?: boolean; extendValidity?: boolean },
  ): Promise<{ validityExtendedTo: string | null; validityGraceUsed: boolean }> {
    const autoExtend = opts?.autoExtendValidity !== false;
    const extendValidity = opts?.extendValidity === true;
    const items = Array.isArray(version.itemsJson)
      ? (version.itemsJson as Array<{
          description?: string;
          unitSell?: number | null;
          unitCost?: number | null;
          rateId?: string | null;
          rateKind?: string | null;
          rateProvenance?: {
            rateId?: string;
            rateKind?: string;
            matchedAt?: string;
            rateUpdatedAt?: string;
            rateDriftAckForUpdatedAt?: string;
            rateDriftAckReason?: string;
            allotmentWarn?: boolean;
            allotmentNote?: string;
            allotmentRiskAckForNote?: string;
            allotmentRiskAckReason?: string;
            capacityWarn?: boolean;
            capacityNote?: string;
            capacityRiskAckForNote?: string;
            capacityRiskAckReason?: string;
            minStayWarn?: boolean;
            minStayNote?: string;
            minStayRiskAckForNote?: string;
            minStayRiskAckReason?: string;
            calculation?: {
              minStayShort?: boolean;
              minStayNote?: string;
            } | null;
          } | null;
          marginOverride?: { reason?: string };
        }>)
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

    const missingCost = items.filter((i) => i.unitCost == null).length;
    if (missingCost > 0) {
      throw new BadRequestException(
        `${missingCost} service${missingCost === 1 ? '' : 's'} missing buy rate`,
      );
    }
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true, currency: true },
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
      const lossCount = unauthorised.filter(
        (i) =>
          lineMarginPolicyViolation(i.unitCost, i.unitSell, minMarginPercent)?.kind ===
          'loss',
      ).length;
      const floorCount = unauthorised.length - lossCount;
      const parts: string[] = [];
      if (lossCount > 0) {
        parts.push(`${lossCount} sell below cost`);
      }
      if (floorCount > 0) {
        parts.push(`${floorCount} below ${minMarginPercent}% margin floor`);
      }
      throw new BadRequestException(
        `${unauthorised.length} service${unauthorised.length === 1 ? '' : 's'} need a below-margin override (${parts.join('; ')}) — a manager with below_margin.approve must authorise selected lines`,
      );
    }

    await this.assertNoBlockingRateDrift(user.organizationId, items);
    this.assertNoBlockingAllotment(items);
    this.assertNoBlockingCapacity(items);
    this.assertNoBlockingMinStay(items);
    this.assertFxReadyForSend(version, org?.currency || 'INR');
    const travellers = await this.prisma.tripTraveller.count({
      where: { tripId: version.quotation.tripId },
    });
    if (travellers <= 0) {
      throw new BadRequestException('Add at least one traveller before sending');
    }

    const graceHours = quoteValidityGraceHoursFromSettings(org?.settingsJson);
    if (shouldBlockSendPastGrace(version.validUntil, graceHours)) {
      throw new BadRequestException(
        'Validity expired — reset the date before sending',
      );
    }
    const validityGraceUsed = isQuoteWithinPostExpiryGrace(
      version.validUntil,
      graceHours,
    );
    let validityExtendedTo: string | null = null;
    if (
      autoExtend &&
      shouldExtendValidityOnSend(version.validUntil, {
        graceHours,
        extendValidity,
      })
    ) {
      const { validUntil, termsWithValidity } = await this.freshQuoteValidity(
        version.quotation.organizationId,
      );
      await this.prisma.quotationVersion.update({
        where: { id: version.id },
        data: {
          validUntil,
          terms: termsWithValidity(version.terms),
        },
      });
      validityExtendedTo = validUntil.toISOString().slice(0, 10);
    }

    return {
      validityExtendedTo,
      validityGraceUsed: validityGraceUsed && !validityExtendedTo,
    };
  }

  private assertFxReadyForSend(
    version: { currency?: string; exchangeRatesJson?: unknown },
    orgCurrency: string,
  ) {
    const quote = normalizeCurrency(version.currency || orgCurrency);
    const base = normalizeCurrency(orgCurrency);
    if (quote === base) return;
    const lock = parseQuoteFxLock(version.exchangeRatesJson);
    if (!fxLockCoversQuote(lock, quote, base)) {
      throw new BadRequestException(
        `Lock an FX rate for ${quote} before sending (org books in ${base})`,
      );
    }
  }

  /** Block send/approve when hotel lines stamped with insufficient allotment (unless acked). */
  private assertNoBlockingAllotment(
    items: Array<{
      rateProvenance?: {
        allotmentWarn?: boolean;
        allotmentNote?: string;
        allotmentRiskAckForNote?: string;
        allotmentRiskAckReason?: string;
      } | null;
    }>,
  ) {
    const blocked = items.filter((i) =>
      lineNeedsAllotmentRiskAck({
        allotmentWarn: i.rateProvenance?.allotmentWarn,
        allotmentNote: i.rateProvenance?.allotmentNote,
        allotmentRiskAckForNote: i.rateProvenance?.allotmentRiskAckForNote,
        allotmentRiskAckReason: i.rateProvenance?.allotmentRiskAckReason,
      }),
    );
    if (!blocked.length) return;
    throw new BadRequestException(
      `${blocked.length} hotel service${blocked.length === 1 ? '' : 's'} ${
        blocked.length === 1 ? 'has' : 'have'
      } insufficient allotment — reduce rooms, pick another property, or acknowledge the shortfall with a reason before sending`,
    );
  }

  /** Block send/approve when transfer lines stamped with over-capacity (unless acked). */
  private assertNoBlockingCapacity(
    items: Array<{
      rateProvenance?: {
        capacityWarn?: boolean;
        capacityNote?: string;
        capacityRiskAckForNote?: string;
        capacityRiskAckReason?: string;
      } | null;
    }>,
  ) {
    const blocked = items.filter((i) =>
      lineNeedsCapacityRiskAck({
        capacityWarn: i.rateProvenance?.capacityWarn,
        capacityNote: i.rateProvenance?.capacityNote,
        capacityRiskAckForNote: i.rateProvenance?.capacityRiskAckForNote,
        capacityRiskAckReason: i.rateProvenance?.capacityRiskAckReason,
      }),
    );
    if (!blocked.length) return;
    throw new BadRequestException(
      `${blocked.length} transfer service${blocked.length === 1 ? '' : 's'} ${
        blocked.length === 1 ? 'has' : 'have'
      } insufficient vehicle capacity — add vehicles, reduce party, or acknowledge the shortfall with a reason before sending`,
    );
  }

  /** Block send/approve when hotel stay is below rate min stay (unless acked). */
  private assertNoBlockingMinStay(
    items: Array<{
      rateProvenance?: {
        minStayWarn?: boolean;
        minStayNote?: string;
        minStayRiskAckForNote?: string;
        minStayRiskAckReason?: string;
        calculation?: { minStayShort?: boolean; minStayNote?: string } | null;
      } | null;
    }>,
  ) {
    const blocked = items.filter((i) =>
      lineNeedsMinStayRiskAck({
        minStayWarn: i.rateProvenance?.minStayWarn,
        minStayNote:
          i.rateProvenance?.minStayNote ||
          i.rateProvenance?.calculation?.minStayNote,
        minStayRiskAckForNote: i.rateProvenance?.minStayRiskAckForNote,
        minStayRiskAckReason: i.rateProvenance?.minStayRiskAckReason,
        minStayShort: i.rateProvenance?.calculation?.minStayShort,
      }),
    );
    if (!blocked.length) return;
    throw new BadRequestException(
      `${blocked.length} hotel service${blocked.length === 1 ? '' : 's'} ${
        blocked.length === 1 ? 'is' : 'are'
      } below minimum stay — extend nights, pick another rate, or acknowledge the shortfall with a reason before sending`,
    );
  }

  /**
   * Accept-time readiness: no auto-extend; reject expired quotes.
   */
  private async assertQuoteReadyForAccept(
    user: AuthUser,
    version: {
      id: string;
      itemsJson: unknown;
      validUntil: Date | null;
      terms: string | null;
      quotation: { tripId: string; organizationId: string };
    },
  ) {
    if (!version.validUntil) {
      throw new BadRequestException('This proposal has no validity date and cannot be accepted');
    }
    if (isQuoteValidUntilExpired(version.validUntil)) {
      throw new BadRequestException(
        'This proposal has expired — ask your agency for an updated quotation',
      );
    }
    await this.assertQuoteReadyForCustomer(user, version, { autoExtendValidity: false });
  }

  /** Block send/approve when matched chart rows are newer than the line snapshot (unless ack'd). */
  private async assertNoBlockingRateDrift(
    organizationId: string,
    items: Array<{
      description?: string;
      rateId?: string | null;
      rateKind?: string | null;
      rateProvenance?: {
        rateId?: string;
        rateKind?: string;
        matchedAt?: string;
        rateUpdatedAt?: string;
        rateDriftAckForUpdatedAt?: string;
        rateDriftAckReason?: string;
      } | null;
    }>,
  ) {
    const candidates = items
      .map((item, index) => {
        const rateId =
          item.rateProvenance?.rateId?.trim() || item.rateId?.trim() || '';
        if (!rateId) return null;
        return { item, index, rateId };
      })
      .filter(Boolean) as Array<{
      item: (typeof items)[number];
      index: number;
      rateId: string;
    }>;
    if (!candidates.length) return;

    const updatedAtById = await this.loadRateChartUpdatedAtById(
      organizationId,
      candidates.map((c) => c.item),
    );

    const blocking = candidates.filter(({ item, rateId }) => {
      const currentUpdatedAt = updatedAtById.get(rateId);
      if (!currentUpdatedAt) return false;
      return lineNeedsRateDriftAck({
        matchedAt: item.rateProvenance?.matchedAt,
        rateUpdatedAtAtMatch: item.rateProvenance?.rateUpdatedAt,
        currentUpdatedAt,
        ackForUpdatedAt: item.rateProvenance?.rateDriftAckForUpdatedAt,
        ackReason: item.rateProvenance?.rateDriftAckReason,
      });
    });

    if (!blocking.length) return;
    const labels = blocking
      .slice(0, 3)
      .map((b) => b.item.description?.trim() || `Line ${b.index + 1}`)
      .join(', ');
    const more =
      blocking.length > 3 ? ` (+${blocking.length - 3} more)` : '';
    throw new BadRequestException(
      `${blocking.length} service${blocking.length === 1 ? '' : 's'} have a newer rate chart since match (${labels}${more}) — rematch or acknowledge the chart change with a reason before sending`,
    );
  }

  async createQuotation(user: AuthUser, tripId: string) {
    await this.ensureTrip(user.organizationId, tripId);
    const { validUntil, termsWithValidity } = await this.freshQuoteValidity(
      user.organizationId,
    );
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { currency: true },
    });
    const currency = normalizeCurrency(org?.currency || 'INR');
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
            currency,
            exchangeRatesJson: quoteFxLockToJson(sameCurrencyLock(currency)) as Prisma.InputJsonValue,
            validUntil,
            terms: termsWithValidity(null),
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
    const { validUntil, termsWithValidity } = await this.freshQuoteValidity(
      user.organizationId,
    );
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
            validUntil,
            itemsJson: accepted.itemsJson as Prisma.InputJsonValue,
            inclusions: accepted.inclusions,
            exclusions: accepted.exclusions,
            terms: termsWithValidity(accepted.terms),
            exchangeRatesJson: (parseQuoteFxLock(accepted.exchangeRatesJson) != null
              ? accepted.exchangeRatesJson
              : quoteFxLockToJson(
                  sameCurrencyLock(normalizeCurrency(accepted.currency)),
                )) as Prisma.InputJsonValue,
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
    const [items, org] = await Promise.all([
      this.prisma.quoteTemplate.findMany({
        where: { organizationId: user.organizationId, status: 'active' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.organization.findFirst({
        where: { id: user.organizationId },
        select: { settingsJson: true },
      }),
    ]);
    const mapped = items.map((t) => ({
      id: t.id,
      name: t.name,
      versionNumber: t.versionNumber,
      status: t.status,
      createdAt: t.createdAt,
      content: parseQuoteTemplateContent(t.contentJson),
    }));
    const index = parsePackageFolderIndex(org?.settingsJson);
    const folderIndex = mergePackageFolderSources(
      index,
      mapped.map((t) => t.content.folder),
    );
    return {
      items: mapped,
      folderIndex,
    };
  }

  /** Embed trip Story days/meta into a save-as-template payload when missing. */
  private async loadTripItinerarySnapshot(
    organizationId: string,
    tripId: string,
  ): Promise<{ days?: Record<string, unknown>[]; story?: Record<string, unknown> } | null> {
    const itinerary = await this.prisma.itinerary.findFirst({
      where: { tripId, organizationId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const version = itinerary?.versions[0];
    if (!version?.contentJson || typeof version.contentJson !== 'object') return null;
    const content = version.contentJson as Record<string, unknown>;
    const days = Array.isArray(content.days) ? (content.days as Record<string, unknown>[]) : [];
    const story =
      content.story && typeof content.story === 'object' && !Array.isArray(content.story)
        ? (content.story as Record<string, unknown>)
        : undefined;
    if (!days.length && !story) return null;
    return {
      ...(days.length ? { days } : {}),
      ...(story ? { story } : {}),
    };
  }

  async createTemplate(user: AuthUser, input: CreateQuoteTemplateInput) {
    let content = input.contentJson ? parseQuoteTemplateContent(input.contentJson) : null;
    let tripIdForEmbed = input.tripId ?? null;

    if (input.versionId) {
      const version = await this.prisma.quotationVersion.findFirst({
        where: {
          id: input.versionId,
          quotation: { organizationId: user.organizationId },
        },
        include: { quotation: { select: { tripId: true } } },
      });
      if (!version) throw new NotFoundException('Quotation version not found');
      content = contentFromVersionFields({
        currency: version.currency,
        itemsJson: version.itemsJson,
        inclusions: version.inclusions,
        exclusions: version.exclusions,
        terms: version.terms,
        destinationHint: content?.destinationHint,
        tags: content?.tags,
        folder: content?.folder,
        itinerary: content?.itinerary,
      });
      if (!tripIdForEmbed) tripIdForEmbed = version.quotation.tripId;
    }

    if (!content) {
      throw new BadRequestException('Provide contentJson or versionId');
    }

    if (tripIdForEmbed && !content.itinerary?.days?.length && !content.itinerary?.story) {
      const embedded = await this.loadTripItinerarySnapshot(
        user.organizationId,
        tripIdForEmbed,
      );
      if (embedded) {
        content = { ...content, itinerary: embedded };
      }
    }

    const name = normalizeTemplateName(input.name);
    const actives = await this.prisma.quoteTemplate.findMany({
      where: { organizationId: user.organizationId, status: 'active' },
      select: { id: true, name: true, versionNumber: true },
      take: 200,
    });

    let plan;
    try {
      plan = planQuoteTemplateCreate({
        name,
        activeTemplates: actives,
        supersedeTemplateId: input.supersedeTemplateId,
        asNew: input.asNew,
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid template create');
    }

    const template = await this.prisma.$transaction(async (tx) => {
      if (plan.kind === 'supersede') {
        await tx.quoteTemplate.update({
          where: { id: plan.supersedesId },
          data: { status: 'superseded' },
        });
      }
      return tx.quoteTemplate.create({
        data: {
          organizationId: user.organizationId,
          name,
          contentJson: content as unknown as Prisma.InputJsonValue,
          versionNumber: plan.versionNumber,
          status: 'active',
          supersedesId: plan.supersedesId,
        },
      });
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.template_create',
      entityType: 'quote_template',
      entityId: template.id,
      metadata: {
        hasItineraryDays: Boolean(content.itinerary?.days?.length),
        versionNumber: template.versionNumber,
        supersededTemplateId: plan.supersedesId,
      },
    });

    return {
      id: template.id,
      name: template.name,
      versionNumber: template.versionNumber,
      status: template.status,
      createdAt: template.createdAt,
      content: parseQuoteTemplateContent(template.contentJson),
      supersededTemplateId: plan.supersedesId,
    };
  }

  async updateTemplate(user: AuthUser, templateId: string, input: UpdateQuoteTemplateInput) {
    const existing = await this.prisma.quoteTemplate.findFirst({
      where: { id: templateId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Quote template not found');
    if (existing.status !== 'active') {
      throw new BadRequestException('Only active templates can be updated');
    }

    // Content changes create a new version (immutable history); rename stays in place.
    if (input.contentJson != null) {
      const content = parseQuoteTemplateContent(input.contentJson);
      const name =
        input.name != null ? normalizeTemplateName(input.name) : existing.name;
      const template = await this.prisma.$transaction(async (tx) => {
        await tx.quoteTemplate.update({
          where: { id: existing.id },
          data: { status: 'superseded' },
        });
        return tx.quoteTemplate.create({
          data: {
            organizationId: user.organizationId,
            name,
            contentJson: content as unknown as Prisma.InputJsonValue,
            versionNumber: existing.versionNumber + 1,
            status: 'active',
            supersedesId: existing.id,
          },
        });
      });
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.sub,
        action: 'quote.template_create',
        entityType: 'quote_template',
        entityId: template.id,
        metadata: {
          versionNumber: template.versionNumber,
          supersededTemplateId: existing.id,
          via: 'update',
        },
      });
      return {
        id: template.id,
        name: template.name,
        versionNumber: template.versionNumber,
        status: template.status,
        createdAt: template.createdAt,
        content: parseQuoteTemplateContent(template.contentJson),
        supersededTemplateId: existing.id,
      };
    }

    const template = await this.prisma.quoteTemplate.update({
      where: { id: existing.id },
      data: {
        ...(input.name != null ? { name: normalizeTemplateName(input.name) } : {}),
      },
    });

    return {
      id: template.id,
      name: template.name,
      versionNumber: template.versionNumber,
      status: template.status,
      createdAt: template.createdAt,
      content: parseQuoteTemplateContent(template.contentJson),
    };
  }

  async deleteTemplate(user: AuthUser, templateId: string) {
    const existing = await this.prisma.quoteTemplate.findFirst({
      where: { id: templateId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Quote template not found');
    if (existing.status !== 'active') {
      throw new BadRequestException('Only active templates can be deleted');
    }
    // Soft-retire so version history (supersedes chain) stays intact.
    await this.prisma.quoteTemplate.update({
      where: { id: existing.id },
      data: { status: 'superseded' },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.template_delete',
      entityType: 'quote_template',
      entityId: existing.id,
      metadata: { versionNumber: existing.versionNumber },
    });
    return { ok: true as const };
  }

  /** Bulk rename/move `contentJson.folder` path prefix on active templates. */
  async renameTemplateFolders(
    user: AuthUser,
    input: RenameQuoteTemplateFolderInput,
  ) {
    const from = normalizeTemplateFolder(input.fromFolder);
    if (!from) {
      throw new BadRequestException('From folder is required');
    }
    const toNormalized = normalizeTemplateFolder(input.toFolder);
    const actives = await this.prisma.quoteTemplate.findMany({
      where: { organizationId: user.organizationId, status: 'active' },
    });
    let updated = 0;
    const touchedIds: string[] = [];
    for (const row of actives) {
      const content = parseQuoteTemplateContent(row.contentJson);
      if (!templateFolderMatchesPrefix(content.folder, from)) continue;
      const nextFolder = remapTemplateFolderPrefix(
        content.folder,
        from,
        input.toFolder,
      );
      if ((content.folder || '') === (nextFolder || '')) continue;
      const nextContent = { ...content } as Record<string, unknown>;
      if (nextFolder) nextContent.folder = nextFolder;
      else delete nextContent.folder;
      await this.prisma.quoteTemplate.update({
        where: { id: row.id },
        data: {
          contentJson: nextContent as Prisma.InputJsonValue,
        },
      });
      updated += 1;
      touchedIds.push(row.id);
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    const prevIndex = parsePackageFolderIndex(org?.settingsJson);
    const nextIndex = remapPackageFolderIndex(prevIndex, from, input.toFolder);
    const indexChanged =
      JSON.stringify(prevIndex) !== JSON.stringify(nextIndex);
    if (indexChanged) {
      await this.prisma.organization.update({
        where: { id: user.organizationId },
        data: {
          settingsJson: withPackageFolderIndex(
            org?.settingsJson,
            nextIndex,
          ) as Prisma.InputJsonValue,
        },
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.template_folder_rename',
      entityType: 'quote_template',
      entityId: touchedIds[0] || from,
      metadata: {
        fromFolder: from,
        toFolder: toNormalized ?? null,
        updated,
        templateIds: touchedIds,
        folderIndexRemapped: indexChanged,
      },
    });
    return {
      ok: true as const,
      fromFolder: from,
      toFolder: toNormalized ?? null,
      updated,
      folderIndex: nextIndex,
    };
  }

  /** Add an empty folder path to the org package folder index. */
  async upsertTemplateFolder(
    user: AuthUser,
    input: UpsertQuoteTemplateFolderInput,
  ) {
    const folder = normalizeTemplateFolder(input.folder);
    if (!folder) {
      throw new BadRequestException('Folder is required');
    }
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    const prev = parsePackageFolderIndex(org?.settingsJson);
    const next = addPackageFolderToIndex(prev, folder);
    if (JSON.stringify(prev) === JSON.stringify(next)) {
      return { ok: true as const, folder, folderIndex: next, created: false };
    }
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        settingsJson: withPackageFolderIndex(
          org?.settingsJson,
          next,
        ) as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.template_folder_index_add',
      entityType: 'organization',
      entityId: user.organizationId,
      metadata: { folder },
    });
    return { ok: true as const, folder, folderIndex: next, created: true };
  }

  /** Remove a folder path from the org index (templates untouched). */
  async removeTemplateFolder(
    user: AuthUser,
    input: RemoveQuoteTemplateFolderInput,
  ) {
    const folder = normalizeTemplateFolder(input.folder);
    if (!folder) {
      throw new BadRequestException('Folder is required');
    }
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { settingsJson: true },
    });
    const prev = parsePackageFolderIndex(org?.settingsJson);
    const next = removePackageFolderFromIndex(prev, folder);
    if (JSON.stringify(prev) === JSON.stringify(next)) {
      return { ok: true as const, folder, folderIndex: next, removed: false };
    }
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        settingsJson: withPackageFolderIndex(
          org?.settingsJson,
          next,
        ) as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.template_folder_index_remove',
      entityType: 'organization',
      entityId: user.organizationId,
      metadata: { folder },
    });
    return { ok: true as const, folder, folderIndex: next, removed: true };
  }

  /** Walk supersedes chain for any template id (active or superseded). */
  private async loadTemplateVersionChain(
    organizationId: string,
    templateId: string,
  ): Promise<Array<{
    id: string;
    name: string;
    versionNumber: number;
    status: string;
    supersedesId: string | null;
    createdAt: Date;
    contentJson: unknown;
  }>> {
    const seed = await this.prisma.quoteTemplate.findFirst({
      where: { id: templateId, organizationId },
    });
    if (!seed) throw new NotFoundException('Quote template not found');

    const byId = new Map<string, TemplateChainRow & { createdAt: Date; contentJson: unknown }>();
    const queue = [seed];
    while (queue.length) {
      const row = queue.shift()!;
      if (byId.has(row.id)) continue;
      byId.set(row.id, {
        id: row.id,
        name: row.name,
        versionNumber: row.versionNumber,
        status: row.status,
        supersedesId: row.supersedesId,
        createdAt: row.createdAt,
        contentJson: row.contentJson,
      });
      if (row.supersedesId && !byId.has(row.supersedesId)) {
        const prev = await this.prisma.quoteTemplate.findFirst({
          where: { id: row.supersedesId, organizationId },
        });
        if (prev) queue.push(prev);
      }
      const next = await this.prisma.quoteTemplate.findFirst({
        where: { organizationId, supersedesId: row.id },
      });
      if (next && !byId.has(next.id)) queue.push(next);
    }

    const chainRows = new Map<string, TemplateChainRow>();
    const childByParentId = new Map<string, TemplateChainRow>();
    for (const row of byId.values()) {
      const slim: TemplateChainRow = {
        id: row.id,
        name: row.name,
        versionNumber: row.versionNumber,
        status: row.status,
        supersedesId: row.supersedesId,
      };
      chainRows.set(row.id, slim);
      if (row.supersedesId) childByParentId.set(row.supersedesId, slim);
    }

    const ordered = orderTemplateVersionChain(seed.id, chainRows, childByParentId);
    return ordered.map((r) => {
      const full = byId.get(r.id)!;
      return {
        id: full.id,
        name: full.name,
        versionNumber: full.versionNumber,
        status: full.status,
        supersedesId: full.supersedesId,
        createdAt: full.createdAt,
        contentJson: full.contentJson,
      };
    });
  }

  async listTemplateVersions(user: AuthUser, templateId: string) {
    const chain = await this.loadTemplateVersionChain(user.organizationId, templateId);
    const activeTip = [...chain].reverse().find((t) => t.status === 'active') ?? null;
    const activeContent = activeTip
      ? parseQuoteTemplateContent(activeTip.contentJson)
      : null;
    // Newest first for History UI.
    const items = [...chain].reverse().map((t) => {
      const content = parseQuoteTemplateContent(t.contentJson);
      const lineCount = Array.isArray(content.items) ? content.items.length : 0;
      const diffVsActive =
        activeContent && t.status !== 'active'
          ? (() => {
              const diff = diffQuoteTemplateContent(content, activeContent);
              if (!diff.summary) return { summary: null as string | null };
              return {
                summary: diff.summary,
                addedTitles: diff.addedTitles.slice(0, 5),
                removedTitles: diff.removedTitles.slice(0, 5),
                changedTitles: diff.changedTitles.slice(0, 5),
                metaChanges: diff.metaChanges,
                rows: diff.rows.slice(0, 24),
              };
            })()
          : undefined;
      return {
        id: t.id,
        name: t.name,
        versionNumber: t.versionNumber,
        status: t.status,
        createdAt: t.createdAt,
        lineCount,
        destinationHint: content.destinationHint ?? null,
        ...(diffVsActive ? { diffVsActive } : {}),
      };
    });
    return { items };
  }

  async restoreTemplate(user: AuthUser, templateId: string, input: RestoreQuoteTemplateInput) {
    const chain = await this.loadTemplateVersionChain(user.organizationId, templateId);
    const source = chain.find((t) => t.id === input.fromTemplateId);
    if (!source) {
      throw new BadRequestException('Restore source is not in this template version chain');
    }

    const activeTip = chain.find((t) => t.status === 'active') ?? null;
    let plan;
    try {
      plan = planQuoteTemplateRestore({
        sourceId: source.id,
        sourceStatus: source.status,
        sourceVersionNumber: source.versionNumber,
        activeTip: activeTip
          ? { id: activeTip.id, versionNumber: activeTip.versionNumber }
          : null,
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Cannot restore template');
    }

    const content = parseQuoteTemplateContent(source.contentJson);
    const name = normalizeTemplateName(source.name);

    const template = await this.prisma.$transaction(async (tx) => {
      if (plan.supersedesId) {
        await tx.quoteTemplate.update({
          where: { id: plan.supersedesId },
          data: { status: 'superseded' },
        });
      }
      return tx.quoteTemplate.create({
        data: {
          organizationId: user.organizationId,
          name,
          contentJson: content as unknown as Prisma.InputJsonValue,
          versionNumber: plan.versionNumber,
          status: 'active',
          supersedesId: plan.supersedesId,
        },
      });
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.template_restore',
      entityType: 'quote_template',
      entityId: template.id,
      metadata: {
        fromTemplateId: source.id,
        fromVersionNumber: source.versionNumber,
        versionNumber: template.versionNumber,
        supersededTemplateId: plan.supersedesId,
      },
    });

    return {
      id: template.id,
      name: template.name,
      versionNumber: template.versionNumber,
      status: template.status,
      createdAt: template.createdAt,
      content: parseQuoteTemplateContent(template.contentJson),
      restoredFromTemplateId: source.id,
      supersededTemplateId: plan.supersedesId,
    };
  }

  async createFromTemplate(
    user: AuthUser,
    tripId: string,
    input: ApplyQuoteTemplateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    let trip = await this.ensureTrip(user.organizationId, tripId, db);
    const template = await db.quoteTemplate.findFirst({
      where: { id: input.templateId, organizationId: user.organizationId },
    });
    if (!template) throw new NotFoundException('Quote template not found');
    const applyBlock = templateApplyBlockedReason(template.status);
    if (applyBlock) {
      throw new BadRequestException(applyBlock);
    }

    let travelStart: { isoDay: string; shouldStampTrip: boolean };
    try {
      travelStart = resolveTemplateApplyTravelStart({
        tripStartDate: trip.startDate,
        requestedStartDate: input.startDate,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Travel start date is required to apply a template',
      );
    }

    if (travelStart.shouldStampTrip) {
      trip = await db.trip.update({
        where: { id: trip.id },
        data: { startDate: new Date(travelStart.isoDay) },
      });
    }

    const content = parseQuoteTemplateContent(template.contentJson);
    const reminted = remintQuoteItems((content.items ?? []) as QuotationItem[]);
    const { items: shifted, shiftDays, anchorDay } = shiftQuoteItemsToTripStart(
      reminted,
      travelStart.isoDay,
    );
    const applyPax = resolveApplyPax({
      adults: input.adults,
      children: input.children,
      childAges: input.childAges,
      childrenWithoutBed: input.childrenWithoutBed,
    });
    const { items: stampedItems, stampedCount: paxStampedCount } = applyPax
      ? stampApplyPaxOntoQuoteItems(shifted, applyPax)
      : { items: shifted, stampedCount: 0 };
    const tripTravellerRows = await db.tripTraveller.findMany({
      where: { tripId },
      select: {
        isLead: true,
        traveller: { select: { nationality: true } },
      },
    });
    const rematch = await rematchQuoteItemsFromRates(
      this.rates,
      user.organizationId,
      stampedItems,
      {
        startDate: travelStart.isoDay,
        adults: applyPax?.adults,
        children: applyPax?.children,
        partyId: trip.partyId ?? null,
        ...resolveNationalityOptsFromTripTravellers(tripTravellerRows),
        destinationPlaceOfSupply: trip.destinationPlaceOfSupply ?? null,
      },
    );
    const items = rematch.items;
    const totals = calcQuoteTotals(items, 0);
    const count = await db.quotation.count({
      where: { organizationId: user.organizationId },
    });
    const { validUntil, termsWithValidity } = await this.freshQuoteValidity(
      user.organizationId,
    );

    const quotation = await db.quotation.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        quoteNumber: `QT-${String(count + 1).padStart(5, '0')}`,
        versions: {
          create: {
            versionNumber: 1,
            label: `v1 (from ${template.name} v${template.versionNumber})`,
            status: 'draft',
            currency: content.currency || 'INR',
            validUntil,
            itemsJson: items as unknown as Prisma.InputJsonValue,
            inclusions: checklistToText(content.inclusions),
            exclusions: checklistToText(content.exclusions),
            terms: termsWithValidity(content.terms ?? null),
            exchangeRatesJson: quoteFxLockToJson(
              sameCurrencyLock(normalizeCurrency(content.currency || 'INR')),
            ) as Prisma.InputJsonValue,
            ...totals,
            createdBy: user.sub,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    const itineraryApply = await this.applyTemplateItineraryToTrip(
      user.organizationId,
      tripId,
      travelStart.isoDay,
      content.itinerary,
      items,
      db,
    );

    if (!tx) {
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.sub,
        action: 'quote.create_from_template',
        entityType: 'quotation',
        entityId: quotation.id,
        metadata: {
          templateId: template.id,
          templateName: template.name,
          templateVersionNumber: template.versionNumber,
          dateShiftDays: shiftDays,
          templateAnchorDay: anchorDay,
          tripStartDate: travelStart.isoDay,
          tripStartStamped: travelStart.shouldStampTrip,
          applyAdults: applyPax?.adults ?? null,
          applyChildren: applyPax?.children ?? null,
          applyChildAges: applyPax?.childAges ?? null,
          applyChildrenWithoutBed: applyPax?.childrenWithoutBed ?? null,
          paxStampedCount,
          rematchMatched: rematch.matchedCount,
          rematchUnmatched: rematch.unmatchedCount,
          itineraryDaysReanchored: itineraryApply.reanchored,
          itineraryDaysSeeded: itineraryApply.seeded,
          itineraryDaysBuiltFromHotels: itineraryApply.builtFromHotels,
        },
      });
    }

    return {
      ...quotation,
      dateShiftDays: shiftDays,
      tripStartDate: travelStart.isoDay,
      tripStartStamped: travelStart.shouldStampTrip,
      applyAdults: applyPax?.adults ?? null,
      applyChildren: applyPax?.children ?? null,
      applyChildAges: applyPax?.childAges ?? null,
      applyChildrenWithoutBed: applyPax?.childrenWithoutBed ?? null,
      paxStampedCount,
      rematchMatched: rematch.matchedCount,
      rematchUnmatched: rematch.unmatchedCount,
      itineraryDaysReanchored: itineraryApply.reanchored,
      itineraryDaysSeeded: itineraryApply.seeded,
      itineraryDaysBuiltFromHotels: itineraryApply.builtFromHotels,
      templateId: template.id,
      templateName: template.name,
      templateVersionNumber: template.versionNumber,
      templateAnchorDay: anchorDay,
    };
  }

  /** Create trip + apply package in one transaction (no orphan trip on apply failure). */
  async createTripFromPackage(user: AuthUser, input: CreateTripFromPackageInput) {
    const startDate = input.startDate.slice(0, 10);
    const result = await this.prisma.$transaction(async (tx) => {
      const trip = await this.trips.create(
        user,
        {
          title: input.title,
          partyId: input.partyId ?? null,
          startDate,
          endDate: input.endDate ?? null,
          destinations: input.destinations,
        },
        tx,
      );
      const quotation = await this.createFromTemplate(
        user,
        trip.id,
        {
          templateId: input.templateId,
          startDate,
          adults: input.adults,
          children: input.children,
          childAges: input.childAges,
          childrenWithoutBed: input.childrenWithoutBed,
        },
        tx,
      );
      return { trip, quotation };
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'trip.create',
      entityType: 'trip',
      entityId: result.trip.id,
      metadata: { fromPackage: true, templateId: input.templateId },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.create_from_template',
      entityType: 'quotation',
      entityId: result.quotation.id,
      metadata: {
        templateId: result.quotation.templateId,
        templateName: result.quotation.templateName,
        templateVersionNumber: result.quotation.templateVersionNumber,
        dateShiftDays: result.quotation.dateShiftDays,
        templateAnchorDay: result.quotation.templateAnchorDay,
        tripStartDate: result.quotation.tripStartDate,
        tripStartStamped: result.quotation.tripStartStamped,
        applyAdults: result.quotation.applyAdults,
        applyChildren: result.quotation.applyChildren,
        applyChildAges: result.quotation.applyChildAges,
        applyChildrenWithoutBed: result.quotation.applyChildrenWithoutBed,
        paxStampedCount: result.quotation.paxStampedCount,
        rematchMatched: result.quotation.rematchMatched,
        rematchUnmatched: result.quotation.rematchUnmatched,
        itineraryDaysReanchored: result.quotation.itineraryDaysReanchored,
        itineraryDaysSeeded: result.quotation.itineraryDaysSeeded,
        itineraryDaysBuiltFromHotels: result.quotation.itineraryDaysBuiltFromHotels,
        fromPackage: true,
      },
    });

    return {
      id: result.trip.id,
      tripNumber: result.trip.tripNumber,
      title: result.trip.title,
      quoteNumber: result.quotation.quoteNumber,
      quotationId: result.quotation.id,
      dateShiftDays: result.quotation.dateShiftDays,
      tripStartDate: result.quotation.tripStartDate,
      applyAdults: result.quotation.applyAdults,
      applyChildren: result.quotation.applyChildren,
      applyChildAges: result.quotation.applyChildAges,
      applyChildrenWithoutBed: result.quotation.applyChildrenWithoutBed,
      paxStampedCount: result.quotation.paxStampedCount,
      rematchMatched: result.quotation.rematchMatched,
      rematchUnmatched: result.quotation.rematchUnmatched,
    };
  }


  /**
   * Seed empty trip story from template itinerary, else scaffold from hotel
   * quote lines, else reanchor existing days to trip.startDate + (dayNumber − 1).
   */
  private async applyTemplateItineraryToTrip(
    organizationId: string,
    tripId: string,
    tripStartDate: Date | string | null,
    templateItinerary: ReturnType<typeof parseQuoteTemplateContent>['itinerary'],
    quoteItems: QuotationItem[],
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<{ seeded: boolean; reanchored: boolean; builtFromHotels: boolean }> {
    const templateDays = templateItineraryDays(templateItinerary);
    const itinerary = await db.itinerary.findFirst({
      where: { tripId, organizationId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const version = itinerary?.versions[0];
    if (!version) return { seeded: false, reanchored: false, builtFromHotels: false };

    const content =
      version.contentJson &&
      typeof version.contentJson === 'object' &&
      !Array.isArray(version.contentJson)
        ? { ...(version.contentJson as Record<string, unknown>) }
        : {};
    const existingDays = Array.isArray(content.days) ? content.days : [];
    const existingStory = content.story;

    if (!existingDays.length && templateDays.length) {
      const reminted = remintTemplateItineraryDays(templateDays);
      const { days } = reanchorItineraryDaysToTripStart(
        reminted as Array<Record<string, unknown> & { dayNumber?: number; date?: string | null }>,
        tripStartDate,
      );
      const nextContent: Record<string, unknown> = { ...content, days };
      if (
        templateItinerary?.story &&
        typeof templateItinerary.story === 'object' &&
        !existingStory
      ) {
        nextContent.story = templateItinerary.story;
      }
      await db.itineraryVersion.update({
        where: { id: version.id },
        data: {
          contentJson: nextContent as Prisma.InputJsonValue,
          versionLock: { increment: 1 },
        },
      });
      return { seeded: true, reanchored: false, builtFromHotels: false };
    }

    if (!existingDays.length) {
      const fromHotels = buildItineraryDaysFromHotelItems(quoteItems);
      if (fromHotels.length) {
        await db.itineraryVersion.update({
          where: { id: version.id },
          data: {
            contentJson: { ...content, days: fromHotels } as Prisma.InputJsonValue,
            versionLock: { increment: 1 },
          },
        });
        return { seeded: false, reanchored: false, builtFromHotels: true };
      }
    }

    const reanchored = await this.reanchorTripItineraryDays(
      organizationId,
      tripId,
      tripStartDate,
      db,
    );
    return { seeded: false, reanchored, builtFromHotels: false };
  }

  /** Align trip story day dates to trip.startDate + (dayNumber − 1). */
  private async reanchorTripItineraryDays(
    organizationId: string,
    tripId: string,
    tripStartDate: Date | string | null,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    if (!tripStartDate) return false;
    const itinerary = await db.itinerary.findFirst({
      where: { tripId, organizationId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const version = itinerary?.versions[0];
    if (!version) return false;
    const content =
      version.contentJson &&
      typeof version.contentJson === 'object' &&
      !Array.isArray(version.contentJson)
        ? { ...(version.contentJson as Record<string, unknown>) }
        : {};
    const rawDays = Array.isArray(content.days) ? content.days : [];
    if (!rawDays.length) return false;
    const { days, changed } = reanchorItineraryDaysToTripStart(
      rawDays as Array<Record<string, unknown> & { dayNumber?: number; date?: string | null }>,
      tripStartDate,
    );
    if (!changed) return false;
    await db.itineraryVersion.update({
      where: { id: version.id },
      data: {
        contentJson: { ...content, days } as Prisma.InputJsonValue,
        versionLock: { increment: 1 },
      },
    });
    return true;
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
    const { validUntil, termsWithValidity } = await this.freshQuoteValidity(
      user.organizationId,
    );

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
            validUntil,
            itemsJson: items as unknown as Prisma.InputJsonValue,
            inclusions: checklistToText(content.inclusions),
            exclusions: checklistToText(content.exclusions),
            terms: termsWithValidity(content.terms ?? version.terms),
            exchangeRatesJson: (parseQuoteFxLock(version.exchangeRatesJson) != null
              ? version.exchangeRatesJson
              : quoteFxLockToJson(
                  sameCurrencyLock(
                    normalizeCurrency(content.currency || version.currency),
                  ),
                )) as Prisma.InputJsonValue,
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
    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { currency: true },
    });
    const orgCurrency = normalizeCurrency(org?.currency || 'INR');
    const currency = normalizeCurrency(input.currency || orgCurrency);
    const priorLock = parseQuoteFxLock(latest?.exchangeRatesJson);
    const exchangeRatesJson = fxLockCoversQuote(priorLock, currency, orgCurrency)
      ? quoteFxLockToJson(priorLock!) as Prisma.InputJsonValue
      : currency === orgCurrency
        ? quoteFxLockToJson(sameCurrencyLock(currency)) as Prisma.InputJsonValue
        : undefined;

    const version = await this.prisma.quotationVersion.create({
      data: {
        quotationId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        label: input.label ?? `v${(latest?.versionNumber ?? 0) + 1}`,
        status: 'draft',
        currency,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        itemsJson: input.items as unknown as Prisma.InputJsonValue,
        inclusions: input.inclusions ?? null,
        exclusions: input.exclusions ?? null,
        terms: input.terms ?? null,
        ...(exchangeRatesJson
          ? { exchangeRatesJson: exchangeRatesJson as Prisma.InputJsonValue }
          : { exchangeRatesJson: Prisma.DbNull }),
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
      // Margin / inventory-risk / rate-drift acks may only be created via gated endpoints.
      const items = this.preserveExistingRateDriftAcks(
        this.preserveExistingInventoryRiskAcks(
          this.preserveExistingMarginOverrides(
            input.items as QuotationItem[],
            target.itemsJson,
          ),
          target.itemsJson,
        ),
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
          ...(input.label !== undefined ? { label: input.label } : {}),
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

  /**
   * Autosave must not invent allotment/capacity/min-stay risk acks — only
   * {@link recordInventoryRiskAcks} may. Clearing an ack is allowed.
   */
  private preserveExistingInventoryRiskAcks(
    incoming: QuotationItem[],
    existingJson: unknown,
  ): QuotationItem[] {
    const existing = Array.isArray(existingJson)
      ? (existingJson as QuotationItem[])
      : [];
    const byId = new Map(existing.map((row) => [row.id, row]));
    return incoming.map((item) => {
      const prev = byId.get(item.id);
      const prevProv = prev?.rateProvenance;
      const nextProv = item.rateProvenance;
      if (!nextProv && !prevProv) return item;

      const nextAllotmentAck = nextProv?.allotmentRiskAckForNote?.trim() || '';
      const nextAllotmentReason = nextProv?.allotmentRiskAckReason?.trim() || '';
      const prevAllotmentAck = prevProv?.allotmentRiskAckForNote?.trim() || '';
      const prevAllotmentReason = prevProv?.allotmentRiskAckReason?.trim() || '';

      const nextCapacityAck = nextProv?.capacityRiskAckForNote?.trim() || '';
      const nextCapacityReason = nextProv?.capacityRiskAckReason?.trim() || '';
      const prevCapacityAck = prevProv?.capacityRiskAckForNote?.trim() || '';
      const prevCapacityReason = prevProv?.capacityRiskAckReason?.trim() || '';

      const nextMinStayAck = nextProv?.minStayRiskAckForNote?.trim() || '';
      const nextMinStayReason = nextProv?.minStayRiskAckReason?.trim() || '';
      const prevMinStayAck = prevProv?.minStayRiskAckForNote?.trim() || '';
      const prevMinStayReason = prevProv?.minStayRiskAckReason?.trim() || '';

      let rateProvenance = nextProv ? { ...nextProv } : undefined;

      const allotmentCleared = !nextAllotmentAck || !nextAllotmentReason;
      const allotmentSame =
        nextAllotmentAck === prevAllotmentAck &&
        nextAllotmentReason === prevAllotmentReason;
      if (rateProvenance) {
        if (allotmentCleared) {
          delete rateProvenance.allotmentRiskAckForNote;
          delete rateProvenance.allotmentRiskAckReason;
        } else if (!allotmentSame) {
          if (prevAllotmentAck && prevAllotmentReason) {
            rateProvenance.allotmentRiskAckForNote = prevProv!.allotmentRiskAckForNote;
            rateProvenance.allotmentRiskAckReason = prevProv!.allotmentRiskAckReason;
          } else {
            delete rateProvenance.allotmentRiskAckForNote;
            delete rateProvenance.allotmentRiskAckReason;
          }
        }
      }

      const capacityCleared = !nextCapacityAck || !nextCapacityReason;
      const capacitySame =
        nextCapacityAck === prevCapacityAck &&
        nextCapacityReason === prevCapacityReason;
      if (rateProvenance) {
        if (capacityCleared) {
          delete rateProvenance.capacityRiskAckForNote;
          delete rateProvenance.capacityRiskAckReason;
        } else if (!capacitySame) {
          if (prevCapacityAck && prevCapacityReason) {
            rateProvenance.capacityRiskAckForNote = prevProv!.capacityRiskAckForNote;
            rateProvenance.capacityRiskAckReason = prevProv!.capacityRiskAckReason;
          } else {
            delete rateProvenance.capacityRiskAckForNote;
            delete rateProvenance.capacityRiskAckReason;
          }
        }
      }

      const minStayCleared = !nextMinStayAck || !nextMinStayReason;
      const minStaySame =
        nextMinStayAck === prevMinStayAck &&
        nextMinStayReason === prevMinStayReason;
      if (rateProvenance) {
        if (minStayCleared) {
          delete rateProvenance.minStayRiskAckForNote;
          delete rateProvenance.minStayRiskAckReason;
        } else if (!minStaySame) {
          if (prevMinStayAck && prevMinStayReason) {
            rateProvenance.minStayRiskAckForNote = prevProv!.minStayRiskAckForNote;
            rateProvenance.minStayRiskAckReason = prevProv!.minStayRiskAckReason;
          } else {
            delete rateProvenance.minStayRiskAckForNote;
            delete rateProvenance.minStayRiskAckReason;
          }
        }
      }

      return { ...item, rateProvenance };
    });
  }

  /** Permission-gated, audited allotment / capacity / min-stay send-anyway on selected lines. */
  async recordInventoryRiskAcks(
    user: AuthUser,
    versionId: string,
    input: RecordQuoteInventoryRiskAcksInput,
  ) {
    if (!hasPermission(user.permissions, 'inventory_risk.approve')) {
      throw new ForbiddenException('Missing inventory_risk.approve');
    }
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: { quotation: true },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }
    if (!AUTOSAVEABLE.has(version.status)) {
      throw new BadRequestException(
        'Only draft quotations can record inventory risk acknowledgements',
      );
    }
    const items = Array.isArray(version.itemsJson)
      ? ([...(version.itemsJson as QuotationItem[])] as QuotationItem[])
      : [];
    const selected = new Set(input.lineIds);
    const reason = input.reason.trim();
    const applied: Array<{
      id: string;
      description: string;
      kind: 'allotment' | 'capacity' | 'min_stay';
      note: string;
    }> = [];

    const nextItems = items.map((item) => {
      if (!selected.has(item.id)) return item;
      const prov = item.rateProvenance ? { ...item.rateProvenance } : undefined;
      if (!prov) {
        throw new BadRequestException(
          `Line “${item.description}” has no rate provenance to acknowledge`,
        );
      }
      let touched = false;
      if (
        lineNeedsAllotmentRiskAck({
          allotmentWarn: prov.allotmentWarn,
          allotmentNote: prov.allotmentNote,
          allotmentRiskAckForNote: prov.allotmentRiskAckForNote,
          allotmentRiskAckReason: prov.allotmentRiskAckReason,
        })
      ) {
        const note = prov.allotmentNote?.trim() || '';
        if (!note) {
          throw new BadRequestException(
            `Line “${item.description}” is missing an allotment shortfall note`,
          );
        }
        prov.allotmentNote = note;
        prov.allotmentWarn = true;
        prov.allotmentRiskAckForNote = note;
        prov.allotmentRiskAckReason = reason;
        applied.push({
          id: item.id,
          description: item.description,
          kind: 'allotment',
          note,
        });
        touched = true;
      }
      if (
        lineNeedsCapacityRiskAck({
          capacityWarn: prov.capacityWarn,
          capacityNote: prov.capacityNote,
          capacityRiskAckForNote: prov.capacityRiskAckForNote,
          capacityRiskAckReason: prov.capacityRiskAckReason,
        })
      ) {
        const note = prov.capacityNote?.trim() || '';
        if (!note) {
          throw new BadRequestException(
            `Line “${item.description}” is missing a capacity shortfall note`,
          );
        }
        prov.capacityNote = note;
        prov.capacityWarn = true;
        prov.capacityRiskAckForNote = note;
        prov.capacityRiskAckReason = reason;
        applied.push({
          id: item.id,
          description: item.description,
          kind: 'capacity',
          note,
        });
        touched = true;
      }
      if (
        lineNeedsMinStayRiskAck({
          minStayWarn: prov.minStayWarn,
          minStayNote: prov.minStayNote || prov.calculation?.minStayNote,
          minStayRiskAckForNote: prov.minStayRiskAckForNote,
          minStayRiskAckReason: prov.minStayRiskAckReason,
          minStayShort: prov.calculation?.minStayShort,
        })
      ) {
        const note =
          prov.minStayNote?.trim() ||
          prov.calculation?.minStayNote?.trim() ||
          '';
        if (!note) {
          throw new BadRequestException(
            `Line “${item.description}” is missing a min-stay shortfall note`,
          );
        }
        prov.minStayNote = note;
        prov.minStayWarn = true;
        prov.minStayRiskAckForNote = note;
        prov.minStayRiskAckReason = reason;
        applied.push({
          id: item.id,
          description: item.description,
          kind: 'min_stay',
          note,
        });
        touched = true;
      }
      if (!touched) {
        throw new BadRequestException(
          `Line “${item.description}” does not need an inventory risk acknowledgement`,
        );
      }
      return { ...item, rateProvenance: prov };
    });

    if (!applied.length) {
      throw new BadRequestException(
        'Select at least one service with an allotment, capacity, or min-stay shortfall',
      );
    }
    const missing = input.lineIds.filter((id) => !items.some((i) => i.id === id));
    if (missing.length) {
      throw new BadRequestException(
        'One or more selected services were not found on this quotation',
      );
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
      action: 'quote.inventory_risk_ack',
      entityType: 'quotation_version',
      entityId: versionId,
      metadata: {
        reason,
        approvedByUserId: user.sub,
        at: new Date().toISOString(),
        lines: applied,
      },
    });

    return this.presentVersion(user, updated);
  }

  /**
   * Autosave must not invent rate-drift Keep-buy acks — only
   * {@link recordRateDriftAcks} may. Clearing an ack is allowed.
   */
  private preserveExistingRateDriftAcks(
    incoming: QuotationItem[],
    existingJson: unknown,
  ): QuotationItem[] {
    const existing = Array.isArray(existingJson)
      ? (existingJson as QuotationItem[])
      : [];
    const byId = new Map(existing.map((row) => [row.id, row]));
    return incoming.map((item) => {
      const prev = byId.get(item.id);
      const prevProv = prev?.rateProvenance;
      const nextProv = item.rateProvenance;
      if (!nextProv && !prevProv) return item;

      const nextAck = nextProv?.rateDriftAckForUpdatedAt?.trim() || '';
      const nextReason = nextProv?.rateDriftAckReason?.trim() || '';
      const prevAck = prevProv?.rateDriftAckForUpdatedAt?.trim() || '';
      const prevReason = prevProv?.rateDriftAckReason?.trim() || '';

      const rateProvenance = nextProv ? { ...nextProv } : undefined;
      if (!rateProvenance) return { ...item, rateProvenance };

      const cleared = !nextAck || !nextReason;
      const same = nextAck === prevAck && nextReason === prevReason;
      if (cleared) {
        delete rateProvenance.rateDriftAckForUpdatedAt;
        delete rateProvenance.rateDriftAckReason;
      } else if (!same) {
        if (prevAck && prevReason) {
          rateProvenance.rateDriftAckForUpdatedAt =
            prevProv!.rateDriftAckForUpdatedAt;
          rateProvenance.rateDriftAckReason = prevProv!.rateDriftAckReason;
        } else {
          delete rateProvenance.rateDriftAckForUpdatedAt;
          delete rateProvenance.rateDriftAckReason;
        }
      }

      return { ...item, rateProvenance };
    });
  }

  /** Permission-gated, audited Keep-buy when chart drifted since match. */
  async recordRateDriftAcks(
    user: AuthUser,
    versionId: string,
    input: RecordQuoteRateDriftAcksInput,
  ) {
    if (!hasPermission(user.permissions, 'rate_drift.approve')) {
      throw new ForbiddenException('Missing rate_drift.approve');
    }
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: { quotation: true },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }
    if (!AUTOSAVEABLE.has(version.status)) {
      throw new BadRequestException(
        'Only draft quotations can record rate-drift acknowledgements',
      );
    }
    const items = Array.isArray(version.itemsJson)
      ? ([...(version.itemsJson as QuotationItem[])] as QuotationItem[])
      : [];
    const selected = new Set(input.lineIds);
    const reason = input.reason.trim();
    const selectedItems = items.filter((item) => selected.has(item.id));
    if (!selectedItems.length) {
      throw new BadRequestException(
        'Select at least one service with a rate-chart change',
      );
    }
    const missing = input.lineIds.filter((id) => !items.some((i) => i.id === id));
    if (missing.length) {
      throw new BadRequestException(
        'One or more selected services were not found on this quotation',
      );
    }

    const updatedAtById = await this.loadRateChartUpdatedAtById(
      user.organizationId,
      selectedItems,
    );

    const applied: Array<{
      id: string;
      description: string;
      rateId: string;
      chartUpdatedAt: string;
    }> = [];

    const nextItems = items.map((item) => {
      if (!selected.has(item.id)) return item;
      const rateId =
        item.rateProvenance?.rateId?.trim() || item.rateId?.trim() || '';
      if (!rateId) {
        throw new BadRequestException(
          `Line “${item.description}” has no matched rate to acknowledge`,
        );
      }
      const currentUpdatedAt = updatedAtById.get(rateId);
      if (!currentUpdatedAt) {
        throw new BadRequestException(
          `Line “${item.description}” rate chart could not be loaded`,
        );
      }
      const prov = item.rateProvenance ? { ...item.rateProvenance } : {};
      if (
        !lineNeedsRateDriftAck({
          matchedAt: prov.matchedAt,
          rateUpdatedAtAtMatch: prov.rateUpdatedAt,
          currentUpdatedAt,
          ackForUpdatedAt: prov.rateDriftAckForUpdatedAt,
          ackReason: prov.rateDriftAckReason,
        })
      ) {
        throw new BadRequestException(
          `Line “${item.description}” does not need a rate-drift acknowledgement`,
        );
      }
      prov.rateDriftAckForUpdatedAt = currentUpdatedAt;
      prov.rateDriftAckReason = reason;
      applied.push({
        id: item.id,
        description: item.description,
        rateId,
        chartUpdatedAt: currentUpdatedAt,
      });
      return { ...item, rateProvenance: prov };
    });

    if (!applied.length) {
      throw new BadRequestException(
        'Select at least one service with a rate-chart change',
      );
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
      action: 'quote.rate_drift_ack',
      entityType: 'quotation_version',
      entityId: versionId,
      metadata: {
        reason,
        approvedByUserId: user.sub,
        at: new Date().toISOString(),
        lines: applied,
      },
    });

    return this.presentVersion(user, updated);
  }

  /** Live chart `updatedAt` keyed by rate id (hotel / transfer / activity). */
  private async loadRateChartUpdatedAtById(
    organizationId: string,
    items: Array<{
      rateId?: string | null;
      rateKind?: string | null;
      rateProvenance?: {
        rateId?: string;
        rateKind?: string;
      } | null;
    }>,
  ): Promise<Map<string, string>> {
    const candidates = items
      .map((item) => {
        const rateId =
          item.rateProvenance?.rateId?.trim() || item.rateId?.trim() || '';
        const rateKind =
          item.rateProvenance?.rateKind || item.rateKind || null;
        if (!rateId) return null;
        return { rateId, rateKind };
      })
      .filter(Boolean) as Array<{ rateId: string; rateKind: string | null }>;

    const updatedAtById = new Map<string, string>();
    if (!candidates.length) return updatedAtById;

    const hotelIds = [
      ...new Set(
        candidates
          .filter((c) => !c.rateKind || c.rateKind === 'hotel')
          .map((c) => c.rateId),
      ),
    ];
    const transferIds = [
      ...new Set(
        candidates
          .filter((c) => !c.rateKind || c.rateKind === 'transfer')
          .map((c) => c.rateId),
      ),
    ];
    const activityIds = [
      ...new Set(
        candidates
          .filter((c) => !c.rateKind || c.rateKind === 'activity')
          .map((c) => c.rateId),
      ),
    ];

    const [hotels, transfers, activities] = await Promise.all([
      hotelIds.length
        ? this.prisma.supplierHotelRate.findMany({
            where: { organizationId, id: { in: hotelIds } },
            select: { id: true, updatedAt: true },
          })
        : Promise.resolve([]),
      transferIds.length
        ? this.prisma.transferFare.findMany({
            where: {
              id: { in: transferIds },
              OR: [{ organizationId }, { organizationId: null }],
            },
            select: { id: true, updatedAt: true },
          })
        : Promise.resolve([]),
      activityIds.length
        ? this.prisma.supplierActivityRate.findMany({
            where: { organizationId, id: { in: activityIds } },
            select: { id: true, updatedAt: true },
          })
        : Promise.resolve([]),
    ]);

    for (const row of [...hotels, ...transfers, ...activities]) {
      updatedAtById.set(row.id, row.updatedAt.toISOString());
    }
    return updatedAtById;
  }

  presentVersion(user: AuthUser, version: {
    id: string;
    costTotal: Prisma.Decimal | number;
    marginAmount: Prisma.Decimal | number;
    marginPercent: Prisma.Decimal | number;
    itemsJson: Prisma.JsonValue;
    currency?: string;
    exchangeRatesJson?: unknown;
    [key: string]: unknown;
  }) {
    const fx = parseQuoteFxLock(version.exchangeRatesJson);
    const ability = buildAbility(user.permissions);
    if (ability.can('quote.view_cost')) {
      return { ...version, fx };
    }
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
    return { ...redacted, itemsJson: items, costHidden: true, fx };
  }

  /** Lock FX for a draft version and optionally convert INR line amounts. */
  async lockFx(user: AuthUser, versionId: string, input: LockQuoteFxInput) {
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: { quotation: true },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }
    if (!AUTOSAVEABLE.has(version.status)) {
      throw new BadRequestException('Only draft quotes can lock FX');
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: { currency: true, settingsJson: true },
    });
    const baseCurrency = normalizeCurrency(org?.currency || 'INR');
    const quoteCurrency = normalizeCurrency(input.quoteCurrency);
    const orgFxRates = parseOrgFxRates(org?.settingsJson);
    let lock;
    try {
      lock = buildQuoteFxLock({
        baseCurrency,
        quoteCurrency,
        rate: input.rate,
        orgFxRates,
        source: input.rate != null ? 'manual' : 'org_default',
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Could not build FX lock',
      );
    }

    let itemsJson = version.itemsJson;
    let convertCount = 0;
    if (input.convertLines !== false && Array.isArray(version.itemsJson)) {
      const prevCurrency = normalizeCurrency(version.currency);
      const items = (version.itemsJson as Array<Record<string, unknown>>).map(
        (item) => {
          const next = { ...item };
          let lineConverted = false;
          for (const key of ['unitCost', 'unitSell'] as const) {
            const raw = next[key];
            const n = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isFinite(n)) continue;
            const converted = convertBuyToQuoteCurrency(
              n,
              prevCurrency,
              lock,
              quoteCurrency,
              orgFxRates,
            );
            if (converted.error) continue;
            if (converted.fx) {
              next[key] = converted.unitCost;
              lineConverted = true;
              convertCount += 1;
            }
          }
          if (
            lineConverted &&
            next.rateProvenance &&
            typeof next.rateProvenance === 'object'
          ) {
            next.rateProvenance = {
              ...(next.rateProvenance as Record<string, unknown>),
              fx: {
                from: prevCurrency,
                to: quoteCurrency,
                rate: lock.rate,
                source: lock.source,
              },
            };
          }
          return next;
        },
      );
      itemsJson = items as unknown as Prisma.JsonValue;
    }

    const items = Array.isArray(itemsJson)
      ? (itemsJson as QuotationItem[])
      : [];
    const totals = calcQuoteTotals(items, Number(version.discountTotal) || 0);

    const updated = await this.prisma.quotationVersion.update({
      where: { id: versionId },
      data: {
        currency: quoteCurrency,
        exchangeRatesJson: quoteFxLockToJson(lock) as Prisma.InputJsonValue,
        itemsJson: itemsJson as Prisma.InputJsonValue,
        ...totals,
        versionLock: { increment: 1 },
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.fx_lock',
      entityType: 'quotation_version',
      entityId: versionId,
      metadata: {
        quoteCurrency,
        rate: lock.rate,
        source: lock.source,
        convertCount,
      },
    });

    return {
      ...this.presentVersion(user, updated),
      convertCount,
    };
  }

  async transition(
    user: AuthUser,
    versionId: string,
    action: 'request_approval' | 'approve' | 'send' | 'accept' | 'reject' | 'expire',
    opts?: { extendValidity?: boolean },
  ) {
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

    if (action === 'send' || action === 'request_approval' || action === 'approve') {
      const ready = await this.assertQuoteReadyForCustomer(user, version, {
        extendValidity: opts?.extendValidity === true,
      });
      if (action === 'approve') {
        const updated = await this.prisma.quotationVersion.update({
          where: { id: versionId },
          data: { status: 'approved' },
        });
        const trip = await this.prisma.trip.findFirst({
          where: { id: version.quotation.tripId },
        });
        if (trip && trip.status !== 'confirmed') {
          await this.prisma.trip.update({
            where: { id: trip.id },
            data: { status: 'quoted' },
          });
        }
        await this.audit.record({
          organizationId: user.organizationId,
          actorUserId: user.sub,
          action: 'quote.approve',
          entityType: 'quotation_version',
          entityId: versionId,
        });
        return {
          ...this.presentVersion(user, updated),
          validityExtendedTo: ready.validityExtendedTo,
          validityGraceUsed: ready.validityGraceUsed,
        };
      }

      let taxIdentityStamp: Prisma.InputJsonValue | undefined;
      if (action === 'send' && !parseQuoteTaxIdentity(version.taxIdentityJson)) {
        const org = await this.prisma.organization.findFirst({
          where: { id: user.organizationId },
          select: { taxLabel: true, settingsJson: true },
        });
        const tripForTax = await this.prisma.trip.findFirst({
          where: { id: version.quotation.tripId },
          select: {
            destinationPlaceOfSupply: true,
            destinationsJson: true,
          },
        });
        if (org && tripForTax) {
          const live = await this.resolveLiveTaxIdentity({
            organizationId: user.organizationId,
            taxLabel: org.taxLabel,
            settingsJson: org.settingsJson,
            trip: tripForTax,
          });
          taxIdentityStamp = quoteTaxIdentityToJson(
            live,
            'send',
          ) as Prisma.InputJsonValue;
        }
      }

      const updated = await this.prisma.quotationVersion.update({
        where: { id: versionId },
        data: {
          status: map[action],
          ...(taxIdentityStamp ? { taxIdentityJson: taxIdentityStamp } : {}),
        },
      });

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

      return {
        ...this.presentVersion(user, updated),
        validityExtendedTo: ready.validityExtendedTo,
        validityGraceUsed: ready.validityGraceUsed,
      };
    }

    if (action === 'accept') {
      const result = await this.finalizeAccept(
        user.organizationId,
        version,
        user.sub,
        user,
      );
      return {
        ...this.presentVersion(user, result.version),
        leadOutcome: result.leadOutcome,
        hotelBookings: result.hotelBookings,
        materializeFailures: result.materializeFailures,
      };
    }

    const updated = await this.prisma.quotationVersion.update({
      where: { id: versionId },
      data: {
        status: map[action],
      },
    });

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
    opts?: { quotationVersionId?: string | null },
  ) {
    const actor = this.publicShareActor(organizationId, actorUserId);
    const boundId = opts?.quotationVersionId?.trim() || null;

    if (boundId) {
      const bound = await this.prisma.quotationVersion.findFirst({
        where: {
          id: boundId,
          quotation: { tripId, organizationId },
        },
        include: {
          quotation: { select: { quoteNumber: true, tripId: true, organizationId: true } },
        },
      });
      if (!bound) {
        throw new BadRequestException('The shared quotation is no longer available');
      }
      if (bound.status === 'accepted') {
        return {
          alreadyAccepted: true as const,
          quotation: presentCustomerQuote(bound),
        };
      }
      if (bound.status !== 'sent' && bound.status !== 'approved') {
        throw new BadRequestException('No approved or sent quotation is available to accept');
      }
      const result = await this.finalizeAccept(organizationId, bound, actorUserId, actor);
      return {
        alreadyAccepted: false as const,
        quotation: presentCustomerQuote({
          ...result.version,
          quotation: { quoteNumber: bound.quotation.quoteNumber },
        }),
        leadOutcome: result.leadOutcome,
        hotelBookings: result.hotelBookings,
        materializeFailures: result.materializeFailures,
      };
    }

    for (const status of ['sent', 'approved'] as const) {
      const version = await this.prisma.quotationVersion.findFirst({
        where: {
          status,
          quotation: { tripId, organizationId },
        },
        include: {
          quotation: { select: { quoteNumber: true, tripId: true, organizationId: true } },
        },
        orderBy: [{ versionNumber: 'desc' }, { updatedAt: 'desc' }],
      });
      if (version) {
        const result = await this.finalizeAccept(
          organizationId,
          version,
          actorUserId,
          actor,
        );
        return {
          alreadyAccepted: false as const,
          quotation: presentCustomerQuote({
            ...result.version,
            quotation: { quoteNumber: version.quotation.quoteNumber },
          }),
          leadOutcome: result.leadOutcome,
          hotelBookings: result.hotelBookings,
          materializeFailures: result.materializeFailures,
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
      itemsJson?: unknown;
      validUntil?: Date | null;
      terms?: string | null;
      quotation: { tripId: string; organizationId?: string; quoteNumber?: string };
    },
    actorUserId: string | null,
    leadUser: AuthUser,
  ) {
    if (version.status === 'accepted') {
      const current = await this.prisma.quotationVersion.findUniqueOrThrow({
        where: { id: version.id },
      });
      return {
        version: current,
        leadOutcome: { markedWon: false, skippedReason: 'already_accepted' },
        hotelBookings: null,
        transferBookings: null,
        activityBookings: null,
        materializeFailures: [] as string[],
      };
    }
    if (!ALLOWED_TRANSITIONS.accept.has(version.status)) {
      throw new BadRequestException(
        `Cannot accept from status “${version.status.replace(/_/g, ' ')}”`,
      );
    }

    const full =
      version.itemsJson !== undefined && version.validUntil !== undefined
        ? version
        : await this.prisma.quotationVersion.findFirstOrThrow({
            where: { id: version.id },
            include: {
              quotation: {
                select: { tripId: true, organizationId: true, quoteNumber: true },
              },
            },
          });

    await this.assertQuoteReadyForAccept(leadUser, {
      id: full.id,
      itemsJson: full.itemsJson,
      validUntil: full.validUntil ?? null,
      terms: full.terms ?? null,
      quotation: {
        tripId: full.quotation.tripId,
        organizationId: full.quotation.organizationId ?? organizationId,
      },
    });

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

    const cas = await this.prisma.quotationVersion.updateMany({
      where: {
        id: version.id,
        status: { in: ['sent', 'approved'] },
      },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
      },
    });
    if (cas.count === 0) {
      const current = await this.prisma.quotationVersion.findUniqueOrThrow({
        where: { id: version.id },
      });
      if (current.status === 'accepted') {
        return {
          version: current,
          leadOutcome: { markedWon: false, skippedReason: 'already_accepted' },
          hotelBookings: null,
          transferBookings: null,
          activityBookings: null,
          materializeFailures: [] as string[],
        };
      }
      throw new ConflictException(
        `Cannot accept from status “${current.status.replace(/_/g, ' ')}”`,
      );
    }

    const updated = await this.prisma.quotationVersion.findUniqueOrThrow({
      where: { id: version.id },
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

    let hotelBookings: {
      created: number;
      skipped: number;
      bookingIds: string[];
      warnings?: string[];
    } | null = null;
    let transferBookings: {
      created: number;
      skipped: number;
      bookingIds: string[];
    } | null = null;
    let activityBookings: {
      created: number;
      skipped: number;
      bookingIds: string[];
    } | null = null;
    const materializeFailures: string[] = [];
    try {
      hotelBookings = await this.operations.materializeHotelBookingsFromAcceptedQuote(
        organizationId,
        actorUserId,
        version.quotation.tripId,
        { versionId: updated.id },
      );
      for (const w of hotelBookings.warnings || []) {
        materializeFailures.push(`hotel: ${w}`);
      }
    } catch (e) {
      materializeFailures.push(
        `hotel: ${e instanceof Error ? e.message : 'materialize failed'}`,
      );
    }
    try {
      transferBookings =
        await this.operations.materializeTransferBookingsFromAcceptedQuote(
          organizationId,
          actorUserId,
          version.quotation.tripId,
          { versionId: updated.id },
        );
    } catch (e) {
      materializeFailures.push(
        `transfer: ${e instanceof Error ? e.message : 'materialize failed'}`,
      );
    }
    try {
      activityBookings =
        await this.operations.materializeActivityBookingsFromAcceptedQuote(
          organizationId,
          actorUserId,
          version.quotation.tripId,
          { versionId: updated.id },
        );
    } catch (e) {
      materializeFailures.push(
        `activity: ${e instanceof Error ? e.message : 'materialize failed'}`,
      );
    }

    if (materializeFailures.length) {
      try {
        await this.audit.record({
          organizationId,
          actorUserId,
          action: 'quote.accept_materialize_partial',
          entityType: 'quotation_version',
          entityId: version.id,
          metadata: {
            tripId: version.quotation.tripId,
            failures: materializeFailures,
          },
        });
        const ownerId = tripBefore?.ownerId;
        if (ownerId) {
          const flags = await this.notifications.orgNotifyFlags(organizationId);
          await this.notifications.notify({
            organizationId,
            userId: ownerId,
            title: 'Bookings need attention',
            body: `Quote accepted but ${materializeFailures.length} booking step(s) failed for ${tripBefore?.tripNumber || 'trip'}`,
            linkPath: `/trips/${version.quotation.tripId}`,
            channel: flags.notifyOnQuoteAccept ? 'both' : 'in_app',
          });
        }
      } catch {
        /* non-blocking */
      }
    }

    return {
      version: updated,
      leadOutcome,
      hotelBookings,
      transferBookings,
      activityBookings,
      materializeFailures,
    };
  }

  /** Live tax identity: trip override ?? destination infer ?? org (display only). */
  private async resolveLiveTaxIdentity(opts: {
    organizationId: string;
    taxLabel: string | null | undefined;
    settingsJson: unknown;
    trip: {
      destinationPlaceOfSupply?: string | null;
      destinationsJson?: unknown;
    };
  }): Promise<OrgTaxIdentity> {
    const labels = await placeAncestorLabelsForRefs(
      this.prisma,
      opts.organizationId,
      opts.trip.destinationsJson,
    );
    const inferred = inferDestinationPlaceOfSupplyFromLabels(labels);
    return parseOrgTaxIdentity(opts.taxLabel, opts.settingsJson, {
      destinationPlaceOfSupply: opts.trip.destinationPlaceOfSupply,
      inferredDestinationPlaceOfSupply: inferred,
    });
  }

  /**
   * Prefer write-once stamp on the version; otherwise live resolve.
   * When `stamp` is set and no stamp exists, persist write-once.
   */
  private async resolveVersionTaxIdentity(opts: {
    organizationId: string;
    versionId: string;
    taxIdentityJson: unknown;
    taxLabel: string | null | undefined;
    settingsJson: unknown;
    trip: {
      destinationPlaceOfSupply?: string | null;
      destinationsJson?: unknown;
    };
    stamp?: 'send' | 'pdf';
  }): Promise<OrgTaxIdentity> {
    const stamped = parseQuoteTaxIdentity(opts.taxIdentityJson);
    if (stamped) {
      const { lockedAt: _l, lockSource: _s, ...identity } = stamped;
      void _l;
      void _s;
      return identity;
    }
    const live = await this.resolveLiveTaxIdentity({
      organizationId: opts.organizationId,
      taxLabel: opts.taxLabel,
      settingsJson: opts.settingsJson,
      trip: opts.trip,
    });
    if (opts.stamp) {
      const payload = quoteTaxIdentityToJson(live, opts.stamp);
      await this.prisma.quotationVersion.update({
        where: { id: opts.versionId },
        data: { taxIdentityJson: payload as Prisma.InputJsonValue },
      });
    }
    return live;
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
    const trip = version.quotation.trip;
    const taxIdentity = await this.resolveVersionTaxIdentity({
      organizationId: user.organizationId,
      versionId,
      taxIdentityJson: version.taxIdentityJson,
      taxLabel: org.taxLabel,
      settingsJson: org.settingsJson,
      trip,
      stamp: 'pdf',
    });
    const taxTotalsLabel = orgTaxTotalsLabel(taxIdentity);
    const taxIdentityHtml = formatOrgTaxIdentityLines(taxIdentity)
      .map((line) => `<p class="meta">${escapeHtml(line)}</p>`)
      .join('');
    const primaryColor = escapeHtml(branding.primaryColor);
    const companyName = branding.companyName;
    const footer = branding.previewFooter || `${companyName} · Proposal`;

    const quote = presentCustomerQuote({
      ...version,
      quotation: { quoteNumber: version.quotation.quoteNumber },
    });
    const taxSplitHtml = quote.taxTotal
      ? [
          ...formatOrgTaxDisplaySplitLines(taxIdentity, quote.taxTotal, {
            formatAmount: (n) => formatCurrency(n, quote.currency),
          }).map(
            (line) =>
              `<p class="meta" style="margin:0">${escapeHtml(line)}</p>`,
          ),
          (() => {
            const cue = orgTaxDisplaySplitCue(taxIdentity, quote.taxTotal);
            return cue
              ? `<p class="meta" style="margin:0;font-size:11px">${escapeHtml(cue)}</p>`
              : '';
          })(),
        ]
          .filter(Boolean)
          .join('')
      : '';
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
        ${quote.taxTotal ? `<p class="meta">${escapeHtml(taxTotalsLabel)}: ${formatCurrency(quote.taxTotal, quote.currency)}</p>${taxSplitHtml}` : ''}
        <p class="total">Total: ${formatCurrency(quote.sellTotal, quote.currency)}</p>
        ${taxIdentityHtml}
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
      taxIdentity,
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

  async sendEmail(
    user: AuthUser,
    versionId: string,
    input: { toEmail: string; extendValidity?: boolean },
  ) {
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: { quotation: true },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }
    // Extend before PDF so the attachment shows the refreshed validity.
    const ready = await this.assertQuoteReadyForCustomer(user, version, {
      extendValidity: input.extendValidity === true,
    });
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

    // Status CAS before outbox so a failed transition cannot leave a queued email as draft.
    const sent = await this.transition(user, versionId, 'send', {
      extendValidity: input.extendValidity === true,
    });
    await this.ensureTripProposalShare(user, version.quotation.tripId, versionId);
    await this.outbox.enqueue({
      organizationId: user.organizationId,
      eventType: 'quote.email',
      payload: {
        quotationVersionId: versionId,
        toEmail: input.toEmail,
        documentId: pdf.documentId,
        storageKey: pdf.storageKey,
        fileName: pdf.fileName,
        mimeType: pdf.mimeType,
        subject,
        body,
      },
    });
    return {
      queued: true,
      ...pdf,
      validityExtendedTo:
        (sent as { validityExtendedTo?: string | null }).validityExtendedTo ??
        ready.validityExtendedTo,
      validityGraceUsed:
        (sent as { validityGraceUsed?: boolean }).validityGraceUsed ??
        ready.validityGraceUsed,
    };
  }

  /**
   * Staff confirms a manual WhatsApp send (wa.me fallback) — runs readiness + marks sent.
   */
  async markSent(
    user: AuthUser,
    versionId: string,
    input: MarkQuoteSentInput = { channel: 'whatsapp', extendValidity: false },
  ) {
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: { quotation: true },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }
    await this.ensureTripProposalShare(user, version.quotation.tripId, versionId);
    const sent = await this.transition(user, versionId, 'send', {
      extendValidity: input.extendValidity === true,
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.mark_sent_whatsapp',
      entityType: 'quotation_version',
      entityId: versionId,
      metadata: { channel: 'whatsapp', via: 'manual_wa_me' },
    });
    return sent;
  }

  async recordFitTiming(user: AuthUser, input: RecordQuoteFitTimingInput) {
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: input.quotationVersionId },
      include: { quotation: true },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }
    const openedAtMs = input.openedAtMs;
    const now = Date.now();
    if (openedAtMs > now + 60_000) {
      throw new BadRequestException('Invalid openedAtMs');
    }
    const minutes = Math.max(0, (now - openedAtMs) / 60_000);
    // Cap absurd clients (left tab open overnight)
    if (minutes > 24 * 60) {
      return { recorded: false as const, reason: 'stale' as const };
    }
    const existing = await this.prisma.auditEvent.findFirst({
      where: {
        organizationId: user.organizationId,
        action: 'quote.fit_build',
        entityId: version.id,
      },
      select: { id: true },
    });
    if (existing) {
      return { recorded: false as const, reason: 'already_recorded' as const, minutes };
    }
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.fit_build',
      entityType: 'quotation_version',
      entityId: version.id,
      metadata: {
        milestone: input.milestone ?? 'first_send',
        minutes,
        openedAtMs,
        tripId: version.quotation.tripId,
      },
    });
    return { recorded: true as const, minutes };
  }

  /**
   * Send proposal via WhatsApp Cloud.
   * Cold outreach requires an approved Meta template (org WhatsApp templates /
   * settings.integrations.whatsapp.quoteProposalTemplateId). Session text is
   * allowed only inside a 24h customer window. When Cloud is not configured,
   * returns a wa.me fallback URL without marking sent.
   */
  async sendWhatsapp(user: AuthUser, versionId: string, input: SendQuoteWhatsappInput) {
    const version = await this.prisma.quotationVersion.findFirst({
      where: { id: versionId },
      include: {
        quotation: {
          include: {
            trip: {
              include: {
                party: { select: { id: true, displayName: true, phone: true } },
              },
            },
          },
        },
      },
    });
    if (!version || version.quotation.organizationId !== user.organizationId) {
      throw new NotFoundException('Version not found');
    }

    const digits = normalizeQuoteWhatsappPhone(input.toPhone);
    if (!digits) throw new BadRequestException('Enter a valid WhatsApp mobile number');

    const share = await this.ensureTripProposalShare(
      user,
      version.quotation.tripId,
      versionId,
    );
    const webOrigin = loadEnv().webOrigin.replace(/\/$/, '');
    const proposalUrl = `${webOrigin}${share.path}`;
    const guestName = version.quotation.trip.party?.displayName?.trim() || 'there';

    const cfg = await this.whatsappCloudConfig(user.organizationId);
    const cloudReady = Boolean(cfg.enabled && cfg.accessToken && cfg.phoneNumberId);
    if (!cloudReady) {
      const pdf = await this.generatePdf(user, versionId);
      const quoteRef = pdf.versionLabel
        ? `${pdf.quoteNumber} (${pdf.versionLabel})`
        : pdf.quoteNumber;
      const defaultText = [
        `Hi ${guestName},`,
        ``,
        `Here is our travel proposal for ${pdf.tripTitle} (${quoteRef}):`,
        proposalUrl,
        ``,
        `Happy to adjust anything — just reply here.`,
      ].join('\n');
      const text = (input.message?.trim() || defaultText).slice(0, 3500);
      const waMeUrl = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
      return {
        sent: false,
        cloudConfigured: false,
        fallbackWaMeUrl: waMeUrl,
        proposalUrl,
        toPhone: digits,
        quoteNumber: pdf.quoteNumber,
        tripTitle: pdf.tripTitle,
        requiresMarkSent: true,
        message:
          'WhatsApp Cloud API is not configured — open WhatsApp to send manually, then mark as sent.',
      };
    }

    // Extend before PDF so the proposal reflects refreshed validity.
    const ready = await this.assertQuoteReadyForCustomer(user, version, {
      extendValidity: input.extendValidity === true,
    });
    const pdf = await this.generatePdf(user, versionId);
    const quoteRef = pdf.versionLabel
      ? `${pdf.quoteNumber} (${pdf.versionLabel})`
      : pdf.quoteNumber;
    const defaultText = [
      `Hi ${guestName},`,
      ``,
      `Here is our travel proposal for ${pdf.tripTitle} (${quoteRef}):`,
      proposalUrl,
      ``,
      `Happy to adjust anything — just reply here.`,
    ].join('\n');
    const text = (input.message?.trim() || defaultText).slice(0, 3500);

    const demo = cfg.accessToken.startsWith('seed-demo-');
    const partyId = version.quotation.trip.party?.id ?? null;
    const inSession = await this.hasWhatsappCustomerSession(
      user.organizationId,
      partyId,
      digits,
    );
    let providerMessageId: string | undefined;
    let sendMode: 'demo' | 'session' | 'template' = 'demo';

    if (!demo) {
      if (inSession) {
        const result = await this.messaging.sendText({
          to: digits,
          text,
          phoneNumberId: cfg.phoneNumberId,
          accessToken: cfg.accessToken,
        });
        providerMessageId = result.providerMessageId;
        sendMode = 'session';
      } else {
        const template = await this.resolveQuoteProposalTemplate(user.organizationId);
        if (!template) {
          throw new BadRequestException(
            'WhatsApp cold send requires an approved Meta template — set Quote proposal template under Integrations → WhatsApp, or wait for a customer reply (24h session).',
          );
        }
        const bodyParameters = [
          guestName,
          pdf.tripTitle,
          quoteRef,
          proposalUrl,
        ].slice(0, Math.max(0, template.variableCount));
        const result = await this.messaging.sendTemplate({
          to: digits,
          phoneNumberId: cfg.phoneNumberId,
          accessToken: cfg.accessToken,
          templateName: template.metaTemplateName,
          languageCode: template.languageCode,
          bodyParameters: bodyParameters.length ? bodyParameters : undefined,
        });
        providerMessageId = result.providerMessageId;
        sendMode = 'template';
      }
    }

    const sent = await this.transition(user, versionId, 'send', {
      extendValidity: input.extendValidity === true,
    });

    try {
      await this.interactions.create(user, {
        channel: 'whatsapp',
        partyId,
        outcome: 'pending',
        unread: false,
        summary: `Quote ${pdf.quoteNumber} sent via WhatsApp`,
        staffUserId: user.sub,
        rawPayloadJson: {
          direction: 'outbound',
          kind: 'quote.send_whatsapp',
          to: digits,
          text,
          proposalUrl,
          quotationVersionId: versionId,
          documentId: pdf.documentId,
          providerMessageId,
          demo,
          sendMode,
        },
      });
    } catch {
      // Never fail the send because inbox logging failed.
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'quote.send_whatsapp',
      entityType: 'quotation_version',
      entityId: versionId,
      metadata: {
        to: digits,
        demo,
        sendMode,
        providerMessageId,
      },
    });

    return {
      sent: true,
      cloudConfigured: true,
      demo,
      sendMode,
      proposalUrl,
      toPhone: digits,
      quoteNumber: pdf.quoteNumber,
      tripTitle: pdf.tripTitle,
      documentId: pdf.documentId,
      validityExtendedTo:
        (sent as { validityExtendedTo?: string | null }).validityExtendedTo ??
        ready.validityExtendedTo,
      validityGraceUsed:
        (sent as { validityGraceUsed?: boolean }).validityGraceUsed ??
        ready.validityGraceUsed,
    };
  }

  private async hasWhatsappCustomerSession(
    organizationId: string,
    partyId: string | null,
    digits: string,
  ): Promise<boolean> {
    const session = await this.resolveWhatsappCustomerSession(
      organizationId,
      partyId,
      digits,
    );
    return session.open;
  }

  private async resolveWhatsappCustomerSession(
    organizationId: string,
    partyId: string | null,
    digits: string,
    now: Date = new Date(),
  ) {
    const since = new Date(now.getTime() - WHATSAPP_CUSTOMER_SESSION_MS);
    const rows = await this.prisma.interaction.findMany({
      where: {
        organizationId,
        channel: 'whatsapp',
        createdAt: { gte: since },
        ...(partyId ? { partyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { createdAt: true, rawPayloadJson: true },
    });
    return evaluateWhatsappCustomerSession(rows, digits, now);
  }

  private async resolveQuoteProposalTemplate(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    const candidates = await this.prisma.whatsAppTemplate.findMany({
      where: { organizationId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return pickQuoteProposalTemplate(candidates, org?.settingsJson);
  }

  private async whatsappCloudConfig(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    const settings =
      org?.settingsJson && typeof org.settingsJson === 'object'
        ? (org.settingsJson as Record<string, unknown>)
        : {};
    const integrations =
      settings.integrations && typeof settings.integrations === 'object'
        ? (settings.integrations as Record<string, unknown>)
        : {};
    const wa =
      integrations.whatsapp && typeof integrations.whatsapp === 'object'
        ? (integrations.whatsapp as Record<string, unknown>)
        : {};
    return {
      enabled: Boolean(wa.enabled),
      phoneNumberId: typeof wa.phoneNumberId === 'string' ? wa.phoneNumberId : '',
      accessToken: typeof wa.accessToken === 'string' ? wa.accessToken : '',
    };
  }

  /** Reuse an active share link or create one so WhatsApp can deep-link the proposal. */
  private async ensureTripProposalShare(
    user: AuthUser,
    tripId: string,
    quotationVersionId?: string | null,
  ) {
    const existing = await this.prisma.itineraryShareLink.findFirst({
      where: {
        organizationId: user.organizationId,
        tripId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      if (
        quotationVersionId &&
        existing.quotationVersionId !== quotationVersionId
      ) {
        await this.prisma.itineraryShareLink.update({
          where: { id: existing.id },
          data: { quotationVersionId },
        });
      }
      return {
        id: existing.id,
        token: existing.token,
        path: `/p/itinerary/${existing.token}`,
        familyPin: undefined as string | undefined,
      };
    }

    const itinerary = await this.prisma.itinerary.findFirst({
      where: { tripId, organizationId: user.organizationId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const version = itinerary?.versions[0];
    if (!version) {
      throw new BadRequestException(
        'Save an itinerary before sending the proposal on WhatsApp',
      );
    }

    const token = randomBytes(24).toString('base64url');
    const familyPin = String(Math.floor(100000 + Math.random() * 900000));
    const familyPinHash = await hashPassword(familyPin);
    const link = await this.prisma.itineraryShareLink.create({
      data: {
        organizationId: user.organizationId,
        tripId,
        itineraryVersionId: version.id,
        quotationVersionId: quotationVersionId || null,
        token,
        familyPinHash,
        createdBy: user.sub,
      },
    });
    return {
      id: link.id,
      token: link.token,
      path: `/p/itinerary/${link.token}`,
      familyPin,
    };
  }

  async savePdfToDrive(user: AuthUser, versionId: string) {
    if (!this.google) throw new BadRequestException('Google Drive is not available');
    const pdf = await this.generatePdf(user, versionId);
    const drive = await this.google.saveDocumentToDrive(user, pdf.documentId);
    return { ...pdf, drive };
  }
}

/** Prefer digits Meta accepts; keep India 10-digit mobiles usable. */
function normalizeQuoteWhatsappPhone(waId: string): string | null {
  const digits = waId.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}
