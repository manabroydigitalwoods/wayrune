import { describe, expect, it, vi } from 'vitest';
import {
  createEInvoiceProvider,
  NicGspEInvoiceProvider,
} from './e-invoice.provider';

describe('e-invoice provider', () => {
  const req = {
    organizationId: 'org1',
    documentId: 'doc1',
    documentNumber: 'GC-1',
    amount: 100,
    taxAmount: 18,
    currency: 'INR',
  };

  it('defaults to noop', async () => {
    const ack = await createEInvoiceProvider({}).submit(req);
    expect(ack.status).toBe('skipped');
    expect(ack.provider).toBe('noop');
  });

  it('nic mode fails closed without credentials', async () => {
    const ack = await createEInvoiceProvider({
      EINVOICE_PROVIDER: 'nic',
    }).submit(req);
    expect(ack.status).toBe('failed');
    expect(ack.provider).toBe('nic_gsp');
  });

  it('nic mode acks when GSP returns irn', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ irn: 'IRN123', ackNo: 'A1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new NicGspEInvoiceProvider(
      'https://gsp.example/irn',
      'secret',
      fetchImpl as unknown as typeof fetch,
    );
    const ack = await provider.submit(req);
    expect(ack.status).toBe('acked');
    expect(ack.irn).toBe('IRN123');
  });
});
