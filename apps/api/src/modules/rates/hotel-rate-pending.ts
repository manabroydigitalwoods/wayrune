/** Rate tip dual-control: pending Activate before Match sees new buy. */

/**
 * When the actor lacks rates.approve, new-version / restore creates an inactive
 * tip and leaves the live tip active until Activate.
 */
export function rateTipVersionRequiresPendingActivation(
  canActivate: boolean,
): boolean {
  return !canActivate;
}

/** @deprecated Prefer rateTipVersionRequiresPendingActivation */
export const hotelRateVersionRequiresPendingActivation =
  rateTipVersionRequiresPendingActivation;

/** Newest tip in the family that is still inactive → awaiting Activate. */
export function rateTipPendingActivation(opts: {
  isActive: boolean;
  isNewestInFamily: boolean;
}): boolean {
  return !opts.isActive && opts.isNewestInFamily;
}

/** @deprecated Prefer rateTipPendingActivation */
export const hotelRateTipPendingActivation = rateTipPendingActivation;
