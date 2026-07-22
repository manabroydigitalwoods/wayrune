import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import {
  buildProposalAssumptions,
  buildSeededItineraryDays,
  computeInquiryProposalReadiness,
  parseTripProposalSeed,
  proposalSeedPublicSummary,
  resolveTripDayCount,
  type InquiryProposalSeed,
  type ProposalSeedSteps,
} from '@wayrune/contracts';
import { placeRefsFromJson, originRefFromInquiry } from '../../common/place-refs';
import {
  defaultValidUntilDate,
  quoteValidityDaysFromSettings,
  syncTermsWithValidUntil,
} from '../quotations/quote-validity';
import { normalizeCurrency, quoteFxLockToJson, sameCurrencyLock } from '../quotations/quote-fx';

type Db = Prisma.TransactionClient;

export type InquiryForProposalSeed = {
  id: string;
  inquiryNumber: string;
  travelType: string | null;
  domesticOrIntl: string | null;
  /** @deprecated Prefer originJson */
  origin?: string | null;
  /** @deprecated Prefer originJson */
  originPlaceId?: string | null;
  originJson?: unknown;
  destinationsJson: unknown;
  stopsJson: unknown;
  startDate: Date | null;
  endDate: Date | null;
  nights: number | null;
  adults: number;
  children: number;
  infants: number;
  budgetAmount: Prisma.Decimal | number | null;
  budgetCurrency: string | null;
  hotelCategory: string | null;
  meals: string | null;
  transportPref: string | null;
  flightsRequired: boolean | null;
  roomRequirements: string | null;
  dateFlexible: boolean;
  interestsJson: unknown;
  specialRequirements: string | null;
};

