import { z } from 'zod';

const IsoDateOrEmpty = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  z.literal(''),
]);

export const FinanceReportPackAgingSchema = z.object({
  direction: z.enum(['customer', 'supplier', 'all']),
  overdueOnly: z.boolean(),
});

export const FinanceReportPackPortfolioSchema = z.object({
  from: IsoDateOrEmpty,
  to: IsoDateOrEmpty,
});

export const FinanceReportPackDeliverySchema = z.object({
  enabled: z.boolean(),
  cadence: z.enum(['daily', 'weekly']),
  toEmails: z
    .array(z.string().trim().email('Enter a valid email'))
    .min(1, 'Add at least one email')
    .max(5),
  /** ISO timestamp written by the worker after a successful SMTP send. */
  lastSentAt: z.string().min(1).optional(),
});

/**
 * Org-shared finance report pack (named filters for aging / portfolio).
 * Stored on Organization.settingsJson.financeReportPacks — no Prisma model yet.
 */
export const FinanceReportPackSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    portfolio: FinanceReportPackPortfolioSchema.optional(),
    aging: FinanceReportPackAgingSchema.optional(),
    delivery: FinanceReportPackDeliverySchema.optional(),
    createdByUserId: z.string().min(1).optional(),
    updatedAt: z.string().min(1),
  })
  .refine((p) => Boolean(p.portfolio || p.aging), {
    message: 'Pack must include portfolio and/or aging filters',
  });

export const CreateFinanceReportPackSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    portfolio: FinanceReportPackPortfolioSchema.optional(),
    aging: FinanceReportPackAgingSchema.optional(),
    delivery: FinanceReportPackDeliverySchema.omit({ lastSentAt: true }).optional(),
  })
  .refine((p) => Boolean(p.portfolio || p.aging), {
    message: 'Pack must include portfolio and/or aging filters',
  });

export const UpdateFinanceReportPackSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    portfolio: FinanceReportPackPortfolioSchema.nullable().optional(),
    aging: FinanceReportPackAgingSchema.nullable().optional(),
    delivery: FinanceReportPackDeliverySchema.omit({ lastSentAt: true })
      .nullable()
      .optional(),
  })
  .refine(
    (p) =>
      p.name !== undefined ||
      p.portfolio !== undefined ||
      p.aging !== undefined ||
      p.delivery !== undefined,
    { message: 'No changes' },
  );

export type FinanceReportPack = z.infer<typeof FinanceReportPackSchema>;
export type FinanceReportPackDelivery = z.infer<
  typeof FinanceReportPackDeliverySchema
>;
export type CreateFinanceReportPackInput = z.infer<
  typeof CreateFinanceReportPackSchema
>;
export type UpdateFinanceReportPackInput = z.infer<
  typeof UpdateFinanceReportPackSchema
>;

export const FINANCE_REPORT_PACKS_SETTINGS_KEY = 'financeReportPacks' as const;
export const FINANCE_REPORT_PACKS_MAX = 20;

/** Parse packs array from org settingsJson (tolerant of junk). */
export function parseFinanceReportPacks(settingsJson: unknown): FinanceReportPack[] {
  const root =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? (settingsJson as Record<string, unknown>)
      : {};
  const raw = root[FINANCE_REPORT_PACKS_SETTINGS_KEY];
  if (!Array.isArray(raw)) return [];
  const out: FinanceReportPack[] = [];
  for (const item of raw) {
    const parsed = FinanceReportPackSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function financeReportPackCadenceMs(cadence: 'daily' | 'weekly'): number {
  const day = 24 * 60 * 60 * 1000;
  return cadence === 'weekly' ? 7 * day : day;
}

/**
 * Next eligible send time for an enabled pack (ISO).
 * Never-sent / invalid lastSentAt → `now` (due immediately).
 * Null when delivery is off or has no recipients.
 */
export function financeReportPackNextDueAt(
  delivery: FinanceReportPackDelivery | undefined,
  now = new Date(),
): string | null {
  if (!delivery?.enabled) return null;
  if (!delivery.toEmails?.length) return null;
  const interval = financeReportPackCadenceMs(delivery.cadence);
  if (!delivery.lastSentAt) return now.toISOString();
  const last = new Date(delivery.lastSentAt);
  if (Number.isNaN(last.getTime())) return now.toISOString();
  return new Date(last.getTime() + interval).toISOString();
}

/** Whether a pack with delivery.enabled is due for another send. */
export function financeReportPackDeliveryDue(
  delivery: FinanceReportPackDelivery | undefined,
  now = new Date(),
): boolean {
  const next = financeReportPackNextDueAt(delivery, now);
  if (!next) return false;
  return new Date(next).getTime() <= now.getTime();
}
