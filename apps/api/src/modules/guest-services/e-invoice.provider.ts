/**
 * GST e-invoice / IRN adapter.
 * Swap Noop for Demo (local) or NicGsp (live) when credentials exist.
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
        'E-invoice provider not configured. Set EINVOICE_PROVIDER=nic with EINVOICE_GSP_URL + EINVOICE_GSP_API_KEY for live IRN.',
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

/**
 * Live NIC GSP HTTP client. Fail-closed without URL/API key or on non-2xx.
 * Expects GSP to accept POST JSON and return { irn, ackNo?, ... }.
 */
export class NicGspEInvoiceProvider implements EInvoiceProvider {
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async submit(req: EInvoiceRequest): Promise<EInvoiceAck> {
    if (!this.url.trim() || !this.apiKey.trim()) {
      return {
        provider: 'nic_gsp',
        status: 'failed',
        irn: null,
        message: 'EINVOICE_GSP_URL and EINVOICE_GSP_API_KEY are required for live IRN',
      };
    }
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          organizationId: req.organizationId,
          documentId: req.documentId,
          documentNumber: req.documentNumber,
          amount: req.amount,
          taxAmount: req.taxAmount,
          currency: req.currency,
          buyerLabel: req.buyerLabel,
        }),
      });
      const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return {
          provider: 'nic_gsp',
          status: 'failed',
          irn: null,
          message: `GSP HTTP ${res.status}`,
          raw,
        };
      }
      const irn = typeof raw.irn === 'string' ? raw.irn : null;
      if (!irn) {
        return {
          provider: 'nic_gsp',
          status: 'failed',
          irn: null,
          message: 'GSP response missing irn',
          raw,
        };
      }
      return {
        provider: 'nic_gsp',
        status: 'acked',
        irn,
        ackNo: typeof raw.ackNo === 'string' ? raw.ackNo : null,
        raw,
      };
    } catch (e) {
      return {
        provider: 'nic_gsp',
        status: 'failed',
        irn: null,
        message: e instanceof Error ? e.message : 'GSP request failed',
      };
    }
  }
}

export function createEInvoiceProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): EInvoiceProvider {
  const mode = (env.EINVOICE_PROVIDER || 'noop').toLowerCase();
  if (mode === 'demo') return new DemoEInvoiceProvider();
  if (mode === 'nic' || mode === 'gsp' || mode === 'nic_gsp') {
    return new NicGspEInvoiceProvider(
      env.EINVOICE_GSP_URL || '',
      env.EINVOICE_GSP_API_KEY || '',
      fetchImpl,
    );
  }
  return new NoopEInvoiceProvider();
}
