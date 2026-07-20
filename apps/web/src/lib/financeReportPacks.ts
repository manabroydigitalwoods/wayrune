import type { FinanceReportPack } from '@wayrune/contracts';
import { financeReportPackNextDueAt } from '@wayrune/contracts';
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

function shortDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Chip cue for scheduled packs: cadence · last emailed · next due.
 * lastSentAt is worker SMTP success only — Email now does not advance it.
 */
export function packDeliveryHonestyCue(
  pack: FinanceReportPack,
  now = new Date(),
): string {
  const d = pack.delivery;
  if (!d?.enabled) return '';
  const cadence = d.cadence === 'daily' ? 'daily' : 'weekly';
  const last = d.lastSentAt
    ? `last ${shortDayLabel(d.lastSentAt)}`
    : 'never emailed';
  const nextIso = financeReportPackNextDueAt(d, now);
  let next = '';
  if (nextIso) {
    next =
      new Date(nextIso).getTime() <= now.getTime()
        ? 'next due now'
        : `next ${shortDayLabel(nextIso)}`;
  }
  return [cadence, last, next].filter(Boolean).join(' · ');
}
