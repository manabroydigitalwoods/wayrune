import { HttpException, HttpStatus } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Simple in-memory sliding window. Fine for single-node / local; use Redis later for multi-instance. */
export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (existing.count >= limit) {
    const retrySec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new HttpException(
      `Too many attempts. Try again in ${retrySec}s.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  existing.count += 1;
}

/** Best-effort client key from Express-ish request. */
export function clientKey(req?: { ip?: string; headers?: Record<string, unknown> }): string {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  if (Array.isArray(forwarded) && typeof forwarded[0] === 'string') {
    return forwarded[0].split(',')[0]!.trim();
  }
  return req?.ip || 'unknown';
}
