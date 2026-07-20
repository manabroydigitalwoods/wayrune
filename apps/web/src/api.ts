const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';

/** In-flight GET promises — coalesces React Strict Mode double-mounts and parallel identical reads. */
const inflightGets = new Map<string, Promise<unknown>>();

let refreshPromise: Promise<boolean> | null = null;

export type ApiInit = RequestInit & {
  /** When false, skip in-flight GET deduplication (default true for GET). */
  dedupe?: boolean;
  /** Skip 401 → refresh → retry (used by refresh/login itself). */
  skipAuthRefresh?: boolean;
};

/** @deprecated Tokens live in httpOnly cookies; no-op kept for call-site compatibility. */
export function setToken(_token: string | null) {
  /* intentionally empty */
}

async function tryRefreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { dedupe = true, skipAuthRefresh = false, ...requestInit } = init;
  const method = (requestInit.method ?? 'GET').toUpperCase();
  const shouldDedupe = dedupe && method === 'GET' && !requestInit.body;
  const dedupeKey = shouldDedupe ? `${method}:${path}` : null;

  if (method !== 'GET') inflightGets.clear();

  if (dedupeKey) {
    const existing = inflightGets.get(dedupeKey);
    if (existing) return existing as Promise<T>;
  }

  const request = (async (): Promise<T> => {
    const headers = new Headers(requestInit.headers);
    if (!headers.has('Content-Type') && requestInit.body) {
      headers.set('Content-Type', 'application/json');
    }

    const doFetch = () =>
      fetch(`${API_BASE}${path}`, {
        ...requestInit,
        headers,
        credentials: 'include',
      });

    let res = await doFetch();

    if (
      res.status === 401 &&
      !skipAuthRefresh &&
      path !== '/auth/refresh' &&
      path !== '/auth/login' &&
      path !== '/auth/register' &&
      path !== '/auth/logout'
    ) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        res = await doFetch();
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        (typeof body.message === 'string' && body.message) ||
        (Array.isArray(body.message) && body.message[0]) ||
        body.detail ||
        res.statusText;
      throw Object.assign(new Error(msg), { status: res.status, body });
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  })();

  if (dedupeKey) {
    inflightGets.set(dedupeKey, request);
    void request.finally(() => {
      if (inflightGets.get(dedupeKey) === request) inflightGets.delete(dedupeKey);
    });
  }

  return request;
}

