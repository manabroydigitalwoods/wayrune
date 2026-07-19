import { describe, expect, it } from 'vitest';

/**
 * Mirror of quotations.service preserveExistingInventoryRiskAcks for unit coverage
 * without spinning Nest.
 */
function preserveExistingInventoryRiskAcks(
  incoming: Array<{
    id: string;
    rateProvenance?: {
      allotmentRiskAckForNote?: string;
      allotmentRiskAckReason?: string;
      capacityRiskAckForNote?: string;
      capacityRiskAckReason?: string;
      [k: string]: unknown;
    };
  }>,
  existing: Array<{
    id: string;
    rateProvenance?: {
      allotmentRiskAckForNote?: string;
      allotmentRiskAckReason?: string;
      capacityRiskAckForNote?: string;
      capacityRiskAckReason?: string;
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

    const nextAllotmentAck = nextProv?.allotmentRiskAckForNote?.trim() || '';
    const nextAllotmentReason = nextProv?.allotmentRiskAckReason?.trim() || '';
    const prevAllotmentAck = prevProv?.allotmentRiskAckForNote?.trim() || '';
    const prevAllotmentReason = prevProv?.allotmentRiskAckReason?.trim() || '';

    const nextCapacityAck = nextProv?.capacityRiskAckForNote?.trim() || '';
    const nextCapacityReason = nextProv?.capacityRiskAckReason?.trim() || '';
    const prevCapacityAck = prevProv?.capacityRiskAckForNote?.trim() || '';
    const prevCapacityReason = prevProv?.capacityRiskAckReason?.trim() || '';

    const nextMinStayAck = nextProv?.minStayRiskAckForNote?.trim() || '';
    const nextMinStayReason = nextProv?.minStayRiskAckReason?.trim() || '';
    const prevMinStayAck = prevProv?.minStayRiskAckForNote?.trim() || '';
    const prevMinStayReason = prevProv?.minStayRiskAckReason?.trim() || '';

    const rateProvenance = nextProv ? { ...nextProv } : undefined;

    const allotmentCleared = !nextAllotmentAck || !nextAllotmentReason;
    const allotmentSame =
      nextAllotmentAck === prevAllotmentAck &&
      nextAllotmentReason === prevAllotmentReason;
    if (rateProvenance) {
      if (allotmentCleared) {
        delete rateProvenance.allotmentRiskAckForNote;
        delete rateProvenance.allotmentRiskAckReason;
      } else if (!allotmentSame) {
        if (prevAllotmentAck && prevAllotmentReason) {
          rateProvenance.allotmentRiskAckForNote = prevProv!.allotmentRiskAckForNote;
          rateProvenance.allotmentRiskAckReason = prevProv!.allotmentRiskAckReason;
        } else {
          delete rateProvenance.allotmentRiskAckForNote;
          delete rateProvenance.allotmentRiskAckReason;
        }
      }
    }

    const capacityCleared = !nextCapacityAck || !nextCapacityReason;
    const capacitySame =
      nextCapacityAck === prevCapacityAck &&
      nextCapacityReason === prevCapacityReason;
    if (rateProvenance) {
      if (capacityCleared) {
        delete rateProvenance.capacityRiskAckForNote;
        delete rateProvenance.capacityRiskAckReason;
      } else if (!capacitySame) {
        if (prevCapacityAck && prevCapacityReason) {
          rateProvenance.capacityRiskAckForNote = prevProv!.capacityRiskAckForNote;
          rateProvenance.capacityRiskAckReason = prevProv!.capacityRiskAckReason;
        } else {
          delete rateProvenance.capacityRiskAckForNote;
          delete rateProvenance.capacityRiskAckReason;
        }
      }
    }

    const minStayCleared = !nextMinStayAck || !nextMinStayReason;
    const minStaySame =
      nextMinStayAck === prevMinStayAck &&
      nextMinStayReason === prevMinStayReason;
    if (rateProvenance) {
      if (minStayCleared) {
        delete rateProvenance.minStayRiskAckForNote;
        delete rateProvenance.minStayRiskAckReason;
      } else if (!minStaySame) {
        if (prevMinStayAck && prevMinStayReason) {
          rateProvenance.minStayRiskAckForNote = prevProv!.minStayRiskAckForNote;
          rateProvenance.minStayRiskAckReason = prevProv!.minStayRiskAckReason;
        } else {
          delete rateProvenance.minStayRiskAckForNote;
          delete rateProvenance.minStayRiskAckReason;
        }
      }
    }

    return { ...item, rateProvenance };
  });
}

describe('preserveExistingInventoryRiskAcks', () => {
  it('strips forged allotment ack when none was audited', () => {
    const note = 'Insufficient allotment: no rooms remaining for these nights.';
    const out = preserveExistingInventoryRiskAcks(
      [
        {
          id: '1',
          rateProvenance: {
            allotmentWarn: true,
            allotmentNote: note,
            allotmentRiskAckForNote: note,
            allotmentRiskAckReason: 'forged',
          },
        },
      ],
      [
        {
          id: '1',
          rateProvenance: {
            allotmentWarn: true,
            allotmentNote: note,
          },
        },
      ],
    );
    expect(out[0]?.rateProvenance?.allotmentRiskAckForNote).toBeUndefined();
    expect(out[0]?.rateProvenance?.allotmentRiskAckReason).toBeUndefined();
  });

  it('keeps audited ack when fingerprint + reason match', () => {
    const note = 'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).';
    const out = preserveExistingInventoryRiskAcks(
      [
        {
          id: '1',
          rateProvenance: {
            capacityWarn: true,
            capacityNote: note,
            capacityRiskAckForNote: note,
            capacityRiskAckReason: 'Manager OK',
          },
        },
      ],
      [
        {
          id: '1',
          rateProvenance: {
            capacityWarn: true,
            capacityNote: note,
            capacityRiskAckForNote: note,
            capacityRiskAckReason: 'Manager OK',
          },
        },
      ],
    );
    expect(out[0]?.rateProvenance?.capacityRiskAckReason).toBe('Manager OK');
  });

  it('allows clearing an ack on rematch', () => {
    const note = 'Insufficient allotment: no rooms remaining for these nights.';
    const out = preserveExistingInventoryRiskAcks(
      [
        {
          id: '1',
          rateProvenance: {
            allotmentWarn: true,
            allotmentNote: note,
          },
        },
      ],
      [
        {
          id: '1',
          rateProvenance: {
            allotmentWarn: true,
            allotmentNote: note,
            allotmentRiskAckForNote: note,
            allotmentRiskAckReason: 'Was OK',
          },
        },
      ],
    );
    expect(out[0]?.rateProvenance?.allotmentRiskAckForNote).toBeUndefined();
  });

  it('strips forged min-stay ack when none was audited', () => {
    const note = 'Min stay 3 nights — this stay is 2';
    const out = preserveExistingInventoryRiskAcks(
      [
        {
          id: '1',
          rateProvenance: {
            minStayWarn: true,
            minStayNote: note,
            minStayRiskAckForNote: note,
            minStayRiskAckReason: 'forged',
          },
        },
      ],
      [
        {
          id: '1',
          rateProvenance: {
            minStayWarn: true,
            minStayNote: note,
          },
        },
      ],
    );
    expect(out[0]?.rateProvenance?.minStayRiskAckForNote).toBeUndefined();
    expect(out[0]?.rateProvenance?.minStayRiskAckReason).toBeUndefined();
  });
});
