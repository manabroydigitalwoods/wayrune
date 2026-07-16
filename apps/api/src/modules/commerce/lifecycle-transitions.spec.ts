import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  resolveCancellationExecutionOutcome,
} from './lifecycle-transitions';

describe('canTransition', () => {
  it('allows a legal stay_reservation transition', () => {
    expect(canTransition('stay_reservation', 'confirmed', 'checked_in')).toBe(true);
    expect(canTransition('stay_reservation', 'checked_in', 'checked_out')).toBe(true);
    expect(canTransition('stay_reservation', 'confirmed', 'checked_out')).toBe(true);
  });

  it('rejects an illegal stay_reservation transition', () => {
    expect(canTransition('stay_reservation', 'checked_out', 'checked_in')).toBe(false);
    expect(canTransition('stay_reservation', 'cancelled', 'checked_in')).toBe(false);
  });

  it('treats same-state transitions as always legal (idempotent)', () => {
    expect(canTransition('stay_reservation', 'checked_in', 'checked_in')).toBe(true);
    expect(canTransition('housekeeping_task', 'ready', 'ready')).toBe(true);
  });

  it('follows the housekeeping_task clean → inspect → ready flow', () => {
    expect(canTransition('housekeeping_task', 'pending', 'cleaning')).toBe(true);
    expect(canTransition('housekeeping_task', 'cleaning', 'inspected')).toBe(true);
    expect(canTransition('housekeeping_task', 'inspected', 'ready')).toBe(true);
    // Once inspected, a task cannot silently revert to pending — must go via cleaning/blocked
    expect(canTransition('housekeeping_task', 'inspected', 'pending')).toBe(false);
  });

  it('marks housekeeping_task "ready" as terminal', () => {
    expect(allowedTransitions('housekeeping_task', 'ready')).toEqual([]);
    expect(canTransition('housekeeping_task', 'ready', 'cleaning')).toBe(false);
  });

  it('allows cancellation_execution retries from partially_applied', () => {
    expect(canTransition('cancellation_execution', 'pending', 'applying')).toBe(true);
    expect(canTransition('cancellation_execution', 'applying', 'partially_applied')).toBe(true);
    expect(canTransition('cancellation_execution', 'partially_applied', 'applying')).toBe(true);
    expect(canTransition('cancellation_execution', 'partially_applied', 'applied')).toBe(true);
  });

  it('marks cancellation_execution "applied" as terminal', () => {
    expect(canTransition('cancellation_execution', 'applied', 'pending')).toBe(false);
    expect(allowedTransitions('cancellation_execution', 'applied')).toEqual([]);
  });

  it('allows inventory_hold to move active → confirmed/released/expired only', () => {
    expect(canTransition('inventory_hold', 'active', 'confirmed')).toBe(true);
    expect(canTransition('inventory_hold', 'active', 'released')).toBe(true);
    expect(canTransition('inventory_hold', 'active', 'expired')).toBe(true);
    expect(canTransition('inventory_hold', 'confirmed', 'released')).toBe(false);
    expect(canTransition('inventory_hold', 'released', 'active')).toBe(false);
  });
});

