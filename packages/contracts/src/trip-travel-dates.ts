/** Optional trip travel window helpers (create / apply templates). */

/**
 * When both start and end are set (YYYY-MM-DD), end must be on or after start.
 * Missing either side is allowed (dates stay optional on create).
 */
export function tripTravelEndOnOrAfterStart(
  startDate?: string | null,
  endDate?: string | null,
): boolean {
  const s = (startDate ?? '').trim().slice(0, 10);
  const e = (endDate ?? '').trim().slice(0, 10);
  if (!s || !e) return true;
  return e >= s;
}
