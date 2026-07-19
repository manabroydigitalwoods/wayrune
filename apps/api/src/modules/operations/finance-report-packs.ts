import {
  CreateFinanceReportPackSchema,
  FINANCE_REPORT_PACKS_MAX,
  FINANCE_REPORT_PACKS_SETTINGS_KEY,
  FinanceReportPackSchema,
  UpdateFinanceReportPackSchema,
  parseFinanceReportPacks,
  type CreateFinanceReportPackInput,
  type FinanceReportPack,
  type UpdateFinanceReportPackInput,
} from '@wayrune/contracts';

export {
  FINANCE_REPORT_PACKS_MAX,
  FINANCE_REPORT_PACKS_SETTINGS_KEY,
  parseFinanceReportPacks,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function listFinanceReportPacksFromSettings(
  settingsJson: unknown,
): FinanceReportPack[] {
  return parseFinanceReportPacks(settingsJson);
}

export function upsertFinanceReportPackInSettings(input: {
  settingsJson: unknown;
  create?: CreateFinanceReportPackInput;
  update?: { id: string; patch: UpdateFinanceReportPackInput };
  removeId?: string;
  /** Worker-only: set delivery.lastSentAt without clearing other delivery fields. */
  markSent?: { id: string; lastSentAt: string };
  createdByUserId?: string;
  now?: string;
}): { packs: FinanceReportPack[]; settingsJson: Record<string, unknown> } {
  const now = input.now ?? new Date().toISOString();
  let packs = listFinanceReportPacksFromSettings(input.settingsJson);

  if (input.removeId) {
    packs = packs.filter((p) => p.id !== input.removeId);
  } else if (input.markSent) {
    const idx = packs.findIndex((p) => p.id === input.markSent!.id);
    if (idx < 0) throw new Error('Report pack not found');
    const current = packs[idx]!;
    if (!current.delivery) throw new Error('Report pack has no delivery settings');
    const next = FinanceReportPackSchema.parse({
      ...current,
      delivery: {
        ...current.delivery,
        lastSentAt: input.markSent.lastSentAt,
      },
      updatedAt: now,
    });
    packs = packs.map((p, i) => (i === idx ? next : p));
  } else if (input.create) {
    const body = CreateFinanceReportPackSchema.parse(input.create);
    if (packs.length >= FINANCE_REPORT_PACKS_MAX) {
      throw new Error(
        `At most ${FINANCE_REPORT_PACKS_MAX} org report packs are allowed`,
      );
    }
    const duplicate = packs.some(
      (p) => p.name.toLowerCase() === body.name.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`A report pack named “${body.name}” already exists`);
    }
    const pack = FinanceReportPackSchema.parse({
      id: `frp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: body.name,
      portfolio: body.portfolio,
      aging: body.aging,
      delivery: body.delivery,
      createdByUserId: input.createdByUserId,
      updatedAt: now,
    });
    packs = [pack, ...packs];
  } else if (input.update) {
    const patch = UpdateFinanceReportPackSchema.parse(input.update.patch);
    const idx = packs.findIndex((p) => p.id === input.update!.id);
    if (idx < 0) throw new Error('Report pack not found');
    const current = packs[idx]!;
    if (patch.name) {
      const clash = packs.some(
        (p) =>
          p.id !== current.id &&
          p.name.toLowerCase() === patch.name!.toLowerCase(),
      );
      if (clash) {
        throw new Error(`A report pack named “${patch.name}” already exists`);
      }
    }
    const nextPortfolio =
      patch.portfolio === undefined
        ? current.portfolio
        : patch.portfolio === null
          ? undefined
          : patch.portfolio;
    const nextAging =
      patch.aging === undefined
        ? current.aging
        : patch.aging === null
          ? undefined
          : patch.aging;
    if (!nextPortfolio && !nextAging) {
      throw new Error('Pack must include portfolio and/or aging filters');
    }
    let nextDelivery = current.delivery;
    if (patch.delivery === null) {
      nextDelivery = undefined;
    } else if (patch.delivery !== undefined) {
      nextDelivery = {
        ...patch.delivery,
        // Preserve worker-owned lastSentAt across client edits
        ...(current.delivery?.lastSentAt
          ? { lastSentAt: current.delivery.lastSentAt }
          : {}),
      };
    }
    const next = FinanceReportPackSchema.parse({
      ...current,
      name: patch.name ?? current.name,
      portfolio: nextPortfolio,
      aging: nextAging,
      delivery: nextDelivery,
      updatedAt: now,
    });
    packs = packs.map((p, i) => (i === idx ? next : p));
  }

  const settingsJson = {
    ...asRecord(input.settingsJson),
    [FINANCE_REPORT_PACKS_SETTINGS_KEY]: packs,
  };
  return { packs, settingsJson };
}