function budgetNumber(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function startYmdInTimezone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function buildInquirySourceSnapshot(inquiry: InquiryForProposalSeed) {
  return {
    inquiryNumber: inquiry.inquiryNumber,
    travelType: inquiry.travelType,
    domesticOrIntl: inquiry.domesticOrIntl,
    origin: originRefFromInquiry(inquiry),
    destinations: placeRefsFromJson(inquiry.destinationsJson),
    stops: placeRefsFromJson(inquiry.stopsJson),
    startDate: inquiry.startDate?.toISOString() ?? null,
    endDate: inquiry.endDate?.toISOString() ?? null,
    nights: inquiry.nights,
    adults: inquiry.adults,
    children: inquiry.children,
    infants: inquiry.infants,
    budgetAmount: budgetNumber(inquiry.budgetAmount),
    budgetCurrency: inquiry.budgetCurrency,
    hotelCategory: inquiry.hotelCategory,
    meals: inquiry.meals,
    transportPref: inquiry.transportPref,
    flightsRequired: inquiry.flightsRequired,
    roomRequirements: inquiry.roomRequirements,
    dateFlexible: inquiry.dateFlexible,
    interests: inquiry.interestsJson,
    specialRequirements: inquiry.specialRequirements,
  };
}

function emptySteps(): ProposalSeedSteps {
  return {
    trip: 'pending',
    itinerary: 'pending',
    quotation: 'pending',
    assumptions: 'pending',
  };
}

export function readinessFromInquiry(inquiry: InquiryForProposalSeed) {
  return computeInquiryProposalReadiness({
    destinations: placeRefsFromJson(inquiry.destinationsJson),
    stops: placeRefsFromJson(inquiry.stopsJson),
    adults: inquiry.adults,
    children: inquiry.children,
    travelType: inquiry.travelType,
    startDate: inquiry.startDate,
    endDate: inquiry.endDate,
    nights: inquiry.nights,
    budgetAmount: budgetNumber(inquiry.budgetAmount),
    hotelCategory: inquiry.hotelCategory,
    meals: inquiry.meals,
    transportPref: inquiry.transportPref,
    flightsRequired: inquiry.flightsRequired,
    roomRequirements: inquiry.roomRequirements,
    origin: originRefFromInquiry(inquiry),
  });
}

export async function ensureProposalSeedOnTrip(opts: {
  db: Db;
  organizationId: string;
  userId: string;
  tripId: string;
  inquiry: InquiryForProposalSeed;
  timeZone: string;
  orgSettingsJson: unknown;
  orgCurrency: string | null;
}): Promise<{
  seed: InquiryProposalSeed;
  summary: ReturnType<typeof proposalSeedPublicSummary> & {
    quotationGaps: string[];
  };
}> {
  const {
    db,
    organizationId,
    userId,
    tripId,
    inquiry,
    timeZone,
    orgSettingsJson,
    orgCurrency,
  } = opts;

  const trip = await db.trip.findFirst({
    where: { id: tripId, organizationId, deletedAt: null },
    include: {
      itineraries: {
        include: { versions: { orderBy: { versionNumber: 'asc' }, take: 1 } },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
      quotations: {
        include: { versions: { orderBy: { versionNumber: 'asc' }, take: 1 } },
        orderBy: { createdAt: 'asc' },
        take: 5,
      },
    },
  });
  if (!trip) {
    throw new Error('Trip not found for proposal seed');
  }

  const existing = parseTripProposalSeed(trip.settingsJson);
  const readiness = readinessFromInquiry(inquiry);
  const now = new Date().toISOString();

  const seed: InquiryProposalSeed = existing
    ? {
        ...existing,
        // Immutable snapshot — never overwrite
        sourceSnapshot: existing.sourceSnapshot,
        steps: { ...existing.steps },
        assumptions: existing.assumptions?.length
          ? existing.assumptions
          : buildProposalAssumptions({
              adults: inquiry.adults,
              hotelCategory: inquiry.hotelCategory,
              meals: inquiry.meals,
              transportPref: inquiry.transportPref,
              flightsRequired: inquiry.flightsRequired,
              roomRequirements: inquiry.roomRequirements,
            }),
        pricing: existing.pricing ?? {
          pricingStatus: 'not_started',
          customerBudgetTarget: budgetNumber(inquiry.budgetAmount),
          customerBudgetCurrency: inquiry.budgetCurrency,
          sellingTotal: null,
          supplierCostTotal: null,
          adults: inquiry.adults,
          children: inquiry.children,
          infants: inquiry.infants,
        },
      }
    : {
        sourceInquiryId: inquiry.id,
        version: 1,
        sourceSnapshot: buildInquirySourceSnapshot(inquiry),
        seededAt: now,
        steps: emptySteps(),
        completedAt: null,
        dateConflict: false,
        assumptions: buildProposalAssumptions({
          adults: inquiry.adults,
          hotelCategory: inquiry.hotelCategory,
          meals: inquiry.meals,
          transportPref: inquiry.transportPref,
          flightsRequired: inquiry.flightsRequired,
          roomRequirements: inquiry.roomRequirements,
        }),
        pricing: {
          pricingStatus: 'not_started',
          customerBudgetTarget: budgetNumber(inquiry.budgetAmount),
          customerBudgetCurrency: inquiry.budgetCurrency,
          sellingTotal: null,
          supplierCostTotal: null,
          adults: inquiry.adults,
          children: inquiry.children,
          infants: inquiry.infants,
        },
        itineraryDaysCreated: 0,
        quotationId: null,
      };

  seed.steps.trip = 'completed';

  // Assumptions
  if (seed.steps.assumptions !== 'completed') {
    try {
      if (!seed.assumptions.length) {
        seed.assumptions = buildProposalAssumptions({
          adults: inquiry.adults,
          hotelCategory: inquiry.hotelCategory,
          meals: inquiry.meals,
          transportPref: inquiry.transportPref,
          flightsRequired: inquiry.flightsRequired,
          roomRequirements: inquiry.roomRequirements,
        });
      }
      seed.steps.assumptions = 'completed';
    } catch {
      seed.steps.assumptions = 'failed';
    }
  }

  // Itinerary
  if (seed.steps.itinerary !== 'completed' && seed.steps.itinerary !== 'skipped') {
    try {
      const dayResolve = resolveTripDayCount({
        startDate: inquiry.startDate,
        endDate: inquiry.endDate,
        nights: inquiry.nights,
      });

      if (!readiness.itinerarySeedable || !dayResolve) {
        seed.steps.itinerary = 'skipped';
        seed.itineraryDaysCreated = 0;
      } else {
        const destRefs = [
          ...placeRefsFromJson(inquiry.destinationsJson),
          ...placeRefsFromJson(inquiry.stopsJson),
        ];
        const multiStop = destRefs.length > 1;
        const startYmd = inquiry.startDate
          ? startYmdInTimezone(inquiry.startDate, timeZone)
          : null;
        const days = buildSeededItineraryDays({
          dayCount: dayResolve.dayCount,
          startYmd,
          destinations: destRefs,
          multiStop,
        }).map((d) => ({ ...d, id: randomUUID() }));

        const itinerary = trip.itineraries[0];
        const version = itinerary?.versions[0];
        if (version) {
          const content =
            version.contentJson &&
            typeof version.contentJson === 'object' &&
            !Array.isArray(version.contentJson)
              ? { ...(version.contentJson as Record<string, unknown>) }
              : {};
          const existingDays = Array.isArray(content.days) ? content.days : [];
          // Only seed when empty — idempotent
          if (existingDays.length === 0) {
            await db.itineraryVersion.update({
              where: { id: version.id },
              data: {
                contentJson: { ...content, days } as Prisma.InputJsonValue,
              },
            });
            seed.itineraryDaysCreated = days.length;
          } else {
            seed.itineraryDaysCreated =
              seed.itineraryDaysCreated ?? existingDays.length;
          }
        }
        seed.dateConflict = dayResolve.dateConflict;
        seed.steps.itinerary = 'completed';
      }
    } catch {
      seed.steps.itinerary = 'failed';
    }
  }

  // Quotation shell
  if (seed.steps.quotation !== 'completed') {
    try {
      let quotationId = seed.quotationId ?? null;
      const existingQuote =
        trip.quotations.find((q) => q.id === quotationId) || trip.quotations[0];
      if (existingQuote) {
        quotationId = existingQuote.id;
      } else {
        const currency = normalizeCurrency(orgCurrency || 'INR');
        const count = await db.quotation.count({ where: { organizationId } });
        const days = quoteValidityDaysFromSettings(orgSettingsJson);
        const validUntil = defaultValidUntilDate(days);
        const quotation = await db.quotation.create({
          data: {
            organizationId,
            tripId,
            quoteNumber: `QT-${String(count + 1).padStart(5, '0')}`,
            versions: {
              create: {
                versionNumber: 1,
                label: 'Draft — pricing not started',
                status: 'draft',
                itemsJson: [],
                currency,
                exchangeRatesJson: quoteFxLockToJson(
                  sameCurrencyLock(currency),
                ) as Prisma.InputJsonValue,
                validUntil,
                terms: syncTermsWithValidUntil(null, validUntil),
                // Schema defaults totals to 0 — pricingStatus lives on trip seed.
                createdBy: userId,
              },
            },
          },
        });
        quotationId = quotation.id;
      }
      seed.quotationId = quotationId;
      seed.steps.quotation = 'completed';
    } catch {
      seed.steps.quotation = 'failed';
    }
  }

  const failed = Object.values(seed.steps).some((s) => s === 'failed' || s === 'pending');
  seed.completedAt = failed ? null : now;

  const prevSettings =
    trip.settingsJson && typeof trip.settingsJson === 'object' && !Array.isArray(trip.settingsJson)
      ? { ...(trip.settingsJson as Record<string, unknown>) }
      : {};

  await db.trip.update({
    where: { id: tripId },
    data: {
      settingsJson: {
        ...prevSettings,
        proposalSeed: seed,
      } as Prisma.InputJsonValue,
      updatedBy: userId,
    },
  });

  const summary = proposalSeedPublicSummary(seed);
  return {
    seed,
    summary: {
      ...summary,
      quotationGaps: [
        ...readiness.quotationReadiness.missingPreferences,
        ...readiness.quotationReadiness.pricingSensitive,
      ],
    },
  };
}
