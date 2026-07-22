import type { APIRequestContext, Page } from '@playwright/test';

/** Default demo; override with E2E_* for pilot-staging (North India Tours). */
export const E2E_USER = {
  email: process.env.E2E_EMAIL || 'salesexec@demo.travel',
  password: process.env.E2E_PASSWORD || 'Password123!',
};

/** Owner used only to install starter pack (settings.write). */
export const E2E_OWNER = {
  email: process.env.E2E_OWNER_EMAIL || 'owner@demo.travel',
  password: process.env.E2E_PASSWORD || 'Password123!',
};

/** Phase 1 seed staging — North India Tours (`pilot-staging`). */
export const E2E_PILOT_USER = {
  email: 'sales@northindia.tours.demo',
  password: process.env.E2E_PASSWORD || 'Password123!',
};

export const E2E_PILOT_OWNER = {
  email: 'owner@northindia.tours.demo',
  password: process.env.E2E_PASSWORD || 'Password123!',
};

/** Point shared helpers at pilot-staging (mutate before goldenOps calls). */
export function usePilotStagingCredentials() {
  E2E_USER.email = E2E_PILOT_USER.email;
  E2E_USER.password = E2E_PILOT_USER.password;
  E2E_OWNER.email = E2E_PILOT_OWNER.email;
  E2E_OWNER.password = E2E_PILOT_OWNER.password;
  process.env.E2E_EMAIL = E2E_PILOT_USER.email;
  process.env.E2E_OWNER_EMAIL = E2E_PILOT_OWNER.email;
}

export const API_BASE =
  process.env.E2E_API_BASE ||
  `${process.env.API_PUBLIC_URL || 'http://localhost:3001'}/api/v1`;

const FIT_PACK_ID = 'fit_templates_v1';

export type AuthSession = {
  orgPublicCode: number | string;
  orgId: string;
  tripId: string | null;
  tripNumber: string | null;
};

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  if (!login.ok()) {
    throw new Error(
      `E2E login failed for ${email} (${login.status()}): ${await login.text()}`,
    );
  }
  const meRes = await request.get(`${API_BASE}/auth/me`);
  if (!meRes.ok()) {
    throw new Error(`E2E /me failed (${meRes.status()}): ${await meRes.text()}`);
  }
  const me = (await meRes.json()) as {
    organization: { id: string; publicCode?: number | null };
  };
  return {
    orgId: me.organization.id,
    orgPublicCode: me.organization.publicCode ?? me.organization.id,
  };
}

/** Cookie login via API — Playwright request context keeps Set-Cookie. */
export async function apiLogin(
  request: APIRequestContext,
): Promise<AuthSession> {
  const org = await loginAs(request, E2E_USER.email, E2E_USER.password);
  return { ...org, tripId: null, tripNumber: null };
}

/** Install sample FIT pack (idempotent) and resolve demo trip id. */
export async function ensureFitPackAndDemoTrip(
  request: APIRequestContext,
): Promise<AuthSession> {
  // Owner for pack install permissions, then continue as persona later in UI.
  const ownerOrg = await loginAs(
    request,
    E2E_OWNER.email,
    E2E_OWNER.password,
  );

  const install = await request.post(
    `${API_BASE}/organizations/starter-packs/${FIT_PACK_ID}/install`,
  );
  if (!install.ok() && install.status() !== 409) {
    // Non-fatal if already installed / permission oddity — try listing trips anyway.
    // eslint-disable-next-line no-console
    console.warn(
      `FIT pack install returned ${install.status()}: ${await install.text()}`,
    );
  }

  const trips = await request.get(`${API_BASE}/trips?page=1&pageSize=50`);
  if (!trips.ok()) {
    throw new Error(`List trips failed: ${trips.status()} ${await trips.text()}`);
  }
  const payload = (await trips.json()) as {
    items?: Array<{ id: string; tripNumber?: string; title?: string }>;
  };
  const items = payload.items || [];
  const demo =
    items.find((t) => t.tripNumber === 'TRP-DEMO-01') ||
    items.find((t) => /demo/i.test(t.title || '')) ||
    items[0];
  if (!demo) {
    throw new Error(
      'No trip available after FIT pack install — run pnpm db:seed and retry',
    );
  }
  return {
    ...ownerOrg,
    tripId: demo.id,
    tripNumber: demo.tripNumber || null,
  };
}

export async function uiLogin(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByPlaceholder('Email').waitFor({ state: 'visible' });
  await page.getByPlaceholder('Email').fill(E2E_USER.email);
  await page.getByPlaceholder('Password').fill(E2E_USER.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 30_000,
  });
}

/** Owner UI session — finance reporting / settings.write surfaces. */
export async function uiLoginOwner(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByPlaceholder('Email').waitFor({ state: 'visible' });
  await page.getByPlaceholder('Email').fill(E2E_OWNER.email);
  await page.getByPlaceholder('Password').fill(E2E_OWNER.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 30_000,
  });
}

/** Stay on current session (e.g. owner after API ops) — no re-login. */
export function tripTabPath(
  orgRef: string | number,
  tripId: string,
  tab: string,
) {
  return `/${orgRef}/trips/${tripId}?tab=${tab}`;
}

export function tripQuotePath(orgRef: string | number, tripId: string) {
  return `/${orgRef}/trips/${tripId}?tab=quotations`;
}

/** Deep-link a specific quotation version on the Quotations tab. */
export function tripQuoteVersionPath(
  orgRef: string | number,
  tripId: string,
  quotationId: string,
  versionId: string,
) {
  return `/${orgRef}/trips/${tripId}?tab=quotations&quotation=${quotationId}&version=${versionId}`;
}
