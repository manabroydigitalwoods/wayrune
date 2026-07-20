import { describe, expect, it } from 'vitest';
import {
  buildParityDogfoodKit,
  fitCaptureDogfoodSteps,
  operateThroughDogfoodSteps,
  pilotSmokeDogfoodSteps,
} from './parity-dogfood-kit';

describe('parity-dogfood-kit', () => {
  it('lists FIT capture steps that exclude demo seed', () => {
    const steps = fitCaptureDogfoodSteps();
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.some((s) => /demo/i.test(s))).toBe(true);
    expect(steps.some((s) => /20/.test(s))).toBe(true);
  });

  it('lists pilot smoke for write-off, bands, sibling sort, movement', () => {
    const steps = pilotSmokeDogfoodSteps();
    expect(steps.some((s) => /write-off/i.test(s))).toBe(true);
    expect(steps.some((s) => /party bands/i.test(s))).toBe(true);
    expect(steps.some((s) => /sibling|Up\/Down/i.test(s))).toBe(true);
    expect(steps.some((s) => /DriverJob|movement/i.test(s))).toBe(true);
  });

  it('lists operate-through path without inventing adoption proof', () => {
    const steps = operateThroughDogfoodSteps();
    expect(steps.some((s) => /FIT pack alone|operate demo|suppliers/i.test(s))).toBe(
      true,
    );
    expect(steps.some((s) => /Schedule instalments|Schedule from terms/i.test(s))).toBe(
      true,
    );
    expect(steps.some((s) => /enquiry/i.test(s))).toBe(true);
    expect(steps.some((s) => /Cancel|credit note|voucher/i.test(s))).toBe(true);
    expect(/guaranteed|proven agency|100% adopt/i.test(steps.join(' '))).toBe(false);
  });

  it('builds kit with interactive operate-through deep-links', () => {
    const kit = buildParityDogfoodKit();
    expect(kit.operateThroughInteractive.length).toBeGreaterThanOrEqual(6);
    expect(kit.operateThroughInteractive.some((s) => s.id === 'import')).toBe(
      true,
    );
    expect(kit.operateThroughInteractive.every((s) => s.href.length > 0)).toBe(
      true,
    );
    expect(kit.operateThroughSteps).toEqual(operateThroughDogfoodSteps());
    expect(kit.scaleReminder).toMatch(/scale/i);
  });
});
