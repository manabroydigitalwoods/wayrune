import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  RecordDialog,
  SimpleFormField as FormField,
  Textarea,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';

type ImportKind = 'hotel' | 'transfer';

type ImportResultRow = {
  row: number;
  status: 'ok' | 'skip';
  reason?: string;
  summary?: string;
};

type ImportResponse = {
  commit: boolean;
  okCount: number;
  skipCount: number;
  results: ImportResultRow[];
};

const HOTEL_TEMPLATE =
  'supplierName,placeName,placeKey,roomType,unitCost,currency,startDate,endDate\n' +
  'Heritage Darjeeling,Darjeeling,,Deluxe,4500,INR,2026-04-01,2026-10-31\n';

const TRANSFER_TEMPLATE =
  'fromPlace,toPlace,vehicleType,unitCost,childUnitCost,pricingMode,currency,startDate,endDate\n' +
  'Bagdogra (IXB),Darjeeling,Sedan,3200,,per_vehicle,INR,2026-04-01,2026-10-31\n';

function parseCsvLines(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // Minimal CSV: no escaped commas in values for v1 templates.
      return line.split(',').map((c) => c.trim());
    });
}

function headerIndex(headers: string[], ...names: string[]) {
  for (const name of names) {
    const i = headers.indexOf(name.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function cell(cols: string[], idx: number): string {
  if (idx < 0) return '';
  return cols[idx] || '';
}

function parseOptionalNumber(raw: string): number | null | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function hotelTemplateForSupplier(supplierName?: string) {
  if (!supplierName?.trim()) return HOTEL_TEMPLATE;
  const safe = supplierName.trim().replace(/,/g, ' ');
  return (
    'supplierName,placeName,placeKey,roomType,unitCost,currency,startDate,endDate\n' +
    `${safe},,,,4500,INR,2026-04-01,2026-10-31\n`
  );
}

export function RatesCsvImportDialog({
  open,
  onOpenChange,
  kind,
  onImported,
  lockedSupplierName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ImportKind;
  onImported: () => void;
  /** When set (hotel only), force every row onto this supplier. */
  lockedSupplierName?: string;
}) {
  const template =
    kind === 'hotel'
      ? hotelTemplateForSupplier(lockedSupplierName)
      : TRANSFER_TEMPLATE;
  const [text, setText] = useState(template);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText(
      kind === 'hotel'
        ? hotelTemplateForSupplier(lockedSupplierName)
        : TRANSFER_TEMPLATE,
    );
    setPreview(null);
  }, [kind, open, lockedSupplierName]);

  const title =
    kind === 'hotel'
      ? lockedSupplierName
        ? `Import rates · ${lockedSupplierName}`
        : 'Import hotel rates (CSV)'
      : 'Import transfer fares (CSV)';

  const endpoint =
    kind === 'hotel' ? '/hotel-rates/import/csv' : '/transfer-fares/import/csv';

  const rowsPayload = useMemo(() => {
    const lines = parseCsvLines(text);
    if (lines.length < 2) return { error: 'Paste a header row plus at least one data row' as const };
    const headers = lines[0]!.map((h) => h.toLowerCase());
    const data = lines.slice(1);

    if (kind === 'hotel') {
      const supplierIdx = headerIndex(headers, 'suppliername', 'supplier');
      const placeNameIdx = headerIndex(headers, 'placename', 'place');
      const placeKeyIdx = headerIndex(headers, 'placekey');
      const roomIdx = headerIndex(headers, 'roomtype', 'room');
      const costIdx = headerIndex(headers, 'unitcost', 'cost');
      const currencyIdx = headerIndex(headers, 'currency');
      const startIdx = headerIndex(headers, 'startdate', 'from');
      const endIdx = headerIndex(headers, 'enddate', 'to');
      if (costIdx < 0) return { error: 'CSV must include unitCost' as const };
      const locked = lockedSupplierName?.trim() || '';
      const rows = data.map((cols) => {
        const unitCost = Number(cell(cols, costIdx));
        return {
          supplierName: locked || cell(cols, supplierIdx) || null,
          placeName: cell(cols, placeNameIdx) || null,
          placeKey: cell(cols, placeKeyIdx) || null,
          roomType: cell(cols, roomIdx) || null,
          unitCost,
          currency: cell(cols, currencyIdx) || undefined,
          startDate: cell(cols, startIdx) || null,
          endDate: cell(cols, endIdx) || null,
        };
      });
      if (rows.some((r) => !Number.isFinite(r.unitCost))) {
        return { error: 'unitCost must be a number on every row' as const };
      }
      return { rows };
    }

    const fromIdx = headerIndex(headers, 'fromplace', 'from');
    const toIdx = headerIndex(headers, 'toplace', 'to');
    const vehicleIdx = headerIndex(headers, 'vehicletype', 'vehicle');
    const costIdx = headerIndex(headers, 'unitcost', 'cost');
    const childIdx = headerIndex(headers, 'childunitcost', 'childcost');
    const modeIdx = headerIndex(headers, 'pricingmode', 'mode');
    const currencyIdx = headerIndex(headers, 'currency');
    const startIdx = headerIndex(headers, 'startdate', 'fromdate');
    const endIdx = headerIndex(headers, 'enddate', 'todate');
    if (fromIdx < 0 || toIdx < 0 || vehicleIdx < 0 || costIdx < 0) {
      return { error: 'CSV must include fromPlace, toPlace, vehicleType, unitCost' as const };
    }
    const rows = data.map((cols) => {
      const unitCost = Number(cell(cols, costIdx));
      const modeRaw = cell(cols, modeIdx).toLowerCase();
      const pricingMode =
        modeRaw === 'per_adult' || modeRaw === 'per_vehicle' ? modeRaw : undefined;
      return {
        fromPlace: cell(cols, fromIdx),
        toPlace: cell(cols, toIdx),
        vehicleType: cell(cols, vehicleIdx),
        unitCost,
        childUnitCost: parseOptionalNumber(cell(cols, childIdx)),
        pricingMode,
        currency: cell(cols, currencyIdx) || undefined,
        startDate: cell(cols, startIdx) || null,
        endDate: cell(cols, endIdx) || null,
      };
    });
    if (rows.some((r) => !Number.isFinite(r.unitCost))) {
      return { error: 'unitCost must be a number on every row' as const };
    }
    return { rows };
  }, [text, kind, lockedSupplierName]);

  async function run(commit: boolean) {
    if ('error' in rowsPayload) {
      toastError(rowsPayload.error ?? 'Invalid CSV');
      return;
    }
    setBusy(true);
    try {
      const res = await api<ImportResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ rows: rowsPayload.rows, commit }),
      });
      setPreview(res);
      if (commit) {
        toastSuccess(
          `Imported ${res.okCount} row${res.okCount === 1 ? '' : 's'}${
            res.skipCount ? ` · ${res.skipCount} skipped` : ''
          }`,
        );
        onImported();
        if (res.skipCount === 0) onOpenChange(false);
      } else {
        toastSuccess(
          `Preview: ${res.okCount} ready · ${res.skipCount} will skip`,
        );
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPreview(null);
        onOpenChange(next);
      }}
      title={title}
      description={
        lockedSupplierName
          ? `Rows are applied to ${lockedSupplierName}. Paste CSV, preview, then commit.`
          : 'Paste a CSV, preview validation, then commit. Names/keys must match existing suppliers, places, and vehicle types.'
      }
      hideFooter
    >
      <FormField label="CSV">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          rows={8}
          className="font-mono text-xs"
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run(false)}
        >
          {busy ? 'Working…' : 'Preview'}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !preview || preview.okCount === 0}
          onClick={() => void run(true)}
        >
          {busy ? 'Importing…' : `Commit ${preview?.okCount ?? 0} row(s)`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setText(template);
            setPreview(null);
          }}
        >
          Reset template
        </Button>
      </div>
      {preview ? (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs">
          <p className="font-medium text-muted-foreground">
            {preview.commit ? 'Committed' : 'Preview'} · {preview.okCount} ok ·{' '}
            {preview.skipCount} skip
          </p>
          {preview.results.map((r) => (
            <div
              key={`${r.row}-${r.status}-${r.reason || r.summary || ''}`}
              className={
                r.status === 'ok' ? 'text-foreground' : 'text-amber-700 dark:text-amber-400'
              }
            >
              Row {r.row}: {r.status === 'ok' ? r.summary || 'ok' : r.reason || 'skip'}
            </div>
          ))}
        </div>
      ) : null}
    </RecordDialog>
  );
}
