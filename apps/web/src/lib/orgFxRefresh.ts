/** Settings live FX refresh cue helpers (Frankfurter → org fxRates). */

export type OrgFxRatesMetaCue = {
  fetchedAt?: string | null;
  asOf?: string | null;
  refreshed?: string[] | null;
  skipped?: string[] | null;
  source?: string | null;
};

export function formatOrgFxRefreshToast(meta: OrgFxRatesMetaCue | null | undefined): string {
  const refreshed = Array.isArray(meta?.refreshed) ? meta.refreshed.filter(Boolean) : [];
  const skipped = Array.isArray(meta?.skipped) ? meta.skipped.filter(Boolean) : [];
  const head = refreshed.length
    ? `Updated ${refreshed.join(', ')} from market`
    : 'No market rates updated';
  const skip =
    skipped.length > 0 ? ` · kept prior ${skipped.join(', ')} (not in feed)` : '';
  return `${head}${skip}`;
}

export function formatOrgFxRatesMetaCue(
  meta: OrgFxRatesMetaCue | null | undefined,
): string | null {
  if (!meta?.fetchedAt && !meta?.asOf) return null;
  const when = meta.asOf
    ? `ECB as of ${meta.asOf}`
    : meta.fetchedAt
      ? `Fetched ${meta.fetchedAt.slice(0, 10)}`
      : null;
  if (!when) return null;
  const skipped = Array.isArray(meta.skipped) ? meta.skipped.filter(Boolean) : [];
  const skip = skipped.length ? ` · ${skipped.join(', ')} not in feed` : '';
  return `${when}${skip}`;
}