describe('assertTransition', () => {
  it('does not throw for a legal transition', () => {
    expect(() => assertTransition('stay_reservation', 'confirmed', 'checked_in')).not.toThrow();
  });

  it('throws a BadRequestException with INVALID_TRANSITION code for an illegal transition', () => {
    try {
      assertTransition('stay_reservation', 'checked_out', 'checked_in');
      expect.unreachable('expected assertTransition to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const response = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response.code).toBe('INVALID_TRANSITION');
      expect(response.entity).toBe('stay_reservation');
      expect(response.from).toBe('checked_out');
      expect(response.to).toBe('checked_in');
    }
  });

  it('defaults to the first known state when "from" is null/undefined', () => {
    // inventory_hold's first declared state is "active", which can reach "confirmed"
    expect(() => assertTransition('inventory_hold', null, 'confirmed')).not.toThrow();
    expect(() => assertTransition('inventory_hold', undefined, 'released')).not.toThrow();
  });

  it('throws for housekeeping_task reverting from inspected to pending', () => {
    expect(() => assertTransition('housekeeping_task', 'inspected', 'pending')).toThrow(
      BadRequestException,
    );
  });
});

describe('allowedTransitions', () => {
  it('lists the legal next states for a booking_requirement', () => {
    expect(allowedTransitions('booking_requirement', 'held')).toEqual([
      'confirmed',
      'expired',
      'cancelled',
      'rejected',
    ]);
  });

  it('returns an empty array for an unknown from-state', () => {
    expect(allowedTransitions('stay_reservation', 'not_a_real_state')).toEqual([]);
  });
});

describe('meal_reservation transitions', () => {
  it('allows request → confirm → seat → serve → complete', () => {
    expect(canTransition('meal_reservation', 'requested', 'confirmed')).toBe(true);
    expect(canTransition('meal_reservation', 'confirmed', 'seated')).toBe(true);
    expect(canTransition('meal_reservation', 'seated', 'served')).toBe(true);
    expect(canTransition('meal_reservation', 'served', 'completed')).toBe(true);
  });

  it('rejects completed → confirmed', () => {
    expect(() => assertTransition('meal_reservation', 'completed', 'confirmed')).toThrow(
      /INVALID_TRANSITION|Invalid meal_reservation/,
    );
  });
});

describe('experience_reservation transitions', () => {
  it('allows held → confirm → check-in → complete', () => {
    expect(canTransition('experience_reservation', 'held', 'confirmed')).toBe(true);
    expect(canTransition('experience_reservation', 'confirmed', 'checked_in')).toBe(true);
    expect(canTransition('experience_reservation', 'checked_in', 'completed')).toBe(true);
  });

  it('rejects completed → checked_in', () => {
    expect(() =>
      assertTransition('experience_reservation', 'completed', 'checked_in'),
    ).toThrow(/INVALID_TRANSITION|Invalid experience_reservation/);
  });
});

describe('rental_reservation transitions', () => {
  it('allows held → confirmed → checked_out → returned', () => {
    expect(canTransition('rental_reservation', 'held', 'confirmed')).toBe(true);
    expect(canTransition('rental_reservation', 'confirmed', 'checked_out')).toBe(true);
    expect(canTransition('rental_reservation', 'checked_out', 'returned')).toBe(true);
  });

  it('allows cancel from held/confirmed and no_show', () => {
    expect(canTransition('rental_reservation', 'held', 'cancelled')).toBe(true);
    expect(canTransition('rental_reservation', 'confirmed', 'no_show')).toBe(true);
  });

  it('rejects checkout before confirm and reverse from returned', () => {
    expect(canTransition('rental_reservation', 'held', 'checked_out')).toBe(false);
    expect(() =>
      assertTransition('rental_reservation', 'returned', 'checked_out'),
    ).toThrow(/INVALID_TRANSITION|Invalid rental_reservation/);
  });
});

describe('driver_job transitions', () => {
  it('allows offered → assigned → en_route → completed', () => {
    expect(canTransition('driver_job', 'offered', 'assigned')).toBe(true);
    expect(canTransition('driver_job', 'assigned', 'en_route')).toBe(true);
    expect(canTransition('driver_job', 'en_route', 'completed')).toBe(true);
  });

  it('allows cancel and no_show from assigned', () => {
    expect(canTransition('driver_job', 'assigned', 'cancelled')).toBe(true);
    expect(canTransition('driver_job', 'assigned', 'no_show')).toBe(true);
  });

  it('rejects start before assign and reverse from completed', () => {
    expect(canTransition('driver_job', 'offered', 'en_route')).toBe(false);
    expect(() =>
      assertTransition('driver_job', 'completed', 'en_route'),
    ).toThrow(/INVALID_TRANSITION|Invalid driver_job/);
  });
});

describe('resolveCancellationExecutionOutcome', () => {
  it('is "applied" when there was nothing to affect', () => {
    expect(
      resolveCancellationExecutionOutcome({ affectedCount: 0, applied: 0, failed: 0 }),
    ).toBe('applied');
  });

  it('is "applied" when every affected entity applied cleanly', () => {
    expect(
      resolveCancellationExecutionOutcome({ affectedCount: 3, applied: 3, failed: 0 }),
    ).toBe('applied');
  });

  it('is "partially_applied" when some but not all entities failed', () => {
    expect(
      resolveCancellationExecutionOutcome({ affectedCount: 3, applied: 2, failed: 1 }),
    ).toBe('partially_applied');
  });

  it('is "failed" when nothing could be applied', () => {
    expect(
      resolveCancellationExecutionOutcome({ affectedCount: 2, applied: 0, failed: 2 }),
    ).toBe('failed');
  });

  it('feeds a legal cancellation_execution transition from "applying"', () => {
    const outcome = resolveCancellationExecutionOutcome({
      affectedCount: 3,
      applied: 2,
      failed: 1,
    });
    expect(() => assertTransition('cancellation_execution', 'applying', outcome)).not.toThrow();
  });
});
