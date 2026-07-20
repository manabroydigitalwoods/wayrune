import { describe, expect, it } from 'vitest';
import { normalizeTravellerType } from './travellerType';

describe('normalizeTravellerType', () => {
  it('keeps adult/child/infant and falls back to adult', () => {
    expect(normalizeTravellerType('child')).toBe('child');
    expect(normalizeTravellerType('infant')).toBe('infant');
    expect(normalizeTravellerType('adult')).toBe('adult');
    expect(normalizeTravellerType('')).toBe('adult');
    expect(normalizeTravellerType('unknown')).toBe('adult');
  });
});
