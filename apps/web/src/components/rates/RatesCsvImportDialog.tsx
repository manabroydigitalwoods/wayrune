import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  RecordDialog,
  SimpleFormField as FormField,
  Textarea,
  toastError,
  toastSuccess,
  toastWarning,
} from '@wayrune/ui';
import { api } from '../../api';
import { loadRatesImportFile } from '../../lib/ratesSheetImport';

type ImportKind = 'hotel' | 'transfer' | 'activity';

type ImportResultRow = {
  row: number;
  status: 'ok' | 'skip';
  reason?: string;
  summary?: string;
};

type ImportBatch = {
  id: string;
  batchId: string;
  kind: string;
  okCount: number;
  skipCount: number;
  rowCount: number;
  fileName: string | null;
  lockedSupplierName: string | null;
  actorName: string | null;
  createdAt: string;
  sampleSkips?: Array<{ row: number; reason: string }>;
  replaySkipCount?: number;
  replayAvailable?: boolean;
};

type ImportResponse = {
  commit: boolean;
  okCount: number;
  skipCount: number;
  results: ImportResultRow[];
};

const HOTEL_MATRIX_MEALS = ['ep', 'cp', 'map', 'ap'] as const;

const HOTEL_TEMPLATE =
  'supplierName,placeName,placeKey,roomType,' +
  'mapUnitCost,mapWeekendUnitCost,mapSglUnitCost,mapSglWeekendUnitCost,mapDblUnitCost,mapDblWeekendUnitCost,mapTplUnitCost,mapTplWeekendUnitCost,' +
  'cpUnitCost,cpWeekendUnitCost,cpSglUnitCost,cpSglWeekendUnitCost,cpDblUnitCost,cpDblWeekendUnitCost,cpTplUnitCost,cpTplWeekendUnitCost,' +
  'currency,startDate,endDate\n' +
  'Heritage Darjeeling,Darjeeling,,Deluxe,' +
  '4500,5200,3600,4100,4500,5200,5800,6400,' +
  '4050,4680,3240,3740,4050,4680,5220,6030,' +
  'INR,2026-04-01,2026-10-31\n';

const TRANSFER_TEMPLATE =
  'supplierName,fromPlace,toPlace,vehicleType,unitCost,partyBand2UnitCost,partyBand4UnitCost,partyBand6UnitCost,childUnitCost,infantUnitCost,childAgeMin,childAgeMax,pricingMode,currency,startDate,endDate\n' +
  'North Bengal Fleet Rentals,Bagdogra (IXB),Darjeeling,Sedan,4500,4500,5200,6500,,,0,11,per_vehicle,INR,2026-04-01,2026-10-31\n';

const ACTIVITY_TEMPLATE =
  'supplierName,placeName,activityName,privateOrSic,adultUnitCost,childUnitCost,childAgeMin,childAgeMax,currency,startDate,endDate\n' +
  'Tiger Hill Sunrise Desk,Tiger Hill,Tiger Hill sunrise,private,1800,900,0,11,INR,2026-01-01,2026-12-31\n';

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
    'supplierName,placeName,placeKey,roomType,' +
    'mapUnitCost,mapWeekendUnitCost,mapSglUnitCost,mapSglWeekendUnitCost,mapDblUnitCost,mapDblWeekendUnitCost,mapTplUnitCost,mapTplWeekendUnitCost,' +
    'cpUnitCost,cpWeekendUnitCost,cpSglUnitCost,cpSglWeekendUnitCost,cpDblUnitCost,cpDblWeekendUnitCost,cpTplUnitCost,cpTplWeekendUnitCost,' +
    'currency,startDate,endDate\n' +
    `${safe},,,Deluxe,` +
    '4500,5200,3600,4100,4500,5200,5800,6400,' +
    '4050,4680,3240,3740,4050,4680,5220,6030,' +
    'INR,2026-04-01,2026-10-31\n'
  );
}

function activityTemplateForSupplier(supplierName?: string) {
  if (!supplierName?.trim()) return ACTIVITY_TEMPLATE;
  const safe = supplierName.trim().replace(/,/g, ' ');
  return (
    'supplierName,placeName,activityName,privateOrSic,adultUnitCost,childUnitCost,childAgeMin,childAgeMax,currency,startDate,endDate\n' +
    `${safe},,Tiger Hill sunrise,private,1800,900,0,11,INR,2026-01-01,2026-12-31\n`
  );
}

