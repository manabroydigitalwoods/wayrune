/** Soft cue when Match fails because a fare exists the opposite way. */

const REVERSE_CORRIDOR_RE =
  /reverse corridor|opposite direction|swap From\/To/i;

export function transferReverseCorridorHint(
  rejected:
    | Array<{ reason?: string | null; label?: string | null } | string>
    | null
    | undefined,
): string | null {
  if (!Array.isArray(rejected) || !rejected.length) return null;
  for (const row of rejected) {
    const reason = typeof row === 'string' ? row : row?.reason;
    if (typeof reason === 'string' && REVERSE_CORRIDOR_RE.test(reason)) {
      return 'Fare exists the other way — swap From/To.';
    }
  }
  return null;
}

export function swapTransferEnds<
  T extends {
    fromPlaceId?: string;
    fromPlaceName?: string;
    fromCountry?: string;
    toPlaceId?: string;
    toPlaceName?: string;
    toCountry?: string;
  },
>(details: T): T {
  return {
    ...details,
    fromPlaceId: details.toPlaceId,
    fromPlaceName: details.toPlaceName,
    fromCountry: details.toCountry,
    toPlaceId: details.fromPlaceId,
    toPlaceName: details.fromPlaceName,
    toCountry: details.fromCountry,
  };
}
