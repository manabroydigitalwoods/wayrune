/**
 * Ranked “Next action” from trip control flags — post-accept operate-through cue.
 * Pure helper; no workflow engine.
 */

import {
  recommendedTabForTripStatus,
  type TripWorkspaceTab,
} from './tripWorkspaceTabs';

export type TripNextActionFlag = {
  id: string;
  severity: 'danger' | 'warn' | 'info';
  code: string;
  label: string;
  detail?: string;
  tab: 'operations' | 'finance' | 'quotations' | 'commerce';
  bookingId?: string;
};

export type TripNextAction = {
  flag: TripNextActionFlag | null;
  /** Primary button label. */
  ctaLabel: string;
  /** Short strip headline (usually flag.label). */
  title: string;
  /** Optional secondary line. */
  detail: string | null;
  tab: TripWorkspaceTab;
  bookingId: string | null;
  moreCount: number;
  /** True when strip should show a calm all-clear (no flags). */
  allClear: boolean;
};

const SEVERITY_RANK: Record<TripNextActionFlag['severity'], number> = {
  danger: 0,
  warn: 1,
  info: 2,
};

/** Lower = earlier within the same severity. */
const CODE_PRIORITY: Record<string, number> = {
  payment_overdue: 10,
  credit_limit_exceeded: 20,
  open_incidents: 30,
  unconfirmed_hotel: 40,
  unconfirmed_transfer: 50,
  unconfirmed_activity: 60,
  missing_customer_instalments: 65,
  customer_balance_pending: 70,
  open_cancellation_cases: 80,
  open_change_cases: 90,
  voucher_pending: 100,
  readiness_incomplete: 110,
  missing_transfer: 120,
  supplier_payable_open: 130,
  no_accepted_quote: 140,
};

function codeRank(code: string): number {
  return CODE_PRIORITY[code] ?? 500;
}

export function ctaLabelForTripFlag(flag: TripNextActionFlag): string {
  switch (flag.code) {
    case 'unconfirmed_hotel':
      return 'Open hotel enquiry';
    case 'unconfirmed_transfer':
      return 'Open transfer';
    case 'unconfirmed_activity':
      return 'Open activity';
    case 'voucher_pending':
      return 'Add voucher note';
    case 'missing_transfer':
      return 'Add transfer';
    case 'missing_customer_instalments':
      return 'Schedule instalments';
    case 'credit_limit_exceeded':
      return 'Review credit';
    case 'customer_balance_pending':
      return 'Collect balance';
    case 'payment_overdue':
      return 'Chase overdue';
    case 'supplier_payable_open':
      return 'Review payables';
    case 'open_incidents':
      return 'Review incidents';
    case 'open_change_cases':
      return 'Review changes';
    case 'open_cancellation_cases':
      return 'Review cancellations';
    case 'readiness_incomplete':
      return 'Complete readiness';
    case 'no_accepted_quote':
      return 'Open quotations';
    default:
      return flag.tab === 'finance'
        ? 'Open finance'
        : flag.tab === 'commerce'
          ? 'Open changes'
          : flag.tab === 'quotations'
            ? 'Open quotations'
            : 'Open operations';
  }
}

function statusFallbackCta(tab: TripWorkspaceTab): string {
  switch (tab) {
    case 'quotations':
      return 'Open quotations';
    case 'operations':
      return 'Open operations';
    case 'finance':
      return 'Open finance';
    case 'itinerary':
      return 'Open itinerary';
    default:
      return 'Open overview';
  }
}

function statusFallbackTitle(tab: TripWorkspaceTab, tripStatus: string): string {
  switch (tab) {
    case 'quotations':
      return tripStatus === 'quoted' || tripStatus === 'awaiting_approval'
        ? 'Continue quoting'
        : 'Review quotations';
    case 'operations':
      return 'Continue in operations';
    case 'finance':
      return 'Review collections';
    case 'itinerary':
      return 'Build the itinerary';
    default:
      return 'Continue this trip';
  }
}

/** Pick the single highest-leverage next action from control flags. */
export function pickPrimaryTripNextAction(input: {
  flags: readonly TripNextActionFlag[];
  tripStatus: string;
  activeTab?: string;
}): TripNextAction {
  const flags = [...input.flags];
  if (!flags.length) {
    const tab = recommendedTabForTripStatus(input.tripStatus);
    return {
      flag: null,
      ctaLabel: statusFallbackCta(tab),
      title: statusFallbackTitle(tab, input.tripStatus),
      detail: null,
      tab,
      bookingId: null,
      moreCount: 0,
      allClear: true,
    };
  }

  flags.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    const code = codeRank(a.code) - codeRank(b.code);
    if (code !== 0) return code;
    return a.id.localeCompare(b.id);
  });

  const primary = flags[0]!;
  const moreCount = Math.max(0, flags.length - 1);
  const tab = primary.tab as TripWorkspaceTab;
  const onThisTab = input.activeTab === tab;
  let ctaLabel = ctaLabelForTripFlag(primary);
  if (onThisTab && primary.bookingId) {
    ctaLabel = 'Focus booking';
  } else if (onThisTab) {
    ctaLabel = 'On this tab';
  }

  return {
    flag: primary,
    ctaLabel,
    title: primary.label,
    detail: primary.detail?.trim() || null,
    tab,
    bookingId: primary.bookingId?.trim() || null,
    moreCount,
    allClear: false,
  };
}