function transferTemplateForSupplier(supplierName?: string) {
  if (!supplierName?.trim()) return TRANSFER_TEMPLATE;
  const safe = supplierName.trim().replace(/,/g, ' ');
  return (
    'supplierName,fromPlace,toPlace,vehicleType,unitCost,partyBand2UnitCost,partyBand4UnitCost,partyBand6UnitCost,childUnitCost,infantUnitCost,childAgeMin,childAgeMax,pricingMode,currency,startDate,endDate\n' +
    `${safe},Bagdogra (IXB),Darjeeling,Sedan,4500,4500,5200,6500,,,0,11,per_vehicle,INR,2026-04-01,2026-10-31\n`
  );
}

function firstSkipReason(results: ImportResultRow[]): string | null {
  for (const r of results) {
    if (r.status === 'skip' && r.reason?.trim()) return r.reason.trim();
  }
  return null;
}

function replaySourceFromText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return undefined;
  return { headerLine: lines[0]!, dataLines: lines.slice(1) };
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
  /** When set, force every row onto this supplier (hotel / activity / transfer). */
  lockedSupplierName?: string;
}) {
  const template =
    kind === 'hotel'
      ? hotelTemplateForSupplier(lockedSupplierName)
      : kind === 'activity'
        ? activityTemplateForSupplier(lockedSupplierName)
        : transferTemplateForSupplier(lockedSupplierName);
  const [text, setText] = useState(template);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadBatches() {
    try {
      const rows = await api<ImportBatch[]>(
        `/rates/import-batches?kind=${encodeURIComponent(kind)}&limit=8`,
      );
      setBatches(rows || []);
    } catch {
      setBatches([]);
    }
  }

  useEffect(() => {
    if (!open) return;
    setText(
      kind === 'hotel'
        ? hotelTemplateForSupplier(lockedSupplierName)
        : kind === 'activity'
          ? activityTemplateForSupplier(lockedSupplierName)
          : transferTemplateForSupplier(lockedSupplierName),
    );
    setPreview(null);
    setFileLabel(null);
    if (fileRef.current) fileRef.current.value = '';
    void loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when dialog opens / kind changes
  }, [kind, open, lockedSupplierName]);

  const title =
    kind === 'hotel'
      ? lockedSupplierName
        ? `Import rates · ${lockedSupplierName}`
        : 'Import hotel rates'
      : kind === 'activity'
        ? lockedSupplierName
          ? `Import activity rates · ${lockedSupplierName}`
          : 'Import activity rates'
        : 'Import transfer fares';

  const endpoint =
    kind === 'hotel'
      ? '/hotel-rates/import/csv'
      : kind === 'activity'
        ? '/activity-rates/import/csv'
        : '/transfer-fares/import/csv';

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
      const mealIdx = headerIndex(headers, 'mealplan', 'meal');
      const costIdx = headerIndex(headers, 'unitcost', 'cost');
      const weekendIdx = headerIndex(headers, 'weekendunitcost', 'weekendcost');
      const sglIdx = headerIndex(headers, 'sglunitcost', 'sgl');
      const sglWeIdx = headerIndex(
        headers,
        'sglweekendunitcost',
        'sglweekend',
      );
      const dblIdx = headerIndex(headers, 'dblunitcost', 'dbl');
      const dblWeIdx = headerIndex(
        headers,
        'dblweekendunitcost',
        'dblweekend',
      );
      const tplIdx = headerIndex(headers, 'tplunitcost', 'tpl');
      const tplWeIdx = headerIndex(
        headers,
        'tplweekendunitcost',
        'tplweekend',
      );
      const mealFieldIdx: Record<string, number> = {};
      for (const meal of HOTEL_MATRIX_MEALS) {
        for (const suffix of [
          'unitcost',
          'weekendunitcost',
          'sglunitcost',
          'sglweekendunitcost',
          'dblunitcost',
          'dblweekendunitcost',
          'tplunitcost',
          'tplweekendunitcost',
        ] as const) {
          const key = `${meal}${suffix}`;
          mealFieldIdx[key] = headerIndex(headers, key);
        }
      }
      const hasMatrixHeader = Object.values(mealFieldIdx).some((i) => i >= 0);
      if (costIdx < 0 && !hasMatrixHeader) {
        return {
          error: 'Sheet must include unitCost or meal-prefixed columns (e.g. mapUnitCost)' as const,
        };
      }
      const currencyIdx = headerIndex(headers, 'currency');
      const startIdx = headerIndex(headers, 'startdate', 'from');
      const endIdx = headerIndex(headers, 'enddate', 'to');
      const locked = lockedSupplierName?.trim() || '';
      const rows = data.map((cols) => {
        const unitRaw = cell(cols, costIdx);
        const unitCost =
          costIdx >= 0 && unitRaw.trim() ? Number(unitRaw) : undefined;
        const mealPayload: Record<string, number | null | undefined> = {};
        for (const meal of HOTEL_MATRIX_MEALS) {
          const pairs: Array<[string, string]> = [
            [`${meal}UnitCost`, `${meal}unitcost`],
            [`${meal}WeekendUnitCost`, `${meal}weekendunitcost`],
            [`${meal}SglUnitCost`, `${meal}sglunitcost`],
            [`${meal}SglWeekendUnitCost`, `${meal}sglweekendunitcost`],
            [`${meal}DblUnitCost`, `${meal}dblunitcost`],
            [`${meal}DblWeekendUnitCost`, `${meal}dblweekendunitcost`],
            [`${meal}TplUnitCost`, `${meal}tplunitcost`],
            [`${meal}TplWeekendUnitCost`, `${meal}tplweekendunitcost`],
          ];
          for (const [prop, idxKey] of pairs) {
            mealPayload[prop] = parseOptionalNumber(
              cell(cols, mealFieldIdx[idxKey] ?? -1),
            );
          }
        }
        return {
          supplierName: locked || cell(cols, supplierIdx) || null,
          placeName: cell(cols, placeNameIdx) || null,
          placeKey: cell(cols, placeKeyIdx) || null,
          roomType: cell(cols, roomIdx) || null,
          mealPlan: cell(cols, mealIdx) || null,
          unitCost,
          weekendUnitCost: parseOptionalNumber(cell(cols, weekendIdx)),
          sglUnitCost: parseOptionalNumber(cell(cols, sglIdx)),
          sglWeekendUnitCost: parseOptionalNumber(cell(cols, sglWeIdx)),
          dblUnitCost: parseOptionalNumber(cell(cols, dblIdx)),
          dblWeekendUnitCost: parseOptionalNumber(cell(cols, dblWeIdx)),
          tplUnitCost: parseOptionalNumber(cell(cols, tplIdx)),
          tplWeekendUnitCost: parseOptionalNumber(cell(cols, tplWeIdx)),
          ...mealPayload,
          currency: cell(cols, currencyIdx) || undefined,
          startDate: cell(cols, startIdx) || null,
          endDate: cell(cols, endIdx) || null,
        };
      });
      const hasMatrixRow = rows.some((r) => {
        const rec = r as Record<string, unknown>;
        return HOTEL_MATRIX_MEALS.some(
          (m) =>
            rec[`${m}UnitCost`] != null ||
            rec[`${m}SglUnitCost`] != null ||
            rec[`${m}DblUnitCost`] != null ||
            rec[`${m}TplUnitCost`] != null,
        );
      });
      if (
        !hasMatrixRow &&
        rows.some((r) => r.unitCost == null || !Number.isFinite(r.unitCost))
      ) {
        return { error: 'unitCost must be a number on every row' as const };
      }
      return { rows };
    }

    if (kind === 'activity') {
      const supplierIdx = headerIndex(headers, 'suppliername', 'supplier');
      const placeNameIdx = headerIndex(headers, 'placename', 'place');
      const placeKeyIdx = headerIndex(headers, 'placekey');
      const nameIdx = headerIndex(headers, 'activityname', 'activity', 'name');
      const modeIdx = headerIndex(headers, 'privateorsic', 'mode');
      const adultIdx = headerIndex(headers, 'adultunitcost', 'adultcost', 'unitcost');
      const childIdx = headerIndex(headers, 'childunitcost', 'childcost');
      const ageMinIdx = headerIndex(headers, 'childagemin', 'agemin');
      const ageMaxIdx = headerIndex(headers, 'childagemax', 'agemax');
      const currencyIdx = headerIndex(headers, 'currency');
      const startIdx = headerIndex(headers, 'startdate', 'from');
      const endIdx = headerIndex(headers, 'enddate', 'to');
      if (nameIdx < 0 || adultIdx < 0) {
        return { error: 'Sheet must include activityName and adultUnitCost' as const };
      }
      const locked = lockedSupplierName?.trim() || '';
      const rows = data.map((cols) => {
        const adultUnitCost = Number(cell(cols, adultIdx));
        const modeRaw = cell(cols, modeIdx).toLowerCase();
        const privateOrSic =
          modeRaw === 'private' || modeRaw === 'sic' ? modeRaw : null;
        return {
          supplierName: locked || cell(cols, supplierIdx) || '',
          placeName: cell(cols, placeNameIdx) || null,
          placeKey: cell(cols, placeKeyIdx) || null,
          activityName: cell(cols, nameIdx),
          privateOrSic,
          adultUnitCost,
          childUnitCost: parseOptionalNumber(cell(cols, childIdx)),
          childAgeMin: parseOptionalNumber(cell(cols, ageMinIdx)) ?? null,
          childAgeMax: parseOptionalNumber(cell(cols, ageMaxIdx)) ?? null,
          currency: cell(cols, currencyIdx) || undefined,
          startDate: cell(cols, startIdx) || null,
          endDate: cell(cols, endIdx) || null,
        };
      });
      if (rows.some((r) => !r.supplierName.trim())) {
        return { error: 'supplierName is required on every row' as const };
      }
      if (rows.some((r) => !r.activityName.trim() || !Number.isFinite(r.adultUnitCost))) {
        return { error: 'activityName and adultUnitCost required on every row' as const };
      }
      return { rows };
    }

    const supplierIdx = headerIndex(headers, 'suppliername', 'supplier');
    const fromIdx = headerIndex(headers, 'fromplace', 'from');
    const toIdx = headerIndex(headers, 'toplace', 'to');
    const vehicleIdx = headerIndex(headers, 'vehicletype', 'vehicle');
    const costIdx = headerIndex(headers, 'unitcost', 'cost');
    const childIdx = headerIndex(headers, 'childunitcost', 'childcost');
    const infantIdx = headerIndex(headers, 'infantunitcost', 'infantcost');
    const ageMinIdx = headerIndex(headers, 'childagemin', 'agemin');
    const ageMaxIdx = headerIndex(headers, 'childagemax', 'agemax');
    const band2Idx = headerIndex(
      headers,
      'partyband2unitcost',
      'band2unitcost',
      'party2unitcost',
    );
    const band4Idx = headerIndex(
      headers,
      'partyband4unitcost',
      'band4unitcost',
      'party4unitcost',
    );
    const band6Idx = headerIndex(
      headers,
      'partyband6unitcost',
      'band6unitcost',
      'party6unitcost',
    );
    const modeIdx = headerIndex(headers, 'pricingmode', 'mode');
    const currencyIdx = headerIndex(headers, 'currency');
    const startIdx = headerIndex(headers, 'startdate', 'fromdate');
    const endIdx = headerIndex(headers, 'enddate', 'todate');
    if (fromIdx < 0 || toIdx < 0 || vehicleIdx < 0 || costIdx < 0) {
      return { error: 'Sheet must include fromPlace, toPlace, vehicleType, unitCost' as const };
    }
    const locked = lockedSupplierName?.trim() || '';
    const rows = data.map((cols) => {
      const unitCost = Number(cell(cols, costIdx));
      const modeRaw = cell(cols, modeIdx).toLowerCase();
      const pricingMode =
        modeRaw === 'per_adult' || modeRaw === 'per_vehicle' ? modeRaw : undefined;
      return {
        supplierName: locked || cell(cols, supplierIdx) || null,
        fromPlace: cell(cols, fromIdx),
        toPlace: cell(cols, toIdx),
        vehicleType: cell(cols, vehicleIdx),
        unitCost,
        childUnitCost: parseOptionalNumber(cell(cols, childIdx)),
        infantUnitCost: parseOptionalNumber(cell(cols, infantIdx)),
        childAgeMin: parseOptionalNumber(cell(cols, ageMinIdx)) ?? null,
        childAgeMax: parseOptionalNumber(cell(cols, ageMaxIdx)) ?? null,
        partyBand2UnitCost: parseOptionalNumber(cell(cols, band2Idx)),
        partyBand4UnitCost: parseOptionalNumber(cell(cols, band4Idx)),
        partyBand6UnitCost: parseOptionalNumber(cell(cols, band6Idx)),
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

  async function onPickFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const csv = await loadRatesImportFile(file);
      setText(csv);
      setFileLabel(file.name);
      setPreview(null);
      toastSuccess(`Loaded ${file.name}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not read file');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function run(commit: boolean) {
    if ('error' in rowsPayload) {
      toastError(rowsPayload.error ?? 'Invalid import data');
      return;
    }
    setBusy(true);
    try {
      const res = await api<ImportResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          rows: rowsPayload.rows,
          commit,
          fileName: fileLabel || undefined,
          lockedSupplierName: lockedSupplierName || undefined,
          ...(commit ? { replaySource: replaySourceFromText(text) } : {}),
        }),
      });
      setPreview(res);
      if (commit) {
        if (res.okCount === 0) {
          const reason = firstSkipReason(res.results);
          toastError(
            reason ? `Nothing imported · ${reason}` : 'Nothing imported',
          );
          return;
        }
        toastSuccess(
          `Imported ${res.okCount} row${res.okCount === 1 ? '' : 's'}${
            res.skipCount ? ` · ${res.skipCount} skipped` : ''
          }`,
        );
        if (res.skipCount > 0) {
          const reason = firstSkipReason(res.results);
          toastWarning(
            reason
              ? `${res.skipCount} row(s) skipped · ${reason}${
                  res.skipCount > 1 ? '…' : ''
                }`
              : `${res.skipCount} row(s) skipped`,
          );
        }
        onImported();
        void loadBatches();
        if (res.skipCount === 0) onOpenChange(false);
      } else {
        if (res.okCount === 0 && res.skipCount > 0) {
          const reason = firstSkipReason(res.results);
          toastWarning(
            reason
              ? `Preview: all rows will skip · ${reason}`
              : 'Preview: all rows will skip',
          );
        } else {
          toastSuccess(
            `Preview: ${res.okCount} ready · ${res.skipCount} will skip`,
          );
        }
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function replayBatch(batchId: string) {
    setBusy(true);
    try {
      const res = await api<{ csvText: string; skipCount: number }>(
        `/rates/import-batches/${encodeURIComponent(batchId)}/replay`,
      );
      setText(res.csvText);
      setPreview(null);
      setFileLabel(null);
      if (fileRef.current) fileRef.current.value = '';
      toastSuccess(
        `Loaded ${res.skipCount} skipped row${res.skipCount === 1 ? '' : 's'} — fix and preview again`,
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load replay rows');
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
          ? `Rows are applied to ${lockedSupplierName}. Upload Excel/CSV or paste, preview, then commit.`
          : 'Upload .xlsx/.csv or paste, preview validation, then commit. Names/keys must match existing suppliers, places, and vehicle types.'
      }
      hideFooter
    >
      <FormField
        label="File"
        description={
          fileLabel
            ? `Loaded: ${fileLabel}`
            : 'First sheet of Excel workbooks is used.'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full max-w-md text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
            disabled={busy}
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </FormField>
      <FormField label="CSV preview (editable)">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
            setFileLabel(null);
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
            setFileLabel(null);
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
            <div key={`${r.row}-${r.status}-${r.reason || r.summary || ''}`}>
              <span className="tabular-nums text-muted-foreground">#{r.row}</span>{' '}
              {r.status === 'ok' ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  ok{r.summary ? ` · ${r.summary}` : ''}
                </span>
              ) : (
                <span className="text-amber-800 dark:text-amber-200">
                  skip{r.reason ? ` · ${r.reason}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {batches.length ? (
        <div className="space-y-1.5 rounded-lg border border-border/60 p-2.5 text-xs">
          <p className="font-medium text-muted-foreground">Recent imports</p>
          <ul className="space-y-1">
            {batches.map((b) => {
              const when = new Date(b.createdAt);
              const stamp = Number.isFinite(when.getTime())
                ? when.toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : b.createdAt;
              const samples = (b.sampleSkips || []).slice(0, 5);
              return (
                <li key={b.id} className="text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">{stamp}</span>
                    {' · '}
                    {b.okCount} ok
                    {b.skipCount ? ` · ${b.skipCount} skip` : ''}
                    {b.fileName ? ` · ${b.fileName}` : ''}
                    {b.actorName ? ` · ${b.actorName}` : ''}
                  </div>
                  {samples.length ? (
                    <ul className="mt-0.5 space-y-0.5 pl-2 text-[11px] text-amber-800/90 dark:text-amber-200/90">
                      {samples.map((s) => (
                        <li key={`${b.id}-${s.row}-${s.reason}`}>
                          #{s.row} · {s.reason}
                        </li>
                      ))}
                      {(b.sampleSkips?.length || 0) > samples.length ? (
                        <li className="text-muted-foreground">
                          +{(b.sampleSkips?.length || 0) - samples.length} more
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                  {b.replayAvailable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 px-2 text-[11px]"
                      disabled={busy}
                      onClick={() => void replayBatch(b.batchId)}
                    >
                      Replay {b.replaySkipCount ?? b.skipCount} skip
                      {(b.replaySkipCount ?? b.skipCount) === 1 ? '' : 's'}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </RecordDialog>
  );
}
