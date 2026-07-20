import { useMemo, useState } from 'react';
import {
  humanizeItemType,
  SoftIcon,
  cn,
  formatCurrency,
  formatPercent,
  formatDate,
  formatDateWithWeekday,
  formatDateRange,
  formatTimeRange,
  type DateFormatId,
  type TimeFormatId,
} from '@wayrune/ui';
import {
  formatOrgTaxDisplaySplitLinesUi,
  formatOrgTaxIdentityLinesUi,
  orgTaxDisplaySplitCueUi,
  orgTaxTotalsLabelUi,
  parseOrgTaxIdentityUi,
} from '../../lib/orgTaxIdentity';
import {
  BedDouble,
  Car,
  Check,
  MapPin,
  MessageCircle,
  Phone,
  Plane,
  Mail,
  Receipt,
  Sparkles,
  Sun,
  Utensils,
  StickyNote,
  Clock3,
  X,
  ArrowDown,
  ShieldCheck,
  CloudSun,
  type LucideIcon,
} from 'lucide-react';
import { resolveTripWindowDisplay } from '@wayrune/contracts';
import { placeName } from '../../lib/placeRefs';
import {
  ProposalExploreSheet,
  canExploreItem,
  type ExploreItem,
} from './ProposalExploreSheet';

function resolveGallery(details: Record<string, unknown> | undefined): string[] {
  if (!details) return [];
  const urls: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const s = raw.trim();
    if (s && !urls.includes(s)) urls.push(s);
  };
  push(details.imageUrl);
  if (Array.isArray(details.imageUrls)) {
    for (const u of details.imageUrls) push(u);
  }
  return urls;
}

export type CustomerQuotePayload = {
  quoteNumber: string;
  versionId: string;
  versionLabel?: string | null;
  versionNumber: number;
  status: string;
  currency: string;
  validUntil?: string | null;
  sellTotal: number;
  taxTotal: number;
  discountTotal: number;
  items: Array<{
    description: string;
    quantity: number;
    unitSell: number;
    taxPercent: number;
    amount: number;
  }>;
  inclusions?: string | null;
  exclusions?: string | null;
  terms?: string | null;
};

export type RouteStop = {
  label: string;
  kind: 'pickup' | 'stay' | 'drop';
  nights?: number;
  legFromPrevious?: string;
};

export type PackageSummary = {
  days: number;
  nights: number;
  destinations: string[];
  transportLabel: string | null;
  mealLabels: string[];
  hotelCount: number;
  activityCount: number;
  pickup: string | null;
  drop: string | null;
  sellTotal: number | null;
  currency: string | null;
  bestTime: string | null;
  routeStops?: RouteStop[];
  vehicleSeats?: number | null;
  vehicleIncludes?: string[];
};

export type PaymentScheduleStep = {
  label: string;
  percent?: number;
  amountHint?: string;
};

export type PackingCategories = {
  clothing?: string[];
  electronics?: string[];
  documents?: string[];
  medicine?: string[];
};

export type ItineraryStoryPayload = {
  heroImageUrl?: string;
  headline?: string;
  tagline?: string;
  highlights?: string[];
  bestTime?: string;
  weatherNote?: string;
  packingTips?: string[];
  packingCategories?: PackingCategories;
  faqs?: Array<{ question: string; answer: string }>;
  consultantNote?: string;
  cancellationNote?: string;
  paymentSchedule?: PaymentScheduleStep[];
};

export type OrgTrustPayload = {
  licensed?: boolean;
  yearsExperience?: number | null;
  travellerCountLabel?: string | null;
  support247?: boolean;
  verifiedHotels?: boolean;
  defaultCancellationNote?: string | null;
  chips?: string[];
};

export type ItineraryPreviewPayload = {
  trip: {
    id: string;
    title: string;
    tripNumber: string;
    startDate?: string | null;
    endDate?: string | null;
    destinations: string[];
    clientName?: string | null;
  };
  agency: { name: string; slug: string };
  branding?: {
    companyName: string;
    tagline: string | null;
    primaryColor: string;
    logoUrl: string | null;
    previewFooter: string | null;
  };
  contact?: {
    phone: string | null;
    supportEmail: string | null;
    website: string | null;
    legalName: string | null;
    emergencyPhone?: string | null;
    gstin?: string | null;
    placeOfSupply?: string | null;
    destinationPlaceOfSupply?: string | null;
  };
  taxIdentity?: {
    taxLabel: string;
    gstin: string | null;
    placeOfSupply: string | null;
    destinationPlaceOfSupply: string | null;
  } | null;
  trust?: OrgTrustPayload | null;
  display?: {
    dateFormat?: DateFormatId;
    timeFormat?: TimeFormatId;
  };
  story?: ItineraryStoryPayload | null;
  packageSummary?: PackageSummary | null;
  version: {
    id: string;
    versionNumber: number;
    label?: string | null;
    status?: string;
    createdAt?: string;
  };
  days: Array<{
    dayNumber: number;
    title: string;
    date?: string | null;
    destination?: string | null | { name?: string };
    items: Array<{
      type: string;
      title: string;
      description?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      location?: string | null | { name?: string };
      notes?: string | null;
      details?: Record<string, unknown>;
    }>;
  }>;
  quotation?: CustomerQuotePayload | null;
  /** Public share: client may accept sent/approved quote */
  canAcceptQuote?: boolean;
};

