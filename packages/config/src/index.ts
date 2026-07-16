import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

export type AppEnvName = 'local' | 'dev' | 'prod';

/**
 * RBAC core now lives in the browser-safe `@travel/rbac` package (no `fs`/`path`).
 * Re-exported here for backwards compatibility so existing
 * `import { PERMISSIONS, ROLE_PERMISSION_MAP, ... } from '@travel/config'`
 * call sites keep working unchanged.
 */
export {
  PERMISSIONS,
  PERMISSION_SET,
  PERMISSION_DEFS,
  PERMISSION_DEF_BY_KEY,
  PERMISSION_IMPLIES,
  isPermissionKey,
  getPermissionDefinition,
  permissionAllowedForOrgKind,
  permissionsForOrgKind,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canAccessRecord,
  effectiveScope,
  effectivePermissions,
  diffPermissions,
  assignablePermissions,
  canGrantPermission,
  permissionGroups,
  isPlatformPermission,
  PLATFORM_PERMISSIONS,
  ROLE_PERMISSION_MAP,
  PLATFORM_ROLE_PERMISSION_MAP,
  PARTNER_ROLE_PERMISSION_MAP,
  PARTNER_ALLOWED_PERMISSIONS,
  ROLE_ALLOWED_ORG_KINDS,
  roleAllowedForOrgKind,
  ORG_KINDS,
  AGENCY_ROLE_KEYS,
  PARTNER_ROLE_KEYS,
  PLATFORM_ROLE_KEYS,
  type OrgKind,
  type PermissionKey,
  type PermissionDefinition,
  type PermissionRisk,
  type PermissionScope,
  type PermissionDiff,
  type RecordScopeContext,
  type RoleKey,
  type AgencyRoleKey,
  type PartnerRoleKey,
  type PlatformRoleKey,
} from '@travel/rbac';

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function applyEnvFile(path: string, override: boolean) {
  if (!existsSync(path)) return;
  const parsed = parseEnvFile(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function findMonorepoRoot(start = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function normalizeAppEnv(raw?: string | null): AppEnvName {
  const value = (raw || 'local').toLowerCase();
  if (value === 'prod' || value === 'production') return 'prod';
  if (value === 'dev' || value === 'development' || value === 'staging') return 'dev';
  return 'local';
}

/** Load `envs/<local|dev|prod>.env` from monorepo root. Call once at process start. */
export function bootstrapEnv(options?: { appEnv?: AppEnvName; root?: string }): AppEnvName {
  const root = options?.root ?? findMonorepoRoot();
  const appEnv = normalizeAppEnv(options?.appEnv ?? process.env.APP_ENV);
  const envFile = join(root, 'envs', `${appEnv}.env`);
  const legacyFile = join(root, `.env.${appEnv}`);

  applyEnvFile(join(root, '.env'), false);
  if (existsSync(envFile)) {
    applyEnvFile(envFile, true);
  } else if (existsSync(legacyFile)) {
    applyEnvFile(legacyFile, true);
  } else if (existsSync(join(root, '.env'))) {
    applyEnvFile(join(root, '.env'), true);
  }

  process.env.APP_ENV = appEnv;
  process.env.NODE_ENV =
    process.env.NODE_ENV || (appEnv === 'prod' ? 'production' : 'development');

  return appEnv;
}

export type AppEnv = {
  appEnv: AppEnvName;
  isProd: boolean;
  databaseUrl: string;
  redisUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  s3Endpoint: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Bucket: string;
  s3Region: string;
  fileStorage: 'local' | 's3';
  uploadDir: string;
  apiPort: number;
  webOrigin: string;
  apiPublicUrl: string;
  logLevel: string;
  logPretty: boolean;
  logServiceName: string;
  /** Optional — enables AI proposal-story drafts. */
  openaiApiKey: string;
  openaiModel: string;
  /** Optional — Distance Matrix + Geocoding for transfer routes (server-side only). */
  googleMapsApiKey: string;
  /** Optional SMTP — when unset, worker logs email skip (dev). */
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
  /** Optional SSO — when unset, that provider's login button is inert. */
  googleOauthClientId: string;
  googleOauthClientSecret: string;
  microsoftOauthClientId: string;
  microsoftOauthClientSecret: string;
  oauthRedirectBase: string;
};

let cached: AppEnv | null = null;

export function loadEnv(force = false): AppEnv {
  if (cached && !force) return cached;

  const appEnv = normalizeAppEnv(process.env.APP_ENV);
  const jwtAccessSecret = process.env.JWT_ACCESS_SECRET ?? '';
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET ?? '';

  if (appEnv === 'prod') {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in prod');
    if (jwtAccessSecret.length < 32 || jwtRefreshSecret.length < 32) {
      throw new Error('JWT secrets must be at least 32 characters in prod');
    }
  }

  const logPrettyExplicit = process.env.LOG_PRETTY;
  const logPretty =
    logPrettyExplicit !== undefined
      ? logPrettyExplicit === 'true'
      : appEnv === 'local';

  cached = {
    appEnv,
    isProd: appEnv === 'prod',
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    jwtAccessSecret: jwtAccessSecret || 'dev-access-secret-change-me-32chars',
    jwtRefreshSecret: jwtRefreshSecret || 'dev-refresh-secret-change-me-32chars',
    jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    s3Endpoint: process.env.S3_ENDPOINT ?? '',
    s3AccessKey: process.env.S3_ACCESS_KEY ?? '',
    s3SecretKey: process.env.S3_SECRET_KEY ?? '',
    s3Bucket: process.env.S3_BUCKET ?? 'travel-erp',
    s3Region: process.env.S3_REGION ?? 'us-east-1',
    fileStorage: (process.env.FILE_STORAGE === 's3' ? 's3' : 'local') as 'local' | 's3',
    uploadDir: process.env.UPLOAD_DIR || '.data/uploads',
    apiPort: Number(process.env.API_PORT ?? 3001),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    apiPublicUrl: process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`,
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logPretty,
    logServiceName: process.env.LOG_SERVICE_NAME ?? 'api',
    openaiApiKey: (process.env.OPENAI_API_KEY || '').trim(),
    openaiModel: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
    googleMapsApiKey: (process.env.GOOGLE_MAPS_API_KEY || '').trim(),
    smtpHost: (process.env.SMTP_HOST || '').trim(),
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: (process.env.SMTP_USER || '').trim(),
    smtpPass: (process.env.SMTP_PASS || '').trim(),
    emailFrom: (process.env.EMAIL_FROM || '').trim(),
    googleOauthClientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    googleOauthClientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
    microsoftOauthClientId: (process.env.MICROSOFT_OAUTH_CLIENT_ID || '').trim(),
    microsoftOauthClientSecret: (process.env.MICROSOFT_OAUTH_CLIENT_SECRET || '').trim(),
    oauthRedirectBase: (
      process.env.OAUTH_REDIRECT_BASE ||
      process.env.API_PUBLIC_URL ||
      `http://localhost:${process.env.API_PORT ?? 3001}`
    ).trim(),
  };
  return cached;
}

export {
  SYSTEM_PLACES,
  SYSTEM_PLACES as SYSTEM_DESTINATIONS,
  SYSTEM_PLACE_CATEGORIES,
  type PlaceKind,
  type SystemPlaceNode,
  type SystemPlaceCategory,
  type PlaceProfile,
} from './system-places';
export {
  SYSTEM_PLACES_NORTHEAST,
  NORTHEAST_TRANSPORT_PARENT_OVERRIDES,
} from './system-places-northeast';
export { INDIA_TRANSPORT_PLACES } from './india-transport-places';
export { SYSTEM_ROOM_TYPES } from './system-room-types';
export { SYSTEM_VEHICLE_TYPES } from './system-vehicle-types';
export type { SystemVehicleType } from './system-vehicle-types';
export {
  SYSTEM_PLACE_EDGES,
  SYSTEM_PLACE_KNOWLEDGE,
  type SystemPlaceEdgeSeed,
  type SystemPlaceKnowledgeSeed,
} from './system-place-knowledge';
export {
  SYSTEM_VEHICLE_RATE_BANDS,
  SYSTEM_FARE_CLUSTERS,
  SYSTEM_TRANSFER_FARE_CORRIDORS,
  CLUSTER_PAIR_KM_ESTIMATES,
  buildClusterFareSeeds,
  type SystemTransferFareSeed,
  type SystemFareCluster,
  type SystemVehicleRateBand,
} from './system-transfer-fares';
export {
  SYSTEM_HOTEL_RATES,
  type SystemHotelRateSeed,
} from './system-hotel-rates';
