import type { APIRequestContext } from '@playwright/test';
import { API_BASE, E2E_OWNER, E2E_USER } from './auth';

const DEMO_HOTEL_NAME = '[Demo] Heritage boutique hotel';
const FIT_PACK_ID = 'fit_templates_v1';

async function ownerLogin(request: APIRequestContext) {
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email: E2E_OWNER.email, password: E2E_OWNER.password },
  });
  if (!login.ok()) {
    throw new Error(`Owner login failed: ${login.status()} ${await login.text()}`);
  }
}

async function salesLogin(request: APIRequestContext) {
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email: E2E_USER.email, password: E2E_USER.password },
  });
  if (!login.ok()) {
    throw new Error(`Sales login failed: ${login.status()} ${await login.text()}`);
  }
}

/**
 * Ensure ≥2 active hotel rates for Match "Other eligible rates" / keep-markup.
 * Line room is "Deluxe mountain view" · CP. Replace-demo deactivates tips.
 */
export async function ensureSecondDemoHotelAlt(
  request: APIRequestContext,
): Promise<{ supplierId: string; altRateId: string | null }> {
  await ownerLogin(request);

  const suppliers = await request.get(`${API_BASE}/suppliers?q=Demo`);
  if (!suppliers.ok()) {
    throw new Error(`List suppliers failed: ${suppliers.status()}`);
  }
  const raw = await suppliers.json();
  const list = (
    Array.isArray(raw) ? raw : raw?.items || []
  ) as Array<{ id: string; name?: string }>;
  const hotel =
    list.find((s) => s.name === DEMO_HOTEL_NAME) ||
    list.find((s) => /\[Demo\].*hotel/i.test(s.name || ''));
  if (!hotel) {
    throw new Error(
      'Demo hotel supplier missing — install FIT pack / demo operate before beat-match-keep-markup',
    );
  }

  const roomType = 'Deluxe mountain view';
  const mealPlan = 'CP';

  async function listRates() {
    const ratesRes = await request.get(
      `${API_BASE}/hotel-rates?supplierId=${encodeURIComponent(hotel!.id)}`,
    );
    if (!ratesRes.ok()) {
      throw new Error(`List hotel rates failed: ${ratesRes.status()}`);
    }
    const ratesRaw = await ratesRes.json();
    return (
      Array.isArray(ratesRaw) ? ratesRaw : ratesRaw?.items || []
    ) as Array<{
      id: string;
      roomType?: string | null;
      mealPlan?: string | null;
      isActive?: boolean;
      unitCost?: number | string;
      occupancyPricingJson?: { placeOfSupply?: string | null } | null;
    }>;
  }

  const isTarget = (r: {
    roomType?: string | null;
    mealPlan?: string | null;
  }) =>
    (r.roomType || '').trim().toLowerCase() === roomType.toLowerCase() &&
    (r.mealPlan || 'CP').toUpperCase() === mealPlan;

  let rates = await listRates();
  let targets = rates.filter(isTarget);

  // Activate existing mountain-view tips (null POS + KA POS do not overlap).
  for (const r of targets) {
    if (r.isActive !== false) continue;
    const patch = await request.patch(`${API_BASE}/hotel-rates/${r.id}`, {
      data: { isActive: true },
    });
    if (!patch.ok()) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ensureSecondDemoHotelAlt] activate ${r.id} → ${patch.status()}`,
      );
    }
  }

  rates = await listRates();
  targets = rates.filter((r) => isTarget(r) && r.isActive !== false);

  const specs: Array<{ placeOfSupply: string | null; unitCost: number }> = [
    { placeOfSupply: null, unitCost: 4500 },
    { placeOfSupply: 'KA', unitCost: 4850 },
  ];
  for (const spec of specs) {
    if (targets.length >= 2) break;
    const has = targets.some((r) => {
      const pos = r.occupancyPricingJson?.placeOfSupply || null;
      return (pos || null) === spec.placeOfSupply;
    });
    if (has) continue;
    const create = await request.post(`${API_BASE}/hotel-rates`, {
      data: {
        supplierId: hotel.id,
        roomType,
        mealPlan,
        unitCost: spec.unitCost,
        currency: 'INR',
        isActive: true,
        occupancyPricing: spec.placeOfSupply
          ? { placeOfSupply: spec.placeOfSupply }
          : null,
      },
    });
    if (!create.ok()) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ensureSecondDemoHotelAlt] create POS=${spec.placeOfSupply} → ${create.status()} ${await create.text()}`,
      );
      continue;
    }
    rates = await listRates();
    targets = rates.filter((r) => isTarget(r) && r.isActive !== false);
  }

  if (targets.length < 2) {
    throw new Error(
      `Need ≥2 active "${roomType}" · ${mealPlan} rates for keep-markup; have ${targets.length}`,
    );
  }

  // Prove resolve returns alternatives before UI (same supplier + room + meal).
  const probe = await request.post(`${API_BASE}/rates/resolve`, {
    data: {
      alternativesLimit: 3,
      items: [
        {
          itemId: 'e2e-keep-markup-probe',
          type: 'hotel',
          details: {
            supplierId: hotel.id,
            roomType,
            mealPlan,
            checkIn: '2026-09-03',
            checkOut: '2026-09-05',
            nights: 2,
            rooms: 1,
          },
        },
      ],
    },
  });
  if (!probe.ok()) {
    throw new Error(
      `rates/resolve probe failed: ${probe.status()} ${await probe.text()}`,
    );
  }
  const probeBody = (await probe.json()) as {
    items?: Array<{
      matched?: boolean;
      rateMeta?: { alternatives?: unknown[] };
    }>;
  };
  const alts = probeBody.items?.[0]?.rateMeta?.alternatives;
  if (!probeBody.items?.[0]?.matched || !Array.isArray(alts) || alts.length < 1) {
    throw new Error(
      `keep-markup resolve probe: matched=${probeBody.items?.[0]?.matched} alts=${Array.isArray(alts) ? alts.length : 0}`,
    );
  }

  return {
    supplierId: hotel.id,
    altRateId: targets[1]?.id ?? null,
  };
}

