/**
 * Scheduled finance report pack delivery (worker).
 * Builds CSV from Prisma + emails via nodemailer; advances delivery.lastSentAt.
 * Pack shape mirrors @wayrune/contracts finance-report-packs (settingsJson).
 */
import { existsSync } from 'fs';
import { join } from 'path';
import type { Prisma, PrismaClient } from '@prisma/client';

const FINANCE_REPORT_PACKS_SETTINGS_KEY = 'financeReportPacks';

type FinanceReportPack = {
  id: string;
  name: string;
  portfolio?: { from: string; to: string };
  aging?: {
    direction: 'customer' | 'supplier' | 'all';
    overdueOnly: boolean;
  };
  delivery?: {
    enabled: boolean;
    cadence: 'daily' | 'weekly';
    toEmails: string[];
    lastSentAt?: string;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseFinanceReportPacks(settingsJson: unknown): FinanceReportPack[] {
  const raw = asRecord(settingsJson)[FINANCE_REPORT_PACKS_SETTINGS_KEY];
  if (!Array.isArray(raw)) return [];
  const out: FinanceReportPack[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    const deliveryRaw =
      row.delivery && typeof row.delivery === 'object'
        ? (row.delivery as Record<string, unknown>)
        : null;
    const agingRaw =
      row.aging && typeof row.aging === 'object'
        ? (row.aging as Record<string, unknown>)
        : null;
    const portfolioRaw =
      row.portfolio && typeof row.portfolio === 'object'
        ? (row.portfolio as Record<string, unknown>)
        : null;
    const pack: FinanceReportPack = {
      id: row.id,
      name: row.name,
    };
    if (agingRaw && typeof agingRaw.direction === 'string') {
      pack.aging = {
        direction:
          agingRaw.direction === 'supplier'
            ? 'supplier'
            : agingRaw.direction === 'all'
              ? 'all'
              : 'customer',
        overdueOnly: Boolean(agingRaw.overdueOnly),
      };
    }
    if (portfolioRaw) {
      pack.portfolio = {
        from: typeof portfolioRaw.from === 'string' ? portfolioRaw.from : '',
        to: typeof portfolioRaw.to === 'string' ? portfolioRaw.to : '',
      };
    }
    if (deliveryRaw && Array.isArray(deliveryRaw.toEmails)) {
      pack.delivery = {
        enabled: Boolean(deliveryRaw.enabled),
        cadence: deliveryRaw.cadence === 'daily' ? 'daily' : 'weekly',
        toEmails: deliveryRaw.toEmails.filter(
          (e): e is string => typeof e === 'string' && e.includes('@'),
        ),
        ...(typeof deliveryRaw.lastSentAt === 'string'
          ? { lastSentAt: deliveryRaw.lastSentAt }
          : {}),
      };
    }
    if (pack.portfolio || pack.aging) out.push(pack);
  }
  return out;
}

function financeReportPackDeliveryDue(
  delivery: FinanceReportPack['delivery'],
  now = new Date(),
): boolean {
  if (!delivery?.enabled) return false;
  if (!delivery.toEmails?.length) return false;
  if (!delivery.lastSentAt) return true;
  const last = new Date(delivery.lastSentAt);
  if (Number.isNaN(last.getTime())) return true;
  const ms = now.getTime() - last.getTime();
  const day = 24 * 60 * 60 * 1000;
  return delivery.cadence === 'weekly' ? ms >= 7 * day : ms >= day;
}

function escapeCsvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

function daysPastDue(dueAt: Date | null, now: Date): number | null {
  if (!dueAt) return null;
  const start = (d: Date) => {
    const o = new Date(d);
    o.setHours(0, 0, 0, 0);
    return o;
  };
  return Math.floor(
    (start(now).getTime() - start(dueAt).getTime()) / (24 * 60 * 60 * 1000),
  );
}

function agingBucket(days: number | null): string {
  if (days == null) return 'noDue';
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

async function buildAgingCsv(
  prisma: PrismaClient,
  orgId: string,
  pack: FinanceReportPack,
): Promise<string | null> {
  if (!pack.aging) return null;
  const now = new Date();
  const payments = await prisma.tripPayment.findMany({
    where: {
      organizationId: orgId,
      status: { notIn: ['paid', 'cancelled'] },
      trip: { deletedAt: null },
    },
    select: {
      direction: true,
      label: true,
      amount: true,
      amountPaid: true,
      currency: true,
      dueAt: true,
      status: true,
      trip: {
        select: {
          tripNumber: true,
          title: true,
          party: { select: { displayName: true } },
        },
      },
      supplierInvoice: { select: { supplier: { select: { name: true } } } },
      bookingComponent: { select: { supplier: { select: { name: true } } } },
    },
  });

  const rows: Array<Array<unknown>> = [];
  for (const p of payments) {
    const direction = p.direction === 'supplier' ? 'supplier' : 'customer';
    if (pack.aging.direction !== 'all' && direction !== pack.aging.direction) {
      continue;
    }
    const outstanding = Math.max(
      0,
      Math.round((Number(p.amount) - Number(p.amountPaid || 0)) * 100) / 100,
    );
    if (outstanding <= 0.001) continue;
    const days = daysPastDue(p.dueAt, now);
    if (pack.aging.overdueOnly) {
      const pastDue = days != null ? days > 0 : p.status === 'overdue';
      if (!pastDue) continue;
    }
    rows.push([
      p.trip.tripNumber,
      p.trip.title,
      p.supplierInvoice?.supplier?.name ||
        p.bookingComponent?.supplier?.name ||
        p.trip.party?.displayName ||
        '',
      p.label,
      direction,
      outstanding,
      p.currency || 'INR',
      p.dueAt ? p.dueAt.toISOString().slice(0, 10) : '',
      days ?? '',
      agingBucket(days),
      p.status,
    ]);
  }

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
    rows,
  );
}

async function buildPortfolioCsv(
  prisma: PrismaClient,
  orgId: string,
  pack: FinanceReportPack,
): Promise<string | null> {
  if (!pack.portfolio) return null;
  const from = pack.portfolio.from || null;
  const to = pack.portfolio.to || null;
  const trips = await prisma.trip.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      quotations: {
        some: { versions: { some: { status: 'accepted' } } },
      },
    },
    select: {
      tripNumber: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      party: { select: { displayName: true } },
      quotations: {
        select: {
          quoteNumber: true,
          versions: {
            where: { status: 'accepted' },
            orderBy: { acceptedAt: 'desc' },
            take: 1,
            select: {
              versionNumber: true,
              currency: true,
              sellTotal: true,
              costTotal: true,
              taxTotal: true,
              marginAmount: true,
              marginPercent: true,
            },
          },
        },
      },
    },
  });

  const rows: Array<Array<unknown>> = [];
  for (const trip of trips) {
    const accepted = trip.quotations.flatMap((q) =>
      q.versions.map((v) => ({ ...v, quoteNumber: q.quoteNumber })),
    )[0];
    if (!accepted) continue;
    const start = trip.startDate
      ? trip.startDate.toISOString().slice(0, 10)
      : null;
    if (from && (!start || start < from)) continue;
    if (to && (!start || start > to)) continue;
    rows.push([
      trip.tripNumber,
      trip.title,
      trip.party?.displayName || '',
      start || '',
      trip.endDate ? trip.endDate.toISOString().slice(0, 10) : '',
      accepted.quoteNumber || '',
      accepted.versionNumber ?? '',
      Number(accepted.sellTotal),
      Number(accepted.costTotal),
      Number(accepted.taxTotal),
      Number(accepted.marginAmount),
      Number(accepted.marginPercent),
      trip.status,
      accepted.currency || 'INR',
    ]);
  }

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
    rows,
  );
}

