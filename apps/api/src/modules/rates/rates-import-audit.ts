/** Normalize rate CSV/XLSX import commit summaries for AuditEvent metadata. */

export const RATES_IMPORT_AUDIT_ACTION = 'rates.import.commit' as const;
export const RATES_IMPORT_ENTITY_TYPE = 'rate_import' as const;

export type RatesImportKind = 'hotel' | 'transfer' | 'activity';

export type RatesImportAuditMetadata = {
  kind: RatesImportKind;
  okCount: number;
  skipCount: number;
  rowCount: number;
  fileName?: string | null;
  lockedSupplierName?: string | null;
  sampleSkips: Array<{ row: number; reason: string }>;
};

export function composeRatesImportAuditMetadata(input: {
  kind: RatesImportKind;
  okCount: number;
  skipCount: number;
  rowCount: number;
  fileName?: string | null;
  lockedSupplierName?: string | null;
  results: Array<{ row: number; status: 'ok' | 'skip'; reason?: string }>;
}): RatesImportAuditMetadata {
  const sampleSkips = input.results
    .filter((r) => r.status === 'skip' && r.reason?.trim())
    .slice(0, 5)
    .map((r) => ({ row: r.row, reason: r.reason!.trim() }));
  return {
    kind: input.kind,
    okCount: Math.max(0, input.okCount),
    skipCount: Math.max(0, input.skipCount),
    rowCount: Math.max(0, input.rowCount),
    fileName: input.fileName?.trim() || null,
    lockedSupplierName: input.lockedSupplierName?.trim() || null,
    sampleSkips,
  };
}

export type RatesImportBatchListItem = {
  id: string;
  batchId: string;
  kind: RatesImportKind | string;
  okCount: number;
  skipCount: number;
  rowCount: number;
  fileName: string | null;
  lockedSupplierName: string | null;
  actorName: string | null;
  createdAt: string;
  sampleSkips: Array<{ row: number; reason: string }>;
};

export function mapAuditEventToImportBatch(event: {
  id: string;
  correlationId?: string | null;
  createdAt: Date | string;
  metadataJson?: unknown;
  actor?: { fullName?: string | null; email?: string | null } | null;
}): RatesImportBatchListItem | null {
  const meta =
    event.metadataJson && typeof event.metadataJson === 'object'
      ? (event.metadataJson as Record<string, unknown>)
      : {};
  const kind = typeof meta.kind === 'string' ? meta.kind : 'hotel';
  const createdAt =
    event.createdAt instanceof Date
      ? event.createdAt.toISOString()
      : String(event.createdAt);
  const sampleSkips = Array.isArray(meta.sampleSkips)
    ? meta.sampleSkips
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as Record<string, unknown>;
          const n = typeof row.row === 'number' && Number.isFinite(row.row) ? row.row : null;
          const reason =
            typeof row.reason === 'string' && row.reason.trim()
              ? row.reason.trim()
              : null;
          if (n == null || !reason) return [];
          return [{ row: n, reason }];
        })
        .slice(0, 5)
    : [];
  return {
    id: event.id,
    batchId: event.correlationId || event.id,
    kind,
    okCount: typeof meta.okCount === 'number' ? meta.okCount : 0,
    skipCount: typeof meta.skipCount === 'number' ? meta.skipCount : 0,
    rowCount: typeof meta.rowCount === 'number' ? meta.rowCount : 0,
    fileName: typeof meta.fileName === 'string' ? meta.fileName : null,
    lockedSupplierName:
      typeof meta.lockedSupplierName === 'string' ? meta.lockedSupplierName : null,
    actorName: event.actor?.fullName?.trim() || event.actor?.email?.trim() || null,
    createdAt,
    sampleSkips,
  };
}
