/** Max length aligned with SaveQuotationVersionSchema.label. */
export const QUOTE_VERSION_LABEL_MAX = 80;

/** Common labels offered beside free-text edit (picker thin slice). */
export const QUOTE_VERSION_LABEL_PRESETS = [
  'Draft',
  'Client review',
  'Peak season',
  'Final',
  'Revised',
] as const;

/** Trim + cap for storage; blank → null (falls back to Version N in UI). */
export function normalizeQuoteVersionLabel(
  raw: string | null | undefined,
): string | null {
  const t = String(raw ?? '')
    .trim()
    .slice(0, QUOTE_VERSION_LABEL_MAX);
  return t || null;
}

/** Preset chips for the version-label picker (includes Version N when known). */
export function quoteVersionLabelPickerOptions(opts?: {
  versionNumber?: number | null;
}): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const n = Number(opts?.versionNumber);
  if (Number.isFinite(n) && n > 0) {
    options.push({ value: `v${n}`, label: `v${n}` });
  }
  for (const preset of QUOTE_VERSION_LABEL_PRESETS) {
    options.push({ value: preset, label: preset });
  }
  return options;
}

/** Display label for a quotation version option (prefer stored label). */
export function quoteVersionOptionLabel(version: {
  versionNumber?: number | null;
  label?: string | null;
}): string {
  const stored = version.label?.trim();
  if (stored) return stored;
  const n = Number(version.versionNumber);
  return Number.isFinite(n) && n > 0 ? `Version ${n}` : 'Version';
}
