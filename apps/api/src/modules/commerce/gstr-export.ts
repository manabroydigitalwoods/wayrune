/**
 * Structured tax breakdown on commercial documents (export-friendly).
 * Display / export only — not GST-compliant books or filing.
 */

export type CommercialTaxBreakdown = {
  regime: 'intra' | 'inter' | 'unknown';
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  hsn?: string | null;
  source: 'display_split' | 'manual' | 'import';
};

export function buildCommercialTaxBreakdown(input: {
  taxTotal: number;
  regime?: 'intra' | 'inter' | 'unknown';
  cgst?: number;
  sgst?: number;
  igst?: number;
  hsn?: string | null;
  source?: CommercialTaxBreakdown['source'];
}): CommercialTaxBreakdown | null {
  const taxTotal = Math.round(Number(input.taxTotal) * 100) / 100;
  if (!(taxTotal > 0)) return null;
  const regime = input.regime ?? 'unknown';
  let cgst = Math.round(Number(input.cgst ?? 0) * 100) / 100;
  let sgst = Math.round(Number(input.sgst ?? 0) * 100) / 100;
  let igst = Math.round(Number(input.igst ?? 0) * 100) / 100;
  if (cgst === 0 && sgst === 0 && igst === 0) {
    if (regime === 'intra') {
      cgst = Math.round((taxTotal / 2) * 100) / 100;
      sgst = Math.round((taxTotal - cgst) * 100) / 100;
    } else if (regime === 'inter') {
      igst = taxTotal;
    }
  }
  return {
    regime,
    cgst,
    sgst,
    igst,
    taxTotal,
    hsn: input.hsn?.trim() || null,
    source: input.source ?? 'display_split',
  };
}

export type GstrExportRow = {
  documentId: string;
  documentNumber: string | null;
  docType: string;
  direction: string;
  label: string;
  status: string;
  currency: string;
  amount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  hsn: string;
  paidAt: string | null;
  paymentAmount: number | null;
  createdAt: string;
};

export function commercialDocsToGstrExportRows(
  docs: Array<{
    id: string;
    documentNumber: string | null;
    docType: string;
    direction: string;
    label: string;
    status: string;
    currency: string;
    amount: number | string;
    taxAmount: number | string;
    taxBreakdownJson?: unknown;
    createdAt: Date | string;
    payments?: Array<{
      amount: number | string;
      paidAt: Date | string | null;
    }>;
  }>,
): GstrExportRow[] {
  const rows: GstrExportRow[] = [];
  for (const d of docs) {
    const br = parseBreakdown(d.taxBreakdownJson);
    const base = {
      documentId: d.id,
      documentNumber: d.documentNumber,
      docType: d.docType,
      direction: d.direction,
      label: d.label,
      status: d.status,
      currency: d.currency,
      amount: Number(d.amount),
      taxAmount: Number(d.taxAmount),
      cgst: br?.cgst ?? 0,
      sgst: br?.sgst ?? 0,
      igst: br?.igst ?? 0,
      hsn: br?.hsn ?? '',
      createdAt: new Date(d.createdAt).toISOString(),
    };
    const payments = d.payments?.length
      ? d.payments
      : [{ amount: null as number | string | null, paidAt: null }];
    for (const p of payments) {
      rows.push({
        ...base,
        paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null,
        paymentAmount: p.amount != null ? Number(p.amount) : null,
      });
    }
  }
  return rows;
}

function parseBreakdown(raw: unknown): CommercialTaxBreakdown | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const taxTotal = Number(o.taxTotal);
  if (!(taxTotal > 0)) return null;
  return {
    regime:
      o.regime === 'intra' || o.regime === 'inter' || o.regime === 'unknown'
        ? o.regime
        : 'unknown',
    cgst: Number(o.cgst) || 0,
    sgst: Number(o.sgst) || 0,
    igst: Number(o.igst) || 0,
    taxTotal,
    hsn: typeof o.hsn === 'string' ? o.hsn : null,
    source:
      o.source === 'manual' || o.source === 'import' || o.source === 'display_split'
        ? o.source
        : 'display_split',
  };
}

export function gstrExportRowsToCsv(rows: GstrExportRow[]): string {
  const headers = [
    'documentId',
    'documentNumber',
    'docType',
    'direction',
    'label',
    'status',
    'currency',
    'amount',
    'taxAmount',
    'cgst',
    'sgst',
    'igst',
    'hsn',
    'paidAt',
    'paymentAmount',
    'createdAt',
  ];
  const escape = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.documentId,
        r.documentNumber,
        r.docType,
        r.direction,
        r.label,
        r.status,
        r.currency,
        r.amount,
        r.taxAmount,
        r.cgst,
        r.sgst,
        r.igst,
        r.hsn,
        r.paidAt,
        r.paymentAmount,
        r.createdAt,
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
