import { isBrowser } from './safe';
import type { CookieWriteOptions } from './types';

/**
 * Client-readable cookies for non-secret prefs only.
 * Do NOT store auth tokens — those are httpOnly and set by the API.
 */
export function getCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const encoded = encodeURIComponent(name);
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${encoded}=`)) {
      return decodeURIComponent(trimmed.slice(encoded.length + 1));
    }
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

export function setCookie(name: string, value: string, options: CookieWriteOptions = {}): boolean {
  if (!isBrowser()) return false;
  try {
    const segments = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
    segments.push(`Path=${options.path ?? '/'}`);
    if (options.maxAge != null) segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
    if (options.expires) segments.push(`Expires=${options.expires.toUTCString()}`);
    if (options.domain) segments.push(`Domain=${options.domain}`);
    if (options.secure) segments.push('Secure');
    const sameSite = options.sameSite ?? 'lax';
    segments.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
    document.cookie = segments.join('; ');
    return true;
  } catch {
    return false;
  }
}

export function removeCookie(name: string, options: Pick<CookieWriteOptions, 'path' | 'domain'> = {}) {
  setCookie(name, '', {
    ...options,
    path: options.path ?? '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

export function getJsonCookie<T>(name: string): T | null {
  const raw = getCookie(name);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJsonCookie<T>(name: string, data: T, options?: CookieWriteOptions): boolean {
  try {
    return setCookie(name, JSON.stringify(data), options);
  } catch {
    return false;
  }
}
