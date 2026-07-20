import { describe, expect, it } from 'vitest';
import {
  financeReportPackDeliveryDue,
  financeReportPackNextDueAt,
} from '@wayrune/contracts';
import {
  listFinanceReportPacksFromSettings,
  upsertFinanceReportPackInSettings,
  FINANCE_REPORT_PACKS_MAX,
} from './finance-report-packs';

describe('finance-report-packs', () => {
  it('parses tolerant settings arrays', () => {
    const packs = listFinanceReportPacksFromSettings({
      financeReportPacks: [
        {
          id: 'a',
          name: 'Q4',
          portfolio: { from: '2026-10-01', to: '2026-12-31' },
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        { id: 'bad' },
      ],
    });
    expect(packs).toHaveLength(1);
    expect(packs[0]?.name).toBe('Q4');
  });

  it('creates portfolio and aging packs', () => {
    const { packs, settingsJson } = upsertFinanceReportPackInSettings({
      settingsJson: {},
      create: {
        name: 'Overdue AR',
        aging: { direction: 'customer', overdueOnly: true },
      },
      createdByUserId: 'u1',
      now: '2026-07-19T00:00:00.000Z',
    });
    expect(packs).toHaveLength(1);
    expect(packs[0]?.aging?.overdueOnly).toBe(true);
    expect(
      (settingsJson.financeReportPacks as unknown[]).length,
    ).toBe(1);

    const again = upsertFinanceReportPackInSettings({
      settingsJson,
      create: {
        name: 'Winter travel',
        portfolio: { from: '2026-12-01', to: '2027-02-28' },
      },
      now: '2026-07-19T01:00:00.000Z',
    });
    expect(again.packs).toHaveLength(2);
    expect(again.packs[0]?.name).toBe('Winter travel');
  });

  it('rejects duplicate names and enforces cap', () => {
    let settingsJson: Record<string, unknown> = {};
    for (let i = 0; i < FINANCE_REPORT_PACKS_MAX; i++) {
      const res = upsertFinanceReportPackInSettings({
        settingsJson,
        create: {
          name: `Pack ${i}`,
          portfolio: { from: '2026-01-01', to: '2026-01-31' },
        },
      });
      settingsJson = res.settingsJson;
    }
    expect(() =>
      upsertFinanceReportPackInSettings({
        settingsJson,
        create: {
          name: 'Overflow',
          portfolio: { from: '', to: '' },
        },
      }),
    ).toThrow(/At most/);

    expect(() =>
      upsertFinanceReportPackInSettings({
        settingsJson: {
          financeReportPacks: [
            {
              id: 'x',
              name: 'Same',
              portfolio: { from: '', to: '' },
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
        create: {
          name: 'same',
          aging: { direction: 'all', overdueOnly: false },
        },
      }),
    ).toThrow(/already exists/);
  });

  it('updates and removes packs', () => {
    const created = upsertFinanceReportPackInSettings({
      settingsJson: {},
      create: {
        name: 'AR',
        aging: { direction: 'customer', overdueOnly: false },
      },
    });
    const id = created.packs[0]!.id;
    const updated = upsertFinanceReportPackInSettings({
      settingsJson: created.settingsJson,
      update: {
        id,
        patch: {
          name: 'AR overdue',
          aging: { direction: 'customer', overdueOnly: true },
          delivery: {
            enabled: true,
            cadence: 'weekly',
            toEmails: ['ops@demo.travel'],
          },
        },
      },
    });
    expect(updated.packs[0]?.name).toBe('AR overdue');
    expect(updated.packs[0]?.aging?.overdueOnly).toBe(true);
    expect(updated.packs[0]?.delivery?.toEmails).toEqual(['ops@demo.travel']);

    const marked = upsertFinanceReportPackInSettings({
      settingsJson: updated.settingsJson,
      markSent: { id, lastSentAt: '2026-07-19T12:00:00.000Z' },
    });
    expect(marked.packs[0]?.delivery?.lastSentAt).toBe(
      '2026-07-19T12:00:00.000Z',
    );

    const removed = upsertFinanceReportPackInSettings({
      settingsJson: marked.settingsJson,
      removeId: id,
    });
    expect(removed.packs).toHaveLength(0);
  });

  it('computes next due from lastSentAt cadence', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    const delivery = {
      enabled: true as const,
      cadence: 'weekly' as const,
      toEmails: ['ops@demo.travel'],
      lastSentAt: '2026-07-19T12:00:00.000Z',
    };
    expect(financeReportPackNextDueAt(delivery, now)).toBe(
      '2026-07-26T12:00:00.000Z',
    );
    expect(financeReportPackDeliveryDue(delivery, now)).toBe(false);
    expect(
      financeReportPackDeliveryDue(
        { ...delivery, lastSentAt: undefined },
        now,
      ),
    ).toBe(true);
  });
});
