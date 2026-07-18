import type { AppEnv } from '@wayrune/config';

/**
 * ERP UI is WEB_ORIGIN; Presence sites use *.SITE_BASE_DOMAIN (any port in local).
 * Widget.js runs on the site origin and must be allowed to call the API.
 */
export function isAllowedCorsOrigin(origin: string | undefined, env: AppEnv): boolean {
  if (!origin) return true;
  if (origin === env.webOrigin) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    const base = env.siteBaseDomain.toLowerCase().replace(/^\./, '');
    if (!base) return false;
    const host = hostname.toLowerCase();
    return host === base || host.endsWith(`.${base}`);
  } catch {
    return false;
  }
}
