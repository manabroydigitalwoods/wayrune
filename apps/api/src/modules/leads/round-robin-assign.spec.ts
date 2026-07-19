import { describe, expect, it } from 'vitest';
import {
  peekRoundRobinOwner,
  pickRoundRobinSlot,
  resolveActivePool,
} from './round-robin-assign';

describe('resolveActivePool', () => {
  it('uses all active members when nothing configured', () => {
    expect(resolveActivePool([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('keeps configured order and drops inactive', () => {
    expect(resolveActivePool(['b', 'a', 'z'], ['a', 'b', 'c'])).toEqual(['b', 'a']);
  });
});

describe('pickRoundRobinSlot', () => {
  it('rotates and wraps', () => {
    expect(pickRoundRobinSlot({ memberIds: ['a', 'b', 'c'], cursor: 0 })).toEqual({
      ownerId: 'a',
      nextCursor: 1,
      index: 0,
    });
    expect(pickRoundRobinSlot({ memberIds: ['a', 'b', 'c'], cursor: 2 })).toEqual({
      ownerId: 'c',
      nextCursor: 0,
      index: 2,
    });
  });

  it('returns null for empty pool', () => {
    expect(pickRoundRobinSlot({ memberIds: [], cursor: 0 })).toBeNull();
  });
});

describe('peekRoundRobinOwner', () => {
  it('does not advance cursor', () => {
    expect(peekRoundRobinOwner({ memberIds: ['x', 'y'], cursor: 1 })).toEqual({
      ownerId: 'y',
      index: 1,
    });
  });
});
