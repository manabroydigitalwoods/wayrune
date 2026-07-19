/** Pure trip control-centre summary — compose bookings + finance + readiness. */

export const NEAR_DEPARTURE_DAYS = 14;

export type TripControlBooking = {
  id: string;
  type: string;
  title: string;
  status: string;
  startAt?: Date | string | null;
  voucherNote?: string | null;
};

export type TripControlFinance = {
  orgCurrency: string;
  quote: {
    sellTotal: number;
    marginAmount: number;
    marginPercent: number;
    currency: string;
  } | null;
  summary: {
    customerDue: number;
    customerPaid: number;
    supplierDue: number;
    supplierPaid: number;
    overdueCount: number;
  };
};

export type TripControlReadiness = {
  items: Array<{ done: boolean }>;
  allDone: boolean;
};

export type TripControlFlag = {
  id: string;
  severity: 'danger' | 'warn' | 'info';
  code: string;
  label: string;
  detail?: string;
  tab: 'operations' | 'finance' | 'quotations' | 'commerce';
  bookingId?: string;
};

export type TripControlSummary = {
  generatedAt: string;
  nearDepartureDays: number;
  daysToStart: number | null;
  counts: {
    openBookings: number;
    confirmedBookings: number;
    vouchersPending: number;
    hotelsOpen: number;
    transfersOpen: number;
    readinessDone: number;
    readinessTotal: number;
    openIncidents: number;
    openChangeCases: number;
  };
  money: {
    currency: string;
    customerDue: number;
    customerPaid: number;
    supplierDue: number;
    supplierPaid: number;
    overdueCount: number;
    marginAmount: number | null;
    marginPercent: number | null;
    sellTotal: number | null;
  };
  flags: TripControlFlag[];
  allClear: boolean;
};

const OPEN_STATUSES = new Set([
  'pending',
  'requested',
  'drafted',
  'required',
  'held',
  'sent',
  'acknowledged',
]);

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysUntil(target: Date | string | null | undefined, now = new Date()): number | null {
  const d = asDate(target);
  if (!d) return null;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((start - today) / 86_400_000);
}

export function isOpenBooking(status: string): boolean {
  return OPEN_STATUSES.has(status) || (status !== 'confirmed' && status !== 'cancelled' && status !== 'rejected');
}

