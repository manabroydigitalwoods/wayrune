/** Agency setup checklist — Quote-ready vs Operate-ready (no new tables). */

export type OnboardingItemKey =
  | 'branding'
  | 'supplier'
  | 'rate'
  | 'quote_template'
  | 'accepted_quote'
  | 'whatsapp'
  | 'hotel_supplier'
  | 'transfer_supplier'
  | 'activity_supplier'
  | 'hotel_rate'
  | 'transfer_rate'
  | 'activity_rate'
  | 'supplier_booking';

export type OnboardingItem = {
  key: OnboardingItemKey;
  label: string;
  detail: string;
  done: boolean;
  href: string;
  /** quote | operate | optional (WhatsApp) */
  track: 'quote' | 'operate' | 'optional';
};

export type OnboardingTrackStatus = {
  items: OnboardingItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  scorePercent: number;
};

const ITEM_META: Record<
  OnboardingItemKey,
  { label: string; detail: string; href: string; track: OnboardingItem['track'] }
> = {
  branding: {
    label: 'Add agency branding',
    detail: 'Logo or brand colour so proposals look like yours.',
    href: '/settings?section=branding',
    track: 'quote',
  },
  supplier: {
    label: 'Add a supplier',
    detail: 'Any hotel, transfer, or activity partner you buy from.',
    href: '/suppliers',
    track: 'quote',
  },
  rate: {
    label: 'Add a negotiated rate',
    detail: 'Hotel chart or transfer fare so quotes can Match buy rates.',
    href: '/rates',
    track: 'quote',
  },
  quote_template: {
    label: 'Create your first quote',
    detail: 'Open a draft trip and start from a Darjeeling or Goa template.',
    href: '/work/quotation-drafts?walkthrough=1',
    track: 'quote',
  },
  accepted_quote: {
    label: 'Accept a quotation',
    detail: 'Close the loop from proposal to booking.',
    href: '/work/quotations',
    track: 'quote',
  },
  whatsapp: {
    label: 'Connect WhatsApp',
    detail: 'Send proposals and payment links from the inbox (optional for Quote-ready).',
    href: '/settings/integrations',
    track: 'optional',
  },
  hotel_supplier: {
    label: 'Hotel supplier with contact',
    detail: 'Hotel/homestay/farmstay with email or phone — required for Ops.',
    href: '/suppliers?type=hotel',
    track: 'operate',
  },
  transfer_supplier: {
    label: 'Transfer supplier with contact',
    detail: 'Car rental or driver with email or phone.',
    href: '/suppliers?type=car_rental',
    track: 'operate',
  },
  activity_supplier: {
    label: 'Activity supplier with contact',
    detail: 'Activity provider or guide with email or phone.',
    href: '/suppliers?type=activity',
    track: 'operate',
  },
  hotel_rate: {
    label: 'Hotel rate chart',
    detail: 'At least one active hotel rate tip.',
    href: '/rates',
    track: 'operate',
  },
  transfer_rate: {
    label: 'Transfer fare',
    detail: 'At least one transfer fare for Match.',
    href: '/rates',
    track: 'operate',
  },
  activity_rate: {
    label: 'Activity rate',
    detail: 'At least one activity rate tip.',
    href: '/rates',
    track: 'operate',
  },
  supplier_booking: {
    label: 'Supplier booking materialized',
    detail: 'Accept a quote that creates at least one booking with a supplier.',
    href: '/work/quotations',
    track: 'operate',
  },
};

function scoreTrack(items: OnboardingItem[]): OnboardingTrackStatus {
  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const scorePercent = total ? Math.round((doneCount / total) * 100) : 0;
  return {
    items,
    doneCount,
    total,
    complete: total > 0 && doneCount === total,
    scorePercent,
  };
}

/** Name + (email or phone) — mirrors web contactCompletenessLabel. */
export function supplierContactComplete(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): boolean {
  if (!input.name?.trim()) return false;
  return Boolean(input.email?.trim() || input.phone?.trim());
}

export type BuildOnboardingStatusInput = {
  hasLogo: boolean;
  hasPrimaryColor: boolean;
  supplierCount: number;
  hotelRateCount: number;
  transferFareCount: number;
  activityRateCount: number;
  quoteTemplateCount: number;
  quotationCount: number;
  acceptedQuoteCount: number;
  whatsappEnabled: boolean;
  /** Contact-complete suppliers by type family. */
  hotelSupplierContactOk: boolean;
  transferSupplierContactOk: boolean;
  activitySupplierContactOk: boolean;
  /** At least one BookingComponent with supplierId. */
  supplierBookingCount: number;
};

/**
 * Dual readiness:
 * - quoteReady: branding · supplier · hotel|transfer rate · quotation (WhatsApp optional)
 * - operateReady: quoteReady core + H/T/A contact-complete suppliers + H/T/A rates + supplier booking
 * Legacy `items` / `complete` = quote track + WhatsApp (backward compatible flat list).
 */
export function buildOnboardingStatus(input: BuildOnboardingStatusInput): {
  items: OnboardingItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  scorePercent: number;
  quoteReady: OnboardingTrackStatus;
  operateReady: OnboardingTrackStatus;
} {
  const branding = Boolean(input.hasLogo || input.hasPrimaryColor);
  const supplier = input.supplierCount > 0;
  const rate = input.hotelRateCount + input.transferFareCount > 0;
  const quote_template = input.quotationCount > 0;
  const accepted_quote = input.acceptedQuoteCount > 0;
  const whatsapp = Boolean(input.whatsappEnabled);

  const flags: Record<OnboardingItemKey, boolean> = {
    branding,
    supplier,
    rate,
    quote_template,
    accepted_quote,
    whatsapp,
    hotel_supplier: input.hotelSupplierContactOk,
    transfer_supplier: input.transferSupplierContactOk,
    activity_supplier: input.activitySupplierContactOk,
    hotel_rate: input.hotelRateCount > 0,
    transfer_rate: input.transferFareCount > 0,
    activity_rate: input.activityRateCount > 0,
    supplier_booking: input.supplierBookingCount > 0,
  };

  const quoteOrder: OnboardingItemKey[] = [
    'branding',
    'supplier',
    'rate',
    'quote_template',
    'accepted_quote',
  ];
  const operateExtra: OnboardingItemKey[] = [
    'hotel_supplier',
    'transfer_supplier',
    'activity_supplier',
    'hotel_rate',
    'transfer_rate',
    'activity_rate',
    'supplier_booking',
  ];

  const toItem = (key: OnboardingItemKey): OnboardingItem => ({
    key,
    ...ITEM_META[key],
    done: flags[key],
  });

  const quoteItems = quoteOrder.map(toItem);
  const operateItems = [...quoteItems, ...operateExtra.map(toItem)];
  const quoteReady = scoreTrack(quoteItems);
  const operateReady = scoreTrack(operateItems);

  // Legacy flat list: quote + optional WhatsApp
  const legacyOrder: OnboardingItemKey[] = [...quoteOrder, 'whatsapp'];
  const items = legacyOrder.map(toItem);
  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const scorePercent = total ? Math.round((doneCount / total) * 100) : 0;

  return {
    items,
    doneCount,
    total,
    complete: doneCount === total,
    scorePercent,
    quoteReady,
    operateReady,
  };
}
