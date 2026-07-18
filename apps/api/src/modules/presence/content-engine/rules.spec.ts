import { describe, expect, it } from 'vitest';
import { evaluateRules, isWithinSchedule } from './rules';
import type { ResolveContext } from './types';

const baseCtx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  organizationId: 'org1',
  org: { id: 'org1', name: 'Acme' },
  site: { id: 'site1', name: 'Site' },
  now: new Date('2026-07-17T12:00:00.000Z'),
  preview: false,
  ...over,
});

describe('content-engine rules', () => {
  it('hides sections outside schedule', () => {
    expect(
      isWithinSchedule(
        { publishAt: '2026-07-18T00:00:00.000Z' },
        new Date('2026-07-17T12:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('applies personalize country match', () => {
    const next = evaluateRules(baseCtx({ visitor: { country: 'IN' } }), {
      title: 'Default',
      rules: [
        {
          kind: 'personalize',
          when: { countries: ['IN'] },
          propsOverride: { title: 'India' },
        },
      ],
    });
    expect(next?.title).toBe('India');
  });

  it('splits A/B by visitor seed', () => {
    const a = evaluateRules(baseCtx({ visitor: { variantSeed: 'seed-a' } }), {
      title: 'A',
      ab: { enabled: true, trafficPercent: 50, variantB: { title: 'B' } },
    });
    expect(a?._abVariant === 'A' || a?._abVariant === 'B').toBe(true);
  });
});
