import { describe, expect, it } from 'vitest';
import {
  formatRoomAllocationLabelUi,
  normalizeRoomAllocationUi,
  roomAllocationSelectOptions,
} from './roomAllocation';

describe('normalizeRoomAllocationUi', () => {
  it('normalizes common stamps', () => {
    expect(normalizeRoomAllocationUi('R1')).toBe('R1');
    expect(normalizeRoomAllocationUi('2')).toBe('R2');
    expect(normalizeRoomAllocationUi('Room 3')).toBe('R3');
    expect(normalizeRoomAllocationUi('')).toBeNull();
  });
});

describe('formatRoomAllocationLabelUi', () => {
  it('labels or dash', () => {
    expect(formatRoomAllocationLabelUi('R1')).toBe('Room 1');
    expect(formatRoomAllocationLabelUi(null)).toBe('—');
  });
});

describe('roomAllocationSelectOptions', () => {
  it('offers Unassigned plus enough rooms', () => {
    const opts = roomAllocationSelectOptions(
      [{ roomAllocation: 'R2' }, { roomAllocation: null }],
      3,
    );
    expect(opts[0]).toEqual({ value: '', label: 'Unassigned' });
    expect(opts.map((o) => o.value)).toEqual(['', 'R1', 'R2', 'R3']);
  });
});
