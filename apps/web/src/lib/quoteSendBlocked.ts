/**
 * Structured Send readiness gates — same rules as quoteSendBlockedReason,
 * exposed as checklist items for staff UX.
 */

export type QuoteSendBlockedItemId =
  | 'status'
  | 'services'
  | 'sell'
  | 'cost'
  | 'margin'
  | 'rate_drift'
  | 'allotment'
  | 'capacity'
  | 'min_stay'
  | 'max_stay'
  | 'stop_sale'
  | 'fx'
  | 'validity'
  | 'travellers';

export type QuoteSendBlockedItem = {
  id: QuoteSendBlockedItemId;
  label: string;
  ok: boolean;
};

export type QuoteSendBlockedInput = {
  itemCount: number;
  missingSellCount: number;
  missingCostCount: number;
  marginGateCount: number;
  rateDriftCount?: number;
  allotmentBlockCount?: number;
  capacityBlockCount?: number;
  minStayBlockCount?: number;
  maxStayBlockCount?: number;
  stopSaleBlockCount?: number;
  fxMissing?: boolean;
  quoteCurrency?: string;
  orgCurrency?: string;
  minMarginPercent: number;
  canViewCost: boolean;
  hasValidUntil: boolean;
  validUntilExpired?: boolean;
  validUntilBlocksSend?: boolean;
  travellerCount: number;
  statusAllowsSend: boolean;
};

/** Checklist rows for Send readiness (always lists applicable gates). */
export function quoteSendBlockedItems(
  input: QuoteSendBlockedInput,
): QuoteSendBlockedItem[] {
  const items: QuoteSendBlockedItem[] = [];

  if (!input.statusAllowsSend) {
    items.push({
      id: 'status',
      label: 'This version cannot be sent yet',
      ok: false,
    });
    return items;
  }

  items.push({
    id: 'services',
    label:
      input.itemCount === 0
        ? 'Add at least one commercial service'
        : `${input.itemCount} service${input.itemCount === 1 ? '' : 's'} on the quote`,
    ok: input.itemCount > 0,
  });

  if (input.itemCount > 0) {
    items.push({
      id: 'sell',
      label:
        input.missingSellCount > 0
          ? `${input.missingSellCount} service${input.missingSellCount === 1 ? '' : 's'} missing sell price`
          : 'All services have sell prices',
      ok: input.missingSellCount === 0,
    });
  }

  if (input.canViewCost && input.itemCount > 0) {
    items.push({
      id: 'cost',
      label:
        input.missingCostCount > 0
          ? `${input.missingCostCount} buy rate${input.missingCostCount === 1 ? '' : 's'} missing`
          : 'Buy rates complete',
      ok: input.missingCostCount === 0,
    });
    items.push({
      id: 'margin',
      label:
        input.marginGateCount > 0
          ? input.minMarginPercent > 0
            ? `${input.marginGateCount} below-margin service${input.marginGateCount === 1 ? '' : 's'}`
            : `${input.marginGateCount} negative-margin service${input.marginGateCount === 1 ? '' : 's'}`
          : 'Margin policy met',
      ok: input.marginGateCount === 0,
    });
  }

  if ((input.rateDriftCount ?? 0) > 0) {
    items.push({
      id: 'rate_drift',
      label: `${input.rateDriftCount} rate chart change${input.rateDriftCount === 1 ? '' : 's'} to rematch or acknowledge`,
      ok: false,
    });
  }
  if ((input.allotmentBlockCount ?? 0) > 0) {
    items.push({
      id: 'allotment',
      label: `${input.allotmentBlockCount} allotment shortfall${input.allotmentBlockCount === 1 ? '' : 's'}`,
      ok: false,
    });
  }
  if ((input.capacityBlockCount ?? 0) > 0) {
    items.push({
      id: 'capacity',
      label: `${input.capacityBlockCount} capacity shortfall${input.capacityBlockCount === 1 ? '' : 's'}`,
      ok: false,
    });
  }
  if ((input.minStayBlockCount ?? 0) > 0) {
    items.push({
      id: 'min_stay',
      label: `${input.minStayBlockCount} min-stay shortfall${input.minStayBlockCount === 1 ? '' : 's'}`,
      ok: false,
    });
  }
  if ((input.maxStayBlockCount ?? 0) > 0) {
    items.push({
      id: 'max_stay',
      label: `${input.maxStayBlockCount} max-stay overage${input.maxStayBlockCount === 1 ? '' : 's'}`,
      ok: false,
    });
  }
  if ((input.stopSaleBlockCount ?? 0) > 0) {
    items.push({
      id: 'stop_sale',
      label: `${input.stopSaleBlockCount} stop-sale block${input.stopSaleBlockCount === 1 ? '' : 's'}`,
      ok: false,
    });
  }
  if (input.fxMissing) {
    items.push({
      id: 'fx',
      label: `FX lock needed for ${input.quoteCurrency || 'foreign currency'}`,
      ok: false,
    });
  }

  items.push({
    id: 'validity',
    label: !input.hasValidUntil
      ? 'Set a validity date'
      : input.validUntilBlocksSend
        ? 'Refresh validity (expired past grace)'
        : 'Validity date set',
    ok: input.hasValidUntil && !input.validUntilBlocksSend,
  });

  items.push({
    id: 'travellers',
    label:
      input.travellerCount <= 0
        ? 'Add at least one traveller'
        : `${input.travellerCount} traveller${input.travellerCount === 1 ? '' : 's'} on the trip`,
    ok: input.travellerCount > 0,
  });

  return items;
}

