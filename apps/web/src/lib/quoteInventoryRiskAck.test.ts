import { describe, expect, it } from 'vitest';
import {
  lineNeedsAllotmentRiskAck,
  lineNeedsCapacityRiskAck,
  lineNeedsMinStayRiskAck,
} from '@wayrune/contracts';

describe('lineNeedsAllotmentRiskAck', () => {
  it('blocks when warn and unacked', () => {
    expect(
      lineNeedsAllotmentRiskAck({
        allotmentWarn: true,
        allotmentNote: 'Insufficient allotment: no rooms remaining for these nights.',
      }),
    ).toBe(true);
  });

  it('still blocks when fingerprint matches but reason missing', () => {
    const note = 'Insufficient allotment: only 1 room(s) remaining — you requested 2.';
    expect(
      lineNeedsAllotmentRiskAck({
        allotmentWarn: true,
        allotmentNote: note,
        allotmentRiskAckForNote: note,
      }),
    ).toBe(true);
  });

  it('clears when ack matches note and reason is set', () => {
    const note = 'Insufficient allotment: only 1 room(s) remaining — you requested 2.';
    expect(
      lineNeedsAllotmentRiskAck({
        allotmentWarn: true,
        allotmentNote: note,
        allotmentRiskAckForNote: note,
        allotmentRiskAckReason: 'Supplier confirmed walk-in rooms',
      }),
    ).toBe(false);
  });

  it('blocks again when note changes after ack', () => {
    expect(
      lineNeedsAllotmentRiskAck({
        allotmentWarn: true,
        allotmentNote: 'Insufficient allotment: no rooms remaining for these nights.',
        allotmentRiskAckForNote:
          'Insufficient allotment: only 1 room(s) remaining — you requested 2.',
        allotmentRiskAckReason: 'Walk-in OK',
      }),
    ).toBe(true);
  });
});

describe('lineNeedsCapacityRiskAck', () => {
  it('blocks when warn and unacked', () => {
    expect(
      lineNeedsCapacityRiskAck({
        capacityWarn: true,
        capacityNote: 'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
      }),
    ).toBe(true);
  });

  it('still blocks when fingerprint matches but reason missing', () => {
    const note = 'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).';
    expect(
      lineNeedsCapacityRiskAck({
        capacityWarn: true,
        capacityNote: note,
        capacityRiskAckForNote: note,
      }),
    ).toBe(true);
  });

  it('clears when ack matches note and reason is set', () => {
    const note = 'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).';
    expect(
      lineNeedsCapacityRiskAck({
        capacityWarn: true,
        capacityNote: note,
        capacityRiskAckForNote: note,
        capacityRiskAckReason: 'Client accepts tight seat',
      }),
    ).toBe(false);
  });
});

describe('lineNeedsMinStayRiskAck', () => {
  it('blocks when warn and unacked', () => {
    expect(
      lineNeedsMinStayRiskAck({
        minStayWarn: true,
        minStayNote: 'Min stay 3 nights — this stay is 2',
      }),
    ).toBe(true);
  });

  it('blocks from calculation.minStayShort when top-level stamp missing', () => {
    expect(
      lineNeedsMinStayRiskAck({
        minStayShort: true,
        minStayNote: 'Min stay 2 nights — this stay is 1',
      }),
    ).toBe(true);
  });

  it('still blocks when fingerprint matches but reason missing', () => {
    const note = 'Min stay 3 nights — this stay is 2';
    expect(
      lineNeedsMinStayRiskAck({
        minStayWarn: true,
        minStayNote: note,
        minStayRiskAckForNote: note,
      }),
    ).toBe(true);
  });

  it('clears when ack matches note and reason is set', () => {
    const note = 'Min stay 3 nights — this stay is 2';
    expect(
      lineNeedsMinStayRiskAck({
        minStayWarn: true,
        minStayNote: note,
        minStayRiskAckForNote: note,
        minStayRiskAckReason: 'Client accepts short stay surcharge',
      }),
    ).toBe(false);
  });
});