/** Soft-archive demo operate suppliers (owner). */
export async function apiReplaceDemoOperate(
  request: APIRequestContext,
): Promise<{
  softDeletedSuppliers: number;
  templatesStripped: number;
}> {
  await ownerLogin(request);
  const res = await request.post(`${API_BASE}/organizations/demo-operate/replace`);
  if (!res.ok()) {
    throw new Error(`Replace demo failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    softDeletedSuppliers?: number;
    templatesStripped?: number;
  };
  return {
    softDeletedSuppliers: body.softDeletedSuppliers ?? 0,
    templatesStripped: body.templatesStripped ?? 0,
  };
}

/** Import supplier CSV rows (owner). */
export async function apiImportSuppliersCsv(
  request: APIRequestContext,
  rows: Array<{
    name: string;
    type?: string;
    email?: string;
    phone?: string;
  }>,
): Promise<{ imported: number; skipped: number }> {
  await ownerLogin(request);
  const res = await request.post(`${API_BASE}/suppliers/import/csv`, {
    data: { rows },
  });
  if (!res.ok()) {
    throw new Error(
      `Supplier CSV import failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { imported?: number; skipped?: number };
  return { imported: body.imported ?? 0, skipped: body.skipped ?? 0 };
}

/** Import hotel rate CSV rows (owner). Must pass commit: true to create tips. */
export async function apiImportHotelRatesCsv(
  request: APIRequestContext,
  rows: Array<{
    supplierName?: string | null;
    placeName?: string | null;
    placeKey?: string | null;
    roomType?: string | null;
    mealPlan?: string | null;
    unitCost?: number;
    currency?: string;
    startDate?: string | null;
    endDate?: string | null;
  }>,
): Promise<{ okCount: number; skipCount: number; results: unknown[] }> {
  await ownerLogin(request);
  const res = await request.post(`${API_BASE}/hotel-rates/import/csv`, {
    data: {
      commit: true,
      fileName: 'beat-replace-hotel-rates.csv',
      rows,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `Hotel rate CSV import failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    okCount?: number;
    skipCount?: number;
    results?: unknown[];
  };
  return {
    okCount: body.okCount ?? 0,
    skipCount: body.skipCount ?? 0,
    results: body.results ?? [],
  };
}

/** Import transfer fare CSV rows (owner). Must pass commit: true. */
export async function apiImportTransferFaresCsv(
  request: APIRequestContext,
  rows: Array<{
    supplierName?: string | null;
    fromPlace?: string | null;
    toPlace?: string | null;
    vehicleType?: string | null;
    unitCost?: number;
    currency?: string;
    startDate?: string | null;
    endDate?: string | null;
  }>,
): Promise<{ okCount: number; skipCount: number; results: unknown[] }> {
  await ownerLogin(request);
  const res = await request.post(`${API_BASE}/transfer-fares/import/csv`, {
    data: {
      commit: true,
      fileName: 'beat-onboarding-transfer-fares.csv',
      rows,
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    okCount?: number;
    skipCount?: number;
    results?: unknown[];
    detail?: string;
  };
  if (!res.ok()) {
    throw new Error(
      `Transfer fare CSV import failed: ${res.status()} ${JSON.stringify(body)}`,
    );
  }
  return {
    okCount: body.okCount ?? 0,
    skipCount: body.skipCount ?? 0,
    results: body.results ?? [],
  };
}

export type OnboardingStatusDto = {
  scorePercent?: number;
  quoteReady?: {
    scorePercent: number;
    doneCount: number;
    total: number;
    complete: boolean;
    items?: Array<{ key: string; done: boolean; label: string }>;
  };
  operateReady?: {
    scorePercent: number;
    doneCount: number;
    total: number;
    complete: boolean;
    items?: Array<{ key: string; done: boolean; label: string }>;
  };
};

export async function apiGetOnboardingStatus(
  request: APIRequestContext,
): Promise<OnboardingStatusDto> {
  await ownerLogin(request);
  const res = await request.get(`${API_BASE}/organizations/onboarding-status`);
  if (!res.ok()) {
    throw new Error(
      `onboarding-status failed: ${res.status()} ${await res.text()}`,
    );
  }
  return (await res.json()) as OnboardingStatusDto;
}

/** Re-install FIT pack so demo operate suppliers return after replace-demo proof. */
export async function apiRestoreDemoOperatePack(
  request: APIRequestContext,
): Promise<void> {
  await ownerLogin(request);
  const install = await request.post(
    `${API_BASE}/organizations/starter-packs/${FIT_PACK_ID}/install`,
  );
  if (!install.ok() && install.status() !== 409) {
    // eslint-disable-next-line no-console
    console.warn(
      `FIT pack reinstall returned ${install.status()}: ${await install.text()}`,
    );
  }
}

/**
 * Ensure the trip has an editable draft tip (revise from accepted if needed).
 * Returns tip + quotation ids for deep-link URL.
 */
export async function ensureEditableDraftQuote(
  request: APIRequestContext,
  tripId: string,
): Promise<{
  quotationId: string;
  versionId: string;
  status: string;
  resumed?: boolean;
}> {
  await ownerLogin(request);
  const trip = await request.get(`${API_BASE}/trips/${tripId}`);
  if (!trip.ok()) {
    throw new Error(`GET trip failed: ${trip.status()}`);
  }
  const body = (await trip.json()) as {
    quotations?: Array<{
      id: string;
      versions?: Array<{ id: string; status: string }>;
    }>;
  };
  const quotations = body.quotations || [];
  for (const q of quotations) {
    const draft = (q.versions || []).find((v) =>
      ['draft', 'pending_approval'].includes(v.status),
    );
    if (draft) {
      return {
        quotationId: q.id,
        versionId: draft.id,
        status: draft.status,
      };
    }
  }

  const hasAccepted = quotations.some((q) =>
    (q.versions || []).some((v) => v.status === 'accepted'),
  );
  if (hasAccepted) {
    const revise = await request.post(
      `${API_BASE}/trips/${tripId}/quotations/from-accepted`,
    );
    if (!revise.ok()) {
      throw new Error(
        `from-accepted failed: ${revise.status()} ${await revise.text()}`,
      );
    }
    const created = (await revise.json()) as {
      id: string;
      resumed?: boolean;
      versions?: Array<{ id: string; status: string }>;
    };
    const tip =
      (created.versions || []).find((v) =>
        ['draft', 'pending_approval'].includes(v.status),
      ) || (created.versions || [])[0];
    if (!tip) {
      throw new Error('from-accepted returned no draft version');
    }
    return {
      quotationId: created.id,
      versionId: tip.id,
      status: tip.status,
      resumed: created.resumed,
    };
  }

  const create = await request.post(`${API_BASE}/trips/${tripId}/quotations`);
  if (!create.ok()) {
    throw new Error(
      `create quotation failed: ${create.status()} ${await create.text()}`,
    );
  }
  const created = (await create.json()) as {
    id: string;
    versions?: Array<{ id: string; status: string }>;
  };
  const tip = (created.versions || [])[0];
  if (!tip) throw new Error('create quotation returned no version');
  return {
    quotationId: created.id,
    versionId: tip.id,
    status: tip.status,
  };
}

/**
 * Stamp check-in/out on hotel lines so Match is enabled (revision drafts often lack dates).
 */
export async function ensureHotelStayDatesOnDraft(
  request: APIRequestContext,
  tripId: string,
  quotationId: string,
  versionId: string,
): Promise<void> {
  await ownerLogin(request);
  const trip = await request.get(`${API_BASE}/trips/${tripId}`);
  if (!trip.ok()) throw new Error(`GET trip failed: ${trip.status()}`);
  const tripBody = (await trip.json()) as {
    startDate?: string | null;
    endDate?: string | null;
    quotations?: Array<{
      id: string;
      versions?: Array<{
        id: string;
        status: string;
        currency?: string;
        label?: string | null;
        itemsJson?: unknown;
        inclusions?: string | null;
        exclusions?: string | null;
        terms?: string | null;
        discountTotal?: number | string | null;
      }>;
    }>;
  };

  const start =
    (tripBody.startDate || '').slice(0, 10) || '2026-09-03';
  // +2 nights default when end missing
  const endRaw = (tripBody.endDate || '').slice(0, 10);
  let checkOut = endRaw;
  if (!checkOut) {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 2);
    checkOut = d.toISOString().slice(0, 10);
  }

  const quotation = (tripBody.quotations || []).find((q) => q.id === quotationId);
  const version =
    (quotation?.versions || []).find((v) => v.id === versionId) ||
    (quotation?.versions || [])[0];
  if (!version) throw new Error('Draft version not found for stay-date stamp');

  const items = Array.isArray(version.itemsJson)
    ? (version.itemsJson as Array<Record<string, unknown>>)
    : [];
  const nextItems = items.map((item) => {
    const serviceType = String(item.serviceType || item.rateKind || '');
    if (serviceType !== 'hotel' && serviceType !== 'homestay' && serviceType !== 'farmstay') {
      return item;
    }
    const details = {
      ...((item.details as Record<string, unknown>) || {}),
    };
    if (!details.checkIn) details.checkIn = start;
    if (!details.checkOut) details.checkOut = checkOut;
    if (details.nights == null) {
      const a = new Date(`${String(details.checkIn)}T12:00:00Z`);
      const b = new Date(`${String(details.checkOut)}T12:00:00Z`);
      details.nights = Math.max(
        1,
        Math.round((b.getTime() - a.getTime()) / 86400000),
      );
    }
    return { ...item, details };
  });

  const save = await request.post(
    `${API_BASE}/trips/${tripId}/quotations/${quotationId}/versions/autosave`,
    {
      data: {
        versionId,
        currency: version.currency || 'INR',
        label: version.label || undefined,
        items: nextItems,
        inclusions: version.inclusions ?? undefined,
        exclusions: version.exclusions ?? undefined,
        terms: version.terms ?? undefined,
        discountTotal: Number(version.discountTotal) || 0,
      },
    },
  );
  if (!save.ok()) {
    throw new Error(
      `autosave stay dates failed: ${save.status()} ${await save.text()}`,
    );
  }
}

/**
 * Point hotel lines at an imported (non-demo) supplier + room/meal so Match
 * resolves real rates after Replace (lines still hold soft-deleted demo supplierId).
 */
export async function pointHotelLineAtSupplier(
  request: APIRequestContext,
  tripId: string,
  quotationId: string,
  versionId: string,
  opts: {
    supplierName: string;
    roomType?: string;
    mealPlan?: string;
    placeName?: string;
  },
): Promise<{ supplierId: string }> {
  await ownerLogin(request);
  const listRes = await request.get(
    `${API_BASE}/suppliers?q=${encodeURIComponent(opts.supplierName)}`,
  );
  if (!listRes.ok()) {
    throw new Error(`List suppliers failed: ${listRes.status()}`);
  }
  const listRaw = await listRes.json();
  const list = (
    Array.isArray(listRaw) ? listRaw : listRaw?.items || []
  ) as Array<{ id: string; name?: string }>;
  const supplier = list.find((s) => s.name === opts.supplierName) || list[0];
  if (!supplier?.id) {
    throw new Error(`Supplier not found for Match: ${opts.supplierName}`);
  }

  const trip = await request.get(`${API_BASE}/trips/${tripId}`);
  if (!trip.ok()) throw new Error(`GET trip failed: ${trip.status()}`);
  const tripBody = (await trip.json()) as {
    quotations?: Array<{
      id: string;
      versions?: Array<{
        id: string;
        currency?: string;
        label?: string | null;
        itemsJson?: unknown;
        inclusions?: string | null;
        exclusions?: string | null;
        terms?: string | null;
        discountTotal?: number | string | null;
      }>;
    }>;
  };
  const quotation = (tripBody.quotations || []).find((q) => q.id === quotationId);
  const version =
    (quotation?.versions || []).find((v) => v.id === versionId) ||
    (quotation?.versions || [])[0];
  if (!version) throw new Error('Draft version not found for supplier stamp');

  const roomType = opts.roomType || 'Deluxe mountain view';
  const mealPlan = opts.mealPlan || 'CP';
  const placeName = opts.placeName || 'Darjeeling';
  const items = Array.isArray(version.itemsJson)
    ? (version.itemsJson as Array<Record<string, unknown>>)
    : [];
  const nextItems = items.map((item) => {
    const serviceType = String(item.serviceType || item.rateKind || '');
    if (serviceType !== 'hotel' && serviceType !== 'homestay' && serviceType !== 'farmstay') {
      return item;
    }
    const details = {
      ...((item.details as Record<string, unknown>) || {}),
      supplierId: supplier.id,
      supplierName: opts.supplierName,
      propertyName: opts.supplierName,
      roomType,
      mealPlan,
      placeName,
    };
    return { ...item, details };
  });

  const save = await request.post(
    `${API_BASE}/trips/${tripId}/quotations/${quotationId}/versions/autosave`,
    {
      data: {
        versionId,
        currency: version.currency || 'INR',
        label: version.label || undefined,
        items: nextItems,
        inclusions: version.inclusions ?? undefined,
        exclusions: version.exclusions ?? undefined,
        terms: version.terms ?? undefined,
        discountTotal: Number(version.discountTotal) || 0,
      },
    },
  );
  if (!save.ok()) {
    throw new Error(
      `autosave hotel supplier failed: ${save.status()} ${await save.text()}`,
    );
  }
  return { supplierId: supplier.id };
}

/** Advance demo tip: mark-sent → accept → materialize → confirm hotel → voucher. */
export async function apiAdvanceQuoteToVoucher(
  request: APIRequestContext,
  tripId: string,
): Promise<{
  versionId: string | null;
  bookingId: string | null;
  steps: string[];
}> {
  const steps: string[] = [];
  await ownerLogin(request);

  const trip = await request.get(`${API_BASE}/trips/${tripId}`);
  if (!trip.ok()) {
    throw new Error(`GET trip failed: ${trip.status()}`);
  }
  const body = (await trip.json()) as {
    quotations?: Array<{
      versions?: Array<{ id: string; status: string }>;
    }>;
  };
  const versions = (body.quotations || []).flatMap((q) => q.versions || []);
  // Prefer already-accepted for voucher advance (drafts from revise-from-accepted
  // often fail mark-sent until priced — do not steal the operate path).
  const tip =
    versions.find((v) => v.status === 'accepted') ||
    versions.find((v) => v.status === 'sent') ||
    versions.find((v) => ['draft', 'approved'].includes(v.status)) ||
    versions[0];
  if (!tip) {
    return { versionId: null, bookingId: null, steps: ['no_version'] };
  }

  const versionId = tip.id;
  if (tip.status === 'draft' || tip.status === 'approved') {
    const sent = await request.post(
      `${API_BASE}/quotations/${versionId}/mark-sent`,
      { data: { channel: 'whatsapp' } },
    );
    steps.push(sent.ok() ? 'mark_sent' : `mark_sent_${sent.status()}`);
  }

  if (tip.status !== 'accepted') {
    const accept = await request.post(
      `${API_BASE}/quotations/${versionId}/accept`,
    );
    steps.push(accept.ok() ? 'accept' : `accept_${accept.status()}`);
  } else {
    steps.push('already_accepted');
  }

  const mat = await request.post(
    `${API_BASE}/trips/${tripId}/bookings/from-accepted-quote`,
    { data: {} },
  );
  steps.push(mat.ok() ? 'materialize' : `materialize_${mat.status()}`);

  const bookingsRes = await request.get(
    `${API_BASE}/trips/${tripId}/bookings`,
  );
  let bookingId: string | null = null;
  if (bookingsRes.ok()) {
    const raw = await bookingsRes.json();
    const list = (Array.isArray(raw) ? raw : raw?.items || []) as Array<{
      id: string;
      type?: string;
      status?: string;
    }>;
    const hotel =
      list.find((b) => b.type === 'hotel') ||
      list.find((b) => b.status !== 'confirmed') ||
      list[0];
    bookingId = hotel?.id ?? null;
    if (bookingId) {
      const confirm = await request.patch(
        `${API_BASE}/trips/${tripId}/bookings/${bookingId}`,
        {
          data: {
            status: 'confirmed',
            confirmationRef: 'E2E-GOLDEN-REF',
            voucherNote: 'E2E golden voucher',
          },
        },
      );
      steps.push(confirm.ok() ? 'confirm' : `confirm_${confirm.status()}`);

      const voucher = await request.post(
        `${API_BASE}/trips/${tripId}/bookings/${bookingId}/mark-vouchered`,
      );
      steps.push(voucher.ok() ? 'voucher' : `voucher_${voucher.status()}`);
    }
  } else {
    steps.push(`bookings_${bookingsRes.status()}`);
  }

  return { versionId, bookingId, steps };
}

/**
 * Fill any null unitSell so mark-sent readiness passes on rematch-miss lines.
 * Uses cost×1.2 or a modest INR stub; marks priceSource manual.
 */
export async function ensureQuoteLinesHaveSell(
  request: APIRequestContext,
  tripId: string,
  quotationId: string,
  versionId: string,
): Promise<void> {
  await ownerLogin(request);
  const trip = await request.get(`${API_BASE}/trips/${tripId}`);
  if (!trip.ok()) throw new Error(`GET trip failed: ${trip.status()}`);
  const tripBody = (await trip.json()) as {
    quotations?: Array<{
      id: string;
      versions?: Array<{
        id: string;
        currency?: string;
        label?: string | null;
        itemsJson?: unknown;
        inclusions?: string | null;
        exclusions?: string | null;
        terms?: string | null;
        discountTotal?: number | string | null;
      }>;
    }>;
  };
  const quotation = (tripBody.quotations || []).find((q) => q.id === quotationId);
  const version =
    (quotation?.versions || []).find((v) => v.id === versionId) ||
    (quotation?.versions || [])[0];
  if (!version) throw new Error('Version not found for sell fill');

  const items = Array.isArray(version.itemsJson)
    ? (version.itemsJson as Array<Record<string, unknown>>)
    : [];
  let changed = false;
  const nextItems = items.map((item) => {
    const sell = item.unitSell;
    if (sell != null && Number.isFinite(Number(sell))) return item;
    const cost = Number(item.unitCost);
    const unitSell =
      Number.isFinite(cost) && cost > 0 ? Math.round(cost * 1.2) : 1000;
    changed = true;
    const details = {
      ...((item.details as Record<string, unknown>) || {}),
      priceSource: 'manual',
      markupMode: 'percent',
      markupValue: 20,
    };
    return {
      ...item,
      unitSell,
      unitCost: item.unitCost == null ? Math.round(unitSell / 1.2) : item.unitCost,
      rateUnmatched: false,
      details,
    };
  });
  if (!changed) return;

  const save = await request.post(
    `${API_BASE}/trips/${tripId}/quotations/${quotationId}/versions/autosave`,
    {
      data: {
        versionId,
        currency: version.currency || 'INR',
        label: version.label || undefined,
        items: nextItems,
        inclusions: version.inclusions ?? undefined,
        exclusions: version.exclusions ?? undefined,
        terms: version.terms ?? undefined,
        discountTotal: Number(version.discountTotal) || 0,
      },
    },
  );
  if (!save.ok()) {
    throw new Error(
      `autosave sell fill failed: ${save.status()} ${await save.text()}`,
    );
  }
}

/**
 * CRM spine from an existing lead: inquiry → trip → previous FIT quote (or template).
 * Or create the lead when `leadId` is omitted (`title` required then).
 */
export async function apiLeadInquiryTripQuoted(
  request: APIRequestContext,
  input: {
    title: string;
    leadId?: string;
    adults?: number;
    children?: number;
    startDate?: string;
    endDate?: string;
  },
): Promise<{
  leadId: string;
  inquiryId: string;
  tripId: string;
  tripNumber: string;
  quotationId: string;
  versionId: string;
}> {
  await salesLogin(request);

  const startDate = input.startDate || '2026-09-03';
  const endDate = input.endDate || '2026-09-08';
  const adults = input.adults ?? 2;
  const children = input.children ?? 1;

  let leadId = input.leadId;
  if (!leadId) {
    const leadRes = await request.post(`${API_BASE}/leads`, {
      data: {
        title: input.title,
        contactName: 'E2E Guest',
        email: `e2e.lead.${Date.now()}@example.com`,
        sourceKey: 'manual',
        priority: 'normal',
      },
    });
    if (!leadRes.ok()) {
      throw new Error(
        `Create lead failed: ${leadRes.status()} ${await leadRes.text()}`,
      );
    }
    const leadBody = (await leadRes.json()) as {
      lead?: { id: string };
      id?: string;
    };
    leadId = leadBody.lead?.id || leadBody.id;
    if (!leadId) throw new Error('Create lead returned no id');
  }

  const inquiryRes = await request.post(`${API_BASE}/inquiries`, {
    data: {
      leadId,
      adults,
      children,
      startDate,
      endDate,
      notes: 'E2E lead→trip spine',
    },
  });
  if (!inquiryRes.ok()) {
    throw new Error(
      `Create inquiry failed: ${inquiryRes.status()} ${await inquiryRes.text()}`,
    );
  }
  const inquiry = (await inquiryRes.json()) as { id: string };
  if (!inquiry.id) throw new Error('Create inquiry returned no id');

  const convertRes = await request.post(
    `${API_BASE}/inquiries/${inquiry.id}/convert-to-trip`,
  );
  if (!convertRes.ok()) {
    throw new Error(
      `convert-to-trip failed: ${convertRes.status()} ${await convertRes.text()}`,
    );
  }
  const trip = (await convertRes.json()) as {
    id: string;
    tripNumber?: string;
  };
  if (!trip.id) throw new Error('convert-to-trip returned no trip id');

  for (const t of [
    { fullName: 'E2E Adult One', type: 'adult' as const, isLead: true },
    { fullName: 'E2E Adult Two', type: 'adult' as const },
    { fullName: 'E2E Child', type: 'child' as const, dateOfBirth: '2018-06-01' },
  ]) {
    const tr = await request.post(`${API_BASE}/trips/${trip.id}/travellers`, {
      data: t,
    });
    if (!tr.ok()) {
      throw new Error(
        `add traveller failed: ${tr.status()} ${await tr.text()}`,
      );
    }
  }

  const fromPrev = await request.post(
    `${API_BASE}/trips/${trip.id}/quotations/from-previous`,
    {
      data: {
        startDate,
        adults,
        children,
      },
    },
  );
  if (!fromPrev.ok()) {
    // Fallback: Darjeeling classic FIT template (may leave unmatched lines).
    const templatesRes = await request.get(`${API_BASE}/quote-templates`);
    if (!templatesRes.ok()) {
      throw new Error(
        `from-previous failed (${fromPrev.status()}): ${await fromPrev.text()}; templates ${templatesRes.status()}`,
      );
    }
    const templatesRaw = await templatesRes.json();
    const templates = (
      Array.isArray(templatesRaw) ? templatesRaw : templatesRaw?.items || []
    ) as Array<{ id: string; name?: string; status?: string }>;
    const template =
      templates.find((t) =>
        /^Darjeeling classic FIT$/i.test((t.name || '').trim()),
      ) ||
      templates.find((t) => /darjeeling/i.test(t.name || '')) ||
      templates[0];
    if (!template?.id) {
      throw new Error(
        `from-previous failed: ${fromPrev.status()} ${await fromPrev.text()} — no FIT template fallback`,
      );
    }
    const fromTpl = await request.post(
      `${API_BASE}/trips/${trip.id}/quotations/from-template`,
      {
        data: {
          templateId: template.id,
          startDate,
          adults,
          children,
        },
      },
    );
    if (!fromTpl.ok()) {
      throw new Error(
        `from-template failed: ${fromTpl.status()} ${await fromTpl.text()}`,
      );
    }
    const quotation = (await fromTpl.json()) as {
      id: string;
      versions?: Array<{ id: string; status: string }>;
    };
    const tip =
      (quotation.versions || []).find((v) =>
        ['draft', 'pending_approval'].includes(v.status),
      ) || (quotation.versions || [])[0];
    if (!quotation.id || !tip?.id) {
      throw new Error('from-template returned no draft version');
    }
    await ensureHotelStayDatesOnDraft(request, trip.id, quotation.id, tip.id);
    await ensureQuoteLinesHaveSell(request, trip.id, quotation.id, tip.id);
    return {
      leadId,
      inquiryId: inquiry.id,
      tripId: trip.id,
      tripNumber: trip.tripNumber || trip.id,
      quotationId: quotation.id,
      versionId: tip.id,
    };
  }

  const quotation = (await fromPrev.json()) as {
    id: string;
    versions?: Array<{ id: string; status: string }>;
  };
  const tip =
    (quotation.versions || []).find((v) =>
      ['draft', 'pending_approval'].includes(v.status),
    ) || (quotation.versions || [])[0];
  if (!quotation.id || !tip?.id) {
    throw new Error('from-previous returned no draft version');
  }

  await ensureHotelStayDatesOnDraft(request, trip.id, quotation.id, tip.id);
  await ensureQuoteLinesHaveSell(request, trip.id, quotation.id, tip.id);

  return {
    leadId,
    inquiryId: inquiry.id,
    tripId: trip.id,
    tripNumber: trip.tripNumber || trip.id,
    quotationId: quotation.id,
    versionId: tip.id,
  };
}

/** Resolve newest lead whose title contains `titlePart` (sales session). */
export async function apiFindLeadByTitle(
  request: APIRequestContext,
  titlePart: string,
): Promise<string> {
  await salesLogin(request);
  const list = await request.get(
    `${API_BASE}/leads?pageSize=50&q=${encodeURIComponent(titlePart)}`,
  );
  if (!list.ok()) {
    throw new Error(`List leads failed: ${list.status()} ${await list.text()}`);
  }
  const body = (await list.json()) as {
    items?: Array<{ id: string; title?: string }>;
  };
  const hit = (body.items || []).find((l) =>
    (l.title || '').includes(titlePart),
  );
  if (!hit?.id) {
    throw new Error(`Lead not found for title containing: ${titlePart}`);
  }
  return hit.id;
}

/**
 * Schedule customer instalments from terms and mark the first open receivable paid
 * (leaves remainder when multiple rows — thin partial-collection path).
 */
export async function apiScheduleAndMarkFirstPaid(
  request: APIRequestContext,
  tripId: string,
): Promise<{ steps: string[]; paymentId: string | null }> {
  const steps: string[] = [];
  await ownerLogin(request);

  const schedule = await request.post(
    `${API_BASE}/trips/${tripId}/payments/schedule-from-terms`,
    { data: {} },
  );
  steps.push(
    schedule.ok() ? 'schedule' : `schedule_${schedule.status()}`,
  );

  const list = await request.get(`${API_BASE}/trips/${tripId}/payments`);
  if (!list.ok()) {
    return { steps: [...steps, `payments_${list.status()}`], paymentId: null };
  }
  const raw = await list.json();
  const payments = (
    Array.isArray(raw) ? raw : raw?.items || raw?.payments || []
  ) as Array<{
    id: string;
    direction?: string;
    status?: string;
    amount?: number;
  }>;
  const openCustomer = payments.find(
    (p) =>
      p.direction === 'customer' &&
      ['scheduled', 'partial', 'overdue', 'open'].includes(p.status || ''),
  );
  if (!openCustomer?.id) {
    return { steps: [...steps, 'no_open_receivable'], paymentId: null };
  }

  const paid = await request.post(
    `${API_BASE}/trips/${tripId}/payments/${openCustomer.id}/paid`,
    { data: {} },
  );
  steps.push(paid.ok() ? 'mark_paid' : `mark_paid_${paid.status()}`);
  return { steps, paymentId: openCustomer.id };
}