export function buildTripControlSummary(input: {
  tripStartDate?: Date | string | null;
  bookings: TripControlBooking[];
  finance: TripControlFinance;
  readiness: TripControlReadiness;
  openIncidents?: number;
  openChangeCases?: number;
  now?: Date;
}): TripControlSummary {
  const now = input.now ?? new Date();
  const openIncidents = input.openIncidents ?? 0;
  const openChangeCases = input.openChangeCases ?? 0;
  const active = input.bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'rejected');
  const open = active.filter((b) => isOpenBooking(b.status));
  const confirmed = active.filter((b) => b.status === 'confirmed');
  const hotels = active.filter((b) => b.type === 'hotel');
  const transfers = active.filter((b) => b.type === 'transfer');
  const hotelsOpen = hotels.filter((b) => isOpenBooking(b.status));
  const transfersOpen = transfers.filter((b) => isOpenBooking(b.status));
  const vouchersPending = confirmed.filter(
    (b) =>
      (b.type === 'hotel' || b.type === 'transfer' || b.type === 'activity') &&
      !String(b.voucherNote || '').trim(),
  );

  const readinessDone = input.readiness.items.filter((i) => i.done).length;
  const readinessTotal = input.readiness.items.length;

  const daysToStart = daysUntil(input.tripStartDate, now);
  const nearDeparture =
    daysToStart != null && daysToStart >= 0 && daysToStart <= NEAR_DEPARTURE_DAYS;

  const flags: TripControlFlag[] = [];

  for (const b of hotelsOpen) {
    const bookingDays = daysUntil(b.startAt ?? input.tripStartDate, now);
    const urgent =
      nearDeparture ||
      (bookingDays != null && bookingDays >= 0 && bookingDays <= NEAR_DEPARTURE_DAYS);
    flags.push({
      id: `hotel_open_${b.id}`,
      severity: urgent ? 'danger' : 'warn',
      code: 'unconfirmed_hotel',
      label: urgent ? 'Hotel unconfirmed near departure' : 'Hotel enquiry open',
      detail: b.title,
      tab: 'operations',
      bookingId: b.id,
    });
  }

  for (const b of transfersOpen) {
    flags.push({
      id: `transfer_open_${b.id}`,
      severity: nearDeparture ? 'danger' : 'warn',
      code: 'unconfirmed_transfer',
      label: nearDeparture ? 'Transfer unconfirmed near departure' : 'Transfer still open',
      detail: b.title,
      tab: 'operations',
      bookingId: b.id,
    });
  }

  for (const b of vouchersPending) {
    flags.push({
      id: `voucher_${b.id}`,
      severity: nearDeparture ? 'warn' : 'info',
      code: 'voucher_pending',
      label:
        b.type === 'transfer'
          ? 'Transfer voucher note pending'
          : b.type === 'activity'
            ? 'Activity voucher note pending'
            : 'Hotel voucher note pending',
      detail: b.title,
      tab: 'operations',
      bookingId: b.id,
    });
  }

  if (hotels.length > 0 && transfers.length === 0) {
    flags.push({
      id: 'missing_transfer',
      severity: nearDeparture ? 'warn' : 'info',
      code: 'missing_transfer',
      label: 'No transfer booking on this trip',
      detail: 'Add airport / intercity transfers in Operations',
      tab: 'operations',
    });
  }

  if (input.finance.summary.customerDue > 0) {
    flags.push({
      id: 'customer_balance',
      severity:
        input.finance.summary.overdueCount > 0 || nearDeparture ? 'danger' : 'warn',
      code: 'customer_balance_pending',
      label: 'Customer balance outstanding',
      detail: `${input.finance.orgCurrency} ${Math.round(input.finance.summary.customerDue).toLocaleString('en-IN')}`,
      tab: 'finance',
    });
  }

  if (input.finance.summary.overdueCount > 0) {
    flags.push({
      id: 'overdue_payments',
      severity: 'danger',
      code: 'payment_overdue',
      label: `${input.finance.summary.overdueCount} overdue payment${input.finance.summary.overdueCount === 1 ? '' : 's'}`,
      tab: 'finance',
    });
  } else if (input.finance.summary.supplierDue > 0) {
    flags.push({
      id: 'supplier_due',
      severity: nearDeparture ? 'warn' : 'info',
      code: 'supplier_payable_open',
      label: 'Supplier payable outstanding',
      detail: `${input.finance.orgCurrency} ${Math.round(input.finance.summary.supplierDue).toLocaleString('en-IN')}`,
      tab: 'finance',
    });
  }

  if (openIncidents > 0) {
    flags.push({
      id: 'open_incidents',
      severity: 'danger',
      code: 'open_incidents',
      label: `${openIncidents} open incident${openIncidents === 1 ? '' : 's'}`,
      detail: 'Review under Changes & incidents',
      tab: 'commerce',
    });
  }

  if (openChangeCases > 0) {
    flags.push({
      id: 'open_changes',
      severity: 'warn',
      code: 'open_change_cases',
      label: `${openChangeCases} open change case${openChangeCases === 1 ? '' : 's'}`,
      detail: 'Review under Changes & incidents',
      tab: 'commerce',
    });
  }

  if (readinessTotal > 0 && !input.readiness.allDone) {
    flags.push({
      id: 'readiness',
      severity: nearDeparture ? 'warn' : 'info',
      code: 'readiness_incomplete',
      label: `Readiness ${readinessDone}/${readinessTotal}`,
      detail: 'Complete checklist in Operations',
      tab: 'operations',
    });
  }

  if (!input.finance.quote && active.length === 0) {
    flags.push({
      id: 'no_accepted_quote',
      severity: 'info',
      code: 'no_accepted_quote',
      label: 'No accepted quote yet',
      detail: 'Accept a quotation to unlock hotel enquiries',
      tab: 'quotations',
    });
  }

  const currency = input.finance.quote?.currency || input.finance.orgCurrency;

  return {
    generatedAt: now.toISOString(),
    nearDepartureDays: NEAR_DEPARTURE_DAYS,
    daysToStart,
    counts: {
      openBookings: open.length,
      confirmedBookings: confirmed.length,
      vouchersPending: vouchersPending.length,
      hotelsOpen: hotelsOpen.length,
      transfersOpen: transfersOpen.length,
      readinessDone,
      readinessTotal,
      openIncidents,
      openChangeCases,
    },
    money: {
      currency,
      customerDue: input.finance.summary.customerDue,
      customerPaid: input.finance.summary.customerPaid,
      supplierDue: input.finance.summary.supplierDue,
      supplierPaid: input.finance.summary.supplierPaid,
      overdueCount: input.finance.summary.overdueCount,
      marginAmount: input.finance.quote?.marginAmount ?? null,
      marginPercent: input.finance.quote?.marginPercent ?? null,
      sellTotal: input.finance.quote?.sellTotal ?? null,
    },
    flags,
    allClear: flags.every((f) => f.severity === 'info'),
  };
}
