/** Client-side CSV download for finance report pages. */

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

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadRowsAsCsv(
  fileName: string,
  headers: string[],
  rows: Array<Array<unknown>>,
) {
  downloadCsv(fileName, rowsToCsv(headers, rows));
}
