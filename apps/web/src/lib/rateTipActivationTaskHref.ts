/**
 * Resolve Tasks → deep-link for rate-tip activation rows (hotel / transfer / activity).
 */
export function rateTipActivationTaskHref(
  entityType?: string | null,
  description?: string | null,
): string | null {
  if (
    entityType !== 'supplier_hotel_rate' &&
    entityType !== 'transfer_fare' &&
    entityType !== 'supplier_activity_rate'
  ) {
    return null;
  }
  const fromDesc = description?.match(
    /\/suppliers\/([A-Za-z0-9_-]+)(?:#|\?|$|\s)/,
  );
  if (fromDesc?.[1]) return `/suppliers/${fromDesc[1]}#supplier-rate-chart`;
  return null;
}
