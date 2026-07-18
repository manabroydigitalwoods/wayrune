import type { Prisma } from '@prisma/client';

const PLATFORM_SLUG_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;

/** Random label for non-primary platform hosts: `{slug}.{publicCode}.{base}`. */
export function generatePlatformSlug(length = 8): string {
  const raw = Math.random().toString(36).slice(2, 2 + length);
  return raw.padEnd(length, '0').slice(0, length);
}

export async function allocatePlatformSlug(
  db: Prisma.TransactionClient | { presenceSite: Prisma.PresenceSiteDelegate },
): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generatePlatformSlug();
    const taken = await db.presenceSite.findFirst({
      where: { platformSlug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error('Could not allocate a unique platform slug');
}

export function buildSitePlatformHost(
  publicCode: number,
  baseDomain: string,
  site: { isPrimary?: boolean; platformSlug?: string | null },
): string {
  const base = baseDomain.toLowerCase().replace(/^\./, '');
  if (site.isPrimary) return `${publicCode}.${base}`;
  if (site.platformSlug) return `${site.platformSlug}.${publicCode}.${base}`;
  return `${publicCode}.${base}`;
}

export type ParsedSitePlatformHost =
  | { kind: 'primary'; publicCode: number }
  | { kind: 'site'; publicCode: number; platformSlug: string };

/**
 * Parse HubSpot-style platform hosts:
 * - `{publicCode}.{base}` → primary site
 * - `{slug}.{publicCode}.{base}` → additional site
 */
export function parseSitePlatformHost(
  host: string,
  baseDomain: string,
): ParsedSitePlatformHost | null {
  const h = host.split(':')[0]?.toLowerCase() || '';
  const base = baseDomain.toLowerCase().replace(/^\./, '');
  const suffix = `.${base}`;
  if (!h.endsWith(suffix) || h === base || h === `www.${base}`) return null;

  const prefix = h.slice(0, -suffix.length);
  if (!prefix || prefix.includes('..')) return null;

  const parts = prefix.split('.').filter(Boolean);
  if (parts.length === 1) {
    const codeStr = parts[0]!;
    if (!/^\d+$/.test(codeStr)) return null;
    const publicCode = Number.parseInt(codeStr, 10);
    if (!Number.isFinite(publicCode)) return null;
    return { kind: 'primary', publicCode };
  }

  if (parts.length === 2) {
    const [platformSlug, codeStr] = parts;
    if (!platformSlug || !codeStr || !/^\d+$/.test(codeStr)) return null;
    if (!PLATFORM_SLUG_RE.test(platformSlug)) return null;
    const publicCode = Number.parseInt(codeStr, 10);
    if (!Number.isFinite(publicCode)) return null;
    return { kind: 'site', publicCode, platformSlug };
  }

  return null;
}