function itemIcon(type: string): LucideIcon {
  switch (type) {
    case 'hotel':
      return BedDouble;
    case 'transfer':
      return Car;
    case 'flight':
      return Plane;
    case 'meal':
      return Utensils;
    case 'sightseeing':
    case 'activity': // legacy alias
      return Sun;
    default:
      return StickyNote;
  }
}

function splitChecklist(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n|•|▪|✔|✓|✖|✗|;/)
    .map((s) => s.replace(/^[-–—*]\s*/, '').trim())
    .filter(Boolean);
}

function starsLabel(n: unknown): string | null {
  const stars = Number(n);
  if (!Number.isFinite(stars) || stars < 1) return null;
  return '★'.repeat(Math.min(5, Math.round(stars)));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function periodOfDay(startTime?: string | null): string | null {
  if (!startTime) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  if (!Number.isFinite(hour)) return null;
  if (hour < 5) return 'Early morning';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 21) return 'Evening';
  return 'Night';
}

const KEY_COVERAGE = [
  { match: /flight/i, label: 'Flights' },
  { match: /lunch/i, label: 'Lunch' },
  { match: /dinner/i, label: 'Dinner' },
] as const;

function keyCoverageHints(includeLines: string[], excludeLines: string[]) {
  const out: Array<{ label: string; included: boolean }> = [];
  for (const key of KEY_COVERAGE) {
    const inInc = includeLines.some((l) => key.match.test(l));
    const inExc = excludeLines.some((l) => key.match.test(l));
    if (inInc) out.push({ label: key.label, included: true });
    else if (inExc) out.push({ label: key.label, included: false });
  }
  return out;
}

function resolvePaymentSchedule(
  story: ItineraryStoryPayload | null | undefined,
  terms: string | null | undefined,
): PaymentScheduleStep[] {
  if (story?.paymentSchedule && story.paymentSchedule.length) {
    return story.paymentSchedule.filter((s) => s.label?.trim());
  }
  if (!terms?.trim()) return [];
  const pctMatches = [...terms.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1]));
  if (pctMatches.length >= 2) {
    return [
      { label: 'Today', percent: pctMatches[0] },
      { label: 'Before travel', percent: pctMatches[1] },
    ];
  }
  if (pctMatches.length === 1) {
    const first = pctMatches[0];
    const rest = Math.max(0, 100 - first);
    return [
      { label: 'Today', percent: first },
      ...(rest > 0 ? [{ label: 'Before travel', percent: rest }] : []),
    ];
  }
  return [];
}

function SectionEyebrow({ children }: { children: string }) {
  return (
    <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </h2>
  );
}

function SummaryTile({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5 glass',
        emphasize && 'border-primary/35 ring-1 ring-primary/15 sm:col-span-1',
      )}
    >
      <p
        className={cn(
          'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
          emphasize && 'text-primary',
        )}
      >
        {label}
      </p>
      <p className={cn('mt-0.5 font-medium', emphasize ? 'text-base sm:text-lg' : 'text-sm')}>
        {value}
      </p>
    </div>
  );
}

