/**
 * Weekly-effective org FX auto-refresh (worker).
 * Hourly tick; refreshes when fxRatesMeta.fetchedAt is missing or older than 7d.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  applyFxRefreshToSettingsJson,
  fetchFrankfurterOrgFxRates,
  fxAutoRefreshDue,
  parseOrgFxRatesMeta,
} from '@wayrune/contracts';

type Log = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
};

export async function runOrgFxAutoRefresh(opts: {
  prisma: PrismaClient;
  log?: Log;
  now?: Date;
  fetchImpl?: typeof fetch;
  take?: number;
}): Promise<{ checked: number; refreshed: number; skipped: number; failed: number }> {
  const now = opts.now ?? new Date();
  const orgs = await opts.prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, currency: true, settingsJson: true },
    take: opts.take ?? 200,
    orderBy: { createdAt: 'asc' },
  });

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const org of orgs) {
    const meta = parseOrgFxRatesMeta(org.settingsJson);
    if (!fxAutoRefreshDue(meta, now)) {
      skipped += 1;
      continue;
    }

    const baseCurrency =
      String(org.currency || 'INR').trim().toUpperCase() || 'INR';
    try {
      const fetched = await fetchFrankfurterOrgFxRates({
        baseCurrency,
        fetchImpl: opts.fetchImpl,
        now,
      });
      const nextSettings = applyFxRefreshToSettingsJson(
        org.settingsJson,
        fetched,
      );
      await opts.prisma.organization.update({
        where: { id: org.id },
        data: { settingsJson: nextSettings as Prisma.InputJsonValue },
      });
      refreshed += 1;
      opts.log?.info('Org FX auto-refresh wrote rates', {
        organizationId: org.id,
        refreshed: fetched.meta.refreshed,
        skipped: fetched.meta.skipped,
      });
    } catch (err) {
      failed += 1;
      opts.log?.warn('Org FX auto-refresh failed', {
        organizationId: org.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  opts.log?.info('Org FX auto-refresh tick', {
    checked: orgs.length,
    refreshed,
    skipped,
    failed,
  });

  return { checked: orgs.length, refreshed, skipped, failed };
}
