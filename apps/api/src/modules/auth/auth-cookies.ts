import type { Response } from 'express';
import { loadEnv } from '@travel/config';

export const ACCESS_COOKIE = 'travel_access';
export const REFRESH_COOKIE = 'travel_refresh';

function ttlToSeconds(ttl: string, fallbackSeconds: number): number {
  const m = /^(\d+)([smhd])$/i.exec(ttl.trim());
  if (!m) return fallbackSeconds;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 60 * 60;
  if (unit === 'd') return n * 60 * 60 * 24;
  return fallbackSeconds;
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  const env = loadEnv();
  const secure = env.isProd || env.appEnv === 'dev';
  const accessMaxAge = ttlToSeconds(env.jwtAccessTtl, 15 * 60);
  const refreshMaxAge = ttlToSeconds(env.jwtRefreshTtl, 7 * 24 * 60 * 60);

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api',
    maxAge: accessMaxAge * 1000,
  });

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: refreshMaxAge * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  const env = loadEnv();
  const secure = env.isProd || env.appEnv === 'dev';
  res.clearCookie(ACCESS_COOKIE, { path: '/api', httpOnly: true, secure, sameSite: 'lax' });
  res.clearCookie(REFRESH_COOKIE, {
    path: '/api/v1/auth',
    httpOnly: true,
    secure,
    sameSite: 'lax',
  });
}

export function publicAuthPayload(tokens: {
  organizationId: string;
  user: { id: string; email: string; fullName: string | null };
}) {
  return {
    organizationId: tokens.organizationId,
    user: tokens.user,
  };
}