/** Human-readable reason Send must stay disabled (empty = ready). */
export function quoteSendBlockedReason(input: QuoteSendBlockedInput): string {
  if (!input.statusAllowsSend) {
    return 'This version cannot be sent yet';
  }
  if (input.itemCount === 0) {
    return 'Add at least one commercial service before sending';
  }
  const failing = quoteSendBlockedItems(input).filter((i) => !i.ok);
  // Drop the OK services row from the prose list — only missing gates.
  const parts = failing
    .filter((i) => i.id !== 'services' || input.itemCount === 0)
    .map((i) => {
      switch (i.id) {
        case 'sell':
          return `${input.missingSellCount} service price${input.missingSellCount === 1 ? '' : 's'}`;
        case 'cost':
          return `${input.missingCostCount} buy rate${input.missingCostCount === 1 ? '' : 's'}`;
        case 'margin':
          return input.minMarginPercent > 0
            ? `${input.marginGateCount} below-margin service${input.marginGateCount === 1 ? '' : 's'}`
            : `${input.marginGateCount} negative-margin service${input.marginGateCount === 1 ? '' : 's'}`;
        case 'rate_drift':
          return `${input.rateDriftCount} rate chart change${input.rateDriftCount === 1 ? '' : 's'} to rematch or acknowledge`;
        case 'allotment':
          return `${input.allotmentBlockCount} allotment shortfall${input.allotmentBlockCount === 1 ? '' : 's'} (reduce rooms or change property)`;
        case 'capacity':
          return `${input.capacityBlockCount} capacity shortfall${input.capacityBlockCount === 1 ? '' : 's'} (add vehicles or reduce party)`;
        case 'min_stay':
          return `${input.minStayBlockCount} min-stay shortfall${input.minStayBlockCount === 1 ? '' : 's'} (extend nights or acknowledge)`;
        case 'max_stay':
          return `${input.maxStayBlockCount} max-stay overage${input.maxStayBlockCount === 1 ? '' : 's'} (shorten nights or acknowledge)`;
        case 'stop_sale':
          return `${input.stopSaleBlockCount} stop-sale block${input.stopSaleBlockCount === 1 ? '' : 's'} (change dates or supplier)`;
        case 'fx':
          return `an FX lock for ${input.quoteCurrency || 'foreign currency'} (org books in ${input.orgCurrency || 'INR'})`;
        case 'validity':
          return !input.hasValidUntil
            ? 'a validity date'
            : 'a fresh validity date (expired past grace)';
        case 'travellers':
          return 'at least one traveller';
        case 'services':
          return 'at least one commercial service';
        default:
          return i.label;
      }
    });
  if (!parts.length) return '';
  if (parts.length === 1) return `Complete ${parts[0]} before sending`;
  if (parts.length === 2) return `Complete ${parts[0]} and ${parts[1]} before sending`;
  return `Complete ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]} before sending`;
}
