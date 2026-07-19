/** Server-side CSV helpers for finance report pack email delivery. */

export function escapeCsvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  d1_30: '1–30',
  d31_60: '31–60',
  d61_90: '61–90',
  d90_plus: '90+',
  noDue: 'No due date',
};

export function agingBoardToCsv(rows: Array<{
  tripNumber: string;
  tripTitle: string;
  partyName: string | null;
  supplierName: string | null;
  label: string;
  direction: string;
  outstanding: number;
  currency: string;
  dueAt: string | null;
  daysPastDue: number | null;
  bucket: string;
  status: string;
}>): string {
  return rowsToCsv(
    [
      'Trip number',
      'Trip title',
      'Party / supplier',
      'Label',
      'Direction',
      'Outstanding',
      'Currency',
      'Due',
      'Days past due',
      'Age',
      'Status',
    ],
    rows.map((r) => [
      r.tripNumber,
      r.tripTitle,
      r.supplierName || r.partyName || '',
      r.label,
      r.direction,
      r.outstanding,
      r.currency,
      r.dueAt ? r.dueAt.slice(0, 10) : '',
      r.daysPastDue ?? '',
      BUCKET_LABELS[r.bucket] || r.bucket,
      r.status,
    ]),
  );
}

export function portfolioBoardToCsv(rows: Array<{
  tripNumber: string;
  tripTitle: string;
  partyName: string | null;
  startDate: string | null;
  endDate: string | null;
  quoteNumber: string | null;
  versionNumber: number | null;
  sellTotal: number;
  costTotal: number;
  taxTotal: number;
  marginAmount: number;
  marginPercent: number;
  tripStatus: string;
  currency: string;
}>): string {
  return rowsToCsv(
    [
      'Trip number',
      'Trip title',
      'Party',
      'Start',
      'End',
      'Quote',
      'Version',
      'Sell',
      'Cost',
      'Tax',
      'Margin',
      'Margin %',
      'Status',
      'Currency',
    ],
    rows.map((r) => [
      r.tripNumber,
      r.tripTitle,
      r.partyName || '',
      r.startDate || '',
      r.endDate || '',
      r.quoteNumber || '',
      r.versionNumber ?? '',
      r.sellTotal,
      r.costTotal,
      r.taxTotal,
      r.marginAmount,
      r.marginPercent,
      r.tripStatus,
      r.currency,
    ]),
  );
}
