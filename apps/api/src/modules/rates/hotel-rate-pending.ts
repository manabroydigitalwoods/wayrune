/** Hotel tip dual-control: pending activate before Match sees new buy. */

/**
 * When the actor lacks rates.approve, new-version / restore creates an inactive
 * tip and leaves the live tip active until Activate.
 */
export function hotelRateVersionRequiresPendingActivation(
  canActivate: boolean,
): boolean {
  return !canActivate;
}

/** Newest tip in the family that is still inactive → awaiting Activate. */
export function hotelRateTipPendingActivation(opts: {
  isActive: boolean;
  isNewestInFamily: boolean;
}): boolean {
  return !opts.isActive && opts.isNewestInFamily;
}
