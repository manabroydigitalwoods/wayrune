/** Normalize single / repeated / CSV entity id query params for GET /files. */
export function parseFileListEntityIds(
  entityId?: string | string[],
  entityIdsCsv?: string,
): string[] {
  const fromParam = Array.isArray(entityId)
    ? entityId
    : entityId
      ? [entityId]
      : [];
  const fromCsv = String(entityIdsCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...fromParam, ...fromCsv].map((s) => s.trim()).filter(Boolean))];
}
