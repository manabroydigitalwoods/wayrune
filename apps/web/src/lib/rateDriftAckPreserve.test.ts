import { describe, expect, it } from 'vitest';

/**
 * Mirror of quotations.service preserveExistingRateDriftAcks for unit coverage
 * without spinning Nest.
 */
function preserveExistingRateDriftAcks(
  incoming: Array<{
    id: string;
    rateProvenance?: {
      rateDriftAckForUpdatedAt?: string;
      rateDriftAckReason?: string;
      [k: string]: unknown;
    };
  }>,
  existing: Array<{
    id: string;
    rateProvenance?: {
      rateDriftAckForUpdatedAt?: string;
      rateDriftAckReason?: string;
      [k: string]: unknown;
    };
  }>,
) {
  const byId = new Map(existing.map((row) => [row.id, row]));
  return incoming.map((item) => {
    const prev = byId.get(item.id);
    const prevProv = prev?.rateProvenance;
    const nextProv = item.rateProvenance;
    if (!nextProv && !prevProv) return item;

    const nextAck = nextProv?.rateDriftAckForUpdatedAt?.trim() || '';
    const nextReason = nextProv?.rateDriftAckReason?.trim() || '';
    const prevAck = prevProv?.rateDriftAckForUpdatedAt?.trim() || '';
    const prevReason = prevProv?.rateDriftAckReason?.trim() || '';

    const rateProvenance = nextProv ? { ...nextProv } : undefined;
    if (!rateProvenance) return { ...item, rateProvenance };

    const cleared = !nextAck || !nextReason;
    const same = nextAck === prevAck && nextReason === prevReason;
    if (cleared) {
      delete rateProvenance.rateDriftAckForUpdatedAt;
      delete rateProvenance.rateDriftAckReason;
    } else if (!same) {
      if (prevAck && prevReason) {
        rateProvenance.rateDriftAckForUpdatedAt =
          prevProv!.rateDriftAckForUpdatedAt;
        rateProvenance.rateDriftAckReason = prevProv!.rateDriftAckReason;
      } else {
        delete rateProvenance.rateDriftAckForUpdatedAt;
        delete rateProvenance.rateDriftAckReason;
      }
    }

    return { ...item, rateProvenance };
  });
}

describe('preserveExistingRateDriftAcks', () => {
  it('strips forged Keep-buy ack when no prior audited ack', () => {
    const out = preserveExistingRateDriftAcks(
      [
        {
          id: 'a',
          rateProvenance: {
            rateDriftAckForUpdatedAt: '2026-07-19T00:00:00.000Z',
            rateDriftAckReason: 'forged',
          },
        },
      ],
      [{ id: 'a', rateProvenance: {} }],
    );
    expect(out[0]?.rateProvenance?.rateDriftAckForUpdatedAt).toBeUndefined();
    expect(out[0]?.rateProvenance?.rateDriftAckReason).toBeUndefined();
  });

  it('preserves identical audited ack', () => {
    const ack = {
      rateDriftAckForUpdatedAt: '2026-07-19T00:00:00.000Z',
      rateDriftAckReason: 'Supplier holds prior buy',
    };
    const out = preserveExistingRateDriftAcks(
      [{ id: 'a', rateProvenance: { ...ack } }],
      [{ id: 'a', rateProvenance: { ...ack } }],
    );
    expect(out[0]?.rateProvenance?.rateDriftAckForUpdatedAt).toBe(
      ack.rateDriftAckForUpdatedAt,
    );
    expect(out[0]?.rateProvenance?.rateDriftAckReason).toBe(ack.rateDriftAckReason);
  });

  it('rejects mutated reason and restores prior', () => {
    const prior = {
      rateDriftAckForUpdatedAt: '2026-07-19T00:00:00.000Z',
      rateDriftAckReason: 'Audited reason',
    };
    const out = preserveExistingRateDriftAcks(
      [
        {
          id: 'a',
          rateProvenance: {
            rateDriftAckForUpdatedAt: prior.rateDriftAckForUpdatedAt,
            rateDriftAckReason: 'tampered',
          },
        },
      ],
      [{ id: 'a', rateProvenance: { ...prior } }],
    );
    expect(out[0]?.rateProvenance?.rateDriftAckReason).toBe('Audited reason');
  });

  it('allows clearing an ack', () => {
    const out = preserveExistingRateDriftAcks(
      [{ id: 'a', rateProvenance: { matchedAt: '2026-07-01T00:00:00.000Z' } }],
      [
        {
          id: 'a',
          rateProvenance: {
            rateDriftAckForUpdatedAt: '2026-07-19T00:00:00.000Z',
            rateDriftAckReason: 'was acked',
          },
        },
      ],
    );
    expect(out[0]?.rateProvenance?.rateDriftAckForUpdatedAt).toBeUndefined();
    expect(out[0]?.rateProvenance?.rateDriftAckReason).toBeUndefined();
  });
});