function markPackSent(
  settingsJson: unknown,
  packId: string,
  lastSentAt: string,
): Prisma.InputJsonObject {
  const packs = parseFinanceReportPacks(settingsJson).map((p) => {
    if (p.id !== packId || !p.delivery) return p;
    return {
      ...p,
      delivery: { ...p.delivery, lastSentAt },
      updatedAt: lastSentAt,
    };
  });
  return {
    ...asRecord(settingsJson),
    [FINANCE_REPORT_PACKS_SETTINGS_KEY]: packs,
  } as Prisma.InputJsonObject;
}

export type SendEmailFn = (input: {
  to: string;
  subject: string;
  text: string;
  attachments?: {
    filename: string;
    content?: Buffer;
    path?: string;
    contentType?: string;
  }[];
}) => Promise<{ skipped: boolean }>;

export async function runFinanceReportPackDeliveries(input: {
  prisma: PrismaClient;
  sendEmail: SendEmailFn;
  log: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
  };
}) {
  const { prisma, sendEmail, log } = input;
  const now = new Date();
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, settingsJson: true },
    take: 200,
  });

  for (const org of orgs) {
    const packs = parseFinanceReportPacks(org.settingsJson).filter((p) =>
      financeReportPackDeliveryDue(p.delivery, now),
    );
    if (!packs.length) continue;

    let settingsJson: Prisma.InputJsonValue =
      org.settingsJson as Prisma.InputJsonValue;
    for (const pack of packs) {
      const toEmails = pack.delivery?.toEmails || [];
      if (!toEmails.length) continue;

      try {
        const attachments: {
          filename: string;
          content: Buffer;
          contentType: string;
        }[] = [];
        const stamp = now.toISOString().slice(0, 10);
        const safe = pack.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 40);

        const agingCsv = await buildAgingCsv(prisma, org.id, pack);
        if (agingCsv) {
          attachments.push({
            filename: `aging-${safe}-${stamp}.csv`,
            content: Buffer.from(agingCsv, 'utf8'),
            contentType: 'text/csv',
          });
        }
        const portfolioCsv = await buildPortfolioCsv(prisma, org.id, pack);
        if (portfolioCsv) {
          attachments.push({
            filename: `portfolio-${safe}-${stamp}.csv`,
            content: Buffer.from(portfolioCsv, 'utf8'),
            contentType: 'text/csv',
          });
        }
        if (!attachments.length) {
          log.warn('Finance report pack has no CSV payload', {
            organizationId: org.id,
            packId: pack.id,
          });
          continue;
        }

        const subject = `Finance report — ${pack.name}`;
        const text = [
          `Hello,`,
          ``,
          `Attached is the ${pack.delivery?.cadence || 'scheduled'} finance report pack “${pack.name}” for ${org.name}.`,
          ``,
          `Generated ${now.toISOString()}.`,
        ].join('\n');

        let anySkipped = false;
        let anySent = false;
        for (const to of toEmails) {
          const result = await sendEmail({
            to,
            subject,
            text,
            attachments,
          });
          if (result.skipped) anySkipped = true;
          else anySent = true;
        }

        if (!anySent) {
          log.warn('Finance report pack SMTP skipped — not advancing lastSentAt', {
            organizationId: org.id,
            packId: pack.id,
            toCount: toEmails.length,
            smtpSkipped: anySkipped,
          });
          continue;
        }

        const lastSentAt = now.toISOString();
        settingsJson = markPackSent(settingsJson, pack.id, lastSentAt);
        await prisma.organization.update({
          where: { id: org.id },
          data: { settingsJson },
        });

        log.info('Finance report pack delivered', {
          organizationId: org.id,
          packId: pack.id,
          toCount: toEmails.length,
          attachmentCount: attachments.length,
          smtpSkipped: anySkipped,
        });
      } catch (err) {
        log.warn('Finance report pack delivery failed', {
          organizationId: org.id,
          packId: pack.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

/** Resolve path attachments for API-queued finance.report-pack.email events. */
export function resolveCsvAttachmentsFromPayload(
  payload: Record<string, unknown>,
  uploadRoot: string,
): { filename: string; path: string; contentType: string }[] {
  const raw = Array.isArray(payload.attachments) ? payload.attachments : [];
  const out: { filename: string; path: string; contentType: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const storageKey =
      typeof row.storageKey === 'string' ? row.storageKey : '';
    if (!storageKey) continue;
    const absolutePath = join(uploadRoot, storageKey);
    if (!existsSync(absolutePath)) {
      throw new Error(
        `finance.report-pack.email CSV missing on disk: ${storageKey}`,
      );
    }
    out.push({
      filename:
        typeof row.fileName === 'string' && row.fileName
          ? row.fileName
          : 'report.csv',
      path: absolutePath,
      contentType:
        typeof row.mimeType === 'string' && row.mimeType
          ? row.mimeType
          : 'text/csv',
    });
  }
  return out;
}