export function ItineraryPreviewView({
  data,
  className,
  footerNote,
}: {
  data: ItineraryPreviewPayload;
  className?: string;
  footerNote?: string;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [exploreItem, setExploreItem] = useState<ExploreItem | null>(null);
  const displayPrefs = useMemo(
    () => ({
      dateFormat: data.display?.dateFormat,
      timeFormat: data.display?.timeFormat,
    }),
    [data.display?.dateFormat, data.display?.timeFormat],
  );

  const branding = data.branding;
  const primary = branding?.primaryColor || '#0f6e56';
  const agencyName = branding?.companyName || data.agency.name;
  const summary = data.packageSummary;
  const story = data.story;
  const quote = data.quotation;
  const trustChips = data.trust?.chips?.filter(Boolean) || [];
  const cancellationNote =
    story?.cancellationNote?.trim() ||
    data.trust?.defaultCancellationNote?.trim() ||
    null;
  const emergencyPhone =
    data.contact?.emergencyPhone?.trim() || data.contact?.phone?.trim() || null;

  const packingCats = story?.packingCategories;
  const packingCatRows = [
    { label: 'Clothing', items: packingCats?.clothing || [] },
    { label: 'Electronics', items: packingCats?.electronics || [] },
    { label: 'Documents', items: packingCats?.documents || [] },
    { label: 'Medicine', items: packingCats?.medicine || [] },
  ].filter((r) => r.items.length > 0);
  const hasPackingCats = packingCatRows.length > 0;
  const flatPacking = !hasPackingCats ? story?.packingTips || [] : [];

  const dateRange = formatDateRange(
    data.trip.startDate,
    data.trip.endDate,
    '',
    displayPrefs,
  );

  const destinations =
    summary?.destinations?.length
      ? summary.destinations
      : data.trip.destinations.length
        ? data.trip.destinations
        : [
            ...new Set(
              data.days.map((d) => placeName(d.destination) || '').filter(Boolean),
            ),
          ];

  const routeStops: RouteStop[] =
    summary?.routeStops && summary.routeStops.length > 0
      ? summary.routeStops
      : [
          ...(summary?.pickup ? [{ label: summary.pickup, kind: 'pickup' as const }] : []),
          ...destinations.map((d) => ({ label: d, kind: 'stay' as const })),
          ...(summary?.drop && summary.drop !== summary.pickup
            ? [{ label: summary.drop, kind: 'drop' as const }]
            : summary?.pickup
              ? [{ label: summary.pickup, kind: 'drop' as const }]
              : []),
        ];

  const hotels = data.days.flatMap((day) =>
    day.items
      .filter((i) => i.type === 'hotel')
      .map((item) => ({ day, item })),
  );
  const transfersRaw = data.days.flatMap((day) =>
    day.items
      .filter((i) => i.type === 'transfer')
      .map((item) => ({ day, item })),
  );
  const transfers = transfersRaw.filter(({ item }, idx) => {
    const vehicle =
      typeof item.details?.vehicle === 'string' && item.details.vehicle
        ? item.details.vehicle
        : item.title;
    return (
      transfersRaw.findIndex(({ item: other }) => {
        const otherVehicle =
          typeof other.details?.vehicle === 'string' && other.details.vehicle
            ? other.details.vehicle
            : other.title;
        return otherVehicle === vehicle;
      }) === idx
    );
  });

  const includeLines = splitChecklist(quote?.inclusions);
  const excludeLines = splitChecklist(quote?.exclusions);
  const coverage = keyCoverageHints(includeLines, excludeLines);
  const paymentSteps = resolvePaymentSchedule(story, quote?.terms);

  const tripWindowLabel = resolveTripWindowDisplay(
    summary?.bestTime || story?.bestTime,
    data.trip.startDate,
    data.trip.endDate,
    destinations[0] || null,
  );
  const chips = [
    summary ? `${summary.days}D · ${summary.nights}N` : null,
    destinations.length ? `${destinations.length} destination${destinations.length > 1 ? 's' : ''}` : null,
    summary?.transportLabel,
    summary?.mealLabels?.[0],
    tripWindowLabel ? tripWindowLabel : null,
  ].filter(Boolean) as string[];

  const priceLabel =
    summary?.sellTotal != null && summary.currency
      ? formatCurrency(summary.sellTotal, summary.currency)
      : quote
        ? formatCurrency(quote.sellTotal, quote.currency)
        : null;

  const heroHeadline = story?.headline || data.trip.title;
  const heroJourney =
    summary && summary.days > 0
      ? `Your ${summary.days}-Day ${data.trip.title
          .replace(/\bpackage\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim()} Journey`
      : story?.headline
        ? data.trip.title
        : null;
  const heroSub = story?.headline ? heroJourney : null;

  function openExplore(item: ExploreItem) {
    if (!canExploreItem(item)) return;
    setExploreItem(item);
  }

  return (
    <div className={cn('mx-auto w-full max-w-3xl', className)}>
      <ProposalExploreSheet
        item={exploreItem}
        open={Boolean(exploreItem)}
        onOpenChange={(open) => {
          if (!open) setExploreItem(null);
        }}
      />
      {/* Layer 1 — Hero: full-bleed photo, cinematic bottom fade for type */}
      <header className="mb-8 overflow-hidden rounded-2xl border border-white/40 shadow-sm">
        <div
          className="relative min-h-[280px] bg-cover bg-center sm:min-h-[320px]"
          style={
            story?.heroImageUrl
              ? { backgroundImage: `url(${story.heroImageUrl})` }
              : {
                  backgroundImage: `linear-gradient(135deg, ${primary}cc, ${primary}66 45%, #0b2e26aa)`,
                }
          }
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
          <div className="relative flex min-h-[280px] flex-col justify-between gap-6 p-5 sm:min-h-[320px] sm:p-8">
            <div className="flex items-start justify-between gap-3">
              {branding?.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt=""
                  className="h-10 max-w-[140px] object-contain drop-shadow-md"
                />
              ) : (
                <span
                  className="text-xs font-semibold uppercase tracking-[0.18em] text-white"
                  style={{ textShadow: '0 1px 8px rgb(0 0 0 / 0.65)' }}
                >
                  {agencyName}
                </span>
              )}
              {priceLabel ? (
                <span className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold tabular-nums text-foreground shadow-lg">
                  {priceLabel}
                </span>
              ) : null}
            </div>

            <div className="max-w-2xl space-y-2.5 text-white">
              <h1
                className="font-display text-3xl font-bold tracking-tight sm:text-5xl"
                style={{ textShadow: '0 2px 16px rgb(0 0 0 / 0.55)' }}
              >
                {heroHeadline}
              </h1>
              {heroSub ? (
                <p
                  className="text-base font-semibold text-white/95 sm:text-lg"
                  style={{ textShadow: '0 1px 10px rgb(0 0 0 / 0.5)' }}
                >
                  {heroSub}
                </p>
              ) : null}
              {story?.tagline || branding?.tagline ? (
                <p
                  className="max-w-xl text-sm leading-relaxed text-white/92 sm:text-[15px]"
                  style={{ textShadow: '0 1px 8px rgb(0 0 0 / 0.5)' }}
                >
                  {story?.tagline || branding?.tagline}
                </p>
              ) : null}
              <p
                className="text-xs font-medium text-white/85"
                style={{ textShadow: '0 1px 6px rgb(0 0 0 / 0.45)' }}
              >
                <span className="tabular-nums">{data.trip.tripNumber}</span>
                {dateRange ? ` · ${dateRange}` : ''}
                {data.trip.clientName ? ` · ${data.trip.clientName}` : ''}
              </p>
              {chips.length ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-white/35 bg-white/15 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-[6px]"
                      style={{ textShadow: '0 1px 4px rgb(0 0 0 / 0.4)' }}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {trustChips.length > 0 ? (
          <section className="flex flex-wrap items-center justify-center gap-2">
            {trustChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 px-3 py-1.5 text-xs font-medium glass"
              >
                <ShieldCheck className="size-3.5 text-primary" />
                {chip}
              </span>
            ))}
          </section>
        ) : null}

        {/* Why you'll love */}
        {story?.highlights && story.highlights.length > 0 ? (
          <section className="space-y-3">
            <SectionEyebrow>Why you’ll love this trip</SectionEyebrow>
            <ul className="grid gap-2 sm:grid-cols-2">
              {story.highlights.map((h) => (
                <li
                  key={h}
                  className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm glass"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Trip summary — weighted comparison fields */}
        {summary ? (
          <section className="space-y-3">
            <SectionEyebrow>Trip summary</SectionEyebrow>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {priceLabel ? (
                <SummaryTile label="Package price" value={priceLabel} emphasize />
              ) : null}
              <SummaryTile
                label="Duration"
                value={`${summary.days} days · ${summary.nights} nights`}
                emphasize
              />
              <SummaryTile
                label="Destinations"
                value={destinations.join(' · ') || '—'}
                emphasize
              />
              <SummaryTile label="Vehicle" value={summary.transportLabel || '—'} emphasize />
              <SummaryTile
                label="Hotels"
                value={summary.hotelCount ? String(summary.hotelCount) : '—'}
                emphasize
              />
              <SummaryTile
                label="Meals"
                value={summary.mealLabels.length ? summary.mealLabels.join(', ') : '—'}
                emphasize
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                summary.activityCount
                  ? { label: 'Activities', value: String(summary.activityCount) }
                  : null,
                summary.pickup ? { label: 'Pickup', value: summary.pickup } : null,
                summary.drop ? { label: 'Drop', value: summary.drop } : null,
                !story?.weatherNote && tripWindowLabel
                  ? { label: 'Your dates', value: tripWindowLabel }
                  : null,
              ]
                .filter(Boolean)
                .map((row) => (
                  <div key={row!.label} className="rounded-xl border border-dashed px-3 py-2 glass">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {row!.label}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">{row!.value}</p>
                  </div>
                ))}
            </div>
            {story?.weatherNote || tripWindowLabel ? (
              <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm glass">
                <CloudSun className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    During your trip
                  </p>
                  <p className="mt-0.5">
                    {tripWindowLabel ? (
                      <span className="font-medium">{tripWindowLabel}</span>
                    ) : null}
                    {story?.weatherNote ? (
                      <span className="text-muted-foreground">
                        {tripWindowLabel ? ' — ' : ''}
                        {story.weatherNote}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Key coverage — flights / lunch / dinner */}
        {coverage.length > 0 ? (
          <section className="flex flex-wrap items-center justify-center gap-2">
            {coverage.map((c) => (
              <span
                key={c.label}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
                  c.included
                    ? 'border-primary/35 text-foreground glass'
                    : 'border-border/80 text-foreground/85 glass',
                )}
              >
                {c.included ? (
                  <Check className="size-3.5 text-primary" />
                ) : (
                  <X className="size-3.5 text-muted-foreground" />
                )}
                {c.label}
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {c.included ? 'included' : 'not included'}
                </span>
              </span>
            ))}
          </section>
        ) : null}

        {/* Route with nights */}
        {routeStops.length > 0 ? (
          <section className="space-y-3">
            <SectionEyebrow>Your route</SectionEyebrow>
            <div className="flex flex-col items-center gap-1 rounded-2xl border px-4 py-5 glass">
              {routeStops.map((stop, i) => (
                <div key={`${stop.kind}-${stop.label}-${i}`} className="flex w-full max-w-sm flex-col items-center">
                  {i > 0 ? (
                    <div className="my-1.5 flex flex-col items-center gap-0.5">
                      <ArrowDown className="size-4 text-muted-foreground/70" />
                      {stop.legFromPrevious ? (
                        <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                          {stop.legFromPrevious}
                        </span>
                      ) : null}
                      <ArrowDown className="size-4 text-muted-foreground/70" />
                    </div>
                  ) : null}
                  <div className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 glass-row">
                    <SoftIcon
                      icon={
                        stop.kind === 'pickup' || stop.kind === 'drop'
                          ? Plane
                          : stop.kind === 'stay'
                            ? BedDouble
                            : Car
                      }
                      className="size-8 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {stop.kind === 'pickup'
                          ? 'Start'
                          : stop.kind === 'drop'
                            ? 'Return'
                            : 'Stay'}
                      </p>
                      <p className="font-medium">{stop.label}</p>
                      {stop.kind === 'stay' && stop.nights ? (
                        <p className="text-xs text-muted-foreground">
                          {stop.nights} night{stop.nights === 1 ? '' : 's'}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Stays & transport */}
        {(hotels.length > 0 || transfers.length > 0) && (
          <section className="space-y-3">
            <SectionEyebrow>Stays & transport</SectionEyebrow>
            <div className="grid gap-3 sm:grid-cols-2">
              {hotels.map(({ item }, idx) => {
                const details = item.details || {};
                const amenities = stringList(details.amenities);
                const stars = starsLabel(details.stars);
                const gallery = resolveGallery(details);
                const imageUrl = gallery[0] || null;
                const googleRating = Number(details.googleRating);
                const googleReviewCount = Number(details.googleReviewCount);
                const distanceHint =
                  typeof details.distanceHint === 'string' && details.distanceHint.trim()
                    ? details.distanceHint.trim()
                    : null;
                const explore = canExploreItem(item);
                const cardInner = (
                  <>
                    {imageUrl ? (
                      <div
                        className="h-36 bg-cover bg-center"
                        style={{ backgroundImage: `url(${imageUrl})` }}
                        role="img"
                        aria-label={item.title}
                      />
                    ) : null}
                    <div className="flex items-start gap-3 p-4">
                      <SoftIcon icon={BedDouble} className="size-9 shrink-0" />
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Hotel
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          {stars ? <p className="text-amber-500 text-xs">{stars}</p> : null}
                          {Number.isFinite(googleRating) && googleRating > 0 ? (
                            <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums">
                              Google {googleRating.toFixed(1)}
                              {Number.isFinite(googleReviewCount) && googleReviewCount > 0
                                ? ` · ${googleReviewCount.toLocaleString()} reviews`
                                : ''}
                            </span>
                          ) : null}
                          {gallery.length > 1 ? (
                            <span className="text-[10px] text-muted-foreground">
                              {gallery.length} photos
                            </span>
                          ) : null}
                        </div>
                        <p className="font-medium">{item.title}</p>
                        {item.location ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3" />
                            {placeName(item.location)}
                          </p>
                        ) : null}
                        {distanceHint ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{distanceHint}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[
                            details.nights ? `${details.nights} night(s)` : null,
                            details.roomType ? String(details.roomType) : null,
                            details.checkIn ? `In ${details.checkIn}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {item.description ? (
                          <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                            {item.description}
                          </p>
                        ) : null}
                        {amenities.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {amenities.map((a) => (
                              <span
                                key={a}
                                className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                );
                return explore ? (
                  <button
                    key={`hotel-${idx}`}
                    type="button"
                    onClick={() => openExplore(item)}
                    className="overflow-hidden rounded-2xl border text-left glass transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {cardInner}
                  </button>
                ) : (
                  <div key={`hotel-${idx}`} className="overflow-hidden rounded-2xl border glass">
                    {cardInner}
                  </div>
                );
              })}
              {transfers.map(({ item }, idx) => {
                const details = item.details || {};
                const includes = stringList(details.includes);
                const seats = details.seats ? Number(details.seats) : summary?.vehicleSeats;
                const vehicleChips = [
                  Number.isFinite(seats) && seats! > 0 ? `${seats} Seater` : null,
                  ...includes,
                ].filter(Boolean) as string[];
                // De-dupe across identical vehicles in multi-leg trips — show first only visually via unique key
                return (
                  <div key={`transfer-${idx}`} className="rounded-2xl border p-4 glass">
                    <div className="flex items-start gap-3">
                      <SoftIcon icon={Car} className="size-9 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Private vehicle
                        </p>
                        <p className="font-medium">
                          {typeof details.vehicle === 'string' && details.vehicle
                            ? details.vehicle
                            : item.title}
                        </p>
                        {vehicleChips.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {vehicleChips.map((a) => (
                              <span
                                key={a}
                                className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Packing + Before you go */}
        {(hasPackingCats ||
          flatPacking.length > 0 ||
          (story?.faqs && story.faqs.length > 0)) ? (
          <section className="space-y-4">
            {hasPackingCats ? (
              <div className="space-y-3">
                <SectionEyebrow>Packing checklist</SectionEyebrow>
                <div className="grid gap-3 sm:grid-cols-2">
                  {packingCatRows.map((row) => (
                    <div key={row.label} className="rounded-xl border px-4 py-3 glass">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {row.items.map((tip) => (
                          <li key={tip} className="flex gap-2">
                            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : flatPacking.length > 0 ? (
              <div className="space-y-2">
                <SectionEyebrow>Packing checklist</SectionEyebrow>
                <ul className="flex flex-wrap justify-center gap-2">
                  {flatPacking.map((tip) => (
                    <li
                      key={tip}
                      className="rounded-full border px-3 py-1.5 text-sm glass-row"
                    >
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {story?.faqs && story.faqs.length > 0 ? (
              <div className="space-y-2">
                <SectionEyebrow>Before you go</SectionEyebrow>
                <div className="space-y-2">
                  {story.faqs.map((faq, i) => (
                    <div key={i} className="rounded-xl border px-4 py-3 glass">
                      <p className="text-sm font-medium">{faq.question}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Day by day — Today's Experience */}
        <section className="space-y-4">
          <SectionEyebrow>Day by day</SectionEyebrow>
          {data.days.length === 0 ? (
            <div className="rounded-2xl border px-5 py-10 text-center text-sm text-muted-foreground glass">
              No customer-visible itinerary items yet.
            </div>
          ) : (
            data.days.map((day) => {
              const dayPlace =
                placeName(day.destination) ||
                day.items.map((i) => placeName(i.location)).find(Boolean) ||
                null;
              const dayDate = formatDateWithWeekday(day.date, '', displayPrefs);
              return (
                <article
                  key={`day-${day.dayNumber}`}
                  className="overflow-hidden rounded-2xl border glass"
                >
                  <div className="border-b border-white/40 px-5 py-4 dark:border-white/10">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Day {day.dayNumber}
                      {dayDate ? ` · ${dayDate}` : ''}
                    </div>
                    <h3 className="mt-1 font-display text-xl font-semibold text-foreground">
                      {day.title}
                    </h3>
                    {dayPlace ? (
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="size-3.5" />
                        {dayPlace}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                      Today’s experience
                    </p>
                  </div>
                  <ol className="divide-y divide-white/30 dark:divide-white/10">
                    {day.items.map((item, idx) => {
                      const Icon = itemIcon(item.type);
                      const time = formatTimeRange(item.startTime, item.endTime, displayPrefs);
                      const locationLabel = placeName(item.location);
                      const details = item.details || {};
                      const gallery = resolveGallery(details);
                      const imageUrl = gallery[0] || null;
                      const blurb = item.description?.trim() || item.notes?.trim() || null;
                      const showNotes =
                        item.description?.trim() &&
                        item.notes?.trim() &&
                        item.notes.trim() !== item.description.trim()
                          ? item.notes.trim()
                          : null;
                      const explore = canExploreItem(item);
                      const row = (
                        <>
                          {imageUrl ? (
                            <div
                              className="h-28 w-full shrink-0 rounded-xl bg-cover bg-center sm:h-24 sm:w-32"
                              style={{ backgroundImage: `url(${imageUrl})` }}
                              role="img"
                              aria-label={item.title}
                            />
                          ) : (
                            <SoftIcon icon={Icon} className="mt-0.5 size-9 shrink-0 self-start" />
                          )}
                          <div className="min-w-0 flex-1 text-left">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <div>
                                {(() => {
                                  const period = periodOfDay(item.startTime);
                                  return period ? (
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/90">
                                      {period}
                                    </p>
                                  ) : (
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {humanizeItemType(item.type)}
                                    </div>
                                  );
                                })()}
                                <div className="font-medium text-foreground">{item.title}</div>
                              </div>
                              {time ? (
                                <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground/80">
                                  <Clock3 className="size-3" />
                                  {time}
                                </span>
                              ) : null}
                            </div>
                            {blurb ? (
                              <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                                {blurb}
                              </p>
                            ) : null}
                            {locationLabel ? (
                              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="size-3" />
                                {locationLabel}
                              </p>
                            ) : null}
                            {showNotes ? (
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {showNotes}
                              </p>
                            ) : null}
                          </div>
                        </>
                      );
                      return (
                        <li key={`${day.dayNumber}-${idx}-${item.title}`}>
                          {explore ? (
                            <button
                              type="button"
                              onClick={() => openExplore(item)}
                              className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-primary/5 sm:flex-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                              {row}
                            </button>
                          ) : (
                            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row">{row}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </article>
              );
            })
          )}
        </section>

        {/* Package pricing */}
        {quote ? (
          <section className="space-y-4">
            <SectionEyebrow>Your package</SectionEyebrow>
            <div className="overflow-hidden rounded-2xl border glass">
              <div className="flex items-start gap-3 border-b border-white/40 px-5 py-4 dark:border-white/10">
                <SoftIcon icon={Receipt} className="mt-0.5 size-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Package price
                  </p>
                  <h3 className="font-display text-xl font-semibold">
                    {formatCurrency(quote.sellTotal, quote.currency)}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {quote.quoteNumber}
                    {quote.versionLabel ? ` · ${quote.versionLabel}` : ''}
                    {quote.validUntil
                      ? ` · Valid until ${formatDate(quote.validUntil, '—', displayPrefs)}`
                      : ''}
                  </p>
                </div>
              </div>

              {paymentSteps.length > 0 ? (
                <div className="border-b border-white/40 px-5 py-4 dark:border-white/10">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment
                  </p>
                  <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
                    {paymentSteps.map((step, i) => (
                      <div key={`${step.label}-${i}`} className="flex flex-col items-center sm:flex-row sm:gap-3">
                        {i > 0 ? (
                          <ArrowDown className="my-1 size-4 text-muted-foreground/70 sm:hidden" />
                        ) : null}
                        {i > 0 ? (
                          <span className="hidden text-muted-foreground sm:inline">→</span>
                        ) : null}
                        <div className="w-full min-w-[140px] rounded-xl border px-4 py-3 text-center glass-row">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {step.label}
                          </p>
                          {step.percent != null ? (
                            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-primary">
                              {formatPercent(step.percent, 0)}
                            </p>
                          ) : null}
                          {step.amountHint ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">{step.amountHint}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(includeLines.length > 0 || excludeLines.length > 0) && (
                <div className="grid gap-4 border-b border-white/40 px-5 py-4 sm:grid-cols-2 dark:border-white/10">
                  {includeLines.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Includes
                      </p>
                      <ul className="space-y-1.5 text-sm">
                        {includeLines.map((line) => (
                          <li key={line} className="flex gap-2">
                            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {excludeLines.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Not included
                      </p>
                      <ul className="space-y-1.5 text-sm">
                        {excludeLines.map((line) => (
                          <li key={line} className="flex gap-2 text-muted-foreground">
                            <X className="mt-0.5 size-3.5 shrink-0" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="px-5 py-3">
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => setShowDetail((v) => !v)}
                >
                  {showDetail ? 'Hide package detail' : 'Show package detail'}
                </button>
              </div>

              {showDetail ? (
                <div className="overflow-x-auto border-t border-white/40 dark:border-white/10">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-white/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground dark:border-white/10">
                        <th className="px-5 py-2.5 font-semibold">Description</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Unit</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/30 dark:divide-white/10">
                      {quote.items.map((item, i) => (
                        <tr key={`${item.description}-${i}`}>
                          <td className="px-5 py-3 font-medium">{item.description}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                            {formatCurrency(item.unitSell, quote.currency)}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium">
                            {formatCurrency(item.amount, quote.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="space-y-1 border-t border-white/40 px-5 py-3 text-sm dark:border-white/10">
                    {quote.taxTotal ? (
                      <>
                        <div className="flex justify-between text-muted-foreground">
                          <span>
                            {orgTaxTotalsLabelUi(
                              data.taxIdentity ||
                                parseOrgTaxIdentityUi(undefined, {
                                  business: {
                                    gstin: data.contact?.gstin,
                                    placeOfSupply: data.contact?.placeOfSupply,
                                    destinationPlaceOfSupply:
                                      data.contact?.destinationPlaceOfSupply,
                                  },
                                }),
                            )}
                          </span>
                          <span className="tabular-nums">
                            {formatCurrency(quote.taxTotal, quote.currency)}
                          </span>
                        </div>
                        {formatOrgTaxDisplaySplitLinesUi(
                          data.taxIdentity ||
                            parseOrgTaxIdentityUi(undefined, {
                              business: {
                                gstin: data.contact?.gstin,
                                placeOfSupply: data.contact?.placeOfSupply,
                                destinationPlaceOfSupply:
                                  data.contact?.destinationPlaceOfSupply,
                              },
                            }),
                          quote.taxTotal,
                          {
                            formatAmount: (n) =>
                              formatCurrency(n, quote.currency),
                          },
                        ).map((line) => (
                          <div
                            key={line}
                            className="flex justify-between text-xs text-muted-foreground"
                          >
                            <span>{line.split(' ')[0]}</span>
                            <span className="tabular-nums">
                              {line.replace(/^\S+\s+/, '')}
                            </span>
                          </div>
                        ))}
                        {orgTaxDisplaySplitCueUi(
                          data.taxIdentity ||
                            parseOrgTaxIdentityUi(undefined, {
                              business: {
                                gstin: data.contact?.gstin,
                                placeOfSupply: data.contact?.placeOfSupply,
                                destinationPlaceOfSupply:
                                  data.contact?.destinationPlaceOfSupply,
                              },
                            }),
                          quote.taxTotal,
                        ) ? (
                          <p className="text-[11px] text-muted-foreground">
                            {orgTaxDisplaySplitCueUi(
                              data.taxIdentity ||
                                parseOrgTaxIdentityUi(undefined, {
                                  business: {
                                    gstin: data.contact?.gstin,
                                    placeOfSupply: data.contact?.placeOfSupply,
                                    destinationPlaceOfSupply:
                                      data.contact?.destinationPlaceOfSupply,
                                  },
                                }),
                              quote.taxTotal,
                            )}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums text-primary">
                        {formatCurrency(quote.sellTotal, quote.currency)}
                      </span>
                    </div>
                    {formatOrgTaxIdentityLinesUi(
                      data.taxIdentity ||
                        parseOrgTaxIdentityUi(undefined, {
                          business: {
                            gstin: data.contact?.gstin,
                            placeOfSupply: data.contact?.placeOfSupply,
                            destinationPlaceOfSupply:
                              data.contact?.destinationPlaceOfSupply,
                          },
                        }),
                    ).map((line) => (
                      <p key={line} className="text-xs text-muted-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {quote.terms ? (
                <div className="border-t border-white/40 px-5 py-4 text-sm dark:border-white/10">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Terms
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-foreground/85">{quote.terms}</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* CTA */}
        <section className="overflow-hidden rounded-2xl border p-5 text-center glass sm:p-7">
          <SoftIcon icon={Sparkles} className="mx-auto size-10" />
          <h3 className="mt-3 font-display text-xl font-semibold">Ready for your trip?</h3>
          {story?.consultantNote ? (
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {story.consultantNote}
            </p>
          ) : (
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Tell us when you’re ready — we’ll confirm stays and share next steps.
            </p>
          )}
          <p className="mt-3 text-sm font-medium">{agencyName}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-sm">
            {data.contact?.phone ? (
              <a
                href={`https://wa.me/${data.contact.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-emerald-700"
              >
                <MessageCircle className="size-3.5" />
                WhatsApp
              </a>
            ) : null}
            {data.contact?.phone ? (
              <a
                href={`tel:${data.contact.phone}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-sky-700"
              >
                <Phone className="size-3.5" />
                Call
              </a>
            ) : null}
            {data.contact?.supportEmail ? (
              <a
                href={`mailto:${data.contact.supportEmail}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-4 py-2 font-medium text-muted-foreground hover:bg-muted"
              >
                <Mail className="size-3.5" />
                Email
              </a>
            ) : null}
          </div>
          {emergencyPhone ? (
            <div className="mx-auto mt-5 max-w-sm rounded-xl border border-dashed px-4 py-3 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Emergency support · 24×7
              </p>
              <a
                href={`tel:${emergencyPhone}`}
                className="mt-1 inline-flex items-center gap-1.5 font-medium text-foreground"
              >
                <Phone className="size-3.5 text-primary" />
                {emergencyPhone}
              </a>
            </div>
          ) : null}
        </section>

        {cancellationNote ? (
          <section className="space-y-2">
            <SectionEyebrow>Cancellation</SectionEyebrow>
            <div className="rounded-xl border px-4 py-3 text-sm leading-relaxed text-muted-foreground glass">
              {cancellationNote}
            </div>
          </section>
        ) : null}
      </div>

      <footer className="mt-10 space-y-2 border-t border-white/40 pt-6 text-center text-xs text-muted-foreground dark:border-white/10">
        <p>
          Prepared by <span className="font-medium text-foreground">{agencyName}</span>
          {data.version.label || data.version.versionNumber
            ? ` · ${data.version.label || `v${data.version.versionNumber}`}`
            : ''}
          {quote
            ? ` · ${quote.quoteNumber}${quote.versionLabel ? ` ${quote.versionLabel}` : ''}`
            : ''}
        </p>
        <p>
          {footerNote ||
            branding?.previewFooter ||
            'This proposal includes itinerary and quotation for review. Details may change until confirmed.'}
        </p>
      </footer>
    </div>
  );
}
