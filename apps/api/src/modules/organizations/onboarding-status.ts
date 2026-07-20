/** Agency setup checklist — computed from existing org data (no new tables). */

export type OnboardingItemKey =
  | 'branding'
  | 'supplier'
  | 'rate'
  | 'quote_template'
  | 'accepted_quote'
  | 'whatsapp';

export type OnboardingItem = {
  key: OnboardingItemKey;
  label: string;
  detail: string;
  done: boolean;
  href: string;
};

const ITEM_META: Record<
  OnboardingItemKey,
  { label: string; detail: string; href: string }
> = {
  branding: {
    label: 'Add agency branding',
    detail: 'Logo or brand colour so proposals look like yours.',
    href: '/settings?section=branding',
  },
  supplier: {
    label: 'Add a supplier',
    detail: 'Hotels, fleet, or activity partners you buy from.',
    href: '/suppliers',
  },
  rate: {
    label: 'Add a negotiated rate',
    detail: 'Hotel chart, transfer fare, or CSV/XLSX import so quotes can Match buy rates.',
    href: '/rates',
  },
  quote_template: {
    label: 'Create your first quote',
    detail: 'Open a draft trip and start from a Darjeeling or Goa template.',
    href: '/work/quotation-drafts?walkthrough=1',
  },
  accepted_quote: {
    label: 'Accept a quotation',
    detail: 'Close the loop from proposal to booking.',
    href: '/work/quotations',
  },
  whatsapp: {
    label: 'Connect WhatsApp',
    detail: 'Send proposals and payment links from the inbox.',
    href: '/settings/integrations',
  },
};

export function buildOnboardingStatus(input: {
  hasLogo: boolean;
  hasPrimaryColor: boolean;
  supplierCount: number;
  hotelRateCount: number;
  transferFareCount: number;
  quoteTemplateCount: number;
  /** True when the org has created at least one quotation (not merely templates). */
  quotationCount: number;
  acceptedQuoteCount: number;
  whatsappEnabled: boolean;
}): {
  items: OnboardingItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  scorePercent: number;
} {
  const flags: Record<OnboardingItemKey, boolean> = {
    branding: Boolean(input.hasLogo || input.hasPrimaryColor),
    supplier: input.supplierCount > 0,
    rate: input.hotelRateCount + input.transferFareCount > 0,
    quote_template: input.quotationCount > 0,
    accepted_quote: input.acceptedQuoteCount > 0,
    whatsapp: Boolean(input.whatsappEnabled),
  };

  const order: OnboardingItemKey[] = [
    'branding',
    'supplier',
    'rate',
    'quote_template',
    'accepted_quote',
    'whatsapp',
  ];

  const items = order.map((key) => ({
    key,
    ...ITEM_META[key],
    done: flags[key],
  }));

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const scorePercent = total ? Math.round((doneCount / total) * 100) : 0;

  return {
    items,
    doneCount,
    total,
    complete: doneCount === total,
    scorePercent,
  };
}