/** Multipart upload (do not set Content-Type — browser sets boundary). */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  init: Omit<ApiInit, 'body'> = {},
): Promise<T> {
  const { dedupe: _d, skipAuthRefresh = false, ...requestInit } = init;
  inflightGets.clear();

  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...requestInit,
      method: requestInit.method ?? 'POST',
      body: formData,
      credentials: 'include',
    });

  let res = await doFetch();

  if (
    res.status === 401 &&
    !skipAuthRefresh &&
    path !== '/auth/refresh' &&
    path !== '/auth/login' &&
    path !== '/auth/register' &&
    path !== '/auth/logout'
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) res = await doFetch();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || res.statusText), { status: res.status, body });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Multipart upload with upload progress (0–100). Uses XHR so progress events work. */
export function apiUploadWithProgress<T>(
  path: string,
  formData: FormData,
  opts?: {
    onProgress?: (percent: number) => void;
    skipAuthRefresh?: boolean;
  },
): Promise<T> {
  inflightGets.clear();

  const run = (retried: boolean): Promise<T> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}${path}`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        opts?.onProgress?.(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = async () => {
        if (
          xhr.status === 401 &&
          !opts?.skipAuthRefresh &&
          !retried &&
          path !== '/auth/refresh'
        ) {
          const refreshed = await tryRefreshSession();
          if (refreshed) {
            resolve(run(true));
            return;
          }
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          opts?.onProgress?.(100);
          if (xhr.status === 204 || !xhr.responseText) {
            resolve(undefined as T);
            return;
          }
          try {
            resolve(JSON.parse(xhr.responseText) as T);
          } catch {
            reject(new Error('Invalid JSON response'));
          }
          return;
        }
        let detail = xhr.statusText;
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string };
          if (body.detail) detail = body.detail;
        } catch {
          /* ignore */
        }
        reject(Object.assign(new Error(detail), { status: xhr.status }));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });

  return run(false);
}

/** Binary download (PDF / files) with cookie auth + refresh. */
export async function apiBlob(path: string, init: ApiInit = {}): Promise<Blob> {
  const { dedupe: _d, skipAuthRefresh = false, ...requestInit } = init;
  inflightGets.clear();

  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...requestInit,
      credentials: 'include',
    });

  let res = await doFetch();

  if (
    res.status === 401 &&
    !skipAuthRefresh &&
    path !== '/auth/refresh' &&
    path !== '/auth/login' &&
    path !== '/auth/register' &&
    path !== '/auth/logout'
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) res = await doFetch();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || body.message || res.statusText), {
      status: res.status,
      body,
    });
  }
  return res.blob();
}

/** Inclusive contract stop-sale window — null roomProductId = property-wide. */
export type ContractStopSaleRange = {
  from: string;
  to: string;
  roomProductId?: string | null;
};

export type SupplierContractRow = {
  id: string;
  title: string;
  status: string;
  versionNumber?: number | null;
  supersedesId?: string | null;
  paymentTerms?: string | null;
  cancellationTerms?: string | null;
  cancellationPolicyJson?: {
    rules?: Array<{
      beforeHours: number;
      chargeType: 'PERCENTAGE' | 'FIXED' | 'NIGHTS';
      chargeValue: number;
    }>;
    noShowChargePercentage?: number;
    text?: string;
  } | null;
  preferred?: boolean;
  blackoutJson?: Array<{ from: string; to: string }> | null;
  stopSaleJson?: ContractStopSaleRange[] | null;
  supplier?: { id: string; name: string } | null;
};

export type AssetRoomProductRow = {
  id: string;
  name: string;
  customerFacingName?: string | null;
  maxOccupancy?: number;
  baseQuantity?: number;
  bedConfig?: string | null;
  isActive?: boolean;
  allotments?: Array<{
    id: string;
    startDate: string;
    endDate: string;
    availableCount: number;
    stopSell: boolean;
  }>;
};

export type HotelOccupancyPricing = {
  baseAdults?: number;
  baseChildren?: number;
  childAgeMax?: number;
  extraAdultPerNight?: number;
  childWithBedPerNight?: number;
  childWithoutBedPerNight?: number;
  adultBands?: Array<{
    adults: number;
    unitCostPerNight: number;
    weekendUnitCostPerNight?: number;
  }>;
  minStayNights?: number;
  maxStayNights?: number;
  nationality?: string;
  dateSupplements?: Array<{
    date?: string;
    from?: string;
    to?: string;
    amount: number;
    label?: string;
  }>;
} | null;

export type SupplierHotelRateRow = {
  id: string;
  supplierId?: string | null;
  placeId?: string | null;
  roomProductId?: string | null;
  contractId?: string | null;
  isSystem?: boolean;
  roomType?: string | null;
  mealPlan?: string | null;
  unitCost: number | string;
  weekendUnitCost?: number | string | null;
  occupancyPricingJson?: HotelOccupancyPricing;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  versionNumber?: number | null;
  supersedesId?: string | null;
  updatedAt?: string | null;
  place?: { id: string; name: string; kind?: string } | null;
  contract?: { id: string; title: string; versionNumber?: number | null; status?: string } | null;
  roomProduct?: { id: string; name: string } | null;
};

export type SupplierActivityRateRow = {
  id: string;
  supplierId?: string | null;
  placeId?: string | null;
  activityName: string;
  activityKey: string;
  privateOrSic?: string | null;
  adultUnitCost: number | string;
  childUnitCost?: number | string | null;
  childAgeMin?: number | null;
  childAgeMax?: number | null;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  versionNumber?: number | null;
  supersedesId?: string | null;
  updatedAt?: string | null;
  place?: { id: string; name: string; kind?: string } | null;
  supplier?: { id: string; name: string; type?: string } | null;
};

export type SupplierTransferFareRow = {
  id: string;
  supplierId?: string | null;
  fromPlaceId: string;
  toPlaceId: string;
  vehicleTypeId: string;
  unitCost: number | string;
  childUnitCost?: number | string | null;
  infantUnitCost?: number | string | null;
  childAgeMin?: number | null;
  childAgeMax?: number | null;
  pricingMode?: string | null;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  isSystem?: boolean;
  versionNumber?: number | null;
  supersedesId?: string | null;
  updatedAt?: string | null;
  fromPlace?: { id: string; name: string; kind?: string } | null;
  toPlace?: { id: string; name: string; kind?: string } | null;
  vehicleType?: { id: string; name: string; seats?: number | null } | null;
  supplier?: { id: string; name: string; type?: string } | null;
};

/** Clone an active contract into a new draft version (optionally copying rate seasons). */
export async function cloneSupplierContractVersion(
  contractId: string,
  opts?: { copyRates?: boolean },
): Promise<SupplierContractRow> {
  return api<SupplierContractRow>(
    `/commerce/supplier-contracts/${contractId}/clone-version`,
    {
      method: 'POST',
      body: JSON.stringify({ copyRates: opts?.copyRates ?? true }),
    },
  );
}
