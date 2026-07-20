import { describe, expect, it } from 'vitest';
import {
  formatRoomAllocationLabel,
  groupGuestsByRoomAllocation,
  normalizeRoomAllocation,
  roomAllocationNumber,
  roomAllocationSnapshot,
} from './room-allocation';

describe('normalizeRoomAllocation', () => {
  it('accepts R-prefix, bare numbers, and Room N', () => {
    expect(normalizeRoomAllocation('R1')).toBe('R1');
    expect(normalizeRoomAllocation('r2')).toBe('R2');
    expect(normalizeRoomAllocation('3')).toBe('R3');
    expect(normalizeRoomAllocation('Room 4')).toBe('R4');
    expect(normalizeRoomAllocation('room_5')).toBe('R5');
  });

  it('rejects blank and junk', () => {
    expect(normalizeRoomAllocation(null)).toBeNull();
    expect(normalizeRoomAllocation('')).toBeNull();
    expect(normalizeRoomAllocation('  ')).toBeNull();
    expect(normalizeRoomAllocation('suite')).toBeNull();
    expect(normalizeRoomAllocation('0')).toBeNull();
    expect(normalizeRoomAllocation('100')).toBeNull();
  });
});

describe('formatRoomAllocationLabel / roomAllocationNumber', () => {
  it('formats and parses', () => {
    expect(formatRoomAllocationLabel('R1')).toBe('Room 1');
    expect(formatRoomAllocationLabel('2')).toBe('Room 2');
    expect(roomAllocationNumber('Room 3')).toBe(3);
    expect(roomAllocationNumber('')).toBeNull();
  });
});

describe('groupGuestsByRoomAllocation', () => {
  it('returns flat fallback when nobody is stamped', () => {
    const g = groupGuestsByRoomAllocation([
      { fullName: 'Amit' },
      { fullName: 'Neha', roomAllocation: '' },
    ]);
    expect(g.hasAllocation).toBe(false);
    expect(g.rooms).toEqual([]);
    expect(g.flatNames).toEqual(['Amit', 'Neha']);
    expect(g.unallocated).toEqual(['Amit', 'Neha']);
  });

  it('groups by room and sorts Room 1 before Room 2', () => {
    const g = groupGuestsByRoomAllocation([
      { fullName: 'Neha', roomAllocation: 'R2' },
      { fullName: 'Amit', roomAllocation: '1' },
      { fullName: 'Kid', roomAllocation: 'R1' },
      { fullName: 'Guest', roomAllocation: null },
    ]);
    expect(g.hasAllocation).toBe(true);
    expect(g.rooms).toEqual([
      { roomKey: 'R1', roomLabel: 'Room 1', guestNames: ['Amit', 'Kid'] },
      { roomKey: 'R2', roomLabel: 'Room 2', guestNames: ['Neha'] },
    ]);
    expect(g.unallocated).toEqual(['Guest']);
    expect(g.flatNames).toEqual(['Neha', 'Amit', 'Kid', 'Guest']);
  });
});

describe('roomAllocationSnapshot', () => {
  it('keeps only named + stamped guests, normalized', () => {
    expect(
      roomAllocationSnapshot([
        { travellerId: 't1', fullName: 'Amit', roomAllocation: '1' },
        { fullName: 'Neha', roomAllocation: null },
        { fullName: '  ', roomAllocation: 'R2' },
      ]),
    ).toEqual([{ travellerId: 't1', fullName: 'Amit', roomAllocation: 'R1' }]);
  });
});
