import { describe, expect, it } from 'vitest';
import { packDeliveryHonestyCue } from './financeReportPacks';
import type { FinanceReportPack } from '@wayrune/contracts';

const base: FinanceReportPack = {
  id: 'p1',
  name: 'Overdue AR',
  aging: { direction: 'customer', overdueOnly: true },
  updatedAt: '2026-07-20T00:00:00.000Z',
};

describe('packDeliveryHonestyCue', () => {
  it('returns empty when delivery is off', () => {
    expect(packDeliveryHonestyCue(base)).toBe('');
  });

  it('shows never emailed and due now before first SMTP success', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    expect(
      packDeliveryHonestyCue(
        {
          ...base,
          delivery: {
            enabled: true,
            cadence: 'weekly',
            toEmails: ['ops@demo.travel'],
          },
        },
        now,
      ),
    ).toBe('weekly · never emailed · next due now');
  });

  it('shows last + next day after a successful send', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    const cue = packDeliveryHonestyCue(
      {
        ...base,
        delivery: {
          enabled: true,
          cadence: 'weekly',
          toEmails: ['ops@demo.travel'],
          lastSentAt: '2026-07-19T12:00:00.000Z',
        },
      },
      now,
    );
    expect(cue.startsWith('weekly · last ')).toBe(true);
    expect(cue.includes(' · next ')).toBe(true);
    expect(cue.includes('next due now')).toBe(false);
  });
});
