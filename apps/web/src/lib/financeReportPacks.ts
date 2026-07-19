import type { FinanceReportPack } from '@wayrune/contracts';
import { api } from '../api';

export type { FinanceReportPack };

export type PackDeliveryInput = {
  enabled: boolean;
  cadence: 'daily' | 'weekly';
  toEmails: string[];
};

export async function listFinanceReportPacks() {
  return api<{ items: FinanceReportPack[] }>(
    '/operations/finance/report-packs',
  );
}

export async function createFinanceReportPack(body: {
  name: string;
  portfolio?: { from: string; to: string };
  aging?: {
    direction: 'customer' | 'supplier' | 'all';
    overdueOnly: boolean;
  };
  delivery?: PackDeliveryInput;
}) {
  return api<{ item: FinanceReportPack }>('/operations/finance/report-packs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateFinanceReportPack(
  packId: string,
  patch: {
    name?: string;
    delivery?: PackDeliveryInput | null;
  },
) {
  return api<{ item: FinanceReportPack }>(
    `/operations/finance/report-packs/${packId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  );
}

export async function deleteFinanceReportPack(packId: string) {
  return api<{ ok: true }>(`/operations/finance/report-packs/${packId}`, {
    method: 'DELETE',
  });
}

export async function sendFinanceReportPack(
  packId: string,
  toEmails?: string[],
) {
  return api<{
    queued: boolean;
    toEmails: string[];
    packName: string;
    attachmentCount: number;
  }>(`/operations/finance/report-packs/${packId}/send`, {
    method: 'POST',
    body: JSON.stringify(toEmails?.length ? { toEmails } : {}),
  });
}

/** Map aging pack filters → agency finance route. */
export function agingPackHref(aging: {
  direction: 'customer' | 'supplier' | 'all';
  overdueOnly: boolean;
}): string {
  if (aging.direction === 'supplier') return '/finance/payables';
  if (aging.overdueOnly) return '/finance/overdue';
  return '/finance';
}
