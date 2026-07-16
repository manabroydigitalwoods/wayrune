import { toastError } from '@travel/ui';

/** True when an error thrown by `api()` is a permission (403) failure. */
export function isPermissionError(e: unknown): boolean {
  return Boolean(
    e &&
      typeof e === 'object' &&
      'status' in e &&
      (e as { status?: number }).status === 403,
  );
}

/**
 * Report a background/read error to the user, but stay silent for permission
 * (403) errors — those are expected for gated views and should never spam
 * toasts. Use this in on-mount/background fetch catch blocks. For
 * user-initiated mutations, keep toasting the real message so a failure is
 * still explained.
 */
export function reportError(e: unknown, fallbackMsg: string): void {
  if (isPermissionError(e)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[rbac] suppressed forbidden read', e);
    }
    return;
  }
  toastError(e instanceof Error ? e.message : fallbackMsg);
}
