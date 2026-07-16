/**
 * GST e-invoice / IRN adapter stub.
 * Swap NoopEInvoiceProvider for a NIC GSP client when credentials exist.
 */
export type EInvoiceRequest = {
  organizationId: string;
  documentId: string;
  documentNumber: string;
  amount: number;
  taxAmount: number;
  currency: string;
  buyerLabel?: string;
};

export type EInvoiceAck = {
  provider: string;
  status: 'skipped' | 'queued' | 'acked' | 'failed';
  irn?: string | null;
  ackNo?: string | null;
  raw?: Record<string, unknown>;
  message?: string;
};

export interface EInvoiceProvider {
  submit(req: EInvoiceRequest): Promise<EInvoiceAck>;
}

export class NoopEInvoiceProvider implements EInvoiceProvider {
  async submit(req: EInvoiceRequest): Promise<EInvoiceAck> {
    return {
      provider: 'noop',
      status: 'skipped',
      irn: null,
      message:
        'E-invoice provider not configured. Set RAZORPAY_* unrelated — configure NIC GSP credentials to enable IRN.',
      raw: { documentId: req.documentId, documentNumber: req.documentNumber },
    };
  }
}

/** Demo provider that fabricates an IRN-shaped ack for local/pilot demos. */
export class DemoEInvoiceProvider implements EInvoiceProvider {
  async submit(req: EInvoiceRequest): Promise<EInvoiceAck> {
    const irn = `DEMO${Date.now().toString(16).toUpperCase()}${req.documentId.slice(-6).toUpperCase()}`;
    return {
      provider: 'demo',
      status: 'acked',
      irn,
      ackNo: `ACK-${Date.now()}`,
      raw: {
        note: 'Demo IRN — not filed with NIC',
        amount: req.amount,
        taxAmount: req.taxAmount,
      },
    };
  }
}

export function createEInvoiceProvider(): EInvoiceProvider {
  const mode = (process.env.EINVOICE_PROVIDER || 'noop').toLowerCase();
  if (mode === 'demo') return new DemoEInvoiceProvider();
  return new NoopEInvoiceProvider();
}
